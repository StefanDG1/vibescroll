import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { z } from "zod";
import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { audit, limit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import {
  assistantClients,
  assistantGrantActive,
  isAssistantIdentity,
} from "../packages/policy/assistant";
import { assistantGrant } from "./lib/assistantPrincipal";
import { sourceWithinAssistantScope } from "./lib/assistantSourceScope";
import { notifyVersionWaiting } from "./lib/assistantEvents";
import { workCloudMediaAllowed } from "./lib/personalAccess";
import { digest, reserve, settle } from "./product";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import {
  privateCloudMediaCanonicalMatches,
  privateCloudMediaIdentity,
} from "../packages/social/contracts";
import {
  cloudImport,
  cloudSourceFamily,
  cloudSourceVersion,
  currentCloudArtifact,
} from "./lib/cloudCatalog";
import { retainedEvidenceContent } from "./lib/analysisHistory";
import { savedCloudRoute } from "./lib/workCloudSave";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import {
  analysisConfiguration,
  analysisVersionProtocol,
  analysisVersionOutput,
  validateVersionOutput,
  compareVersionOutputs,
  versionLimits,
  retainedAnalysisInstructions,
} from "../packages/contracts/analysis-versions";
import {
  historySource,
  freezeAnalysisBaseline,
  retainedVersion,
  recordSelection,
  versionMetadata,
  verifyRetainedAssets,
} from "./lib/analysisHistory";

const configuration = v.object({
  model: v.string(),
  effort: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("xhigh"),
  ),
  useOwnPlan: v.literal(true),
  maxApiUsd: v.literal(0),
});
const metadata = v.object({
  origin: v.union(v.literal("private"), v.literal("service")),
  id: v.id("analysisVersions"),
  number: v.number(),
  state: v.string(),
  createdAt: v.number(),
  summary: v.string(),
  insightCount: v.number(),
  provenance: v.string(),
  requestedModel: v.union(v.string(), v.null()),
  requestedEffort: v.union(v.string(), v.null()),
  reportedModel: v.union(v.string(), v.null()),
  reportedEffort: v.union(v.string(), v.null()),
  evaluation: v.literal("review_required"),
});
const requestArgs = {
  sourceId: v.id("sources"),
  basedOnVersionId: v.optional(v.id("analysisVersions")),
  expectedSelectionRevision: v.number(),
  key: v.string(),
  configuration,
};
const executionArgs = {
  sourceId: v.id("sources"),
  attemptId: v.id("analysisAttempts"),
  generation: v.optional(v.number()),
  taskId: v.string(),
  leaseToken: v.optional(v.string()),
};

export const enroll = mutation({
  args: { sourceId: v.id("sources") },
  returns: v.object({ versionId: v.id("analysisVersions") }),
  handler: async (ctx, { sourceId }) => {
    const a = await historySource(ctx, sourceId, true);
    const version = await freezeAnalysisBaseline(ctx, a.source);
    return { versionId: version._id };
  },
});

