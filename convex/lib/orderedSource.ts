import type { Doc } from "../_generated/dataModel";
import { creatorConfiguration } from "./creatorPolicy";
import { requireSocialRights } from "../../packages/social/contracts";
import { validateOrderedAnalysis } from "../../packages/social/analysis";
import { personalOrderedInputSchema } from "../../packages/social/ordered-intake";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { sourceRetained } from "./sourceAuthority";

export async function currentOrderedSource(
  source: Doc<"sources">,
  output: unknown = source.analysis,
) {
  if (
    !sourceRetained(source) ||
    !source.rightsAttested ||
    !source.orderedMedia ||
    source.currentRevisionId
  )
    throw Error("ORDERED_SOURCE_UNAVAILABLE");
  const validated = await validateOrderedAnalysis(output, source.orderedMedia, {
    sourceId: source._id,
    generation: source.generation,
  });
  if (validated.prepared.post.schemaVersion === "provided-media-v1") {
    const input = personalOrderedInputSchema.parse(source.personalOrderedInput);
    const {
      assets: _assets,
      captionHash: _captionHash,
      revisionHash: _revisionHash,
      coverage: _coverage,
      ...metadata
    } = validated.prepared.post;
    if (
      source.kind !== "upload" ||
      source.creatorRights ||
      source.serviceIntent ||
      validated.prepared.post.observedAt > Date.now() ||
      source.canonical !== `provided:${validated.prepared.post.submissionId}` ||
      canonicalJson(metadata) !== canonicalJson(input.metadata) ||
      !validated.prepared.post.assets.every((asset) =>
        input.assets.some(
          (original) =>
            original.id === asset.id &&
            original.index === asset.index &&
            original.kind === asset.kind &&
            original.bytes === asset.bytes &&
            original.sha256 === asset.contentHash,
        ),
      )
    )
      throw Error("PROVIDED_MEDIA_SOURCE_CHANGED");
    return validated;
  }
  const now = Date.now(),
    policy = creatorConfiguration(now);
  if (
    !policy ||
    validated.prepared.post.providerEvidenceId !== policy.rights.evidenceId ||
    validated.prepared.post.observedAt > now ||
    validated.prepared.post.observedAt < policy.rights.reviewedAt ||
    source.sourceRetentionUntil === undefined ||
    source.sourceRetentionUntil >
      Math.min(
        policy.expiresAt,
        policy.rights.expiresAt,
        validated.prepared.post.observedAt + policy.rights.maxRetentionMs,
      )
  )
    throw Error("ORDERED_SOURCE_PERMISSION_CHANGED");
  requireSocialRights(
    policy.rights,
    {
      provider: policy.provider,
      platform: validated.prepared.post.platform,
      creatorId: validated.prepared.post.creatorId,
      workload: "analysis",
      route:
        source.personalAnalysis?.generation === source.generation
          ? "own_subscription"
          : "managed_api",
    },
    now,
  );
  return validated;
}
