import { z } from "zod";

const prefunded = z.strictObject({
  version: z.literal("paid-processing-prefunded-v1"),
  id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  enabled: z.literal(true),
  verifiedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  maximumJobs: z.number().int().min(1).max(10000),
  maximumJobNanoUsd: z.literal(50000000),
  verifiedProviderCreditNanoUsd: z.number().int().positive().max(1000000000000),
  providerKeyBudgetNanoUsd: z.number().int().positive().max(1000000000000),
  priorExposureNanoUsd: z.number().int().nonnegative().max(1000000000000),
});

const monetary = prefunded.omit({ version: true, maximumJobs: true }).extend({
  version: z.literal("paid-processing-monetary-v2"),
  maximumJobs: z.never().optional(),
  maximumJobNanoUsd: z.number().int().positive().max(100000000),
  operatingPoolNanoUsd: z.number().int().positive().max(1000000000000),
});
export type MonetaryProcessingPolicy = z.infer<typeof monetary>;

// One slot conservatively retains a full USD0.05 envelope, even for cheaper
// plans/returned failures. Unknown requests cannot replenish this funding.
export function paidProcessingConfiguration(
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
) {
  try {
    const p = z
      .discriminatedUnion("version", [prefunded, monetary])
      .parse(JSON.parse(env.PAID_PROCESSING_CONFIGURATION_JSON ?? "null"));
    const exposure =
      (p.version === "paid-processing-prefunded-v1"
        ? p.maximumJobs * p.maximumJobNanoUsd
        : p.maximumJobNanoUsd) + p.priorExposureNanoUsd;
    return env.RESTORE_LOCK !== "true" &&
      env.DISABLE_INFERENCE !== "true" &&
      p.verifiedAt <= now &&
      p.expiresAt > now &&
      p.expiresAt - p.verifiedAt <= 30 * 86400000 &&
      exposure <=
        Math.min(
          p.verifiedProviderCreditNanoUsd,
          p.providerKeyBudgetNanoUsd,
          p.version === "paid-processing-monetary-v2"
            ? p.priorExposureNanoUsd + p.operatingPoolNanoUsd
            : Number.MAX_SAFE_INTEGER,
        )
      ? p
      : null;
  } catch {
    return null;
  }
}
