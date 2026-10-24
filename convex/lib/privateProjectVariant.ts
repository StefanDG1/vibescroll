import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { PrivateVariantSelection } from "../../packages/contracts/private-project-variant";
import type { PrivateEvaluationOrigin } from "../../packages/contracts/private-evaluation-context";
import {
  privateVariantReference,
  type EvaluationReference,
} from "../../packages/knowledge/contracts";
import { readSourceTaskResult } from "./privateSourceAnalysis";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { ensure } from "../../packages/policy";
import { digest } from "../product";
import { referencesCurrent } from "../knowledge";
import { repositoryContent } from "./repositoryContent";
import { access, recentAuthentication } from "../lib";
import { taskDevice } from "./localTaskAuthority";
import { runtimeCurrent } from "./privateSourceAnalysis";
import { snapshotScopeCurrent } from "../../packages/repositories/scope";
import { improvementCurrent } from "./improvementContext";
import {
  projectApplicationCache,
  projectApplicationBundle,
} from "./projectApplication";

export async function quotePrivateVariantTask(
  ctx: QueryCtx,
  a: {
    organizationId: Id<"organizations">;
    workload: "project_evaluation" | "plan_draft";
    sourceId?: Id<"sources">;
    repositoryIds?: Id<"repositories">[];
    members?: Id<"knowledgeMembers">[];
    proposalId?: Id<"proposals">;
    proposalVersion?: number;
    deviceId: Id<"devices">;
    model: string;
    effort: string;
    key: string;
    privateEvaluationBrief?: string;
    privateVariantSelection?: PrivateVariantSelection;
  },
  expiresAt: number,
) {
  const { actor, organization } = await access(ctx, a.organizationId, [
    "owner",
    "admin",
    "member",
  ]);
  await recentAuthentication(ctx);
  ensure(
    organization.privateOwnerId === actor._id &&
      a.privateEvaluationBrief === undefined &&
      a.members === undefined &&
      /^[a-zA-Z0-9_-]{12,80}$/.test(a.key) &&
      Number.isSafeInteger(expiresAt) &&
      expiresAt > Date.now() &&
      expiresAt <= Date.now() + 300000,
    "INVALID_INPUT",
    "Review one exact private variant without canonical members or another brief.",
  );
  let selection = a.privateVariantSelection,
    proposal: { id: Id<"proposals">; version: number } | undefined,
    origin: PrivateEvaluationOrigin | undefined,
    repositoryIds = a.repositoryIds;
  if (a.workload === "plan_draft") {
    const p = a.proposalId ? await ctx.db.get(a.proposalId) : null,
      inherited = variantOrigin(p?.privateEvaluationOrigin);
    ensure(
      p?.organizationId === a.organizationId &&
        p.version === a.proposalVersion &&
        p.review === "accepted" &&
        inherited?.ownerId === actor._id &&
        !a.sourceId &&
        !a.repositoryIds &&
        !a.privateVariantSelection &&
        (await improvementCurrent(ctx, p)),
      "APPROVAL_STALE",
      "Review the accepted private variant proposal.",
    );
    selection = selectionForOrigin(inherited);
    origin = inherited;
    repositoryIds = [p.repositoryId];
    proposal = { id: p._id, version: p.version };
  } else
    ensure(
      selection &&
        a.sourceId &&
        !a.proposalId &&
        a.proposalVersion === undefined &&
        repositoryIds &&
        repositoryIds.length > 0 &&
        repositoryIds.length <= 5 &&
        new Set(repositoryIds).size === repositoryIds.length,
      "INVALID_INPUT",
      "Choose the private source and up to five distinct projects.",
    );
  const current = await resolvePrivateVariant(
    ctx,
    a.organizationId,
    actor._id,
    selection!,
  );
  ensure(
    a.workload === "plan_draft" || a.sourceId === current.source._id,
    "FORBIDDEN",
    "The private result belongs to another source.",
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
      device.localTaskRuntime!.value.features.includes(
        "project_private_variant_v1",
      ) &&
      device.localTaskRuntime!.hash ===
        (await digest(canonicalJson(device.localTaskRuntime!.value))),
    "SETUP_REQUIRED",
    "Reconnect the private variant project runtime.",
  );
  origin ??= {
    schemaVersion: "2.0.0",
    kind: "private_source_variant",
    ownerId: actor._id,
    sourceId: current.source._id,
    runId: current.run._id,
    version: selection!.version,
    outputHash: selection!.outputHash,
    baseHash: current.binding.baseHash,
    briefHash: null,
    model: a.model,
    effort: a.effort,
    insightIds: selection!.insightIds,
  };
  const sourceBindings = [
      {
        sourceId: current.source._id,
        generation: current.source.generation,
        revision: current.source.updatedAt,
        analysisHash: await digest(canonicalJson(current.source.analysis)),
      },
    ],
    repositoryBindings = [];
  for (const id of [...repositoryIds!].sort()) {
    const r = await ctx.db.get(id);
    ensure(
      r?.organizationId === a.organizationId &&
        r.enabled &&
        r.confirmed &&
        snapshotScopeCurrent(r),
      "CONTEXT_REQUIRED",
      "Confirm the selected repository context.",
    );
    if (proposal) {
      const p = (await ctx.db.get(proposal.id))!;
      ensure(
        p.baseSha === r.sha && p.profileVersion === r.profileVersion,
        "APPROVAL_STALE",
        "The accepted repository base changed.",
      );
    }
    repositoryBindings.push({
      repositoryId: id,
      baseSha: r.sha,
      profileVersion: r.profileVersion,
      selectionVersion: r.selectionVersion ?? 0,
    });
  }
  const preferences = await ctx.db
    .query("improvementPreferences")
    .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
    .unique();
  const payload = {
    schemaVersion: "3.0.0" as const,
    workload: a.workload,
    fundingRoute: "chatgpt_subscription" as const,
    maxInferenceCredits: 0 as const,
    organizationId: a.organizationId,
    actor: actor._id,
    deviceId: device._id,
    profileBinding: device.subscriptionCapabilities!.profileBinding,
    capabilityHash: device.subscriptionCapabilities!.hash,
    localRuntimeHash: device.localTaskRuntime!.hash,
    model: a.model,
    effort: a.effort,
    key: `${actor._id}:${a.key}`,
    sourceBindings,
    repositoryBindings,
    members: [] as Id<"knowledgeMembers">[],
    topicBindings: [] as { id: Id<"knowledgeTopics">; version: number }[],
    preferenceVersion: preferences?.version ?? 0,
    ...(proposal ? { proposal } : {}),
    privateVariantSelection: selection!,
    privateEvaluationOrigin: origin,
    sourceReanalysisBinding: {
      sourceId: current.source._id,
      generation: current.source.generation,
    },
    quoteExpiresAt: expiresAt,
  };
  return { payload, hash: await digest(canonicalJson(payload)) };
}

