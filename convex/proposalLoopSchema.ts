import { defineTable } from "convex/server";
import { v } from "convex/values";

export const proposalLoopTables = {
  proposalOperations: defineTable({
    organizationId: v.id("organizations"),
    proposalId: v.id("proposals"),
    actorId: v.id("users"),
    kind: v.union(
      v.literal("message"),
      v.literal("generation"),
      v.literal("issue"),
    ),
    key: v.string(),
    requestHash: v.string(),
    delegation: v.optional(v.any()),
    policyId: v.optional(v.string()),
    proposalVersion: v.number(),
    expectedReview: v.optional(v.string()),
    leaseId: v.optional(v.string()),
    state: v.union(
      v.literal("complete"),
      v.literal("queued"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("unknown"),
      v.literal("stale"),
    ),
    messageId: v.optional(v.string()),
    contextHash: v.optional(v.string()),
    discussionRevision: v.optional(v.number()),
    fundingOrganizationId: v.optional(v.id("organizations")),
    reservationKey: v.optional(v.string()),
    deadline: v.optional(v.number()),
    outputVersion: v.optional(v.number()),
    receipt: v.optional(v.any()),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal_key", ["proposalId", "kind", "key"])
    .index("by_proposal", ["proposalId"])
    .index("by_org", ["organizationId"])
    .index("by_policy", ["policyId", "kind"]),
  proposalServiceCounters: defineTable({
    policyId: v.string(),
    jobs: v.number(),
  }).index("by_policy", ["policyId"]),
};
