// @vitest-environment node
import { expect, it, vi } from "vitest";
import {
  createJourneyMeasurements,
  safeAnalyticsEvent,
  productAnalyticsEvent,
} from "../apps/starter/lib/analytics-events";
vi.mock("server-only", () => ({}));
import {
  recordPilotPayment,
  type SettledPilotPayment,
} from "../packages/billing/pilot-payment";
it("counts repeated cited results and plan decisions once per private revision without sending identity or content", () => {
  const emit = vi.fn(() => true);
  const measurements = createJourneyMeasurements(emit);
  expect(
    measurements.ready(
      "private-source:generation-1",
      "personal_chatgpt",
      "audio_only",
    ),
  ).toBe(true);
  expect(
    measurements.ready(
      "private-source:generation-1",
      "personal_chatgpt",
      "audio_only",
    ),
  ).toBe(false);
  measurements.citation(
    "private-source:revision:evidence",
    "transcript",
    "audio_only",
  );
  measurements.citation(
    "private-source:revision:evidence",
    "transcript",
    "audio_only",
  );
  measurements.decision("private-project:revision", "already_implemented");
  measurements.planRetained("private-project:plan-hash");
  measurements.planRetained("private-project:plan-hash");
  measurements.planExported("private-project:plan-hash", "json");
  expect(emit).toHaveBeenCalledTimes(5);
  expect(JSON.stringify(emit.mock.calls)).not.toContain("private-");
  expect(
    measurements.ready(
      "private-source:generation-2",
      "personal_chatgpt",
      "full_sampled",
    ),
  ).toBe(true);
  expect(measurements.decision("invalid", "secret text")).toBe(false);
});
it("does not record denied-consent attempts and bounds identity memory without evicting/recounting old work", () => {
  const emit = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
  const measurements = createJourneyMeasurements(emit, 2);
  expect(measurements.planRetained("a")).toBe(false);
  expect(measurements.planRetained("a")).toBe(true);
  expect(measurements.planExported("a", "json")).toBe(true);
  expect(measurements.planRetained("b")).toBe(false);
  measurements.clear();
  expect(
    measurements.returned("new-authorized-session", "library", "later_day"),
  ).toBe(true);
  expect(() => createJourneyMeasurements(emit, 1001)).toThrow();
});
it("drops URLs, source text and browser purchase assertions from the closed client vocabulary", () => {
  expect(
    safeAnalyticsEvent("citation_inspected", {
      kind: "frame",
      coverage: "full_sampled",
      url: "https://private.invalid",
      sourceText: "private",
    })?.properties,
  ).toEqual({ schema_version: "1", kind: "frame", coverage: "full_sampled" });
  expect(safeAnalyticsEvent("payment_verified", { settled: true })).toBeNull();
  expect(
    safeAnalyticsEvent("purchase_completed", { settled: true }),
  ).toBeNull();
  expect(
    productAnalyticsEvent("checkoutCompleted", { paid: true }, { paid: true }),
  ).toBeNull();
});
it("requires settled verified and consented cohort payment evidence and delegates replay-safe recording to the server ledger", async () => {
  const evidence: SettledPilotPayment = {
    verifiedProviderEvent: true,
    settlement: "settled",
    mode: "test",
    purchaseKind: "monthly_subscription",
    paymentKey: "invoice_synthetic",
    analyticsConsented: true,
    cohortEligible: true,
  };
  const recorded = new Map<string, unknown>();
  const record = vi.fn(async (key, observation) => {
    if (recorded.has(key)) return false;
    recorded.set(key, observation);
    return true;
  });
  for (const change of [
    { verifiedProviderEvent: false },
    { settlement: "pending" as const },
    { settlement: "failed" as const },
    { settlement: "refunded" as const },
    { analyticsConsented: false },
    { cohortEligible: false },
  ])
    expect(await recordPilotPayment({ ...evidence, ...change }, record)).toBe(
      false,
    );
  expect(record).not.toHaveBeenCalled();
  expect(await recordPilotPayment(evidence, record)).toBe(true);
  expect(await recordPilotPayment(evidence, record)).toBe(false);
  expect(await recordPilotPayment({ ...evidence, mode: "live" }, record)).toBe(
    true,
  );
  expect(recorded.size).toBe(2);
  const observations = JSON.stringify([...recorded.values()]);
  expect(observations).not.toContain("invoice_synthetic");
  expect(observations).toContain('"mode":"test"');
  expect(observations).toContain('"mode":"live"');
});
