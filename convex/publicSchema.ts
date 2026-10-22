import { defineTable } from "convex/server";
import { v } from "convex/values";

const tenant = {
  organizationId: v.id("organizations"),
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const publicationState = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("withdrawn"),
  v.literal("removed"),
);
export const publicPayload = v.object({
  title: v.string(),
  summary: v.string(),
  publisher: v.string(),
  sourceUrl: v.union(v.string(), v.null()),
  coverage: v.string(),
  language: v.string(),
  pipelineVersion: v.string(),
  schemaVersion: v.string(),
  insights: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      claim: v.string(),
      interpretation: v.string(),
      uncertainty: v.array(v.string()),
      citations: v.array(
        v.object({
          label: v.string(),
          url: v.union(v.string(), v.null()),
          kind: v.string(),
        }),
      ),
    }),
  ),
});
export const publicTables = {
  publicEditions: defineTable({
    ...tenant,
    actor: v.id("users"),
    sourceId: v.id("sources"),
    sourceGeneration: v.number(),
    sourceRevision: v.number(),
    state: publicationState,
    version: v.number(),
    slug: v.string(),
    payload: publicPayload,
    payloadHash: v.string(),
    rightsBasis: v.union(
      v.literal("owner_created"),
      v.literal("licensed"),
      v.literal("public_domain"),
    ),
    permissionReference: v.string(),
    permissionExpiresAt: v.number(),
    reuseAllowed: v.boolean(),
    publishedAt: v.optional(v.number()),
    removalReason: v.optional(v.string()),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_slug", ["slug"])
    .index("by_state", ["state"])
    .index("by_actor", ["actor"]),
  publicCollections: defineTable({
    ...tenant,
    actor: v.id("users"),
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    topic: v.string(),
    state: publicationState,
    version: v.number(),
    editions: v.array(v.id("publicEditions")),
    reviewedHash: v.optional(v.string()),
    bindings: v.array(
      v.object({
        id: v.id("publicEditions"),
        version: v.number(),
        hash: v.string(),
      }),
    ),
  })
    .index("by_org", ["organizationId"])
    .index("by_slug", ["slug"])
    .index("by_state", ["state"])
    .index("by_topic", ["state", "topic"]),
  publicReports: defineTable({
    ...tenant,
    editionId: v.id("publicEditions"),
    key: v.string(),
    reason: v.string(),
    state: v.union(
      v.literal("open"),
      v.literal("dismissed"),
      v.literal("removed"),
    ),
    reviewedBy: v.optional(v.id("users")),
  })
    .index("by_org", ["organizationId"])
    .index("by_state", ["state"])
    .index("by_edition", ["editionId"])
    .index("by_key", ["editionId", "key"]),
  publicCorrections: defineTable({
    ...tenant,
    editionId: v.id("publicEditions"),
    version: v.number(),
    note: v.string(),
  })
    .index("by_org", ["organizationId"])
    .index("by_edition", ["editionId"]),
  publicArtifacts: defineTable({
    ...tenant,
    editionId: v.id("publicEditions"),
    editionVersion: v.number(),
    compatibilityKey: v.string(),
    contentHash: v.string(),
    language: v.string(),
    pipelineVersion: v.string(),
    schemaVersion: v.string(),
    coverage: v.string(),
    state: v.union(v.literal("eligible"), v.literal("blocked")),
  })
    .index("by_org", ["organizationId"])
    .index("by_edition", ["editionId"])
    .index("by_compatibility", ["compatibilityKey"]),
  publicImports: defineTable({
    ...tenant,
    actor: v.id("users"),
    sourceId: v.id("sources"),
    artifactId: v.id("publicArtifacts"),
    editionVersion: v.number(),
    compatibilityKey: v.string(),
    privateNote: v.string(),
    corrections: v.array(v.object({ insightId: v.string(), text: v.string() })),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_artifact", ["artifactId"])
    .index("by_actor_artifact", ["actor", "artifactId"]),
  publicGeography: defineTable({
    ...tenant,
    actor: v.id("users"),
    cell: v.string(),
    enabled: v.boolean(),
  })
    .index("by_org", ["organizationId"])
    .index("by_actor", ["actor"])
    .index("by_cell", ["cell", "enabled"]),
};
