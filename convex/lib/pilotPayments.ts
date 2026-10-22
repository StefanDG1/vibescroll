import { v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { recordPilotPayment } from "../../packages/billing/pilot-payment-core";
import { internal } from "../_generated/api";

// Internal-only evidence forwarded after Stripe signature/account/mode checks.
// Neither browser events nor a successful checkout redirect can supply it.
export const pilotProviderEvent = v.object({
  eventId: v.string(),
  accountId: v.string(),
  paymentId: v.string(),
  mode: v.union(v.literal("test"), v.literal("live")),
  eventType: v.union(
    v.literal("invoice.paid"),
    v.literal("checkout.session.completed"),
    v.literal("checkout.session.async_payment_succeeded"),
  ),
  occurredAt: v.number(),
  settlement: v.union(
    v.literal("settled"),
    v.literal("pending"),
    v.literal("failed"),
    v.literal("refunded"),
  ),
});
export type PilotProviderEvent = {
  eventId: string;
  accountId: string;
  paymentId: string;
  mode: "test" | "live";
  eventType:
    | "invoice.paid"
    | "checkout.session.completed"
    | "checkout.session.async_payment_succeeded";
  occurredAt: number;
  settlement: "settled" | "pending" | "failed" | "refunded";
};
type Kind = "monthly_subscription" | "topup";
export async function withdrawOrganizationPilotPayments(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  before: number,
) {
  const rows = await ctx.db
    .query("pilotPaymentObservations")
    .withIndex("by_org_state", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("state", "pending")
        .lte("createdAt", before),
    )
    .take(100);
  for (const row of rows)
    await ctx.db.patch(row._id, { state: "withdrawn", updatedAt: Date.now() });
  if (rows.length === 100)
    await ctx.scheduler.runAfter(
      0,
      internal.pilotPaymentMaintenance.withdrawOrganization,
      { organizationId, before },
    );
}
async function paymentKey(
  mode: "test" | "live",
  kind: Kind,
  paymentId: string,
) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([mode, kind, paymentId])),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export async function withdrawPilotPayment(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  paymentId: string,
  kind: Kind,
) {
  for (const mode of ["test", "live"] as const) {
    const key = `pilot-payment:${mode}:${await paymentKey(mode, kind, paymentId)}`;
    const row = await ctx.db
      .query("pilotPaymentObservations")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row?.organizationId === organizationId && row.state === "pending")
      await ctx.db.patch(row._id, {
        state: "withdrawn",
        updatedAt: Date.now(),
      });
  }
}
export async function recordSettledPilotPayment(
  ctx: MutationCtx,
  input: {
    organizationId: Id<"organizations">;
    paymentId: string;
    kind: Kind;
    evidence?: PilotProviderEvent;
  },
) {
  const event = input.evidence;
  if (
    process.env.PILOT_PAYMENT_MEASUREMENT_ENABLED !== "true" ||
    process.env.RESTORE_LOCK === "true" ||
    !event
  )
    return false;
  const mode = process.env.STRIPE_MODE;
  const start = Number(process.env.PILOT_PAYMENT_MEASUREMENT_START_AT_MS ?? "");
  if (event.paymentId !== input.paymentId) return false;
  if (
    !["test", "live"].includes(mode ?? "") ||
    event.mode !== mode ||
    !process.env.STRIPE_ACCOUNT_ID ||
    event.accountId !== process.env.STRIPE_ACCOUNT_ID ||
    !/^evt_[A-Za-z0-9_]+$/.test(event.eventId) ||
    !Number.isSafeInteger(event.occurredAt) ||
    event.occurredAt < 0 ||
    event.occurredAt > Date.now() ||
    !Number.isSafeInteger(start) ||
    start <= 0 ||
    event.occurredAt < start ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(input.paymentId)
  )
    return false;
  if (
    input.kind === "monthly_subscription"
      ? event.eventType !== "invoice.paid"
      : ![
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
        ].includes(event.eventType)
  )
    return false;
  let allowlist: unknown;
  try {
    allowlist = JSON.parse(
      process.env.PILOT_PAYMENT_ORGANIZATIONS_JSON ?? "[]",
    );
  } catch {
    return false;
  }
  const organization = await ctx.db.get(input.organizationId);
  const billing = await ctx.db
    .query("billing")
    .withIndex("by_org", (q) => q.eq("organizationId", input.organizationId))
    .unique();
  const preferences = await ctx.db
    .query("preferences")
    .withIndex("by_org", (q) => q.eq("organizationId", input.organizationId))
    .unique();
  if (
    !organization ||
    organization.status !== "active" ||
    !billing ||
    billing.providerDeletedAt ||
    !preferences?.analytics ||
    preferences.updatedAt > event.occurredAt ||
    preferences.acceptedAt > event.occurredAt
  )
    return false;
  // Verify the committed ledger identity inside this same transaction. A grant
  // rejection, missing payment allocation or any refund cannot become traction.
  if (input.kind === "monthly_subscription") {
    if (billing.status !== "active") return false;
    const funding = await ctx.db
      .query("creditFunding")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", input.paymentId))
      .take(13);
    const reversal = await ctx.db
      .query("billingReversals")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", input.paymentId))
      .first();
    if (
      !funding.length ||
      funding.some(
        (row) => row.organizationId !== input.organizationId || row.revoked > 0,
      ) ||
      reversal?.refunded
    )
      return false;
  } else {
    const pool = await ctx.db
      .query("creditPools")
      .withIndex("by_key", (q) => q.eq("key", `payment:${input.paymentId}`))
      .unique();
    if (
      !pool ||
      pool.organizationId !== input.organizationId ||
      pool.kind !== "purchased" ||
      pool.granted <= 0 ||
      (pool.revoked ?? 0) > 0
    )
      return false;
    const reversal = await ctx.db
      .query("billingReversals")
      .withIndex("by_key", (q) => q.eq("key", `refund:${input.paymentId}`))
      .unique();
    if (reversal?.refunded) return false;
  }
  return recordPilotPayment(
    {
      verifiedProviderEvent: true,
      settlement: event.settlement,
      mode: event.mode,
      purchaseKind: input.kind,
      paymentKey: await paymentKey(event.mode, input.kind, input.paymentId),
      analyticsConsented: true,
      cohortEligible:
        Array.isArray(allowlist) && allowlist.includes(input.organizationId),
    },
    async (key, observation) => {
      const old = await ctx.db
        .query("pilotPaymentObservations")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (old) return false;
      await ctx.db.insert("pilotPaymentObservations", {
        organizationId: input.organizationId,
        key,
        event: observation.event,
        mode: event.mode,
        purchaseKind: input.kind,
        properties: {
          schema_version: "1",
          mode: event.mode,
          purchase_kind: input.kind,
        },
        state: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return true;
    },
  );
}
