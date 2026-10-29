import { z } from "zod";
import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { writeAccess, access } from "./lib";
import { captureAuthorized, digest, reserve } from "./product";
import { ensure, containsSecret } from "../packages/policy";
import {
  privateCloudMediaIdentity,
  privateCloudMediaCanonicalMatches,
} from "../packages/social/contracts";
import {
  validatePreparedEvidence,
  preparedAnalysisInstructions,
  preparationStages,
} from "../packages/contracts/prepared-evidence";
import { neutralCloudObservations } from "../packages/contracts/cloud-catalog";
import {
  analysisVersionOutput,
  validateVersionOutput,
  versionLimits,
  retainedAnalysisInstructions,
} from "../packages/contracts/analysis-versions";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { insertAsset } from "./lib/storageUsage";
import { savedCloudRoute, savedCloudGrantCurrent } from "./lib/workCloudSave";
import { notifyVersionWaiting } from "./lib/assistantEvents";
import { admitCloudMediaJob } from "./lib/workCloudAdmission";
import { freezeAnalysisBaseline } from "./lib/analysisHistory";
import { postDisplayTitle } from "../packages/sources/display";
import { postThumbnailCandidates } from "../packages/sources/thumbnail";
import { apiTranscriptResponse } from "../packages/contracts/transcription";

const policySchema = z.strictObject({
  id: z.string().min(8).max(80),
  subject: z.string(),
  canonical: z.string().url(),
  maximumRuns: z.number().int().min(1).max(4),
  maximumApiUsd: z.number().min(0.02).max(0.05),
  expiresAt: z.number().int(),
  contributorAllowed: z.literal(true),
  executor: z.enum(["gateway", "work_cloud"]),
});

export function preparedPolicy(subject: string, canonical: string) {
  if (!process.env.PREPARED_MEDIA_ALPHA_JSON) return null;
  const policy = policySchema.parse(
    JSON.parse(process.env.PREPARED_MEDIA_ALPHA_JSON),
  );
  return policy.subject === subject &&
    policy.expiresAt > Date.now() &&
    privateCloudMediaCanonicalMatches(
      canonical,
      privateCloudMediaIdentity(policy.canonical).url,
    )
    ? policy
    : null;
}

async function current(ctx: QueryCtx, id: Id<"mediaPreparations">) {
  const run = await ctx.db.get(id),
    source = run ? await ctx.db.get(run.sourceId) : null;
  ensure(
    run &&
      source &&
      source.organizationId === run.organizationId &&
      source.generation === run.generation &&
      source.state !== "deleted" &&
      source.rightsAttested &&
      process.env.RESTORE_LOCK !== "true" &&
      privateCloudMediaCanonicalMatches(source.canonical, run.canonical),
    "APPROVAL_STALE",
    "The preparation or source authority changed.",
  );
  const actor = await ctx.db.get(run.actor),
    org = await ctx.db.get(run.organizationId);
  const member = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", run.organizationId).eq("userId", run.actor),
    )
    .unique();
  ensure(
    actor?.status === "active" &&
      org?.status === "active" &&
      member?.role === "owner",
    "FORBIDDEN",
    "The preparation owner no longer has access.",
  );
  return { run, source, actor, org };
}

async function active(ctx: QueryCtx, id: Id<"mediaPreparations">) {
  const c = await current(ctx, id);
  const policy = preparedPolicy(c.actor.subject, c.run.canonical);
  ensure(
    c.run.deadline > Date.now() &&
      policy?.id === c.run.policyId &&
      policy.executor === c.run.executor &&
      policy.maximumApiUsd >= c.run.maximumApiUsd,
    "APPROVAL_STALE",
    "The bounded preparation policy changed or expired.",
  );
  return { ...c, policy };
}

