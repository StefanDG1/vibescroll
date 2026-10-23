import type { Doc } from "../_generated/dataModel";
import { creatorConfiguration } from "./creatorPolicy";
import { requireSocialRights } from "../../packages/social/contracts";
import { validateSocialAnalysis } from "../../packages/social/analysis";
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
  const validated = await validateSocialAnalysis(output, source.orderedMedia, {
    sourceId: source._id,
    generation: source.generation,
  });
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
