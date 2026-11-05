import { z } from "zod";
import { socialAnalysisOutput } from "../social/analysis";

const id = z.string().min(1).max(100);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const position = z.number().int().nonnegative();
export const postContextReadInput = z.strictObject({
  id: z.string().min(1).max(300),
  profileId: id.optional(),
  cursor: z.string().max(4096).optional(),
  sharedGrantId: id.optional(),
  sharedGrantVersion: z.number().int().positive().optional(),
});
export const postContextFrameInput = z.strictObject({
  profileId: id.optional(),
  sourceId: id,
  analysisVersionId: id,
  frameId: id,
  expectedEvidenceHash: hash,
  sharedGrantId: id.optional(),
  sharedGrantVersion: z.number().int().positive().optional(),
});
const segment = z.strictObject({
  id,
  startMs: position,
  endMs: position,
  text: z.string().max(6000),
  textHash: hash,
});
const observation = z.strictObject({
  id,
  kind: z.enum(["image_observation", "video_observation"]),
  assetId: id,
  assetIndex: position,
  basis: z.enum(["transcript", "visible", "ocr"]),
  text: z.string().max(6000).nullable(),
  textHash: hash,
  segmentId: id.nullable(),
  frameIds: z.array(id).max(8),
  startMs: position.nullable(),
  endMs: position.nullable(),
  uncertainty: z.string().max(2000),
});
export const postContextItem = z.union([
  z.strictObject({ kind: z.literal("transcript"), value: segment }),
  z.strictObject({ kind: z.literal("observation"), value: observation }),
  z.strictObject({
    kind: z.literal("insight"),
    value: socialAnalysisOutput.shape.insights.element,
  }),
]);
export const postContextDataOutput = z.strictObject({
  schemaVersion: z.literal("post-context-v1"),
  sourceId: id,
  analysisVersionId: id,
  evidenceHash: hash,
  revisionHash: hash,
  outputHash: hash,
  canonical: z.string().url(),
  platform: z.string(),
  authorName: z.string().nullable(),
  durationMs: position.nullable(),
  provenance: z.string(),
  summary: z.string().max(1500),
  warnings: z.array(z.string().max(500)).max(20),
  coverage: z.string(),
  frames: z
    .array(
      z.strictObject({
        frameId: id,
        timestampMs: position,
        sha256: hash,
        size: position,
        width: position,
        height: position,
      }),
    )
    .max(8),
  totals: z.strictObject({
    transcript: position,
    observations: position,
    insights: position,
  }),
  items: z.array(postContextItem).max(100),
  offset: position,
  next_cursor: z.string().nullable(),
  complete: z.boolean(),
  coverage_notice: z.string(),
});
export const postContextPageOutput = z.strictObject({
  id: z.string().max(300),
  title: z.string(),
  text: z.string(),
  format: z.literal("post_context_v1"),
  context: postContextDataOutput,
  url: z.string().url(),
  profile_id: id,
  grant_version: z.number().int().positive(),
  more_ideas: z.boolean(),
  scope_notice: z.string(),
});
export const postContextCursor = z.strictObject({
  version: z.literal(1),
  binding: hash,
  offset: z.number().int().positive().max(1024),
});
export const postContextFrameOutput = z.strictObject({
  mimeType: z.literal("image/jpeg"),
  data: z.string().max(200000),
  frameId: id,
  timestampMs: position,
  sha256: hash,
  sourceId: id,
  analysisVersionId: id,
  evidenceHash: hash,
});
export type PostContextItem = z.infer<typeof postContextItem>;
export type PostContextPage = z.infer<typeof postContextPageOutput>;
