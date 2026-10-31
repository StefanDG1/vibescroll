import {
  preparedEvidenceForSource,
  verifyPrivateEvidenceAssets,
} from "./preparedEvidenceAccess";
import { resultRetained } from "../../packages/contracts/result-retention";
import {
  isServicePreparedEvidence,
  servicePreparedEvidence,
} from "../../packages/contracts/prepared-evidence";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { access, audit } from "../lib";
import { assistantGrant } from "./assistantPrincipal";
import { sourceWithinAssistantScope } from "./assistantSourceScope";
import { sourceRetained } from "./sourceAuthority";
import { currentOrderedSource } from "./workCloudMediaSource";
import { retainedCloudFrames } from "../../packages/media/cloud-frames";
import { ensure, PolicyError } from "../../packages/policy";
import { isAssistantIdentity } from "../../packages/policy/assistant";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import {
  reusableEvidenceIdentity,
  versionLimits,
} from "../../packages/contracts/analysis-versions";
import { digest } from "../product";
import { chatProposalDetail } from "../../packages/contracts/chat-proposals";

/** Read authority for a planning draft follows its exact retained analysis, not raw source.analysis. */
export async function chatProposalEvidenceReadable(
  ctx: QueryCtx,
  proposal: Doc<"proposals">,
) {
  const parsed = chatProposalDetail.safeParse(proposal.detail);
  if (!parsed.success) return false;
  const source = await ctx.db.get(proposal.sourceId);
  if (
    !source ||
    source.organizationId !== proposal.organizationId ||
    source.state === "deleted" ||
    !source.rightsAttested ||
    !sourceRetained(source.sourceRetentionUntil)
  )
    return false;
  try {
    const { version, evidence } = await retainedVersion(
      ctx,
      source,
      parsed.data._chat.binding.analysisVersionId as Id<"analysisVersions">,
    );
    return (
      version.outputHash === parsed.data._chat.binding.outputHash &&
      evidence.evidenceHash === parsed.data._chat.binding.evidenceHash &&
      evidence.revisionHash === parsed.data._chat.binding.revisionHash
    );
  } catch (error) {
    if (error instanceof PolicyError) return false;
    throw error;
  }
}
import {
  isCloudObservedMedia,
  privateCloudMediaCanonicalMatches,
} from "../../packages/social/contracts";
import { internal } from "../_generated/api";
import {
  cloudImport,
  cloudSourceVersion,
  cloudSourceEvidence,
} from "./cloudCatalog";
import {
  neutralCloudEvidence,
  neutralCloudObservations,
} from "../../packages/contracts/cloud-catalog";

