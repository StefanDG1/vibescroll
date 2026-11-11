import { expect, it } from "vitest";
import {
  billingRecovery,
  confirmedProcessingRejection,
  processingRecovery,
  productReadError,
} from "../apps/starter/lib/processing-recovery";

it("distinguishes personal-credit rejection from provider/maximum budget and preserves uncertain dispatch", () => {
  const rejected = (code: string) => ({ code, outcome: "rejected" });
  expect(
    processingRecovery(rejected("INSUFFICIENT_CREDITS"), "start"),
  ).toMatchObject({ action: "billing", confirmedRejection: true });
  expect(
    processingRecovery(rejected("BUDGET_EXCEEDED"), "start"),
  ).toMatchObject({ action: "refresh_quote", confirmedRejection: true });
  for (const error of [
    new Error("Network lost"),
    rejected("UNCLASSIFIED"),
    rejected("PUBLICATION_UNKNOWN"),
    rejected("COST_RECONCILIATION_REQUIRED"),
    { code: "INSUFFICIENT_CREDITS" },
  ]) {
    expect(confirmedProcessingRejection(error)).toBe(false);
    expect(processingRecovery(error, "start")).toMatchObject({
      action: "refresh_status",
      confirmedRejection: false,
    });
  }
  expect(
    processingRecovery(rejected("QUOTE_CHANGED"), "start").confirmedRejection,
  ).toBe(true);
});

it("keeps quote reads safe to refresh without exposing upstream messages", () => {
  const error = productReadError(
    { code: "INSUFFICIENT_CREDITS", error: "PRIVATE upstream diagnostic" },
    400,
  );
  expect(processingRecovery(error, "quote").action).toBe("billing");
  expect(error.message).not.toContain("PRIVATE");
  expect(productReadError({}, 401).code).toBe("AUTH_REQUIRED");
  expect(processingRecovery(new Error("PRIVATE body"), "quote")).toMatchObject({
    action: "refresh_quote",
    confirmedRejection: false,
  });
});

it("treats checkout return as unverified and blocks a second open checkout", () => {
  expect(
    billingRecovery(
      { billing: null, wallet: null, pools: [], checkoutReturned: true },
      1000,
    ),
  ).toMatchObject({ state: "checkout_returned" });
  expect(
    billingRecovery(
      {
        billing: {
          status: "free",
          periodEnd: 0,
          checkoutKey: "existing",
          checkoutExpires: 2000,
        },
        pools: [],
        checkoutReturned: false,
      },
      1000,
    ),
  ).toMatchObject({ state: "checkout_open" });
});

it("separates incomplete payment, active-provider/waiting-wallet and a matching recorded paid period", () => {
  const billing = {
    subscriptionId: "sub_current",
    status: "active",
    periodEnd: 5000,
  };
  const wallet = { tier: "pro", periodEnd: 3000 };
  const pool = {
    kind: "included",
    key: "sub_current:500",
    expiresAt: 3000,
    granted: 300,
  };
  const base = { billing, wallet, pools: [pool], checkoutReturned: true };
  expect(
    billingRecovery(
      { ...base, billing: { ...billing, status: "incomplete" } },
      1000,
    ),
  ).toMatchObject({ state: "awaiting_payment" });
  expect(
    billingRecovery(
      { ...base, pools: [{ ...pool, key: "sub_old:500" }] },
      1000,
    ),
  ).toMatchObject({ state: "awaiting_wallet" });
  expect(
    billingRecovery({ ...base, pools: [{ ...pool, revoked: 300 }] }, 1000),
  ).toMatchObject({ state: "awaiting_wallet" });
  expect(billingRecovery(base, 1000)).toBeNull();
  expect(
    billingRecovery(
      { ...base, billing: { ...billing, status: "past_due" } },
      1000,
    ),
  ).toMatchObject({ state: "payment_due" });
});