export async function queuePreparedComparison(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actor: Doc<"users">,
  key: string,
) {
  const policy = preparedPolicy(actor.subject, source.canonical);
  if (!policy) return null;
  ensure(
    /^[A-Za-z0-9_-]{8,64}$/.test(key),
    "INVALID_INPUT",
    "Use a bounded preparation key.",
  );
  const existing = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_org_source_key", (q) =>
      q
        .eq("organizationId", source.organizationId)
        .eq("sourceId", source._id)
        .eq("key", key),
    )
    .unique();
  if (existing) return existing._id;
  const prior = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_actor_policy", (q) =>
      q.eq("actor", actor._id).eq("policyId", policy.id),
    )
    .take(5);
  ensure(
    prior.length < policy.maximumRuns &&
      !prior.some((r) => !["ready", "failed"].includes(r.state)),
    "QUOTA_EXCEEDED",
    "The bounded preparation comparison is already used or unresolved.",
  );
  ensure(
    policy.executor !== "gateway" ||
      !prior.some(
        (r) =>
          r.executor === "gateway" &&
          !(
            r.state === "failed" &&
            knownReturnedPreparationFailure(
              { ...r, state: r.receipt?.failure?.stage },
              r.receipt?.failure?.code,
            )
          ),
      ),
    "QUOTA_EXCEEDED",
    "The single approved Muse comparison is already reserved.",
  );
  ensure(
    !source.pendingAnalysisAttemptId &&
      !["queued", "running", "recovering", "unknown"].includes(
        source.personalAnalysis?.state ?? "",
      ) &&
      source.kind === "url" &&
      source.rightsAttested,
    "SOURCE_BUSY",
    "Preserve the existing source execution.",
  );
  ensure(
    !source.workCloudSaveIntent ||
      source.workCloudSaveIntent.analysisGeneration !== undefined ||
      source.workCloudSaveIntent.expiresAt <= Date.now(),
    "SOURCE_BUSY",
    "Preserve the existing saved-link request.",
  );
  if (
    source.state === "ready" &&
    source.analysis &&
    !source.selectedAnalysisVersionId &&
    !source.publicImportId
  ) {
    await freezeAnalysisBaseline(ctx, source);
    source = (await ctx.db.get(source._id))!;
  }
  const route = await savedCloudRoute(
    ctx,
    actor,
    (await ctx.db.get(source.organizationId))!,
  );
  const grant = route?.grantId ? await ctx.db.get(route.grantId) : null;
  ensure(
    policy.executor === "gateway" || (route?.available && grant),
    "SETUP_REQUIRED",
    "The current native Assistant is required for automatic subscription analysis.",
  );
  const now = Date.now();
  ensure(
    !source.personalMedia?.runId ||
      ["ready", "failed"].includes(source.personalMedia.stage),
    "SOURCE_BUSY",
    "The previous preparation is still unresolved.",
  );
  const id = await ctx.db.insert("mediaPreparations", {
    organizationId: source.organizationId,
    sourceId: source._id,
    actor: actor._id,
    key,
    policyId: policy.id,
    generation: source.generation,
    canonical: privateCloudMediaIdentity(source.canonical).url,
    executor: policy.executor,
    state: "queued",
    createdAt: now,
    updatedAt: now,
    deadline: now + 900000,
    maximumApiUsd: policy.maximumApiUsd,
    ...(grant ? { grantId: grant._id, grantVersion: grant.version } : {}),
    stages: [{ stage: "queued", at: now }],
  });
  await ctx.db.patch(source._id, {
    personalMedia: {
      ...source.personalMedia,
      version: "service-preparation-progress-v1",
      runId: id,
      stage: "queued",
      executor: policy.executor,
      updatedAt: now,
    },
  });
  await ctx.scheduler.runAfter(0, internal.preparedMedia.run, { runId: id });
  await ctx.scheduler.runAfter(900000, internal.preparedAnalysis.expire, {
    runId: id,
  });
  return id;
}

