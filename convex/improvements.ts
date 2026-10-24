import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, writeAccess, audit, limit } from "./lib";
import { containsSecret, ensure, sensitivePath } from "../packages/policy";
import { evaluationCurrent, referencesCurrent } from "./knowledge";
import { improvementCurrent } from "./lib/improvementContext";
import { samePrivateEvaluationOrigin } from "./lib/privateEvaluationContext";
import {
  outcomeInput,
  improvementStage,
} from "../packages/improvements/outcomes";
import {
  routinePathClass,
  routinePlanAllowed,
} from "../packages/improvements/policy";
import { measurement } from "./improvementSchema";
const org = { organizationId: v.id("organizations") };
export const create = mutation({
  args: { issueId: v.id("issueDrafts"), goal: v.string() },
  handler: async (ctx, a) => {
    const d = await ctx.db.get(a.issueId);
    ensure(d, "FORBIDDEN", "Issue unavailable.");
    const { actor } = await writeAccess(ctx, d.organizationId);
    await limit(ctx, `improvement:${d.organizationId}`, 10);
    const e = await ctx.db.get(d.evaluationId);
    ensure(
      e?.state === "ready" &&
        samePrivateEvaluationOrigin(
          e.privateEvaluationOrigin,
          d.privateEvaluationOrigin,
        ) &&
        e.output?.disposition === "relevant" &&
        (await evaluationCurrent(ctx, e)),
      "APPROVAL_STALE",
      "Review a current useful idea before planning.",
    );
    ensure(
      d.state !== "deleted" && d.state !== "unknown",
      "POLICY_BLOCKED",
      "Reconcile the issue before planning.",
    );
    const goal = a.goal.trim();
    ensure(
      goal.length > 0 && goal.length <= 1000 && !containsSecret(goal),
      "INVALID_INPUT",
      "Describe what should improve without private credentials.",
    );
    const old = await ctx.db
      .query("improvements")
      .withIndex("by_issue", (q) => q.eq("issueDraftId", d._id))
      .unique();
    if (old) {
      ensure(
        samePrivateEvaluationOrigin(
          old.privateEvaluationOrigin,
          e.privateEvaluationOrigin,
        ) &&
          old.issueHash === d.hash &&
          old.issueVersion === d.version &&
          old.state !== "deleted",
        "APPROVAL_STALE",
        "This improvement needs refreshed evidence.",
      );
      return old._id;
    }
    const now = Date.now(),
      output = e.output;
    const proposalId = await ctx.db.insert("proposals", {
      ...(e.privateEvaluationOrigin
        ? { privateEvaluationOrigin: e.privateEvaluationOrigin }
        : {}),
      organizationId: d.organizationId,
      createdAt: now,
      updatedAt: now,
      sourceId: e.references[0].sourceId,
      references: e.references,
      repositoryId: e.repositoryId,
      baseSha: e.baseSha,
      profileVersion: e.profileVersion,
      disposition: "relevant",
      title: d.title.slice(0, 160),
      review: "accepted",
      version: 1,
      detail: {
        schemaVersion: "1.0.0",
        repositoryId: e.repositoryId,
        baseSha: e.baseSha,
        profileVersion: e.profileVersion,
        insightIds: e.references.map((r) => r.insightId),
        disposition: "relevant",
        title: d.title.slice(0, 160),
        currentProblem: output.problem,
        proposedChange: output.approach,
        benefitHypothesis: goal,
        repositoryEvidence: output.repositoryEvidence.map((r: any) => ({
          path: r.path,
          startLine: r.startLine,
          endLine: r.endLine,
          observation: r.explanation,
        })),
        sourceEvidence: [],
        risks: output.risks,
        nonGoals: ["Work outside the reviewed issue and goal"],
        acceptanceCriteria: output.acceptance,
        verificationNeeds: output.questions,
        reviewedIssue: { title: d.title, body: d.body, version: d.version },
      },
    });
    const id = await ctx.db.insert("improvements", {
      ...(e.privateEvaluationOrigin
        ? { privateEvaluationOrigin: e.privateEvaluationOrigin }
        : {}),
      organizationId: d.organizationId,
      createdAt: now,
      updatedAt: now,
      repositoryId: d.repositoryId,
      evaluationId: e._id,
      issueDraftId: d._id,
      issueHash: d.hash,
      issueVersion: d.version,
      references: e.references,
      proposalId,
      title: d.title,
      goal,
      actor: actor._id,
      category: "unreviewed",
      state: "active",
      version: 1,
    });
    await ctx.db.patch(proposalId, { improvementId: id });
    await audit(ctx, d.organizationId, actor._id, "improvement_created", id);
    return id;
  },
});
export const list = query({
  args: { ...org, cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    const page = await ctx.db
      .query("improvements")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .order("desc")
      .paginate({ cursor: a.cursor ?? null, numItems: 20 });
    const items = [];
    for (const i of page.page) {
      const p = await ctx.db.get(i.proposalId),
        repo = await ctx.db.get(i.repositoryId);
      const surviving =
        i.state !== "deleted" &&
        (await referencesCurrent(ctx, i.organizationId, i.references));
      const current = !!p && (await improvementCurrent(ctx, p));
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_proposal", (q) => q.eq("proposalId", i.proposalId))
        .order("desc")
        .take(10);
      const run = runs[0];
      const outcome = await ctx.db
        .query("improvementOutcomes")
        .withIndex("by_improvement", (q) => q.eq("improvementId", i._id))
        .order("desc")
        .first();
      const issue = await ctx.db.get(i.issueDraftId);
      const attempts = issue
        ? await ctx.db
            .query("issueAttempts")
            .withIndex("by_draft", (q) => q.eq("draftId", issue._id))
            .order("desc")
            .take(5)
        : [];
      const plan =
        p?.plan ??
        (p?.planDraftVersion === p?.version ? p?.planDraft : undefined);
      const stage = improvementStage({
        current,
        deleted: !surviving,
        plan: !!plan,
        run,
        outcome: outcome?.runId === run?._id ? outcome : undefined,
      });
      items.push({
        id: i._id,
        version: i.version,
        repository: repo?.fullName ?? "Unavailable project",
        title: surviving ? i.title : "Unavailable improvement",
        goal: surviving ? i.goal : "",
        current,
        stage,
        category: i.category,
        plan:
          surviving && plan
            ? {
                scope: plan.scope,
                rollout: plan.rollout,
                rollback: plan.rollback,
                protected: plan.files.some((f: any) => sensitivePath(f.path)),
                steps: plan.steps,
                risks: plan.risks,
                unknowns: plan.unknowns,
                nonGoals: plan.nonGoals,
                routineCategory: routinePlanAllowed(
                  plan,
                  routinePathClass(plan.files[0].path) ?? "",
                  ["interface", "documentation"],
                )
                  ? routinePathClass(plan.files[0].path)
                  : null,
              }
            : undefined,
        planPending: !!p?.planDraftKey,
        hasDraft: !!p?.planDraft,
        issueUrl: attempts.find((x) => x.state === "published")?.url,
        run: run
          ? {
              id: run._id,
              state: run.state,
              prUrl: run.prUrl,
              prState: run.prState,
              mergedAt: run.mergedAt,
              observedAt: run.observedAt,
              maxCredits: run.maxCredits,
              highRisk: run.highRisk,
              checksPassed: run.checksPassed,
              review: run.aiReview?.status,
              deployment: run.deployment,
            }
          : undefined,
        outcome:
          surviving && outcome && outcome.runId === run?._id
            ? {
                verdict: outcome.verdict,
                method: outcome.method,
                note: outcome.note,
                measurement: outcome.measurement,
                deployedVersion: outcome.deployedVersion,
                deployedUrl: outcome.deployedUrl,
                createdAt: outcome.createdAt,
              }
            : undefined,
      });
    }
    return { items, next: page.isDone ? null : page.continueCursor };
  },
});
export const context = query({
  args: { id: v.id("improvements") },
  handler: async (ctx, a) => {
    const i = await ctx.db.get(a.id);
    ensure(i, "FORBIDDEN", "Improvement unavailable.");
    await access(ctx, i.organizationId, ["owner", "admin", "member"]);
    const p = await ctx.db.get(i.proposalId);
    ensure(
      p && (await improvementCurrent(ctx, p)),
      "APPROVAL_STALE",
      "Refresh this improvement before continuing.",
    );
    return { improvement: i, proposal: p };
  },
});
export const outcome = mutation({
  args: {
    id: v.id("improvements"),
    version: v.number(),
    verdict: v.string(),
    method: v.string(),
    note: v.string(),
    measurement: v.optional(measurement),
    runId: v.optional(v.id("runs")),
    deployedVersion: v.optional(v.string()),
    deployedUrl: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const i = await ctx.db.get(a.id);
    ensure(i, "FORBIDDEN", "Improvement unavailable.");
    const { actor } = await writeAccess(ctx, i.organizationId);
    ensure(
      i.version === a.version &&
        i.state !== "deleted" &&
        (await referencesCurrent(ctx, i.organizationId, i.references)),
      "APPROVAL_STALE",
      "Review the current improvement.",
    );
    const result = outcomeInput.parse({
      verdict: a.verdict,
      method: a.method,
      note: a.note,
      measurement: a.measurement,
    });
    ensure(
      !containsSecret(JSON.stringify(result)),
      "POLICY_BLOCKED",
      "Outcome evidence contains private credentials.",
    );
    if (a.runId) {
      const r = await ctx.db.get(a.runId);
      ensure(
        r?.organizationId === i.organizationId && r.proposalId === i.proposalId,
        "FORBIDDEN",
        "Run unavailable.",
      );
    }
    if (a.verdict !== "not_measured") {
      const r = a.runId ? await ctx.db.get(a.runId) : null;
      ensure(
        r?.mergedAt && (r.deployment || (a.deployedVersion && a.deployedUrl)),
        "EVIDENCE_REQUIRED",
        "Confirm where the merged change is available before judging its outcome.",
      );
    }
    ensure(
      !a.deployedVersion ||
        (a.deployedVersion.length <= 120 && !containsSecret(a.deployedVersion)),
      "INVALID_INPUT",
      "Use a bounded deployed version.",
    );
    if (a.deployedUrl) {
      const u = new URL(a.deployedUrl);
      ensure(
        u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          !u.port &&
          a.deployedUrl.length <= 500,
        "INVALID_INPUT",
        "Use the public HTTPS page without private parameters.",
      );
    }
    const now = Date.now();
    await ctx.db.insert("improvementOutcomes", {
      organizationId: i.organizationId,
      createdAt: now,
      updatedAt: now,
      improvementId: i._id,
      references: i.references,
      actor: actor._id,
      version: i.version,
      ...result,
      runId: a.runId,
      deployedVersion: a.deployedVersion,
      deployedUrl: a.deployedUrl,
    });
    await ctx.db.patch(i._id, { version: i.version + 1, updatedAt: now });
    await audit(
      ctx,
      i.organizationId,
      actor._id,
      "improvement_outcome_recorded",
      i._id,
    );
  },
});
export const preferences = query({
  args: org,
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    const p = await ctx.db
      .query("improvementPreferences")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    return { version: p?.version ?? 0, note: p?.note ?? "" };
  },
});
export const savePreferences = mutation({
  args: { ...org, version: v.number(), note: v.string() },
  handler: async (ctx, a) => {
    const { actor } = await writeAccess(ctx, a.organizationId, [
      "owner",
      "admin",
    ]);
    const old = await ctx.db
      .query("improvementPreferences")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    ensure(
      (old?.version ?? 0) === a.version,
      "APPROVAL_STALE",
      "Review the current preferences.",
    );
    const note = a.note.trim();
    ensure(
      note.length <= 3000 && !containsSecret(note),
      "INVALID_INPUT",
      "Keep preferences brief and free of credentials.",
    );
    const fields = {
      organizationId: a.organizationId,
      version: a.version + 1,
      note,
      actor: actor._id,
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.patch(old._id, fields);
    else
      await ctx.db.insert("improvementPreferences", {
        ...fields,
        createdAt: Date.now(),
      });
    await audit(
      ctx,
      a.organizationId,
      actor._id,
      "improvement_preferences_updated",
      a.organizationId,
    );
  },
});
