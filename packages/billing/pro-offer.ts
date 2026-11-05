import candidate from "../../contracts/pro-pricing-candidate.json";

const plan = (interval: "week" | "month" | "year") => {
  const value = candidate.plans.find((p) => p.interval === interval);
  if (!value) throw Error("INVALID_PRO_OFFER");
  return value;
};

// New-sale presentation only. Legacy settlement keeps contracts/pricing.json.
export const proOffer = {
  version: candidate.version,
  currency: candidate.currency,
  weekly: {
    amountCents: plan("week").amountCents,
    credits: plan("week").credits,
  },
  monthly: {
    amountCents: plan("month").amountCents,
    credits: plan("month").credits,
  },
  annual: {
    amountCents: plan("year").amountCents,
    credits: plan("year").credits,
  },
  repositoryQuota: null,
  hostedFreeTier: false,
} as const;
