import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensure } from "../../packages/policy";
import {
  safeModel,
  safeEffort,
} from "../../packages/runner/subscription-capabilities.mjs";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { digest } from "../product";
import { personalAllowed } from "./personalAccess";
import { workspaceReadable } from "./workspacePrivacy";
import { referencesCurrent } from "../knowledge";
import { snapshotScopeCurrent } from "../../packages/repositories/scope";
import { improvementCurrent } from "./improvementContext";
import { privateEvaluationTaskCurrent } from "./privateEvaluationContext";
import { sourceTaskCurrent, runtimeCurrent } from "./privateSourceAnalysis";

export async function capabilitySnapshot(
  ctx: MutationCtx,
  device: Doc<"devices">,
  value: any,
  profileBinding: string,
  sessionExpiresAt: number,
) {
  ensure(
    value?.schemaVersion === "1.0.0" &&
      value.catalogueSource === "official_app_server" &&
      value.access === "advertised_not_verified" &&
      Array.isArray(value.models) &&
      value.models.length > 0 &&
      value.models.length <= 50 &&
      new Set(value.models.map((m: any) => m.slug)).size ===
        value.models.length &&
      value.models.every(
        (m: any) =>
          safeModel(m.slug) &&
          typeof m.displayName === "string" &&
          m.displayName.length > 0 &&
          m.displayName.length <= 120 &&
          Array.isArray(m.reasoningEfforts) &&
          m.reasoningEfforts.length > 0 &&
          m.reasoningEfforts.length <= 32 &&
          m.reasoningEfforts.every(safeEffort) &&
          (m.defaultReasoningEffort === null ||
            m.reasoningEfforts.includes(m.defaultReasoningEffort)) &&
          Array.isArray(m.inputModalities) &&
          m.inputModalities.length >= 1 &&
          m.inputModalities.length <= 2 &&
          m.inputModalities.includes("text") &&
          m.inputModalities.every((x: string) =>
            ["text", "image"].includes(x),
          ) &&
          ["advertised", "protocol_default"].includes(m.modalitySource),
      ) &&
      canonicalJson(value.localLimits) ===
        canonicalJson({
          maxInputTextBytes: 1000000,
          maxInlineFrames: 48,
          maxFrameBytes: 1000000,
          maxAggregateFrameBytes: 12000000,
          maxOutputBytes: 120000,
        }) &&
      /^[a-f0-9]{64}$/.test(profileBinding) &&
      Number.isSafeInteger(sessionExpiresAt) &&
      sessionExpiresAt > Date.now() &&
      sessionExpiresAt <= Date.now() + 4 * 3600000,
    "INVALID_INPUT",
    "Announce a bounded current official-client catalogue.",
  );
  const hash = await digest(canonicalJson(value));
  const old = device.subscriptionCapabilities;
  const snapshot = {
    value,
    hash,
    profileBinding,
    sessionExpiresAt,
    expiresAt: Math.min(sessionExpiresAt, Date.now() + 300000),
    revision:
      old && old.hash === hash && old.profileBinding === profileBinding
        ? old.revision
        : (old?.revision ?? 0) + 1,
  };
  await ctx.db.patch(device._id, { subscriptionCapabilities: snapshot });
  return snapshot;
}

export async function taskDevice(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  actorId: Id<"users">,
  deviceId: Id<"devices">,
  model: string,
  effort: string,
) {
  const [device, actor, organization] = await Promise.all([
    ctx.db.get(deviceId),
    ctx.db.get(actorId),
    ctx.db.get(organizationId),
  ]);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", organizationId).eq("userId", actorId),
    )
    .unique();
  const caps = device?.subscriptionCapabilities;
  ensure(
    process.env.RESTORE_LOCK !== "true" &&
      process.env.DISABLE_INFERENCE !== "true" &&
      actor?.status === "active" &&
      personalAllowed(actor.subject) &&
      workspaceReadable(organization, actorId) &&
      membership &&
      ["owner", "admin", "member"].includes(membership.role) &&
      device?.state === "paired" &&
      device.owner === actorId &&
      device.organizationId === organizationId &&
      caps &&
      caps.expiresAt > Date.now() &&
      caps.sessionExpiresAt > Date.now() &&
      safeModel(model) &&
      safeEffort(effort) &&
      caps.value.models.some(
        (m) =>
          m.slug === model &&
          m.reasoningEfforts.includes(effort) &&
          m.inputModalities.includes("text"),
      ),
    "APPROVAL_STALE",
    "Reconnect your own eligible account and selected model before this task.",
  );
  return device!;
}

