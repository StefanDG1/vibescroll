import { defineTable } from "convex/server";
import { v } from "convex/values";

export const sourceType = v.union(
  v.literal("media"),
  v.literal("github_repository"),
  v.literal("reddit_thread"),
  v.literal("supplied_text"),
);
export const retrievalState = v.union(
  v.literal("saved"),
  v.literal("fetching"),
  v.literal("ready"),
  v.literal("partial"),
  v.literal("needs_supplied_text"),
  v.literal("unavailable"),
  v.literal("rate_limited"),
);
const tenant = {
  organizationId: v.id("organizations"),
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const sourceTables = {
  sourceRelationships: defineTable({
    ...tenant,
    sourceId: v.id("sources"),
    relatedSourceId: v.id("sources"),
    actor: v.id("users"),
    kind: v.union(v.literal("announcement_repository"), v.literal("related")),
    key: v.string(),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_related", ["relatedSourceId"])
    .index("by_key", ["organizationId", "key"]),
  sourceRevisions: defineTable({
    ...tenant,
    sourceId: v.id("sources"),
    generation: v.number(),
    contentHash: v.string(),
    // Strict versioned Zod registries validate every write and current read.
    revision: v.any(),
    evidence: v.array(v.any()),
    text: v.string(),
    // Optional for candidate rows created before durable retention recovery.
    retentionScheduledAt: v.optional(v.number()),
    state: v.union(
      v.literal("current"),
      v.literal("superseded"),
      v.literal("removed"),
    ),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_hash", ["organizationId", "contentHash"]),
  sourceAcquisitions: defineTable({
    ...tenant,
    sourceId: v.id("sources"),
    actor: v.id("users"),
    generation: v.number(),
    provider: v.union(v.literal("github"), v.literal("reddit")),
    key: v.string(),
    state: retrievalState,
    version: v.number(),
    sourceRevision: v.number(),
    selectedPaths: v.array(v.string()),
    pinnedCommit: v.optional(v.string()),
    repositoryId: v.optional(v.number()),
    selection: v.optional(v.any()),
    rightsBasis: v.string(),
    lease: v.optional(v.string()),
    deadline: v.number(),
    retryAt: v.optional(v.number()),
    error: v.optional(v.string()),
    requestCount: v.number(),
    byteCount: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_key", ["organizationId", "key"])
    .index("by_provider_state", ["provider", "state"]),
  sourceProviderQuotas: defineTable({
    provider: v.string(),
    windowStart: v.number(),
    used: v.number(),
    limit: v.number(),
    retryAt: v.number(),
    lastOrganizationId: v.optional(v.id("organizations")),
    consecutive: v.optional(v.number()),
  }).index("by_provider", ["provider"]),
};