export const begin = mutation({
  args: {
    organizationId: v.id("organizations"),
    url: v.string(),
    key: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const owner = await writeAccess(ctx, args.organizationId, ["owner"]);
    const canonical = privateCloudMediaIdentity(args.url).url;
    ensure(
      preparedPolicy(owner.actor.subject, canonical),
      "FORBIDDEN",
      "This prepared-media comparison is not enabled for this owner and source.",
    );
    const sourceId = await captureAuthorized(
      ctx,
      {
        organizationId: args.organizationId,
        url: args.url,
        key: args.key,
        kind: "url",
        title: "Imported video link",
        rightsAttested: true,
      },
      owner,
      true,
      true,
    );
    const source = (await ctx.db.get(sourceId))!;
    const runId = await queuePreparedComparison(
      ctx,
      source,
      owner.actor,
      args.key,
    );
    ensure(runId, "APPROVAL_STALE", "The comparison policy changed.");
    return { sourceId, runId };
  },
});

export const input = internalQuery({
  args: { runId: v.id("mediaPreparations") },
  returns: v.any(),
  handler: async (ctx, { runId }) => {
    const c = await active(ctx, runId);
    ensure(
      !["ready", "failed", "unknown"].includes(c.run.state),
      "APPROVAL_STALE",
      "This preparation is no longer active.",
    );
    return {
      ...c.run,
      url: c.source.url ?? c.source.canonical,
      contributorAllowed: c.policy.contributorAllowed,
    };
  },
});

// A committed claim precedes every external dispatch. Scheduler redelivery never
// repeats paid work, including when the first action loses its response.
export const claim = internalMutation({
  args: { runId: v.id("mediaPreparations") },
  returns: v.boolean(),
  handler: async (ctx, { runId }) => {
    const c = await active(ctx, runId);
    if (c.run.state !== "queued") return false;
    const now = Date.now();
    await ctx.db.patch(runId, {
      state: "starting",
      updatedAt: now,
      stages: [...c.run.stages, { stage: "starting", at: now }],
    });
    await ctx.db.patch(c.source._id, {
      personalMedia: {
        ...c.source.personalMedia,
        stage: "starting",
        updatedAt: now,
      },
    });
    return true;
  },
});

export const progress = internalMutation({
  args: {
    runId: v.id("mediaPreparations"),
    stage: v.string(),
    metadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await active(ctx, a.runId);
    ensure(
      c.run.deadline > Date.now() &&
        !["ready", "failed", "unknown"].includes(c.run.state) &&
        preparationStages.includes(a.stage as any),
      "APPROVAL_STALE",
      "This preparation is no longer active.",
    );
    const now = Date.now();
    await ctx.db.patch(a.runId, {
      state: a.stage,
      updatedAt: now,
      stages: [...c.run.stages, { stage: a.stage, at: now }].slice(-24),
      ...(a.metadata ? { metadata: a.metadata } : {}),
    });
    await ctx.db.patch(c.source._id, {
      personalMedia: {
        ...c.source.personalMedia,
        version: "service-preparation-progress-v1",
        runId: a.runId,
        stage: a.stage,
        executor: c.run.executor,
        updatedAt: now,
      },
    });
    if (a.metadata) {
      const metadata = z
        .object({
          title: z.string().max(160).optional(),
          authorName: z.string().max(160).optional(),
          durationSeconds: z.number().positive().max(600).optional(),
        })
        .parse(a.metadata);
      ensure(
        !containsSecret(canonicalJson(metadata)),
        "INVALID_EVIDENCE",
        "Metadata contains sensitive material.",
      );
      await ctx.db.patch(c.source._id, {
        linkPreview: {
          ...c.source.linkPreview,
          ...metadata,
          origin: "extractor",
          state: "ready",
          updatedAt: now,
        },
      });
    }
    return null;
  },
});

