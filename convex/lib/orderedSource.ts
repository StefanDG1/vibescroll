import { isCloudObservedMedia } from "../../packages/social/contracts";
import type { Doc } from "../_generated/dataModel";
import { creatorConfiguration } from "./creatorPolicy";
import { requireSocialRights } from "../../packages/social/contracts";
import { validateOrderedAnalysis } from "../../packages/social/analysis";
import { personalOrderedInputSchema } from "../../packages/social/ordered-intake";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { sourceRetained } from "./sourceAuthority";
import {
  socialHash,
  privateCloudMediaIdentity,
} from "../../packages/social/contracts";

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
  if (isCloudObservedMedia(validated.prepared.post)) {
    const post = validated.prepared.post,
      job = source.personalAnalysis;
    if (
      source.kind !== "url" ||
      !source.url ||
      source.creatorRights ||
      source.serviceIntent ||
      source.publicImportId ||
      post.observedAt > Date.now() ||
      post.retainUntil <= Date.now() ||
      privateCloudMediaIdentity(source.url).url !== post.canonical ||
      privateCloudMediaIdentity(source.canonical).url !== post.canonical ||
      job?.executor !== "work_cloud" ||
      job.state !== "completed" ||
      job.generation !== source.generation ||
      !job.cloud.media ||
      !job.cloud.media ||
      post.canonical !== job.cloud.media.canonicalUrl ||
      post.taskId !== job.cloud.taskId ||
      post.inputHash !== job.cloud.inputHash ||
      post.policyHash !== job.cloud.policyHash ||
      post.toolchainHash !== job.cloud.media.toolchainHash ||
      post.retainUntil !== job.cloud.media.retainUntil ||
      job.cloud.claimedAt === undefined ||
      post.observedAt < job.cloud.claimedAt ||
      (await socialHash(canonicalJson(validated.prepared))) !==
        job.cloud.media.preparationHash
    )
      throw Error("CLOUD_MEDIA_SOURCE_CHANGED");
    return validated;
  }
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
