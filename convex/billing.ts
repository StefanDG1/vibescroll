import { query, internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, billingFor, fail, limit } from "./lib";
import { billingReadiness } from "../packages/providers/billing-readiness";
import { ensure } from "../packages/policy";
import {
  checkoutAllowanceValue,
  paidAllowanceValue,
  validateAllowancePolicy,
  validatePaidAllowance,
  sameAllowancePolicy,
} from "../packages/billing/allowance-policy";
export const authorize = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const a = await access(ctx, organizationId, ["owner"]);
    return {
      name: a.organization.name,
      email: a.actor.email,
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
    ensure(
      process.env.RESTORE_LOCK !== "true",
      "RESTORE_LOCK",
      "Billing changes are paused during recovery.",
    );
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
        checkoutAllowance: undefined,
        paidAllowance: undefined,
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
    allowance: v.optional(checkoutAllowanceValue),
  },
  handler: async (ctx, { organizationId, intent, allowance }) => {
    ensure(
      process.env.RESTORE_LOCK !== "true",
      "RESTORE_LOCK",
      "Checkout is paused during recovery.",
    );
    const row = await billingFor(ctx, organizationId);
    if (!row) fail("Billing account unavailable.");
    if (allowance) {
      validateAllowancePolicy(allowance.policy);
      const accepted = allowance.policy.acceptance;
      ensure(
        accepted.kind === "recorded",
        "TERMS_REQUIRED",
        "Checkout requires its recorded acceptance.",
      );
      const record = await ctx.db.get(accepted.acceptanceId);
      ensure(
        record?.organizationId === organizationId &&
          record.termsVersion === accepted.policyReleaseId,
        "TERMS_REQUIRED",
        "Checkout acceptance does not match this workspace.",
      );
    }
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
      ensure(
        !allowance ||
          (row.checkoutAllowance &&
            row.checkoutAllowance.policy.policyId ===
              allowance.policy.policyId &&
            row.checkoutAllowance.policy.priceId === allowance.policy.priceId &&
            row.checkoutAllowance.policy.acceptance.kind === "recorded" &&
            allowance.policy.acceptance.kind === "recorded" &&
            row.checkoutAllowance.policy.acceptance.policyReleaseId ===
              allowance.policy.acceptance.policyReleaseId),
        "CHECKOUT_OPEN",
        "The existing checkout has no matching allowance acceptance.",
      );
      return {
        key: row.checkoutKey,
        expires: row.checkoutExpires,
        ...(row.checkoutAllowance ? { allowance: row.checkoutAllowance } : {}),
      };
    }
    const expires = Date.now() + 31 * 60000;
    const key = `checkout:${organizationId}:${crypto.randomUUID()}`;
    if (allowance?.policy.acceptance.kind === "recorded") {
      const accepted = await ctx.db.get(
        allowance.policy.acceptance.acceptanceId,
      );
      ensure(
        accepted && !accepted.checkoutKey,
        "EVIDENCE_LOCKED",
        "The checkout acceptance is already bound.",
      );
      await ctx.db.patch(accepted._id, {
        checkoutKey: key,
        checkoutCustomerId: row.customerId,
        providerAccountId: allowance.providerAccountId,
        providerMode: allowance.mode,
        allowancePolicy: allowance.policy,
      });
    }
    await ctx.db.patch(row._id, {
      checkoutKey: key,
      checkoutExpires: expires,
      checkoutIntent: intent,
      checkoutAllowance: allowance,
    });
    return { key, expires, ...(allowance ? { allowance } : {}) };
  },
});
export const checkoutCompleted = internalMutation({
  args: {
    customerId: v.string(),
    key: v.string(),
    subscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", a.customerId))
      .unique();
    if (!row || row.checkoutKey !== a.key) return;
    if (
      a.subscriptionId &&
      (!row.paidAllowance ||
        row.paidAllowance.subscriptionId !== a.subscriptionId ||
        !row.checkoutAllowance ||
        !sameAllowancePolicy(
          row.paidAllowance.base.policy,
          row.checkoutAllowance.policy,
        ))
    )
      return;
    await ctx.db.patch(row._id, {
      checkoutKey: undefined,
      checkoutIntent: undefined,
      checkoutExpires: undefined,
      checkoutAllowance: undefined,
    });
  },
});
export const reserveRefresh = internalMutation({
  args: { customerId: v.string() },
  handler: async (ctx, { customerId }) => {
    if (process.env.RESTORE_LOCK === "true") return null;
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .unique();
    if (!row || row.providerDeletedAt) return null;
    const revision = row.revision + 1;
    await ctx.db.patch(row._id, { revision });
    return {
      organizationId: row.organizationId,
      revision,
      paidAllowance: row.paidAllowance,
      checkoutAllowance: row.checkoutAllowance,
      checkoutKey: row.checkoutKey,
    };
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
    paidAllowance: v.optional(paidAllowanceValue),
  },
  handler: async (ctx, args) => {
    if (process.env.RESTORE_LOCK === "true") return false;
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
    if (args.paidAllowance) {
      const commitment = validatePaidAllowance(args.paidAllowance);
      ensure(
        commitment.subscriptionId === args.subscriptionId &&
          commitment.paidEnd === args.periodEnd,
        "ALLOWANCE_RECONCILIATION_REQUIRED",
        "The allowance and subscription periods disagree.",
      );
      const accepted = commitment.base.policy.acceptance;
      if (accepted.kind === "recorded") {
        const record = await ctx.db.get(accepted.acceptanceId);
        ensure(
          record?.organizationId === row.organizationId &&
            record.termsVersion === accepted.policyReleaseId,
          "TERMS_REQUIRED",
          "The paid allowance acceptance belongs to another purchase.",
        );
        ensure(
          record.checkoutCustomerId === row.customerId &&
            record.providerAccountId === commitment.providerAccountId &&
            record.providerMode === commitment.mode &&
            (!record.paidSubscriptionId ||
              record.paidSubscriptionId === commitment.subscriptionId),
          "ALLOWANCE_RECONCILIATION_REQUIRED",
          "The accepted purchase belongs to another provider subscription.",
        );
      }
      const prior = row.paidAllowance;
      if (
        prior?.subscriptionId === commitment.subscriptionId &&
        prior.paidStart === commitment.paidStart &&
        prior.paidEnd === commitment.paidEnd
      )
        ensure(
          prior.itemId === commitment.itemId &&
            prior.base.invoiceId === commitment.base.invoiceId &&
            sameAllowancePolicy(prior.base.policy, commitment.base.policy) &&
            (!prior.upgradeChangeId ||
              prior.upgradeChangeId === commitment.upgradeChangeId),
          "ALLOWANCE_RECONCILIATION_REQUIRED",
          "The existing paid commitment cannot be replaced.",
        );
    }
    if (!row.providerDeletedAt && args.revision >= (row.appliedRevision ?? 0)) {
      const acceptance = args.paidAllowance?.base.policy.acceptance;
      if (acceptance?.kind === "recorded") {
        const record = (await ctx.db.get(acceptance.acceptanceId))!;
        if (!record.paidSubscriptionId)
          await ctx.db.patch(record._id, {
            paidSubscriptionId: args.paidAllowance!.subscriptionId,
          });
      }
      await ctx.db.patch(row._id, {
        subscriptionId: args.subscriptionId,
        status: args.status,
        periodEnd: args.periodEnd,
        verifiedAt: Date.now(),
        appliedRevision: args.revision,
        ...(args.paidAllowance
          ? { paidAllowance: args.paidAllowance }
          : row.subscriptionId !== args.subscriptionId
            ? { paidAllowance: undefined }
            : {}),
      });
    }
    if (args.eventId)
      await ctx.db.insert("events", {
        eventId: args.eventId,
        processedAt: Date.now(),
      });
    return (
      !row.providerDeletedAt && args.revision >= (row.appliedRevision ?? 0)
    );
  },
});
// Provider deletion ends subscription allowances, not the app account or library.
// The customer tombstone prevents an older observation from restoring access.
export const providerDeleted = internalMutation({
  args: { customerId: v.string(), revision: v.number() },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
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
      checkoutAllowance: undefined,
      paidAllowance: undefined,
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
