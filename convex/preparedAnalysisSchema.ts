import { defineTable } from "convex/server";
import { v } from "convex/values";
export const preparedAnalysisTables = {
  mediaPreparations: defineTable({
    organizationId: v.id("organizations"),
    sourceId: v.id("sources"),
    actor: v.id("users"),
    key: v.string(),
    policyId: v.string(),
    generation: v.number(),
    canonical: v.string(),
    executor: v.union(v.literal("gateway"), v.literal("work_cloud")),
    state: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deadline: v.number(),
    maximumApiUsd: v.number(),
    grantId: v.optional(v.id("assistantGrants")),
    grantVersion: v.optional(v.number()),
    evidenceId: v.optional(v.id("analysisEvidence")),
    versionId: v.optional(v.id("analysisVersions")),
    attemptId: v.optional(v.id("analysisAttempts")),
    metadata: v.optional(v.any()),
    receipt: v.optional(v.any()),
    stages: v.array(v.object({ stage: v.string(), at: v.number() })),
  })
    .index("by_org_source_key", ["organizationId", "sourceId", "key"])
    .index("by_actor_policy", ["actor", "policyId"])
    .index("by_attempt", ["attemptId"])
    .index("by_org_source", ["organizationId", "sourceId"]),
};
