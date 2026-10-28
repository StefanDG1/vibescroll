import { defineTable } from "convex/server";
import { v } from "convex/values";

const accessOwner = v.union(v.literal("private"), v.literal("service"));
const owner = {
  owner: accessOwner,
  organizationId: v.optional(v.id("organizations")),
  sourceId: v.optional(v.id("sources")),
  createdAt: v.number(),
};
export const analysisHistoryTables = {
  analysisEvidence: defineTable({
    ...owner,
    state: v.union(
      v.literal("retained"),
      v.literal("blocked"),
      v.literal("removed"),
    ),
    canonical: v.string(),
    evidenceHash: v.string(),
    revisionHash: v.string(),
    retainUntil: v.number(),
    // Parsed with the existing strict ordered-media contract at every write.
    prepared: v.any(),
    frames: v.array(
      v.object({
        frameId: v.string(),
        assetId: v.optional(v.id("assets")),
        key: v.string(),
        sha256: v.string(),
        size: v.number(),
        timestampMs: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
    extractionGeneration: v.number(),
    extractionPreparationHash: v.string(),
  })
    .index("by_org_source", ["organizationId", "sourceId"])
    .index("by_org", ["organizationId"])
    .index("by_owner_hash", ["owner", "evidenceHash"])
    .index("by_expiry", ["state", "retainUntil"]),
  analysisVersions: defineTable({
    ...owner,
    evidenceId: v.id("analysisEvidence"),
    number: v.number(),
    state: v.union(
      v.literal("ready"),
      v.literal("blocked"),
      v.literal("removed"),
    ),
    // Immutable, strictly validated output; erasure can remove the payload.
    output: v.optional(v.any()),
    outputHash: v.string(),
    retainUntil: v.number(),
    recipeHash: v.optional(v.string()),
    variantKey: v.optional(v.string()),
    summary: v.string(),
    insightCount: v.number(),
    attemptId: v.optional(v.id("analysisAttempts")),
    requestedModel: v.optional(v.string()),
    requestedEffort: v.optional(v.string()),
    reportedModel: v.optional(v.string()),
    reportedEffort: v.optional(v.string()),
    provenance: v.union(
      v.literal("legacy_recorded"),
      v.literal("authenticated_host_reported"),
    ),
    evaluation: v.literal("review_required"),
  })
    .index("by_org_source", ["organizationId", "sourceId"])
    .index("by_org", ["organizationId"])
    .index("by_evidence_state", ["evidenceId", "state"])
    .index("by_evidence_hash", ["evidenceId", "outputHash"]),
  analysisAttempts: defineTable({
    organizationId: v.id("organizations"),
    sourceId: v.id("sources"),
    actor: v.id("users"),
    key: v.string(),
    createdAt: v.number(),
    basedOnVersionId: v.id("analysisVersions"),
    evidenceId: v.id("analysisEvidence"),
    sourceGeneration: v.number(),
    canonical: v.string(),
    inputHash: v.string(),
    recipeHash: v.string(),
    variantKey: v.string(),
    number: v.number(),
    expectedSelectionRevision: v.number(),
    model: v.string(),
    effort: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("xhigh"),
    ),
    grantId: v.id("assistantGrants"),
    grantVersion: v.number(),
    clientId: v.string(),
    state: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("unknown"),
      v.literal("cancelled"),
    ),
    expiresAt: v.number(),
    leaseUntil: v.number(),
    deadline: v.number(),
    taskId: v.optional(v.string()),
    consentId: v.optional(v.string()),
    leaseTokenHash: v.optional(v.string()),
    viewedFrameIds: v.array(v.string()),
    resultVersionId: v.optional(v.id("analysisVersions")),
    completionHash: v.optional(v.string()),
    diagnostic: v.optional(v.string()),
    updatedAt: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  })
    .index("by_org_source_key", ["organizationId", "sourceId", "key"])
    .index("by_org", ["organizationId"])
    .index("by_org_source", ["organizationId", "sourceId"])
    .index("by_expiry", ["state", "expiresAt"]),
};
