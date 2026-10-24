import { v, type Infer } from "convex/values";
import type Stripe from "stripe";
import { ensure, monthlyAnchor } from "../policy";

// Purchased quantities are independent of the editable presentation catalogue.
// A new offer needs a separately reviewed registry entry; there is no fallback.
const legacy = {
  starter: { weekly: [65, 599], monthly: [250, 1900], annual: [250, 19000] },
  pro: { weekly: [150, 1199], monthly: [600, 3900], annual: [600, 39000] },
} as const;
export const allowanceTier = v.union(v.literal("starter"), v.literal("pro"));
export const allowanceInterval = v.union(
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("annual"),
);
export const allowanceAcceptance = v.union(
  v.object({
    kind: v.literal("recorded"),
    acceptanceId: v.id("legalAcceptances"),
    policyReleaseId: v.string(),
  }),
  v.object({ kind: v.literal("legacy_not_reconstructed") }),
);
export const allowancePolicyValue = v.object({
  version: v.literal("allowance-policy-v1"),
  policyId: v.string(),
  catalogueVersion: v.literal("1.1.0"),
  priceId: v.string(),
  tier: allowanceTier,
  billingInterval: allowanceInterval,
  grantSchedule: v.union(v.literal("seven_days"), v.literal("calendar_month")),
  creditsPerGrant: v.number(),
  acceptance: allowanceAcceptance,
});
export const paidAllowanceValue = v.object({
  version: v.literal("paid-allowance-v1"),
  providerAccountId: v.string(),
  mode: v.union(v.literal("test"), v.literal("live")),
  subscriptionId: v.string(),
  itemId: v.string(),
  paidStart: v.number(),
  paidEnd: v.number(),
  anchor: v.number(),
  base: v.object({ policy: allowancePolicyValue, invoiceId: v.string() }),
  upgradeChangeId: v.optional(v.id("billingChanges")),
});
export const checkoutAllowanceValue = v.object({
  policy: allowancePolicyValue,
  providerAccountId: v.string(),
  mode: v.union(v.literal("test"), v.literal("live")),
});
export type AllowancePolicy = Infer<typeof allowancePolicyValue>;
export type PaidAllowance = Infer<typeof paidAllowanceValue>;
export type CheckoutAllowance = Infer<typeof checkoutAllowanceValue>;
export type AllowanceAcceptance = Infer<typeof allowanceAcceptance>;
export type AllowanceTier = Infer<typeof allowanceTier>;
export type AllowanceInterval = Infer<typeof allowanceInterval>;
export function sameAllowancePolicy(a: AllowancePolicy, b: AllowancePolicy) {
  return (
    a.version === b.version &&
    a.policyId === b.policyId &&
    a.catalogueVersion === b.catalogueVersion &&
    a.priceId === b.priceId &&
    a.tier === b.tier &&
    a.billingInterval === b.billingInterval &&
    a.grantSchedule === b.grantSchedule &&
    a.creditsPerGrant === b.creditsPerGrant &&
    a.acceptance.kind === b.acceptance.kind &&
    (a.acceptance.kind === "legacy_not_reconstructed" ||
      (b.acceptance.kind === "recorded" &&
        a.acceptance.acceptanceId === b.acceptance.acceptanceId &&
        a.acceptance.policyReleaseId === b.acceptance.policyReleaseId))
  );
}

