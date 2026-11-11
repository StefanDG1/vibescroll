import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { paidProcessingConfiguration } from "../packages/contracts/paid-processing";
import {
  paidProcessingCapacity,
  reservePaidProcessing,
} from "../convex/lib/paidProcessing";

afterEach(() => vi.unstubAllEnvs());
export function fundedPolicy(maximumJobs = 10) {
  return {
    version: "paid-processing-prefunded-v1",
    id: "paid-test-prefunding",
    enabled: true,
    verifiedAt: Date.now() - 1000,
    expiresAt: Date.now() + 86400000,
    maximumJobs,
    maximumJobNanoUsd: 50000000,
    verifiedProviderCreditNanoUsd: 1000000000,
    providerKeyBudgetNanoUsd: 1000000000,
    priorExposureNanoUsd: 500000000,
  };
}
it("requires an unexpired credit-backed envelope including prior exposures and the key cap", () => {
  const p = fundedPolicy();
  const env = { PAID_PROCESSING_CONFIGURATION_JSON: JSON.stringify(p) };
  expect(paidProcessingConfiguration(env)?.maximumJobs).toBe(10);
  for (const patch of [
    { maximumJobs: 11 },
    { providerKeyBudgetNanoUsd: 999999999 },
    { expiresAt: Date.now() - 1 },
    { verifiedAt: Date.now() + 10000 },
    { priorExposureNanoUsd: 500000001 },
    { expiresAt: Date.now() + 31 * 86400000 },
  ])
    expect(
      paidProcessingConfiguration({
        PAID_PROCESSING_CONFIGURATION_JSON: JSON.stringify({ ...p, ...patch }),
      }),
    ).toBeNull();
  expect(
    paidProcessingConfiguration({ ...env, RESTORE_LOCK: "true" }),
  ).toBeNull();
  expect(
    paidProcessingConfiguration({ ...env, DISABLE_INFERENCE: "true" }),
  ).toBeNull();
});
it("shares atomic capacity between accounts without resetting owner or unknown holds", async () => {
  vi.stubEnv(
    "PAID_PROCESSING_CONFIGURATION_JSON",
    JSON.stringify(fundedPolicy(1)),
  );
  vi.stubEnv("VERCEL_AI_GATEWAY_API_KEY", "synthetic-provider-key");
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({
      version: "prepared-service-v1",
      enabled: true,
      contributorAllowed: true,
      providerPermissionReference: "test media",
    }),
  );
  vi.stubEnv(
    "PROPOSAL_SERVICE_CONFIGURATION_JSON",
    JSON.stringify({
      version: "proposal-service-v1",
      enabled: true,
      privateProjectContextAllowed: true,
      permissionReference: "test plans",
    }),
  );
  const t = convexTest(schema, import.meta.glob("../convex/**/*.ts"));
  await t.run((ctx) =>
    ctx.db.insert("proposalServiceCounters", {
      policyId: "owner-original",
      jobs: 11,
    }),
  );
  const results = await Promise.allSettled([
    t.run(reservePaidProcessing),
    t.run(reservePaidProcessing),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await t.run(paidProcessingCapacity))?.available).toBe(false);
  expect(
    await t.run((ctx) => ctx.db.query("proposalServiceCounters").collect()),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ policyId: "owner-original", jobs: 11 }),
      expect.objectContaining({
        policyId: "paid-funding:paid-test-prefunding",
        jobs: 1,
      }),
    ]),
  );
});
