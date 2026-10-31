import { expect, it } from "vitest";
import {
  candidateGrantWindows,
  previewLegacyDisposition,
  proCandidateVersion,
  verifyCandidateSandboxPrices,
} from "../packages/billing/pro-migration-preview";
const identity = {
  personId: "synthetic-person",
  subscriptionId: "sub_synthetic",
};
it("grants annual credits monthly from the original UTC anniversary without month-end drift", () => {
  const grants = candidateGrantWindows({
    ...identity,
    interval: "year",
    anchorUTC: Date.UTC(2028, 0, 31, 12, 34, 56),
  });
  expect(grants).toHaveLength(12);
  expect(
    grants.every(
      (g) =>
        g.credits === 300 && g.poolScope === "one_person_across_workspaces",
    ),
  ).toBe(true);
  expect(grants[0].endUTC).toBe(Date.UTC(2028, 1, 29, 12, 34, 56));
  expect(grants[1].endUTC).toBe(Date.UTC(2028, 2, 31, 12, 34, 56));
  expect(grants[11].endUTC).toBe(Date.UTC(2029, 0, 31, 12, 34, 56));
  expect(new Set(grants.map((g) => g.key)).size).toBe(12);
  expect(
    candidateGrantWindows({
      ...identity,
      interval: "year",
      anchorUTC: grants[0].startUTC,
    }),
  ).toEqual(grants);
});
it("gives weekly 75 credits for exactly seven days, including a daylight-saving boundary", () => {
  const anchorUTC = Date.UTC(2026, 9, 24, 12);
  const [grant] = candidateGrantWindows({
    ...identity,
    interval: "week",
    anchorUTC,
  });
  expect(grant).toMatchObject({
    credits: 75,
    startUTC: anchorUTC,
    endUTC: anchorUTC + 7 * 86400000,
    expiryRule: "expire_unused_allowance_keep_reserved_holds",
  });
  expect(
    candidateGrantWindows({ ...identity, interval: "month", anchorUTC })[0]
      .credits,
  ).toBe(300);
  expect(() =>
    candidateGrantWindows({
      ...identity,
      interval: "__proto__" as any,
      anchorUTC,
    }),
  ).toThrow();
});
it("verifies isolated sandbox prices and refuses live, changed-tax, duplicate or wrong-interval mappings", () => {
  const prices = (
    [
      ["week", 1700],
      ["month", 3500],
      ["year", 35000],
    ] as const
  ).map(([interval, unit_amount]) => ({
    id: `price_${interval}`,
    active: true,
    livemode: false,
    currency: "eur",
    unit_amount,
    tax_behavior: "inclusive",
    recurring: { interval, interval_count: 1 },
    metadata: {
        product: "vibescroller",
      policy: proCandidateVersion,
      tier: "pro",
    },
  }));
  expect(verifyCandidateSandboxPrices(prices).map((p) => p.credits)).toEqual([
    75, 300, 300,
  ]);
  for (const update of [
    { livemode: true },
    { unit_amount: 3501 },
    { tax_behavior: "exclusive" },
    { recurring: { interval: "month", interval_count: 12 } },
  ]) {
    const changed = structuredClone(prices);
    Object.assign(changed[0], update);
    expect(() => verifyCandidateSandboxPrices(changed)).toThrow();
  }
  expect(() =>
    verifyCandidateSandboxPrices([prices[0], prices[0], prices[2]]),
  ).toThrow();
});
it("keeps legacy terms, purchased units and unknown reservations unless an exact voluntary change is reviewed", () => {
  const old = {
    existingSubscription: true,
    purchasedCredits: 550,
    reservedCredits: 10,
    explicitCustomerOptIn: false,
    exactPriceMappingReviewed: true,
  };
  expect(previewLegacyDisposition(old)).toMatchObject({
    action: "keep_legacy_terms",
    purchasedCreditsUnchanged: 550,
    reservedCreditsUnchanged: 10,
    automaticCharge: false,
    liveActivationAllowed: false,
  });
  expect(
    previewLegacyDisposition({ ...old, explicitCustomerOptIn: true }),
  ).toMatchObject({
    action: "review_change_at_renewal",
    automaticCustomerMigration: false,
    liveActivationAllowed: false,
  });
});
