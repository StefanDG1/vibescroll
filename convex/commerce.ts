import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, writeAccess, audit, limit } from "./lib";
import { requireInvoiceOperator } from "./lib/invoiceOperator";
import { wallet } from "./product";
import { pricing, ensure } from "../packages/policy";
import { billingReadiness } from "../packages/providers/billing-readiness";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  pilotProviderEvent,
  recordSettledPilotPayment,
  withdrawPilotPayment,
  withdrawOrganizationPilotPayments,
} from "./lib/pilotPayments";
async function invoiceRefundFraction(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  invoiceId: string,
) {
  const rows = await ctx.db
    .query("billingReversals")
    .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
    .collect();
  if (!rows.length) return { refunded: BigInt(0), total: BigInt(1) };
  ensure(
    rows.every((r) => r.organizationId === organizationId),
    "FORBIDDEN",
    "Invoice belongs to another workspace.",
  );
  const totals = [
    ...new Set(
      rows
        .map((r) => r.invoiceTotal)
        .filter((n): n is number => n !== undefined),
    ),
  ];
  ensure(
    totals.length <= 1 && (totals.length === 1 || rows.length === 1),
    "REFUND_RECONCILIATION_REQUIRED",
    "Verify the invoice's paid total before reconciling multiple payments.",
  );
  const total = totals[0] ?? rows[0].total;
  ensure(
    Number.isSafeInteger(total) && total > 0,
    "REFUND_INVALID",
    "Invoice paid total is invalid.",
  );
  const numerator = rows.reduce(
    (sum, r) => sum + BigInt(r.refunded),
    BigInt(0),
  );
  const denominator = BigInt(total);
  return {
    refunded: numerator > denominator ? denominator : numerator,
    total: denominator,
  };
}
function revokedCredits(
  credits: number,
  ratio: { refunded: bigint; total: bigint },
) {
  ensure(
    Number.isSafeInteger(credits) && credits >= 0,
    "REFUND_INVALID",
    "Invalid invoice credit contribution.",
  );
  return Number((BigInt(credits) * ratio.refunded) / ratio.total);
}
async function fundInvoice(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  poolId: Id<"creditPools">,
  invoiceId: string | undefined,
  credits: number,
) {
  if (!invoiceId) return 0;
  const key = `${poolId}:${invoiceId}`;
  const old = await ctx.db
    .query("creditFunding")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (old) return old.revoked;
  const revoked = revokedCredits(
    credits,
    await invoiceRefundFraction(ctx, organizationId, invoiceId),
  );
  await ctx.db.insert("creditFunding", {
    organizationId,
    poolId,
    key,
    invoiceId,
    credits,
    revoked,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return revoked;
}
export const catalogue = query({
  args: {},
  handler: async (ctx) => {
    const tax = await ctx.db.query("taxConfigurations").first();
    return {
      pricing,
      taxMode: tax?.domestic ?? "pending_evidence",
      countries: tax?.countries ?? ["RO"],
      billingCountryRequired:
        process.env.STRIPE_BILLING_ROUTE !== "managed_payments" ||
        !["provider_supported", "tax_covered"].includes(
          process.env.STRIPE_MANAGED_MARKET ?? "",
        ),
      ...billingReadiness(process.env),
    };
  },
});
export const grantPeriod = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    subscription: v.string(),
    tier: v.union(v.literal("starter"), v.literal("pro")),
    interval: v.union(v.literal("weekly"), v.literal("monthly")),
    start: v.number(),
    end: v.number(),
    verifiedPayment: v.boolean(),
    upgradeAt: v.optional(v.number()),
    invoiceId: v.optional(v.string()),
    billingRevision: v.optional(v.number()),
    pilotEvent: v.optional(pilotProviderEvent),
  },
  handler: async (ctx, a) => {
    if (a.billingRevision !== undefined) {
      const current = await ctx.db
        .query("billing")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .unique();
      if (
        !current ||
        current.providerDeletedAt ||
        current.status !== "active" ||
        current.subscriptionId !== a.subscription ||
        current.appliedRevision !== a.billingRevision
      )
        return;
    }
    ensure(
      a.verifiedPayment && a.end > a.start,
      "PAYMENT_REQUIRED",
      "Verified payment is required.",
    );
    const key = `${a.subscription}:${a.start}`;
    const existing = await ctx.db
      .query("billingPeriods")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const w = await wallet(ctx, a.organizationId);
    const credits =
      a.interval === "weekly"
        ? pricing.tiers[a.tier].weekly_credits
        : pricing.tiers[a.tier].monthly_credits;
    if (existing) {
      ensure(
        existing.organizationId === a.organizationId && existing.end === a.end,
        "STALE_BILLING",
        "Entitlement identity mismatch.",
      );
      const ceiling = existing.allowanceCeiling ?? existing.credits;
      if (credits > ceiling) {
        if (a.upgradeAt === undefined || !a.invoiceId) return;
        ensure(
          a.upgradeAt >= a.start && a.upgradeAt < a.end,
          "STALE_BILLING",
          "Upgrade outside its paid period.",
        );
        const delta = Math.floor(
          ((credits - ceiling) * (a.end - a.upgradeAt)) / (a.end - a.start),
        );
        const pool = await ctx.db
          .query("creditPools")
          .withIndex("by_key", (q) => q.eq("key", key))
          .unique();
        ensure(
          pool && pool.organizationId === a.organizationId,
          "LEDGER_INVALID",
          "Entitlement pool unavailable.",
        );
        const revoked = await fundInvoice(
          ctx,
          a.organizationId,
          pool._id,
          a.invoiceId,
          delta,
        );
        await ctx.db.patch(pool._id, {
          granted: pool.granted + delta,
          revoked: (pool.revoked ?? 0) + revoked,
          updatedAt: Date.now(),
        });
        await ctx.db.patch(existing._id, {
          credits: existing.credits + delta,
          allowanceCeiling: credits,
          updatedAt: Date.now(),
        });
        await ctx.db.patch(w._id, {
          tier: a.tier,
          granted: w.granted + delta - revoked,
          updatedAt: Date.now(),
        });
      }
      if (a.invoiceId)
        await recordSettledPilotPayment(ctx, {
          organizationId: a.organizationId,
          paymentId: a.invoiceId,
          kind: "monthly_subscription",
          evidence: a.pilotEvent,
        });
      return;
    }
    ensure(
      a.start >= w.createdAt - 86400000 &&
        (w.tier === "trial" || a.end > w.periodEnd),
      "STALE_BILLING",
      "This entitlement period is stale.",
    );
    await ctx.db.insert("billingPeriods", {
      organizationId: a.organizationId,
      subscription: a.subscription,
      start: a.start,
      end: a.end,
      key,
      credits,
      allowanceCeiling: credits,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const poolId = await ctx.db.insert("creditPools", {
      organizationId: a.organizationId,
      key,
      kind: "included",
      granted: credits,
      spent: 0,
      reserved: 0,
      expiresAt: a.end,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const revoked = await fundInvoice(
      ctx,
      a.organizationId,
      poolId,
      a.invoiceId,
      credits,
    );
    if (revoked) await ctx.db.patch(poolId, { revoked });
    await ctx.db.patch(w._id, {
      tier: a.tier,
      interval: a.interval,
      granted: w.granted + credits - revoked,
      periodEnd: a.end,
      updatedAt: Date.now(),
    });
    if (a.invoiceId)
      await recordSettledPilotPayment(ctx, {
        organizationId: a.organizationId,
        paymentId: a.invoiceId,
        kind: "monthly_subscription",
        evidence: a.pilotEvent,
      });
  },
});
export const preferences = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.boolean(),
    telegram: v.boolean(),
    analytics: v.boolean(),
    legalVersion: v.string(),
  },
  handler: async (ctx, a) => {
    await writeAccess(ctx, a.organizationId, ["owner"]);
    const row = await ctx.db
      .query("preferences")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    if (row) await ctx.db.patch(row._id, { ...a, updatedAt: Date.now() });
    else
      await ctx.db.insert("preferences", {
        ...a,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        acceptedAt: Date.now(),
      });
    if (!a.analytics)
      await withdrawOrganizationPilotPayments(
        ctx,
        a.organizationId,
        Date.now(),
      );
  },
});
export const invoiceTasks = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId, ["owner"]);
    return ctx.db
      .query("invoiceTasks")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
  },
});
export const submitReceipt = mutation({
  args: { id: v.id("invoiceTasks"), receipt: v.string() },
  handler: async (ctx, a) => {
    const actor = await requireInvoiceOperator(ctx);
    const task = await ctx.db.get(a.id);
    ensure(task, "NOT_FOUND", "Invoice task unavailable.");
    const reference = a.receipt.trim();
    ensure(
      reference.length >= 10 && reference.length < 1000,
      "EVIDENCE_REQUIRED",
      "Supply the actual submission receipt reference.",
    );
    if (task.state === "submitted") {
      ensure(
        task.receipt === reference,
        "EVIDENCE_LOCKED",
        "The previous reference is retained. Reconcile corrections with the accountant.",
      );
      return;
    }
    await limit(ctx, `invoice-receipt:${actor._id}`, 10);
    await ctx.db.patch(a.id, {
      state: "submitted",
      receipt: reference,
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      task.organizationId,
      actor._id,
      "invoice.receipt_recorded",
      a.id,
    );
  },
});

export const taxConfig = internalQuery({
  args: {},
  handler: async (ctx) => {
    const c = await ctx.db.query("taxConfigurations").first();
    return {
      domestic: (c?.domestic ?? "pending_evidence") as
        "pending_evidence" | "ro_small_business_exempt" | "ro_normal_vat",
      special317: c?.special317 ?? false,
      evidence: c?.evidence,
      effectiveAt: c?.effectiveAt,
      registrations: c?.registrations ?? [],
      countries: c?.countries ?? ["RO"],
      oss: c?.oss ?? false,
      reviewed: c?.reviewed ?? false,
    };
  },
});
export const recordAcceptance = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    termsVersion: v.string(),
    immediateService: v.boolean(),
  },
  handler: async (ctx, a) => {
    const actor = await writeAccess(ctx, a.organizationId, ["owner"]);
    await ctx.db.insert("legalAcceptances", {
      ...a,
      actor: actor.actor._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
export const refundRequest = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    invoiceId: v.string(),
    created: v.number(),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("refundRequests", {
      organizationId: a.organizationId,
      invoiceId: a.invoiceId,
      invoiceCreatedAt: a.created,
      status: "pending_review",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const grantTopup = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    credits: v.number(),
    pilotEvent: v.optional(pilotProviderEvent),
  },
  handler: async (ctx, a) => {
    ensure(
      [200, 550].includes(a.credits),
      "CATALOGUE_MISMATCH",
      "Invalid top-up credits.",
    );
    const key = `payment:${a.paymentId}`;
    if (
      await ctx.db
        .query("creditPools")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
    ) {
      await recordSettledPilotPayment(ctx, {
        organizationId: a.organizationId,
        paymentId: a.paymentId,
        kind: "topup",
        evidence: a.pilotEvent,
      });
      return;
    }
    const w = await wallet(ctx, a.organizationId);
    const reversal = await ctx.db
      .query("billingReversals")
      .withIndex("by_key", (q) => q.eq("key", `refund:${a.paymentId}`))
      .unique();
    ensure(
      !reversal || reversal.organizationId === a.organizationId,
      "FORBIDDEN",
      "Payment reversal belongs to another workspace.",
    );
    const revoked = reversal
      ? Math.floor((a.credits * reversal.refunded) / reversal.total)
      : 0;
    await ctx.db.insert("creditPools", {
      organizationId: a.organizationId,
      key,
      kind: "purchased",
      revoked,
      granted: a.credits,
      spent: 0,
      reserved: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(w._id, { purchased: w.purchased + a.credits - revoked });
    await recordSettledPilotPayment(ctx, {
      organizationId: a.organizationId,
      paymentId: a.paymentId,
      kind: "topup",
      evidence: a.pilotEvent,
    });
  },
});
export const reversePayment = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    refunded: v.number(),
    total: v.number(),
    invoiceId: v.optional(v.string()),
    invoiceTotal: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    ensure(
      Number.isSafeInteger(a.refunded) &&
        Number.isSafeInteger(a.total) &&
        a.total > 0 &&
        a.refunded >= 0 &&
        a.refunded <= a.total,
      "REFUND_INVALID",
      "Invalid cumulative provider refund.",
    );
    const key = `refund:${a.paymentId}`;
    ensure(
      !a.invoiceId ||
        (Number.isSafeInteger(a.invoiceTotal) && a.invoiceTotal! >= a.total),
      "REFUND_RECONCILIATION_REQUIRED",
      "Verify invoice allocation and paid total before reversing credits.",
    );
    const old = await ctx.db
      .query("billingReversals")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    ensure(
      !old || old.organizationId === a.organizationId,
      "FORBIDDEN",
      "Payment belongs to another workspace.",
    );
    ensure(
      !old ||
        (old.invoiceId === a.invoiceId &&
          old.total === a.total &&
          (old.invoiceTotal === undefined ||
            old.invoiceTotal === a.invoiceTotal)),
      "REFUND_RECONCILIATION_REQUIRED",
      "Payment allocation changed; reconcile before applying another reversal.",
    );
    if (old && old.refunded >= a.refunded) return;
    if (old)
      await ctx.db.patch(old._id, {
        refunded: a.refunded,
        invoiceTotal: a.invoiceTotal,
        updatedAt: Date.now(),
      });
    else
      await ctx.db.insert("billingReversals", {
        ...a,
        key,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    if (a.refunded > 0) {
      await withdrawPilotPayment(ctx, a.organizationId, a.paymentId, "topup");
      if (a.invoiceId)
        await withdrawPilotPayment(
          ctx,
          a.organizationId,
          a.invoiceId,
          "monthly_subscription",
        );
    }
    if (a.invoiceId) {
      const invoiceId = a.invoiceId;
      const fraction = await invoiceRefundFraction(
        ctx,
        a.organizationId,
        invoiceId,
      );
      const grants = await ctx.db
        .query("creditFunding")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
        .collect();
      const w = await wallet(ctx, a.organizationId);
      let removed = 0;
      for (const grant of grants) {
        ensure(
          grant.organizationId === a.organizationId,
          "FORBIDDEN",
          "Invoice grant belongs to another workspace.",
        );
        const revoked = revokedCredits(grant.credits, fraction),
          delta = revoked - grant.revoked;
        if (delta <= 0) continue;
        const pool = await ctx.db.get(grant.poolId);
        if (!pool) continue;
        await ctx.db.patch(pool._id, {
          revoked: (pool.revoked ?? 0) + delta,
          updatedAt: Date.now(),
        });
        await ctx.db.patch(grant._id, { revoked, updatedAt: Date.now() });
        removed += delta;
      }
      if (removed)
        await ctx.db.patch(w._id, {
          granted: Math.max(0, w.granted - removed),
          updatedAt: Date.now(),
        });
    }
    const pool = await ctx.db
      .query("creditPools")
      .withIndex("by_key", (q) => q.eq("key", `payment:${a.paymentId}`))
      .unique();
    if (!pool) return;
    ensure(
      pool.organizationId === a.organizationId && pool.kind === "purchased",
      "FORBIDDEN",
      "Top-up belongs to another workspace.",
    );
    const revoked = Math.floor((pool.granted * a.refunded) / a.total),
      delta = revoked - (pool.revoked ?? 0);
    if (delta <= 0) return;
    await ctx.db.patch(pool._id, { revoked, updatedAt: Date.now() });
    const w = await wallet(ctx, a.organizationId);
    await ctx.db.patch(w._id, {
      purchased: Math.max(0, w.purchased - delta),
      updatedAt: Date.now(),
    });
  },
});
export const budgetFixture = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    max: v.number(),
  },
  handler: async (ctx, a) => {
    const { reserve } = await import("./product");
    return reserve(ctx, a.organizationId, a.key, a.max);
  },
});
export const settleUsage = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    credits: v.number(),
  },
  handler: async (ctx, a) => {
    const { settle } = await import("./product");
    return settle(ctx, a.organizationId, a.key, a.credits);
  },
});
export const stagingBillingEvidence = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    ensure(
      a.organizationId === process.env.STAGING_TEST_ORGANIZATION_ID &&
        process.env.STRIPE_MODE === "test",
      "FORBIDDEN",
      "Only the dedicated synthetic staging workspace is permitted.",
    );
    const billing = await ctx.db
      .query("billing")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    const pools = await ctx.db
      .query("creditPools")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
    return {
      status: billing?.status,
      subscriptionId: billing?.subscriptionId,
      pools: pools.map((p) => ({
        key: p.key,
        granted: p.granted,
        spent: p.spent,
        reserved: p.reserved,
        revoked: p.revoked ?? 0,
        kind: p.kind,
        expiresAt: p.expiresAt,
      })),
    };
  },
});
