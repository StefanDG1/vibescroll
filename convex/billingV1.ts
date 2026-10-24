"use node";
import Stripe from "stripe";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { pricing, ensure } from "../packages/policy";
import {
  billingReadiness,
  billingReturnOrigin,
} from "../packages/providers/billing-readiness";
import { checkoutPaymentRoute } from "../packages/providers/stripe-checkout";
import { managedMarketVerified } from "../packages/providers/managed-markets";
import { policyRelease } from "../packages/policy/publication";
import {
  resolveAllowancePolicy,
  validatePaidAllowance,
  stripeObjectId,
} from "../packages/billing/allowance-policy";
function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  ensure(
    key && new RegExp(`^[sr]k_${process.env.STRIPE_MODE ?? "test"}_`).test(key),
    "BILLING_UNAVAILABLE",
    "Stripe environment and key must match.",
  );
  return new Stripe(key);
}
async function verifiedStripe() {
  const client = stripe();
  ensure(
    process.env.STRIPE_ACCOUNT_ID &&
      (await client.accounts.retrieve(null)).id ===
        process.env.STRIPE_ACCOUNT_ID,
    "BILLING_UNAVAILABLE",
    "The provider account does not match VibeScroller billing configuration.",
  );
  return client;
}
const priceId = (tier: string, interval: string) =>
  process.env[
    `STRIPE_${tier.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID`
  ];
