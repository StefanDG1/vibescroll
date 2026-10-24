import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensure } from "../packages/policy";
import {
  taskBindingsCurrent,
  taskLease,
  capabilitySnapshot,
} from "./lib/localTaskAuthority";
import {
  evaluationPrepareCore,
  evaluationFinishCore,
  recordInspectionCore,
} from "./localLibrary";
import { repositoryContent } from "./lib/repositoryContent";
import { evaluationCurrent, memberEvidence } from "./knowledge";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { validateDraftPlan } from "./planning";
import { validateInspectedContext } from "../packages/repositories/retrieval";
import { samePrivateEvaluationOrigin } from "./lib/privateEvaluationContext";

export async function claimLocalTask(ctx: MutationCtx, device: Doc<"devices">) {
  // A new worker session cannot erase the previous session's uncertain turn.
  for (const state of ["unknown", "canceled", "expired"]) {
    const rows = await ctx.db
      .query("localLibraryRuns")
      .withIndex("by_device_state", (q) =>
        q.eq("task.deviceId", device._id).eq("state", state),
      )
      .take(30);
    if (
      rows.some(
        (run) =>
          run.task &&
          (state === "unknown" ||
            run.task.leaseGeneration >= (state === "canceled" ? 2 : 1)),
      )
    )
      return { job: null, reconcileTask: true };
    if (rows.length === 30) return { job: null, reconcileTask: true };
  }
  const active = await ctx.db
    .query("localLibraryRuns")
    .withIndex("by_device_state", (q) =>
      q.eq("task.deviceId", device._id).eq("state", "active"),
    )
    .first();
  if (active?.task) {
    if (
      active.task.leaseUntil <= Date.now() ||
      active.task.deadline <= Date.now()
    ) {
      await ctx.db.patch(active._id, {
        state: "unknown",
        updatedAt: Date.now(),
        task: {
          ...active.task,
          leaseUntil: 0,
          leaseToken: undefined,
          inspected: undefined,
          inspectionManifest: undefined,
        },
      });
      return { job: null, reconcileTask: true };
    }
    return { job: null, busy: true };
  }
  const candidates = await ctx.db
    .query("localLibraryRuns")
    .withIndex("by_device_state", (q) =>
      q.eq("task.deviceId", device._id).eq("state", "queued"),
    )
    .take(5);
  for (const run of candidates) {
    try {
      await taskBindingsCurrent(ctx, run, device.owner, false);
    } catch {
      await ctx.db.patch(run._id, { state: "expired", updatedAt: Date.now() });
      if (run.task?.proposal) {
        const p = await ctx.db.get(run.task.proposal.id);
        if (p?.localPlanRunId === run._id)
          await ctx.db.patch(p._id, { localPlanRunId: undefined });
      }
      continue;
    }
    const task = {
      ...run.task!,
      leaseGeneration: run.task!.leaseGeneration + 1,
      leaseToken: crypto.randomUUID(),
      leaseUntil: Math.min(run.task!.deadline, Date.now() + 40000),
    };
    await ctx.db.patch(run._id, {
      state: "active",
      task,
      updatedAt: Date.now(),
    });
    return {
      job: {
        taskProtocolVersion: "1.0.0",
        workload: task.workload,
        runId: run._id,
        profileBinding: task.profileBinding,
        model: run.model,
        effort: run.effort,
        repositories: run.repositories,
        expiresAt: run.expiresAt,
        deadline: task.deadline,
        leaseGeneration: task.leaseGeneration,
        leaseToken: task.leaseToken,
        ...(task.proposal ? { proposalVersion: task.proposal.version } : {}),
      },
    };
  }
  return null;
}

