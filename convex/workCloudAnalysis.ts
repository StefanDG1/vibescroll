import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { query, internalQuery, type QueryCtx } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import type { Doc, Id } from "./_generated/dataModel";
import { access, recentAuthentication, limit, audit } from "./lib";
import {
  assistantClients,
  assistantGrantActive,
} from "../packages/policy/assistant";
import { assistantGrant } from "./lib/assistantPrincipal";
import { sourceWithinAssistantScope } from "./lib/assistantSourceScope";
import {
  workCloudMediaAllowed,
  workCloudTextAllowed,
} from "./lib/personalAccess";
import { typedSource, completePersonalSource } from "./personalAnalysis";
import { reserve, settle, digest } from "./product";
import { ensure, containsSecret } from "../packages/policy";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { safeModel } from "../packages/runner/subscription-capabilities.mjs";
import type { WorkCloudJob } from "./personalAnalysisSchema";
import {
  validateWorkCloudTextOutput,
  validateWorkCloudMediaOutput,
  workCloudMediaPolicy,
  workCloudMediaPreparation,
} from "../packages/contracts/work-cloud-text";
import {
  socialAnalysisOutput,
  validateOrderedAnalysis,
} from "../packages/social/analysis";
import {
  validateOrderedEvidence,
  privateCloudMediaIdentity,
} from "../packages/social/contracts";
import { sourceRetained } from "./lib/sourceAuthority";
import { commitPersonalOrdered } from "./lib/personalOrderedCommit";
import { currentOrderedSource } from "./lib/orderedSource";
import { syncCategories } from "./categories";
import { syncKnowledge } from "./knowledge";
import insightSchema from "../contracts/insight.schema.json";
import sourceInsightSchema from "../contracts/source-insight-v2.schema.json";

const policy = {
  schemaVersion: "work-cloud-text-v1",
  pipelineVersion: "official-work-cloud-text-v1",
  maxInputCodeUnits: 60000,
  maxOutputBytes: 120000,
  funding: "own_subscription",
  maxApiUsd: 0,
  publication: "private_only",
  mediaSupported: false,
};
const sourceArgs = {
  sourceId: v.id("sources"),
  generation: v.number(),
  taskId: v.string(),
};
const executionArgs = { ...sourceArgs, leaseToken: v.string() };
type ExecutionArgs = {
  sourceId: Id<"sources">;
  generation: number;
  taskId: string;
  leaseToken: string;
};