export const retain = internalMutation({
  args: {
    runId: v.id("mediaPreparations"),
    prepared: v.any(),
    frames: v.array(
      v.object({
        frameId: v.string(),
        key: v.string(),
        sha256: v.string(),
        size: v.number(),
        timestampMs: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
    receipt: v.any(),
  },
  returns: v.id("analysisEvidence"),
  handler: async (ctx, a) => {
    const c = await active(ctx, a.runId);
    ensure(
      c.run.state === "transcribing" || c.run.state === "preparing",
      "APPROVAL_STALE",
      "Evidence cannot replace a completed preparation.",
    );
    const prepared = await validatePreparedEvidence(a.prepared),
      e = prepared.evidence;
    ensure(
      privateCloudMediaCanonicalMatches(
        c.source.canonical,
        prepared.requestedCanonical,
      ) &&
        a.frames.length === e.frames.length &&
        a.frames.every(
          (f, i) =>
            f.key.startsWith(`${c.run.organizationId}/prepared-`) &&
            !f.key.slice(c.run.organizationId.length + 1).includes("/") &&
            f.frameId === e.frames[i].id &&
            f.sha256 === e.frames[i].sha256 &&
            f.size === e.frames[i].bytes &&
            f.timestampMs === e.frames[i].timestampMs &&
            f.width === e.frames[i].width &&
            f.height === e.frames[i].height,
        ),
      "INVALID_EVIDENCE",
      "Prepared storage references do not match the source evidence.",
    );
    const usage = await ctx.db
      .query("storageUsage")
      .withIndex("by_org", (q) => q.eq("organizationId", c.run.organizationId))
      .unique();
    ensure(
      usage &&
        usage.bytes + a.frames.reduce((n, f) => n + f.size, 0) <= 1000000000,
      "QUOTA_EXCEEDED",
      "Evidence storage exceeds the comparison allowance.",
    );
    const now = Date.now(),
      frames = [];
    for (const f of a.frames) {
      const assetId = await insertAsset(ctx, {
        organizationId: c.run.organizationId,
        sourceId: c.source._id,
        sourceGeneration: c.source.generation,
        key: f.key,
        size: f.size,
        type: "image/jpeg",
        kind: "prepared_frame",
        state: "complete",
        createdAt: now,
        updatedAt: now,
      });
      frames.push({ ...f, assetId });
    }
    const evidenceId = await ctx.db.insert("analysisEvidence", {
      owner: "private",
      organizationId: c.run.organizationId,
      sourceId: c.source._id,
      createdAt: now,
      resultRetention: "until_deleted",
      state: "retained",
      canonical: c.run.canonical,
      evidenceHash: e.evidenceHash,
      revisionHash: e.sourceRevisionHash,
      retainUntil: now + 86400000,
      prepared,
      frames,
      extractionGeneration: c.source.generation,
      extractionPreparationHash: await digest(canonicalJson(prepared)),
    });
    await ctx.db.patch(a.runId, {
      evidenceId,
      receipt: a.receipt,
      state: "evidence_ready",
      updatedAt: now,
      stages: [...c.run.stages, { stage: "evidence_ready", at: now }],
    });
    await ctx.db.patch(c.source._id, {
      personalMedia: {
        ...c.source.personalMedia,
        version: "service-preparation-progress-v1",
        runId: a.runId,
        stage: "evidence_ready",
        executor: c.run.executor,
        evidenceId,
        updatedAt: now,
      },
      linkPreview: {
        ...c.source.linkPreview,
        state: "ready",
        origin: "extractor",
        assetId: frames[0].assetId,
        title: prepared.metadata.title.slice(0, 160),
        authorName: prepared.metadata.authorName,
        durationSeconds: e.durationMs / 1000,
        updatedAt: now,
      },
    });
    return evidenceId;
  },
});

export const finishGateway = internalMutation({
  args: { runId: v.id("mediaPreparations"), output: v.any(), receipt: v.any() },
  returns: v.id("analysisVersions"),
  handler: async (ctx, a) => {
    const c = await current(ctx, a.runId);
    if (c.run.state === "ready" && c.run.versionId) {
      const version = (await ctx.db.get(c.run.versionId))!;
      ensure(
        version.outputHash === (await digest(canonicalJson(a.output))),
        "APPROVAL_STALE",
        "Completed outputs are immutable.",
      );
      return version._id;
    }
    ensure(
      c.run.deadline > Date.now() &&
        c.run.executor === "gateway" &&
        c.run.state === "analyzing" &&
        c.run.evidenceId,
      "APPROVAL_STALE",
      "Use the active funded Gateway run.",
    );
    const evidence = (await ctx.db.get(c.run.evidenceId))!;
    const prepared = await validatePreparedEvidence(evidence.prepared);
    const output = validateVersionOutput(a.output, {
      sourceId: c.source._id,
      attemptId: a.runId,
      evidenceHash: evidence.evidenceHash,
      postRevisionHash: evidence.revisionHash,
      evidence: neutralCloudObservations(prepared.evidence),
    });
    ensure(
      a.receipt?.model === "meta/muse-spark-1.3-contributor" &&
        a.receipt.rateEstimateUsd <= c.run.maximumApiUsd,
      "COST_RECONCILIATION_REQUIRED",
      "The Gateway receipt exceeds its funded run.",
    );
    const now = Date.now(),
      number =
        c.source.nextAnalysisVersionNumber ?? (c.source.publicImportId ? 2 : 1);
    ensure(
      number <= versionLimits.maximumVersions,
      "LIMIT_EXCEEDED",
      "Analysis history limit reached.",
    );
    const versionId = await ctx.db.insert("analysisVersions", {
      owner: "private",
      organizationId: c.run.organizationId,
      sourceId: c.source._id,
      createdAt: now,
      resultRetention: "until_deleted",
      evidenceId: evidence._id,
      number,
      state: "ready",
      output,
      outputHash: await digest(canonicalJson(output)),
      summary: output.summary,
      insightCount: output.insights.length,
      retainUntil: evidence.retainUntil,
      recipeHash: await digest(
        canonicalJson({
          protocol: "gateway-analysis-v1",
          model: a.receipt.model,
          effort: "medium",
          instructions: preparedAnalysisInstructions,
          outputSchema: z.toJSONSchema(analysisVersionOutput),
        }),
      ),
      requestedModel: a.receipt.model,
      requestedEffort: "medium",
      reportedModel: a.receipt.model,
      reportedEffort: "medium",
      provenance: "managed_api_reported",
      evaluation: "review_required",
    });
    await ctx.db.patch(a.runId, {
      state: "ready",
      versionId,
      updatedAt: now,
      receipt: { ...c.run.receipt, analysis: a.receipt },
      stages: [...c.run.stages, { stage: "ready", at: now }],
    });
    const select =
      !c.source.selectedAnalysisVersionId &&
      !c.source.analysis &&
      !c.source.publicImportId;
    await ctx.db.patch(c.source._id, {
      nextAnalysisVersionNumber: number + 1,
      ...(select
        ? {
            state: "ready" as const,
            updatedAt: now,
            coverage: prepared.evidence.segments.length
              ? ("full_sampled" as const)
              : ("visual_only" as const),
            selectedAnalysisVersionId: versionId,
            analysisSelectionRevision: 0,
            selectedAnalysisSummary: output.summary,
            selectedAnalysisInsightCount: output.insights.length,
            selectedAnalysisMainPoints: output.insights
              .slice(0, 3)
              .map((i) => i.title),
          }
        : {}),
      personalMedia: {
        ...c.source.personalMedia,
        version: "service-preparation-progress-v1",
        runId: a.runId,
        stage: "ready",
        executor: c.run.executor,
        evidenceId: evidence._id,
        versionId,
        updatedAt: now,
      },
    });
    return versionId;
  },
});

export const queueSubscription = internalMutation({
  args: { runId: v.id("mediaPreparations") },
  returns: v.id("analysisAttempts"),
  handler: async (ctx, { runId }) => {
    const c = await active(ctx, runId);
    if (c.run.attemptId) return c.run.attemptId;
    ensure(
      c.run.executor === "work_cloud" &&
        c.run.state === "evidence_ready" &&
        c.run.evidenceId &&
        c.run.grantId,
      "APPROVAL_STALE",
      "Use the prepared subscription request.",
    );
    const grant = await ctx.db.get(c.run.grantId);
    ensure(
      grant &&
        grant.version === c.run.grantVersion &&
        (await savedCloudGrantCurrent(ctx, c.actor, c.org, grant)),
      "APPROVAL_STALE",
      "The native Assistant grant changed.",
    );
    await admitCloudMediaJob(ctx, c.actor, { configuredOnly: true });
    const evidence = (await ctx.db.get(c.run.evidenceId))!,
      now = Date.now(),
      number =
        c.source.nextAnalysisVersionNumber ?? (c.source.publicImportId ? 2 : 1);
    ensure(
      !c.source.pendingAnalysisAttemptId &&
        number <= versionLimits.maximumVersions,
      "SOURCE_BUSY",
      "Preserve the current analysis attempt.",
    );
    const config = grant.cloudSaveDefaults!;
    const recipeHash = await digest(
      canonicalJson({
        protocol: "work-cloud-retained-analysis-v1",
        instructions: retainedAnalysisInstructions,
        outputSchema: z.toJSONSchema(analysisVersionOutput),
      }),
    );
    const attemptId = await ctx.db.insert("analysisAttempts", {
      organizationId: c.run.organizationId,
      sourceId: c.source._id,
      actor: c.actor._id,
      key: `prepared-${runId}`,
      createdAt: now,
      updatedAt: now,
      evidenceId: evidence._id,
      sourceGeneration: c.source.generation,
      canonical: c.run.canonical,
      inputHash: await digest(
        canonicalJson({ runId, evidenceHash: evidence.evidenceHash }),
      ),
      recipeHash,
      variantKey: await digest(
        `${evidence.evidenceHash}:${config.model}:${config.effort}`,
      ),
      number,
      expectedSelectionRevision: c.source.analysisSelectionRevision ?? 0,
      model: config.model,
      effort: config.effort,
      grantId: grant._id,
      grantVersion: grant.version,
      clientId: grant.clientId,
      state: "queued",
      expiresAt: now + 900000,
      leaseUntil: 0,
      deadline: 0,
      viewedFrameIds: [],
    });
    await reserve(ctx, c.run.organizationId, `analysisVersion:${attemptId}`, 0);
    await ctx.db.patch(c.source._id, {
      pendingAnalysisAttemptId: attemptId,
      pendingAnalysisAttemptState: "queued",
      nextAnalysisVersionNumber: number + 1,
      personalMedia: {
        ...c.source.personalMedia,
        version: "service-preparation-progress-v1",
        runId,
        stage: "waiting_for_assistant",
        executor: "work_cloud",
        evidenceId: evidence._id,
        updatedAt: now,
      },
    });
    ensure(
      (await notifyVersionWaiting(
        ctx,
        (await ctx.db.get(c.source._id))!,
        (await ctx.db.get(attemptId))!,
      )) > 0,
      "SETUP_REQUIRED",
      "No current native waiting-event subscription accepted this prepared request.",
    );
    await ctx.db.patch(runId, {
      state: "waiting_for_assistant",
      attemptId,
      updatedAt: now,
      stages: [...c.run.stages, { stage: "waiting_for_assistant", at: now }],
    });
    await ctx.scheduler.runAfter(900000, internal.analysisVersions.expire, {
      attemptId,
    });
    return attemptId;
  },
});

export const recordReceipt = internalMutation({
  args: {
    runId: v.id("mediaPreparations"),
    kind: v.union(
      v.literal("preparation"),
      v.literal("asr"),
      v.literal("asr_output"),
      v.literal("analysis"),
    ),
    receipt: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, kind, receipt }) => {
    const c = await current(ctx, runId);
    // This private, source-scoped response survives validation failure. Strip
    // transport/provider metadata before retaining transcript content.
    const value =
      kind === "asr_output" ? apiTranscriptResponse.parse(receipt) : receipt;
    const text = canonicalJson(value);
    ensure(
      receipt &&
        typeof receipt === "object" &&
        new TextEncoder().encode(text).byteLength <=
          (kind === "asr_output" ? 500000 : 10000) &&
        !containsSecret(text),
      "INVALID_EVIDENCE",
      "Use a bounded sanitized provider receipt.",
    );
    if (c.run.receipt?.[kind])
      ensure(
        canonicalJson(c.run.receipt[kind]) === text,
        "APPROVAL_STALE",
        "A received provider receipt is immutable.",
      );
    await ctx.db.patch(runId, {
      receipt: { ...c.run.receipt, [kind]: value },
    });
    return null;
  },
});

function knownReturnedPreparationFailure(
  run: Doc<"mediaPreparations">,
  code?: string,
) {
  const receipt = run.receipt;
  return (
    run.executor === "gateway" &&
    run.state === "transcribing" &&
    ["INVALID_EVIDENCE", "PREPARED_IMAGE_STORAGE_MISMATCH"].includes(
      code ?? "",
    ) &&
    receipt?.preparation?.stopAcknowledged === true &&
    receipt.asr?.model === "microsoft/mai-transcribe-2" &&
    receipt.asr.provider === "azure" &&
    Number.isSafeInteger(receipt.asr.startedAt) &&
    Number.isSafeInteger(receipt.asr.completedAt) &&
    receipt.asr.completedAt >= receipt.asr.startedAt &&
    receipt.asr.startedAt >= run.createdAt &&
    receipt.asr.completedAt <= Date.now() &&
    !receipt.analysis &&
    !run.versionId &&
    !run.attemptId
  );
}

export const fail = internalMutation({
  args: { runId: v.id("mediaPreparations"), code: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, code }) => {
    const c = await current(ctx, runId);
    if (!["ready", "unknown"].includes(c.run.state)) {
      const safeCode =
        code && /^[A-Z_]{3,60}$/.test(code)
          ? code
          : "PREPARATION_OUTCOME_UNCONFIRMED";
      // Returned, rejected ASR is a known failed preparation, not a still-running
      // analysis. Its financial hold/receipt remains until actual reconciliation.
      const state = knownReturnedPreparationFailure(c.run, safeCode)
        ? "failed"
        : "unknown";
      await ctx.db.patch(runId, {
        state,
        updatedAt: Date.now(),
        receipt: {
          ...c.run.receipt,
          failure: { code: safeCode, stage: c.run.state, at: Date.now() },
        },
      });
      await ctx.db.patch(c.source._id, {
        personalMedia: {
          ...c.source.personalMedia,
          version: "service-preparation-progress-v1",
          runId,
          stage: state,
          executor: c.run.executor,
          updatedAt: Date.now(),
        },
      });
    }
    return null;
  },
});

export const reconcileReturnedFailure = internalMutation({
  args: { runId: v.id("mediaPreparations") },
  returns: v.boolean(),
  handler: async (ctx, { runId }) => {
    const c = await current(ctx, runId),
      failure = c.run.receipt?.failure;
    if (c.run.state === "failed") return true;
    ensure(
      c.run.state === "unknown" &&
        failure?.stage === "transcribing" &&
        knownReturnedPreparationFailure(
          { ...c.run, state: failure.stage },
          failure.code,
        ),
      "COST_RECONCILIATION_REQUIRED",
      "Only a returned, rejected preparation with a stopped VM can be reconciled here.",
    );
    await ctx.db.patch(runId, { state: "failed", updatedAt: Date.now() });
    if (c.source.personalMedia?.runId === runId)
      await ctx.db.patch(c.source._id, {
        personalMedia: {
          ...c.source.personalMedia,
          stage: "failed",
          updatedAt: Date.now(),
        },
      });
    return true;
  },
});

export const expire = internalMutation({
  args: { runId: v.id("mediaPreparations") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (
      !run ||
      run.deadline > Date.now() ||
      ["ready", "failed", "unknown"].includes(run.state)
    )
      return null;
    const now = Date.now(),
      stage = run.state === "queued" ? "failed" : "unknown";
    await ctx.db.patch(runId, {
      state: stage,
      updatedAt: now,
      stages: [...run.stages, { stage, at: now }],
    });
    const source = await ctx.db.get(run.sourceId);
    if (
      source &&
      source.state !== "deleted" &&
      source.personalMedia?.runId === runId
    )
      await ctx.db.patch(source._id, {
        personalMedia: { ...source.personalMedia, stage, updatedAt: now },
      });
    return null;
  },
});

export const status = query({
  args: { runId: v.id("mediaPreparations") },
  returns: v.any(),
  handler: async (ctx, { runId }) => {
    const c = await current(ctx, runId);
    await access(ctx, c.run.organizationId);
    return {
      id: runId,
      sourceId: c.source._id,
      executor: c.run.executor,
      state: c.run.state,
      stages: c.run.stages,
      evidenceId: c.run.evidenceId ?? null,
      versionId: c.run.versionId ?? null,
      attemptId: c.run.attemptId ?? null,
      receipt: c.run.receipt ?? null,
    };
  },
});

export const live = query({
  args: { sourceId: v.id("sources") },
  returns: v.any(),
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.state === "deleted") return null;
    await access(ctx, source.organizationId);
    ensure(
      (source.sourceRetentionUntil ?? Infinity) > Date.now(),
      "SOURCE_UNAVAILABLE",
      "Source retention ended.",
    );
    return liveMetadata(source);
  },
});

