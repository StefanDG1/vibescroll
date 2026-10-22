import { expect, it } from "vitest";
import {
  foundingPassDraft,
  foundingPassAvailability,
  foundingPassPeriod,
  type FoundingPassDraft,
  type FoundingPass,
} from "../packages/billing/founding-pass";
const now = Date.UTC(2026, 9, 22);
function reviewed(): FoundingPassDraft {
  return {
    enabled: true,
    price: { currency: "EUR", cents: 12345, version: "synthetic-price-1" },
    monthlyCredits: 250,
    overage: "stop_until_separately_quoted",
    approval: {
      reference: "synthetic-review",
      termsVersion: "synthetic-terms",
      priceVersion: "synthetic-price-1",
      priceCents: 12345,
      monthlyCredits: 250,
      pilotReference: "synthetic-pilot",
      approvedAt: now - 1000,
      reviewExpiresAt: now + 1000,
    },
    pilot: {
      reference: "synthetic-pilot",
      source: "observed_pilot",
      observedAt: now - 2000,
      participants: 10,
      processingUsdMicros: 123,
      storageUsdMicros: 456,
      supportMinutes: 25,
    },
  };
}
const pass: FoundingPass = {
  purchaseId: "synthetic-purchase",
  startsAt: Date.UTC(2024, 1, 29, 13, 25),
  monthlyCredits: 250,
  priceVersion: "synthetic-price-1",
  termsVersion: "synthetic-terms",
  status: "active",
};
it("leaves the real offer disabled and requires current exact-price/allowance/terms and observed pilot costs", () => {
  expect(
    foundingPassAvailability(foundingPassDraft, now).preparedForReview,
  ).toBe(false);
  expect(foundingPassAvailability(reviewed(), now)).toMatchObject({
    preparedForReview: true,
    monthlyPeriods: 36,
    automaticRenewal: false,
  });
  for (const change of [
    { enabled: false },
    { price: null },
    { monthlyCredits: null },
    { pilot: null },
    { approval: null },
    { monthlyCredits: 251 },
    {
      price: {
        currency: "EUR" as const,
        cents: 999,
        version: "synthetic-price-1",
      },
    },
    { approval: { ...reviewed().approval!, reviewExpiresAt: now } },
    { pilot: { ...reviewed().pilot!, source: "fixture" as any } },
    { pilot: { ...reviewed().pilot!, observedAt: now + 1 } },
  ])
    expect(
      foundingPassAvailability({ ...reviewed(), ...change }, now)
        .preparedForReview,
    ).toBe(false);
});
it("uses exactly three UTC calendar years with clamped leap days and no implicit renewal", () => {
  expect(foundingPassPeriod(pass, pass.startsAt).endsAt).toBe(
    Date.UTC(2027, 1, 28, 13, 25),
  );
  expect(foundingPassPeriod(pass, Date.UTC(2027, 1, 28, 13, 25))).toMatchObject(
    { active: false, period: null },
  );
  const endOfMonth = { ...pass, startsAt: Date.UTC(2026, 0, 31) };
  expect(
    foundingPassPeriod(endOfMonth, Date.UTC(2026, 1, 28)).period,
  ).toMatchObject({
    index: 1,
    startsAt: Date.UTC(2026, 1, 28),
    endsAt: Date.UTC(2026, 2, 31),
  });
  expect(
    foundingPassPeriod(endOfMonth, Date.UTC(2026, 2, 31)).period?.index,
  ).toBe(2);
});
it("keeps replay keys stable, preserves the purchased term on cancellation request and fences settled refunds/revocation", () => {
  const a = foundingPassPeriod(pass, now);
  expect(foundingPassPeriod(pass, now + 1).period?.grantKey).toBe(
    a.period?.grantKey,
  );
  expect(
    foundingPassPeriod({ ...pass, cancellationRequestedAt: now }, now),
  ).toEqual(a);
  expect(
    foundingPassPeriod({ ...pass, status: "refund_pending" }, now).active,
  ).toBe(true);
  expect(foundingPassPeriod({ ...pass, status: "refunded" }, now).active).toBe(
    false,
  );
  expect(foundingPassPeriod({ ...pass, status: "revoked" }, now).active).toBe(
    false,
  );
  expect(foundingPassPeriod(pass, pass.startsAt - 1).active).toBe(false);
  expect(() =>
    foundingPassPeriod({ ...pass, startsAt: Number.MAX_SAFE_INTEGER }, now),
  ).toThrow("FOUNDING_PASS_INVALID");
});