function enabled(subject: string, media = false) {
  ensure(
    media ? workCloudMediaAllowed(subject) : workCloudTextAllowed(subject),
    "FORBIDDEN",
    "This Work Cloud handoff is unavailable for this account.",
  );
}
async function ownedSource(ctx: QueryCtx, id: Id<"sources">, media = false) {
  const source = await ctx.db.get(id);
  ensure(
    source && source.state !== "deleted",
    "SOURCE_UNAVAILABLE",
    "Source unavailable.",
  );
  const a = await access(ctx, source.organizationId, ["owner"]);
  enabled(a.actor.subject, media);
  ensure(
    a.organization.privateOwnerId === a.actor._id,
    "FORBIDDEN",
    "Use your own private library.",
  );
  return { source, ...a };
}
async function selectedGrant(
  ctx: QueryCtx,
  source: Doc<"sources">,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
  grantId: Id<"assistantGrants">,
) {
  const grant = await ctx.db.get(grantId);
  const client = assistantClients().find((c) => c.id === grant?.clientId);
  ensure(
    grant &&
      grant.organizationId === organization._id &&
      grant.actor === actor._id &&
      assistantGrantActive(grant) &&
      grant.scopes.includes("analysis:execute") &&
      client?.scopes.includes("analysis:execute") &&
      (await sourceWithinAssistantScope(
        ctx,
        grant,
        organization,
        actor._id,
        source,
      )),
    "FORBIDDEN",
    "Review a current execution grant for this exact source.",
  );
  return grant;
}
async function sourceInput(
  ctx: QueryCtx,
  source: Doc<"sources">,
  generation: number,
  bound: WorkCloudJob | null = null,
  mediaApproval?: { retainUntil: number },
) {
  const media =
    bound?.cloud.schemaVersion === "work-cloud-media-v2"
      ? bound.cloud.media
      : mediaApproval;
  ensure(
    (bound?.cloud.schemaVersion === "work-cloud-media-v2") ===
      !!bound?.cloud.media,
    "APPROVAL_STALE",
    "The Cloud protocol binding changed.",
  );
  if (media) {
    const now = Date.now();
    ensure(
      process.env.RESTORE_LOCK !== "true" &&
        source.kind === "url" &&
        !!source.url &&
        !source.currentRevisionId &&
        !source.publicImportId &&
        !source.personalMedia &&
        !source.personalOrderedInput &&
        !source.orderedPreparation &&
        !source.serviceIntent &&
        !source.objectKey &&
        !source.creatorRights &&
        source.rightsAttested &&
        sourceRetained(source) &&
        Number.isSafeInteger(media.retainUntil) &&
        media.retainUntil > now &&
        media.retainUntil <=
          (bound?.approvedAt ?? now) +
            workCloudMediaPolicy.maximumResultRetentionMs &&
        media.retainUntil <= (source.sourceRetentionUntil ?? Infinity) &&
        source.title.length <= 240 &&
        !containsSecret(source.title),
      "SOURCE_UNAVAILABLE",
      "Review a permitted single-video URL and finite private result retention.",
    );
    const acquisition = privateCloudMediaIdentity(source.url!);
    ensure(
      acquisition.url === source.canonical &&
        (!source.orderedMedia || !!bound?.cloud.media?.preparationHash),
      "APPROVAL_STALE",
      "The original video identity or preparation changed.",
    );
    const policyHash = await digest(canonicalJson(workCloudMediaPolicy));
    const toolchainHash = await digest(
      canonicalJson(workCloudMediaPolicy.toolchain),
    );
    ensure(
      !bound ||
        (bound.cloud.media?.canonicalUrl === acquisition.url &&
          bound.cloud.media.toolchainHash === toolchainHash),
      "APPROVAL_STALE",
      "The reviewed media toolchain changed.",
    );
    const input = {
      schemaVersion: "work-cloud-media-v2",
      sourceId: source._id,
      generation,
      processingRunId: `${source._id}:${generation}`,
      title: source.title,
      inputKind: "media" as const,
      canonicalUrl: acquisition.url,
      platform: acquisition.platform,
      allowedDomains: acquisition.domains,
      retainUntil: media.retainUntil,
      expectedCoverage: "ordered_media",
      outputSchema: canonicalJson(z.toJSONSchema(socialAnalysisOutput)),
      policy: workCloudMediaPolicy,
      policyHash,
      toolchainHash,
      text: "",
      sourceRevisionId: null,
      sourceContentHash: null,
      revision: null,
      evidence: [],
    };
    const serialized = canonicalJson(input);
    ensure(
      new TextEncoder().encode(serialized).byteLength <= 120000 &&
        !containsSecret(serialized),
      "INVALID_INPUT",
      "The full Cloud media input exceeds its byte or credential bound.",
    );
    return {
      registry: null,
      input,
      policyHash,
      inputHash: await digest(serialized),
    };
  }
  ensure(
    !source.publicImportId &&
      !source.personalMedia &&
      !source.personalOrderedInput &&
      !source.orderedMedia &&
      !source.orderedPreparation &&
      !source.serviceIntent &&
      !source.objectKey &&
      ["text", "url"].includes(source.kind),
    "SOURCE_UNAVAILABLE",
    "This handoff supports supplied or retained text only, without media acquisition.",
  );
  const registry = await typedSource(ctx, source, bound);
  ensure(
    source.kind === "text" || registry,
    "SOURCE_UNAVAILABLE",
    "Retained text evidence is required for a URL.",
  );
  const text = registry
    ? registry.evidence.map((record) => record.excerpt).join("\n")
    : source.text;
  ensure(
    typeof text === "string" &&
      text.trim().length > 0 &&
      text.length <= 60000 &&
      source.title.length <= 240 &&
      !containsSecret(text) &&
      !containsSecret(source.title),
    "INVALID_INPUT",
    "Use bounded text without secrets.",
  );
  const policyHash = await digest(canonicalJson(policy));
  const input = {
    schemaVersion: "work-cloud-text-v1",
    sourceId: source._id,
    generation,
    processingRunId: `${source._id}:${generation}`,
    expectedCoverage: registry ? "source_text" : "caption_only",
    // Convex reserves object keys beginning with "$"; preserve the complete
    // official schema as canonical JSON rather than dropping its metadata.
    outputSchema: canonicalJson(registry ? sourceInsightSchema : insightSchema),
    title: source.title,
    text,
    inputKind: registry ? ("source_text" as const) : ("supplied_text" as const),
    sourceRevisionId: registry?.id ?? null,
    sourceContentHash: registry?.revision.contentHash ?? null,
    revision: registry?.revision ?? null,
    evidence: registry?.evidence ?? [
      { kind: "user_note", id: "supplied_text", startMs: null, endMs: null },
    ],
    policyHash,
  };
  const serialized = canonicalJson(input);
  ensure(
    new TextEncoder().encode(serialized).length <= 120000 &&
      !containsSecret(serialized),
    "INVALID_INPUT",
    "The full Cloud input exceeds its safe byte bound or contains credentials.",
  );
  return {
    registry,
    input,
    policyHash,
    inputHash: await digest(serialized),
  };
}
async function approvable(ctx: QueryCtx, source: Doc<"sources">) {
  ensure(
    !["ready", "queued", "processing"].includes(source.state) &&
      !(
        source.personalAnalysis?.executor === "work_cloud" &&
        (source.personalAnalysis.state === "unknown" ||
          (source.personalAnalysis.cloud.leaseTokenHash &&
            source.personalAnalysis.state !== "completed"))
      ),
    "APPROVAL_STALE",
    "Review the source and reconcile any earlier Cloud execution before approving again.",
  );
  const prior = source.personalAnalysis;
  if (prior && prior.executor !== "work_cloud") {
    const device = await ctx.db.get(prior.deviceId);
    ensure(
      device?.activePersonalSource !== source._id,
      "APPROVAL_STALE",
      "Reconcile the earlier paired-computer request before changing executors.",
    );
  }
}
export const preview = query({
  args: {
    sourceId: v.id("sources"),
    grantId: v.id("assistantGrants"),
    inputKind: v.optional(v.literal("media")),
    retainUntil: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const owned = await ownedSource(ctx, a.sourceId, a.inputKind === "media");
    ensure(
      a.inputKind === "media"
        ? a.retainUntil !== undefined
        : a.retainUntil === undefined,
      "INVALID_INPUT",
      "Retention is explicit only for the media protocol.",
    );
    await approvable(ctx, owned.source);
    const grant = await selectedGrant(
      ctx,
      owned.source,
      owned.actor,
      owned.organization,
      a.grantId,
    );
    const input = await sourceInput(
      ctx,
      owned.source,
      owned.source.generation + 1,
      null,
      a.inputKind === "media" ? { retainUntil: a.retainUntil! } : undefined,
    );
    return {
      sourceId: a.sourceId,
      generation: owned.source.generation,
      approvedGeneration: owned.source.generation + 1,
      grantId: grant._id,
      grantVersion: grant.version,
      inputHash: input.inputHash,
      policyHash: input.policyHash,
      inputKind: input.input.inputKind,
      inputCharacters: input.input.text.length,
      maxApiUsd: 0,
      mediaSupported: a.inputKind === "media",
      ...(input.input.inputKind === "media"
        ? {
            retainUntil: input.input.retainUntil,
            toolchainHash: input.input.toolchainHash,
          }
        : {}),
    };
  },
});
export const approve = mutation({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    grantId: v.id("assistantGrants"),
    grantVersion: v.number(),
    expectedInputHash: v.string(),
    model: v.string(),
    effort: v.string(),
    useOwnPlan: v.literal(true),
    maxApiUsd: v.literal(0),
    inputKind: v.optional(v.literal("media")),
    retainUntil: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const owned = await ownedSource(ctx, a.sourceId, a.inputKind === "media");
    ensure(
      a.inputKind === "media"
        ? a.retainUntil !== undefined
        : a.retainUntil === undefined,
      "INVALID_INPUT",
      "Retention is explicit only for the media protocol.",
    );
    await recentAuthentication(ctx);
    await approvable(ctx, owned.source);
    ensure(
      Number.isSafeInteger(a.generation) &&
        owned.source.generation === a.generation &&
        safeModel(a.model) &&
        ["low", "medium", "high", "xhigh"].includes(a.effort),
      "APPROVAL_STALE",
      "Review the current source, requested model and effort.",
    );
    const grant = await selectedGrant(
      ctx,
      owned.source,
      owned.actor,
      owned.organization,
      a.grantId,
    );
    ensure(
      grant.version === a.grantVersion,
      "APPROVAL_STALE",
      "The execution grant changed.",
    );
    const generation = a.generation + 1;
    const input = await sourceInput(
      ctx,
      owned.source,
      generation,
      null,
      a.inputKind === "media" ? { retainUntil: a.retainUntil! } : undefined,
    );
    ensure(
      a.expectedInputHash === input.inputHash,
      "APPROVAL_STALE",
      "The approved source input changed.",
    );
    await limit(ctx, `work-cloud-approval:${owned.actor._id}`, 6);
    const now = Date.now();
    const job: WorkCloudJob = {
      executor: "work_cloud",
      actor: owned.actor._id,
      generation,
      model: a.model,
      effort: a.effort,
      state: "queued",
      approvedAt: now,
      expiresAt: now + 900000,
      leaseUntil: 0,
      deadline: 0,
      stage: a.inputKind === "media" ? "acquiring" : "analyzing",
      ...(input.registry
        ? {
            sourceRevisionId: input.registry.id,
            sourceContentHash: input.registry.revision.contentHash,
          }
        : {}),
      cloud: {
        grantId: grant._id,
        grantVersion: grant.version,
        clientId: grant.clientId,
        selectedGeneration: owned.source.generation,
        selectedRevision: owned.source.updatedAt,
        inputHash: input.inputHash,
        policyHash: input.policyHash,
        funding: "own_subscription",
        maxApiUsd: 0,
        ...(input.input.inputKind === "media"
          ? {
              schemaVersion: "work-cloud-media-v2" as const,
              media: {
                canonicalUrl: input.input.canonicalUrl,
                toolchainHash: input.input.toolchainHash,
                retainUntil: input.input.retainUntil,
              },
            }
          : { schemaVersion: "work-cloud-text-v1" as const }),
      },
    };
    await reserve(
      ctx,
      owned.organization._id,
      `source:${a.sourceId}:${generation}`,
      0,
    );
    await ctx.db.patch(a.sourceId, {
      generation,
      state: "queued",
      personalAnalysis: job,
      ...(job.cloud.media
        ? { sourceRetentionUntil: job.cloud.media.retainUntil }
        : {}),
      managedAnalysisActor: undefined,
      analysis: undefined,
      summary: undefined,
      error: undefined,
      updatedAt: Math.max(now, owned.source.updatedAt + 1),
    });
    if (input.registry) await ctx.db.patch(input.registry.id, { generation });
    await audit(
      ctx,
      owned.organization._id,
      owned.actor._id,
      "work_cloud.text_approved",
      `${a.sourceId}:${generation}`,
    );
    return {
      sourceId: a.sourceId,
      generation,
      state: "queued" as const,
      expiresAt: job.expiresAt,
      inputHash: input.inputHash,
    };
  },
});