function liveMetadata(source: Doc<"sources">) {
  // A metadata subscription never transports a transcript, analysis or project.
  return {
    _id: source._id,
    title: postDisplayTitle(source),
    thumbnailAssetIds: postThumbnailCandidates(source),
    state: source.state,
    generation: source.generation,
    updatedAt: source.updatedAt,
    linkPreview: source.linkPreview ?? null,
    personalMedia:
      source.personalMedia?.version === "service-preparation-progress-v1"
        ? {
            version: source.personalMedia.version,
            runId: source.personalMedia.runId,
            stage: source.personalMedia.stage,
            executor: source.personalMedia.executor,
            updatedAt: source.personalMedia.updatedAt,
            versionId: source.personalMedia.versionId ?? null,
          }
        : null,
    pendingAnalysisAttemptId: source.pendingAnalysisAttemptId ?? null,
    pendingAnalysisAttemptState: source.pendingAnalysisAttemptState ?? null,
    selectedAnalysisVersionId: source.selectedAnalysisVersionId ?? null,
    analysisSelectionRevision: source.analysisSelectionRevision ?? 0,
  };
}

export const liveMany = query({
  args: {
    organizationId: v.id("organizations"),
    sourceIds: v.array(v.id("sources")),
  },
  returns: v.any(),
  handler: async (ctx, { organizationId, sourceIds }) => {
    ensure(
      sourceIds.length <= 20 && new Set(sourceIds).size === sourceIds.length,
      "INVALID_INPUT",
      "Subscribe to one visible metadata page.",
    );
    await access(ctx, organizationId);
    const sources = await Promise.all(
      sourceIds.map((sourceId) => ctx.db.get(sourceId)),
    );
    return sources
      .filter(
        (s): s is Doc<"sources"> =>
          !!s &&
          s.organizationId === organizationId &&
          s.state !== "deleted" &&
          (s.sourceRetentionUntil ?? Infinity) > Date.now(),
      )
      .map(liveMetadata);
  },
});
