// Offline migration preparation. No Stripe calls or wallet writes.
import candidate from "../../contracts/pro-pricing-candidate.json";
export type ProInterval = "week" | "month" | "year";
export const proCandidateVersion = candidate.version;
const dayMs = 86400000;
if (
  candidate.status !== "review_required" ||
  candidate.currency !== "EUR" ||
  candidate.poolScope !== "one_person_across_workspaces" ||
  candidate.plans.length !== 3 ||
  new Set(candidate.plans.map((p) => p.interval)).size !== 3
)
  throw Error("INVALID_PRO_REVIEW_CANDIDATE");
const terms = Object.fromEntries(
  (["week", "month", "year"] as const).map((interval) => {
    const plan = candidate.plans.find((p) => p.interval === interval);
    if (
      !plan ||
      !Number.isSafeInteger(plan.amountCents) ||
      plan.amountCents <= 0 ||
      !Number.isSafeInteger(plan.credits) ||
      plan.credits <= 0 ||
      plan.grantInterval !== (interval === "week" ? "week" : "month")
    )
      throw Error("INVALID_PRO_REVIEW_CANDIDATE");
    return [interval, { amountCents: plan.amountCents, credits: plan.credits }];
  }),
) as Record<ProInterval, { amountCents: number; credits: number }>;

function timestamp(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > Date.UTC(2100, 0, 1)
  )
    throw Error("INVALID_BILLING_TIME");
  return value;
}
function anniversary(anchor: number, monthOffset: number) {
  const d = new Date(anchor);
  const first = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return Date.UTC(
    first.getUTCFullYear(),
    first.getUTCMonth(),
    Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

export function candidateGrantWindows(args: {
  interval: ProInterval;
  anchorUTC: number;
  // Use the verified Stripe period, including its original month-end anchor.
  periodEndUTC: number;
  personId: string;
  subscriptionId: string;
}) {
  timestamp(args.anchorUTC);
  timestamp(args.periodEndUTC);
  if (
    !Object.hasOwn(terms, args.interval) ||
    !/^[A-Za-z0-9_-]{3,100}$/.test(args.personId) ||
    !/^sub_[A-Za-z0-9]{3,100}$/.test(args.subscriptionId)
  )
    throw Error("INVALID_PRO_CANDIDATE");
  const duration = args.periodEndUTC - args.anchorUTC;
  if (
    (args.interval === "week" && duration !== 7 * dayMs) ||
    (args.interval === "month" &&
      (duration < 28 * dayMs || duration > 31 * dayMs)) ||
    (args.interval === "year" &&
      args.periodEndUTC !== anniversary(args.anchorUTC, 12))
  )
    throw Error("INVALID_PROVIDER_BILLING_PERIOD");
  const count = args.interval === "year" ? 12 : 1;
  return Array.from({ length: count }, (_, index) => {
    const startUTC =
      args.interval === "week"
        ? args.anchorUTC
        : anniversary(args.anchorUTC, index);
    const endUTC =
      args.interval === "year"
        ? anniversary(args.anchorUTC, index + 1)
        : args.periodEndUTC;
    return {
      key: `${proCandidateVersion}:${args.personId}:${args.subscriptionId}:${startUTC}`,
      personId: args.personId,
      startUTC,
      endUTC,
      credits: terms[args.interval].credits,
      poolScope: "one_person_across_workspaces" as const,
      expiryRule: "expire_unused_allowance_keep_reserved_holds" as const,
    };
  });
}

type SandboxPrice = {
  id: string;
  active: boolean;
  livemode: boolean;
  currency: string;
  unit_amount: number;
  tax_behavior: string;
  recurring: { interval: string; interval_count: number } | null;
  metadata: Record<string, string>;
};
export function verifyCandidateSandboxPrices(prices: SandboxPrice[]) {
  if (prices.length !== 3 || new Set(prices.map((p) => p.id)).size !== 3)
    throw Error("EXACT_THREE_SANDBOX_PRICES_REQUIRED");
  return (Object.keys(terms) as ProInterval[]).map((interval) => {
    const price = prices.find((p) => p.recurring?.interval === interval);
    if (
      !price ||
      !/^price_[A-Za-z0-9]{3,100}$/.test(price.id) ||
      !price.active ||
      price.livemode ||
      price.currency !== "eur" ||
      price.unit_amount !== terms[interval].amountCents ||
      price.tax_behavior !== "inclusive" ||
      price.recurring!.interval_count !== 1 ||
      price.metadata.product !== "vibescroller" ||
      price.metadata.policy !== proCandidateVersion ||
      price.metadata.tier !== "pro"
    )
      throw Error("SANDBOX_PRICE_CONTRACT_MISMATCH");
    return { interval, priceId: price.id, ...terms[interval] };
  });
}

export function previewLegacyDisposition(args: {
  existingSubscription: boolean;
  purchasedCredits: number;
  reservedCredits: number;
  explicitCustomerOptIn: boolean;
  exactPriceMappingReviewed: boolean;
}) {
  if (
    ![args.purchasedCredits, args.reservedCredits].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    throw Error("INVALID_LEGACY_BALANCE");
  return {
    action: !args.existingSubscription
      ? "new_customer_candidate"
      : args.explicitCustomerOptIn && args.exactPriceMappingReviewed
        ? "review_change_at_renewal"
        : "keep_legacy_terms",
    purchasedCreditsUnchanged: args.purchasedCredits,
    reservedCreditsUnchanged: args.reservedCredits,
    automaticCharge: false,
    automaticCustomerMigration: false,
    liveActivationAllowed: false,
  } as const;
}
