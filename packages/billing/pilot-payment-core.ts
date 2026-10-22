// Call only after the verified provider event and current ledger state have
// committed. No browser/checkout-redirect assertion is payment evidence.
export type SettledPilotPayment = {
  verifiedProviderEvent: boolean;
  settlement: "settled" | "pending" | "failed" | "refunded";
  mode: "test" | "live";
  purchaseKind: "monthly_subscription" | "founding_pass" | "topup";
  paymentKey: string;
  analyticsConsented: boolean;
  cohortEligible: boolean;
};
export async function recordPilotPayment(
  evidence: SettledPilotPayment,
  recordOnce: (
    key: string,
    observation: {
      event: "payment_verified";
      properties: {
        schema_version: "1";
        mode: "test" | "live";
        purchase_kind: SettledPilotPayment["purchaseKind"];
      };
    },
  ) => Promise<boolean>,
) {
  if (
    !evidence.verifiedProviderEvent ||
    !evidence.analyticsConsented ||
    !evidence.cohortEligible ||
    evidence.settlement !== "settled" ||
    !["test", "live"].includes(evidence.mode) ||
    !["monthly_subscription", "founding_pass", "topup"].includes(
      evidence.purchaseKind,
    ) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,199}$/.test(evidence.paymentKey)
  )
    return false;
  // The server-owned callback must atomically persist key+observation in an
  // existing idempotency/outbox transaction. No network call is made here.
  return recordOnce(`pilot-payment:${evidence.mode}:${evidence.paymentKey}`, {
    event: "payment_verified",
    properties: {
      schema_version: "1",
      mode: evidence.mode,
      purchase_kind: evidence.purchaseKind,
    },
  });
}