async function current(
  ctx: QueryCtx,
  sourceId: Id<"sources">,
  generation: number,
  allowExpiredMedia = false,
) {
  const source = await ctx.db.get(sourceId);
  ensure(
    source && source.state !== "deleted",
    "SOURCE_UNAVAILABLE",
    "Source unavailable.",
  );
  const a = await assistantGrant(
    ctx,
    source.organizationId,
    "analysis:execute",
  );
  const job = source.personalAnalysis;
  enabled(
    a.actor.subject,
    job?.executor === "work_cloud" &&
      job.cloud.schemaVersion === "work-cloud-media-v2",
  );
  ensure(
    a.organization.privateOwnerId === a.actor._id &&
      a.membership.role === "owner" &&
      job?.executor === "work_cloud" &&
      job.actor === a.actor._id &&
      job.generation === generation &&
      source.generation === generation &&
      job.cloud.grantId === a.grant._id &&
      job.cloud.grantVersion === a.grant.version &&
      job.cloud.clientId === a.client.id &&
      (job.expiresAt > Date.now() ||
        (allowExpiredMedia &&
          job.cloud.media &&
          job.state === "running" &&
          source.state === "processing")),
    "APPROVAL_STALE",
    "The approved Cloud source or execution grant changed.",
  );
  if (a.grant.libraryScope)
    ensure(
      await sourceWithinAssistantScope(
        ctx,
        a.grant,
        a.organization,
        a.actor._id,
        source,
        false,
      ),
      "FORBIDDEN",
      "The source left the approved private scope.",
    );
  else
    ensure(
      a.grant.sources.some(
        (ref) =>
          ref.sourceId === source._id &&
          ref.generation === job.cloud.selectedGeneration &&
          ref.revision === job.cloud.selectedRevision,
      ),
      "FORBIDDEN",
      "The original selected source grant changed.",
    );
  const input = await sourceInput(ctx, source, generation, job);
  ensure(
    input.inputHash === job.cloud.inputHash &&
      input.policyHash === job.cloud.policyHash,
    "APPROVAL_STALE",
    "The approved input or policy changed.",
  );
  if (job.cloud.media?.preparationHash) {
    const prepared = workCloudMediaPreparation.parse({
      schemaVersion: "work-cloud-media-preparation-v2",
      post: source.orderedMedia?.post,
      evidence: source.orderedMedia?.evidence,
    });
    ensure(
      source.orderedMedia?.schemaVersion === "ordered-media-v1" &&
        (await digest(
          canonicalJson({
            schemaVersion: "ordered-media-v1",
            post: prepared.post,
            evidence: prepared.evidence,
          }),
        )) === job.cloud.media.preparationHash,
      "APPROVAL_STALE",
      "Prepared media observations changed.",
    );
  }
  return { source, job, ...a, ...input };
}
async function leased(
  ctx: QueryCtx,
  a: ExecutionArgs,
  allowTerminal = false,
  allowExpiredMedia = false,
) {
  const c = await current(ctx, a.sourceId, a.generation, allowExpiredMedia);
  ensure(
    c.job.cloud.taskId === a.taskId &&
      c.job.cloud.consentId === c.identity.sid &&
      typeof a.leaseToken === "string" &&
      a.leaseToken.length <= 100 &&
      (await digest(a.leaseToken)) === c.job.cloud.leaseTokenHash,
    "APPROVAL_STALE",
    "The Cloud task, consent or lease token changed.",
  );
  const expiredMedia =
    !!c.job.cloud.media &&
    c.job.state === "running" &&
    c.source.state === "processing" &&
    (c.job.leaseUntil <= Date.now() ||
      c.job.deadline <= Date.now() ||
      c.job.expiresAt <= Date.now());
  ensure(
    (allowExpiredMedia && expiredMedia) ||
      (allowTerminal &&
        c.job.state === "completed" &&
        c.source.state === "ready") ||
      (c.job.state === "running" &&
        c.source.state === "processing" &&
        c.job.leaseUntil > Date.now() &&
        c.job.deadline > Date.now()),
    "APPROVAL_STALE",
    "The Cloud execution lease is no longer active.",
  );
  return { ...c, expiredMedia };
}
export const input = internalQuery({
  args: executionArgs,
  handler: async (ctx, a) => {
    const c = await leased(ctx, a);
    const response = {
      ...c.input,
      inputHash: c.inputHash,
      requestedModel: c.job.model,
      requestedEffort: c.job.effort,
      leaseUntil: c.job.leaseUntil,
      deadline: c.job.deadline,
      maxApiUsd: 0,
      evidenceTrust:
        "User-authorized retained text; host execution and model are not provider-attested.",
      mediaSupported: c.job.cloud.schemaVersion === "work-cloud-media-v2",
      ...(c.job.cloud.media
        ? {
            preparationSchema: canonicalJson(
              z.toJSONSchema(workCloudMediaPreparation),
            ),
            preparationHash: c.job.cloud.media.preparationHash ?? null,
            prepared: c.source.orderedMedia ?? null,
            evidenceTrust:
              "Authenticated host-reported acquisition and sampled observations; model, execution, raw-media deletion and provider retention are unverified.",
          }
        : {}),
    };
    ensure(
      new TextEncoder().encode(JSON.stringify(response)).byteLength <= 262144,
      "INVALID_INPUT",
      "The full Cloud input response exceeds its transport bound.",
    );
    return response;
  },
});
export const dispatch = internalMutation({
  args: {
    ...sourceArgs,
    operation: v.union(
      v.literal("claim"),
      v.literal("heartbeat"),
      v.literal("complete"),
      v.literal("fail"),
      v.literal("prepare"),
    ),
    leaseToken: v.optional(v.string()),
    output: v.optional(v.any()),
    preparation: v.optional(v.any()),
    usage: v.optional(
      v.object({ inputTokens: v.number(), outputTokens: v.number() }),
    ),
    reportedModel: v.optional(v.string()),
    reportedEffort: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ensure(
      /^[A-Za-z0-9._:-]{1,160}$/.test(a.taskId),
      "INVALID_INPUT",
      "Use a bounded task identifier.",
    );
    ensure(
      a.operation === "complete" ||
        (a.output === undefined &&
          a.usage === undefined &&
          a.reportedModel === undefined &&
          a.reportedEffort === undefined),
      "INVALID_INPUT",
      "Completion data is permitted only for completion.",
    );
    ensure(
      a.operation === "prepare" || a.preparation === undefined,
      "INVALID_INPUT",
      "Preparation data requires the media preparation operation.",
    );
    if (a.operation === "claim") {
      ensure(
        a.leaseToken === undefined,
        "INVALID_INPUT",
        "A new claim has no lease token.",
      );
      const c = await current(ctx, a.sourceId, a.generation);
      ensure(
        c.job.state === "queued" &&
          c.source.state === "queued" &&
          !c.job.cloud.leaseTokenHash &&
          !c.job.cloud.taskId &&
          !c.job.cloud.consentId,
        "APPROVAL_STALE",
        "This approval was already claimed. Reconcile it without retrying execution.",
      );
      await limit(ctx, `work-cloud-dispatch:${c.actor._id}`, 120);
      const token = crypto.randomUUID(),
        now = Date.now();
      const deadline = Math.min(
        c.job.expiresAt,
        now +
          (c.job.cloud.media
            ? workCloudMediaPolicy.maximumExecutionMs
            : 180000),
      );
      const leaseUntil = Math.min(
        deadline,
        now + (c.job.cloud.media ? workCloudMediaPolicy.maximumLeaseMs : 40000),
      );
      await ctx.db.patch(c.source._id, {
        state: "processing",
        updatedAt: Math.max(now, c.source.updatedAt + 1),
        personalAnalysis: {
          ...c.job,
          state: "running",
          leaseUntil,
          deadline,
          cloud: {
            ...c.job.cloud,
            taskId: a.taskId,
            ...(c.job.cloud.media ? { claimedAt: now } : {}),
            consentId: c.identity.sid as string,
            leaseTokenHash: await digest(token),
          },
        },
      });
      if (c.job.cloud.media)
        await ctx.scheduler.runAfter(
          Math.max(0, c.job.cloud.media.retainUntil - now),
          internal.workCloudAnalysis.expire,
          {
            sourceId: c.source._id,
            organizationId: c.source.organizationId,
            generation: c.job.generation,
            retainUntil: c.job.cloud.media.retainUntil,
          },
        );
      return {
        sourceId: c.source._id,
        generation: c.job.generation,
        leaseToken: token,
        leaseUntil,
        deadline,
        inputHash: c.inputHash,
        requestedModel: c.job.model,
        requestedEffort: c.job.effort,
        hostVerified: false,
      };
    }
    ensure(
      a.leaseToken !== undefined,
      "INVALID_INPUT",
      "Use the exact claimed lease token.",
    );
    const c = await leased(
      ctx,
      { ...a, leaseToken: a.leaseToken },
      a.operation === "complete",
      true,
    );
    await limit(ctx, `work-cloud-dispatch:${c.actor._id}`, 120);
    if (c.expiredMedia) {
      await settle(
        ctx,
        c.source.organizationId,
        `source:${c.source._id}:${c.job.generation}`,
        0,
      );
      await ctx.db.patch(c.source._id, {
        state: "failed",
        personalAnalysis: { ...c.job, state: "unknown", leaseUntil: 0 },
        error:
          "The Cloud media lease expired. Host stop and subscription usage are unknown; reconcile before retrying.",
        updatedAt: Math.max(Date.now(), c.source.updatedAt + 1),
      });
      return { accepted: false, state: "unknown", hostStopped: false };
    }
    if (a.operation === "heartbeat") {
      const leaseUntil = Math.min(
        Date.now() +
          (c.job.cloud.media ? workCloudMediaPolicy.maximumLeaseMs : 40000),
        c.job.deadline,
      );
      await ctx.db.patch(c.source._id, {
        personalAnalysis: { ...c.job, leaseUntil },
      });
      return { valid: true, leaseUntil, deadline: c.job.deadline };
    }
    if (a.operation === "fail") {
      await settle(
        ctx,
        c.source.organizationId,
        `source:${c.source._id}:${c.job.generation}`,
        0,
      );
      await ctx.db.patch(c.source._id, {
        state: "failed",
        personalAnalysis: { ...c.job, state: "unknown", leaseUntil: 0 },
        error:
          "Cloud completion is unknown. Review the host task before retrying; host stop and usage are unverified.",
        updatedAt: Math.max(Date.now(), c.source.updatedAt + 1),
      });
      return { accepted: true, state: "unknown", hostStopped: false };
    }
    if (a.operation === "prepare") {
      ensure(
        c.job.cloud.media,
        "INVALID_INPUT",
        "Preparation requires an approved media protocol.",
      );
      const checked = workCloudMediaPreparation.parse(a.preparation);
      ensure(
        new TextEncoder().encode(canonicalJson(checked)).byteLength <= 120000 &&
          !containsSecret(canonicalJson(checked)),
        "INVALID_EVIDENCE",
        "Use bounded media observations without credentials.",
      );
      const post = checked.post,
        now = Date.now();
      ensure(
        post.canonical === c.job.cloud.media.canonicalUrl &&
          post.taskId === a.taskId &&
          post.inputHash === c.inputHash &&
          post.policyHash === c.policyHash &&
          post.toolchainHash === c.job.cloud.media.toolchainHash &&
          post.retainUntil === c.job.cloud.media.retainUntil &&
          c.job.cloud.claimedAt !== undefined &&
          post.observedAt >= c.job.cloud.claimedAt &&
          post.observedAt <= now,
        "INVALID_EVIDENCE",
        "The acquired revision is outside the exact approved Cloud lease.",
      );
      const validated = await validateOrderedEvidence(post, checked.evidence);
      const prepared = {
        schemaVersion: "ordered-media-v1" as const,
        ...validated,
      };
      const preparationHash = await digest(canonicalJson(prepared));
      ensure(
        !c.job.cloud.media.preparationHash ||
          c.job.cloud.media.preparationHash === preparationHash,
        "APPROVAL_STALE",
        "This lease already bound different acquired observations.",
      );
      if (!c.job.cloud.media.preparationHash)
        await ctx.db.patch(c.source._id, {
          orderedMedia: prepared,
          personalAnalysis: {
            ...c.job,
            stage: "analyzing",
            cloud: {
              ...c.job.cloud,
              media: { ...c.job.cloud.media, preparationHash },
            },
          },
        });
      return { accepted: true, preparationHash, observationsVerified: false };
    }
    const output = c.job.cloud.media
      ? validateWorkCloudMediaOutput(a.output)
      : validateWorkCloudTextOutput(a.output, !!c.registry);
    ensure(
      new TextEncoder().encode(JSON.stringify(output)).length <= 120000 &&
        (a.reportedModel === undefined || a.reportedModel === c.job.model) &&
        (a.reportedEffort === undefined || a.reportedEffort === c.job.effort),
      "INVALID_EVIDENCE",
      "Use bounded output and report the approved requested model and effort.",
    );
    ensure(
      output !== null &&
        typeof output === "object" &&
        "insights" in output &&
        Array.isArray(output.insights) &&
        output.insights.every(
          (insight: unknown) =>
            typeof insight === "object" &&
            insight !== null &&
            "evidence" in insight &&
            Array.isArray(insight.evidence) &&
            insight.evidence.length > 0,
        ),
      "INVALID_EVIDENCE",
      "Each Cloud insight must cite supplied evidence.",
    );
    ensure(
      !a.usage ||
        [a.usage.inputTokens, a.usage.outputTokens].every(
          (value) =>
            Number.isSafeInteger(value) && value >= 0 && value <= 10000000,
        ),
      "INVALID_INPUT",
      "Use bounded reported token counts.",
    );
    const completionHash = await digest(
      canonicalJson({
        output,
        usage: a.usage ?? null,
        reportedModel: a.reportedModel ?? null,
        reportedEffort: a.reportedEffort ?? null,
      }),
    );
    if (c.job.state === "completed") {
      ensure(
        c.job.cloud.completionHash === completionHash,
        "APPROVAL_STALE",
        "The completed output changed.",
      );
      return { accepted: true, cached: true };
    }
    if (c.job.cloud.media) {
      ensure(
        c.job.cloud.media.preparationHash && c.source.orderedMedia,
        "INVALID_EVIDENCE",
        "Bind acquired media observations before returning analysis.",
      );
      const validated = await validateOrderedAnalysis(
        output,
        c.source.orderedMedia,
        {
          sourceId: c.source._id,
          generation: c.job.generation,
        },
      );
      validated.analysis.warnings = [
        ...new Set([
          "Authenticated host-reported media observations and requested model settings are not independently verified.",
          "Video frames are sampled; short scenes can be missed. Automatic transcription can contain errors.",
          "Raw media stays in the provider task. Its cleanup target, cancellation and retained task history are unverified.",
          ...validated.analysis.warnings,
        ]),
      ].slice(0, 20);
      await commitPersonalOrdered(
        ctx,
        c.source,
        c.job,
        validated,
        a.usage,
        Math.max(Date.now(), c.source.updatedAt + 1),
        workCloudMediaPolicy.pipelineVersion,
      );
      await currentOrderedSource((await ctx.db.get(c.source._id))!);
    } else
      await completePersonalSource(
        ctx,
        c.source,
        c.job,
        { ...a, output },
        c.registry,
        Math.max(Date.now(), c.source.updatedAt + 1),
        "official-work-cloud-text-v1",
      );
    const completed = (await ctx.db.get(c.source._id))!.personalAnalysis;
    ensure(
      completed?.executor === "work_cloud",
      "APPROVAL_STALE",
      "The Cloud completion changed.",
    );
    await ctx.db.patch(c.source._id, {
      personalAnalysis: {
        ...completed,
        cloud: {
          ...completed.cloud,
          completionHash,
          ...(a.reportedModel === undefined
            ? {}
            : { reportedModel: a.reportedModel }),
          ...(a.reportedEffort === undefined
            ? {}
            : { reportedEffort: a.reportedEffort }),
        },
      },
    });
    return { accepted: true, cached: false };
  },
});

