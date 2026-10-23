import { z } from "zod";
import { validateSocialEvidence, type SocialEvidence } from "./contracts";
import { containsSecret } from "../policy/secrets.mjs";
import { insightIconKeys } from "../insights/presentation";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const citation = z.strictObject({
  kind: z.enum(["image_observation", "video_observation"]),
  id,
  startMs: z.number().int().nonnegative().max(600000).nullable(),
  endMs: z.number().int().nonnegative().max(600000).nullable(),
});
export const socialAnalysisOutput = z.strictObject({
  schemaVersion: z.literal("3.0.0"),
  sourceId: z.string().min(1).max(100),
  processingRunId: z.string().min(1).max(200),
  postRevisionHash: z.string().regex(/^[a-f0-9]{64}$/),
  coverage: z.literal("ordered_media"),
  summary: z.string().max(1500),
  warnings: z.array(z.string().max(500)).max(20),
  insights: z
    .array(
      z.strictObject({
        id,
        kind: z.enum(["idea", "lesson", "summary"]),
        title: z.string().min(1).max(160),
        claim: z.string().min(1).max(2000),
        interpretation: z.string().max(2000),
        categories: z
          .array(
            z.enum([
              "coding",
              "ai",
              "video_editing",
              "sales",
              "business_operations",
              "marketing",
              "product_design",
              "general_advice",
              "other",
            ]),
          )
          .max(5),
        topics: z.array(z.string().min(1).max(48)).max(4).optional(),
        evidence: z.array(citation).min(1).max(30),
        confidence: z.enum(["supported", "uncertain", "unsupported"]),
        verificationNeeds: z.array(z.string().max(500)).max(10),
        icon: z.enum(insightIconKeys).optional(),
      }),
    )
    .max(20),
});
export type SocialAnalysis = z.infer<typeof socialAnalysisOutput>;
export const orderedMediaSchema = z.strictObject({
  schemaVersion: z.literal("ordered-media-v1"),
  post: z.unknown(),
  evidence: z.unknown(),
});

export function socialCitation(
  ref: z.infer<typeof citation>,
  records: readonly SocialEvidence[],
) {
  const record = records.find(
    (item) => item.id === ref.id && item.kind === ref.kind,
  );
  if (
    !record ||
    (record.kind === "image_observation"
      ? ref.startMs !== null || ref.endMs !== null
      : ref.startMs !== record.startMs || ref.endMs !== record.endMs)
  )
    throw Error("INVALID_ORDERED_MEDIA_CITATION");
  // Neutral original child coordinates and hash, never a private object URL.
  return {
    id: record.id,
    kind: record.kind,
    startMs: ref.startMs,
    endMs: ref.endMs,
    assetId: record.assetId,
    assetIndex: record.assetIndex,
    postRevisionHash: record.postRevisionHash,
    textHash: record.textHash,
    basis: record.basis,
    uncertainty: record.uncertainty,
    ...(record.kind === "image_observation" && record.crop
      ? { crop: record.crop }
      : {}),
  };
}
export async function validateSocialAnalysis(
  output: unknown,
  prepared: unknown,
  binding: { sourceId: string; generation: number },
) {
  if (
    new TextEncoder().encode(JSON.stringify({ output, prepared })).length >
      512 * 1024 ||
    containsSecret(JSON.stringify({ output, prepared }))
  )
    throw Error("ORDERED_MEDIA_SIZE_OR_SECRET");
  const raw = orderedMediaSchema.parse(prepared);
  const media = await validateSocialEvidence(raw.post, raw.evidence);
  const analysis = socialAnalysisOutput.parse(output);
  if (
    analysis.sourceId !== binding.sourceId ||
    analysis.processingRunId !== `${binding.sourceId}:${binding.generation}` ||
    analysis.postRevisionHash !== media.post.revisionHash ||
    new Set(analysis.insights.map((i) => i.id)).size !==
      analysis.insights.length
  )
    throw Error("ORDERED_MEDIA_RESULT_BINDING_CHANGED");
  for (const insight of analysis.insights) {
    for (const ref of insight.evidence) {
      const summarized = socialCitation(ref, media.evidence);
      if (insight.confidence === "supported" && summarized.uncertainty.trim())
        throw Error("ORDERED_MEDIA_UNCERTAIN_EVIDENCE");
    }
  }
  return {
    analysis,
    prepared: {
      schemaVersion: "ordered-media-v1" as const,
      post: media.post,
      evidence: media.evidence,
    },
  };
}
