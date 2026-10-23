import { defineTable } from "convex/server";
import { v } from "convex/values";
const platform = v.union(v.literal("instagram"), v.literal("tiktok"));
export const creatorRightsValue = v.object({
  platform,
  creatorId: v.string(),
  provider: v.string(),
  evidenceId: v.string(),
  policyCanonical: v.string(),
  rightsHash: v.string(),
  expiresAt: v.number(),
  deletionWithinMs: v.number(),
});
const tenant = {
  organizationId: v.id("organizations"),
  actor: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const creatorTables = {
  // Discovery coordination only. Inference uses the existing job/artifact families.
  creatorWatches: defineTable({
    platform,
    creatorId: v.string(),
    canonical: v.string(),
    provider: v.string(),
    rightsEvidenceId: v.string(),
    version: v.number(),
    generation: v.number(),
    state: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("quarantined"),
    ),
    nextCheckAt: v.number(),
    lastCheckedAt: v.optional(v.number()),
    checkpoint: v.optional(v.string()),
    incomplete: v.boolean(),
    lease: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    reservationKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    claimPosts: v.optional(v.number()),
    claimBatches: v.optional(v.number()),
    supplierOperations: v.optional(
      v.object({
        start: v.optional(v.number()),
        status: v.optional(v.number()),
        dataset: v.optional(v.number()),
        abort: v.optional(v.number()),
        delete_dataset: v.optional(v.number()),
        delete_store: v.optional(v.number()),
        delete_queue: v.optional(v.number()),
        delete_run: v.optional(v.number()),
      }),
    ),
    supplierAttempt: v.optional(
      v.object({
        generation: v.number(),
        lease: v.string(),
        reservationKey: v.string(),
        cleanupDeadline: v.number(),
      }),
    ),
    supplierRun: v.optional(
      v.object({
        id: v.string(),
        actorId: v.string(),
        buildId: v.string(),
        datasetId: v.string(),
        storeId: v.string(),
        queueId: v.string(),
        status: v.string(),
      }),
    ),
    supplierCleanup: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("unknown"),
      ),
    ),
  })
    .index("by_identity", ["platform", "creatorId"])
    .index("by_profile", ["canonical"])
    .index("by_due", ["state", "nextCheckAt"]),
  creatorSubscriptions: defineTable({
    ...tenant,
    canonical: v.string(),
    platform,
    watchId: v.optional(v.id("creatorWatches")),
    version: v.number(),
    state: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("unfollowed"),
      v.literal("quarantined"),
    ),
    cutoff: v.number(),
    mode: v.union(v.literal("future"), v.literal("latest10")),
    maxAssets: v.number(),
    maxVideoMs: v.number(),
    route: v.union(
      v.literal("own_subscription"),
      v.literal("managed_api"),
      v.literal("save_only"),
    ),
    timezone: v.string(),
    digestHour: v.number(),
    rightsAttested: v.boolean(),
    lastDigestDay: v.optional(v.string()),
    catchUpSince: v.optional(v.number()),
    deliveryWindow: v.optional(v.number()),
    deliveredAssets: v.optional(v.number()),
    deliveredVideoMs: v.optional(v.number()),
  })
    .index("by_org", ["organizationId"])
    .index("by_owner", ["organizationId", "actor"])
    .index("by_watch", ["watchId", "state"])
    .index("by_profile", ["organizationId", "actor", "canonical"]),
  creatorPosts: defineTable({
    watchId: v.id("creatorWatches"),
    postId: v.string(),
    revisionKey: v.string(),
    canonical: v.string(),
    publishedAt: v.optional(v.number()),
    observedAt: v.number(),
    // Provider metadata is not a visual/transcript analysis or evidence registry.
    metadata: v.any(),
    state: v.union(v.literal("available"), v.literal("removed")),
    version: v.number(),
    retainUntil: v.number(),
    updatedAt: v.number(),
    rights: v.optional(creatorRightsValue),
    deliveryReservationKey: v.optional(v.string()),
    cleanupPending: v.optional(v.boolean()),
    cleanupUncertain: v.optional(v.boolean()),
  })
    .index("by_watch", ["watchId"])
    .index("by_identity", ["watchId", "postId"])
    .index("by_published", ["watchId", "publishedAt"])
    .index("by_retention", ["retainUntil"])
    .index("by_cleanup", ["cleanupPending"]),
  creatorDeliveries: defineTable({
    ...tenant,
    subscriptionId: v.id("creatorSubscriptions"),
    postId: v.id("creatorPosts"),
    revisionKey: v.string(),
    sourceId: v.optional(v.id("sources")),
    sourceGeneration: v.optional(v.number()),
    state: v.union(
      v.literal("pending"),
      v.literal("saved"),
      v.literal("needs_review"),
      v.literal("suppressed"),
      v.literal("withdrawn"),
    ),
    reason: v.optional(v.string()),
    cleanupUnknown: v.optional(v.boolean()),
    digestDay: v.optional(v.string()),
  })
    .index("by_org", ["organizationId"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_post", ["postId"])
    .index("by_identity", ["subscriptionId", "postId"])
    .index("by_source", ["sourceId"])
    .index("by_owner_state", ["organizationId", "actor", "state"]),
};
