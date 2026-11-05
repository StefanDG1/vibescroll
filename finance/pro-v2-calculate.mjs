// Planning analysis only. Does not change product prices, grants or provider settings.
import {
  defaults,
  economics,
  quantities,
  credits,
  breakEven,
  topups,
  requiredPrices,
  digitalRoot8Ceiling,
} from "./pro-v2-economics.mjs";
import assert from "node:assert/strict";

for (const [seconds, expected] of [
  [0, 1],
  [60, 1],
  [60.001, 2],
  [104, 2],
  [120, 2],
  [121, 3],
  [600, 10],
])
  assert.equal(credits(seconds), expected);

const scenarios = [];
for (const allowance of [300, 500]) {
  for (const profile of [
    "full",
    "60%",
    "104-second videos",
    "fully loaded",
    "USD pricing",
  ]) {
    const overrides =
      {
        "60%": { utilization: 60 },
        "104-second videos": { seconds: 104 },
        "fully loaded": {
          founderPay: 2000,
          marketingFixed: 100,
          cac: 80,
          support: 2,
        },
        "USD pricing": { currency: "USD" },
      }[profile] ?? {};
    const a = { ...defaults, allowance, ...overrides };
    for (const annual of [false, true]) {
      const e = economics(a, 100, annual),
        be = breakEven(a, annual);
      if (be !== null) {
        assert.ok(economics(a, be, annual).profit >= 0);
        assert.ok(economics(a, be - 1, annual).profit < 0);
      }
      assert.ok(Math.abs(e.netRevenue - e.cost - e.profit) < 1e-8);
      scenarios.push({
        profile,
        allowance,
        annual,
        assumptions: a,
        credits: quantities(a).used,
        freshJobs: quantities(a).jobs,
        netRevenuePerUser: e.rev.net,
        providerCostPerUserAtFullMeteredRates: e.fullProvider,
        contributionPerUser: e.contribution,
        contributionMargin: e.contributionMargin,
        profitAt100Users: e.profit,
        operatingMarginAt100Users: e.margin,
        breakEvenUsers: be,
        providerCostAt100Users: e.providers.rows,
      });
    }
  }
}
const premium = [];
for (const model of ["muse", "terra", "sol", "subscription"]) {
  for (const multipliers of [true, false]) {
    const a = { ...defaults, model, multipliers };
    premium.push({
      model,
      multipliers,
      creditsPerMinute: quantities(a).multiplier,
      jobs: quantities(a).jobs,
      monthly: economics(a, 100, false).margin,
      annual: economics(a, 100, true).margin,
    });
  }
}
const pack300 = topups(defaults),
  pack500 = topups({ ...defaults, allowance: 500 });
pack300.forEach((p, i) => assert.ok(Math.abs(p.cost - pack500[i].cost) < 1e-8));
assert.equal(quantities({ ...defaults, model: "terra" }).jobs, 30);
assert.ok(
  economics({ ...defaults, model: "sol", multipliers: false }, 100)
    .contribution < 0,
);
assert.equal(digitalRoot8Ceiling(105.07), 107);
assert.equal(digitalRoot8Ceiling(163.41), 170);
assert.equal(digitalRoot8Ceiling(35), 35);
const prices = [300, 500].map((allowance) => {
  const a = { ...defaults, allowance },
    p = requiredPrices(a);
  const pair = {
    ...a,
    monthlyPrice: p.pairedMonthly,
    annualPrice: p.pairedAnnual,
  };
  assert.ok(economics(pair, 100).contributionMargin >= 0.8);
  assert.ok(economics(pair, 100, true).contributionMargin >= 0.8);
  const weekly = {
    ...pair,
    weeklyPrice: p.roundedWeekly,
    weeklyCredits: p.weeklyCredits,
  };
  assert.ok(
    economics(weekly, 100, "weekly").contributionMargin >= p.weeklyMargin,
  );
  assert.equal(p.pairedMonthly % 9, 8);
  assert.equal(p.pairedAnnual % 9, 8);
  assert.equal(p.roundedWeekly % 9, 8);
  return { allowance, ...p };
});
const priceMenu = [35, 53, 71, 80, 98, 107, 170].map((price) => {
  let allowance = 0;
  for (const candidate of [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]) {
    const a = {
      ...defaults,
      monthlyPrice: price,
      annualPrice: price * 10,
      allowance: candidate,
    };
    if (
      economics(a, 100).contributionMargin >= 0.8 &&
      economics(a, 100, true).contributionMargin >= 0.8
    )
      allowance = candidate;
  }
  return { monthlyPrice: price, annualPrice: price * 10, allowance };
});
console.log(
  JSON.stringify(
    {
      asOf: "2026-10-29",
      kind: "planning_estimate_not_invoices",
      verified:
        "minute boundaries, accounting identity, integer break-even, allowance-independent top-up cost, premium exposure and rounded 80% price pair",
      defaults,
      scenarios,
      premium,
      prices,
      priceMenu,
      topups: pack300,
    },
    null,
    2,
  ),
);
