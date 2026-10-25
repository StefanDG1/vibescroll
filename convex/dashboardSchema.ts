import { defineTable } from "convex/server";
import { v } from "convex/values";
import { evaluationEvidenceRef } from "./knowledgeSchema";
import { creatorRightsValue } from "./creatorSchema";

export const dashboardKind = v.union(
  v.literal("source"),
  v.literal("repository"),
  v.literal("proposal"),
  v.literal("run"),
);
export const dashboardTables = {
  dashboardMigrations: defineTable({
    name: v.string(),
    table: v.number(),
    cursor: v.union(v.string(), v.null()),
    complete: v.boolean(),
    enabled: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),
  dashboardCards: defineTable({
    organizationId: v.id("organizations"),
    entityId: v.string(),
    kind: dashboardKind,
    title: v.string(),
    state: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    sourceId: v.optional(v.id("sources")),
    repositoryId: v.optional(v.id("repositories")),
    proposalId: v.optional(v.id("proposals")),
    sourceKind: v.optional(v.string()),
    sourceAuthorityVersion: v.optional(v.union(v.literal(1), v.literal(2))),
    sourceRetentionUntil: v.optional(v.number()),
    creatorRights: v.optional(creatorRightsValue),
    coverage: v.optional(v.string()),
    generation: v.optional(v.number()),
    rightsAttested: v.optional(v.boolean()),
    insightIds: v.optional(v.array(v.string())),
    insightCount: v.optional(v.number()),
    mainPoints: v.optional(v.array(v.string())),
    // Strict versioned registry in packages/contracts/post-summary.ts validates
    // every projection write/read. Older cards use the bounded legacy adapter.
    postSummary: v.optional(v.any()),
    enabled: v.optional(v.boolean()),
    confirmed: v.optional(v.boolean()),
    sha: v.optional(v.string()),
    baseSha: v.optional(v.string()),
    profileVersion: v.optional(v.number()),
    selectionVersion: v.optional(v.number()),
    review: v.optional(v.string()),
    version: v.optional(v.number()),
    references: v.optional(v.array(evaluationEvidenceRef)),
  })
    .index("by_org", ["organizationId"])
    .index("by_entity", ["entityId"])
    .index("by_org_kind_updated", ["organizationId", "kind", "updatedAt"])
    .index("by_org_kind_state", ["organizationId", "kind", "state"]),
};
