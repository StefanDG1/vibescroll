import { query, internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, writeAccess } from "./lib";
import { ensure } from "../packages/policy";
import {
  allowancePolicyValue,
  validateAllowancePolicy,
  sameAllowancePolicy,
} from "../packages/billing/allowance-policy";
const fields = {
  organizationId: v.id("organizations"),
  subscriptionId: v.string(),
  itemId: v.string(),
  oldPrice: v.string(),
  newPrice: v.string(),
  tier: v.union(v.literal("starter"), v.literal("pro")),
  interval: v.union(
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("annual"),
  ),
  prorationDate: v.number(),
  periodStart: v.number(),
  periodEnd: v.number(),
  amount: v.number(),
  currency: v.string(),
  sourcePolicy: v.optional(allowancePolicyValue),
  targetPolicy: v.optional(allowancePolicyValue),
};
export const create = internalMutation({
  args: fields,
  handler: async (ctx, a) => {
    await writeAccess(ctx, a.organizationId, ["owner"]);
    ensure(
      a.sourcePolicy && a.targetPolicy,
      "ALLOWANCE_RECONCILIATION_REQUIRED",
      "Reconcile the purchased allowance before changing plans.",
    );
    validateAllowancePolicy(a.sourcePolicy);
    validateAllowancePolicy(a.targetPolicy);
    ensure(
      a.sourcePolicy.priceId === a.oldPrice &&
        a.targetPolicy.priceId === a.newPrice &&
        a.targetPolicy.tier === a.tier &&
        a.targetPolicy.billingInterval === a.interval &&
        a.sourcePolicy.billingInterval === a.interval,
      "QUOTE_INVALID",
      "The quoted allowance policies do not match the plan change.",
    );
    ensure(
      Number.isSafeInteger(a.amount) &&
        a.currency === "eur" &&
        a.periodEnd > a.periodStart,
      "QUOTE_INVALID",
      "Invalid provider quote.",
    );
    return ctx.db.insert("billingChanges", {
      ...a,
      state: "quoted",
      expiresAt: Date.now() + 600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
export const quote = query({
  args: { id: v.id("billingChanges") },
  handler: async (ctx, a) => {
    const q = await ctx.db.get(a.id);
    ensure(q, "NOT_FOUND", "Quote unavailable.");
    await access(ctx, q.organizationId, ["owner"]);
    return q;
  },
});
export const claim = internalMutation({
  args: { id: v.id("billingChanges") },
  handler: async (ctx, a) => {
    const q = await ctx.db.get(a.id);
    ensure(q, "NOT_FOUND", "Quote unavailable.");
    await writeAccess(ctx, q.organizationId, ["owner"]);
    const billing = await ctx.db
      .query("billing")
      .withIndex("by_org", (x) => x.eq("organizationId", q.organizationId))
      .unique();
    ensure(
      q.sourcePolicy &&
        q.targetPolicy &&
        billing?.paidAllowance &&
        billing.status === "active" &&
        !billing.providerDeletedAt &&
        billing.subscriptionId === q.subscriptionId &&
        billing.paidAllowance.itemId === q.itemId &&
        billing.paidAllowance.paidStart === q.periodStart * 1000 &&
        billing.paidAllowance.paidEnd === q.periodEnd * 1000,
      "ALLOWANCE_RECONCILIATION_REQUIRED",
      "The purchased allowance changed. Request a fresh quote.",
    );
    const prior = billing.paidAllowance.upgradeChangeId
      ? await ctx.db.get(billing.paidAllowance.upgradeChangeId)
      : null;
    const effective = prior?.targetPolicy ?? billing.paidAllowance.base.policy;
    ensure(
      sameAllowancePolicy(q.sourcePolicy, effective),
      "ALLOWANCE_RECONCILIATION_REQUIRED",
      "The quoted source allowance changed.",
    );
    validateAllowancePolicy(q.sourcePolicy);
    validateAllowancePolicy(q.targetPolicy);
    ensure(
      q.state === "quoted" && q.expiresAt > Date.now(),
      "QUOTE_EXPIRED",
      "Request a fresh plan-change quote.",
    );
    await ctx.db.patch(q._id, { state: "applying", updatedAt: Date.now() });
    return q;
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("billingChanges"),
    state: v.string(),
    invoiceId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ensure(
      process.env.RESTORE_LOCK !== "true",
      "RESTORE_LOCK",
      "Billing changes are paused during recovery.",
    );
    const row = await ctx.db.get(a.id);
    ensure(row, "NOT_FOUND", "Plan change unavailable.");
    // A failed refresh after confirmed payment must not erase paid evidence.
    if (row.state === "applied" && a.state !== "applied") return;
    ensure(
      !row.invoiceId || !a.invoiceId || row.invoiceId === a.invoiceId,
      "ALLOWANCE_RECONCILIATION_REQUIRED",
      "The paid change invoice cannot be replaced.",
    );
    await ctx.db.patch(a.id, {
      state: a.state,
      ...(a.invoiceId ? { invoiceId: a.invoiceId } : {}),
      updatedAt: Date.now(),
    });
  },
});
export const allowanceChange = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    subscriptionId: v.string(),
    itemId: v.string(),
    price: v.string(),
    interval: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, a) => {
    const rows = await ctx.db
      .query("billingChanges")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", a.subscriptionId),
      )
      .order("desc")
      .take(101);
    if (rows.length > 100) return { state: "held" as const };
    const bound = rows.filter(
      (q) =>
        q.organizationId === a.organizationId &&
        q.itemId === a.itemId &&
        q.newPrice === a.price &&
        q.interval === a.interval,
    );
    const upgrades = bound.filter(
      (q) =>
        q.tier === "pro" &&
        q.state === "applied" &&
        q.periodStart === a.periodStart &&
        q.periodEnd === a.periodEnd,
    );
    const renewals = bound.filter(
      (q) =>
        q.tier === "starter" &&
        ["scheduled", "applied"].includes(q.state) &&
        q.periodEnd === a.periodStart,
    );
    if (upgrades.length + renewals.length > 1)
      return { state: "held" as const };
    return {
      state: "ok" as const,
      upgrade: upgrades[0] ?? null,
      renewal: renewals[0] ?? null,
    };
  },
});
export const byId = internalQuery({
  args: { id: v.id("billingChanges") },
  handler: (ctx, a) => ctx.db.get(a.id),
});
export const bindLegacyPolicies = internalMutation({
  args: {
    id: v.id("billingChanges"),
    sourcePolicy: allowancePolicyValue,
    targetPolicy: allowancePolicyValue,
  },
  handler: async (ctx, a) => {
    ensure(
      process.env.RESTORE_LOCK !== "true",
      "RESTORE_LOCK",
      "Billing changes are paused during recovery.",
    );
    const row = await ctx.db.get(a.id);
    validateAllowancePolicy(a.sourcePolicy);
    validateAllowancePolicy(a.targetPolicy);
    ensure(
      row?.state === "applied" &&
        row.oldPrice === a.sourcePolicy.priceId &&
        row.newPrice === a.targetPolicy.priceId &&
        (!row.sourcePolicy ||
          sameAllowancePolicy(row.sourcePolicy, a.sourcePolicy)) &&
        (!row.targetPolicy ||
          sameAllowancePolicy(row.targetPolicy, a.targetPolicy)),
      "ALLOWANCE_RECONCILIATION_REQUIRED",
      "The legacy change policies cannot be reconstructed.",
    );
    await ctx.db.patch(row._id, {
      sourcePolicy: a.sourcePolicy,
      targetPolicy: a.targetPolicy,
    });
  },
});
