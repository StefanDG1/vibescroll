// Dormant offer preparation only. This module creates no Stripe product,
// checkout, entitlement or payment. Existing provider/legal gates still apply.
export type FoundingPassDraft = {
  enabled: boolean;
  price: { currency: "EUR"; cents: number; version: string } | null;
  monthlyCredits: number | null;
  overage: "stop_until_separately_quoted";
  approval: {
    reference: string;
    termsVersion: string;
    priceVersion: string;
    priceCents: number;
    monthlyCredits: number;
    pilotReference: string;
    approvedAt: number;
    reviewExpiresAt: number;
  } | null;
  pilot: {
    reference: string;
    source: "observed_pilot";
    observedAt: number;
    participants: number;
    processingUsdMicros: number;
    storageUsdMicros: number;
    supportMinutes: number;
  } | null;
};
export const foundingPassDraft: FoundingPassDraft = {
  enabled: false,
  price: null,
  monthlyCredits: null,
  overage: "stop_until_separately_quoted",
  approval: null,
  pilot: null,
};
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const reference = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value);
export function foundingPassAvailability(
  draft: FoundingPassDraft,
  now: number,
) {
  const reasons: string[] = [];
  if (!draft.enabled) reasons.push("offer_disabled");
  if (!positive(now)) reasons.push("clock_unavailable");
  if (
    !draft.price ||
    draft.price.currency !== "EUR" ||
    !positive(draft.price.cents) ||
    !reference(draft.price.version)
  )
    reasons.push("operator_price_required");
  if (!positive(draft.monthlyCredits)) reasons.push("allowance_required");
  if (draft.overage !== "stop_until_separately_quoted")
    reasons.push("explicit_overage_required");
  const approval = draft.approval;
  if (
    !approval ||
    !reference(approval.reference) ||
    !reference(approval.termsVersion) ||
    !positive(approval.approvedAt) ||
    approval.approvedAt > now ||
    !positive(approval.reviewExpiresAt) ||
    approval.reviewExpiresAt <= now
  )
    reasons.push("current_operator_terms_required");
  const pilot = draft.pilot;
  if (
    !pilot ||
    pilot.source !== "observed_pilot" ||
    !reference(pilot.reference) ||
    !positive(pilot.observedAt) ||
    pilot.observedAt > now ||
    !positive(pilot.participants) ||
    !nonnegative(pilot.processingUsdMicros) ||
    !nonnegative(pilot.storageUsdMicros) ||
    !nonnegative(pilot.supportMinutes)
  )
    reasons.push("observed_pilot_costs_required");
  if (
    approval &&
    (approval.priceVersion !== draft.price?.version ||
      approval.priceCents !== draft.price?.cents ||
      approval.monthlyCredits !== draft.monthlyCredits ||
      approval.pilotReference !== pilot?.reference ||
      approval.approvedAt < (pilot?.observedAt ?? Infinity))
  )
    reasons.push("offer_review_changed");
  return {
    preparedForReview: reasons.length === 0,
    reasons,
    term: "three_calendar_years" as const,
    monthlyPeriods: 36 as const,
    automaticRenewal: false as const,
    limitation:
      "Preparation does not enable checkout or establish provider, tax, legal or publication permission.",
  };
}
function utcMonth(anchor: number, offset: number) {
  const d = new Date(anchor);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + offset;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}
export type FoundingPass = {
  purchaseId: string;
  startsAt: number;
  monthlyCredits: number;
  priceVersion: string;
  termsVersion: string;
  status: "active" | "refund_pending" | "refunded" | "revoked";
  cancellationRequestedAt?: number;
};
export function foundingPassPeriod(pass: FoundingPass, now: number) {
  if (
    !reference(pass.purchaseId) ||
    !positive(pass.startsAt) ||
    !positive(pass.monthlyCredits) ||
    !reference(pass.priceVersion) ||
    !reference(pass.termsVersion) ||
    !positive(now)
  )
    throw Error("FOUNDING_PASS_INVALID");
  const endsAt = utcMonth(pass.startsAt, 36);
  if (!Number.isFinite(endsAt)) throw Error("FOUNDING_PASS_INVALID");
  if (
    !["active", "refund_pending"].includes(pass.status) ||
    now < pass.startsAt ||
    now >= endsAt
  )
    return { active: false as const, endsAt, period: null };
  let index = 0;
  while (index < 35 && utcMonth(pass.startsAt, index + 1) <= now) index++;
  return {
    active: true as const,
    endsAt,
    period: {
      index,
      startsAt: utcMonth(pass.startsAt, index),
      endsAt: utcMonth(pass.startsAt, index + 1),
      credits: pass.monthlyCredits,
      // Persist this key atomically through the existing entitlement ledger.
      // Polling, replay and cancellation cannot create a different same-period grant.
      grantKey: `founding-pass:${pass.purchaseId}:${index}`,
    },
    overage: "stop_until_separately_quoted" as const,
  };
}