export const quoteChange = action({
  args: {
    organizationId: v.id("organizations"),
    tier: v.union(v.literal("starter"), v.literal("pro")),
  },
  handler: async (ctx, a): Promise<string> => {
    ensure(
      process.env.STRIPE_MODE !== "live" ||
        billingReadiness(process.env).liveEnabled,
      "RELEASE_GATE",
      "Live plan changes remain disabled until production billing approval.",
    );
    const auth = await ctx.runQuery(api.billing.authorize, {
      organizationId: a.organizationId,
    });
    ensure(
      auth.billing?.subscriptionId,
      "NOT_FOUND",
      "No active subscription.",
    );
    const client = await verifiedStripe(),
      sub = await client.subscriptions.retrieve(auth.billing.subscriptionId);
    ensure(
      sub.status === "active" &&
        sub.livemode === (process.env.STRIPE_MODE === "live") &&
        stripeObjectId(sub.customer) === auth.billing.customerId &&
        sub.metadata.product === "vibescroller" &&
        sub.items.has_more === false &&
        sub.items.data[0]?.quantity === 1 &&
        sub.items.data.length === 1 &&
        !sub.pending_update &&
        !sub.cancel_at_period_end,
      "CHANGE_UNAVAILABLE",
      "Resolve cancellation or payment issues before changing plan.",
    );
    const item = sub.items.data[0],
      interval = item.price.metadata.interval as
        "weekly" | "monthly" | "annual";
    const commitment = auth.billing.paidAllowance;
    ensure(
      commitment,
      "ALLOWANCE_RECONCILIATION_REQUIRED",
      "Reconcile the paid allowance before requesting a plan change.",
    );
    validatePaidAllowance(commitment);
    const priorUpgrade = commitment.upgradeChangeId
      ? await ctx.runQuery(api.billingChanges.quote, {
          id: commitment.upgradeChangeId,
        })
      : null;
    const effectivePolicy =
      priorUpgrade?.targetPolicy ?? commitment.base.policy;
    const sourcePolicy = resolveAllowancePolicy(
      item.price,
      effectivePolicy.priceId,
      effectivePolicy.acceptance,
    );
    ensure(
      (!priorUpgrade || priorUpgrade.state === "applied") &&
        commitment.subscriptionId === sub.id &&
        commitment.itemId === item.id &&
        commitment.paidStart === item.current_period_start * 1000 &&
        commitment.paidEnd === item.current_period_end * 1000,
      "ALLOWANCE_RECONCILIATION_REQUIRED",
      "Reconcile the current paid plan before another change.",
    );
    ensure(
      ["weekly", "monthly", "annual"].includes(interval) &&
        item.price.metadata.tier !== a.tier,
      "QUOTE_INVALID",
      "Choose a different tier for the current renewal interval.",
    );
    const price = priceId(a.tier, interval);
    ensure(price, "CATALOGUE_MISMATCH", "Target price unavailable.");
    const target = await client.prices.retrieve(price);
    const targetPolicy = resolveAllowancePolicy(
      target,
      price,
      sourcePolicy.acceptance,
    );
    ensure(
      targetPolicy.creditsPerGrant ===
        (interval === "weekly"
          ? pricing.tiers[a.tier].weekly_credits
          : pricing.tiers[a.tier].monthly_credits),
      "CATALOGUE_MISMATCH",
      "The displayed allowance has no reviewed policy.",
    );
    ensure(
      target.active &&
        target.currency === "eur" &&
        target.tax_behavior === "inclusive" &&
        target.metadata.product === "vibescroller" &&
        target.unit_amount ===
          Math.round(pricing.tiers[a.tier][`${interval}_price_eur`] * 100),
      "CATALOGUE_MISMATCH",
      "Target price mismatch.",
    );
    const at = Math.floor(Date.now() / 1000);
    const upgrade = a.tier === "pro";
    const preview = upgrade
      ? await client.invoices.createPreview({
          customer: auth.billing.customerId,
          subscription: sub.id,
          subscription_details: {
            items: [{ id: item.id, price }],
            proration_behavior: "always_invoice",
            proration_date: at,
          },
        })
      : null;
    return ctx.runMutation(internal.billingChanges.create, {
      organizationId: a.organizationId,
      subscriptionId: sub.id,
      itemId: item.id,
      oldPrice: item.price.id,
      newPrice: price,
      tier: a.tier,
      interval: interval as "weekly" | "monthly" | "annual",
      prorationDate: at,
      periodStart: item.current_period_start,
      periodEnd: item.current_period_end,
      amount: preview?.amount_due ?? 0,
      currency: "eur",
      sourcePolicy,
      targetPolicy,
    });
  },
});
export const applyChange = action({
  args: { id: v.id("billingChanges") },
  handler: async (ctx, a): Promise<{ message: string }> => {
    ensure(
      process.env.STRIPE_MODE !== "live" ||
        billingReadiness(process.env).liveEnabled,
      "RELEASE_GATE",
      "Live plan changes remain disabled until production billing approval.",
    );
    const client = await verifiedStripe();
    const q = await ctx.runMutation(internal.billingChanges.claim, a);
    try {
      const sub = await client.subscriptions.retrieve(q.subscriptionId);
      const item = sub.items.data.find((i) => i.id === q.itemId);
      ensure(
        item &&
          sub.status === "active" &&
          !sub.cancel_at_period_end &&
          item.price.id === q.oldPrice &&
          item.current_period_start === q.periodStart &&
          item.current_period_end === q.periodEnd,
        "QUOTE_CHANGED",
        "The paid subscription changed. Request a fresh quote.",
      );
      if (q.tier === "starter") {
        ensure(
          !sub.schedule,
          "CHANGE_UNAVAILABLE",
          "A renewal change is already scheduled.",
        );
        const schedule = await client.subscriptionSchedules.create(
          { from_subscription: sub.id },
          { idempotencyKey: `vibe:schedule:${q._id}` },
        );
        await client.subscriptionSchedules.update(
          schedule.id,
          {
            end_behavior: "release",
            proration_behavior: "none",
            phases: [
              {
                start_date: q.periodStart,
                end_date: q.periodEnd,
                items: [{ price: q.oldPrice, quantity: 1 }],
                metadata: sub.metadata,
                proration_behavior: "none",
              },
              {
                start_date: q.periodEnd,
                items: [{ price: q.newPrice, quantity: 1 }],
                metadata: { ...sub.metadata, tier: q.tier },
                proration_behavior: "none",
              },
            ],
          },
          { idempotencyKey: `vibe:downgrade:${q._id}` },
        );
        await ctx.runMutation(internal.billingChanges.finish, {
          id: q._id,
          state: "scheduled",
        });
        return {
          message:
            "Downgrade scheduled for renewal. Current paid allowance is preserved.",
        };
      }
      const preview = await client.invoices.createPreview({
        customer:
          typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        subscription: sub.id,
        subscription_details: {
          items: [{ id: q.itemId, price: q.newPrice }],
          proration_behavior: "always_invoice",
          proration_date: q.prorationDate,
        },
      });
      ensure(
        preview.amount_due === q.amount && preview.currency === q.currency,
        "QUOTE_CHANGED",
        "The payable total changed. Request a fresh quote.",
      );
      const updated = await client.subscriptions.update(
        sub.id,
        {
          items: [{ id: q.itemId, price: q.newPrice }],
          proration_behavior: "always_invoice",
          proration_date: q.prorationDate,
          payment_behavior: "error_if_incomplete",
          metadata: { ...sub.metadata, tier: q.tier },
          expand: ["latest_invoice"],
        },
        { idempotencyKey: `vibe:upgrade:${q._id}` },
      );
      const invoice = updated.latest_invoice as Stripe.Invoice;
      ensure(
        invoice?.status === "paid",
        "PAYMENT_REQUIRED",
        "Payment must complete before the allowance changes.",
      );
      await ctx.runMutation(internal.billingChanges.finish, {
        id: q._id,
        state: "applied",
        invoiceId: invoice.id,
      });
      await ctx.runAction(internal.reconciliation.customer, {
        customerId:
          typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      });
      return {
        message:
          "Paid upgrade applied. Only the remaining period's incremental allowance is granted.",
      };
    } catch (error) {
      await ctx.runMutation(internal.billingChanges.finish, {
        id: q._id,
        state: "needs_reconciliation",
      });
      throw error;
    }
  },
});
export const checkout = action({
  args: {
    organizationId: v.id("organizations"),
    tier: v.union(v.literal("starter"), v.literal("pro")),
    interval: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("annual"),
    ),
    country: v.optional(v.string()),
    termsAccepted: v.boolean(),
    immediateService: v.boolean(),
  },
  handler: async (ctx, a): Promise<string> => {
    const auth = await ctx.runQuery(api.billing.authorize, {
      organizationId: a.organizationId,
    });
    ensure(
      a.termsAccepted,
      "TERMS_REQUIRED",
      "Accept the displayed service terms before checkout.",
    );
    const live = process.env.STRIPE_MODE === "live";
    const origin = billingReturnOrigin(process.env);
    ensure(
      origin,
      "BILLING_UNAVAILABLE",
      "The checkout return origin is not configured.",
    );
    const tax = await ctx.runQuery(internal.commerce.taxConfig, {});
    ensure(
      !live || billingReadiness(process.env).liveEnabled,
      "RELEASE_GATE",
      "Live checkout is disabled.",
    );
    const route = checkoutPaymentRoute({
      tax,
      country: a.country,
      live,
      route: process.env.STRIPE_BILLING_ROUTE,
      managedVerified: process.env.STRIPE_MANAGED_PAYMENTS_VERIFIED === "true",
      managedMarket: process.env.STRIPE_MANAGED_MARKET,
      managedMarketVerified: managedMarketVerified(process.env),
    });
    const treatment = route.treatment;
    const price = priceId(a.tier, a.interval);
    ensure(
      price,
      "BILLING_UNAVAILABLE",
      "This product price is not configured.",
    );
    const client = await verifiedStripe();
    const actualPrice = await client.prices.retrieve(price);
    const reviewed = resolveAllowancePolicy(actualPrice, price, {
      kind: "legacy_not_reconstructed",
    });
    ensure(
      reviewed.tier === a.tier && reviewed.billingInterval === a.interval,
      "CATALOGUE_MISMATCH",
      "The reviewed allowance does not match the selected plan.",
    );
    ensure(
      reviewed.creditsPerGrant ===
        (a.interval === "weekly"
          ? pricing.tiers[a.tier].weekly_credits
          : pricing.tiers[a.tier].monthly_credits),
      "CATALOGUE_MISMATCH",
      "The displayed allowance has no reviewed policy.",
    );
    const expected = Math.round(
      pricing.tiers[a.tier][`${a.interval}_price_eur`] * 100,
    );
    ensure(
      actualPrice.currency === "eur" &&
        actualPrice.active &&
        actualPrice.recurring?.interval ===
          (a.interval === "weekly"
            ? "week"
            : a.interval === "annual"
              ? "year"
              : "month") &&
        actualPrice.recurring.interval_count === 1 &&
        actualPrice.unit_amount === expected &&
        actualPrice.tax_behavior === "inclusive" &&
        actualPrice.metadata.product === "vibescroller",
      "CATALOGUE_MISMATCH",
      "The Stripe price does not match the approved catalogue.",
    );
    let customer = auth.billing?.providerDeletedAt
      ? undefined
      : auth.billing?.customerId;
    if (!customer) {
      const created = await client.customers.create(
        {
          email: auth.email,
          name: auth.name,
          metadata: {
            companynerveOrganizationId: a.organizationId,
            product: "vibescroller",
          },
        },
        {
          idempotencyKey: `vibescroller:customer:${a.organizationId}${auth.billing?.providerDeletedAt ? `:${auth.billing.providerDeletedAt}` : ""}`,
        },
      );
      customer = await ctx.runMutation(internal.billing.attach, {
        organizationId: a.organizationId,
        customerId: created.id,
      });
    }
    const subs = await client.subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    ensure(
      !subs.data.some(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      ),
      "SUBSCRIPTION_EXISTS",
      "Manage your current subscription in the billing portal.",
    );
    const acceptanceId = await ctx.runMutation(
      internal.commerce.recordAcceptance,
      {
        organizationId: a.organizationId,
        termsVersion: policyRelease.id,
        immediateService: a.immediateService,
      },
    );
    const allowance = {
      providerAccountId: process.env.STRIPE_ACCOUNT_ID!,
      mode: live ? ("live" as const) : ("test" as const),
      policy: resolveAllowancePolicy(actualPrice, price, {
        kind: "recorded",
        acceptanceId,
        policyReleaseId: policyRelease.id,
      }),
    };
    const reserved = await ctx.runMutation(internal.billing.reserveCheckout, {
      organizationId: a.organizationId,
      allowance,
      intent: JSON.stringify([
        price,
        route.billingCountry,
        treatment,
        route.marketPolicy,
        a.immediateService,
        policyRelease.id,
      ]),
    });
    const capturedAcceptance = reserved.allowance?.policy.acceptance;
    ensure(
      capturedAcceptance?.kind === "recorded",
      "TERMS_REQUIRED",
      "The checkout allowance acceptance is missing.",
    );
    const session = await client.checkout.sessions.create(
      {
        customer,
        integration_identifier: "vibescroller_subscription_vksnqjrt",
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        billing_address_collection: "required",
        ...route.options,
        consent_collection: { terms_of_service: "required" },
        metadata: {
          product: "vibescroller",
          checkoutKey: reserved.key,
          tier: a.tier,
          interval: a.interval,
          termsVersion: policyRelease.id,
          taxTreatment: treatment,
          marketPolicy: route.marketPolicy,
        },
        subscription_data: {
          metadata: {
            product: "vibescroller",
            checkoutKey: reserved.key,
            allowanceAcceptanceId: capturedAcceptance.acceptanceId,
            tier: a.tier,
            interval: a.interval,
            organizationId: a.organizationId,
            billingRoute: process.env.STRIPE_BILLING_ROUTE ?? "direct",
          },
        },
        expires_at: Math.floor(reserved.expires / 1000),
        success_url: `${origin}/app/${a.organizationId}/billing?checkout=complete`,
        cancel_url: `${origin}/app/${a.organizationId}/billing`,
      },
      { idempotencyKey: reserved.key },
    );
    ensure(session.url, "BILLING_UNAVAILABLE", "Checkout URL unavailable.");
    return session.url;
  },
});
export const cancel = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const auth = await ctx.runQuery(api.billing.authorize, a);
    ensure(
      auth.billing?.subscriptionId,
      "NOT_FOUND",
      "No subscription to cancel.",
    );
    const client = await verifiedStripe();
    const subscription = await client.subscriptions.retrieve(
      auth.billing.subscriptionId,
    );
    if (subscription.schedule)
      await client.subscriptionSchedules.release(
        typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule.id,
      );
    await client.subscriptions.update(auth.billing.subscriptionId, {
      cancel_at_period_end: true,
    });
    await ctx.runAction(internal.reconciliation.customer, {
      customerId: auth.billing!.customerId,
    });
    return { cancelAtPeriodEnd: true };
  },
});
export const topup = action({
  args: {
    organizationId: v.id("organizations"),
    pack: v.union(v.literal("200"), v.literal("550")),
    country: v.optional(v.string()),
    termsAccepted: v.boolean(),
    immediateService: v.boolean(),
  },
  handler: async (ctx, a): Promise<string> => {
    ensure(
      process.env.STRIPE_MODE !== "live" ||
        billingReadiness(process.env).liveEnabled,
      "RELEASE_GATE",
      "Live top-ups remain disabled until the matching release approval.",
    );
    const auth = await ctx.runQuery(api.billing.authorize, {
      organizationId: a.organizationId,
    });
    ensure(
      auth.billing?.customerId,
      "BILLING_REQUIRED",
      "Create a billing account first.",
    );
    ensure(
      a.termsAccepted,
      "TERMS_REQUIRED",
      "Accept the displayed terms before purchasing credits.",
    );
    const live = process.env.STRIPE_MODE === "live";
    const origin = billingReturnOrigin(process.env);
    ensure(
      origin,
      "BILLING_UNAVAILABLE",
      "The checkout return origin is not configured.",
    );
    const tax = await ctx.runQuery(internal.commerce.taxConfig, {});
    const route = checkoutPaymentRoute({
      tax,
      country: a.country,
      live,
      route: process.env.STRIPE_BILLING_ROUTE,
      managedVerified: process.env.STRIPE_MANAGED_PAYMENTS_VERIFIED === "true",
      managedMarket: process.env.STRIPE_MANAGED_MARKET,
      managedMarketVerified: managedMarketVerified(process.env),
    });
    const price = process.env[`STRIPE_TOPUP_${a.pack}_PRICE_ID`];
    ensure(price, "BILLING_UNAVAILABLE", "Top-up price unavailable.");
    const client = await verifiedStripe();
    const p = await client.prices.retrieve(price),
      expected = a.pack === "200" ? 1000 : 2500;
    ensure(
      p.active &&
        !p.recurring &&
        p.unit_amount === expected &&
        p.currency === "eur" &&
        p.metadata.product === "vibescroller" &&
        p.tax_behavior === "inclusive",
      "CATALOGUE_MISMATCH",
      "Top-up catalogue mismatch.",
    );
    await ctx.runMutation(internal.commerce.recordAcceptance, {
      organizationId: a.organizationId,
      termsVersion: policyRelease.id,
      immediateService: a.immediateService,
    });
    const reserved = await ctx.runMutation(internal.billing.reserveCheckout, {
      organizationId: a.organizationId,
      intent: JSON.stringify([
        "topup",
        price,
        route.billingCountry,
        route.treatment,
        route.marketPolicy,
        a.immediateService,
        policyRelease.id,
      ]),
    });
    const session = await client.checkout.sessions.create(
      {
        customer: auth.billing.customerId,
        integration_identifier: "vibescroller_topup_vksnqjrt",
        billing_address_collection: "required",
        ...route.options,
        consent_collection: { terms_of_service: "required" },
        expires_at: Math.floor(reserved.expires / 1000),
        mode: "payment",
        line_items: [{ price, quantity: 1 }],
        metadata: {
          product: "vibescroller",
          credits: a.pack,
          checkoutKey: reserved.key,
          termsVersion: policyRelease.id,
          taxTreatment: route.treatment,
          marketPolicy: route.marketPolicy,
          organizationId: a.organizationId,
        },
        success_url: `${origin}/app/${a.organizationId}/usage`,
        cancel_url: `${origin}/app/${a.organizationId}/usage`,
      },
      { idempotencyKey: reserved.key },
    );
    return session.url!;
  },
});
export const requestRefund = action({
  args: { organizationId: v.id("organizations"), invoiceId: v.string() },
  handler: async (ctx, a) => {
    const auth = await ctx.runQuery(api.billing.authorize, {
      organizationId: a.organizationId,
    });
    const invoice = await (
      await verifiedStripe()
    ).invoices.retrieve(a.invoiceId);
    ensure(
      invoice.customer === auth.billing?.customerId,
      "FORBIDDEN",
      "Invoice unavailable.",
    );
    await ctx.runMutation(internal.commerce.refundRequest, {
      organizationId: a.organizationId,
      invoiceId: invoice.id,
      created: invoice.created * 1000,
    });
    return {
      status: "requested",
      message:
        "Refund request recorded for invoice-aware review, including eligible weekly renewals. Statutory rights remain unaffected.",
    };
  },
});