export async function localTaskOperation(
  ctx: MutationCtx,
  device: Doc<"devices">,
  operation: string,
  a: any,
) {
  const initial = await ctx.db.get(a.runId as Id<"localLibraryRuns">);
  ensure(
    initial?.task &&
      initial.actor === device.owner &&
      initial.task.deviceId === device._id,
    "FORBIDDEN",
    "This task belongs to another device or actor.",
  );
  if (operation === "task_fail") {
    ensure(
      initial.task.leaseGeneration === a.leaseGeneration &&
        initial.task.leaseToken === a.leaseToken &&
        initial.state === "active",
      "APPROVAL_STALE",
      "This failure does not own the active lease.",
    );
    await ctx.db.patch(initial._id, {
      state: "unknown",
      updatedAt: Date.now(),
      task: {
        ...initial.task,
        leaseUntil: 0,
        leaseToken: undefined,
        inspected: undefined,
        inspectionManifest: undefined,
      },
    });
    return { recorded: true, usage: "unknown", chargedInferenceCredits: 0 };
  }
  if (operation === "task_heartbeat" && a.capabilities) {
    ensure(
      initial.task.leaseGeneration === a.leaseGeneration &&
        initial.task.leaseToken === a.leaseToken &&
        initial.state === "active",
      "APPROVAL_STALE",
      "Renew only your active task.",
    );
    const renewed = await capabilitySnapshot(
      ctx,
      device,
      a.capabilities,
      initial.task.profileBinding,
      device.subscriptionCapabilities?.sessionExpiresAt ?? 0,
    );
    ensure(
      renewed.hash === initial.task.capabilityHash,
      "APPROVAL_STALE",
      "The approved catalogue changed.",
    );
  }
  const run = await taskLease(
    ctx,
    initial._id,
    device.owner,
    device._id,
    a.leaseGeneration,
    a.leaseToken,
  );
  const task = run.task!;
  if (operation === "task_heartbeat") {
    const leaseUntil = Math.min(task.deadline, Date.now() + 40000);
    await ctx.db.patch(run._id, {
      task: { ...task, leaseUntil },
      updatedAt: Date.now(),
    });
    return {
      valid: true,
      deadline: task.deadline,
      leaseGeneration: task.leaseGeneration,
    };
  }
  if (operation === "task_context_prepare") {
    ensure(
      run.repositories.includes(a.repositoryId),
      "FORBIDDEN",
      "Choose an approved repository.",
    );
    if (task.workload === "project_evaluation") {
      return {
        workload: task.workload,
        ...(await evaluationPrepareCore(
          ctx,
          {
            runId: run._id,
            topicId: task.topicId!,
            repositoryId: a.repositoryId,
            members: task.members,
          },
          device.owner,
        )),
      };
    }
    const repo = await repositoryContent(
      ctx,
      await ctx.db.get(a.repositoryId as Id<"repositories">),
    );
    const proposal = task.proposal ? await ctx.db.get(task.proposal.id) : null;
    ensure(
      repo && proposal && proposal.repositoryId === repo._id,
      "APPROVAL_STALE",
      "Plan context changed.",
    );
    return { workload: task.workload, repo, proposal };
  }
  if (operation === "task_record_inspection") {
    ensure(
      task.workload === "plan_draft" &&
        Array.isArray(a.inspected) &&
        a.inspected.length <= 30 &&
        Array.isArray(a.manifest) &&
        a.manifest.length <= 100 &&
        JSON.stringify(a.inspected).length <= 250000,
      "INVALID_EVIDENCE",
      "Use bounded inspected context.",
    );
    validateInspectedContext(a.inspected, a.manifest);
    await ctx.db.patch(run._id, {
      task: { ...task, inspected: a.inspected, inspectionManifest: a.manifest },
      updatedAt: Date.now(),
    });
    return { recorded: true };
  }
  if (operation === "task_record_evaluation_inspection") {
    ensure(
      task.workload === "project_evaluation",
      "FORBIDDEN",
      "This task does not authorize evaluation context.",
    );
    const e = await ctx.db.get(a.id as Id<"knowledgeEvaluations">);
    ensure(
      e?.localRunId === run._id && run.repositories.includes(e.repositoryId),
      "FORBIDDEN",
      "Evaluation belongs to another task.",
    );
    return recordInspectionCore(
      ctx,
      { id: e!._id, inspected: a.inspected },
      device.owner,
    );
  }
  if (operation === "task_evaluation_finish") {
    ensure(
      task.workload === "project_evaluation",
      "FORBIDDEN",
      "This task does not authorize evaluations.",
    );
    const e = await ctx.db.get(a.id as Id<"knowledgeEvaluations">);
    ensure(
      e?.localRunId === run._id && run.repositories.includes(e.repositoryId),
      "FORBIDDEN",
      "Evaluation belongs to another task.",
    );
    return evaluationFinishCore(
      ctx,
      { id: e!._id, output: a.output },
      device.owner,
    );
  }
  if (operation === "task_finish") {
    if (task.workload === "plan_draft") {
      const proposal = (await ctx.db.get(task.proposal!.id))!;
      const repo = (await repositoryContent(
        ctx,
        await ctx.db.get(proposal.repositoryId),
      ))!;
      ensure(
        task.inspected && task.inspectionManifest && a.plan,
        "CONTEXT_REQUIRED",
        "Inspect the current repository before drafting.",
      );
      const plan = validateDraftPlan(
        a.plan,
        repo,
        task.inspected,
        task.inspectionManifest,
      );
      await ctx.db.patch(proposal._id, {
        planDraft: plan,
        planDraftVersion: proposal.version,
        localPlanRunId: undefined,
        updatedAt: Date.now(),
      });
      await ctx.db.patch(run._id, {
        state: "completed",
        completed: 1,
        updatedAt: Date.now(),
        task: {
          ...task,
          leaseToken: undefined,
          leaseUntil: 0,
          inspected: undefined,
          inspectionManifest: undefined,
          proposalIds: [proposal._id],
        },
      });
      return {
        accepted: true,
        proposalIds: [proposal._id],
        chargedInferenceCredits: 0,
      };
    }
    ensure(
      Array.isArray(a.evaluationIds) &&
        a.evaluationIds.length === run.repositories.length &&
        new Set(a.evaluationIds).size === a.evaluationIds.length,
      "INVALID_EVIDENCE",
      "Complete each selected repository once.",
    );
    const evidence = await memberEvidence(
      ctx,
      (await Promise.all(task.members.map((id) => ctx.db.get(id)))).filter(
        (m): m is Doc<"knowledgeMembers"> => !!m,
      ),
    );
    const expected = new Set(evidence.map((e) => canonicalJson(e.reference))),
      repositories = new Set(),
      proposalIds: Id<"proposals">[] = [];
    for (const id of a.evaluationIds as Id<"knowledgeEvaluations">[]) {
      const e = await ctx.db.get(id);
      ensure(
        e?.organizationId === run.organizationId &&
          e.state === "ready" &&
          samePrivateEvaluationOrigin(
            e.privateEvaluationOrigin,
            task.privateEvaluationOrigin,
          ) &&
          e.output &&
          run.repositories.includes(e.repositoryId) &&
          !repositories.has(e.repositoryId) &&
          e.references.length === expected.size &&
          e.references.every((r) => expected.has(canonicalJson(r))) &&
          (await evaluationCurrent(ctx, e)),
        "INVALID_EVIDENCE",
        "Use current evaluations of the exact selected ideas and repositories.",
      );
      repositories.add(e!.repositoryId);
      let p = await ctx.db
        .query("proposals")
        .withIndex("by_local_evaluation", (q) =>
          q.eq("localEvaluationId", e!._id),
        )
        .unique();
      ensure(
        !p ||
          samePrivateEvaluationOrigin(
            p.privateEvaluationOrigin,
            e!.privateEvaluationOrigin,
          ),
        "APPROVAL_STALE",
        "The existing proposal has different private context.",
      );
      if (!p) {
        const output = e!.output;
        const proposalId = await ctx.db.insert("proposals", {
          organizationId: run.organizationId,
          sourceId: e!.references[0].sourceId,
          localEvaluationId: e!._id,
          ...(e!.privateEvaluationOrigin
            ? { privateEvaluationOrigin: e!.privateEvaluationOrigin }
            : {}),
          references: e!.references,
          repositoryId: e!.repositoryId,
          baseSha: e!.baseSha,
          profileVersion: e!.profileVersion,
          title: output.title.slice(0, 160),
          disposition: output.disposition,
          review: "unreviewed",
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          detail: {
            schemaVersion: "1.0.0",
            repositoryId: e!.repositoryId,
            baseSha: e!.baseSha,
            profileVersion: e!.profileVersion,
            insightIds: e!.references.map((r) => r.insightId),
            disposition: output.disposition,
            title: output.title.slice(0, 160),
            currentProblem: output.problem,
            proposedChange: output.approach,
            benefitHypothesis: output.rationale,
            repositoryEvidence: output.repositoryEvidence.map((r: any) => ({
              path: r.path,
              startLine: r.startLine,
              endLine: r.endLine,
              observation: r.explanation,
            })),
            sourceEvidence: [],
            risks: output.risks,
            nonGoals: [],
            acceptanceCriteria: output.acceptance,
            verificationNeeds: output.questions,
          },
        });
        p = (await ctx.db.get(proposalId))!;
      }
      proposalIds.push(p._id);
    }
    await ctx.db.patch(run._id, {
      state: "completed",
      completed: proposalIds.length,
      updatedAt: Date.now(),
      task: {
        ...task,
        leaseUntil: 0,
        leaseToken: undefined,
        evaluationIds: a.evaluationIds,
        proposalIds,
      },
    });
    return { accepted: true, proposalIds, chargedInferenceCredits: 0 };
  }
  throw Error("INVALID_INPUT: Unsupported task operation.");
}
