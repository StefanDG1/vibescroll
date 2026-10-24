import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// Calculation functions are pure. The CLI reads the dated assumptions and
// writes JSON to stdout only; it never edits the current finance model.
function finite(value, name, { positive = false } = {}) {
  if (!Number.isFinite(value) || value < 0 || (positive && value === 0))
    throw Error(`Invalid ${name}`);
  return value;
}
export function unitEconomics({ priceEUR, interval, monthlyCredits, inputs }) {
  if (!["monthly", "annual"].includes(interval))
    throw Error("Unsupported interval");
  finite(priceEUR, "price", { positive: true });
  if (!Number.isSafeInteger(monthlyCredits) || monthlyCredits < 0)
    throw Error("Invalid credit quantity");
  for (const key of [
    "refundRate",
    "cardRate",
    "billingRate",
    "managedPaymentsRate",
    "separateTaxFeeRate",
    "fxReserveRate",
    "disputeProbabilityPerPayment",
    "consumerVATRate",
    "targetOperatingMargin",
  ]) {
    if (finite(inputs[key], key) > 1) throw Error(`Invalid fraction ${key}`);
  }
  for (const key of [
    "fixedPaymentRON",
    "advancedScreeningRON",
    "screenedAttemptsPerPayment",
    "disputeFeeEUR",
    "serviceEURPerUserMonth",
    "fixedEURPerMonth",
    "eurPerCredit",
  ])
    finite(inputs[key], key);
  finite(inputs.ronPerEUR, "RON/EUR", { positive: true });
  const paymentsPerMonth = interval === "annual" ? 1 / 12 : 1;
  const grossEURPerMonth = priceEUR * paymentsPerMonth;
  const netRevenueEURPerMonth =
    (grossEURPerMonth * (1 - inputs.refundRate)) / (1 + inputs.consumerVATRate);
  const percentageFeesEUR =
    grossEURPerMonth *
    (inputs.cardRate +
      inputs.billingRate +
      inputs.managedPaymentsRate +
      inputs.separateTaxFeeRate);
  const fixedFeesEUR =
    (paymentsPerMonth *
      (inputs.fixedPaymentRON +
        inputs.advancedScreeningRON * inputs.screenedAttemptsPerPayment)) /
    inputs.ronPerEUR;
  const fxReserveEUR = grossEURPerMonth * inputs.fxReserveRate;
  const disputeReserveEUR =
    paymentsPerMonth *
    inputs.disputeProbabilityPerPayment *
    inputs.disputeFeeEUR;
  const nonCreditEUR =
    percentageFeesEUR +
    fixedFeesEUR +
    fxReserveEUR +
    disputeReserveEUR +
    inputs.serviceEURPerUserMonth;
  const fullConsumptionEUR = monthlyCredits * inputs.eurPerCredit;
  const contributionEUR =
    netRevenueEURPerMonth - nonCreditEUR - fullConsumptionEUR;
  const targetHeadroomEURBeforeFixed =
    netRevenueEURPerMonth * (1 - inputs.targetOperatingMargin) -
    nonCreditEUR -
    fullConsumptionEUR;
  return {
    interval,
    priceEUR,
    monthlyCredits,
    annualCreditsIfTwelvePeriods: monthlyCredits * 12,
    paymentsPerMonth,
    grossEURPerMonth,
    netRevenueEURPerMonth,
    percentageFeesEUR,
    fixedFeesEUR,
    fxReserveEUR,
    disputeReserveEUR,
    serviceEURPerUserMonth: inputs.serviceEURPerUserMonth,
    nonCreditEUR,
    fullConsumptionEUR,
    contributionEUR,
    marginBeforeFixed: netRevenueEURPerMonth
      ? contributionEUR / netRevenueEURPerMonth
      : null,
    targetHeadroomEURBeforeFixed,
    minimumUsersForTarget:
      targetHeadroomEURBeforeFixed > 0
        ? Math.max(
            1,
            Math.ceil(inputs.fixedEURPerMonth / targetHeadroomEURBeforeFixed),
          )
        : null,
  };
}
export function atScale(
  unit,
  activeUsers,
  inputs,
  cancelledCohortMonthlyEUR = 0,
) {
  if (!Number.isSafeInteger(activeUsers) || activeUsers < 0)
    throw Error("Invalid customer count");
  finite(cancelledCohortMonthlyEUR, "cancelled cohort cost");
  const revenueEUR = unit.netRevenueEURPerMonth * activeUsers;
  const costEUR =
    (unit.nonCreditEUR + unit.fullConsumptionEUR) * activeUsers +
    inputs.fixedEURPerMonth +
    cancelledCohortMonthlyEUR;
  const room = activeUsers
    ? unit.netRevenueEURPerMonth * (1 - inputs.targetOperatingMargin) -
      unit.nonCreditEUR -
      (inputs.fixedEURPerMonth + cancelledCohortMonthlyEUR) / activeUsers
    : null;
  return {
    activeUsers,
    revenueEUR,
    costEUR,
    profitEUR: revenueEUR - costEUR,
    margin: revenueEUR ? (revenueEUR - costEUR) / revenueEUR : null,
    conditionalMaximumCreditsForTarget:
      room !== null && room >= 0 && inputs.eurPerCredit > 0
        ? Math.floor(room / inputs.eurPerCredit)
        : null,
    targetAttainableWithoutCredits: room !== null && room >= 0,
  };
}
export function retentionStorage({ customers, databaseGBEach, months, rate }) {
  if (
    !Number.isSafeInteger(customers) ||
    customers < 0 ||
    !Number.isSafeInteger(months) ||
    months < 1
  )
    throw Error("Invalid cohort/horizon");
  finite(databaseGBEach, "database GB");
  for (const key of [
    "usdPerGBMonth",
    "nonUSMultiplier",
    "eurPerUSDScenario",
    "unrecoverableSupplierTaxScenario",
  ])
    finite(rate[key], key);
  const eurPerGBMonth =
    rate.usdPerGBMonth *
    rate.nonUSMultiplier *
    rate.eurPerUSDScenario *
    (1 + rate.unrecoverableSupplierTaxScenario);
  const monthlyEUR = customers * databaseGBEach * eurPerGBMonth;
  return {
    customers,
    databaseGBEach,
    months,
    eurPerGBMonth,
    monthlyEUR,
    totalEUR: monthlyEUR * months,
    newSalesRevenueEUR: 0,
    completeness:
      "database-storage-only; requests, R2, indexes, backups, export, deletion and support unpriced",
  };
}
export function calculateOfferScenarios(data) {
  if (
    data.futureProposal.monthlyAllowanceCredits !== null ||
    data.status !== "review_only_quantity_blocked"
  )
    throw Error("Review calculator cannot approve an allowance");
  const creditQuantity = data.creditCost.counterfactualMonthlyCredits;
  const offers = [
    {
      id: "current_monthly_legacy600",
      priceEUR: data.currentRepositoryContract.proMonthlyEUR,
      interval: "monthly",
    },
    {
      id: "current_annual_legacy600",
      priceEUR: data.currentRepositoryContract.proAnnualEUR,
      interval: "annual",
    },
    {
      id: "future_monthly_counterfactual600",
      priceEUR: data.futureProposal.proMonthlyEUR,
      interval: "monthly",
    },
    {
      id: "future_annual_counterfactual600",
      priceEUR: data.futureProposal.proAnnualEUR,
      interval: "annual",
    },
  ];
  const scenarios = data.profiles.flatMap((profile) => {
    const inputs = {
      ...data.savedInputs,
      eurPerCredit: data.creditCost.eurPerCredit,
      ...profile.overrides,
    };
    return offers.map((offer) => {
      const unit = unitEconomics({
        ...offer,
        monthlyCredits: creditQuantity,
        inputs,
      });
      return {
        profile: profile.id,
        offer: offer.id,
        ...unit,
        scales: data.activeCustomerCounts.map((n) => atScale(unit, n, inputs)),
      };
    });
  });
  const r = data.retention;
  const snapshotGB =
    (r.maximumServiceSnapshotBytes * r.maximumProSourceRecords) / 1e9;
  const retention = r.cancelledCustomerCounts.flatMap((customers) =>
    [...r.databaseGBPerCancelledCustomerCases, snapshotGB].flatMap(
      (databaseGBEach) =>
        r.horizonsMonths.map((months) =>
          retentionStorage({
            customers,
            databaseGBEach,
            months,
            rate: r.savedDatabaseRate,
          }),
        ),
    ),
  );
  const base = {
    ...data.savedInputs,
    eurPerCredit: data.creditCost.eurPerCredit,
  };
  const annual = unitEconomics({
    priceEUR: data.futureProposal.proAnnualEUR,
    interval: "annual",
    monthlyCredits: creditQuantity,
    inputs: base,
  });
  const cancelled100 = retentionStorage({
    customers: 100,
    databaseGBEach: 1,
    months: 12,
    rate: r.savedDatabaseRate,
  });
  const refundStress = offers
    .filter((o) => o.id.startsWith("future_"))
    .map((offer) => {
      const transaction = unitEconomics({
        priceEUR: offer.priceEUR,
        interval: "monthly",
        monthlyCredits: creditQuantity,
        inputs: { ...base, refundRate: 1 },
      });
      return {
        offer: offer.id,
        revenueAfterFullRefundEUR: 0,
        firstMonthCreditsConsumed: creditQuantity,
        conservativeUnrecoveredCostEUR:
          transaction.nonCreditEUR + transaction.fullConsumptionEUR,
        scope:
          "Full voluntary/eligible refund after consuming one monthly grant; keep quoted transaction fees/FX and one full service month as a stress reserve, not a provider refund-fee attestation",
      };
    });
  const fullyConsumedThenCancelled = offers
    .filter((o) => o.id.startsWith("future_"))
    .flatMap((offer) => {
      const unit = unitEconomics({
        ...offer,
        monthlyCredits: creditQuantity,
        inputs: base,
      });
      const paidMonths = offer.interval === "annual" ? 12 : 1;
      return r.cancelledCustomerCounts.flatMap((customers) =>
        r.databaseGBPerCancelledCustomerCases.flatMap((databaseGBEach) =>
          r.horizonsMonths.map((months) => {
            const retained = retentionStorage({
              customers,
              databaseGBEach,
              months,
              rate: r.savedDatabaseRate,
            });
            const netRevenueDuringPaidPeriodEUR =
              unit.netRevenueEURPerMonth * paidMonths * customers;
            const costDuringPaidPeriodEUR =
              (unit.nonCreditEUR + unit.fullConsumptionEUR) *
              paidMonths *
              customers;
            return {
              offer: offer.id,
              customers,
              paidMonths,
              creditsFullyConsumedPerCustomer: creditQuantity * paidMonths,
              retentionMonthsAfterPaidPeriod: months,
              databaseGBEach,
              netRevenueDuringPaidPeriodEUR,
              costDuringPaidPeriodEUR,
              databaseStorageAfterCancellationEUR: retained.totalEUR,
              contributionAfterPartialRetentionEUR:
                netRevenueDuringPaidPeriodEUR -
                costDuringPaidPeriodEUR -
                retained.totalEUR,
              newSalesAfterCancellationEUR: 0,
              completeness:
                "Excludes company fixed costs and all unpriced retained operations; not a funded lifetime margin",
            };
          }),
        ),
      );
    });
  return {
    status: data.status,
    quantitySelected: null,
    lifetime: "deferred",
    assumptionsDate: data.savedInputs.asOf,
    fullConsumptionComparisonCredits: creditQuantity,
    scenarios,
    retention,
    snapshotSizingGBEach: snapshotGB,
    cancelledCohortExample: {
      cohort: cancelled100,
      annualActive30: atScale(annual, 30, base, cancelled100.monthlyEUR),
      annualActive100: atScale(annual, 100, base, cancelled100.monthlyEUR),
    },
    refundStress,
    fullyConsumedThenCancelled,
  };
}
export function checkInvariants(data) {
  const frozen = JSON.stringify(data),
    inputs = {
      ...data.savedInputs,
      eurPerCredit: data.creditCost.eurPerCredit,
    };
  const monthly = unitEconomics({
    priceEUR: 35,
    interval: "monthly",
    monthlyCredits: 600,
    inputs,
  });
  const annual = unitEconomics({
    priceEUR: 350,
    interval: "annual",
    monthlyCredits: 600,
    inputs,
  });
  assert.equal(annual.paymentsPerMonth * 12, 1);
  assert.equal(annual.annualCreditsIfTwelvePeriods, 7200);
  assert.equal(annual.fullConsumptionEUR, monthly.fullConsumptionEUR);
  assert.ok(annual.netRevenueEURPerMonth < monthly.netRevenueEURPerMonth);
  const feesAfterRefund = unitEconomics({
    priceEUR: 35,
    interval: "monthly",
    monthlyCredits: 600,
    inputs: { ...inputs, refundRate: 1 },
  });
  assert.equal(feesAfterRefund.netRevenueEURPerMonth, 0);
  assert.equal(feesAfterRefund.percentageFeesEUR, monthly.percentageFeesEUR);
  assert.equal(atScale(annual, 0, inputs).profitEUR, -inputs.fixedEURPerMonth);
  assert.equal(
    atScale(annual, 0, inputs).conditionalMaximumCreditsForTarget,
    null,
  );
  const one = retentionStorage({
    customers: 100,
    databaseGBEach: 1,
    months: 1,
    rate: data.retention.savedDatabaseRate,
  });
  const twelve = retentionStorage({
    customers: 100,
    databaseGBEach: 1,
    months: 12,
    rate: data.retention.savedDatabaseRate,
  });
  assert.equal(twelve.totalEUR, one.totalEUR * 12);
  assert.equal(twelve.newSalesRevenueEUR, 0);
  assert.ok(
    atScale(annual, 100, inputs, one.monthlyEUR)
      .conditionalMaximumCreditsForTarget <
      atScale(annual, 100, inputs).conditionalMaximumCreditsForTarget,
  );
  const result = calculateOfferScenarios(data);
  assert.equal(result.quantitySelected, null);
  assert.equal(
    result.scenarios.find(
      (s) =>
        s.profile === "saved_managed_base" &&
        s.offer === "future_annual_counterfactual600",
    ).minimumUsersForTarget,
    52,
  );
  assert.equal(JSON.stringify(data), frozen);
  assert.throws(() =>
    unitEconomics({
      priceEUR: 35,
      interval: "monthly",
      monthlyCredits: -1,
      inputs,
    }),
  );
  const churn = result.fullyConsumedThenCancelled.find(
    (c) =>
      c.offer === "future_annual_counterfactual600" &&
      c.customers === 100 &&
      c.databaseGBEach === 1 &&
      c.retentionMonthsAfterPaidPeriod === 12,
  );
  assert.equal(churn.creditsFullyConsumedPerCustomer, 7200);
  assert.equal(churn.databaseStorageAfterCancellationEUR, twelve.totalEUR);
  return { checks: 17, passed: true, hostedCalls: 0, filesWritten: 0 };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const data = JSON.parse(
    readFileSync(
      new URL("./pro-offer-20261024-assumptions.json", import.meta.url),
      "utf8",
    ),
  );
  if (process.argv[2] === "--check")
    console.log(JSON.stringify(checkInvariants(data)));
  else if (process.argv.length === 2)
    console.log(JSON.stringify(calculateOfferScenarios(data), null, 2));
  else
    throw Error(
      "Use no arguments for scenarios or --check for invariant checks; no output file is written.",
    );
}
