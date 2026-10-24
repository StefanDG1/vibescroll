import type { Doc } from "../_generated/dataModel";
import { validateOrderedAnalysis } from "../../packages/social/analysis";
import {
  socialHash,
  privateCloudMediaIdentity,
} from "../../packages/social/contracts";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { sourceRetained } from "./sourceAuthority";
export async function currentOrderedSource(
  source: Doc<"sources">,
  output: unknown = source.analysis,
) {
  if (
    !sourceRetained(source.sourceRetentionUntil) ||
    !source.rightsAttested ||
    !source.orderedMedia ||
    source.currentRevisionId
  )
    throw Error("ORDERED_SOURCE_UNAVAILABLE");
  const validated = await validateOrderedAnalysis(output, source.orderedMedia, {
    sourceId: source._id,
    generation: source.generation,
  });
  if (
    validated.prepared.post.schemaVersion === "work-cloud-observed-media-v1"
  ) {
    const post = validated.prepared.post,
      job = source.personalAnalysis;
    if (
      source.kind !== "url" ||
      !source.url ||
      source.publicImportId ||
      post.observedAt > Date.now() ||
      post.retainUntil <= Date.now() ||
      privateCloudMediaIdentity(source.url).url !== post.canonical ||
      privateCloudMediaIdentity(source.canonical).url !== post.canonical ||
      job?.executor !== "work_cloud" ||
      job.state !== "completed" ||
      job.generation !== source.generation ||
      job.cloud.schemaVersion !== "work-cloud-media-v2" ||
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
  throw Error("CLOUD_MEDIA_PROTOCOL_REQUIRED");
}