export async function taskBindingsCurrent(
  ctx: QueryCtx,
  run: Doc<"localLibraryRuns">,
  actorId = run.actor,
  requireLease = true,
) {
  const t = run.task;
  if (t?.schemaVersion === "2.0.0") {
    ensure(
      run.actor === actorId &&
        ["queued", "active"].includes(run.state) &&
        run.expiresAt > Date.now() &&
        t.deadline > Date.now(),
      "APPROVAL_STALE",
      "This private source task expired or needs review.",
    );
    const device = await taskDevice(
      ctx,
      run.organizationId,
      actorId,
      t.deviceId,
      run.model,
      run.effort,
    );
    ensure(
      device.subscriptionCapabilities!.hash === t.capabilityHash &&
        device.subscriptionCapabilities!.profileBinding === t.profileBinding &&
        runtimeCurrent(device, t.localRuntimeHash) &&
        (!requireLease ||
          (run.state === "active" && t.leaseUntil > Date.now())),
      "APPROVAL_STALE",
      "The approved account, runtime or lease changed.",
    );
    await sourceTaskCurrent(ctx, run);
    return t;
  }
  ensure(
    t && t.members.length <= 12 && new Set(t.members).size === t.members.length,
    "APPROVAL_STALE",
    "Use the bounded distinct approved idea selection.",
  );
  ensure(
    t &&
      t.schemaVersion === "1.0.0" &&
      run.actor === actorId &&
      ["queued", "active"].includes(run.state) &&
      run.expiresAt > Date.now() &&
      t.deadline > Date.now() &&
      t.sourceBindings.length > 0 &&
      t.sourceBindings.length <= 12 &&
      t.repositoryBindings.length > 0 &&
      t.repositoryBindings.length <= 5,
    "APPROVAL_STALE",
    "This task expired, was canceled or needs a new approval.",
  );
  const device = await taskDevice(
    ctx,
    run.organizationId,
    actorId,
    t!.deviceId,
    run.model,
    run.effort,
  );
  ensure(
    await privateEvaluationTaskCurrent(ctx, run),
    "APPROVAL_STALE",
    "The approved private evaluation context changed.",
  );
  ensure(
    device.subscriptionCapabilities!.hash === t!.capabilityHash &&
      device.subscriptionCapabilities!.profileBinding === t!.profileBinding &&
      (!requireLease || (run.state === "active" && t!.leaseUntil > Date.now())),
    "APPROVAL_STALE",
    "The account, catalogue or task lease changed.",
  );
  for (const b of t!.sourceBindings) {
    const s = await ctx.db.get(b.sourceId);
    ensure(
      s?.organizationId === run.organizationId &&
        s.state === "ready" &&
        s.rightsAttested &&
        s.generation === b.generation &&
        s.updatedAt === b.revision &&
        (await digest(canonicalJson(s.analysis))) === b.analysisHash &&
        (await referencesCurrent(
          ctx,
          run.organizationId,
          (s.analysis?.insights ?? []).slice(0, 20).map((i: any) => ({
            sourceId: s._id,
            generation: s.generation,
            revision: s.updatedAt,
            insightId: i.id,
          })),
        )),
      "APPROVAL_STALE",
      "Source evidence or permission changed.",
    );
  }
  for (const b of t!.repositoryBindings) {
    const r = await ctx.db.get(b.repositoryId);
    ensure(
      r?.organizationId === run.organizationId &&
        r.enabled &&
        r.confirmed &&
        snapshotScopeCurrent(r) &&
        r.sha === b.baseSha &&
        r.profileVersion === b.profileVersion &&
        (r.selectionVersion ?? 0) === b.selectionVersion,
      "APPROVAL_STALE",
      "Selected repository context changed.",
    );
  }
  for (const b of t!.topicBindings) {
    const topic = await ctx.db.get(b.id);
    ensure(
      topic?.organizationId === run.organizationId &&
        !topic.redirect &&
        topic.version === b.version,
      "APPROVAL_STALE",
      "A selected topic changed.",
    );
  }
  const preference = await ctx.db
    .query("improvementPreferences")
    .withIndex("by_org", (q) => q.eq("organizationId", run.organizationId))
    .unique();
  ensure(
    (preference?.version ?? 0) === t!.preferenceVersion,
    "APPROVAL_STALE",
    "Project evaluation preferences changed.",
  );
  for (const id of t!.members) {
    const m = await ctx.db.get(id);
    ensure(
      m?.organizationId === run.organizationId &&
        !m.excluded &&
        !m.retainedHistory &&
        run.sources.includes(m.sourceId),
      "APPROVAL_STALE",
      "A selected idea changed.",
    );
  }
  if (t!.proposal) {
    const p = await ctx.db.get(t!.proposal.id);
    const binding = t!.repositoryBindings.find(
      (row) => row.repositoryId === p?.repositoryId,
    );
    ensure(
      p?.organizationId === run.organizationId &&
        p.version === t!.proposal.version &&
        p.review === "accepted" &&
        !!binding &&
        p.baseSha === binding.baseSha &&
        p.profileVersion === binding.profileVersion &&
        p.localPlanRunId === run._id &&
        (await improvementCurrent(ctx, p)),
      "APPROVAL_STALE",
      "The accepted proposal changed.",
    );
  }
  return t!;
}

export async function taskLease(
  ctx: QueryCtx,
  runId: Id<"localLibraryRuns">,
  actorId: Id<"users">,
  deviceId: Id<"devices">,
  leaseGeneration: number,
  leaseToken: string,
) {
  const run = await ctx.db.get(runId);
  ensure(
    run?.task &&
      run.task.deviceId === deviceId &&
      run.task.leaseGeneration === leaseGeneration &&
      run.task.leaseToken === leaseToken,
    "APPROVAL_STALE",
    "This result does not own the current lease.",
  );
  await taskBindingsCurrent(ctx, run!, actorId);
  return run!;
}
