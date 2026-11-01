import { query, internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, billingFor, fail, limit } from "./lib";
import { billingReadiness } from "../packages/providers/billing-readiness";
import { ensure } from "../packages/policy";
import { billingRiskHeld } from "./lib/billingRisk";
export const authorize = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const a = await access(ctx, organizationId, ["owner"]);
    return {
      name: a.organization.name,
      email: a.actor.email,
      personal: a.organization.privateOwnerId === a.actor._id,
      mode: process.env.STRIPE_MODE === "live" ? "live" : "test",
      configured: Boolean(
        billingReadiness(process.env).catalogueConfigured ||
        (!process.env.STRIPE_V1_WEBHOOK_SECRET &&
          process.env.STRIPE_PRO_PRICE_ID &&
          process.env.STRIPE_WEBHOOK_SECRET &&
          new RegExp(`^[sr]k_${process.env.STRIPE_MODE ?? "test"}_`).test(
            process.env.STRIPE_SECRET_KEY ?? "",
          ) &&
          ["test", "live"].includes(process.env.STRIPE_MODE ?? "test")),
      ),
      billing: await billingFor(ctx, organizationId),
    };
  },
});
export const throttle = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: (ctx, { organizationId }) =>
    limit(ctx, `billing:${organizationId}`, 10),
});
export const byCustomer = internalQuery({
  args: { customerId: v.string() },
  handler: (ctx, a) =>
    ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", a.customerId))
      .unique(),
});
export const attach = internalMutation({
  args: { organizationId: v.id("organizations"), customerId: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org || org.status !== "active") fail("Organization unavailable.");
    const old = await billingFor(ctx, args.organizationId);
    if (old && !old.providerDeletedAt) return old.customerId;
    if (old) {
      await ctx.db.patch(old._id, {
        customerId: args.customerId,
        subscriptionId: undefined,
        providerDeletedAt: undefined,
        status: "free",
        periodEnd: 0,
        revision: old.revision + 1,
        appliedRevision: old.revision + 1,
        checkoutKey: undefined,
        checkoutIntent: undefined,
        checkoutExpires: undefined,
        verifiedAt: Date.now(),
      });
      return args.customerId;
    }
    await ctx.db.insert("billing", {
      ...args,
      status: "free",
      periodEnd: 0,
      verifiedAt: Date.now(),
      revision: 0,
    });
    return args.customerId;
  },
});
export const reserveCheckout = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    intent: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, intent }) => {
    const row = await billingFor(ctx, organizationId);
    if (!row) fail("Billing account unavailable.");
    if (
      row.checkoutKey &&
      row.checkoutExpires &&
      row.checkoutExpires > Date.now()
    ) {
      ensure(
        row.checkoutIntent === intent,
        "CHECKOUT_OPEN",
        "A different checkout is already open. Return to the previous selection or wait 31 minutes before changing it.",
      );
      return { key: row.checkoutKey, expires: row.checkoutExpires };
    }
    ensure(
      !(await billingRiskHeld(ctx, organizationId)),
      "PAYMENT_REVIEW_REQUIRED",
      "New purchases are paused for payment review. Existing invoices and results are preserved.",
    );
    const expires = Date.now() + 31 * 60000;
    const key = `checkout:${organizationId}:${crypto.randomUUID()}`;
    await ctx.db.patch(row._id, {
      checkoutKey: key,
      checkoutExpires: expires,
      checkoutIntent: intent,
    });
    return { key, expires };
  },
});
export const checkoutCompleted = internalMutation({
  args: { customerId: v.string(), key: v.string() },
  handler: async (ctx, a) => {
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", a.customerId))
      .unique();
    if (!row || row.checkoutKey !== a.key) return;
    await ctx.db.patch(row._id, {
      checkoutKey: undefined,
      checkoutIntent: undefined,
      checkoutExpires: undefined,
    });
  },
});
export const reserveRefresh = internalMutation({
  args: { customerId: v.string() },
  handler: async (ctx, { customerId }) => {
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .unique();
    if (!row || row.providerDeletedAt) return null;
    const revision = row.revision + 1;
    await ctx.db.patch(row._id, { revision });
    return { organizationId: row.organizationId, revision };
  },
});
export const apply = internalMutation({
  args: {
    customerId: v.string(),
    subscriptionId: v.optional(v.string()),
    status: v.string(),
    periodEnd: v.number(),
    revision: v.number(),
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (
      args.eventId &&
      (await ctx.db
        .query("events")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId!))
        .unique())
    )
      return;
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .unique();
    if (!row) fail("Billing account unavailable.");
    if (!row.providerDeletedAt && args.revision >= (row.appliedRevision ?? 0))
      await ctx.db.patch(row._id, {
        subscriptionId: args.subscriptionId,
        status: args.status,
        periodEnd: args.periodEnd,
        verifiedAt: Date.now(),
        appliedRevision: args.revision,
      });
    if (args.eventId)
      await ctx.db.insert("events", {
        eventId: args.eventId,
        processedAt: Date.now(),
      });
  },
});
// Provider deletion ends subscription allowances, not the app account or library.
// The customer tombstone prevents an older observation from restoring access.
export const providerDeleted = internalMutation({
  args: { customerId: v.string(), revision: v.number() },
  handler: async (ctx, a) => {
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", a.customerId))
      .unique();
    if (
      !row ||
      row.providerDeletedAt ||
      a.revision < (row.appliedRevision ?? 0)
    )
      return;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      providerDeletedAt: now,
      subscriptionId: undefined,
      status: "free",
      periodEnd: 0,
      verifiedAt: now,
      appliedRevision: a.revision,
      checkoutKey: undefined,
      checkoutIntent: undefined,
      checkoutExpires: undefined,
    });
    const periods = await ctx.db
      .query("billingPeriods")
      .withIndex("by_org", (q) => q.eq("organizationId", row.organizationId))
      .collect();
    const keys = new Set(periods.map((period) => period.key));
    for (const pool of await ctx.db
      .query("creditPools")
      .withIndex("by_org", (q) => q.eq("organizationId", row.organizationId))
      .collect()) {
      if (keys.has(pool.key) && (pool.expiresAt ?? Infinity) > now)
        await ctx.db.patch(pool._id, { expiresAt: now, updatedAt: now });
    }
  },
});
export const customers = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: (ctx, { cursor }) =>
    ctx.db.query("billing").paginate({ cursor, numItems: 50 }),
});
