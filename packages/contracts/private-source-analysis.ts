import { v, type Infer } from "convex/values";

export const privateSourceRightsValue = v.union(
  v.object({
    kind: v.literal("owner_supplied_text"),
    rightsAttested: v.literal(true),
    sourceExpiresAt: v.union(v.number(), v.null()),
  }),
  v.object({
    kind: v.literal("retained_source_revision"),
    sourceType: v.union(
      v.literal("supplied_text"),
      v.literal("github_repository"),
      v.literal("reddit_thread"),
    ),
    rightsAttested: v.literal(true),
    rightsBasis: v.string(),
    observedAt: v.number(),
    retention: v.union(
      v.object({
        retainUntil: v.number(),
        deletionWithinMs: v.number(),
        policyEvidenceId: v.string(),
      }),
      v.null(),
    ),
    sourceExpiresAt: v.union(v.number(), v.null()),
  }),
);

export const privateSourceBindingValue = v.object({
  schemaVersion: v.literal("private-source-reanalysis-text-v1"),
  sourceId: v.id("sources"),
  generation: v.number(),
  revision: v.number(),
  analysisHash: v.string(),
  inputKind: v.union(v.literal("supplied_text"), v.literal("retained_text")),
  sourceRevisionId: v.union(v.id("sourceRevisions"), v.null()),
  sourceContentHash: v.string(),
  evidenceHash: v.string(),
  rightsHash: v.string(),
  rights: privateSourceRightsValue,
  baseHash: v.string(),
  briefHash: v.union(v.string(), v.null()),
  contextHash: v.string(),
  sourceInputHash: v.string(),
  inputHash: v.string(),
  pipelineHash: v.string(),
  outputSchemaHash: v.string(),
  priorVersion: v.number(),
});

export const sourceTaskResultValue = v.object({
  schemaVersion: v.literal("private-source-analysis-text-v1"),
  version: v.number(),
  inputHash: v.string(),
  outputHash: v.string(),
  completedAt: v.number(),
  outputJson: v.string(),
});

export const privateSourcePointerValue = v.object({
  schemaVersion: v.literal("private-source-analysis-text-v1"),
  ownerId: v.id("users"),
  runId: v.id("localLibraryRuns"),
  version: v.number(),
  baseHash: v.string(),
  contextHash: v.string(),
  inputHash: v.string(),
  outputHash: v.string(),
  completedAt: v.number(),
});

// Our local runtime reports this feature; it is not an official model claim.
export const localTaskRuntimeValue = v.object({
  schemaVersion: v.literal("local-task-runtime-v1"),
  features: v.array(
    v.union(
      v.literal("source_reanalysis_text_v1"),
      v.literal("project_private_variant_v1"),
      v.literal("project_apply_source_v1"),
    ),
  ),
});
export const localTaskRuntimeSnapshotValue = v.object({
  value: localTaskRuntimeValue,
  hash: v.string(),
  profileBinding: v.string(),
  expiresAt: v.number(),
  sessionExpiresAt: v.number(),
});

export const sourceReanalysisTaskValue = v.object({
  schemaVersion: v.literal("2.0.0"),
  workload: v.literal("source_reanalysis_text"),
  fundingRoute: v.literal("chatgpt_subscription"),
  maxInferenceCredits: v.literal(0),
  deviceId: v.id("devices"),
  profileBinding: v.string(),
  capabilityHash: v.string(),
  localRuntimeHash: v.string(),
  approvalHash: v.string(),
  key: v.string(),
  approvedAt: v.number(),
  deadline: v.number(),
  leaseGeneration: v.number(),
  leaseUntil: v.number(),
  leaseToken: v.optional(v.string()),
  privateSourceBrief: v.optional(v.string()),
  sourceReanalysisBinding: privateSourceBindingValue,
});

export type PrivateSourceRights = Infer<typeof privateSourceRightsValue>;
export type PrivateSourceBinding = Infer<typeof privateSourceBindingValue>;
export type SourceTaskResult = Infer<typeof sourceTaskResultValue>;
export type PrivateSourcePointer = Infer<typeof privateSourcePointerValue>;
export type LocalTaskRuntime = Infer<typeof localTaskRuntimeValue>;
export type LocalTaskRuntimeSnapshot = Infer<
  typeof localTaskRuntimeSnapshotValue
>;
export type SourceReanalysisTask = Infer<typeof sourceReanalysisTaskValue>;
