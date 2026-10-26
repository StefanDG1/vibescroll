import { defineTable } from "convex/server";
import { v } from "convex/values";
export const librarySpace = v.union(
  v.literal("personal"),
  v.literal("business"),
);
export const librarySpacesTables = {
  teamKnowledgeGrants: defineTable({
    organizationId: v.id("organizations"),
    recipientOrganizationId: v.id("organizations"),
    actor: v.id("users"),
    sources: v.array(
      v.object({
        sourceId: v.id("sources"),
        generation: v.number(),
        revision: v.number(),
      }),
    ),
    version: v.number(),
    state: v.union(v.literal("active"), v.literal("revoked")),
    expiresAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_recipient", ["recipientOrganizationId"])
    .index("by_pair", ["organizationId", "recipientOrganizationId"]),
  librarySetup: defineTable({
    organizationId: v.id("organizations"),
    actor: v.id("users"),
    version: v.number(),
    focus: v.array(librarySpace),
    goal: v.string(),
    interests: v.array(v.string()),
    role: v.string(),
    connectSpaces: v.boolean(),
    confirmed: v.boolean(),
    stage: v.union(v.literal(0), v.literal(1), v.literal(2)),
    provenance: v.literal("user"),
    processingRoute: v.optional(
      v.union(
        v.literal("local"),
        v.literal("cloud"),
        v.literal("save_only"),
        v.literal("work_cloud"),
      ),
    ),
    importReviewed: v.optional(v.boolean()),
    preferencesReviewed: v.optional(v.boolean()),
    localPreflight: v.optional(
      v.object({
        reportedAt: v.number(),
        passed: v.boolean(),
        checks: v.array(
          v.object({
            id: v.string(),
            status: v.union(
              v.literal("passed"),
              v.literal("blocked"),
              v.literal("unknown"),
            ),
          }),
        ),
      }),
    ),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),
  sourceSpaces: defineTable({
    organizationId: v.id("organizations"),
    sourceId: v.id("sources"),
    space: librarySpace,
    actor: v.id("users"),
    provenance: v.literal("user"),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_space", ["organizationId", "space", "updatedAt"]),
};
