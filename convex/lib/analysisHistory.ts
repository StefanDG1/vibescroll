import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { access, audit } from "../lib";
import { assistantGrant } from "./assistantPrincipal";
import { sourceWithinAssistantScope } from "./assistantSourceScope";
import { sourceRetained } from "./sourceAuthority";
import { currentOrderedSource } from "./workCloudMediaSource";
import { retainedCloudFrames } from "../../packages/media/cloud-frames";
import { ensure } from "../../packages/policy";
import { isAssistantIdentity } from "../../packages/policy/assistant";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import {
  reusableEvidenceIdentity,
  versionLimits,
} from "../../packages/contracts/analysis-versions";
import { digest } from "../product";
import {
  isCloudObservedMedia,
  privateCloudMediaCanonicalMatches,
} from "../../packages/social/contracts";
import { internal } from "../_generated/api";

export async function historySource(
  ctx: QueryCtx,
  sourceId: Id<"sources">,
  write = false,
) {
  const source = await ctx.db.get(sourceId);
  ensure(
    source &&
      source.state !== "deleted" &&
      source.rightsAttested &&
      sourceRetained(source.sourceRetentionUntil),
    "SOURCE_UNAVAILABLE",
    "This retained source is unavailable.",
  );
  const identity = await ctx.auth.getUserIdentity();
  if (identity && isAssistantIdentity(identity)) {
    const a = await assistantGrant(
      ctx,
      source.organizationId,
      write ? "analysis:request" : "knowledge:read",
    );
    ensure(
      await sourceWithinAssistantScope(
        ctx,
        a.grant,
        a.organization,
        a.actor._id,
        source,
      ),
      "FORBIDDEN",
      "This source is outside the current assistant grant.",
    );
    return {
      source,
      actor: a.actor,
      organization: a.organization,
      grant: a.grant,
    };
  }
  const a = await access(
    ctx,
    source.organizationId,
    write ? ["owner"] : undefined,
  );
  return { source, actor: a.actor, organization: a.organization, grant: null };
}

/** Enroll only a complete verified baseline. No source result/generation/bytes change. */
export async function freezeAnalysisBaseline(
  ctx: MutationCtx,
  source: Doc<"sources">,
) {
  if (source.selectedAnalysisVersionId) {
    return (
      await retainedVersion(ctx, source, source.selectedAnalysisVersionId)
    ).version;
  }
  ensure(
    source.state === "ready" &&
      source.analysis &&
      source.personalAnalysis?.executor === "work_cloud",
    "SOURCE_UNAVAILABLE",
    "Choose a completed Cloud video with retained evidence.",
  );
  const validated = await currentOrderedSource(source);
  const post = validated.prepared.post;
  ensure(
    isCloudObservedMedia(post),
    "SOURCE_UNAVAILABLE",
    "Use retained Cloud video observations.",
  );
  const retained = retainedCloudFrames(source);
  ensure(
    post.frames.length > 0 && retained.length === post.frames.length,
    "SOURCE_UNAVAILABLE",
    "This analysis does not have all of its retained screenshots.",
  );
  const frames = [];
  for (const frame of post.frames) {
    const saved = retained.find((r) => r.frameId === frame.id)!;
    const assetId = ctx.db.normalizeId("assets", saved.assetId);
    const asset = assetId ? await ctx.db.get(assetId) : null;
    const deletion = asset
      ? await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", asset.key))
          .unique()
      : null;
    ensure(
      asset &&
        asset.kind === "work_cloud_frame" &&
        asset.state === "complete" &&
        asset.sourceId === source._id &&
        asset.organizationId === source.organizationId &&
        asset.sourceGeneration === source.generation &&
        asset.size === saved.size &&
        asset.expiresAt === post.retainUntil &&
        !deletion,
      "SOURCE_UNAVAILABLE",
      "The retained screenshot was removed or changed.",
    );
    frames.push({
      frameId: frame.id,
      assetId: asset._id,
      key: asset.key,
      sha256: frame.sha256,
      size: frame.bytes,
      timestampMs: frame.timestampMs,
      width: frame.width,
      height: frame.height,
    });
  }
  const now = Date.now();
  const retainUntil = Math.min(
    post.retainUntil,
    source.sourceRetentionUntil ?? Infinity,
  );
  const evidenceId = await ctx.db.insert("analysisEvidence", {
    owner: "private",
    organizationId: source.organizationId,
    sourceId: source._id,
    createdAt: now,
    state: "retained",
    canonical: post.canonical,
    evidenceHash: await digest(
      reusableEvidenceIdentity({ post, evidence: validated.prepared.evidence }),
    ),
    revisionHash: post.revisionHash,
    retainUntil,
    prepared: validated.prepared,
    frames,
    extractionGeneration: source.generation,
    extractionPreparationHash:
      source.personalAnalysis.cloud.media!.preparationHash!,
  });
  await ctx.scheduler.runAfter(
    Math.max(0, retainUntil - now),
    internal.analysisVersions.expireEvidence,
    { evidenceId },
  );
  const job = source.personalAnalysis;
  const number = source.nextAnalysisVersionNumber ?? 1;
  ensure(
    Number.isSafeInteger(number) &&
      number >= 1 &&
      number <= versionLimits.maximumVersions,
    "LIMIT_EXCEEDED",
    "This post reached its analysis-history limit.",
  );
  const versionId = await ctx.db.insert("analysisVersions", {
    owner: "private",
    organizationId: source.organizationId,
    sourceId: source._id,
    createdAt: now,
    evidenceId,
    number,
    state: "ready",
    output: source.analysis,
    outputHash: await digest(canonicalJson(source.analysis)),
    summary: source.analysis.summary,
    retainUntil,
    insightCount: source.analysis.insights.length,
    requestedModel: job.model,
    requestedEffort: job.effort,
    ...(job.cloud.reportedModel
      ? { reportedModel: job.cloud.reportedModel }
      : {}),
    ...(job.cloud.reportedEffort
      ? { reportedEffort: job.cloud.reportedEffort }
      : {}),
    provenance: "legacy_recorded",
    evaluation: "review_required",
  });
  await ctx.db.patch(source._id, {
    selectedAnalysisVersionId: versionId,
    analysisSelectionRevision: 0,
    nextAnalysisVersionNumber: number + 1,
    selectedAnalysisSummary: source.analysis.summary,
    selectedAnalysisInsightCount: source.analysis.insights.length,
    selectedAnalysisMainPoints: source.analysis.insights
      .slice(0, 3)
      .map((i: { title: string }) => i.title),
  });
  return (await ctx.db.get(versionId))!;
}

