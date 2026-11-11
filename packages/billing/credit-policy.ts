import pricing from "../../contracts/pricing.json";
import candidate from "../../contracts/pro-pricing-candidate.json";
import { candidateGrantWindows } from "./pro-migration-preview";
export const proCreditPolicyVersion = candidate.version;

export type BillingInterval = "weekly" | "monthly" | "annual";
type Environment = Record<string, string | undefined>;
export type CreditPolicy = {
  version: string;
  tier: "starter" | "pro";
  interval: BillingInterval;
  credits: number;
  priceId: string;
  candidate: boolean;
  liveMode?: boolean;
};
type Price = {
  id: string;
  metadata: Record<string, string>;
  active?: boolean;
  livemode?: boolean;
  currency?: string;
  unit_amount?: number | null;
  tax_behavior?: string | null;
  recurring?: { interval: string; interval_count: number } | null;
};
const intervals = ["weekly", "monthly", "annual"] as const;
const providerInterval = {
  weekly: "week",
  monthly: "month",
  annual: "year",
} as const;

function candidateConfiguration(env: Environment) {
  const raw = env.STRIPE_PRO_CREDIT_POLICY_V2_JSON;
  if (!raw) return null;
  if (raw.length > 8192) throw Error("INVALID_PRO_CREDIT_POLICY");
  const config = JSON.parse(raw);
  const mode = env.STRIPE_MODE ?? "test";
  if (
    !config ||
    config.version !== candidate.version ||
    config.accountId !== env.STRIPE_ACCOUNT_ID ||
    !/^acct_[A-Za-z0-9_]+$/.test(config.accountId ?? "") ||
    !["test", "live"].includes(mode) ||
    config.mode !== mode ||
    config.activation !== (mode === "test" ? "sandbox" : "reviewed_live") ||
    !config.prices ||
    Object.keys(config.prices).length !== 3 ||
    !intervals.every((i) =>
      /^price_[A-Za-z0-9_]+$/.test(config.prices[i] ?? ""),
    ) ||
    new Set(intervals.map((i) => config.prices[i])).size !== 3
  )
    throw Error("INVALID_PRO_CREDIT_POLICY");
  for (const tier of ["starter", "pro"])
    for (const interval of intervals)
      if (
        intervals.some(
          (i) =>
            config.prices[i] ===
            env[
              `STRIPE_${tier.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID`
            ],
        )
      )
        throw Error("LEGACY_PRICE_POLICY_COLLISION");
  return config as {
    version: string;
    mode: string;
    prices: Record<BillingInterval, string>;
  };
}

export function candidateCreditPolicy(
  env: Environment,
  priceId: string,
): CreditPolicy | null {
  const config = candidateConfiguration(env);
  if (!config) return null;
  const interval = intervals.find((i) => config.prices[i] === priceId);
  if (!interval) return null;
  const plan = candidate.plans.find(
    (p) => p.interval === providerInterval[interval],
  )!;
  return {
    version: config.version,
    tier: "pro",
    interval,
    credits: plan.credits,
    priceId,
    candidate: true,
    liveMode: config.mode === "live",
  };
}

export function candidateCheckoutPolicy(
  env: Environment,
  interval: BillingInterval,
) {
  const config = candidateConfiguration(env);
  return config ? candidateCreditPolicy(env, config.prices[interval]) : null;
}

export function singleProConfigured(env: Environment) {
  return candidateConfiguration(env) !== null;
}