export function retainedEvidenceContent(evidence: Doc<"analysisEvidence">) {
  if (isServicePreparedEvidence(evidence.prepared)) {
    const prepared = servicePreparedEvidence.parse(evidence.prepared).evidence;
    return {
      post: { ...prepared, revisionHash: prepared.sourceRevisionHash },
      transcript: prepared.segments,
      observations: neutralCloudObservations(prepared),
    };
  }
  if (evidence.owner === "service") {
    const prepared = neutralCloudEvidence.parse(evidence.prepared);
    return {
      post: prepared,
      transcript: prepared.segments,
      observations: neutralCloudObservations(prepared),
    };
  }
  return {
    post: evidence.prepared.post,
    transcript: evidence.prepared.post.segments,
    observations: evidence.prepared.evidence,
  };
}

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
  authenticatedCompletion = false,
) {
  if (source.selectedAnalysisVersionId) {
    return (
      await retainedVersion(ctx, source, source.selectedAnalysisVersionId)
    ).version;
  }
  if (source.publicImportId) {
    const layer = await ctx.db.get(source.publicImportId);
    if (cloudImport(layer))
      return (await cloudSourceVersion(ctx, source)).version;
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
        (asset.expiresAt === post.retainUntil ||
          (source.resultRetention === "until_deleted" &&
            asset.expiresAt === undefined)) &&
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
    ...(source.resultRetention
      ? { resultRetention: source.resultRetention }
      : {}),
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
  const sourceCompletion =
    authenticatedCompletion &&
    job.state === "completed" &&
    job.cloud.completionHash
      ? {
          sourceGeneration: source.generation,
          inputHash: job.cloud.inputHash,
          policyHash: job.cloud.policyHash,
          completionHash: job.cloud.completionHash,
          approvedAt: job.approvedAt,
          completedAt: source.updatedAt,
        }
      : null;
  ensure(
    !authenticatedCompletion || sourceCompletion,
    "APPROVAL_STALE",
    "Use an acknowledged authenticated Cloud completion.",
  );
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
    ...(source.resultRetention
      ? { resultRetention: source.resultRetention }
      : {}),
    insightCount: source.analysis.insights.length,
    requestedModel: job.model,
    requestedEffort: job.effort,
    ...(job.cloud.reportedModel
      ? { reportedModel: job.cloud.reportedModel }
      : {}),
    ...(job.cloud.reportedEffort
      ? { reportedEffort: job.cloud.reportedEffort }
      : {}),
    ...(sourceCompletion
      ? {
          sourceCompletion,
          recipeHash: await digest(
            canonicalJson({
              version: "initial-cloud-analysis-recipe-v1",
              policyHash: sourceCompletion.policyHash,
              pipelineVersion: source.analysisPipelineVersion ?? null,
              model: job.model,
              effort: job.effort,
            }),
          ),
        }
      : {}),
    provenance: sourceCompletion
      ? "authenticated_host_reported"
      : "legacy_recorded",
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
  if (version?.owner === "service")
    return cloudSourceVersion(ctx, source, versionId);
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
  if (evidence && isServicePreparedEvidence(evidence.prepared)) {
    await preparedEvidenceForSource(ctx, source, evidence._id);
    ensure(
      resultRetained(version),
      "SOURCE_UNAVAILABLE",
      "This analysis version is no longer retained.",
    );
    return { version, evidence };
  }
  if (evidence?.owner === "service") {
    await cloudSourceEvidence(ctx, source, evidence._id);
    const attempt = version.attemptId
      ? await ctx.db.get(version.attemptId)
      : null;
    ensure(
      resultRetained(version) &&
        attempt?.sourceId === source._id &&
        attempt.sourceGeneration === source.generation &&
        attempt.evidenceId === evidence._id &&
        attempt.resultVersionId === version._id &&
        attempt.state === "completed",
      "SOURCE_UNAVAILABLE",
      "This private candidate no longer matches its saved shared post.",
    );
    return { version, evidence };
  }
  ensure(
    evidence &&
      evidence.state === "retained" &&
      evidence.owner === "private" &&
      evidence.organizationId === source.organizationId &&
      evidence.sourceId === source._id &&
      resultRetained(evidence) &&
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
    origin: version.owner,
  };
}

export { preparedEvidenceForSource };
export async function verifyRetainedAssets(
  ctx: QueryCtx,
  source: Doc<"sources">,
  evidence: Doc<"analysisEvidence">,
) {
  if (evidence.owner === "service") {
    await cloudSourceEvidence(ctx, source, evidence._id);
    return;
  }
  await verifyPrivateEvidenceAssets(ctx, source, evidence);
}
export async function selectedAnalysis(ctx: QueryCtx, source: Doc<"sources">) {
  if (!source.selectedAnalysisVersionId) {
    if (source.publicImportId) {
      const layer = await ctx.db.get(source.publicImportId);
      if (cloudImport(layer)) {
        const shared = await cloudSourceVersion(ctx, source);
        return {
          output: shared.output,
          metadata: versionMetadata(shared.version),
          evidenceId: shared.evidence._id,
          shared,
        };
      }
    }
    return null;
  }
  const { version, evidence } = await retainedVersion(
    ctx,
    source,
    source.selectedAnalysisVersionId,
  );
  return {
    output: version.output,
    metadata: versionMetadata(version),
    evidenceId: evidence._id,
    ...(isServicePreparedEvidence(evidence.prepared)
      ? {
          preparedService: {
            version: "service-prepared-detail-v1",
            transcript: retainedEvidenceContent(evidence).transcript,
            observations: retainedEvidenceContent(evidence).observations,
            frames: evidence.frames.map((f) => ({
              id: f.frameId,
              reference: f.assetId,
              timestampMs: f.timestampMs,
            })),
          },
        }
      : {}),
    ...(evidence.owner === "service"
      ? { shared: await cloudSourceEvidence(ctx, source, evidence._id) }
      : {}),
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