// App retention erases app evidence only. It cannot attest provider cleanup.
export const expire = internalMutation({
  args: {
    sourceId: v.id("sources"),
    organizationId: v.id("organizations"),
    generation: v.number(),
    retainUntil: v.number(),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.sourceId),
      job = source?.personalAnalysis;
    if (
      !source ||
      source.organizationId !== a.organizationId ||
      a.retainUntil > Date.now()
    )
      return;
    if (process.env.RESTORE_LOCK === "true") {
      await ctx.scheduler.runAfter(60000, internal.workCloudAnalysis.expire, a);
      return;
    }
    await ctx.scheduler.runAfter(0, internal.knowledge.redactDerived, {
      organizationId: a.organizationId,
      sourceId: source._id,
      section: "knowledgeJobs",
      cursor: null,
      maxGeneration: a.generation,
    });
    if (
      source.generation !== a.generation ||
      job?.executor !== "work_cloud" ||
      job.generation !== a.generation ||
      !job.cloud.media ||
      job.cloud.media.retainUntil !== a.retainUntil
    )
      return;
    await ctx.db.patch(source._id, {
      state: "failed",
      orderedMedia: undefined,
      analysis: undefined,
      summary: undefined,
      personalAnalysis: {
        ...job,
        // Preserve an acknowledged completion as known. Expiring its app
        // evidence does not turn that completed attempt into unresolved usage.
        state: job.state === "completed" ? "completed" : "unknown",
        leaseUntil: 0,
        cloud: {
          ...job.cloud,
          media: { ...job.cloud.media, preparationHash: undefined },
        },
      },
      error:
        "Private Cloud result retention expired. Provider files, history and usage remain unverified.",
      updatedAt: Math.max(Date.now(), source.updatedAt + 1),
    });
    const expired = (await ctx.db.get(source._id))!;
    await syncCategories(ctx, expired);
    await syncKnowledge(ctx, expired, {
      preserveManualHistory: true,
      enqueue: false,
    });
  },
});
