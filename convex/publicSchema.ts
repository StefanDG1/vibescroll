import { defineTable } from "convex/server";
import { v } from "convex/values";

const tenant = {
  organizationId: v.id("organizations"),
  createdAt: v.number(),
  updatedAt: v.number(),
};
const moderationBlock = {
  ...tenant,
  publisher: v.id("users"),
  sourceId: v.id("sources"),
  canonicalHash: v.string(),
  reason: v.union(
    v.literal("copyright"),
    v.literal("privacy"),
    v.literal("inaccuracy"),
    v.literal("abuse"),
  ),
  state: v.union(v.literal("active"), v.literal("released")),
  version: v.number(),
  releasedBy: v.optional(v.id("users")),
  releasedAt: v.optional(v.number()),
  releaseNote: v.optional(v.string()),
  identityRepairNote: v.optional(v.string()),
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
  sourceProvenance: v.optional(v.literal("supplied_text_unverified")),
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
    moderationBlockId: v.optional(v.id("publicModerationBlocks")),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_slug", ["slug"])
    .index("by_state", ["state"])
    .index("by_moderation_pending", ["removalReason", "moderationBlockId"])
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
    moderationBlockId: v.optional(v.id("publicModerationBlocks")),
  })
    .index("by_org", ["organizationId"])
    .index("by_state", ["state"])
    .index("by_state_block", ["state", "moderationBlockId"])
    .index("by_edition", ["editionId"])
    .index("by_edition_state", ["editionId", "state"])
    .index("by_key", ["editionId", "key"]),
  // Safety identities outlive content deletion. No source text, URL or public
  // payload belongs here; releases are explicit moderator decisions.
  publicModerationBlocks: defineTable(
    v.union(
      v.object({
        ...moderationBlock,
        origin: v.literal("moderator_remove"),
        reportId: v.id("publicReports"),
        moderator: v.id("users"),
      }),
      v.object({
        ...moderationBlock,
        origin: v.literal("legacy_removal"),
        reportId: v.optional(v.id("publicReports")),
        moderator: v.optional(v.id("users")),
      }),
    ),
  )
    .index("by_source_state", ["sourceId", "state"])
    .index("by_source_publisher_state", ["sourceId", "publisher", "state"])
    .index("by_publisher_canonical_state", [
      "publisher",
      "canonicalHash",
      "state",
    ])
    .index("by_org_canonical_state", [
      "organizationId",
      "canonicalHash",
      "state",
    ])
    .index("by_state", ["state"]),
  publicCorrections: defineTable({
    ...tenant,
    editionId: v.id("publicEditions"),
    version: v.number(),
    note: v.string(),
  })
    .index("by_org", ["organizationId"])
    .index("by_edition", ["editionId"]),
  publicArtifacts: defineTable(
    v.union(
      v.object({
        ...tenant,
        origin: v.optional(v.literal("edition")),
        editionId: v.id("publicEditions"),
        editionVersion: v.number(),
        compatibilityKey: v.string(),
        contentHash: v.string(),
        language: v.string(),
        pipelineVersion: v.string(),
        schemaVersion: v.string(),
        coverage: v.string(),
        state: v.union(v.literal("eligible"), v.literal("blocked")),
      }),
      v.object({
        ...tenant,
        origin: v.literal("service"),
        sourceId: v.id("sources"),
        generation: v.number(),
        sourceRevision: v.number(),
        fundingOwner: v.id("users"),
        reservationKey: v.string(),
        compatibilityKey: v.string(),
        contentHash: v.string(),
        language: v.string(),
        pipelineVersion: v.string(),
        schemaVersion: v.literal("3.0.0"),
        coverage: v.literal("ordered_media"),
        promptHash: v.string(),
        settingsHash: v.string(),
        postRevisionHash: v.string(),
        evidenceHash: v.string(),
        policyEvidenceId: v.string(),
        rightsHash: v.string(),
        retainUntil: v.number(),
        deletionWithinMs: v.number(),
        state: v.union(v.literal("eligible"), v.literal("blocked")),
        data: v.optional(v.any()),
      }),
    ),
  )
    .index("by_org", ["organizationId"])
    .index("by_edition", ["editionId"])
    .index("by_compatibility", ["compatibilityKey"])
    .index("by_service_compatibility", ["origin", "compatibilityKey", "state"])
    .index("by_service_expiry", ["origin", "state", "retainUntil"])
    .index("by_service_policy", ["origin", "rightsHash", "state"])
    .index("by_service_source", ["origin", "sourceId", "state", "generation"]),
  publicImports: defineTable(
    v.union(
      v.object({
        ...tenant,
        origin: v.optional(v.literal("edition")),
        actor: v.id("users"),
        sourceId: v.id("sources"),
        artifactId: v.id("publicArtifacts"),
        editionVersion: v.number(),
        compatibilityKey: v.string(),
        privateNote: v.string(),
        corrections: v.array(
          v.object({ insightId: v.string(), text: v.string() }),
        ),
      }),
      v.object({
        ...tenant,
        origin: v.literal("service"),
        actor: v.id("users"),
        sourceId: v.id("sources"),
        artifactId: v.id("publicArtifacts"),
        compatibilityKey: v.string(),
        privateNote: v.string(),
        corrections: v.array(
          v.object({ insightId: v.string(), text: v.string() }),
        ),
      }),
    ),
  )
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
