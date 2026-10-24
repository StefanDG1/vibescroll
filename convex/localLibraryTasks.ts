import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import { access, recentAuthentication, limit, audit } from "./lib";
import { ensure } from "../packages/policy";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { digest } from "./product";
import { referencesCurrent, memberEvidence } from "./knowledge";
import { improvementCurrent } from "./lib/improvementContext";
import { taskDevice } from "./lib/localTaskAuthority";
import { snapshotScopeCurrent } from "../packages/repositories/scope";
import type { PrivateEvaluationOrigin } from "../packages/contracts/private-evaluation-context";
import { validatePrivateEvaluationBrief } from "./lib/privateEvaluationContext";

export const resume = query({
  args: {
    organizationId: v.id("organizations"),
    sourceId: v.optional(v.id("sources")),
    proposalId: v.optional(v.id("proposals")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    const { actor } = await access(ctx, a.organizationId);
    ensure(
      Boolean(a.sourceId) !== Boolean(a.proposalId),
      "INVALID_INPUT",
      "Choose one source evaluation or proposal plan history.",
    );
    const page = await ctx.db
      .query("localLibraryRuns")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .order("desc")
      .paginate({ cursor: a.cursor, numItems: 20 });
    return {
      items: page.page
        .filter(
          (run) =>
            run.actor === actor._id &&
            run.task &&
            (a.proposalId
              ? run.task.proposal?.id === a.proposalId
              : run.task.workload === "project_evaluation" &&
                run.sources.includes(a.sourceId!)),
        )
        .map((run) => ({
          id: run._id,
          state:
            run.expiresAt <= Date.now() &&
            ["queued", "active"].includes(run.state)
              ? "expired"
              : run.state,
          workload: run.task!.workload,
          model: run.model,
          effort: run.effort,
          deadline: run.task!.deadline,
          proposalIds: run.task!.proposalIds,
          evaluationIds: run.task!.evaluationIds,
          ...(run.task!.privateEvaluationOrigin
            ? { privateEvaluationOrigin: run.task!.privateEvaluationOrigin }
            : {}),
          maxInferenceCredits: 0,
        })),
      next: page.isDone ? null : page.continueCursor,
    };
  },
});

export const localTaskArgs = {
  organizationId: v.id("organizations"),
  workload: v.union(v.literal("project_evaluation"), v.literal("plan_draft")),
  deviceId: v.id("devices"),
  model: v.string(),
  effort: v.string(),
  key: v.string(),
  sourceId: v.optional(v.id("sources")),
  repositoryIds: v.optional(v.array(v.id("repositories"))),
  members: v.optional(v.array(v.id("knowledgeMembers"))),
  proposalId: v.optional(v.id("proposals")),
  proposalVersion: v.optional(v.number()),
  privateEvaluationBrief: v.optional(v.string()),
};
type Selection = {
  organizationId: Id<"organizations">;
  workload: "project_evaluation" | "plan_draft";
  deviceId: Id<"devices">;
  model: string;
  effort: string;
  key: string;
  sourceId?: Id<"sources">;
  repositoryIds?: Id<"repositories">[];
  members?: Id<"knowledgeMembers">[];
  proposalId?: Id<"proposals">;
  proposalVersion?: number;
  privateEvaluationBrief?: string;
};

export async function localTaskQuote(
  ctx: QueryCtx,
  a: Selection,
  expiresAt: number,
) {
  ensure(
    !a.members ||
      (a.members.length > 0 &&
        a.members.length <= 12 &&
        new Set(a.members).size === a.members.length),
    "INVALID_INPUT",
    "Choose up to twelve distinct ideas.",
  );
  const { actor, organization } = await access(ctx, a.organizationId, [
    "owner",
    "admin",
    "member",
  ]);
  let privateEvaluationOrigin: PrivateEvaluationOrigin | undefined;
  if (a.privateEvaluationBrief !== undefined) {
    ensure(
      a.workload === "project_evaluation" &&
        organization.privateOwnerId === actor._id,
      "FORBIDDEN",
      "Private evaluation briefs require your own private library and a source evaluation.",
    );
    validatePrivateEvaluationBrief(a.privateEvaluationBrief);
    privateEvaluationOrigin = {
      schemaVersion: "1.0.0",
      kind: "private_evaluation_brief",
      ownerId: actor._id,
      briefHash: await digest(a.privateEvaluationBrief),
      model: a.model,
      effort: a.effort,
    };
  }
  await recentAuthentication(ctx);
  ensure(
    /^[a-zA-Z0-9_-]{12,80}$/.test(a.key) &&
      Number.isSafeInteger(expiresAt) &&
      expiresAt > Date.now() &&
      expiresAt <= Date.now() + 300000,
    "QUOTE_CHANGED",
    "Review a current bounded own-subscription quote.",
  );
  const device = await taskDevice(
    ctx,
    a.organizationId,
    actor._id,
    a.deviceId,
    a.model,
    a.effort,
  );
  let sourceIds: Id<"sources">[],
    repositoryIds: Id<"repositories">[],
    members: Id<"knowledgeMembers">[] = [],
    topicId: Id<"knowledgeTopics"> | undefined;
  let proposal: { id: Id<"proposals">; version: number } | undefined;
  if (a.workload === "project_evaluation") {
    ensure(
      a.sourceId &&
        !a.proposalId &&
        a.repositoryIds &&
        a.repositoryIds.length > 0 &&
        a.repositoryIds.length <= 5 &&
        new Set(a.repositoryIds).size === a.repositoryIds.length,
      "INVALID_INPUT",
      "Choose one source and up to five distinct selected repositories.",
    );
    sourceIds = [a.sourceId!];
    repositoryIds = [...a.repositoryIds!].sort();
    const rows = a.members
      ? await Promise.all(a.members.map((id) => ctx.db.get(id)))
      : await ctx.db
          .query("knowledgeMembers")
          .withIndex("by_source", (q) => q.eq("sourceId", a.sourceId!))
          .take(101);
    const chosen = new Map<string, Doc<"knowledgeMembers">>();
    for (const m of rows) {
      if (a.members)
        ensure(
          m &&
            m.organizationId === a.organizationId &&
            m.sourceId === a.sourceId &&
            !m.excluded &&
            !m.retainedHistory,
          "FORBIDDEN",
          "Choose current included ideas from this source.",
        );
      if (
        m &&
        m.organizationId === a.organizationId &&
        m.sourceId === a.sourceId &&
        !m.excluded &&
        !m.retainedHistory &&
        !chosen.has(m.insightId)
      )
        chosen.set(m.insightId, m);
      if (!a.members && chosen.size === 12) break;
    }
    const selected = [...chosen.values()].sort((x, y) =>
      x._id.localeCompare(y._id),
    );
    const evidence = await memberEvidence(ctx, selected);
    ensure(
      selected.length > 0 && evidence.length === selected.length,
      "APPROVAL_STALE",
      "Refresh current cited ideas before evaluating a project.",
    );
    members = selected.map((m) => m._id);
    topicId = selected[0].topicId;
  } else {
    const p = a.proposalId ? await ctx.db.get(a.proposalId) : null;
    ensure(
      p?.organizationId === a.organizationId &&
        p.version === a.proposalVersion &&
        p.review === "accepted" &&
        (await improvementCurrent(ctx, p)),
      "APPROVAL_STALE",
      "Accept and review the current proposal first.",
    );
    ensure(
      !a.sourceId && !a.repositoryIds && !a.members,
      "INVALID_INPUT",
      "Plan only the selected accepted proposal.",
    );
    sourceIds = [
      ...new Set([
        p!.sourceId,
        ...(p!.references ?? []).map((r) => r.sourceId),
      ]),
    ];
    repositoryIds = [p!.repositoryId];
    const repository = await ctx.db.get(p!.repositoryId);
    ensure(
      repository?.organizationId === a.organizationId &&
        repository.sha === p!.baseSha &&
        repository.profileVersion === p!.profileVersion,
      "APPROVAL_STALE",
      "Refresh and accept a proposal for this exact repository base and profile.",
    );
    proposal = { id: p!._id, version: p!.version };
  }
  ensure(
    sourceIds.length > 0 && sourceIds.length <= 12,
    "INVALID_INPUT",
    "Use a bounded source set.",
  );
  const sourceBindings = [];
  for (const id of sourceIds.sort()) {
    const s = await ctx.db.get(id);
    const refs = (s?.analysis?.insights ?? []).slice(0, 20).map((i: any) => ({
      sourceId: id,
      generation: s!.generation,
      revision: s!.updatedAt,
      insightId: i.id,
    }));
    ensure(
      s?.organizationId === a.organizationId &&
        s.state === "ready" &&
        s.rightsAttested &&
        refs.length &&
        (await referencesCurrent(ctx, a.organizationId, refs)),
      "APPROVAL_STALE",
      "Use current retained source evidence in this workspace.",
    );
    sourceBindings.push({
      sourceId: id,
      generation: s!.generation,
      revision: s!.updatedAt,
      analysisHash: await digest(canonicalJson(s!.analysis)),
    });
  }
  const repositoryBindings = [];
  for (const id of repositoryIds) {
    const r = await ctx.db.get(id);
    ensure(
      r?.organizationId === a.organizationId &&
        r.enabled &&
        r.confirmed &&
        snapshotScopeCurrent(r),
      "CONTEXT_REQUIRED",
      "Confirm the current selected repository context.",
    );
    repositoryBindings.push({
      repositoryId: id,
      baseSha: r!.sha,
      profileVersion: r!.profileVersion,
      selectionVersion: r!.selectionVersion ?? 0,
    });
  }
  const topicBindings: { id: Id<"knowledgeTopics">; version: number }[] = [];
  for (const id of members) {
    const m = await ctx.db.get(id),
      topic = m ? await ctx.db.get(m.topicId) : null;
    ensure(
      topic?.organizationId === a.organizationId && !topic.redirect,
      "APPROVAL_STALE",
      "A selected topic changed.",
    );
    if (!topicBindings.some((b) => b.id === topic!._id))
      topicBindings.push({ id: topic!._id, version: topic!.version });
  }
  topicBindings.sort((x, y) => x.id.localeCompare(y.id));
  const preference = await ctx.db
    .query("improvementPreferences")
    .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
    .unique();
  if (proposal) {
    const selected = (await ctx.db.get(proposal.id))!;
    privateEvaluationOrigin = selected.privateEvaluationOrigin;
    ensure(
      !privateEvaluationOrigin ||
        (organization.privateOwnerId === actor._id &&
          privateEvaluationOrigin.ownerId === actor._id),
      "FORBIDDEN",
      "This private proposal belongs to its original private library owner.",
    );
  }
  const payload = {
    schemaVersion: "1.0.0" as const,
    workload: a.workload,
    fundingRoute: "chatgpt_subscription" as const,
    maxInferenceCredits: 0 as const,
    organizationId: a.organizationId,
    actor: actor._id,
    deviceId: device._id,
    profileBinding: device.subscriptionCapabilities!.profileBinding,
    capabilityHash: device.subscriptionCapabilities!.hash,
    model: a.model,
    effort: a.effort,
    key: `${actor._id}:${a.key}`,
    sourceBindings,
    repositoryBindings,
    members,
    topicBindings,
    preferenceVersion: preference?.version ?? 0,
    ...(topicId ? { topicId } : {}),
    ...(proposal ? { proposal } : {}),
    ...(a.privateEvaluationBrief !== undefined
      ? { privateEvaluationBrief: a.privateEvaluationBrief }
      : {}),
    ...(privateEvaluationOrigin ? { privateEvaluationOrigin } : {}),
    quoteExpiresAt: expiresAt,
  };
  return { payload, hash: await digest(canonicalJson(payload)) };
}

export const capabilities = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const { actor } = await access(ctx, a.organizationId);
    const rows = await ctx.db
      .query("devices")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .take(30);
    return rows
      .filter((d) => d.owner === actor._id && d.state === "paired")
      .map((d) => ({
        id: d._id,
        name: d.name,
        catalogue:
          d.subscriptionCapabilities &&
          d.subscriptionCapabilities.expiresAt > Date.now()
            ? d.subscriptionCapabilities.value
            : null,
        profileBinding: d.subscriptionCapabilities?.profileBinding,
        expiresAt: d.subscriptionCapabilities?.expiresAt ?? 0,
        access: "advertised_not_verified" as const,
      }));
  },
});
export const quote = query({
  args: localTaskArgs,
  handler: async (ctx, a) => {
    const expiresAt = Date.now() + 300000,
      q = await localTaskQuote(ctx, a, expiresAt);
    return {
      ...q,
      expiresAt,
      maxInferenceCredits: 0,
      separatePreparationAuthorized: false,
      codingAuthorized: false,
      publicationAuthorized: false,
    };
  },
});
export const approve = mutation({
  args: {
    ...localTaskArgs,
    quoteHash: v.string(),
    quoteExpiresAt: v.number(),
    useOwnPlan: v.literal(true),
    maxInferenceCredits: v.literal(0),
  },
  handler: async (ctx, a) => {
    const q = await localTaskQuote(ctx, a, a.quoteExpiresAt);
    ensure(
      q.hash === a.quoteHash,
      "APPROVAL_STALE",
      "Source, repository, model or permission changed after the quote.",
    );
    const p = q.payload;
    const old = await ctx.db
      .query("localLibraryRuns")
      .withIndex("by_task_key", (x) =>
        x.eq("organizationId", a.organizationId).eq("task.key", p.key),
      )
      .unique();
    if (old) {
      ensure(
        old.task?.approvalHash === q.hash,
        "APPROVAL_STALE",
        "Use a new explicit approval for changed work.",
      );
      return { runId: old._id, cached: true };
    }
    await limit(ctx, `own-task:${p.actor}`, 10);
    if (p.proposal) {
      const proposal = (await ctx.db.get(p.proposal.id))!;
      ensure(
        !proposal.planDraftKey && !proposal.localPlanRunId,
        "SOURCE_BUSY",
        "Reconcile the existing plan work before requesting another draft.",
      );
      if (
        proposal.planDraft &&
        proposal.planDraftVersion === proposal.version
      ) {
        const recent = await ctx.db
          .query("localLibraryRuns")
          .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
          .order("desc")
          .take(20);
        const expected = canonicalJson({
          actor: p.actor,
          deviceId: p.deviceId,
          profileBinding: p.profileBinding,
          capabilityHash: p.capabilityHash,
          model: p.model,
          effort: p.effort,
          sourceBindings: p.sourceBindings,
          repositoryBindings: p.repositoryBindings,
          proposal: p.proposal,
          preferenceVersion: p.preferenceVersion,
          ...(p.privateEvaluationOrigin
            ? { privateEvaluationOrigin: p.privateEvaluationOrigin }
            : {}),
        });
        const existing = recent.find(
          (run) =>
            run.state === "completed" &&
            run.task?.workload === "plan_draft" &&
            canonicalJson({
              actor: run.actor,
              deviceId: run.task.deviceId,
              profileBinding: run.task.profileBinding,
              capabilityHash: run.task.capabilityHash,
              model: run.model,
              effort: run.effort,
              sourceBindings: run.task.sourceBindings,
              repositoryBindings: run.task.repositoryBindings,
              proposal: run.task.proposal,
              preferenceVersion: run.task.preferenceVersion,
              ...(run.task.privateEvaluationOrigin
                ? { privateEvaluationOrigin: run.task.privateEvaluationOrigin }
                : {}),
            }) === expected,
        );
        ensure(
          existing,
          "PLAN_DRAFT_EXISTS",
          "The current editable plan is already available. Open and review it before requesting different work.",
        );
        return { runId: existing!._id, cached: true };
      }
    }
    const now = Date.now(),
      deadline = now + 1800000;
    const {
      organizationId: _org,
      actor: _actor,
      model: _model,
      effort: _effort,
      quoteExpiresAt: _quoteExpiry,
      ...binding
    } = p;
    const runId = await ctx.db.insert("localLibraryRuns", {
      organizationId: a.organizationId,
      actor: p.actor,
      sources: p.sourceBindings.map((b) => b.sourceId),
      repositories: p.repositoryBindings.map((b) => b.repositoryId),
      model: a.model,
      effort: a.effort,
      expiresAt: deadline,
      state: "queued",
      jobs: 0,
      completed: 0,
      createdAt: now,
      updatedAt: now,
      task: {
        ...binding,
        approvalHash: q.hash,
        approvedAt: now,
        deadline,
        leaseGeneration: 0,
        leaseUntil: 0,
        evaluationIds: [],
        proposalIds: [],
      },
    });
    if (p.proposal)
      await ctx.db.patch(p.proposal.id, { localPlanRunId: runId });
    await ctx.scheduler.runAfter(1800000, internal.localLibrary.expire, {
      runId,
    });
    await audit(ctx, a.organizationId, p.actor, "own_task.approved", runId);
    return { runId, cached: false };
  },
});
export const status = query({
  args: { runId: v.id("localLibraryRuns") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.runId);
    ensure(r?.task, "FORBIDDEN", "Task unavailable.");
    const { actor } = await access(ctx, r!.organizationId);
    ensure(
      r!.actor === actor._id,
      "FORBIDDEN",
      "This task belongs to another actor.",
    );
    return {
      id: r!._id,
      state:
        r!.expiresAt <= Date.now() && ["queued", "active"].includes(r!.state)
          ? "expired"
          : r!.state,
      workload: r!.task!.workload,
      model: r!.model,
      effort: r!.effort,
      deadline: r!.task!.deadline,
      evaluationIds: r!.task!.evaluationIds,
      ...(r!.task!.privateEvaluationOrigin
        ? { privateEvaluationOrigin: r!.task!.privateEvaluationOrigin }
        : {}),
      proposalIds: r!.task!.proposalIds,
      maxInferenceCredits: 0,
    };
  },
});
export const cancel = mutation({
  args: { runId: v.id("localLibraryRuns") },
  handler: async (ctx, a) => {
    const run = await ctx.db.get(a.runId);
    ensure(run?.task, "FORBIDDEN", "Task unavailable.");
    const { actor } = await access(ctx, run!.organizationId);
    await recentAuthentication(ctx);
    ensure(run!.actor === actor._id, "FORBIDDEN", "Cancel only your own task.");
    if (!["queued", "active"].includes(run!.state)) return { canceled: false };
    await ctx.db.patch(run!._id, {
      state: "canceled",
      updatedAt: Date.now(),
      task: {
        ...run!.task!,
        leaseGeneration: run!.task!.leaseGeneration + 1,
        leaseToken: undefined,
        leaseUntil: 0,
        inspected: undefined,
        inspectionManifest: undefined,
      },
    });
    if (run!.state === "queued" && run!.task!.proposal) {
      const p = await ctx.db.get(run!.task!.proposal.id);
      if (p?.localPlanRunId === run!._id)
        await ctx.db.patch(p._id, { localPlanRunId: undefined });
    }
    return {
      canceled: true,
      dispatched: run!.state === "active",
      usage: run!.state === "active" ? "unknown" : "not_dispatched",
    };
  },
});
export const reconcile = mutation({
  args: {
    runId: v.id("localLibraryRuns"),
    acknowledgeUnknownUsage: v.literal(true),
  },
  handler: async (ctx, a) => {
    const run = await ctx.db.get(a.runId);
    ensure(run?.task, "FORBIDDEN", "Task unavailable.");
    const { actor } = await access(ctx, run!.organizationId);
    await recentAuthentication(ctx);
    ensure(
      run!.actor === actor._id &&
        ["unknown", "canceled", "expired"].includes(run!.state) &&
        run!.task!.deadline <= Date.now(),
      "APPROVAL_STALE",
      "Wait for the original task deadline and review its uncertain usage before granting new work.",
    );
    if (run!.task!.proposal) {
      const p = await ctx.db.get(run!.task!.proposal.id);
      if (p?.localPlanRunId === run!._id)
        await ctx.db.patch(p._id, { localPlanRunId: undefined });
    }
    await ctx.db.patch(run!._id, {
      state: "reviewed_unknown",
      updatedAt: Date.now(),
      task: {
        ...run!.task!,
        leaseUntil: 0,
        leaseToken: undefined,
        inspected: undefined,
        inspectionManifest: undefined,
      },
    });
    return {
      reconciled: true,
      usage: "unknown_retained",
      grantsExecution: false,
    };
  },
});
