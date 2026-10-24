import { presentAnalysis } from "../packages/insights/presentation";
import { repositoryContent } from "./lib/repositoryContent";
import {
  query,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { writeAccess, access, recentAuthentication, audit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import { personalAllowed } from "./lib/personalAccess";
import { validateLocalRun } from "./lib/assistantIntake";
import { digest } from "./product";
import { insightOutput } from "../packages/contracts";
import { syncCategories } from "./categories";
import {
  syncKnowledge,
  memberEvidence,
  referencesCurrent,
  evaluationCurrent,
} from "./knowledge";
import {
  synthesis,
  evaluation,
  assertReferences,
  limits,
  processingVersion,
} from "../packages/knowledge/contracts";
import { snapshotScopeCurrent } from "../packages/repositories/scope";
import { z } from "zod";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { queueDeletion } from "./assets";
import { taskBindingsCurrent } from "./lib/localTaskAuthority";
import { samePrivateEvaluationOrigin } from "./lib/privateEvaluationContext";
import { releaseSourcePointer } from "./lib/privateSourceAnalysis";
import {
  acquisitionManifest,
  acquisitionPolicy,
} from "../packages/media/acquisition";
function importedAcquisition(raw: unknown, acquiredAt: number) {
  const { schemaVersion: _schemaVersion, ...metadata } =
    acquisitionManifest.parse(raw);
  return { ...metadata, basis: "permitted_public_fetch" as const, acquiredAt };
}
const runArgs = { runId: v.id("localLibraryRuns") };
const transcriptSchema = z
  .object({
    durationMs: z.number().int().min(0).max(600000),
    segments: z
      .array(
        z.strictObject({
          index: z.number().int().min(0),
          startMs: z.number().int().min(0),
          endMs: z.number().int().min(0),
          text: z.string().max(4000),
        }),
      )
      .max(200),
  })
  .passthrough()
  .superRefine((t, c) => {
    if (
      t.segments.some(
        (s, i) =>
          s.index !== i || s.endMs < s.startMs || s.endMs > t.durationMs,
      ) ||
      t.segments.reduce((n, s) => n + s.text.length, 0) > 60000
    )
      c.addIssue({ code: "custom", message: "Invalid bounded transcript." });
  });
export const sourceFingerprint = (s: Doc<"sources">) =>
  digest(
    canonicalJson({
      generation: s.generation,
      text: s.text,
      analysis: s.analysis,
      acquisition: s.acquisition,
      mediaEvidence: s.mediaEvidence,
      coverage: s.coverage,
      kind: s.kind,
      updatedAt: s.updatedAt,
    }),
  );
async function activeRun(
  ctx: QueryCtx,
  id: Id<"localLibraryRuns">,
  actorId?: Id<"users">,
) {
  const run = await ctx.db.get(id);
  ensure(run, "FORBIDDEN", "Local run unavailable.");
  const actor = actorId
    ? await ctx.db.get(actorId)
    : (await access(ctx, run.organizationId, ["owner", "admin"])).actor;
  ensure(actor, "FORBIDDEN", "Actor unavailable.");
  if (run.task) {
    ensure(actorId, "FORBIDDEN", "Use the paired executor's exact task lease.");
    await taskBindingsCurrent(ctx, run, actor._id);
  } else if (actorId) {
    await validateLocalRun(ctx, run, actorId);
  }
  ensure(
    actor._id === run.actor &&
      personalAllowed(actor.subject) &&
      run.state === "active" &&
      run.expiresAt > Date.now(),
    "APPROVAL_STALE",
    "Review your personal library permission again.",
  );
  return run;
}
export const prepare = mutation({
  args: {
    organizationId: v.id("organizations"),
    sources: v.array(v.id("sources")),
    repositories: v.array(v.id("repositories")),
    useOwnPlan: v.boolean(),
  },
  handler: async (ctx, a) => {
    const { actor } = await writeAccess(ctx, a.organizationId, [
      "owner",
      "admin",
    ]);
    await recentAuthentication(ctx);
    ensure(
      personalAllowed(actor.subject) && a.useOwnPlan,
      "FORBIDDEN",
      "Approve your own subscription for this personal run.",
    );
    ensure(
      a.sources.length > 0 &&
        a.sources.length <= 200 &&
        new Set(a.sources).size === a.sources.length &&
        a.repositories.length <= 20 &&
        new Set(a.repositories).size === a.repositories.length,
      "INVALID_INPUT",
      "Choose a bounded saved library and selected projects.",
    );
    for (const id of a.sources) {
      const s = await ctx.db.get(id);
      ensure(
        s?.organizationId === a.organizationId &&
          s.state !== "deleted" &&
          s.rightsAttested &&
          !["queued", "processing"].includes(s.state),
        "FORBIDDEN",
        "Choose available posts in this workspace.",
      );
    }
    for (const id of a.repositories) {
      const r = await ctx.db.get(id);
      ensure(
        r?.organizationId === a.organizationId &&
          r.enabled &&
          r.confirmed &&
          snapshotScopeCurrent(r),
        "CONTEXT_REQUIRED",
        "Confirm current selected project context.",
      );
    }
    const now = Date.now();
    const id = await ctx.db.insert("localLibraryRuns", {
      organizationId: a.organizationId,
      actor: actor._id,
      sources: a.sources,
      repositories: a.repositories,
      model: "gpt-6.1-sol",
      effort: "medium",
      expiresAt: now + 4 * 3600000,
      state: "active",
      jobs: 0,
      completed: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(4 * 3600000, internal.localLibrary.expire, {
      runId: id,
    });
    await audit(ctx, a.organizationId, actor._id, "local_library.approved", id);
    return id;
  },
});
export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const { actor } = await access(ctx, a.organizationId);
    if (!personalAllowed(actor.subject)) return [];
    const runs = await ctx.db
      .query("localLibraryRuns")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .order("desc")
      .take(10);
    return runs
      .filter((r) => r.actor === actor._id)
      .map((r) => ({
        ...r,
        sourceTaskResult: undefined,
        ...(r.task
          ? {
              task: {
                workload: r.task.workload,
                fundingRoute: r.task.fundingRoute,
                deadline: r.task.deadline,
                evaluationIds:
                  r.task.schemaVersion === "1.0.0" ? r.task.evaluationIds : [],
                proposalIds:
                  r.task.schemaVersion === "1.0.0" ? r.task.proposalIds : [],
              },
            }
          : {}),
        state:
          r.state === "active" && r.expiresAt <= Date.now()
            ? "expired"
            : r.state,
      }));
  },
});
export const cancel = mutation({
  args: runArgs,
  handler: async (ctx, a) => {
    const run = await activeRun(ctx, a.runId);
    await ctx.db.patch(run._id, { state: "canceled", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.localLibrary.cleanPending, {
      runId: run._id,
      cursor: null,
    });
  },
});
export const expire = internalMutation({
  args: runArgs,
  handler: async (ctx, a) => {
    const run = await ctx.db.get(a.runId);
    if (
      run &&
      run.expiresAt <= Date.now() &&
      ["active", "queued"].includes(run.state)
    ) {
      await ctx.db.patch(run._id, {
        state: "expired",
        updatedAt: Date.now(),
        ...(run.task
          ? {
              task: {
                ...run.task,
                leaseUntil: 0,
                leaseToken: undefined,
                ...(run.task.schemaVersion === "1.0.0"
                  ? { inspected: undefined, inspectionManifest: undefined }
                  : {}),
              },
            }
          : {}),
      });
      if (run.state === "queued") await releaseSourcePointer(ctx, run);
      if (
        run.state === "queued" &&
        run.task?.schemaVersion === "1.0.0" &&
        run.task.proposal
      ) {
        const p = await ctx.db.get(run.task.proposal.id);
        if (p?.localPlanRunId === run._id)
          await ctx.db.patch(p._id, { localPlanRunId: undefined });
      }
      await ctx.scheduler.runAfter(0, internal.localLibrary.cleanPending, {
        runId: run._id,
        cursor: null,
      });
    }
  },
});
export const cleanPending = internalMutation({
  args: { ...runArgs, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, a) => {
    const run = await ctx.db.get(a.runId);
    if (!run || (run.state === "active" && run.expiresAt > Date.now())) return;
    const page = await ctx.db
      .query("localSourceImports")
      .withIndex("by_run_source", (q) => q.eq("runId", a.runId))
      .paginate({ cursor: a.cursor, numItems: 20 });
    for (const j of page.page) {
      if (j.state !== "prepared") continue;
      for (const f of j.frames) {
        const asset = f.assetId ? await ctx.db.get(f.assetId) : null;
        if (
          asset?.organizationId === j.organizationId &&
          asset.sourceId === j.sourceId
        ) {
          await ctx.db.patch(asset._id, {
            state: "deleting",
            updatedAt: Date.now(),
          });
          await queueDeletion(ctx, asset.key);
        }
      }
      await ctx.db.patch(j._id, {
        state: "expired",
        transcript: { durationMs: 0, segments: [] },
        acquisition: undefined,
        frames: [],
        inputHash: "expired",
        updatedAt: Date.now(),
      });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.localLibrary.cleanPending, {
        ...a,
        cursor: page.continueCursor,
      });
  },
});
export const sourcePrepare = mutation({
  args: {
    ...runArgs,
    sourceId: v.id("sources"),
    generation: v.number(),
    revision: v.number(),
    inputHash: v.string(),
    transcript: v.any(),
    acquisition: v.optional(v.any()),
    frames: v.array(
      v.object({
        id: v.string(),
        timestampMs: v.number(),
        sha256: v.string(),
        size: v.number(),
      }),
    ),
  },
  handler: (ctx, a) => sourcePrepareCore(ctx, a),
});
export async function sourcePrepareCore(
  ctx: MutationCtx,
  a: {
    runId: Id<"localLibraryRuns">;
    sourceId: Id<"sources">;
    generation: number;
    revision: number;
    inputHash: string;
    transcript: any;
    acquisition?: any;
    frames: { id: string; timestampMs: number; sha256: string; size: number }[];
  },
  actorId?: Id<"users">,
) {
  const run = await activeRun(ctx, a.runId, actorId),
    s = await ctx.db.get(a.sourceId);
  ensure(
    s &&
      run.sources.includes(s._id) &&
      s.organizationId === run.organizationId &&
      s.state !== "deleted" &&
      s.rightsAttested &&
      !["queued", "processing"].includes(s.state) &&
      s.generation === a.generation &&
      s.updatedAt === a.revision &&
      (await sourceFingerprint(s)) === a.inputHash,
    "APPROVAL_STALE",
    "A saved post changed. Prepare its current evidence again.",
  );
  const acquisition =
    a.acquisition === undefined
      ? undefined
      : acquisitionManifest.parse(a.acquisition);
  if (acquisition) {
    ensure(
      s.url && ["acquired", "downloaded"].includes(acquisition.status),
      "INVALID_EVIDENCE",
      "Use metadata from the permitted source fetch.",
    );
    acquisitionPolicy(s.url);
  }
  const old = await ctx.db
    .query("localSourceImports")
    .withIndex("by_run_source", (q) =>
      q.eq("runId", run._id).eq("sourceId", s._id),
    )
    .unique();
  if (old) {
    ensure(
      old.inputHash === a.inputHash &&
        canonicalJson(old.acquisition ?? null) ===
          canonicalJson(acquisition ?? null),
      "APPROVAL_STALE",
      "Import input changed.",
    );
    return old._id;
  }
  const transcript = transcriptSchema.parse(a.transcript);
  ensure(
    a.frames.length <= 48 &&
      new Set(a.frames.map((f) => f.id)).size === a.frames.length &&
      a.frames.every(
        (f) =>
          /^[a-zA-Z0-9_.-]{1,100}$/.test(f.id) &&
          /^[a-f0-9]{64}$/.test(f.sha256) &&
          Number.isSafeInteger(f.timestampMs) &&
          f.timestampMs >= 0 &&
          f.timestampMs <= 600000 &&
          Number.isSafeInteger(f.size) &&
          f.size > 0 &&
          f.size <= 600000,
      ),
    "INVALID_EVIDENCE",
    "Use bounded decoded frame evidence.",
  );
  ensure(
    transcript.segments.length || a.frames.length,
    "INVALID_EVIDENCE",
    "No prepared speech or frames.",
  );
  ensure(
    !containsSecret(JSON.stringify(transcript)),
    "POLICY_BLOCKED",
    "Remove credentials from source evidence.",
  );
  ensure(run.jobs < 1000, "BUDGET_EXCEEDED", "This run reached its job limit.");
  await ctx.db.patch(run._id, { jobs: run.jobs + 1, updatedAt: Date.now() });
  return ctx.db.insert("localSourceImports", {
    organizationId: run.organizationId,
    runId: run._id,
    sourceId: s._id,
    generation: s.generation,
    revision: s.updatedAt,
    inputHash: a.inputHash,
    transcript,
    ...(acquisition ? { acquisition } : {}),
    frames: a.frames,
    coverage: a.frames.length
      ? transcript.segments.length
        ? "full_sampled"
        : "visual_only"
      : "audio_only",
    state: "prepared",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function sourceImport(
  ctx: QueryCtx,
  id: Id<"localSourceImports">,
  actorId?: Id<"users">,
) {
  const j = await ctx.db.get(id);
  ensure(j, "FORBIDDEN", "Import unavailable.");
  const run = await activeRun(ctx, j.runId, actorId),
    s = await ctx.db.get(j.sourceId);
  ensure(
    j.organizationId === run.organizationId &&
      run.sources.includes(j.sourceId) &&
      j.state === "prepared" &&
      s?.organizationId === run.organizationId &&
      s.state !== "deleted" &&
      s.rightsAttested &&
      !["queued", "processing"].includes(s.state) &&
      s.generation === j.generation &&
      s.updatedAt === j.revision &&
      (await sourceFingerprint(s)) === j.inputHash,
    "APPROVAL_STALE",
    "Import evidence changed.",
  );
  return { j, run, s };
}
export const frameContext = internalQuery({
  args: { id: v.id("localSourceImports"), frameId: v.string() },
  handler: (ctx, a) => frameContextCore(ctx, a),
});
export async function frameContextCore(
  ctx: QueryCtx,
  a: { id: Id<"localSourceImports">; frameId: string },
  actorId?: Id<"users">,
) {
  const c = await sourceImport(ctx, a.id, actorId);
  const frame = c.j.frames.find((f) => f.id === a.frameId);
  ensure(frame, "INVALID_EVIDENCE", "Frame was not approved.");
  return { ...c, frame };
}

export const recordFrame = internalMutation({
  args: {
    id: v.id("localSourceImports"),
    frameId: v.string(),
    assetId: v.id("assets"),
    sha256: v.string(),
  },
  handler: (ctx, a) => recordFrameCore(ctx, a),
});
export async function recordFrameCore(
  ctx: MutationCtx,
  a: {
    id: Id<"localSourceImports">;
    frameId: string;
    assetId: Id<"assets">;
    sha256: string;
  },
  actorId?: Id<"users">,
) {
  const { j } = await sourceImport(ctx, a.id, actorId);
  const frame = j.frames.find((f) => f.id === a.frameId),
    asset = await ctx.db.get(a.assetId);
  ensure(
    frame &&
      frame.sha256 === a.sha256 &&
      asset?.organizationId === j.organizationId &&
      asset.sourceId === j.sourceId &&
      asset.kind === "evidence" &&
      asset.state === "complete" &&
      asset.size === frame.size,
    "INVALID_EVIDENCE",
    "Frame receipt changed.",
  );
  if (frame.assetId) {
    ensure(
      frame.assetId === asset._id,
      "INVALID_EVIDENCE",
      "Frame already registered.",
    );
    return;
  }
  await ctx.db.patch(j._id, {
    frames: j.frames.map((f) =>
      f.id === a.frameId ? { ...f, assetId: asset._id } : f,
    ),
    updatedAt: Date.now(),
  });
}

export const sourceFinish = mutation({
  args: { id: v.id("localSourceImports"), output: v.any(), receipt: v.any() },
  handler: (ctx, a) => sourceFinishCore(ctx, a),
});
export async function sourceFinishCore(
  ctx: MutationCtx,
  a: { id: Id<"localSourceImports">; output: any; receipt: any },
  actorId?: Id<"users">,
) {
  const existing = await ctx.db.get(a.id);
  if (existing?.state === "ready") {
    await activeRun(ctx, existing.runId, actorId);
    ensure(
      existing.organizationId ===
        (await ctx.db.get(existing.runId))?.organizationId,
      "FORBIDDEN",
      "Import unavailable.",
    );
    const currentSource = await ctx.db.get(existing.sourceId);
    ensure(
      currentSource?.state === "ready" &&
        currentSource.updatedAt ===
          currentSource.localAnalysisReceipt?.completedAt &&
        currentSource.localAnalysisReceipt?.runId === existing.runId &&
        currentSource.localAnalysisReceipt?.outputHash ===
          a.receipt?.outputHash,
      "APPROVAL_STALE",
      "This imported result is no longer current.",
    );
    return { saved: true, cached: true };
  }
  const { j, run, s } = await sourceImport(ctx, a.id, actorId),
    output: any = presentAnalysis(insightOutput.parse(a.output) as any);
  ensure(
    output.sourceId === s._id &&
      output.processingRunId === `${s._id}:${s.generation}` &&
      output.coverage === j.coverage &&
      !containsSecret(JSON.stringify(output)) &&
      new Set(output.insights.map((i: any) => i.id)).size ===
        output.insights.length,
    "INVALID_EVIDENCE",
    "Analysis identity or coverage changed.",
  );
  ensure(
    a.receipt?.state === "completed" &&
      a.receipt.model === run.model &&
      a.receipt.effort === run.effort &&
      a.receipt.appCredits === 0 &&
      a.receipt.separateApiCall === false &&
      /^[a-f0-9]{64}$/.test(a.receipt.inputHash ?? "") &&
      a.receipt.outputHash === (await digest(canonicalJson(a.output))),
    "INVALID_EVIDENCE",
    "Use the completed own-plan client receipt.",
  );
  const timed = j.transcript.segments.map((x: any) => ({
    kind: "transcript",
    id: "segment-" + x.index,
    startMs: x.startMs,
    endMs: x.endMs,
  }));
  const permitted = [
    ...timed,
    ...j.frames.map((f) => ({
      kind: "frame",
      id: f.id,
      startMs: f.timestampMs,
      endMs: f.timestampMs,
    })),
    ...((j.acquisition?.description ?? s.acquisition?.description)
      ? [{ kind: "caption", id: "post_caption", startMs: null, endMs: null }]
      : []),
    ...(s.correctionAuthor
      ? [
          {
            kind: "user_note",
            id: "owner_corrected_text",
            startMs: null,
            endMs: null,
          },
        ]
      : []),
  ];
  const key = (e: any) => JSON.stringify([e.kind, e.id, e.startMs, e.endMs]);
  for (const i of output.insights)
    for (const e of i.evidence)
      ensure(
        permitted.some((p) => key(p) === key(e)),
        "INVALID_EVIDENCE",
        "Evidence was not supplied.",
      );
  for (const f of j.frames) {
    const asset = f.assetId ? await ctx.db.get(f.assetId) : null;
    ensure(
      asset?.organizationId === s.organizationId &&
        asset.sourceId === s._id &&
        asset.state === "complete" &&
        asset.kind === "evidence" &&
        asset.size === f.size,
      "INVALID_EVIDENCE",
      "Complete the private frame upload first.",
    );
  }
  const members = await ctx.db
    .query("knowledgeMembers")
    .withIndex("by_source", (q) => q.eq("sourceId", s._id))
    .collect();
  ensure(
    members
      .filter((m) => m.manual || m.excluded)
      .every((m) => output.insights.some((i: any) => i.id === m.insightId)),
    "APPROVAL_STALE",
    "Retain the insight IDs used by your manual organization corrections.",
  );
  const mapped = permitted.map((e) =>
    e.kind === "frame"
      ? { ...e, id: j.frames.find((f) => f.id === e.id)!.assetId! }
      : e,
  );
  for (const i of output.insights)
    i.evidence = i.evidence.map((e: any) =>
      e.kind === "frame"
        ? { ...e, id: j.frames.find((f) => f.id === e.id)!.assetId! }
        : e,
    );
  const now = Math.max(Date.now(), s.updatedAt + 1);
  await ctx.db.patch(s._id, {
    ...(j.acquisition
      ? { acquisition: importedAcquisition(j.acquisition, now) }
      : {}),
    state: "ready",
    analysis: output,
    summary: output.summary,
    coverage: j.coverage,
    mediaCoverage: j.coverage,
    mediaEvidence: s.correctionAuthor
      ? [...(s.mediaEvidence ?? []), ...mapped]
      : mapped,
    text: s.correctionAuthor
      ? s.text
      : j.transcript.segments.map((x: any) => x.text).join("\n"),
    originalText: s.originalText ?? s.text,
    originalMediaEvidence: s.originalMediaEvidence,
    error: undefined,
    processingReceipt: undefined,
    personalAnalysis: undefined,
    speechProvenance: j.transcript.segments.length
      ? {
          model: "Local offline transcription",
          language: "",
          uncertainty:
            "Automatic local speech recognition can contain errors. Check the cited segments and frames.",
        }
      : undefined,
    searchable: [
      s.title,
      output.summary,
      s.correctionAuthor
        ? s.text
        : j.transcript.segments.map((x: any) => x.text).join(" "),
      ...s.tags,
    ]
      .filter(Boolean)
      .join(" "),
    localAnalysisReceipt: {
      model: run.model,
      effort: run.effort,
      route: "local_subscription",
      runId: run._id,
      completedAt: now,
      inputHash: a.receipt.inputHash,
      outputHash: a.receipt.outputHash,
      frames: j.frames.length,
      appCredits: 0,
    },
    updatedAt: now,
  });
  await syncCategories(ctx, (await ctx.db.get(s._id))!, output);
  await syncKnowledge(ctx, (await ctx.db.get(s._id))!, { enqueue: false });
  await ctx.db.patch(j._id, {
    state: "ready",
    transcript: { durationMs: j.transcript.durationMs, segments: [] },
    acquisition: undefined,
    updatedAt: now,
  });
  await ctx.db.patch(run._id, {
    completed: run.completed + 1,
    updatedAt: now,
  });
  await audit(
    ctx,
    run.organizationId,
    run.actor,
    "local_library.source_imported",
    s._id,
  );
  return { saved: true, cached: false };
}

export const redactSource = internalMutation({
  args: { sourceId: v.id("sources"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.sourceId);
    if (source && source.state !== "deleted") return;
    const page = await ctx.db
      .query("localSourceImports")
      .withIndex("by_source", (q) => q.eq("sourceId", a.sourceId))
      .paginate({ cursor: a.cursor, numItems: 30 });
    for (const job of page.page)
      await ctx.db.patch(job._id, {
        transcript: { durationMs: 0, segments: [] },
        acquisition: undefined,
        frames: [],
        inputHash: "deleted",
        state: "deleted",
        updatedAt: Date.now(),
      });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.localLibrary.redactSource, {
        ...a,
        cursor: page.continueCursor,
      });
  },
});
export const summaryPrepare = mutation({
  args: {
    ...runArgs,
    topicId: v.id("knowledgeTopics"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const run = await activeRun(ctx, a.runId),
      topic = await ctx.db.get(a.topicId);
    ensure(
      topic?.organizationId === run.organizationId && !topic.redirect,
      "FORBIDDEN",
      "Topic unavailable.",
    );
    const page = await ctx.db
      .query("knowledgeMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", topic._id))
      .paginate({ cursor: a.cursor ?? null, numItems: limits.evidence });
    const evidence = (await memberEvidence(ctx, page.page)).filter((e) =>
      run.sources.includes(e.reference.sourceId),
    );
    const key = `knowledge:${topic._id}:${topic.version}:${await digest(a.cursor ?? "first")}`;
    const old = await ctx.db
      .query("knowledgeJobs")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (old) {
      ensure(
        old.state === "ready" ||
          (old.state === "local_prepared" && old.localRunId === run._id),
        "SOURCE_BUSY",
        "Reconcile the existing topic request first.",
      );
      ensure(
        await referencesCurrent(ctx, run.organizationId, old.references),
        "APPROVAL_STALE",
        "Topic evidence changed.",
      );
      return {
        id: old._id,
        cached: old.state === "ready",
        topic: topic.name,
        evidence,
        next: page.isDone ? null : page.continueCursor,
      };
    }
    ensure(
      run.jobs < 1000,
      "BUDGET_EXCEEDED",
      "This run reached its job limit.",
    );
    const now = Date.now();
    const id = await ctx.db.insert("knowledgeJobs", {
      organizationId: run.organizationId,
      topicId: topic._id,
      actor: run.actor,
      version: topic.version,
      policyVersion: 0,
      localRunId: run._id,
      cursor: a.cursor ?? null,
      next: page.isDone ? null : page.continueCursor,
      done: page.isDone,
      state: "local_prepared",
      key,
      references: evidence.map((e) => e.reference),
      processingVersion,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(run._id, { jobs: run.jobs + 1, updatedAt: now });
    return {
      id,
      cached: false,
      topic: topic.name,
      evidence,
      next: page.isDone ? null : page.continueCursor,
    };
  },
});
export const summaryFinish = mutation({
  args: { id: v.id("knowledgeJobs"), output: v.any() },
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    ensure(j?.localRunId, "FORBIDDEN", "Local summary unavailable.");
    const run = await activeRun(ctx, j.localRunId),
      t = await ctx.db.get(j.topicId);
    ensure(
      j.organizationId === run.organizationId &&
        j.actor === run.actor &&
        t?.version === j.version &&
        !t.redirect &&
        (await referencesCurrent(ctx, j.organizationId, j.references)),
      "APPROVAL_STALE",
      "Topic evidence changed.",
    );
    if (j.state === "ready") return { saved: true, cached: true };
    ensure(
      j.state === "local_prepared",
      "APPROVAL_STALE",
      "Summary attempt unavailable.",
    );
    const output = synthesis.parse(a.output);
    assertReferences([...output.claims, ...output.relations], j.references);
    ensure(
      !containsSecret(JSON.stringify(output)),
      "POLICY_BLOCKED",
      "Remove credentials.",
    );
    await ctx.db.patch(j._id, {
      state: "ready",
      output,
      credits: 0,
      model: "gpt-6.1-sol",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(t._id, {
      state: j.done ? "ready" : "updating",
      resumeCursor: j.next ?? undefined,
      updatedAt: Date.now(),
    });
    return { saved: true, cached: false };
  },
});
export const evaluationPrepare = mutation({
  args: {
    ...runArgs,
    topicId: v.id("knowledgeTopics"),
    repositoryId: v.id("repositories"),
    cursor: v.optional(v.string()),
    members: v.optional(v.array(v.id("knowledgeMembers"))),
  },
  handler: (ctx, a) => evaluationPrepareCore(ctx, a),
});
export async function evaluationPrepareCore(
  ctx: MutationCtx,
  a: {
    runId: Id<"localLibraryRuns">;
    topicId: Id<"knowledgeTopics">;
    repositoryId: Id<"repositories">;
    cursor?: string;
    members?: Id<"knowledgeMembers">[];
  },
  actorId?: Id<"users">,
) {
  const run = await activeRun(ctx, a.runId, actorId),
    topic = await ctx.db.get(a.topicId),
    repo = await repositoryContent(ctx, await ctx.db.get(a.repositoryId));
  if (run.task)
    ensure(
      run.task.workload === "project_evaluation" &&
        a.topicId === run.task.topicId &&
        !a.cursor &&
        JSON.stringify(a.members) === JSON.stringify(run.task.members),
      "APPROVAL_STALE",
      "Evaluate only the exact approved ideas.",
    );
  ensure(
    topic?.organizationId === run.organizationId &&
      !topic.redirect &&
      repo?.organizationId === run.organizationId &&
      run.repositories.includes(repo._id) &&
      repo.enabled &&
      repo.confirmed &&
      snapshotScopeCurrent(repo),
    "CONTEXT_REQUIRED",
    "Confirm the current selected project.",
  );
  ensure(
    !a.members ||
      (a.members.length > 0 &&
        a.members.length <= limits.evidence &&
        new Set(a.members).size === a.members.length &&
        !a.cursor),
    "INVALID_INPUT",
    "Choose at most twelve distinct included ideas.",
  );
  const selected = a.members
    ? await Promise.all(a.members.map((id) => ctx.db.get(id)))
    : undefined;
  ensure(
    !selected ||
      selected.every(
        (m) =>
          m &&
          m.organizationId === run.organizationId &&
          !m.excluded &&
          run.sources.includes(m.sourceId),
      ),
    "FORBIDDEN",
    "Choose included ideas in this private workspace.",
  );
  const page = selected
      ? {
          page: selected as Doc<"knowledgeMembers">[],
          isDone: true,
          continueCursor: "",
        }
      : await ctx.db
          .query("knowledgeMembers")
          .withIndex("by_topic", (q) => q.eq("topicId", topic._id))
          .paginate({ cursor: a.cursor ?? null, numItems: limits.evidence }),
    evidence = (await memberEvidence(ctx, page.page)).filter((e) =>
      run.sources.includes(e.reference.sourceId),
    );
  ensure(
    evidence.length,
    "CONTEXT_REQUIRED",
    "No included evidence in this batch.",
  );
  ensure(
    !selected || evidence.length === selected.length,
    "APPROVAL_STALE",
    "A chosen idea changed.",
  );
  ensure(
    new Set(
      evidence.map((e) => `${e.reference.sourceId}:${e.reference.insightId}`),
    ).size === evidence.length,
    "INVALID_INPUT",
    "Choose distinct ideas rather than repeated topic memberships.",
  );
  const topicBindings = [];
  for (const id of new Set(page.page.map((m) => m.topicId))) {
    const bound = await ctx.db.get(id);
    ensure(
      bound?.organizationId === run.organizationId && !bound.redirect,
      "APPROVAL_STALE",
      "A chosen topic changed.",
    );
    topicBindings.push({ id, version: bound.version });
  }
  ensure(
    topicBindings.some((b) => b.id === topic._id),
    "INVALID_INPUT",
    "Choose an anchor topic containing one of these ideas.",
  );
  const references = evidence.map((e) => e.reference),
    sourceSetHash = await digest(canonicalJson({ references, topicBindings })),
    preferences = await ctx.db
      .query("improvementPreferences")
      .withIndex("by_org", (q) => q.eq("organizationId", run.organizationId))
      .unique(),
    preferenceVersion = preferences?.version ?? 0,
    baseKey = `knowledge-evaluation:${processingVersion}:insight-first-project-context-v3:${topic._id}:${topic.version}:${repo._id}:${repo.sha}:${repo.profileVersion}:${repo.selectionVersion ?? 0}:${sourceSetHash}:${preferenceVersion}`,
    origin = run.task?.privateEvaluationOrigin,
    key = origin
      ? `${baseKey}:private-brief-v1:${await digest(canonicalJson(origin))}`
      : baseKey;
  const previous = await ctx.db
    .query("knowledgeEvaluations")
    .withIndex("by_topic_repo", (q) =>
      q.eq("topicId", topic._id).eq("repositoryId", repo._id),
    )
    .order("desc")
    .take(20);
  const reviewHistory = [];
  for (const old of previous) {
    if (
      old.state === "ready" &&
      old.output &&
      samePrivateEvaluationOrigin(old.privateEvaluationOrigin, origin) &&
      (!origin || old.actor === origin.ownerId) &&
      ["rejected", "deferred"].includes(old.decision) &&
      (await referencesCurrent(ctx, run.organizationId, old.references))
    )
      reviewHistory.push({
        decision: old.decision,
        disposition: old.output.disposition,
        rationale: old.output.rationale,
        problem: old.output.problem,
        baseSha: old.baseSha,
      });
    if (reviewHistory.length === 10) break;
  }
  const old = await ctx.db
    .query("knowledgeEvaluations")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (old) {
    ensure(
      samePrivateEvaluationOrigin(old.privateEvaluationOrigin, origin) &&
        (!origin || old.actor === run.actor),
      "APPROVAL_STALE",
      "The cached evaluation has different private context.",
    );
    ensure(
      old.state === "ready" ||
        (old.state === "local_prepared" && old.localRunId === run._id),
      "SOURCE_BUSY",
      "Reconcile the existing evaluation first.",
    );
    return {
      id: old._id,
      cached: old.state === "ready",
      evidence,
      repo,
      preference: preferences?.note ?? "",
      reviewHistory,
      ...(origin
        ? {
            privateEvaluationOrigin: origin,
            privateEvaluationBrief: run.task!.privateEvaluationBrief,
          }
        : {}),
      next: page.isDone ? null : page.continueCursor,
    };
  }
  ensure(run.jobs < 1000, "BUDGET_EXCEEDED", "This run reached its job limit.");
  const now = Date.now();
  const id = await ctx.db.insert("knowledgeEvaluations", {
    organizationId: run.organizationId,
    topicId: topic._id,
    repositoryId: repo._id,
    actor: run.actor,
    topicVersion: topic.version,
    baseSha: repo.sha,
    profileVersion: repo.profileVersion,
    selectionVersion: repo.selectionVersion ?? 0,
    references,
    sourceSetHash,
    preferenceVersion,
    localRunId: run._id,
    ...(origin ? { privateEvaluationOrigin: origin } : {}),
    topicBindings,
    key,
    state: "local_prepared",
    decision: "new",
    covered: evidence.length,
    omitted: !!a.members || !page.isDone || !!a.cursor,
    processingVersion,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(run._id, { jobs: run.jobs + 1, updatedAt: now });
  return {
    id,
    cached: false,
    evidence,
    repo,
    preference: preferences?.note ?? "",
    reviewHistory,
    ...(origin
      ? {
          privateEvaluationOrigin: origin,
          privateEvaluationBrief: run.task!.privateEvaluationBrief,
        }
      : {}),
    next: page.isDone ? null : page.continueCursor,
  };
}

export const recordInspection = internalMutation({
  args: { id: v.id("knowledgeEvaluations"), inspected: v.any() },
  handler: (ctx, a) => recordInspectionCore(ctx, a),
});
export async function recordInspectionCore(
  ctx: MutationCtx,
  a: { id: Id<"knowledgeEvaluations">; inspected: any },
  actorId?: Id<"users">,
) {
  const e = await ctx.db.get(a.id);
  ensure(e?.localRunId, "FORBIDDEN", "Local evaluation unavailable.");
  await activeRun(ctx, e.localRunId, actorId);
  ensure(
    e.state === "local_prepared" && (await evaluationCurrent(ctx, e)),
    "APPROVAL_STALE",
    "Project or evidence changed.",
  );
  await ctx.db.patch(e._id, {
    inspected: a.inspected,
    updatedAt: Date.now(),
  });
}

export const evaluationFinish = mutation({
  args: { id: v.id("knowledgeEvaluations"), output: v.any() },
  handler: (ctx, a) => evaluationFinishCore(ctx, a),
});
export async function evaluationFinishCore(
  ctx: MutationCtx,
  a: { id: Id<"knowledgeEvaluations">; output: any },
  actorId?: Id<"users">,
) {
  const e = await ctx.db.get(a.id);
  ensure(e?.localRunId, "FORBIDDEN", "Local evaluation unavailable.");
  const run = await activeRun(ctx, e.localRunId, actorId);
  ensure(
    e.organizationId === run.organizationId &&
      e.actor === run.actor &&
      samePrivateEvaluationOrigin(
        e.privateEvaluationOrigin,
        run.task?.schemaVersion === "1.0.0"
          ? run.task.privateEvaluationOrigin
          : undefined,
      ) &&
      run.repositories.includes(e.repositoryId) &&
      (await evaluationCurrent(ctx, e)),
    "APPROVAL_STALE",
    "Project or source evidence changed.",
  );
  if (e.state === "ready") return { saved: true, cached: true };
  ensure(
    e.state === "local_prepared" && e.inspected,
    "CONTEXT_REQUIRED",
    "Prepare repository evidence first.",
  );
  const output = evaluation.parse(a.output);
  assertReferences([output], e.references);
  ensure(
    !containsSecret(JSON.stringify(output)),
    "POLICY_BLOCKED",
    "Remove credentials.",
  );
  for (const ref of output.repositoryEvidence)
    ensure(
      e.inspected.some(
        (p: any) =>
          p.path === ref.path &&
          p.startLine <= ref.startLine &&
          p.endLine >= ref.endLine,
      ),
      "INVALID_EVIDENCE",
      "Repository citation is outside inspected evidence.",
    );
  await ctx.db.patch(e._id, {
    state: "ready",
    output,
    credits: 0,
    model: run.model,
    updatedAt: Date.now(),
  });
  return { saved: true, cached: false };
}
