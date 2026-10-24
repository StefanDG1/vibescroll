import { defineTable } from "convex/server";
import { v } from "convex/values";
import { privateEvaluationOriginValue } from "../packages/contracts/private-evaluation-context";
import { privateVariantSelectionValue } from "../packages/contracts/private-project-variant";
import {
  sourceReanalysisTaskValue,
  sourceTaskResultValue,
} from "../packages/contracts/private-source-analysis";
const tenant = {
  organizationId: v.id("organizations"),
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const subscriptionCapabilitiesValue = v.object({
  schemaVersion: v.literal("1.0.0"),
  catalogueSource: v.literal("official_app_server"),
  access: v.literal("advertised_not_verified"),
  models: v.array(
    v.object({
      slug: v.string(),
      displayName: v.string(),
      reasoningEfforts: v.array(v.string()),
      defaultReasoningEffort: v.union(v.string(), v.null()),
      inputModalities: v.array(v.union(v.literal("text"), v.literal("image"))),
      modalitySource: v.union(
        v.literal("advertised"),
        v.literal("protocol_default"),
      ),
    }),
  ),
  localLimits: v.object({
    maxInputTextBytes: v.literal(1000000),
    maxInlineFrames: v.literal(48),
    maxFrameBytes: v.literal(1000000),
    maxAggregateFrameBytes: v.literal(12000000),
    maxOutputBytes: v.literal(120000),
  }),
});
const task = v.object({
  schemaVersion: v.literal("1.0.0"),
  privateEvaluationBrief: v.optional(v.string()),
  privateEvaluationOrigin: v.optional(privateEvaluationOriginValue),
  workload: v.union(v.literal("project_evaluation"), v.literal("plan_draft")),
  fundingRoute: v.literal("chatgpt_subscription"),
  maxInferenceCredits: v.literal(0),
  deviceId: v.id("devices"),
  profileBinding: v.string(),
  capabilityHash: v.string(),
  approvalHash: v.string(),
  key: v.string(),
  sourceBindings: v.array(
    v.object({
      sourceId: v.id("sources"),
      generation: v.number(),
      revision: v.number(),
      analysisHash: v.string(),
    }),
  ),
  repositoryBindings: v.array(
    v.object({
      repositoryId: v.id("repositories"),
      baseSha: v.string(),
      profileVersion: v.number(),
      selectionVersion: v.number(),
    }),
  ),
  proposal: v.optional(
    v.object({ id: v.id("proposals"), version: v.number() }),
  ),
  members: v.array(v.id("knowledgeMembers")),
  topicId: v.optional(v.id("knowledgeTopics")),
  topicBindings: v.array(
    v.object({ id: v.id("knowledgeTopics"), version: v.number() }),
  ),
  preferenceVersion: v.number(),
  approvedAt: v.number(),
  deadline: v.number(),
  leaseGeneration: v.number(),
  leaseUntil: v.number(),
  leaseToken: v.optional(v.string()),
  evaluationIds: v.array(v.id("knowledgeEvaluations")),
  proposalIds: v.array(v.id("proposals")),
  inspected: v.optional(v.any()),
  inspectionManifest: v.optional(v.any()),
});
const privateVariantTask = v.object({
  ...task.fields,
  schemaVersion: v.literal("3.0.0"),
  localRuntimeHash: v.string(),
  privateVariantSelection: privateVariantSelectionValue,
  // Truthful indexed privacy locator, not a C6b inference-input binding.
  sourceReanalysisBinding: v.object({
    sourceId: v.id("sources"),
    generation: v.number(),
  }),
});
const applicationTask = v.object({
  ...task.fields,
  schemaVersion: v.literal("4.0.0"),
  workload: v.literal("project_evaluation"),
  localRuntimeHash: v.string(),
  includeSourceContent: v.boolean(),
  sourceContentBindings: v.array(
    v.object({
      sourceId: v.id("sources"),
      generation: v.number(),
      revision: v.number(),
      contentHash: v.string(),
    }),
  ),
  privateVariantSelection: v.optional(privateVariantSelectionValue),
  sourceReanalysisBinding: v.object({
    sourceId: v.id("sources"),
    generation: v.number(),
  }),
});
export const localLibraryTables = {
  localLibraryRuns: defineTable({
    ...tenant,
    actor: v.id("users"),
    assistantIntakeId: v.optional(v.id("assistantIntakes")),
    assistantGrantVersion: v.optional(v.number()),
    sources: v.array(v.id("sources")),
    repositories: v.array(v.id("repositories")),
    model: v.string(),
    effort: v.string(),
    task: v.optional(
      v.union(
        task,
        sourceReanalysisTaskValue,
        privateVariantTask,
        applicationTask,
      ),
    ),
    sourceTaskResult: v.optional(sourceTaskResultValue),
    expiresAt: v.number(),
    state: v.string(),
    jobs: v.number(),
    completed: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_source_reanalysis", [
      "organizationId",
      "task.sourceReanalysisBinding.sourceId",
    ])
    .index("by_device_state", ["task.deviceId", "state", "task.schemaVersion"])
    .index("by_task_key", ["organizationId", "task.key"]),
  localSourceImports: defineTable({
    ...tenant,
    runId: v.id("localLibraryRuns"),
    sourceId: v.id("sources"),
    generation: v.number(),
    revision: v.number(),
    inputHash: v.string(),
    transcript: v.any(),
    acquisition: v.optional(v.any()),
    coverage: v.string(),
    frames: v.array(
      v.object({
        id: v.string(),
        timestampMs: v.number(),
        sha256: v.string(),
        size: v.number(),
        assetId: v.optional(v.id("assets")),
      }),
    ),
    state: v.string(),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_run_source", ["runId", "sourceId"]),
};