export const history = query({
  args: { sourceId: v.id("sources"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(metadata),
    continueCursor: v.string(),
    isDone: v.boolean(),
    selectedVersionId: v.union(v.id("analysisVersions"), v.null()),
    selectionRevision: v.number(),
    baselineAvailable: v.boolean(),
    pending: v.union(
      v.object({
        id: v.id("analysisAttempts"),
        number: v.number(),
        state: v.string(),
      }),
      v.null(),
    ),
  }),
  handler: async (ctx, args) => {
    ctx = knowledgeReadContext(ctx);
    const { source } = await historySource(ctx, args.sourceId);
    ensure(
      args.paginationOpts.numItems >= 1 &&
        args.paginationOpts.numItems <= versionLimits.historyPage,
      "INVALID_INPUT",
      "Read at most twenty version metadata rows at a time.",
    );
    const layer = source.publicImportId
      ? await ctx.db.get(source.publicImportId)
      : null;
    const shared = cloudImport(layer)
      ? await cloudSourceFamily(ctx, source)
      : null;
    const sharedPrefix = "catalog-history:";
    let sharedOffset: number | null = null;
    let throughNumber = shared?.family.nextVersionNumber ?? 0;
    if (args.paginationOpts.cursor?.startsWith(sharedPrefix)) {
      ensure(
        shared,
        "INVALID_INPUT",
        "This history cursor belongs to another source.",
      );
      const cursor = JSON.parse(
        args.paginationOpts.cursor.slice(sharedPrefix.length),
      );
      ensure(
        cursor.family === shared.family._id &&
          Number.isSafeInteger(cursor.offset) &&
          cursor.offset >= 0 &&
          cursor.offset <= shared.family.members.length &&
          Number.isSafeInteger(cursor.throughNumber) &&
          cursor.throughNumber >= 0 &&
          cursor.throughNumber <= shared.family.nextVersionNumber,
        "INVALID_INPUT",
        "Refresh shared history after its contents change.",
      );
      sharedOffset = cursor.offset;
      throughNumber = cursor.throughNumber;
    }
    const result =
      sharedOffset === null
        ? await ctx.db
            .query("analysisVersions")
            .withIndex("by_org_source", (q) =>
              q
                .eq("organizationId", source.organizationId)
                .eq("sourceId", source._id),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : { page: [], continueCursor: "", isDone: true };
    const pending = source.pendingAnalysisAttemptId
      ? await ctx.db.get(source.pendingAnalysisAttemptId)
      : null;
    const page = await Promise.all(
      result.page.map(async (version) => {
        const evidence = await ctx.db.get(version.evidenceId);
        if (evidence?.owner === "service" && version.state === "ready") {
          await retainedVersion(ctx, source, version._id);
          return versionMetadata(version);
        }
        return evidence &&
          source.state === "ready" &&
          source.generation === evidence.extractionGeneration &&
          source.orderedMedia?.post.revisionHash === evidence.revisionHash &&
          evidence.state === "retained" &&
          evidence.retainUntil > Date.now() &&
          version.state === "ready"
          ? versionMetadata(version)
          : {
              ...versionMetadata(version),
              summary: "",
              insightCount: 0,
              state: "removed",
            };
      }),
    );
    let continueCursor = result.continueCursor,
      isDone = result.isDone;
    if (shared && result.isDone) {
      const offset = sharedOffset ?? 0;
      const members = shared.family.members
        .filter((member) => member.number < throughNumber)
        .reverse();
      const end = Math.min(
        members.length,
        offset + args.paginationOpts.numItems - page.length,
      );
      for (const member of members.slice(offset, end)) {
        const artifact = await ctx.db.get(member.artifactId);
        if (
          !artifact ||
          artifact.state !== "eligible" ||
          !("retainUntil" in artifact) ||
          artifact.retainUntil <= Date.now()
        )
          continue;
        const current = await currentCloudArtifact(ctx, artifact._id);
        page.push(versionMetadata(current.version));
      }
      isDone = end >= members.length;
      continueCursor = isDone
        ? ""
        : sharedPrefix +
          JSON.stringify({
            family: shared.family._id,
            offset: end,
            throughNumber,
          });
    }
    const selectedVersionId =
      source.selectedAnalysisVersionId ??
      (shared?.family.selectedArtifactId
        ? shared.family.members.find(
            (m) => m.artifactId === shared.family.selectedArtifactId,
          )?.versionId
        : null) ??
      null;
    return {
      continueCursor,
      isDone,
      page,
      selectedVersionId,
      selectionRevision: source.analysisSelectionRevision ?? 0,
      baselineAvailable:
        !source.selectedAnalysisVersionId &&
        !shared &&
        source.state === "ready" &&
        !!source.orderedMedia,
      pending:
        pending && ["queued", "running", "unknown"].includes(pending.state)
          ? { id: pending._id, number: pending.number, state: pending.state }
          : null,
    };
  },
});

export const read = query({
  args: {
    sourceId: v.id("sources"),
    versionId: v.optional(v.id("analysisVersions")),
  },
  returns: v.object({
    version: metadata,
    output: v.any(),
    evidenceId: v.id("analysisEvidence"),
    evidenceHash: v.string(),
    retainUntil: v.number(),
    post: v.any(),
    evidence: v.any(),
    frames: v.array(
      v.object({
        id: v.string(),
        assetId: v.optional(v.id("assets")),
        reference: v.optional(v.string()),
        timestampMs: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { source } = await historySource(ctx, args.sourceId);
    const layer = source.publicImportId
      ? await ctx.db.get(source.publicImportId)
      : null;
    const id =
      args.versionId ??
      source.selectedAnalysisVersionId ??
      (cloudImport(layer)
        ? (await cloudSourceVersion(ctx, source)).version._id
        : null);
    ensure(
      id,
      "SOURCE_UNAVAILABLE",
      "Open history to enroll this analysis first.",
    );
    const { version, evidence } = await retainedVersion(ctx, source, id);
    const identity = await ctx.auth.getUserIdentity();
    const includeEvidence = !identity || !isAssistantIdentity(identity);
    const content = retainedEvidenceContent(evidence);
    return {
      version: versionMetadata(version),
      output: version.output,
      evidenceId: evidence._id,
      evidenceHash: evidence.evidenceHash,
      retainUntil: evidence.retainUntil,
      post: includeEvidence ? content.post : null,
      evidence: includeEvidence ? content.observations : [],
      frames: includeEvidence
        ? evidence.frames.map((f) => ({
            id: f.frameId,
            ...(f.assetId ? { assetId: f.assetId } : {}),
            ...(evidence.owner === "service"
              ? {
                  reference: `catalog~${source._id}~${version._id}~${f.frameId}`,
                }
              : {}),
            timestampMs: f.timestampMs,
            width: f.width,
            height: f.height,
          }))
        : [],
    };
  },
});

export const compare = query({
  args: {
    sourceId: v.id("sources"),
    beforeId: v.id("analysisVersions"),
    afterId: v.id("analysisVersions"),
  },
  returns: v.object({
    summaryChanged: v.boolean(),
    added: v.array(v.string()),
    removed: v.array(v.string()),
    changed: v.array(v.string()),
    beforeReferences: v.number(),
    afterReferences: v.number(),
    qualityVerdict: v.literal("review_required"),
  }),
  handler: async (ctx, args) => {
    const { source } = await historySource(ctx, args.sourceId);
    const [before, after] = await Promise.all([
      retainedVersion(ctx, source, args.beforeId),
      retainedVersion(ctx, source, args.afterId),
    ]);
    return compareVersionOutputs(before.version.output, after.version.output);
  },
});

export const sharedFrame = query({
  args: {
    sourceId: v.id("sources"),
    versionId: v.id("analysisVersions"),
    frameId: v.string(),
  },
  returns: v.object({
    key: v.string(),
    sha256: v.string(),
    size: v.number(),
    width: v.number(),
    height: v.number(),
    retainUntil: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    ensure(
      identity && !isAssistantIdentity(identity),
      "FORBIDDEN",
      "Use the task's leased frame tool for assistant image access.",
    );
    const { source } = await historySource(ctx, args.sourceId);
    const { evidence } = await retainedVersion(ctx, source, args.versionId);
    ensure(
      evidence.owner === "service",
      "FORBIDDEN",
      "Choose a shared evidence frame.",
    );
    await verifyRetainedAssets(ctx, source, evidence);
    const frame = evidence.frames.find((f) => f.frameId === args.frameId);
    ensure(frame, "SOURCE_UNAVAILABLE", "This screenshot is unavailable.");
    return {
      key: frame.key,
      sha256: frame.sha256,
      size: frame.size,
      width: frame.width,
      height: frame.height,
      retainUntil: evidence.retainUntil,
    };
  },
});

export const followRecommendation = mutation({
  args: { sourceId: v.id("sources"), expectedSelectionRevision: v.number() },
  returns: v.object({ revision: v.number(), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const { source, actor } = await historySource(ctx, args.sourceId, true);
    await cloudSourceVersion(ctx, source);
    const revision = source.analysisSelectionRevision ?? 0;
    ensure(
      revision === args.expectedSelectionRevision,
      "APPROVAL_STALE",
      "Refresh the current selection first.",
    );
    if (!source.selectedAnalysisVersionId) return { revision, changed: false };
    await ctx.db.patch(source._id, {
      selectedAnalysisVersionId: undefined,
      selectedAnalysisSummary: undefined,
      selectedAnalysisInsightCount: undefined,
      selectedAnalysisMainPoints: undefined,
      analysisSelectionRevision: revision + 1,
    });
    await audit(
      ctx,
      source.organizationId,
      actor._id,
      "catalog.follow_recommendation",
      `${source._id}:${revision + 1}`,
    );
    return { revision: revision + 1, changed: true };
  },
});

export const select = mutation({
  args: {
    sourceId: v.id("sources"),
    versionId: v.id("analysisVersions"),
    expectedSelectionRevision: v.number(),
  },
  returns: v.object({ revision: v.number(), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const { source, actor } = await historySource(ctx, args.sourceId, true);
    const { version, evidence } = await retainedVersion(
      ctx,
      source,
      args.versionId,
    );
    await verifyRetainedAssets(ctx, source, evidence);
    return recordSelection(
      ctx,
      source,
      actor._id,
      version,
      args.expectedSelectionRevision,
    );
  },
});

export async function requestRetainedAnalysis(
  ctx: MutationCtx,
  args: {
    sourceId: Id<"sources">;
    basedOnVersionId?: Id<"analysisVersions">;
    expectedSelectionRevision: number;
    key: string;
    configuration: z.infer<typeof analysisConfiguration>;
  },
) {
  const config = analysisConfiguration.parse(args.configuration);
  ensure(
    /^[A-Za-z0-9_-]{8,64}$/.test(args.key) &&
      Number.isSafeInteger(args.expectedSelectionRevision),
    "INVALID_INPUT",
    "Use a stable operation key and current selection revision.",
  );
  const a = await historySource(ctx, args.sourceId, true);
  ensure(
    workCloudMediaAllowed(a.actor.subject),
    "FORBIDDEN",
    "This account is not admitted for Cloud analysis.",
  );
  const existing = await ctx.db
    .query("analysisAttempts")
    .withIndex("by_org_source_key", (q) =>
      q
        .eq("organizationId", a.source.organizationId)
        .eq("sourceId", a.source._id)
        .eq("key", args.key),
    )
    .unique();
  if (existing) {
    const existingGrant = await ctx.db.get(existing.grantId);
    const existingClient =
      existingGrant &&
      assistantClients().find((client) => client.id === existingGrant.clientId);
    ensure(
      existingGrant &&
        assistantGrantActive(existingGrant) &&
        existingGrant.version === existing.grantVersion &&
        existingGrant.actor === a.actor._id &&
        existingGrant.organizationId === a.source.organizationId &&
        existingGrant.cloudRequestPolicy === "explicit_per_source_v1" &&
        (["analysis:request", "analysis:execute"] as const).every(
          (scope) =>
            existingGrant.scopes.includes(scope) &&
            existingClient?.scopes.includes(scope),
        ) &&
        (await sourceWithinAssistantScope(
          ctx,
          existingGrant,
          a.organization,
          a.actor._id,
          a.source,
        )),
      "APPROVAL_STALE",
      "This request's Cloud connection changed. Review it before continuing.",
    );
    ensure(
      existing.actor === a.actor._id &&
        existing.model === config.model &&
        existing.effort === config.effort &&
        (!args.basedOnVersionId ||
          existing.basedOnVersionId === args.basedOnVersionId),
      "APPROVAL_STALE",
      "This operation key already identifies a different analysis request.",
    );
    return {
      sourceId: a.source._id,
      attemptId: existing._id,
      number: existing.number,
      state: existing.state,
      evidenceReused: true,
    };
  }
  ensure(
    (a.source.analysisSelectionRevision ?? 0) ===
      args.expectedSelectionRevision,
    "APPROVAL_STALE",
    "The selected analysis changed. Refresh before reanalyzing.",
  );
  if (a.source.pendingAnalysisAttemptId) {
    const old = await ctx.db.get(a.source.pendingAnalysisAttemptId);
    ensure(
      !old || ["completed", "failed", "cancelled"].includes(old.state),
      "SOURCE_BUSY",
      "An analysis attempt is already waiting, running or unresolved.",
    );
  }
  const baseline = await freezeAnalysisBaseline(ctx, a.source);
  const source = (await ctx.db.get(a.source._id))!;
  const { version, evidence } = await retainedVersion(
    ctx,
    source,
    args.basedOnVersionId ?? baseline._id,
  );
  const oldJob = source.personalAnalysis;
  const savedRoute =
    !a.grant && oldJob?.executor !== "work_cloud"
      ? await savedCloudRoute(ctx, a.actor, a.organization)
      : null;
  const grant =
    a.grant ??
    (oldJob?.executor === "work_cloud"
      ? await ctx.db.get(oldJob.cloud.grantId)
      : savedRoute?.grantId
        ? await ctx.db.get(savedRoute.grantId)
        : null);
  const client =
    grant && assistantClients().find((c) => c.id === grant.clientId);
  ensure(
    grant &&
      grant.actor === a.actor._id &&
      grant.organizationId === source.organizationId &&
      assistantGrantActive(grant) &&
      grant.cloudRequestPolicy === "explicit_per_source_v1" &&
      (["analysis:request", "analysis:execute"] as const).every(
        (s) => grant.scopes.includes(s) && client?.scopes.includes(s),
      ) &&
      (await sourceWithinAssistantScope(
        ctx,
        grant,
        a.organization,
        a.actor._id,
        source,
      )),
    "FORBIDDEN",
    "Review a current Cloud connection covering this source.",
  );
  const number = source.nextAnalysisVersionNumber ?? 2;
  ensure(
    number <= versionLimits.maximumVersions,
    "LIMIT_EXCEEDED",
    "This post reached its analysis-history limit.",
  );
  await limit(ctx, `analysis-version-request:${a.actor._id}`, 10);
  const now = Date.now();
  const recipeHash = await digest(
    canonicalJson({
      protocol: analysisVersionProtocol,
      outputSchema: z.toJSONSchema(analysisVersionOutput),
      instructions: retainedAnalysisInstructions,
    }),
  );
  const variantKey = await digest(
    canonicalJson({
      recipeHash,
      evidenceHash: evidence.evidenceHash,
      configuration: config,
    }),
  );
  const attemptId = await ctx.db.insert("analysisAttempts", {
    organizationId: source.organizationId,
    sourceId: source._id,
    actor: a.actor._id,
    key: args.key,
    createdAt: now,
    updatedAt: now,
    basedOnVersionId: version._id,
    evidenceId: evidence._id,
    sourceGeneration: source.generation,
    canonical: privateCloudMediaIdentity(source.canonical).url,
    recipeHash,
    variantKey,
    inputHash: await digest(
      canonicalJson({
        protocol: analysisVersionProtocol,
        sourceId: source._id,
        key: args.key,
        evidenceHash: evidence.evidenceHash,
        configuration: config,
        recipeHash,
        grantVersion: grant.version,
      }),
    ),
    number,
    expectedSelectionRevision: args.expectedSelectionRevision,
    model: config.model,
    effort: config.effort,
    grantId: grant._id,
    grantVersion: grant.version,
    clientId: grant.clientId,
    state: "queued",
    expiresAt: Math.min(now + 86400000, evidence.retainUntil),
    leaseUntil: 0,
    deadline: 0,
    viewedFrameIds: [],
  });
  await reserve(ctx, source.organizationId, `analysisVersion:${attemptId}`, 0);
  await ctx.scheduler.runAfter(
    Math.max(0, Math.min(now + 86400000, evidence.retainUntil) - now),
    internal.analysisVersions.expire,
    { attemptId },
  );
  await ctx.db.patch(source._id, {
    pendingAnalysisAttemptId: attemptId,
    pendingAnalysisAttemptState: "queued",
    nextAnalysisVersionNumber: number + 1,
  });
  const deliveries = await notifyVersionWaiting(
    ctx,
    (await ctx.db.get(source._id))!,
    (await ctx.db.get(attemptId))!,
  );
  ensure(
    a.grant || deliveries > 0,
    "SETUP_REQUIRED",
    "Set up the current Cloud waiting-event monitor before requesting analysis from the app.",
  );
  await audit(
    ctx,
    source.organizationId,
    a.actor._id,
    "analysis_version_requested",
    `${source._id}:${attemptId}:${version._id}`,
  );
  return {
    sourceId: source._id,
    attemptId,
    number,
    state: "queued",
    evidenceReused: true,
  };
}
export const request = mutation({
  args: requestArgs,
  returns: v.object({
    sourceId: v.id("sources"),
    attemptId: v.id("analysisAttempts"),
    number: v.number(),
    state: v.string(),
    evidenceReused: v.boolean(),
  }),
  handler: requestRetainedAnalysis,
});

export const cancelWaiting = mutation({
  args: { sourceId: v.id("sources"), attemptId: v.id("analysisAttempts") },
  returns: v.object({ cancelled: v.literal(true) }),
  handler: async (ctx, args) => {
    const { source, actor } = await historySource(ctx, args.sourceId, true);
    const attempt = await ctx.db.get(args.attemptId);
    ensure(
      attempt &&
        attempt.sourceId === source._id &&
        attempt.organizationId === source.organizationId &&
        attempt.actor === actor._id,
      "FORBIDDEN",
      "This request is unavailable.",
    );
    if (attempt.state === "cancelled") return { cancelled: true as const };
    ensure(
      source.pendingAnalysisAttemptId === attempt._id &&
        attempt.state === "queued" &&
        !attempt.taskId &&
        !attempt.leaseTokenHash &&
        !attempt.consentId,
      "SOURCE_BUSY",
      "Only an unclaimed waiting request can be cancelled here. Stop claimed work in its Cloud task and reconcile its outcome.",
    );
    await ctx.db.patch(attempt._id, {
      state: "cancelled",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(source._id, {
      pendingAnalysisAttemptId: undefined,
      pendingAnalysisAttemptState: undefined,
    });
    await settle(
      ctx,
      source.organizationId,
      `analysisVersion:${attempt._id}`,
      0,
    );
    await audit(
      ctx,
      source.organizationId,
      actor._id,
      "analysis_version_cancelled",
      `${source._id}:${attempt._id}`,
    );
    return { cancelled: true as const };
  },
});

async function executionContext(
  ctx: QueryCtx,
  args: {
    sourceId: Id<"sources">;
    attemptId: Id<"analysisAttempts">;
    generation?: number;
    taskId: string;
    leaseToken?: string;
  },
  claimed = true,
) {
  const attempt = await ctx.db.get(args.attemptId),
    source = await ctx.db.get(args.sourceId);
  ensure(
    attempt &&
      source &&
      attempt.sourceId === source._id &&
      source.state !== "deleted" &&
      source.generation === attempt.sourceGeneration &&
      (args.generation === undefined ||
        args.generation === source.generation) &&
      privateCloudMediaCanonicalMatches(source.canonical, attempt.canonical),
    "APPROVAL_STALE",
    "The version request or source changed.",
  );
  const a = await assistantGrant(
    ctx,
    source.organizationId,
    "analysis:execute",
  );
  ensure(
    a.actor._id === attempt.actor &&
      a.grant._id === attempt.grantId &&
      a.grant.version === attempt.grantVersion &&
      a.client.id === attempt.clientId &&
      workCloudMediaAllowed(a.actor.subject) &&
      (await sourceWithinAssistantScope(
        ctx,
        a.grant,
        a.organization,
        a.actor._id,
        source,
      )),
    "APPROVAL_STALE",
    "The version's current Cloud grant changed.",
  );
  const { evidence } = await retainedVersion(
    ctx,
    source,
    attempt.basedOnVersionId,
  );
  ensure(
    evidence._id === attempt.evidenceId && attempt.expiresAt > Date.now(),
    "APPROVAL_STALE",
    "The version request or retained evidence expired.",
  );
  if (claimed)
    ensure(
      attempt.taskId === args.taskId &&
        attempt.consentId === a.identity.sid &&
        args.leaseToken &&
        (await digest(args.leaseToken)) === attempt.leaseTokenHash &&
        ((attempt.state === "running" &&
          attempt.leaseUntil > Date.now() &&
          attempt.deadline > Date.now()) ||
          attempt.state === "completed"),
      "APPROVAL_STALE",
      "The version task lease is no longer current.",
    );
  return { source, attempt, evidence, ...a };
}

export const input = internalQuery({
  args: executionArgs,
  returns: v.any(),
  handler: async (ctx, args) => {
    const c = await executionContext(ctx, args);
    ensure(
      c.attempt.state === "running",
      "APPROVAL_STALE",
      "This attempt is no longer running.",
    );
    return {
      schemaVersion: analysisVersionProtocol,
      inputKind: "retained_evidence",
      sourceId: c.source._id,
      generation: c.source.generation,
      attemptId: c.attempt._id,
      evidenceId: c.evidence._id,
      evidenceHash: c.evidence.evidenceHash,
      postRevisionHash: c.evidence.revisionHash,
      inputHash: c.attempt.inputHash,
      retainUntil: c.evidence.retainUntil,
      requestedModel: c.attempt.model,
      requestedEffort: c.attempt.effort,
      leaseUntil: c.attempt.leaseUntil,
      deadline: c.attempt.deadline,
      maxApiUsd: 0,
      transcript: retainedEvidenceContent(c.evidence).transcript,
      observations: retainedEvidenceContent(c.evidence).observations,
      frames: c.evidence.frames.map(
        ({ frameId, timestampMs, width, height, sha256 }) => ({
          frameId,
          timestampMs,
          width,
          height,
          sha256,
        }),
      ),
      outputSchema: canonicalJson(z.toJSONSchema(analysisVersionOutput)),
      instructions: retainedAnalysisInstructions,
      recipeHash: c.attempt.recipeHash,
      provenance: "authenticated_host_reported",
      publication: "private_only",
    };
  },
});

async function currentRetainedFrame(
  ctx: QueryCtx,
  args: {
    sourceId: Id<"sources">;
    attemptId: Id<"analysisAttempts">;
    generation?: number;
    taskId: string;
    leaseToken?: string;
    frameId: string;
  },
) {
  const c = await executionContext(ctx, args);
  ensure(
    c.attempt.state === "running",
    "APPROVAL_STALE",
    "This attempt is no longer running.",
  );
  const frame = c.evidence.frames.find((f) => f.frameId === args.frameId);
  ensure(
    frame,
    "INVALID_EVIDENCE",
    "Choose a frame in this retained evidence bundle.",
  );
  if (frame.assetId) {
    const asset = await ctx.db.get(frame.assetId);
    ensure(
      asset &&
        asset.state === "complete" &&
        asset.kind === "work_cloud_frame" &&
        asset.organizationId === c.source.organizationId &&
        asset.sourceId === c.source._id &&
        asset.sourceGeneration === c.evidence.extractionGeneration &&
        asset.key === frame.key &&
        asset.size === frame.size &&
        asset.expiresAt !== undefined &&
        asset.expiresAt > Date.now() &&
        !(await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", asset.key))
          .unique()),
      "SOURCE_UNAVAILABLE",
      "The retained frame was retired.",
    );
  }
  return { ...frame, retainUntil: c.evidence.retainUntil };
}
export const frameContext = internalQuery({
  args: { ...executionArgs, frameId: v.string() },
  returns: v.any(),
  handler: currentRetainedFrame,
});

export const acknowledgeFrame = internalMutation({
  args: { ...executionArgs, frameId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await currentRetainedFrame(ctx, args);
    const c = await executionContext(ctx, args);
    ensure(
      c.attempt.state === "running" &&
        c.evidence.frames.some((f) => f.frameId === args.frameId),
      "INVALID_EVIDENCE",
      "Frame does not belong to this attempt.",
    );
    if (!c.attempt.viewedFrameIds.includes(args.frameId))
      await ctx.db.patch(c.attempt._id, {
        viewedFrameIds: [...c.attempt.viewedFrameIds, args.frameId],
        updatedAt: Date.now(),
      });
    return null;
  },
});

export const dispatch = internalMutation({
  args: {
    ...executionArgs,
    operation: v.union(
      v.literal("claim"),
      v.literal("heartbeat"),
      v.literal("complete"),
      v.literal("fail"),
    ),
    output: v.optional(v.any()),
    reportedModel: v.optional(v.string()),
    reportedEffort: v.optional(v.string()),
    usage: v.optional(
      v.object({ inputTokens: v.number(), outputTokens: v.number() }),
    ),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    ensure(
      /^[A-Za-z0-9._:-]{1,160}$/.test(args.taskId),
      "INVALID_INPUT",
      "Use a bounded task identifier.",
    );
    ensure(
      args.operation === "complete" ||
        (args.output === undefined &&
          args.reportedModel === undefined &&
          args.reportedEffort === undefined &&
          args.usage === undefined),
      "INVALID_INPUT",
      "Output and model reporting belong only to completion.",
    );
    const c = await executionContext(ctx, args, args.operation !== "claim");
    const now = Date.now();
    if (args.operation === "claim") {
      ensure(
        args.leaseToken === undefined &&
          c.attempt.state === "queued" &&
          !c.attempt.taskId,
        "APPROVAL_STALE",
        "This version attempt was already claimed. Reconcile it without replacing work.",
      );
      const token = crypto.randomUUID(),
        deadline = Math.min(
          c.attempt.expiresAt,
          now + versionLimits.maximumExecutionMs,
        );
      const leaseUntil = Math.min(deadline, now + versionLimits.maximumLeaseMs);
      await ctx.db.patch(c.attempt._id, {
        state: "running",
        taskId: args.taskId,
        consentId: c.identity.sid as string,
        leaseTokenHash: await digest(token),
        deadline,
        leaseUntil,
        updatedAt: now,
      });
      await ctx.db.patch(c.source._id, {
        pendingAnalysisAttemptState: "running",
      });
      await ctx.scheduler.runAfter(
        Math.max(0, deadline - now),
        internal.analysisVersions.expire,
        { attemptId: c.attempt._id },
      );
      return {
        sourceId: c.source._id,
        generation: c.source.generation,
        attemptId: c.attempt._id,
        leaseToken: token,
        leaseUntil,
        deadline,
        inputKind: "retained_evidence",
      };
    }
    if (args.operation === "heartbeat") {
      ensure(
        c.attempt.state === "running",
        "APPROVAL_STALE",
        "This attempt is no longer running.",
      );
      const leaseUntil = Math.min(
        c.attempt.deadline,
        now + versionLimits.maximumLeaseMs,
      );
      await ctx.db.patch(c.attempt._id, { leaseUntil, updatedAt: now });
      return { leaseUntil, deadline: c.attempt.deadline };
    }
    if (args.operation === "fail") {
      ensure(
        c.attempt.state === "running",
        "APPROVAL_STALE",
        "This attempt is no longer running.",
      );
      await ctx.db.patch(c.attempt._id, {
        state: "unknown",
        diagnostic: "host_outcome_unresolved",
        updatedAt: now,
      });
      await ctx.db.patch(c.source._id, {
        pendingAnalysisAttemptState: "unknown",
      });
      return { accepted: true, state: "unknown", incumbentPreserved: true };
    }
    ensure(
      c.evidence.frames.every((f) =>
        c.attempt.viewedFrameIds.includes(f.frameId),
      ),
      "INVALID_EVIDENCE",
      "Read every retained image before completing the new analysis.",
    );
    await verifyRetainedAssets(ctx, c.source, c.evidence);
    const output = validateVersionOutput(args.output, {
      sourceId: c.source._id,
      attemptId: c.attempt._id,
      evidenceHash: c.evidence.evidenceHash,
      postRevisionHash: c.evidence.revisionHash,
      evidence: retainedEvidenceContent(c.evidence).observations,
    });
    for (const value of [args.reportedModel, args.reportedEffort])
      ensure(
        value === undefined ||
          (/^[A-Za-z0-9_.:-]{1,100}$/.test(value) && !containsSecret(value)),
        "INVALID_INPUT",
        "Use a bounded reported model setting.",
      );
    ensure(
      !args.usage ||
        Object.values(args.usage).every(
          (n) => Number.isSafeInteger(n) && n >= 0 && n <= 10000000,
        ),
      "INVALID_INPUT",
      "Use bounded observed token counts.",
    );
    const completionHash = await digest(
      canonicalJson({
        output,
        model: args.reportedModel ?? null,
        effort: args.reportedEffort ?? null,
        usage: args.usage ?? null,
      }),
    );
    if (c.attempt.state === "completed") {
      ensure(
        c.attempt.completionHash === completionHash,
        "APPROVAL_STALE",
        "This completed output cannot change.",
      );
      return {
        accepted: true,
        cached: true,
        versionId: c.attempt.resultVersionId,
      };
    }
    const versionId = await ctx.db.insert("analysisVersions", {
      owner: "private",
      organizationId: c.source.organizationId,
      sourceId: c.source._id,
      createdAt: now,
      evidenceId: c.evidence._id,
      number: c.attempt.number,
      state: "ready",
      output,
      outputHash: await digest(canonicalJson(output)),
      summary: output.summary,
      insightCount: output.insights.length,
      retainUntil: c.evidence.retainUntil,
      recipeHash: c.attempt.recipeHash,
      variantKey: c.attempt.variantKey,
      attemptId: c.attempt._id,
      requestedModel: c.attempt.model,
      requestedEffort: c.attempt.effort,
      ...(args.reportedModel ? { reportedModel: args.reportedModel } : {}),
      ...(args.reportedEffort ? { reportedEffort: args.reportedEffort } : {}),
      provenance: "authenticated_host_reported",
      evaluation: "review_required",
    });
    await ctx.db.patch(c.attempt._id, {
      state: "completed",
      resultVersionId: versionId,
      completionHash,
      updatedAt: now,
      ...(args.usage ? args.usage : {}),
    });
    if (c.source.pendingAnalysisAttemptId === c.attempt._id)
      await ctx.db.patch(c.source._id, {
        pendingAnalysisAttemptId: undefined,
        pendingAnalysisAttemptState: undefined,
      });
    await settle(
      ctx,
      c.source.organizationId,
      `analysisVersion:${c.attempt._id}`,
      0,
    );
    await audit(
      ctx,
      c.source.organizationId,
      c.actor._id,
      "analysis_version_completed",
      `${c.source._id}:${c.attempt._id}:${versionId}`,
    );
    return {
      accepted: true,
      cached: false,
      versionId,
      selected: false,
      incumbentPreserved: true,
    };
  },
});

export const expire = internalMutation({
  args: { attemptId: v.id("analysisAttempts") },
  returns: v.null(),
  handler: async (ctx, { attemptId }) => {
    const a = await ctx.db.get(attemptId);
    if (a && a.state === "queued" && !a.taskId && a.expiresAt <= Date.now()) {
      await ctx.db.patch(a._id, {
        state: "cancelled",
        diagnostic: "unclaimed_request_expired",
        updatedAt: Date.now(),
      });
      const source = await ctx.db.get(a.sourceId);
      if (source?.pendingAnalysisAttemptId === a._id)
        await ctx.db.patch(source._id, {
          pendingAnalysisAttemptId: undefined,
          pendingAnalysisAttemptState: undefined,
        });
      await settle(ctx, a.organizationId, `analysisVersion:${a._id}`, 0);
    }
    if (a && a.state === "running" && a.deadline <= Date.now()) {
      await ctx.db.patch(a._id, {
        state: "unknown",
        diagnostic: "execution_deadline_unresolved",
        updatedAt: Date.now(),
      });
      const source = await ctx.db.get(a.sourceId);
      if (source?.pendingAnalysisAttemptId === a._id)
        await ctx.db.patch(source._id, {
          pendingAnalysisAttemptState: "unknown",
        });
    }
    return null;
  },
});

export const expireEvidence = internalMutation({
  args: { evidenceId: v.id("analysisEvidence") },
  returns: v.null(),
  handler: async (ctx, { evidenceId }) => {
    const evidence = await ctx.db.get(evidenceId);
    if (!evidence || evidence.retainUntil > Date.now()) return null;
    if (evidence.state !== "removed")
      await ctx.db.patch(evidenceId, {
        state: "removed",
        prepared: null,
        frames: [],
      });
    const ready = await ctx.db
      .query("analysisVersions")
      .withIndex("by_evidence_state", (q) =>
        q.eq("evidenceId", evidenceId).eq("state", "ready"),
      )
      .take(20);
    const blocked = await ctx.db
      .query("analysisVersions")
      .withIndex("by_evidence_state", (q) =>
        q.eq("evidenceId", evidenceId).eq("state", "blocked"),
      )
      .take(20 - ready.length);
    const versions = [...ready, ...blocked];
    for (const version of versions)
      await ctx.db.patch(version._id, {
        state: "removed",
        output: undefined,
        summary: "",
        insightCount: 0,
      });
    if (versions.length === 20)
      await ctx.scheduler.runAfter(
        0,
        internal.analysisVersions.expireEvidence,
        { evidenceId },
      );
    return null;
  },
});

export const eraseSource = internalMutation({
  args: {
    sourceId: v.id("sources"),
    organizationId: v.id("organizations"),
    stage: v.union(
      v.literal("versions"),
      v.literal("attempts"),
      v.literal("evidence"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    ensure(
      !source ||
        (source.organizationId === args.organizationId &&
          source.state === "deleted"),
      "FORBIDDEN",
      "Erase only the deleted source's private history.",
    );
    const table =
      args.stage === "versions"
        ? "analysisVersions"
        : args.stage === "attempts"
          ? "analysisAttempts"
          : "analysisEvidence";
    const rows = await ctx.db
      .query(table)
      .withIndex("by_org_source", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("sourceId", args.sourceId),
      )
      .take(20);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 20)
      await ctx.scheduler.runAfter(
        0,
        internal.analysisVersions.eraseSource,
        args,
      );
    else if (args.stage !== "evidence")
      await ctx.scheduler.runAfter(0, internal.analysisVersions.eraseSource, {
        ...args,
        stage: args.stage === "versions" ? "attempts" : "evidence",
      });
    return null;
  },
});
