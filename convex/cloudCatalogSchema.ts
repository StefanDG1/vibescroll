import { defineTable } from "convex/server";
import { v } from "convex/values";
export const cloudCatalogTables = {
  catalogAliases: defineTable({
    organizationId: v.id("organizations"),
    key: v.string(),
    alias: v.string(),
    familyId: v.id("catalogFamilies"),
    permissionHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    retainUntil: v.number(),
    resultRetention: v.optional(v.literal("until_deleted")),
  })
    .index("by_key", ["key"])
    .index("by_org", ["organizationId"])
    .index("by_family", ["familyId"]),
  catalogFamilies: defineTable({
    organizationId: v.id("organizations"),
    key: v.string(),
    canonical: v.string(),
    language: v.string(),
    permissionId: v.string(),
    permissionHash: v.string(),
    state: v.union(v.literal("active"), v.literal("blocked")),
    selectedArtifactId: v.optional(v.id("publicArtifacts")),
    selectionBasis: v.optional(
      v.union(
        v.literal("first_eligible"),
        v.literal("owner_model_priority"),
        v.literal("reviewed"),
      ),
    ),
    selectionRevision: v.number(),
    nextVersionNumber: v.number(),
    members: v.array(
      v.object({
        artifactId: v.id("publicArtifacts"),
        versionId: v.id("analysisVersions"),
        evidenceId: v.id("analysisEvidence"),
        number: v.number(),
      }),
    ),
    producer: v.optional(
      v.object({
        sourceId: v.id("sources"),
        organizationId: v.id("organizations"),
        actor: v.id("users"),
        generation: v.number(),
        intentId: v.string(),
        expiresAt: v.number(),
      }),
    ),
    waiters: v.optional(
      v.array(
        v.object({
          sourceId: v.id("sources"),
          organizationId: v.id("organizations"),
          actor: v.id("users"),
          generation: v.number(),
          expiresAt: v.number(),
        }),
      ),
    ),
    reviewHash: v.optional(v.string()),
    reviewReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    retainUntil: v.number(),
    resultRetention: v.optional(v.literal("until_deleted")),
  })
    .index("by_key", ["key"])
    .index("by_org", ["organizationId"])
    .index("by_expiry", ["state", "retainUntil"]),
  catalogContributions: defineTable({
    organizationId: v.id("organizations"),
    actor: v.id("users"),
    sourceId: v.id("sources"),
    versionId: v.id("analysisVersions"),
    sourceEvidenceId: v.id("analysisEvidence"),
    artifactId: v.id("publicArtifacts"),
    key: v.string(),
    copyTokenHash: v.string(),
    consent: v.any(),
    consentHash: v.string(),
    automaticPolicyHash: v.optional(v.string()),
    evidenceHash: v.string(),
    outputHash: v.string(),
    permissionHash: v.string(),
    state: v.union(
      v.literal("copying"),
      v.literal("published"),
      v.literal("unknown"),
      v.literal("cancelled"),
      v.literal("withdrawn"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    retainUntil: v.number(),
    resultRetention: v.optional(v.literal("until_deleted")),
  })
    .index("by_org_source_key", ["organizationId", "sourceId", "key"])
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_artifact_retention", ["artifactId", "state", "retainUntil"])
    .index("by_expiry", ["state", "expiresAt"]),
};
