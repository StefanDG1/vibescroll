// Offline review only. No Stripe client, credentials, writes or runtime catalogue imports.
import { readFile } from "node:fs/promises";
const candidate = JSON.parse(
  await readFile(
    new URL("../contracts/pro-pricing-candidate.json", import.meta.url),
    "utf8",
  ),
);
const legacy = JSON.parse(
  await readFile(new URL("../contracts/pricing.json", import.meta.url), "utf8"),
);
if (
  candidate.status !== "review_required" ||
  candidate.currency !== "EUR" ||
  candidate.tier !== "pro" ||
  candidate.plans.length !== 3
)
  throw Error("Invalid pricing review candidate.");
const intervals = new Set();
const plans = candidate.plans.map((plan) => {
  if (
    intervals.has(plan.interval) ||
    !["week", "month", "year"].includes(plan.interval) ||
    !Number.isSafeInteger(plan.amountCents) ||
    plan.amountCents <= 0
  )
    throw Error("Invalid or duplicate candidate interval.");
  intervals.add(plan.interval);
  if (
    plan.interval === "week"
      ? plan.credits !== null || plan.grantInterval !== "week"
      : plan.credits !== 300 || plan.grantInterval !== "month"
  )
    throw Error("Allowance needs a separately reviewed candidate revision.");
  // Exact rational cents. 365.25 days/year is a comparison convention, not a billing clock.
  const numerator =
    BigInt(plan.amountCents) * (plan.interval === "week" ? 1461n : 1n);
  const denominator =
    plan.interval === "week" ? 336n : plan.interval === "year" ? 12n : 1n;
  return {
    ...plan,
    monthlyComparisonCents: {
      numerator: String(numerator),
      denominator: String(denominator),
    },
    monthlyComparisonEurDisplay: (
      Number(numerator) /
      Number(denominator) /
      100
    ).toFixed(2),
    provisioning: "not_authorized_by_this_preview",
  };
});
const monthly = candidate.plans.find((plan) => plan.interval === "month");
const annual = candidate.plans.find((plan) => plan.interval === "year");
const annualMonthlyTotal = BigInt(monthly.amountCents) * 12n;
const savings = annualMonthlyTotal - BigInt(annual.amountCents);
const gcd = (a, b) => (b === 0n ? a : gcd(b, a % b));
const divisor = gcd(savings < 0n ? -savings : savings, annualMonthlyTotal);
console.log(
  JSON.stringify(
    {
      version: candidate.version,
      status: candidate.status,
      plans,
      annualDiscountAgainstTwelveMonthlyPayments: {
        numerator: String(savings / divisor),
        denominator: String(annualMonthlyTotal / divisor),
        percentDisplay: (
          (Number(savings) / Number(annualMonthlyTotal)) *
          100
        ).toFixed(2),
      },
      legacy: {
        schemaVersion: legacy.schemaVersion,
        tiers: legacy.tiers,
        topups: legacy.topups,
        action: "preserve; no automatic conversion",
      },
      activationBlocks: candidate.activationBlocks,
    },
    null,
    2,
  ),
);