export function resolveCreditPolicy(
  env: Environment,
  price: Price,
): CreditPolicy | null {
  // Existing IDs always retain their existing policy, even if a new configuration
  // is incomplete. Never reinterpret the legacy prices as the smaller allowance.
  for (const tier of ["starter", "pro"] as const)
    for (const interval of intervals) {
      if (
        price.id !==
        env[`STRIPE_${tier.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID`]
      )
        continue;
      if (price.metadata.tier !== tier || price.metadata.interval !== interval)
        return null;
      return {
        version: `legacy-${pricing.schemaVersion}`,
        tier,
        interval,
        credits:
          interval === "weekly"
            ? pricing.tiers[tier].weekly_credits
            : pricing.tiers[tier].monthly_credits,
        priceId: price.id,
        candidate: false,
      };
    }
  const policy = candidateCreditPolicy(env, price.id);
  if (!policy) return null;
  const plan = candidate.plans.find(
    (p) => p.interval === providerInterval[policy.interval],
  )!;
  if (
    price.livemode !== ((env.STRIPE_MODE ?? "test") === "live") ||
    price.currency !== "eur" ||
    price.unit_amount !== plan.amountCents ||
    price.tax_behavior !== "inclusive" ||
    price.recurring?.interval !== plan.interval ||
    price.recurring.interval_count !== 1 ||
    price.metadata.product !== "vibescroller" ||
    price.metadata.tier !== "pro" ||
    price.metadata.interval !== policy.interval ||
    price.metadata.policy !== policy.version
  )
    throw Error("PRO_PRICE_CONTRACT_MISMATCH");
  return policy;
}

type Subscription = {
  id: string;
  customer: unknown;
  livemode: boolean;
  items: {
    data: Array<{
      price: { id: string };
      quantity?: number | null;
      current_period_start: number;
      current_period_end: number;
    }>;
  };
};
type Invoice = {
  id: string;
  customer: unknown;
  livemode: boolean;
  status: string | null;
  currency: string;
  amount_paid: number;
  amount_remaining: number;
  parent?: { subscription_details?: { subscription?: unknown } | null } | null;
  lines: {
    has_more: boolean;
    data: Array<{
      quantity: number | null;
      amount: number;
      currency: string;
      period: { start: number; end: number };
      pricing?: { price_details?: { price?: unknown } | null } | null;
      parent?: {
        subscription_item_details?: {
          subscription?: unknown;
          proration?: boolean;
        } | null;
      } | null;
    }>;
  };
};
const objectId = (value: unknown): unknown =>
  value && typeof value === "object" && "id" in value ? value.id : value;

export function paidCandidateWindow(
  policy: CreditPolicy,
  sub: Subscription,
  invoice: Invoice,
  context: { now: number; customerId: string },
) {
  if (!policy.candidate) throw Error("CANDIDATE_POLICY_REQUIRED");
  const item = sub.items.data[0],
    line = invoice.lines?.data[0];
  const { now, customerId } = context;
  const plan = candidate.plans.find(
    (p) => p.interval === providerInterval[policy.interval],
  )!;
  if (
    !Number.isSafeInteger(now) ||
    sub.livemode !== policy.liveMode ||
    sub.items.data.length !== 1 ||
    item.quantity !== 1 ||
    item.price.id !== policy.priceId ||
    !/^cus_[A-Za-z0-9_]+$/.test(String(objectId(sub.customer))) ||
    objectId(sub.customer) !== customerId ||
    !/^in_[A-Za-z0-9_]+$/.test(invoice.id) ||
    objectId(invoice.customer) !== objectId(sub.customer) ||
    objectId(invoice.parent?.subscription_details?.subscription) !== sub.id ||
    invoice.livemode !== sub.livemode ||
    invoice.status !== "paid" ||
    invoice.currency !== "eur" ||
    invoice.amount_paid !== plan.amountCents ||
    invoice.amount_remaining !== 0 ||
    invoice.lines.has_more ||
    invoice.lines.data.length !== 1 ||
    !line ||
    line.quantity !== 1 ||
    line.amount !== plan.amountCents ||
    line.currency !== "eur" ||
    line.parent?.subscription_item_details?.proration !== false ||
    objectId(line.parent.subscription_item_details.subscription) !== sub.id ||
    objectId(line.pricing?.price_details?.price) !== policy.priceId ||
    line.period.start !== item.current_period_start ||
    line.period.end !== item.current_period_end
  )
    throw Error("INVALID_PAID_CREDIT_EVIDENCE");
  const windows = candidateGrantWindows({
    interval: providerInterval[policy.interval],
    anchorUTC: item.current_period_start * 1000,
    periodEndUTC: item.current_period_end * 1000,
    personId: "provider-bound-person",
    subscriptionId: sub.id,
  });
  const current = windows.find((w) => w.startUTC <= now && now < w.endUTC);
  return current ? { start: current.startUTC, end: current.endUTC } : null;
}
