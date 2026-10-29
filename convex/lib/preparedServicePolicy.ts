import { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import { ensure } from "../../packages/policy";

const configuration = z.strictObject({
  version: z.literal("prepared-service-v1"),
  id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  enabled: z.boolean(),
  subjects: z
    .array(z.string().regex(/^user_[A-Za-z0-9]{20,80}$/))
    .max(100)
    .optional(),
  maximumDurationMs: z.number().int().min(1000).max(600000),
  maximumApiUsd: z.number().min(0.02).max(0.05),
  maximumDailyJobs: z.number().int().min(1).max(100),
  maximumHourlyJobs: z.number().int().min(1).max(20),
  maximumTotalJobs: z.number().int().min(1).max(1000).default(100),
  contributorAllowed: z.literal(true),
  providerPermissionReference: z.string().min(10).max(2000),
  catalogPublicationAllowed: z.boolean(),
  automaticOwnSubscriptionPreparation: z.boolean().default(false),
});
export function preparedServiceConfiguration(
  subject?: string,
  allowDisabled = false,
) {
  try {
    const c = configuration.parse(
      JSON.parse(process.env.PREPARED_ANALYSIS_CONFIGURATION_JSON ?? "null"),
    );
    if (
      (!allowDisabled && !c.enabled) ||
      process.env.RESTORE_LOCK === "true" ||
      (subject && c.subjects && !c.subjects.includes(subject))
    )
      return null;
    return c;
  } catch {
    return null;
  }
}
export function preparedServiceRunPolicy(
  run: Doc<"mediaPreparations">,
  actor: Doc<"users">,
) {
  const config = preparedServiceConfiguration(actor.subject);
  const admission = run.receipt?.admission;
  ensure(
    config &&
      admission?.version === "prepared-service-admission-v1" &&
      run.policyId === config.id &&
      admission.configurationId === config.id &&
      run.maximumApiUsd <= config.maximumApiUsd &&
      admission.quote?.durationMaximumMs <= config.maximumDurationMs,
    "APPROVAL_STALE",
    "The prepared-service admission changed or is unavailable.",
  );
  return { ...config, expiresAt: run.deadline, executor: run.executor };
}
