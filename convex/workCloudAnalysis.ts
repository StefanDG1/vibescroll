import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import {
  query,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import type { Doc, Id } from "./_generated/dataModel";
import { access, recentAuthentication, limit, audit } from "./lib";
import {
  assistantClients,
  assistantGrantActive,
} from "../packages/policy/assistant";
import { assistantGrant } from "./lib/assistantPrincipal";
import { sourceWithinAssistantScope } from "./lib/assistantSourceScope";
import { workCloudSourceEligible } from "./lib/workCloudSourceAccess";
import { notifyCloudWaiting } from "./lib/assistantEvents";
import {
  workCloudMediaAllowed,
  workCloudTextAllowed,
} from "./lib/personalAccess";
import { typedSource, completePersonalSource } from "./lib/workCloudSource";
import { reserve, settle, digest } from "./product";
import { ensure, containsSecret } from "../packages/policy";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
const safeModel = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value);
import type { WorkCloudJob } from "./personalAnalysisSchema";
import {
  validateWorkCloudTextOutput,
  validateWorkCloudMediaOutput,
  workCloudMediaPolicy,
  workCloudMediaPolicyV2,
  workCloudMetadata,
  workCloudMediaPreparation,
  workCloudMcpRequestOptions,
} from "../packages/contracts/work-cloud-text";
import {
  socialAnalysisOutput,
  socialCitation,
  validateOrderedAnalysis,
} from "../packages/social/analysis";
import {
  validateOrderedEvidence,
  privateCloudMediaIdentity,
} from "../packages/social/contracts";
import { sourceRetained } from "./lib/sourceAuthority";
import { registerEvidenceAsset, queueDeletion } from "./assets";
import { retainedCloudFrames } from "../packages/media/cloud-frames";
import { evidenceRepairContext } from "./workCloudEvidenceRepair";
import { commitPersonalOrdered } from "./lib/personalOrderedCommit";
import { currentOrderedSource } from "./lib/workCloudMediaSource";
import { syncCategories } from "./categories";
import { syncKnowledge, recordRetentionAttention } from "./knowledge";
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
const frameArgs = {
  ...executionArgs,
  repair: v.optional(v.literal(true)),
  frameId: v.string(),
  preparationHash: v.string(),
};
const frameValue = v.object({
  id: v.string(),
  timestampMs: v.number(),
  sha256: v.string(),
  bytes: v.number(),
  width: v.number(),
  height: v.number(),
});
type ExecutionArgs = {
  repair?: true;
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
    await workCloudSourceEligible(ctx, a.organization, a.actor._id),
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
  bound?: WorkCloudJob,
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
      (bound && !grant.libraryScope
        ? grant.sources.some(
            (ref) =>
              ref.sourceId === source._id &&
              ref.generation === bound.cloud.selectedGeneration &&
              ref.revision === bound.cloud.selectedRevision,
          )
        : await sourceWithinAssistantScope(
            ctx,
            grant,
            organization,
            actor._id,
            source,
            !bound,
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
  const mediaPolicy =
    bound?.cloud.schemaVersion === "work-cloud-media-v2"
      ? workCloudMediaPolicyV2
      : workCloudMediaPolicy;
  const media = bound?.cloud.media ? bound.cloud.media : mediaApproval;
  ensure(
    (bound?.cloud.schemaVersion === "work-cloud-media-v2" ||
      bound?.cloud.schemaVersion === "work-cloud-media-v3") ===
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
        (!source.personalMedia ||
          (!!bound?.cloud.media?.preparationHash &&
            Object.keys(source.personalMedia).every(
              (key) => key === "cloudFrames",
            ) &&
            source.personalMedia.cloudFrames?.generation === generation &&
            source.personalMedia.cloudFrames?.preparationHash ===
              bound.cloud.media.preparationHash)) &&
        !source.objectKey &&
        source.rightsAttested &&
        sourceRetained(source.sourceRetentionUntil) &&
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
      acquisition.url === privateCloudMediaIdentity(source.canonical).url &&
        (!source.orderedMedia || !!bound?.cloud.media?.preparationHash),
      "APPROVAL_STALE",
      "The original video identity or preparation changed.",
    );
    const policyHash = await digest(canonicalJson(mediaPolicy));
    const toolchainHash = await digest(canonicalJson(mediaPolicy.toolchain));
    ensure(
      !bound ||
        (bound.cloud.media?.canonicalUrl === acquisition.url &&
          bound.cloud.media.toolchainHash === toolchainHash),
      "APPROVAL_STALE",
      "The reviewed media toolchain changed.",
    );
    const input = {
      schemaVersion: mediaPolicy.schemaVersion,
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
      policy: mediaPolicy,
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
      !source.orderedMedia &&
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
export type UnclaimedCloudHandoff = {
  protocol: WorkCloudJob["cloud"]["schemaVersion"];
  sourceId: Id<"sources">;
  organizationId: Id<"organizations">;
  generation: number;
  revision: number;
  expiresAt: number;
  inputHash: string;
  model: string;
  effort: string;
  media: boolean;
  grantId: Id<"assistantGrants">;
  grantVersion: number;
};
// An app owner may recover only a still-unclaimed, exactly current approval.
// This projection never creates a claim, token, approval or new execution.
export async function unclaimedCloudHandoff(
  ctx: QueryCtx,
  source: Doc<"sources">,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
): Promise<UnclaimedCloudHandoff | undefined> {
  const job = source.personalAnalysis;
  if (
    process.env.MCP_ENABLED !== "true" ||
    process.env.RESTORE_LOCK === "true" ||
    source.state !== "queued" ||
    job?.executor !== "work_cloud" ||
    job.state !== "queued" ||
    source.generation !== job.generation ||
    job.actor !== actor._id ||
    !(await workCloudSourceEligible(ctx, organization, actor._id)) ||
    job.expiresAt <= Date.now() ||
    job.cloud.taskId ||
    job.cloud.leaseTokenHash ||
    job.cloud.claimedAt !== undefined ||
    job.cloud.consentId ||
    !safeModel(job.model) ||
    !["low", "medium", "high", "xhigh"].includes(job.effort)
  )
    return;
  try {
    const media = !!job.cloud.media;
    enabled(actor.subject, media);
    const grant = await ctx.db.get(job.cloud.grantId);
    const client = assistantClients().find((c) => c.id === grant?.clientId);
    if (
      !grant ||
      grant.organizationId !== organization._id ||
      grant.actor !== actor._id ||
      grant.version !== job.cloud.grantVersion ||
      grant.clientId !== job.cloud.clientId ||
      !assistantGrantActive(grant) ||
      !grant.scopes.includes("analysis:execute") ||
      !client?.scopes.includes("analysis:execute")
    )
      return;
    if (grant.libraryScope) {
      if (
        !(await sourceWithinAssistantScope(
          ctx,
          grant,
          organization,
          actor._id,
          source,
          false,
        ))
      )
        return;
    } else if (
      !grant.sources.some(
        (ref) =>
          ref.sourceId === source._id &&
          ref.generation === job.cloud.selectedGeneration &&
          ref.revision === job.cloud.selectedRevision,
      )
    )
      return;
    const current = await sourceInput(ctx, source, job.generation, job);
    if (
      current.inputHash !== job.cloud.inputHash ||
      current.policyHash !== job.cloud.policyHash
    )
      return;
    return {
      sourceId: source._id,
      organizationId: source.organizationId,
      generation: source.generation,
      revision: source.updatedAt,
      expiresAt: job.expiresAt,
      inputHash: job.cloud.inputHash,
      protocol: job.cloud.schemaVersion,
      model: job.model,
      effort: job.effort,
      media,
      grantId: grant._id,
      grantVersion: grant.version,
    };
  } catch {
    return;
  }
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
    recovery: v.optional(
      v.object({
        taskId: v.string(),
        preparationHash: v.string(),
        completionHash: v.string(),
        acknowledged: v.literal(true),
      }),
    ),
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
    const grant = await selectedGrant(
      ctx,
      owned.source,
      owned.actor,
      owned.organization,
      a.grantId,
      a.recovery && owned.source.personalAnalysis?.executor === "work_cloud"
        ? owned.source.personalAnalysis
        : undefined,
    );
    if (a.recovery) {
      const source = owned.source,
        job = source.personalAnalysis,
        now = Date.now();
      ensure(
        a.inputKind === "media" &&
          job?.executor === "work_cloud" &&
          job.cloud.media &&
          job.state === "unknown" &&
          source.state === "failed" &&
          job.actor === owned.actor._id &&
          source.generation === a.generation &&
          job.generation === a.generation &&
          job.cloud.grantId === grant._id &&
          job.cloud.grantVersion === grant.version &&
          grant.version === a.grantVersion &&
          job.cloud.clientId === grant.clientId &&
          job.cloud.taskId === a.recovery.taskId &&
          !!job.cloud.consentId &&
          !!job.cloud.leaseTokenHash &&
          /^[a-f0-9]{64}$/.test(a.recovery.completionHash) &&
          job.cloud.media.preparationHash === a.recovery.preparationHash &&
          job.cloud.media.retainUntil === a.retainUntil &&
          a.retainUntil > now &&
          a.model === job.model &&
          a.effort === job.effort &&
          source.analysis === undefined &&
          source.summary === undefined &&
          !("privateSourceAnalysis" in source) &&
          !("privateSourceAnalysisRunId" in source) &&
          !!source.orderedMedia,
        "APPROVAL_STALE",
        "Review this exact retained Cloud result without starting another execution.",
      );
      const input = await sourceInput(ctx, source, source.generation, job);
      ensure(
        input.inputHash === a.expectedInputHash &&
          input.inputHash === job.cloud.inputHash &&
          input.policyHash === job.cloud.policyHash &&
          (await digest(canonicalJson(source.orderedMedia))) ===
            a.recovery.preparationHash,
        "APPROVAL_STALE",
        "The retained Cloud input or preparation changed.",
      );
      await limit(ctx, `work-cloud-result-recovery:${owned.actor._id}`, 6);
      const expiresAt = Math.min(now + 180000, job.cloud.media.retainUntil);
      await ctx.db.patch(source._id, {
        personalAnalysis: {
          ...job,
          state: "recovering",
          expiresAt,
          leaseUntil: expiresAt,
          cloud: { ...job.cloud, completionHash: a.recovery.completionHash },
        },
        updatedAt: Math.max(now, source.updatedAt + 1),
      });
      await audit(
        ctx,
        source.organizationId,
        owned.actor._id,
        "work_cloud.result_return_approved",
        `${source._id}:${source.generation}:${a.recovery.completionHash}`,
      );
      return {
        sourceId: source._id,
        generation: source.generation,
        state: "recovering" as const,
        expiresAt,
        inputHash: input.inputHash,
        providerExecutionAuthorized: false,
        usageVerified: false,
      };
    }
    return approveExactCloudSource(ctx, owned, grant, a);
  },
});

type CloudApproval = {
  sourceId: Id<"sources">;
  generation: number;
  grantVersion: number;
  expectedInputHash?: string;
  model: string;
  effort: string;
  inputKind?: "media";
  retainUntil?: number;
};
// Both entry points bind the same exact source/input/lease. The app wrapper
// retains recent authentication; MCP creation requires a separately reviewed
// versioned connection policy, never merely the two older OAuth scopes.
async function approveExactCloudSource(
  ctx: MutationCtx,
  owned: Awaited<ReturnType<typeof ownedSource>>,
  grant: Doc<"assistantGrants">,
  a: CloudApproval,
) {
  await approvable(ctx, owned.source);
  if (a.inputKind === "media" || !owned.organization.privateOwnerId)
    ensure(
      owned.source.analysis === undefined &&
        owned.source.summary === undefined &&
        owned.source.orderedMedia === undefined,
      "APPROVAL_STALE",
      "Cloud media experiments require an unanalyzed post. Preserve existing insights.",
    );
  ensure(
    Number.isSafeInteger(a.generation) &&
      owned.source.generation === a.generation &&
      safeModel(a.model) &&
      ["low", "medium", "high", "xhigh"].includes(a.effort),
    "APPROVAL_STALE",
    "Review the current source, requested model and effort.",
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
    a.expectedInputHash === undefined ||
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
            schemaVersion: input.input.schemaVersion,
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
  await notifyCloudWaiting(ctx, (await ctx.db.get(a.sourceId))!);
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
}

export async function requestCloudFromAssistant(
  ctx: MutationCtx,
  source: Doc<"sources">,
  request: {
    generation: number;
    revision: number;
    grantVersion: number;
    cloud: z.infer<typeof workCloudMcpRequestOptions>;
  },
) {
  const a = await assistantGrant(
    ctx,
    source.organizationId,
    "analysis:execute",
  );
  enabled(a.actor.subject, true);
  const options = workCloudMcpRequestOptions.parse(request.cloud);
  const currentPolicyHash = await digest(canonicalJson(workCloudMediaPolicy));
  ensure(
    a.scopes.includes("analysis:request") &&
      a.client.scopes.includes("analysis:request") &&
      a.grant.scopes.includes("analysis:request") &&
      (await workCloudSourceEligible(ctx, a.organization, a.actor._id)) &&
      a.membership.role === "owner" &&
      a.grant.cloudRequestPolicy === "explicit_per_source_v1" &&
      a.grant.cloudRequestPolicyHash === currentPolicyHash &&
      a.grant.version === request.grantVersion &&
      !a.grant.analysisDefaults?.enabled,
    "SETUP_REQUIRED",
    "Review private Cloud requests once in Connections. Existing execution permission alone cannot approve new work.",
  );
  ensure(
    Number.isSafeInteger(request.generation) &&
      request.generation >= 0 &&
      Number.isSafeInteger(request.revision) &&
      request.revision >= 0 &&
      safeModel(options.model),
    "INVALID_INPUT",
    "Use the exact current post, model and grant version.",
  );
  const job = source.personalAnalysis;
  if (job?.executor === "work_cloud" && source.state === "queued") {
    const pending = await unclaimedCloudHandoff(
      ctx,
      source,
      a.actor,
      a.organization,
    );
    ensure(
      pending &&
        ((job.cloud.selectedGeneration === request.generation &&
          job.cloud.selectedRevision === request.revision) ||
          (source.generation === request.generation &&
            source.updatedAt === request.revision)) &&
        job.model === options.model &&
        job.effort === options.effort &&
        job.cloud.media?.retainUntil === options.retainUntil,
      "APPROVAL_STALE",
      "The queued Cloud request changed or may already have been claimed.",
    );
    await notifyCloudWaiting(ctx, source);
    return cloudRequestReceipt(pending, true);
  }
  ensure(
    source.generation === request.generation &&
      source.updatedAt === request.revision &&
      (await sourceWithinAssistantScope(
        ctx,
        a.grant,
        a.organization,
        a.actor._id,
        source,
      )),
    "APPROVAL_STALE",
    "The source or its selected execution scope changed.",
  );
  // Six fresh requests per actor per hour, across OAuth clients. Queued replays
  // return above and cannot consume another generation or reservation.
  const key = `work-cloud-mcp-hour:${a.actor._id}`;
  const window = Math.floor(Date.now() / 3600000);
  const row = await ctx.db
    .query("limits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  ensure(
    row?.window !== window || row.count < 6,
    "QUOTA_EXCEEDED",
    "The six-request hourly Cloud limit is reached.",
  );
  const approved = await approveExactCloudSource(
    ctx,
    { source, ...a },
    a.grant,
    {
      sourceId: source._id,
      generation: request.generation,
      grantVersion: request.grantVersion,
      model: options.model,
      effort: options.effort,
      inputKind: "media",
      retainUntil: options.retainUntil,
    },
  );
  const counter = { window, count: row?.window === window ? row.count + 1 : 1 };
  if (row) await ctx.db.patch(row._id, counter);
  else await ctx.db.insert("limits", { key, ...counter });
  return cloudRequestReceipt(
    {
      ...approved,
      protocol: workCloudMediaPolicy.schemaVersion,
      model: options.model,
      effort: options.effort,
    },
    false,
  );
}
function cloudRequestReceipt(
  value: {
    sourceId: Id<"sources">;
    generation: number;
    expiresAt: number;
    inputHash: string;
    model: string;
    effort: string;
    protocol: string;
  },
  reused: boolean,
) {
  return {
    source_id: value.sourceId,
    generation: value.generation,
    status: "waiting_for_cloud",
    analysis_started: false,
    reused_request: reused,
    cloud: {
      protocol: value.protocol,
      input_hash: value.inputHash,
      model: value.model,
      effort: value.effort,
      expires_at: value.expiresAt,
      funding: "own_subscription",
      max_api_usd: 0,
      publication: "private_only",
    },
    next: "Prepare supported tools and restricted Internet access in your own Work Cloud task, then call work_cloud_claim for this exact source and generation. No GitHub is required. This receipt does not launch the host or prove execution.",
  };
}

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
  enabled(a.actor.subject, job?.executor === "work_cloud" && !!job.cloud.media);
  ensure(
    (await workCloudSourceEligible(ctx, a.organization, a.actor._id)) &&
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
      schemaVersion:
        source.orderedMedia?.post?.schemaVersion ===
        "work-cloud-observed-media-v2"
          ? "work-cloud-media-preparation-v3"
          : "work-cloud-media-preparation-v2",
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
      (allowTerminal &&
        c.job.state === "recovering" &&
        c.source.state === "failed" &&
        !!c.job.cloud.completionHash &&
        c.job.leaseUntil > Date.now()) ||
      (c.job.state === "running" &&
        c.source.state === "processing" &&
        c.job.leaseUntil > Date.now() &&
        c.job.deadline > Date.now()),
    "APPROVAL_STALE",
    "The Cloud execution lease is no longer active.",
  );
  return { ...c, expiredMedia };
}
async function frameContext(
  ctx: QueryCtx,
  a: ExecutionArgs & { frameId: string; preparationHash: string },
) {
  const c = a.repair
    ? await evidenceRepairContext(ctx, a)
    : await leased(ctx, a);
  const media = c.job.cloud.media;
  ensure(
    media &&
      media.preparationHash === a.preparationHash &&
      sourceRetained(c.source.sourceRetentionUntil) &&
      c.source.rightsAttested,
    "APPROVAL_STALE",
    "The retained Cloud preparation changed.",
  );
  const prepared = workCloudMediaPreparation.parse({
    schemaVersion:
      c.source.orderedMedia?.post?.schemaVersion ===
      "work-cloud-observed-media-v2"
        ? "work-cloud-media-preparation-v3"
        : "work-cloud-media-preparation-v2",
    post: c.source.orderedMedia?.post,
    evidence: c.source.orderedMedia?.evidence,
  });
  const frame = prepared.post.frames.find((f) => f.id === a.frameId);
  ensure(
    frame && frame.bytes <= 150000,
    "INVALID_EVIDENCE",
    "Use a prepared JPEG frame of at most 150000 bytes.",
  );
  const existing = retainedCloudFrames(c.source).find(
    (f) => f.frameId === frame.id,
  );
  if (existing) {
    const assetId = ctx.db.normalizeId("assets", existing.assetId);
    const asset = assetId ? await ctx.db.get(assetId) : null;
    ensure(
      asset &&
        asset.state === "complete" &&
        asset.sourceId === c.source._id &&
        asset.sourceGeneration === c.source.generation &&
        asset.kind === "work_cloud_frame" &&
        asset.size === frame.bytes &&
        asset.expiresAt === media.retainUntil &&
        !(await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", asset.key))
          .unique()),
      "APPROVAL_STALE",
      "The retained Cloud frame was retired.",
    );
  }
  return { ...c, frame, existing };
}
export const frameUploadContext = internalQuery({
  args: frameArgs,
  returns: v.object({
    organizationId: v.id("organizations"),
    frame: frameValue,
    assetId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, a) => {
    const c = await frameContext(ctx, a);
    return {
      organizationId: c.source.organizationId,
      frame: c.frame,
      assetId: c.existing?.assetId ?? null,
    };
  },
});
export const recordFrame = internalMutation({
  args: { ...frameArgs, key: v.string(), size: v.number(), etag: v.string() },
  returns: v.union(v.null(), v.object({ assetId: v.string() })),
  handler: async (ctx, a) => {
    const c = await frameContext(ctx, a);
    ensure(
      a.size === c.frame.bytes &&
        a.key.startsWith(`${c.source.organizationId}/cloud-frame-`) &&
        /^[a-f0-9-]{36}$/.test(a.key.split("cloud-frame-")[1] ?? ""),
      "INVALID_EVIDENCE",
      "Use the exact bounded private frame object.",
    );
    if (c.existing) {
      await queueDeletion(ctx, a.key);
      return { assetId: c.existing.assetId };
    }
    const assetId = await registerEvidenceAsset(
      ctx,
      {
        sourceId: a.sourceId,
        generation: a.generation,
        key: a.key,
        size: a.size,
        etag: a.etag,
      },
      { kind: "work_cloud_frame", expiresAt: c.job.cloud.media!.retainUntil },
    );
    if (!assetId) return null;
    const frames = [
      ...retainedCloudFrames(c.source),
      {
        frameId: c.frame.id,
        assetId,
        sha256: c.frame.sha256,
        timestampMs: c.frame.timestampMs,
        size: a.size,
      },
    ];
    await ctx.db.patch(c.source._id, {
      personalMedia: {
        ...c.source.personalMedia,
        cloudFrames: {
          generation: a.generation,
          preparationHash: a.preparationHash,
          frames,
        },
      },
      updatedAt: Math.max(Date.now(), c.source.updatedAt + 1),
    });
    return { assetId };
  },
});
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
      mediaSupported: !!c.job.cloud.media,
      ...(c.job.cloud.media
        ? {
            preparationSchema: canonicalJson(
              z.toJSONSchema(workCloudMediaPreparation),
            ),
            preparationHash: c.job.cloud.media.preparationHash ?? null,
            preparationTransport: {
              tool: "work_cloud_prepare",
              schemaVersion: "work-cloud-media-stage-v1",
              stages: ["metadata", "frame"],
              maximumFrameBytes: 81920,
              note: "Use preparationJson with this schemaVersion and stage. Metadata carries metadata; frame carries preparationHash, frameId and canonical base64 data. Keep lease fields only in the tool arguments. Original observation preparation stays unchanged. Dedicated tools remain supported when available.",
            },
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
      v.literal("metadata"),
    ),
    leaseToken: v.optional(v.string()),
    output: v.optional(v.any()),
    preparation: v.optional(v.any()),
    metadata: v.optional(v.any()),
    usage: v.optional(
      v.object({ inputTokens: v.number(), outputTokens: v.number() }),
    ),
    reportedModel: v.optional(v.string()),
    reportedEffort: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ensure(
      a.operation === "metadata" || a.metadata === undefined,
      "INVALID_INPUT",
      "Metadata requires the metadata operation.",
    );
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
    if (a.operation !== "complete")
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
    if (a.operation === "metadata") {
      ensure(
        c.job.cloud.schemaVersion === "work-cloud-media-v3",
        "APPROVAL_STALE",
        "Native metadata requires a reviewed media-v3 lease.",
      );
      const metadata = workCloudMetadata.parse(a.metadata);
      const { publishedAt, ...previewMetadata } = metadata;
      ensure(
        !containsSecret(canonicalJson(metadata)) &&
          (!metadata.publishedAt ||
            metadata.publishedAt <= Date.now() + 86400000),
        "INVALID_INPUT",
        "Use native metadata without credentials or future dates.",
      );
      await ctx.db.patch(c.source._id, {
        linkPreview: {
          ...c.source.linkPreview,
          ...previewMetadata,
          origin: "extractor",
          state: ["queued", "loading"].includes(
            c.source.linkPreview?.state ?? "",
          )
            ? c.source.linkPreview!.state
            : "ready",
          updatedAt: Date.now(),
        },
      });
      if (publishedAt) await ctx.db.patch(c.source._id, { publishedAt });
      return { accepted: true, metadataUpdated: true };
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
        c.job.cloud.schemaVersion === "work-cloud-media-v3"
          ? checked.schemaVersion === "work-cloud-media-preparation-v3"
          : checked.schemaVersion === "work-cloud-media-preparation-v2",
        "APPROVAL_STALE",
        "Use the preparation version bound to this job; new jobs cannot downgrade image requirements.",
      );
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
    if (c.job.state === "recovering")
      ensure(
        c.job.cloud.completionHash === completionHash,
        "APPROVAL_STALE",
        "Return only the exact owner-approved result; no new execution is authorized.",
      );
    await limit(ctx, `work-cloud-dispatch:${c.actor._id}`, 120);
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
      const conservative = validateWorkCloudMediaOutput(output);
      const prepared = workCloudMediaPreparation.parse({
        schemaVersion:
          c.source.orderedMedia.post?.schemaVersion ===
          "work-cloud-observed-media-v2"
            ? "work-cloud-media-preparation-v3"
            : "work-cloud-media-preparation-v2",
        post: c.source.orderedMedia.post,
        evidence: c.source.orderedMedia.evidence,
      });
      if (c.job.cloud.schemaVersion === "work-cloud-media-v3") {
        const retained = retainedCloudFrames(c.source);
        ensure(
          prepared.post.frames.every((frame) =>
            retained.some((stored) => stored.frameId === frame.id),
          ),
          "INVALID_EVIDENCE",
          "Return the prepared image bytes before completing caption-aware analysis.",
        );
      }
      let downgraded = false;
      for (const insight of conservative.insights)
        for (const ref of insight.evidence)
          if (
            socialCitation(ref, prepared.evidence).uncertainty.trim() &&
            insight.confidence === "supported"
          ) {
            insight.confidence = "uncertain";
            downgraded = true;
          }
      const validated = await validateOrderedAnalysis(
        conservative,
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
          ...(downgraded
            ? [
                "Insight confidence was reduced where cited transcription or sampled observations contain uncertainty.",
              ]
            : []),
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
        (c.job.cloud.schemaVersion === "work-cloud-media-v2"
          ? workCloudMediaPolicyV2
          : workCloudMediaPolicy
        ).pipelineVersion,
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
    deferredAttempt: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.sourceId),
      job = source?.personalAnalysis;
    if (
      (source && source.organizationId !== a.organizationId) ||
      a.retainUntil > Date.now()
    )
      return;
    const attempt = a.deferredAttempt ?? 0;
    ensure(
      Number.isSafeInteger(attempt) &&
        attempt >= 0 &&
        attempt <= 2 &&
        Number.isSafeInteger(a.generation) &&
        a.generation >= 0 &&
        Number.isSafeInteger(a.retainUntil),
      "INVALID_INPUT",
      "Invalid finite retention deferral.",
    );
    // Superseded generations still need derivative cleanup. Start that distinct
    // bounded chain once, even when this source no longer needs primary scrub.
    if (attempt === 0)
      await ctx.scheduler.runAfter(0, internal.knowledge.redactDerived, {
        organizationId: a.organizationId,
        sourceId: a.sourceId,
        section: "knowledgeJobs",
        cursor: null,
        maxGeneration: a.generation,
        deferredAttempt: 0,
        pagesRemaining: 32,
      });
    if (
      !source ||
      source.state === "deleted" ||
      source.generation !== a.generation ||
      job?.executor !== "work_cloud" ||
      job.generation !== a.generation ||
      !job.cloud.media ||
      job.cloud.media.retainUntil !== a.retainUntil
    )
      return;
    if (process.env.RESTORE_LOCK === "true") {
      if (attempt < 2)
        await ctx.scheduler.runAfter(60000, internal.workCloudAnalysis.expire, {
          ...a,
          deferredAttempt: attempt + 1,
        });
      else {
        await recordRetentionAttention(
          ctx,
          {
            organizationId: a.organizationId,
            sourceId: a.sourceId,
            maxGeneration: a.generation,
          },
          "restore_deferrals_exhausted",
        );
        await ctx.db.patch(source._id, {
          personalAnalysis: { ...job, stage: "retention_cleanup_deferred" },
          error:
            "Private Cloud retention expired. App reads are blocked; physical cleanup requires operator attention after recovery.",
          updatedAt: Math.max(Date.now(), source.updatedAt + 1),
        });
      }
      return;
    }
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
