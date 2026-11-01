"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import Stripe from "stripe";
import { ensure, monthlyAnchor } from "../packages/policy";
import {
  paidCandidateWindow,
  resolveCreditPolicy,
  proCreditPolicyVersion,
} from "../packages/billing/credit-policy";
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
      typeof object.customer === "string"
    )
      await ctx.runMutation(internal.billing.checkoutCompleted, {
        customerId: object.customer,
        key: object.metadata.checkoutKey,
      });
    if (
      [
        "charge.dispute.created",
        "charge.dispute.closed",
        "radar.early_fraud_warning.created",
      ].includes(event.type)
    ) {
      const dispute = event.type.startsWith("charge.dispute.");
      const risk = dispute
        ? await client.disputes.retrieve(object.id)
        : await client.radar.earlyFraudWarnings.retrieve(object.id);
      const riskCharge =
        typeof risk.charge === "string" ? risk.charge : risk.charge.id;
      const charge = await client.charges.retrieve(riskCharge);
      const customerId =
        typeof charge.customer === "string"
          ? charge.customer
          : charge.customer?.id;
      ensure(
        charge.livemode === event.livemode && risk.id === object.id,
        "BILLING_RISK_INVALID",
        "Payment risk mode or identity changed.",
      );
      if (customerId) {
        const linked = await ctx.runQuery(internal.billing.byCustomer, {
          customerId,
        });
        if (linked) {
          const observation = {
            customerId,
            accountId: account,
            mode: event.livemode ? ("live" as const) : ("test" as const),
            kind: dispute ? ("dispute" as const) : ("fraud_warning" as const),
            providerId: risk.id,
            chargeId: charge.id,
            eventId: event.id,
            state:
              dispute && "status" in risk && risk.status === "won"
                ? ("released" as const)
                : ("held" as const),
          };
          // Persist the confirmed charge/customer hold before optional graph
          // reads. A provider outage must not leave new spending unpaused.
          await ctx.runMutation(internal.billingRisk.observe, observation);
          const intent = risk.payment_intent ?? charge.payment_intent;
          const paymentId = typeof intent === "string" ? intent : intent?.id;
          const payments = paymentId
            ? await client.invoicePayments.list({
                payment: { type: "payment_intent", payment_intent: paymentId },
                status: "paid",
                limit: 10,
              })
            : null;
          let invoiceId: string | undefined, subscriptionId: string | undefined;
          for (const payment of payments?.data ?? []) {
            const invoice = await client.invoices.retrieve(
              typeof payment.invoice === "string"
                ? payment.invoice
                : payment.invoice.id,
            );
            const owner =
              typeof invoice.customer === "string"
                ? invoice.customer
                : invoice.customer?.id;
            ensure(
              owner === customerId && invoice.livemode === event.livemode,
              "BILLING_RISK_INVALID",
              "Payment invoice ownership changed.",
            );
            if (payments?.data.length === 1 && !payments.has_more) {
              invoiceId = invoice.id;
              if (invoice.parent?.type === "subscription_details") {
                const parent =
                  invoice.parent.subscription_details?.subscription;
                subscriptionId =
                  typeof parent === "string" ? parent : parent?.id;
              }
            }
          }
          await ctx.runMutation(internal.billingRisk.observe, {
            ...observation,
            invoiceId,
            subscriptionId,
          });
          ensure(
            !payments?.has_more,
            "BILLING_RECONCILIATION_REQUIRED",
            "Payment risk is held; its invoice allocation needs bounded review.",
          );
        }
      }
    }
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
    if (!process.env.STRIPE_SECRET_KEY) return;
    const client = new Stripe(process.env.STRIPE_SECRET_KEY);
    const reserved = await ctx.runMutation(internal.billing.reserveRefresh, {
      customerId: a.customerId,
    });
    if (!reserved) return;
    const account = process.env.STRIPE_ACCOUNT_ID;
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
    ensure(
      !all.has_more,
      "BILLING_RECONCILIATION_REQUIRED",
      "Subscription history needs a bounded reconciliation.",
    );
    const observations = all.data
      .filter((s) => s.metadata.product === "vibescroller")
      .map((sub) => ({
        sub,
        policy: sub.items.data[0]
          ? resolveCreditPolicy(process.env, sub.items.data[0].price)
          : null,
      }));
    ensure(
      !observations.some(
        ({ sub, policy }) =>
          !policy &&
          sub.items.data[0]?.price.metadata.policy === proCreditPolicyVersion &&
          ["active", "trialing", "past_due", "unpaid", "paused"].includes(
            sub.status,
          ),
      ),
      "BILLING_POLICY_UNAVAILABLE",
      "The subscription price needs its verified credit-policy mapping.",
    );
    // Preserve status reconciliation for historical unconfigured legacy IDs.
    // Such IDs still cannot mint credits. Versioned prices need their mapping.
    const resolved = observations.sort(
      (a, b) => b.sub.created - a.sub.created,
    )[0];
    const sub = resolved?.sub;
    const policy = resolved?.policy;
    const end = sub
      ? Math.max(...sub.items.data.map((i) => i.current_period_end)) * 1000
      : 0;
    const invoice = sub?.latest_invoice as Stripe.Invoice | null;
    const candidateWindow =
      sub?.status === "active" &&
      policy?.candidate &&
      invoice?.status === "paid"
        ? paidCandidateWindow(policy, sub, invoice, {
            now: Date.now(),
            customerId: a.customerId,
          })
        : null;
    await ctx.runMutation(internal.billing.apply, {
      customerId: a.customerId,
      subscriptionId: sub?.id,
      status: sub?.status ?? "free",
      periodEnd: end,
      revision: reserved.revision,
    });
    if (!sub || !policy || sub.status !== "active") return;
    if (!invoice || invoice.status !== "paid") return;
    const { tier, interval } = policy;
    const item = sub.items.data[0];
    let start = item.current_period_start * 1000,
      periodEnd = item.current_period_end * 1000;
    if (policy.candidate) {
      if (!candidateWindow) return;
      start = candidateWindow.start;
      periodEnd = candidateWindow.end;
    } else if (interval === "annual") {
      const base = start,
        now = Date.now();
      let n = 0;
      while (n < 12 && monthlyAnchor(base, n + 1) <= now) n++;
      start = monthlyAnchor(base, n);
      periodEnd = Math.min(end, monthlyAnchor(base, n + 1));
    }
    const upgrade = await ctx.runQuery(internal.billingChanges.paidUpgrade, {
      subscriptionId: sub.id,
      invoiceId: invoice.id,
      price: item.price.id,
    });
    if (periodEnd > Date.now())
      await ctx.runMutation(internal.commerce.grantPeriod, {
        organizationId: reserved.organizationId,
        subscription: sub.id,
        tier: tier as "starter" | "pro",
        interval: interval === "weekly" ? "weekly" : "monthly",
        start,
        end: periodEnd,
        verifiedPayment: true,
        upgradeAt: upgrade
          ? Math.max(start, upgrade.prorationDate * 1000)
          : undefined,
        invoiceId: invoice.id,
        billingRevision: reserved.revision,
        ...(policy.candidate
          ? {
              creditPolicyVersion: policy.version,
              policyPriceId: policy.priceId,
            }
          : {}),
        ...(a.pilotEvent &&
        interval === "monthly" &&
        a.pilotInvoiceId === invoice.id &&
        invoice.amount_paid > 0 &&
        sub.livemode === (a.pilotEvent.mode === "live") &&
        invoice.livemode === (a.pilotEvent.mode === "live")
          ? { pilotEvent: a.pilotEvent }
          : {}),
      });
    if (
      sub.metadata.billingRoute !== "managed_payments" &&
      process.env.RO_INVOICE_SCOPE_VERIFIED === "true"
    )
      await ctx.runMutation(internal.privacy.invoiceTask, {
        organizationId: reserved.organizationId,
        invoiceId: invoice.id,
        issuedAt: invoice.created * 1000,
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