export async function retainedVersion(
  ctx: QueryCtx,
  source: Doc<"sources">,
  versionId: Id<"analysisVersions">,
) {
  const version = await ctx.db.get(versionId);
  ensure(
    version &&
      version.state === "ready" &&
      version.output &&
      version.owner === "private" &&
      version.organizationId === source.organizationId &&
      version.sourceId === source._id,
    "FORBIDDEN",
    "This analysis version is unavailable to this source.",
  );
  const evidence = await ctx.db.get(version.evidenceId);
  ensure(
    evidence &&
      evidence.state === "retained" &&
      evidence.owner === "private" &&
      evidence.organizationId === source.organizationId &&
      evidence.sourceId === source._id &&
      evidence.retainUntil > Date.now() &&
      source.state === "ready" &&
      source.generation === evidence.extractionGeneration &&
      source.orderedMedia?.post.revisionHash === evidence.revisionHash &&
      source.rightsAttested &&
      sourceRetained(source.sourceRetentionUntil) &&
      privateCloudMediaCanonicalMatches(source.canonical, evidence.canonical),
    "SOURCE_UNAVAILABLE",
    "This version's retained evidence has expired or changed.",
  );
  return { version, evidence };
}

export function versionMetadata(version: Doc<"analysisVersions">) {
  return {
    id: version._id,
    number: version.number,
    state: version.state,
    createdAt: version.createdAt,
    summary: version.summary,
    insightCount: version.insightCount,
    provenance: version.provenance,
    requestedModel: version.requestedModel ?? null,
    requestedEffort: version.requestedEffort ?? null,
    reportedModel: version.reportedModel ?? null,
    reportedEffort: version.reportedEffort ?? null,
    evaluation: version.evaluation,
  };
}
export async function verifyRetainedAssets(
  ctx: QueryCtx,
  source: Doc<"sources">,
  evidence: Doc<"analysisEvidence">,
) {
  for (const frame of evidence.frames) {
    const asset = frame.assetId ? await ctx.db.get(frame.assetId) : null;
    ensure(
      asset &&
        asset.state === "complete" &&
        asset.kind === "work_cloud_frame" &&
        asset.organizationId === source.organizationId &&
        asset.sourceId === source._id &&
        asset.sourceGeneration === evidence.extractionGeneration &&
        asset.key === frame.key &&
        asset.size === frame.size &&
        asset.expiresAt !== undefined &&
        asset.expiresAt > Date.now() &&
        !(await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", asset.key))
          .unique()),
      "SOURCE_UNAVAILABLE",
      "This version's retained screenshots are no longer available.",
    );
  }
}
export async function selectedAnalysis(ctx: QueryCtx, source: Doc<"sources">) {
  if (!source.selectedAnalysisVersionId) return null;
  const { version, evidence } = await retainedVersion(
    ctx,
    source,
    source.selectedAnalysisVersionId,
  );
  return {
    output: version.output,
    metadata: versionMetadata(version),
    evidenceId: evidence._id,
  };
}

export async function recordSelection(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actorId: Id<"users">,
  version: Doc<"analysisVersions">,
  expectedRevision: number,
) {
  ensure(
    (source.analysisSelectionRevision ?? 0) === expectedRevision,
    "APPROVAL_STALE",
    "The selected analysis changed. Refresh history before selecting a version.",
  );
  if (source.selectedAnalysisVersionId === version._id)
    return { revision: expectedRevision, changed: false };
  await ctx.db.patch(source._id, {
    selectedAnalysisVersionId: version._id,
    analysisSelectionRevision: expectedRevision + 1,
    selectedAnalysisSummary: version.summary,
    selectedAnalysisInsightCount: version.insightCount,
    selectedAnalysisMainPoints: version.output.insights
      .slice(0, 3)
      .map((i: { title: string }) => i.title),
  });
  await audit(
    ctx,
    source.organizationId,
    actorId,
    "analysis_version_selected",
    `${source._id}:${source.selectedAnalysisVersionId ?? "legacy"}:${version._id}:${expectedRevision + 1}`,
  );
  return { revision: expectedRevision + 1, changed: true };
}
