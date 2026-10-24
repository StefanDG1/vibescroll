import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { access, recentAuthentication, limit, audit } from "../lib";
import { ensure } from "../../packages/policy";
import { digest } from "../product";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { taskDevice } from "./localTaskAuthority";
import {
  runtimeCurrent,
  sourceTextInput,
  sourceTaskRunLimit,
  sourceTask,
  readSourceTaskResult,
} from "./privateSourceAnalysis";
import { internal } from "../_generated/api";
type Selection = {
  organizationId: Id<"organizations">;
  sourceId?: Id<"sources">;
  deviceId: Id<"devices">;
  model: string;
  effort: string;
  key: string;
  expectedPrivateVersion?: number;
  privateSourceBrief?: string;
  repositoryIds?: Id<"repositories">[];
  members?: Id<"knowledgeMembers">[];
  proposalId?: Id<"proposals">;
  proposalVersion?: number;
  privateEvaluationBrief?: string;
};
export async function quoteSourceTask(
  ctx: QueryCtx,
  a: Selection,
  expiresAt: number,
  allowedPending?: Id<"localLibraryRuns">,
) {
  const { actor, organization } = await access(ctx, a.organizationId, [
    "owner",
    "admin",
    "member",
  ]);
  await recentAuthentication(ctx);
  ensure(
    organization.privateOwnerId === actor._id &&
      a.sourceId &&
      a.repositoryIds === undefined &&
      a.members === undefined &&
      a.proposalId === undefined &&
      a.proposalVersion === undefined &&
      a.privateEvaluationBrief === undefined,
    "INVALID_INPUT",
    "Choose one private text source without project selections.",
  );
  ensure(
    /^[a-zA-Z0-9_-]{12,80}$/.test(a.key) &&
      Number.isSafeInteger(expiresAt) &&
      expiresAt > Date.now() &&
      expiresAt <= Date.now() + 300000 &&
      Number.isSafeInteger(a.expectedPrivateVersion) &&
      a.expectedPrivateVersion! >= 0,
    "QUOTE_CHANGED",
    "Review a current private source quote and version.",
  );
  const device = await taskDevice(
    ctx,
    a.organizationId,
    actor._id,
    a.deviceId,
    a.model,
    a.effort,
  );
  ensure(
    runtimeCurrent(device) &&
      device.localTaskRuntime!.hash ===
        (await digest(canonicalJson(device.localTaskRuntime!.value))),
    "SETUP_REQUIRED",
    "Update and reconnect the local text reanalysis runtime.",
  );
  const source = await ctx.db.get(a.sourceId);
  ensure(
    source?.organizationId === a.organizationId &&
      (source.privateSourceAnalysis?.version ?? 0) === a.expectedPrivateVersion,
    "APPROVAL_STALE",
    "Review the current private source version.",
  );
  ensure(
    !source.privateSourceAnalysisRunId ||
      source.privateSourceAnalysisRunId === allowedPending,
    "SOURCE_BUSY",
    "Reconcile the earlier private source task before approving new work.",
  );
  const c = await sourceTextInput(
    ctx,
    source,
    actor._id,
    a.model,
    a.effort,
    a.privateSourceBrief,
    a.expectedPrivateVersion!,
  );
  const { inputHash: _unallocated, ...quotedBinding } = c.binding;
  void _unallocated;
  const payload = {
    schemaVersion: "2.0.0" as const,
    workload: "source_reanalysis_text" as const,
    fundingRoute: "chatgpt_subscription" as const,
    maxInferenceCredits: 0 as const,
    organizationId: a.organizationId,
    actor: actor._id,
    sourceId: source._id,
    expectedPrivateVersion: a.expectedPrivateVersion!,
    model: a.model,
    effort: a.effort,
    deviceId: device._id,
    profileBinding: device.subscriptionCapabilities!.profileBinding,
    capabilityHash: device.subscriptionCapabilities!.hash,
    localRuntimeHash: device.localTaskRuntime!.hash,
    key: `${actor._id}:${a.key}`,
    ...(a.privateSourceBrief !== undefined
      ? { privateSourceBrief: a.privateSourceBrief }
      : {}),
    sourceReanalysisBinding: quotedBinding,
    quoteExpiresAt: expiresAt,
  };
  return { payload, hash: await digest(canonicalJson(payload)) };
}
export async function approveSourceTask(
  ctx: MutationCtx,
  a: Selection & { quoteHash: string; quoteExpiresAt: number },
) {
  const { actor } = await access(ctx, a.organizationId);
  await recentAuthentication(ctx);
  const old = await ctx.db
    .query("localLibraryRuns")
    .withIndex("by_task_key", (q) =>
      q
        .eq("organizationId", a.organizationId)
        .eq("task.key", `${actor._id}:${a.key}`),
    )
    .unique();
  if (
    old?.state === "completed" &&
    sourceTask(old)?.approvalHash === a.quoteHash &&
    (await readSourceTaskResult(ctx, old))
  ) {
    const task = sourceTask(old)!;
    ensure(
      task.deviceId === a.deviceId &&
        old.model === a.model &&
        old.effort === a.effort &&
        task.sourceReanalysisBinding.sourceId === a.sourceId &&
        task.sourceReanalysisBinding.priorVersion ===
          a.expectedPrivateVersion &&
        task.privateSourceBrief === a.privateSourceBrief &&
        a.repositoryIds === undefined &&
        a.members === undefined &&
        a.proposalId === undefined &&
        a.proposalVersion === undefined &&
        a.privateEvaluationBrief === undefined,
      "APPROVAL_STALE",
      "Replay only the exact completed private source approval.",
    );
    return { runId: old._id, cached: true };
  }
  const q = await quoteSourceTask(ctx, a, a.quoteExpiresAt, old?._id);
  ensure(
    q.hash === a.quoteHash,
    "APPROVAL_STALE",
    "Source, runtime, context or model changed after the quote.",
  );
  if (old) {
    ensure(
      sourceTask(old)?.approvalHash === q.hash,
      "APPROVAL_STALE",
      "Use a new explicit approval for changed work.",
    );
    return { runId: old._id, cached: true };
  }
  await limit(ctx, `own-task:${actor._id}`, 10);
  const p = q.payload,
    now = Date.now(),
    deadline = now + 1800000;
  const id = await ctx.db.insert("localLibraryRuns", {
    organizationId: a.organizationId,
    actor: actor._id,
    sources: [p.sourceId],
    repositories: [],
    model: p.model,
    effort: p.effort,
    expiresAt: deadline,
    state: "queued",
    jobs: 0,
    completed: 0,
    createdAt: now,
    updatedAt: now,
  });
  const source = (await ctx.db.get(p.sourceId))!;
  const c = await sourceTextInput(
    ctx,
    source,
    actor._id,
    p.model,
    p.effort,
    p.privateSourceBrief,
    p.expectedPrivateVersion,
    id,
  );
  const completeTask = {
    schemaVersion: p.schemaVersion,
    workload: p.workload,
    fundingRoute: p.fundingRoute,
    maxInferenceCredits: p.maxInferenceCredits,
    deviceId: p.deviceId,
    profileBinding: p.profileBinding,
    capabilityHash: p.capabilityHash,
    localRuntimeHash: p.localRuntimeHash,
    key: p.key,
    approvalHash: q.hash,
    approvedAt: now,
    deadline,
    leaseGeneration: 0,
    leaseUntil: 0,
    ...(p.privateSourceBrief !== undefined
      ? { privateSourceBrief: p.privateSourceBrief }
      : {}),
    sourceReanalysisBinding: c.binding,
  };
  const row = (await ctx.db.get(id))!;
  ensure(
    new TextEncoder().encode(canonicalJson({ ...row, task: completeTask }))
      .length <= sourceTaskRunLimit,
    "LIMIT_REACHED",
    "Private source task exceeds its storage limit.",
  );
  await ctx.db.patch(id, { task: completeTask });
  await ctx.db.patch(source._id, { privateSourceAnalysisRunId: id });
  await ctx.scheduler.runAfter(deadline - now, internal.localLibrary.expire, {
    runId: id,
  });
  await audit(ctx, a.organizationId, actor._id, "own_source_task.approved", id);
  return { runId: id, cached: false };
}
