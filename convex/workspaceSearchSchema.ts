import { defineTable } from "convex/server";
import { v } from "convex/values";

export const workspaceSearchTables = {
  workspaceSearchOrigins: defineTable({
    organizationId: v.id("organizations"),
    pathKey: v.string(),
    canonicalKey: v.string(),
    analysisKey: v.string(),
    sourceId: v.id("sources"),
    generation: v.number(),
    revision: v.number(),
    analysisVersionId: v.optional(v.id("analysisVersions")),
    grantId: v.optional(v.id("teamKnowledgeGrants")),
    grantVersion: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_path", ["organizationId", "pathKey"])
    .index("by_canonical", ["canonicalKey"])
    .index("by_post", ["organizationId", "canonicalKey", "analysisKey"]),
  workspaceSearchDocuments: defineTable({
    organizationId: v.id("organizations"),
    canonicalKey: v.string(),
    analysisKey: v.string(),
    itemKey: v.string(),
    kind: v.union(v.literal("post"), v.literal("insight")),
    insightId: v.optional(v.string()),
    title: v.string(),
    excerpt: v.string(),
    searchText: v.string(),
    truncated: v.boolean(),
    metadataVersion: v.optional(v.literal(2)),
    platform: v.optional(v.string()),
    categoryKeys: v.optional(v.array(v.string())),
    updatedAt: v.number(),
  })
    .index("by_item", [
      "organizationId",
      "canonicalKey",
      "analysisKey",
      "itemKey",
    ])
    .index("by_post", ["organizationId", "canonicalKey", "analysisKey"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["organizationId", "kind"],
    }),
  workspaceSearchState: defineTable({
    organizationId: v.id("organizations"),
    revision: v.number(),
    phase: v.union(
      v.literal("sources"),
      v.literal("shares"),
      v.literal("ready"),
    ),
    cursor: v.union(v.string(), v.null()),
    shareOffset: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),
};
