"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import Stripe from "stripe";
import type { Doc } from "./_generated/dataModel";
import { ensure, monthlyAnchor, PolicyError } from "../packages/policy";
import {
  resolveAllowancePolicy,
  validatePaidAllowance,
  validateAllowancePolicy,
  verifyAllowanceInvoice,
  stripeObjectId,
  sameAllowancePolicy,
  paidTermMonthOffset,
  type PaidAllowance,
  type AllowancePolicy,
} from "../packages/billing/allowance-policy";
import {
  missingStripeCustomer,
  confirmStripeCustomerDeleted,
} from "../packages/providers/stripe-deletion";
import {
  pilotProviderEvent,
  type PilotProviderEvent,
} from "./lib/pilotPayments";
export const stripeEvent = internalAction({
  args: { body: v.string(), signature: v.string() },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return { status: 503 };
    const key = process.env.STRIPE_SECRET_KEY,
      secret = process.env.STRIPE_V1_WEBHOOK_SECRET,
      account = process.env.STRIPE_ACCOUNT_ID;
    ensure(
      key && secret && account,
      "SETUP_REQUIRED",
      "Configure the VibeScroller webhook environment and account.",
    );
    const client = new Stripe(key);
    let event: Stripe.Event;
    try {
      event = client.webhooks.constructEvent(a.body, a.signature, secret);
    } catch {
      return { status: 400 };
    }
    if (
      event.livemode !== (process.env.STRIPE_MODE === "live") ||
      (event.account && event.account !== account)
    )
      return { status: 400 };
    const own = await client.accounts.retrieve(null);
    if (own.id !== account) return { status: 400 };
    const pilotEvent: Omit<PilotProviderEvent, "paymentId"> | undefined =
      Number.isSafeInteger(event.created) &&
      [
        "invoice.paid",
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
        ? {
            eventId: event.id,
            accountId: account,
            mode: event.livemode ? "live" : "test",
            eventType: event.type as PilotProviderEvent["eventType"],
            occurredAt: event.created * 1000,
            settlement: "settled",
          }
        : undefined;
    const object = event.data.object as any;
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type) &&
      object.payment_status === "paid" &&
      object.metadata?.product === "vibescroller" &&
      typeof object.metadata.checkoutKey === "string" &&
      typeof object.customer === "string" &&
      object.mode === "payment"
    )
      await ctx.runMutation(internal.billing.checkoutCompleted, {
        customerId: object.customer,
        key: object.metadata.checkoutKey,
      });
    if (event.type === "charge.refunded") {
      const charge = await client.charges.retrieve(object.id);
      const linked = await ctx.runQuery(internal.billing.byCustomer, {
        customerId:
          typeof charge.customer === "string"
            ? charge.customer
            : (charge.customer?.id ?? ""),
      });
      const paymentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      const payments = paymentId
        ? await client.invoicePayments.list({
            payment: { type: "payment_intent", payment_intent: paymentId },
            status: "paid",
            limit: 2,
          })
        : null;
      const invoiceId =
        payments?.data.length === 1
          ? typeof payments.data[0].invoice === "string"
            ? payments.data[0].invoice
            : payments.data[0].invoice.id
          : undefined;
      ensure(
        !payments?.has_more && (payments?.data.length ?? 0) <= 1,
        "REFUND_RECONCILIATION_REQUIRED",
        "A payment spans multiple invoices; review its allocation before reversing credits.",
      );
      let invoiceTotal: number | undefined;
      if (invoiceId) {
        const invoice = await client.invoices.retrieve(invoiceId);
        const customer =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        const chargeCustomer =
          typeof charge.customer === "string"
            ? charge.customer
            : charge.customer?.id;
        ensure(
          invoice.status === "paid" &&
            customer === chargeCustomer &&
            invoice.currency === charge.currency &&
            payments?.data[0].amount_paid === charge.amount &&
            invoice.amount_paid >= charge.amount,
          "REFUND_RECONCILIATION_REQUIRED",
          "Invoice payment allocation cannot be verified.",
        );
        invoiceTotal = invoice.amount_paid;
      }
      if (linked && paymentId && charge.amount_refunded > 0)
        await ctx.runMutation(internal.commerce.reversePayment, {
          organizationId: linked.organizationId,
          paymentId,
          refunded: charge.amount_refunded,
          total: charge.amount,
          invoiceId,
          invoiceTotal,
        });
    }
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type) &&
      object.mode === "payment"
    ) {
      const session = await client.checkout.sessions.retrieve(object.id, {
        expand: ["line_items"],
      });
      if (
        session.payment_status === "paid" &&
        session.metadata?.product === "vibescroller"
      ) {
        const credits = Number(session.metadata.credits),
          line = session.line_items?.data[0];
        const linked = await ctx.runQuery(internal.billing.byCustomer, {
          customerId:
            typeof session.customer === "string" ? session.customer : "",
        });
        if (
          linked?.organizationId === session.metadata.organizationId &&
          session.livemode === (process.env.STRIPE_MODE === "live") &&
          [200, 550].includes(credits) &&
          session.line_items?.data.length === 1 &&
          !session.line_items.has_more &&
          line?.quantity === 1 &&
          line?.price?.id === process.env[`STRIPE_TOPUP_${credits}_PRICE_ID`]
        )
          await ctx.runMutation(internal.commerce.grantTopup, {
            organizationId: session.metadata.organizationId as any,
            paymentId: session.payment_intent as string,
            credits,
            ...(pilotEvent &&
            typeof session.payment_intent === "string" &&
            (session.amount_total ?? 0) > 0
              ? {
                  pilotEvent: {
                    ...pilotEvent,
                    paymentId: session.payment_intent,
                  },
                }
              : {}),
          });
      }
    }
    const customer =
      event.type === "customer.deleted"
        ? object.id
        : typeof object.customer === "string"
          ? object.customer
          : object.customer?.id;
    if (customer)
      await ctx.runAction(internal.reconciliation.customer, {
        customerId: customer,
        ...(pilotEvent &&
        event.type === "invoice.paid" &&
        object.status === "paid" &&
        typeof object.id === "string"
          ? {
              pilotEvent: { ...pilotEvent, paymentId: object.id },
              pilotInvoiceId: object.id,
            }
          : {}),
      });
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type) &&
      object.mode === "subscription" &&
      object.payment_status === "paid" &&
      typeof object.customer === "string" &&
      typeof object.subscription === "string" &&
      typeof object.metadata?.checkoutKey === "string"
    )
      await ctx.runMutation(internal.billing.checkoutCompleted, {
        customerId: object.customer,
        key: object.metadata.checkoutKey,
        subscriptionId: object.subscription,
      });
    await ctx.runMutation(internal.privacy.receipt, {
      provider: "stripe",
      key: event.id,
    });
    return { status: 200 };
  },
});
export const customer = internalAction({
  args: {
    customerId: v.string(),
    pilotEvent: v.optional(pilotProviderEvent),
    pilotInvoiceId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    if (!process.env.STRIPE_SECRET_KEY) return;
    const mode = process.env.STRIPE_MODE ?? "test";
    ensure(
      ["test", "live"].includes(mode) &&
        new RegExp(`^[sr]k_${mode}_`).test(process.env.STRIPE_SECRET_KEY),
      "BILLING_UNAVAILABLE",
      "The provider credential and configured mode must match.",
    );
    const client = new Stripe(process.env.STRIPE_SECRET_KEY);
    const reserved = await ctx.runMutation(internal.billing.reserveRefresh, {
      customerId: a.customerId,
    });
    if (!reserved) return;
    const account = process.env.STRIPE_ACCOUNT_ID;
    // Absence in another provider namespace is not deletion of this purchase.
    for (const authority of [
      reserved.paidAllowance,
      reserved.checkoutAllowance,
    ])
      if (
        authority &&
        (authority.providerAccountId !== account || authority.mode !== mode)
      )
        return { allowance: "held" as const };
    ensure(
      account && (await client.accounts.retrieve(null)).id === account,
      "BILLING_UNAVAILABLE",
      "The Stripe account does not match billing configuration.",
    );
    if (await confirmStripeCustomerDeleted(client, a.customerId)) {
      await ctx.runMutation(internal.billing.providerDeleted, {
        customerId: a.customerId,
        revision: reserved.revision,
      });
      return;
    }
    let all;
    try {
      all = await client.subscriptions.list({
        customer: a.customerId,
        status: "all",
        limit: 100,
        expand: ["data.latest_invoice"],
      });
    } catch (error) {
      if (!missingStripeCustomer(error)) throw error;
      if (!(await confirmStripeCustomerDeleted(client, a.customerId)))
        throw error;
      await ctx.runMutation(internal.billing.providerDeleted, {
        customerId: a.customerId,
        revision: reserved.revision,
      });
      return;
    }
    if (all.has_more !== false) return { allowance: "held" as const };
    const own = all.data.filter((s) => s.metadata.product === "vibescroller");
    const current = own.filter(
      (s) => !["canceled", "incomplete_expired"].includes(s.status),
    );
    if (current.length > 1) return { allowance: "held" as const };
    const sub = current[0] ?? own.sort((a, b) => b.created - a.created)[0];
    const live = process.env.STRIPE_MODE === "live";
    if (
      sub &&
      (sub.livemode !== live ||
        stripeObjectId(sub.customer) !== a.customerId ||
        sub.items.has_more !== false ||
        sub.items.data.length !== 1 ||
        sub.items.data[0].quantity !== 1 ||
        sub.items.data[0].price.livemode !== live)
    )
      return { allowance: "held" as const };
    const item = sub?.items.data[0];
    const end = item ? item.current_period_end * 1000 : 0;
    const begin = item ? item.current_period_start * 1000 : 0;
    let commitment: PaidAllowance | undefined;
    let invoice: Stripe.Invoice | undefined;
    let settlementInvoice: Stripe.Invoice | undefined;
    let upgrade: Doc<"billingChanges"> | null = null;
    const invoiceById = async (id: string) => {
      const latest = sub?.latest_invoice;
      return latest && typeof latest !== "string" && latest.id === id
        ? latest
        : client.invoices.retrieve(id);
    };
    if (sub?.status === "active" && item) {
      try {
        ensure(
          Number.isSafeInteger(begin) &&
            Number.isSafeInteger(end) &&
            begin <= Date.now() &&
            end > Date.now(),
          "ALLOWANCE_RECONCILIATION_REQUIRED",
          "The paid term is not current.",
        );
        const previous = reserved.paidAllowance;
        const observedAnchor = sub.billing_cycle_anchor * 1000;
        const anchor =
          previous?.subscriptionId === sub.id
            ? previous.anchor
            : observedAnchor;
        ensure(
          anchor === observedAnchor,
          "ALLOWANCE_RECONCILIATION_REQUIRED",
          "The provider billing calendar anchor changed.",
        );
        const sameTerm =
          previous?.subscriptionId === sub.id &&
          previous.itemId === item.id &&
          previous.paidStart === begin &&
          previous.paidEnd === end;
        const priorUpgrade = previous?.upgradeChangeId
          ? await ctx.runQuery(internal.billingChanges.byId, {
              id: previous.upgradeChangeId,
            })
          : null;
        const priorPolicy = priorUpgrade?.targetPolicy ?? previous?.base.policy;
        const changes = await ctx.runQuery(
          internal.billingChanges.allowanceChange,
          {
            organizationId: reserved.organizationId,
            subscriptionId: sub.id,
            itemId: item.id,
            price: item.price.id,
            interval: item.price.metadata.interval ?? "",
            periodStart: item.current_period_start,
            periodEnd: item.current_period_end,
          },
        );
        ensure(
          changes.state === "ok",
          "ALLOWANCE_RECONCILIATION_REQUIRED",
          "The bounded allowance change history requires reconciliation.",
        );
        upgrade = changes.upgrade;
        const renewal = changes.renewal;
        const locator =
          sub.metadata.allowanceAcceptanceId || sub.metadata.checkoutKey;
        const acceptedOffer = locator
          ? await ctx.runQuery(internal.commerce.checkoutAllowance, {
              organizationId: reserved.organizationId,
              acceptanceId: sub.metadata.allowanceAcceptanceId ?? "",
              key: sub.metadata.checkoutKey ?? "",
              customerId: a.customerId,
              subscriptionId: sub.id,
              providerAccountId: account,
              mode: live ? "live" : "test",
            })
          : null;
        ensure(
          !locator || acceptedOffer,
          "ALLOWANCE_RECONCILIATION_REQUIRED",
          "The purchase acceptance cannot be verified.",
        );
        const pending = acceptedOffer?.policy;
        const approvalId =
          pending?.priceId === item.price.id
            ? pending.priceId
            : previous?.subscriptionId === sub.id &&
                priorPolicy?.priceId === item.price.id
              ? priorPolicy.priceId
              : (upgrade?.targetPolicy?.priceId ??
                renewal?.targetPolicy?.priceId ??
                process.env[
                  `STRIPE_${item.price.metadata.tier?.toUpperCase()}_${item.price.metadata.interval?.toUpperCase()}_PRICE_ID`
                ]);
        const priorAcceptance =
          previous?.subscriptionId === sub.id
            ? previous.base.policy.acceptance
            : undefined;
        const observed = resolveAllowancePolicy(
          item.price,
          approvalId,
          pending?.priceId === item.price.id
            ? pending.acceptance
            : (upgrade?.targetPolicy?.acceptance ??
                renewal?.targetPolicy?.acceptance ??
                priorAcceptance ?? { kind: "legacy_not_reconstructed" }),
        );
        if (renewal) {
          ensure(
            renewal.sourcePolicy &&
              renewal.targetPolicy &&
              renewal.sourcePolicy.tier === "pro" &&
              observed.tier === "starter" &&
              renewal.sourcePolicy.priceId === renewal.oldPrice &&
              renewal.targetPolicy.priceId === renewal.newPrice &&
              renewal.sourcePolicy.billingInterval ===
                observed.billingInterval &&
              sameAllowancePolicy(renewal.targetPolicy, observed) &&
              (previous?.subscriptionId !== sub.id ||
                (sameTerm
                  ? sameAllowancePolicy(previous.base.policy, observed)
                  : previous.itemId === item.id &&
                    previous.paidEnd === begin &&
                    previous.paidStart === renewal.periodStart * 1000 &&
                    priorPolicy &&
                    sameAllowancePolicy(renewal.sourcePolicy, priorPolicy))),
            "ALLOWANCE_RECONCILIATION_REQUIRED",
            "The scheduled renewal does not match its accepted allowance change.",
          );
          validateAllowancePolicy(renewal.sourcePolicy);
        }
        let basePolicy: AllowancePolicy = observed;
        let baseInvoiceId = stripeObjectId(sub.latest_invoice);
        if (sameTerm) {
          validatePaidAllowance(previous);
          ensure(
            previous.providerAccountId === account &&
              previous.mode === (live ? "live" : "test"),
            "ALLOWANCE_RECONCILIATION_REQUIRED",
            "The paid commitment belongs to another provider environment.",
          );
          basePolicy = previous.base.policy;
          baseInvoiceId = previous.base.invoiceId;
          if (item.price.id !== basePolicy.priceId)
            ensure(
              upgrade,
              "ALLOWANCE_RECONCILIATION_REQUIRED",
              "The price changed without a verified paid change.",
            );
          if (previous.upgradeChangeId)
            ensure(
              upgrade?._id === previous.upgradeChangeId,
              "ALLOWANCE_RECONCILIATION_REQUIRED",
              "The paid upgrade changed.",
            );
        } else if (upgrade?.invoiceId) {
          const old = await client.prices.retrieve(upgrade.oldPrice);
          basePolicy = resolveAllowancePolicy(
            old,
            upgrade.sourcePolicy?.priceId ??
              process.env[
                `STRIPE_${old.metadata.tier?.toUpperCase()}_${old.metadata.interval?.toUpperCase()}_PRICE_ID`
              ],
            upgrade.sourcePolicy?.acceptance ?? {
              kind: "legacy_not_reconstructed",
            },
          );
          ensure(
            !upgrade.sourcePolicy ||
              sameAllowancePolicy(upgrade.sourcePolicy, basePolicy),
            "ALLOWANCE_RECONCILIATION_REQUIRED",
            "The original upgrade policy differs from its verified price.",
          );
          baseInvoiceId =
            (await ctx.runQuery(internal.commerce.allowanceBaseInvoice, {
              organizationId: reserved.organizationId,
              subscription: sub.id,
              start: begin,
              upgradeInvoice: upgrade.invoiceId,
            })) ?? undefined;
        }
        ensure(
          baseInvoiceId,
          "ALLOWANCE_RECONCILIATION_REQUIRED",
          "The original paid invoice is unknown.",
        );
        invoice = await invoiceById(baseInvoiceId);
        verifyAllowanceInvoice(invoice, {
          customerId: a.customerId,
          subscriptionId: sub.id,
          itemId: item.id,
          priceId: basePolicy.priceId,
          start: begin,
          end,
          live,
          proration: false,
        });
        settlementInvoice = invoice;
        if (upgrade) {
          ensure(
            upgrade.invoiceId &&
              upgrade.oldPrice === basePolicy.priceId &&
              upgrade.newPrice === observed.priceId &&
              upgrade.organizationId === reserved.organizationId &&
              upgrade.itemId === item.id &&
              basePolicy.tier === "starter" &&
              observed.tier === "pro" &&
              observed.billingInterval === basePolicy.billingInterval &&
              upgrade.prorationDate * 1000 >= begin &&
              upgrade.prorationDate * 1000 < end,
            "ALLOWANCE_RECONCILIATION_REQUIRED",
            "The upgrade does not match this paid term.",
          );
          const paidUpgradeInvoice = await invoiceById(upgrade.invoiceId);
          verifyAllowanceInvoice(paidUpgradeInvoice, {
            customerId: a.customerId,
            subscriptionId: sub.id,
            itemId: item.id,
            priceId: observed.priceId,
            start: upgrade.prorationDate * 1000,
            end,
            live,
            proration: true,
          });
          settlementInvoice = paidUpgradeInvoice;
          ensure(
            (!upgrade.sourcePolicy ||
              sameAllowancePolicy(upgrade.sourcePolicy, basePolicy)) &&
              (!upgrade.targetPolicy ||
                sameAllowancePolicy(upgrade.targetPolicy, observed)),
            "ALLOWANCE_RECONCILIATION_REQUIRED",
            "The paid change policy differs from its accepted quote.",
          );
          if (!upgrade.sourcePolicy || !upgrade.targetPolicy)
            await ctx.runMutation(internal.billingChanges.bindLegacyPolicies, {
              id: upgrade._id,
              sourcePolicy: basePolicy,
              targetPolicy: observed,
            });
        }
        commitment = validatePaidAllowance({
          version: "paid-allowance-v1",
          providerAccountId: account,
          mode: live ? "live" : "test",
          subscriptionId: sub.id,
          itemId: item.id,
          paidStart: begin,
          paidEnd: end,
          anchor,
          base: { policy: basePolicy, invoiceId: baseInvoiceId },
          ...(upgrade ? { upgradeChangeId: upgrade._id } : {}),
        });
      } catch (error) {
        if (
          !(error instanceof PolicyError) ||
          error.code !== "ALLOWANCE_RECONCILIATION_REQUIRED"
        )
          throw error;
      }
    }
    const applied = await ctx.runMutation(internal.billing.apply, {
      customerId: a.customerId,
      subscriptionId: sub?.id,
      status: sub?.status ?? "free",
      periodEnd: end,
      revision: reserved.revision,
      ...(commitment ? { paidAllowance: commitment } : {}),
    });
    if (!applied) return { allowance: "held" as const };
    if (!sub || sub.status !== "active")
      return { allowance: "not_due" as const };
    if (!item || !commitment || !invoice || !settlementInvoice)
      return { allowance: "held" as const };
    const policy = upgrade?.targetPolicy ?? commitment.base.policy;
    // A reconstructed legacy upgrade was just bound; its observed policy is the
    // effective Pro policy, while the original base policy remains immutable.
    const tier = upgrade ? "pro" : policy.tier;
    const interval = commitment.base.policy.billingInterval;
    let start = begin,
      periodEnd = end;
    if (interval === "annual") {
      let n = 0;
      const offset = paidTermMonthOffset(commitment);
      while (
        n < 12 &&
        monthlyAnchor(commitment.anchor, offset + n + 1) <= Date.now()
      )
        n++;
      start = monthlyAnchor(commitment.anchor, offset + n);
      periodEnd = Math.min(
        end,
        monthlyAnchor(commitment.anchor, offset + n + 1),
      );
    }
    if (periodEnd > Date.now())
      await ctx.runMutation(internal.commerce.grantPeriod, {
        organizationId: reserved.organizationId,
        subscription: sub.id,
        tier,
        interval: interval === "weekly" ? "weekly" : "monthly",
        start,
        end: periodEnd,
        verifiedPayment: true,
        invoiceId: upgrade?.invoiceId ?? invoice.id,
        billingRevision: reserved.revision,
        ...(a.pilotEvent &&
        interval === "monthly" &&
        a.pilotInvoiceId === settlementInvoice.id &&
        settlementInvoice.amount_paid > 0 &&
        sub.livemode === (a.pilotEvent.mode === "live") &&
        settlementInvoice.livemode === (a.pilotEvent.mode === "live")
          ? { pilotEvent: a.pilotEvent }
          : {}),
      });
    if (
      sub.metadata.billingRoute !== "managed_payments" &&
      process.env.RO_INVOICE_SCOPE_VERIFIED === "true"
    )
      await ctx.runMutation(internal.privacy.invoiceTask, {
        organizationId: reserved.organizationId,
        invoiceId: settlementInvoice.id,
        issuedAt: settlementInvoice.created * 1000,
      });
  },
});
export const allBilling = internalAction({
  args: {},
  handler: async (ctx) => {
    if (process.env.RESTORE_LOCK === "true") return;
    if (!process.env.STRIPE_SECRET_KEY) return;
    const list = await ctx.runQuery(internal.billing.customers, {
      cursor: null,
    });
    for (const row of list.page)
      await ctx.runAction(internal.reconciliation.customer, {
        customerId: row.customerId,
      });
    let cursor = list.isDone ? null : list.continueCursor;
    while (cursor) {
      const next = await ctx.runQuery(internal.billing.customers, { cursor });
      for (const row of next.page)
        await ctx.runAction(internal.reconciliation.customer, {
          customerId: row.customerId,
        });
      cursor = next.isDone ? null : next.continueCursor;
    }
  },
});
