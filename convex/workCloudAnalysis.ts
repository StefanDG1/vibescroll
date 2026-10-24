import { v } from "convex/values";
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
import { workCloudTextAllowed } from "./lib/personalAccess";
import { typedSource, completePersonalSource } from "./personalAnalysis";
import { reserve, settle, digest } from "./product";
import { ensure, containsSecret } from "../packages/policy";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { safeModel } from "../packages/runner/subscription-capabilities.mjs";
import type { WorkCloudJob } from "./personalAnalysisSchema";
import { validateWorkCloudTextOutput } from "../packages/contracts/work-cloud-text";
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

function enabled(subject: string) {
  ensure(
    workCloudTextAllowed(subject),
    "FORBIDDEN",
    "Work Cloud text handoff is unavailable for this account.",
  );
}
async function ownedSource(ctx: QueryCtx, id: Id<"sources">) {
  const source = await ctx.db.get(id);
  ensure(
    source && source.state !== "deleted",
    "SOURCE_UNAVAILABLE",
    "Source unavailable.",
  );
  const a = await access(ctx, source.organizationId, ["owner"]);
  enabled(a.actor.subject);
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
) {
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
  args: { sourceId: v.id("sources"), grantId: v.id("assistantGrants") },
  handler: async (ctx, a) => {
    const owned = await ownedSource(ctx, a.sourceId);
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
      mediaSupported: false,
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
  },
  handler: async (ctx, a) => {
    const owned = await ownedSource(ctx, a.sourceId);
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
    const input = await sourceInput(ctx, owned.source, generation);
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
      stage: "analyzing",
      ...(input.registry
        ? {
            sourceRevisionId: input.registry.id,
            sourceContentHash: input.registry.revision.contentHash,
          }
        : {}),
      cloud: {
        schemaVersion: "work-cloud-text-v1",
        grantId: grant._id,
        grantVersion: grant.version,
        clientId: grant.clientId,
        selectedGeneration: owned.source.generation,
        selectedRevision: owned.source.updatedAt,
        inputHash: input.inputHash,
        policyHash: input.policyHash,
        funding: "own_subscription",
        maxApiUsd: 0,
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
  enabled(a.actor.subject);
  const job = source.personalAnalysis;
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
      job.expiresAt > Date.now(),
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
  return { source, job, ...a, ...input };
}
async function leased(ctx: QueryCtx, a: ExecutionArgs, allowTerminal = false) {
  const c = await current(ctx, a.sourceId, a.generation);
  ensure(
    c.job.cloud.taskId === a.taskId &&
      c.job.cloud.consentId === c.identity.sid &&
      typeof a.leaseToken === "string" &&
      a.leaseToken.length <= 100 &&
      (await digest(a.leaseToken)) === c.job.cloud.leaseTokenHash,
    "APPROVAL_STALE",
    "The Cloud task, consent or lease token changed.",
  );
  ensure(
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
  return c;
}
export const input = internalQuery({
  args: executionArgs,
  handler: async (ctx, a) => {
    const c = await leased(ctx, a);
    return {
      ...c.input,
      inputHash: c.inputHash,
      schemaVersion: "work-cloud-text-v1",
      requestedModel: c.job.model,
      requestedEffort: c.job.effort,
      leaseUntil: c.job.leaseUntil,
      deadline: c.job.deadline,
      maxApiUsd: 0,
      evidenceTrust:
        "User-authorized retained text; host execution and model are not provider-attested.",
      mediaSupported: false,
    };
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
    ),
    leaseToken: v.optional(v.string()),
    output: v.optional(v.any()),
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
      const deadline = Math.min(c.job.expiresAt, now + 180000);
      const leaseUntil = Math.min(deadline, now + 40000);
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
            consentId: c.identity.sid as string,
            leaseTokenHash: await digest(token),
          },
        },
      });
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
    );
    await limit(ctx, `work-cloud-dispatch:${c.actor._id}`, 120);
    if (a.operation === "heartbeat") {
      const leaseUntil = Math.min(Date.now() + 40000, c.job.deadline);
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
    const output = validateWorkCloudTextOutput(a.output, !!c.registry);
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
