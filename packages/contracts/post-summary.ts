import { z } from "zod";

const id = z.string().min(1).max(100);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.number().int().nonnegative().nullable();
export const postSourceState = z.enum([
  "saved",
  "needs_upload",
  "queued",
  "processing",
  "ready",
  "failed",
]);
export const postStage = z.enum([
  "queued",
  "preflight",
  "acquiring",
  "preparing",
  "transcribing",
  "analyzing",
  "validating",
  "prepared",
  "inference",
  "analysis",
  "retention_cleanup_deferred",
]);
export const postOrderedPhase = z.enum([
  "queued",
  "preflight",
  "preparing",
  "prepared",
  "inference",
  "analysis",
]);
export const postExecutionState = z.enum([
  "queued",
  "running",
  "preparing",
  "analyzing",
  "completed",
  "failed",
  "canceled",
  "cancelled",
  "unknown",
  "recovering",
]);

// This is a pointer, not a claim that bytes were freshly read or remain valid.
// Rendering must use the existing asset route's current auth/state/expiry checks.
export const postThumbnailRefV1 = z.strictObject({
  kind: z.literal("source-thumbnail-asset-v1"),
  assetId: id,
  sourceId: id,
  generation: z.number().int().nonnegative(),
});
export const postProgressV1 = z.strictObject({
  version: z.literal("post-progress-v1"),
  sourceId: id,
  generation: z.number().int().nonnegative().nullable(),
  contentRevision: revision.nullable(),
  progressRevision: revision,
  state: postSourceState,
  executor: z.enum(["work_cloud", "paired_computer", "managed"]).nullable(),
  executionState: postExecutionState.nullable(),
  stage: postStage.nullable(),
  orderedPhase: postOrderedPhase.nullable(),
  active: z.boolean(),
  activeUntil: timestamp,
  availableUntil: timestamp,
  // The current producers report stages, not measured completion fractions.
  measuredProgress: z.null(),
});
export const postSummaryV1 = z.strictObject({
  version: z.literal("post-summary-v1"),
  sourceId: id,
  generation: z.number().int().nonnegative().nullable(),
  projection: z.enum(["complete", "legacy"]),
  contentRevision: revision.nullable(),
  title: z.string().max(200),
  sourceKind: z.string().max(40).nullable(),
  coverage: z.string().max(64).nullable(),
  capturedAt: timestamp,
  savedAt: timestamp,
  publishedAt: timestamp,
  availableUntil: timestamp,
  thumbnail: postThumbnailRefV1.nullable(),
  insightCount: z.number().int().nonnegative().nullable(),
  insightPreview: z
    .array(
      z.strictObject({
        insightId: z.string().min(1).max(200),
        title: z.string().max(140),
        claimExcerpt: z.string().max(240),
      }),
    )
    .max(3),
  // A bounded preview is never a complete insight page or an insight cursor.
  insightPreviewTruncated: z.boolean(),
  progress: postProgressV1,
});
export const homeSummaryV1 = z.strictObject({
  version: z.literal("home-summary-v1"),
  organizationId: id,
  // A cache discriminator only; every read must still authorize the requester.
  scopeKey: revision,
  revision,
  asOf: z.number().int().nonnegative(),
  recent: z.array(postSummaryV1).max(30),
  hasMoreRecent: z.boolean(),
  projectionComplete: z.boolean(),
  counts: z.strictObject({
    coverage: z.literal("loaded-window"),
    posts: z.number().int().min(0).max(30),
    ready: z.number().int().min(0).max(30),
    active: z.number().int().min(0).max(30),
    needsAttention: z.number().int().min(0).max(30),
  }),
});
export const postProgressPageV1 = z.strictObject({
  version: z.literal("post-progress-page-v1"),
  organizationId: id,
  scopeKey: revision,
  asOf: z.number().int().nonnegative(),
  items: z.array(postProgressV1).max(30),
  unavailableSourceIds: z.array(id).max(30),
});
export type PostSummaryV1 = z.infer<typeof postSummaryV1>;
export type PostProgressV1 = z.infer<typeof postProgressV1>;
export type HomeSummaryV1 = z.infer<typeof homeSummaryV1>;
export type PostProgressPageV1 = z.infer<typeof postProgressPageV1>;