export function validateAllowancePolicy(policy: AllowancePolicy) {
  ensure(
    ["starter", "pro"].includes(policy.tier) &&
      ["weekly", "monthly", "annual"].includes(policy.billingInterval),
    "ALLOWANCE_RECONCILIATION_REQUIRED",
    "The purchased allowance policy is unavailable.",
  );
  const entry = legacy[policy.tier]?.[policy.billingInterval];
  ensure(
    entry &&
      policy.version === "allowance-policy-v1" &&
      policy.catalogueVersion === "1.1.0" &&
      policy.policyId ===
        `vibescroller-1.1.0-${policy.tier}-${policy.billingInterval}` &&
      policy.creditsPerGrant === entry[0] &&
      policy.priceId.length > 0 &&
      policy.grantSchedule ===
        (policy.billingInterval === "weekly" ? "seven_days" : "calendar_month"),
    "ALLOWANCE_RECONCILIATION_REQUIRED",
    "The purchased allowance policy is unavailable.",
  );
  return policy;
}
export function resolveAllowancePolicy(
  price: Stripe.Price,
  approvedPriceId: string | undefined,
  acceptance: AllowanceAcceptance,
): AllowancePolicy {
  const tier = price.metadata.tier as AllowanceTier;
  const interval = price.metadata.interval as AllowanceInterval;
  ensure(
    ["starter", "pro"].includes(tier) &&
      ["weekly", "monthly", "annual"].includes(interval),
    "ALLOWANCE_RECONCILIATION_REQUIRED",
    "The price does not identify a reviewed allowance contract.",
  );
  const entry = legacy[tier]?.[interval];
  ensure(
    entry &&
      approvedPriceId &&
      price.id === approvedPriceId &&
      price.metadata.product === "vibescroller" &&
      price.metadata.catalogue === "1.1.0" &&
      price.currency === "eur" &&
      price.tax_behavior === "inclusive" &&
      price.unit_amount === entry[1] &&
      price.recurring?.interval_count === 1 &&
      price.recurring.interval ===
        (interval === "weekly"
          ? "week"
          : interval === "annual"
            ? "year"
            : "month"),
    "ALLOWANCE_RECONCILIATION_REQUIRED",
    "The price does not identify a reviewed allowance contract.",
  );
  return validateAllowancePolicy({
    version: "allowance-policy-v1",
    policyId: `vibescroller-1.1.0-${tier}-${interval}`,
    catalogueVersion: "1.1.0",
    priceId: price.id,
    tier,
    billingInterval: interval,
    grantSchedule: interval === "weekly" ? "seven_days" : "calendar_month",
    creditsPerGrant: entry[0],
    acceptance,
  });
}
export function validatePaidAllowance(value: PaidAllowance) {
  validateAllowancePolicy(value.base.policy);
  ensure(
    value.providerAccountId &&
      value.subscriptionId &&
      value.itemId &&
      value.base.invoiceId &&
      Number.isSafeInteger(value.paidStart) &&
      Number.isSafeInteger(value.paidEnd) &&
      value.paidEnd > value.paidStart &&
      Number.isSafeInteger(value.anchor),
    "ALLOWANCE_RECONCILIATION_REQUIRED",
    "The paid allowance commitment is invalid.",
  );
  paidTermMonthOffset(value);
  return value;
}
// Arithmetic offset, no history walk. Nonnegative Unix anchors and valid UTC
// dates bound the offset; an annual term considers at most twelve grants.
export function paidTermMonthOffset(value: PaidAllowance) {
  ensure(
    value.anchor >= 0 &&
      value.anchor <= value.paidStart &&
      Number.isFinite(new Date(value.anchor).getTime()) &&
      Number.isFinite(new Date(value.paidEnd).getTime()),
    "ALLOWANCE_RECONCILIATION_REQUIRED",
    "The original billing calendar anchor is unavailable.",
  );
  if (value.base.policy.billingInterval === "weekly") {
    ensure(
      (value.paidStart - value.anchor) % (7 * 86400000) === 0 &&
        value.paidEnd === value.paidStart + 7 * 86400000,
      "ALLOWANCE_RECONCILIATION_REQUIRED",
      "The paid week does not match its billing anchor.",
    );
    return 0;
  }
  const anchor = new Date(value.anchor),
    start = new Date(value.paidStart);
  const offset =
    (start.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    start.getUTCMonth() -
    anchor.getUTCMonth();
  const periods = value.base.policy.billingInterval === "annual" ? 12 : 1;
  ensure(
    Number.isSafeInteger(offset) &&
      offset >= 0 &&
      (periods !== 12 || offset % 12 === 0) &&
      monthlyAnchor(value.anchor, offset) === value.paidStart &&
      monthlyAnchor(value.anchor, offset + periods) === value.paidEnd,
    "ALLOWANCE_RECONCILIATION_REQUIRED",
    "The paid term does not match its original billing anchor.",
  );
  return offset;
}
export function stripeObjectId(
  value: { id: string } | string | null | undefined,
) {
  return typeof value === "string" ? value : value?.id;
}
// Invoice-line parent/pricing fields follow the installed Stripe 22.6.2 types.
// Partial invoice pages are held for reconciliation, never treated as coverage.
export function verifyAllowanceInvoice(
  invoice: Stripe.Invoice,
  input: {
    customerId: string;
    subscriptionId: string;
    itemId: string;
    priceId: string;
    start: number;
    end: number;
    live: boolean;
    proration: boolean;
  },
) {
  ensure(
    invoice.status === "paid" &&
      invoice.livemode === input.live &&
      stripeObjectId(invoice.customer) === input.customerId &&
      invoice.currency === "eur" &&
      invoice.parent?.type === "subscription_details" &&
      stripeObjectId(invoice.parent.subscription_details?.subscription) ===
        input.subscriptionId &&
      invoice.lines &&
      invoice.lines.has_more === false &&
      invoice.lines.data.some((line) => {
        const parent = line.parent?.subscription_item_details;
        return (
          line.parent?.type === "subscription_item_details" &&
          parent &&
          parent.subscription === input.subscriptionId &&
          parent.subscription_item === input.itemId &&
          parent.proration === input.proration &&
          line.quantity === 1 &&
          line.pricing?.type === "price_details" &&
          stripeObjectId(line.pricing.price_details?.price) === input.priceId &&
          line.period.start * 1000 === input.start &&
          line.period.end * 1000 === input.end &&
          line.amount >= 0
        );
      }),
    "ALLOWANCE_RECONCILIATION_REQUIRED",
    "A complete paid invoice must cover this allowance commitment.",
  );
}