export function variantOrigin(origin?: PrivateEvaluationOrigin) {
  return origin?.kind === "private_source_variant" ? origin : null;
}
export function selectionForOrigin(
  origin: NonNullable<ReturnType<typeof variantOrigin>>,
): PrivateVariantSelection {
  return {
    schemaVersion: "private-source-variant-v1",
    runId: origin.runId,
    version: origin.version,
    outputHash: origin.outputHash,
    insightIds: origin.insightIds,
  };
}
export async function resolvePrivateVariant(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  actor: Id<"users">,
  selection: PrivateVariantSelection,
) {
  ensure(
    selection.schemaVersion === "private-source-variant-v1" &&
      Number.isSafeInteger(selection.version) &&
      selection.version > 0 &&
      /^[a-f0-9]{64}$/.test(selection.outputHash) &&
      selection.insightIds.length > 0 &&
      selection.insightIds.length <= 12 &&
      selection.insightIds.every(
        (id) => typeof id === "string" && id.length > 0 && id.length <= 120,
      ) &&
      new Set(selection.insightIds).size === selection.insightIds.length &&
      canonicalJson([...selection.insightIds].sort()) ===
        canonicalJson(selection.insightIds),
    "INVALID_INPUT",
    "Choose one earned private version and up to twelve distinct sorted insight IDs.",
  );
  const run = await ctx.db.get(selection.runId);
  ensure(
    run?.organizationId === organizationId &&
      run.actor === actor &&
      run.task?.schemaVersion === "2.0.0",
    "FORBIDDEN",
    "This private variant belongs to another owner.",
  );
  const current = await readSourceTaskResult(ctx, run);
  ensure(
    current &&
      current.version === selection.version &&
      current.provenance.outputHash === selection.outputHash,
    "APPROVAL_STALE",
    "The selected private result is unavailable or changed.",
  );
  ensure(
    new Set(current.output.insights.map((point: { id: string }) => point.id))
      .size === current.output.insights.length,
    "INVALID_EVIDENCE",
    "Private insight IDs must identify distinct actual insights.",
  );
  const evidence = selection.insightIds.map((id) => {
    const insight = current.output.insights.find(
      (point: { id: string }) => point.id === id,
    );
    ensure(
      insight,
      "INVALID_EVIDENCE",
      "Choose actual insights from this private result.",
    );
    const checked = privateVariantReference.parse({
      schemaVersion: "private-source-reference-v1",
      sourceId: current.source._id,
      generation: current.source.generation,
      revision: current.source.updatedAt,
      insightId: id,
      runId: run._id,
      privateVersion: current.version,
      outputHash: selection.outputHash,
    });
    return {
      reference: { ...checked, sourceId: current.source._id, runId: run._id },
      title: current.source.title,
      insight,
    };
  });
  return {
    ...current,
    run,
    evidence,
    binding: run.task.sourceReanalysisBinding,
  };
}
export async function evaluationReferencesCurrent(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  refs: EvaluationReference[],
  origin?: PrivateEvaluationOrigin,
): Promise<boolean> {
  const privateOrigin = variantOrigin(origin);
  if (!privateOrigin)
    return (
      refs.every((ref) => !("schemaVersion" in ref)) &&
      referencesCurrent(
        ctx,
        organizationId,
        refs as import("../../packages/knowledge/contracts").Reference[],
      )
    );
  try {
    const current = await resolvePrivateVariant(
      ctx,
      organizationId,
      privateOrigin.ownerId,
      selectionForOrigin(privateOrigin),
    );
    const allowed = new Set(
      current.evidence.map((e) => canonicalJson(e.reference)),
    );
    return (
      privateOrigin.sourceId === current.source._id &&
      privateOrigin.baseHash === current.binding.baseHash &&
      refs.length > 0 &&
      refs.length <= allowed.size &&
      refs.every((ref) => allowed.has(canonicalJson(ref)))
    );
  } catch {
    return false;
  }
}
export async function variantTaskEvidence(
  ctx: QueryCtx,
  run: Doc<"localLibraryRuns">,
) {
  const task = run.task;
  ensure(
    (task?.schemaVersion === "3.0.0" ||
      (task?.schemaVersion === "4.0.0" && !!task.privateVariantSelection)) &&
      task.privateEvaluationBrief === undefined &&
      task.members.length === 0 &&
      task.topicId === undefined &&
      task.topicBindings.length === 0,
    "APPROVAL_STALE",
    "Use the exact private variant task without canonical memberships or an extra brief.",
  );
  const current = await resolvePrivateVariant(
      ctx,
      run.organizationId,
      run.actor,
      task.privateVariantSelection!,
    ),
    origin = variantOrigin(task.privateEvaluationOrigin);
  ensure(
    origin &&
      origin.ownerId === run.actor &&
      origin.sourceId === current.source._id &&
      origin.baseHash === current.binding.baseHash &&
      canonicalJson(selectionForOrigin(origin)) ===
        canonicalJson(task.privateVariantSelection) &&
      task.sourceReanalysisBinding.sourceId === current.source._id &&
      task.sourceReanalysisBinding.generation === current.source.generation &&
      run.sources.length === 1 &&
      run.sources[0] === current.source._id &&
      (task.workload === "plan_draft" ||
        (origin.model === run.model && origin.effort === run.effort)),
    "APPROVAL_STALE",
    "The approved private variant lineage changed.",
  );
  return current;
}
export async function prepareVariantEvaluation(
  ctx: MutationCtx,
  run: Doc<"localLibraryRuns">,
  repositoryId: Id<"repositories">,
) {
  const current = await variantTaskEvidence(ctx, run),
    task = run.task!;
  ensure(
    (task.schemaVersion === "3.0.0" || task.schemaVersion === "4.0.0") &&
      task.workload === "project_evaluation" &&
      run.repositories.includes(repositoryId),
    "FORBIDDEN",
    "Use the approved variant and repository.",
  );
  const repo = await repositoryContent(ctx, await ctx.db.get(repositoryId));
  ensure(repo, "CONTEXT_REQUIRED", "Repository context is unavailable.");
  const references = current.evidence.map((e) => e.reference),
    sourceSetHash = await digest(
      canonicalJson({ references, topicBindings: [] }),
    );
  const key = `knowledge-evaluation:private-source-variant-v1:${repo._id}:${repo.sha}:${repo.profileVersion}:${repo.selectionVersion ?? 0}:${sourceSetHash}:${task.preferenceVersion}:${await digest(canonicalJson(task.privateEvaluationOrigin))}${projectApplicationCache(run)}`;
  const old = await ctx.db
    .query("knowledgeEvaluations")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const previous = await ctx.db
    .query("knowledgeEvaluations")
    .withIndex("by_repo", (q) => q.eq("repositoryId", repo._id))
    .order("desc")
    .take(20);
  const reviewHistory = [];
  for (const row of previous)
    if (
      row.organizationId === run.organizationId &&
      row.actor === run.actor &&
      row.state === "ready" &&
      row.output &&
      canonicalJson(row.privateEvaluationOrigin ?? null) ===
        canonicalJson(task.privateEvaluationOrigin) &&
      ["rejected", "deferred"].includes(row.decision) &&
      (await evaluationReferencesCurrent(
        ctx,
        run.organizationId,
        row.references,
        row.privateEvaluationOrigin,
      ))
    ) {
      reviewHistory.push({
        decision: row.decision,
        disposition: row.output.disposition,
        rationale: row.output.rationale,
        problem: row.output.problem,
        baseSha: row.baseSha,
      });
      if (reviewHistory.length === 10) break;
    }
  const preference = await ctx.db
    .query("improvementPreferences")
    .withIndex("by_org", (q) => q.eq("organizationId", run.organizationId))
    .unique();
  if (old)
    ensure(
      old.organizationId === run.organizationId &&
        old.actor === run.actor &&
        canonicalJson(old.privateEvaluationOrigin) ===
          canonicalJson(task.privateEvaluationOrigin) &&
        canonicalJson(old.references) === canonicalJson(references) &&
        (old.state === "ready" ||
          (old.state === "local_prepared" && old.localRunId === run._id)),
      "SOURCE_BUSY",
      "Reconcile the earlier evaluation of this private variant.",
    );
  const id =
    old?._id ??
    (await ctx.db.insert("knowledgeEvaluations", {
      organizationId: run.organizationId,
      actor: run.actor,
      repositoryId: repo._id,
      baseSha: repo.sha,
      profileVersion: repo.profileVersion,
      selectionVersion: repo.selectionVersion ?? 0,
      references,
      sourceSetHash,
      preferenceVersion: task.preferenceVersion,
      localRunId: run._id,
      privateEvaluationOrigin: task.privateEvaluationOrigin,
      topicBindings: [],
      key,
      state: "local_prepared",
      decision: "new",
      covered: references.length,
      omitted: true,
      processingVersion: "private-source-variant-v1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
  if (!old) {
    ensure(run.jobs < 1000, "BUDGET_EXCEEDED", "Run job limit reached.");
    await ctx.db.patch(run._id, { jobs: run.jobs + 1, updatedAt: Date.now() });
  }
  return {
    id,
    cached: old?.state === "ready",
    ...(await projectApplicationBundle(ctx, run)),
    evidence: current.evidence,
    repo,
    preference: preference?.note ?? "",
    reviewHistory,
    privateEvaluationOrigin: task.privateEvaluationOrigin,
    next: null,
  };
}
