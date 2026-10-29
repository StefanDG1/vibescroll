import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isServicePreparedEvidence } from "../../packages/contracts/prepared-evidence";
import { resultRetained } from "../../packages/contracts/result-retention";
import { privateCloudMediaCanonicalMatches } from "../../packages/social/contracts";
import { sourceRetained } from "./sourceAuthority";
import { ensure } from "../../packages/policy";

export function preparedEvidenceIsCurrent(
  source: Doc<"sources">,
  evidence: Doc<"analysisEvidence"> | null,
): evidence is Doc<"analysisEvidence"> {
  return Boolean(
    evidence &&
    evidence.owner === "private" &&
    evidence.organizationId === source.organizationId &&
    evidence.sourceId === source._id &&
    evidence.extractionGeneration === source.generation &&
    evidence.state === "retained" &&
    resultRetained(evidence) &&
    source.state !== "deleted" &&
    source.rightsAttested &&
    sourceRetained(source.sourceRetentionUntil) &&
    isServicePreparedEvidence(evidence.prepared) &&
    evidence.prepared.evidence?.evidenceHash === evidence.evidenceHash &&
    evidence.prepared.evidence?.sourceRevisionHash === evidence.revisionHash &&
    privateCloudMediaCanonicalMatches(
      source.canonical,
      evidence.prepared.requestedCanonical,
    ),
  );
}

export async function preparedEvidenceForSource(
  ctx: QueryCtx,
  source: Doc<"sources">,
  evidenceId: Id<"analysisEvidence">,
) {
  const evidence = await ctx.db.get(evidenceId);
  ensure(
    preparedEvidenceIsCurrent(source, evidence),
    "SOURCE_UNAVAILABLE",
    "Prepared source evidence is unavailable or changed.",
  );
  return evidence;
}

export async function verifyPrivateEvidenceAssets(
  ctx: QueryCtx,
  source: Doc<"sources">,
  evidence: Doc<"analysisEvidence">,
) {
  for (const frame of evidence.frames) {
    const asset = frame.assetId ? await ctx.db.get(frame.assetId) : null;
    ensure(
      asset &&
        asset.state === "complete" &&
        (asset.kind === "work_cloud_frame" ||
          (isServicePreparedEvidence(evidence.prepared) &&
            asset.kind === "prepared_frame")) &&
        asset.organizationId === source.organizationId &&
        asset.sourceId === source._id &&
        asset.sourceGeneration === evidence.extractionGeneration &&
        asset.key === frame.key &&
        asset.size === frame.size &&
        ((asset.expiresAt !== undefined && asset.expiresAt > Date.now()) ||
          (evidence.resultRetention === "until_deleted" &&
            asset.expiresAt === undefined)) &&
        !(await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", asset.key))
          .unique()),
      "SOURCE_UNAVAILABLE",
      "This version's retained screenshots are no longer available.",
    );
  }
}

export async function preparedAssetCurrent(
  ctx: QueryCtx,
  source: Doc<"sources">,
  asset: Doc<"assets">,
) {
  if (
    asset.kind !== "prepared_frame" ||
    !source.rightsAttested ||
    asset.sourceGeneration !== source.generation
  )
    return false;
  if (
    await ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", asset.key))
      .unique()
  )
    return false;
  // Private access is checked by the caller. Historical bundles remain readable
  // after a newer run; the bounded history limit is 200 versions per source.
  const bundles = await ctx.db
    .query("analysisEvidence")
    .withIndex("by_org_source", (q) =>
      q.eq("organizationId", source.organizationId).eq("sourceId", source._id),
    )
    .take(201);
  if (bundles.length > 200) return false;
  return bundles.some(
    (e) =>
      e.owner === "private" &&
      e.state === "retained" &&
      resultRetained(e) &&
      e.extractionGeneration === source.generation &&
      isServicePreparedEvidence(e.prepared) &&
      privateCloudMediaCanonicalMatches(
        source.canonical,
        e.prepared.requestedCanonical,
      ) &&
      e.frames.some(
        (f) =>
          f.assetId === asset._id &&
          f.key === asset.key &&
          f.size === asset.size,
      ),
  );
}
