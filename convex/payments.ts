"use node";
import Stripe from "stripe";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
const stripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Billing is not configured.");
  const mode = process.env.STRIPE_MODE ?? "test";
  if (
    !["test", "live"].includes(mode) ||
    !new RegExp(`^[sr]k_${mode}_`).test(key)
  )
    throw new Error("Stripe key and billing environment do not match.");
  return new Stripe(key);
};
const appUrl = () => {
  const url = process.env.APP_URL;
  if (!url) throw new Error("Application URL is missing.");
  return new URL(url).origin;
};
type RefreshResult = { allowance: "held" | "not_due" } | null | void;
async function refresh(
  ctx: ActionCtx,
  customerId: string,
  eventId?: string,
): Promise<RefreshResult> {
  // The exported legacy catalogue must never overwrite V1 allowance state.
  if (process.env.STRIPE_V1_WEBHOOK_SECRET) {
    return ctx.runAction(internal.reconciliation.customer, { customerId });
  }
  const reservation = await ctx.runMutation(internal.billing.reserveRefresh, {
    customerId,
  });
  if (!reservation) return;
  const client = stripe();
  const all = await client.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const price = process.env.STRIPE_PRO_PRICE_ID;
  const relevant = all.data.filter((s) =>
    s.items.data.some((i) => i.price.id === price),
  );
  const subscription =
    relevant.find((s) => ["active", "trialing"].includes(s.status)) ??
    relevant.find(
      (s) => !["canceled", "incomplete_expired"].includes(s.status),
    ) ??
    relevant[0];
  const periodEnd = subscription
    ? Math.max(...subscription.items.data.map((i) => i.current_period_end)) *
      1000
    : 0;
  await ctx.runMutation(internal.billing.apply, {
    customerId,
    subscriptionId: subscription?.id,
    status: subscription?.status ?? "free",
    periodEnd,
    revision: reservation.revision,
    eventId,
  });
}
export const checkout = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<string> => {
    const auth = await ctx.runQuery(api.billing.authorize, { organizationId });
    if (!auth.configured)
      throw new Error("Subscriptions are not available for this deployment.");
    throw new Error(
      "Use the VibeScroller allowance catalogue. Foundation checkout is disabled.",
    );
  },
});
export const portal = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<string> => {
    const auth = await ctx.runQuery(api.billing.authorize, { organizationId });
    await ctx.runMutation(internal.billing.throttle, { organizationId });
    if (!auth.billing) throw new Error("No billing account yet.");
    return (
      await stripe().billingPortal.sessions.create({
        customer: auth.billing.customerId,
        configuration: process.env.STRIPE_PORTAL_CONFIG_ID,
        return_url: `${appUrl()}/app/${organizationId}/billing`,
      })
    ).url;
  },
});
export const refreshBilling = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<RefreshResult> => {
    const auth = await ctx.runQuery(api.billing.authorize, { organizationId });
    await ctx.runMutation(internal.billing.throttle, { organizationId });
    if (auth.billing) return refresh(ctx, auth.billing.customerId);
  },
});
export const webhook = internalAction({
  args: { body: v.string(), signature: v.string() },
  handler: async (ctx, { body, signature }) => {
    if (process.env.RESTORE_LOCK === "true") return { status: 503 };
    const client = stripe();
    let event: Stripe.Event;
    try {
      event = client.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET ?? "",
      );
    } catch {
      return { status: 400 };
    }
    const expectedLive = process.env.STRIPE_MODE === "live";
    if (event.livemode !== expectedLive) return { status: 400 };
    if (
      ![
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
      ].includes(event.type)
    )
      return { status: 200 };
    const object = event.data.object as { customer?: string | { id: string } };
    const customerId =
      typeof object.customer === "string"
        ? object.customer
        : object.customer?.id;
    if (customerId) await refresh(ctx, customerId, event.id);
    return { status: 200 };
  },
});
export const reconcile = internalAction({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    if (process.env.RESTORE_LOCK === "true") return;
    if (!process.env.STRIPE_SECRET_KEY) return;
    const result = await ctx.runQuery(internal.billing.customers, {
      cursor: cursor ?? null,
    });
    for (const row of result.page) {
      try {
        await refresh(ctx, row.customerId);
      } catch {
        console.error(
          "Billing reconciliation failed for an account; access expires conservatively.",
        );
      }
    }
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.payments.reconcile, {
        cursor: result.continueCursor,
      });
  },
});
