import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const common = {
  actor: v.id("users"),
  generation: v.number(),
  model: v.string(),
  sourceRevisionId: v.optional(v.id("sourceRevisions")),
  sourceContentHash: v.optional(v.string()),
  effort: v.string(),
  state: v.string(),
  approvedAt: v.number(),
  expiresAt: v.number(),
  leaseUntil: v.number(),
  deadline: v.number(),
  stage: v.optional(v.string()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
};
const cloudCommon = {
  grantId: v.id("assistantGrants"),
  grantVersion: v.number(),
  clientId: v.string(),
  selectedGeneration: v.number(),
  selectedRevision: v.number(),
  inputHash: v.string(),
  policyHash: v.string(),
  funding: v.literal("own_subscription"),
  maxApiUsd: v.literal(0),
  taskId: v.optional(v.string()),
  claimedAt: v.optional(v.number()),
  consentId: v.optional(v.string()),
  leaseTokenHash: v.optional(v.string()),
  completionHash: v.optional(v.string()),
  reportedModel: v.optional(v.string()),
  reportedEffort: v.optional(v.string()),
};
const legacyPaired = v.object({
  deviceId: v.id("devices"),
  actor: v.id("users"),
  generation: v.number(),
  model: v.string(),
  profileBinding: v.string(),
  sourceRevisionId: v.optional(v.id("sourceRevisions")),
  sourceContentHash: v.optional(v.string()),
  effort: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  state: v.string(),
  approvedAt: v.number(),
  expiresAt: v.number(),
  leaseUntil: v.number(),
  deadline: v.number(),
  stage: v.optional(v.string()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
});
export const personalAnalysisValue = v.union(
  v.object({
    ...legacyPaired.fields,
    executor: v.optional(v.literal("paired_computer")),
  }),
  v.object({
    ...common,
    executor: v.literal("work_cloud"),
    // Paired-only fields may never contain authority in a Cloud job. Optional
    // nulls keep read-only legacy projections type-safe across the union.
    deviceId: v.optional(v.null()),
    profileBinding: v.optional(v.null()),
    capabilityHash: v.optional(v.null()),
    ordered: v.optional(v.null()),
    cloud: v.union(
      v.object({
        ...cloudCommon,
        schemaVersion: v.literal("work-cloud-text-v1"),
        media: v.optional(v.null()),
      }),
      v.object({
        ...cloudCommon,
        schemaVersion: v.literal("work-cloud-media-v2"),
        media: v.object({
          canonicalUrl: v.string(),
          toolchainHash: v.string(),
          retainUntil: v.number(),
          preparationHash: v.optional(v.string()),
        }),
      }),
    ),
  }),
);

type Job = NonNullable<Doc<"sources">["personalAnalysis"]>;
export type PairedPersonalJob = Exclude<Job, { executor: "work_cloud" }>;
export type WorkCloudJob = Extract<Job, { executor: "work_cloud" }>;
export function pairedPersonalJob(
  job: Job | undefined | null,
): job is PairedPersonalJob {
  return !!job && job.executor !== "work_cloud";
}
