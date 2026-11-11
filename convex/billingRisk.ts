import { internalMutation, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ensure, containsSecret } from "../packages/policy";
import { requireInvoiceOperator } from "./lib/invoiceOperator";

export const observe = internalMutation({
  args: {
    customerId: v.string(),
    accountId: v.string(),
    mode: v.union(v.literal("test"), v.literal("live")),
    kind: v.union(v.literal("dispute"), v.literal("fraud_warning")),
    providerId: v.string(),
    chargeId: v.string(),
    invoiceId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    eventId: v.string(),
    state: v.union(v.literal("held"), v.literal("released")),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    ensure(
      a.accountId === process.env.STRIPE_ACCOUNT_ID &&
        a.mode === (process.env.STRIPE_MODE === "live" ? "live" : "test") &&
        (a.kind === "dispute"
          ? /^dp_[A-Za-z0-9_]+$/
          : /^issfr_[A-Za-z0-9_]+$/
        ).test(a.providerId) &&
        /^ch_[A-Za-z0-9_]+$/.test(a.chargeId),
      "BILLING_RISK_INVALID",
      "The payment review observation is unavailable.",
    );
    const billing = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", a.customerId))
      .unique();
    if (!billing) return null;
    const key = `${a.accountId}:${a.mode}:${a.kind}:${a.providerId}`;
    const old = await ctx.db
      .query("billingRiskHolds")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (old) {
      ensure(
        old.organizationId === billing.organizationId &&
          old.chargeId === a.chargeId,
        "BILLING_RISK_INVALID",
        "Payment review ownership changed.",
      );
      // A resolved provider risk cannot be reopened by an older delivery.
      if (old.state === "released") return null;
      if (old.state === a.state && !a.invoiceId && !a.subscriptionId)
        return null;
      await ctx.db.patch(old._id, {
        state: a.state,
        eventId: a.eventId,
        ...(a.invoiceId ? { invoiceId: a.invoiceId } : {}),
        ...(a.subscriptionId ? { subscriptionId: a.subscriptionId } : {}),
        updatedAt: Date.now(),
      });
    } else {
      const { customerId: _customerId, ...observation } = a;
      await ctx.db.insert("billingRiskHolds", {
        ...observation,
        key,
        organizationId: billing.organizationId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const reviewQueue = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("billingRiskHolds"),
      organizationId: v.id("organizations"),
      kind: v.union(v.literal("dispute"), v.literal("fraud_warning")),
      chargeId: v.string(),
      providerId: v.string(),
    }),
  ),
  handler: async (ctx) => {
    await requireInvoiceOperator(ctx);
    const rows = await ctx.db
      .query("billingRiskHolds")
      .withIndex("by_state", (q) => q.eq("state", "held"))
      .take(50);
    return rows.map((r) => ({
      id: r._id,
      organizationId: r.organizationId,
      kind: r.kind,
      chargeId: r.chargeId,
      providerId: r.providerId,
    }));
  },
});

export const releaseReviewed = mutation({
  args: { id: v.id("billingRiskHolds"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    await requireInvoiceOperator(ctx);
    ensure(
      a.reason.trim().length >= 20 &&
        a.reason.length <= 500 &&
        !containsSecret(a.reason),
      "REVIEW_REQUIRED",
      "Record the verified payment-review reason.",
    );
    const row = await ctx.db.get(a.id);
    ensure(row, "NOT_FOUND", "Payment review unavailable.");
    await ctx.db.patch(row._id, {
      state: "released",
      reviewedReason: a.reason.trim(),
      updatedAt: Date.now(),
    });
    return null;
  },
});
