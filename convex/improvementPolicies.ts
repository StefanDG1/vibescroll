import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { access, writeAccess, audit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import {
  policyInput,
  routinePlanAllowed,
  routineCategories,
} from "../packages/improvements/policy";
import { actorCurrent } from "./knowledge";
import { improvementCurrent, runPolicyCurrent } from "./lib/improvementContext";
import { editPlanCore, reserve, settle, digest } from "./product";
import { approveCore, publicationCore } from "./jobs";
import { cloudExecutionAllowed } from "./lib/cloudAccess";
const month = () => new Date().toISOString().slice(0, 7);
export const cleanupRuns = internalQuery({
  args: { id: v.id("improvementPolicies") },
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.id);
    if (!p) return [];
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_repository", (q) => q.eq("repositoryId", p.repositoryId))
      .order("desc")
      .take(100);
    return runs
      .filter((r) => r.aiReview?.status === "reserved")
      .map((r) => r._id);
  },
});
export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const { membership } = await access(ctx, a.organizationId);
    const repos = await ctx.db
      .query("repositories")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .take(100);
    const items = [];
    for (const repo of repos.filter((r) => r.enabled)) {
      const p = await ctx.db
        .query("improvementPolicies")
        .withIndex("by_repo", (q) => q.eq("repositoryId", repo._id))
        .unique();
      items.push({
        repositoryId: repo._id,
        repository: repo.fullName,
        confirmed: repo.confirmed,
        policy: p
          ? {
              version: p.version,
              mode: p.mode,
              monthlyCredits: p.monthlyCredits,
              perRunCredits: p.perRunCredits,
              categories: p.categories,
              requiredChecks: p.requiredChecks,
              merge: p.merge,
              used: p.used,
              expiresAt: p.expiresAt,
              paused: p.paused,
              status: p.status,
            }
          : null,
      });
    }
    return {
      items,
      canConfigure: ["owner", "admin"].includes(membership.role),
      verified: process.env.CONTINUOUS_VERIFIED === "true",
    };
  },
});
export const save = mutation({
  args: {
    repositoryId: v.id("repositories"),
    version: v.number(),
    mode: v.string(),
    monthlyCredits: v.number(),
    perRunCredits: v.number(),
    categories: v.array(v.string()),
    requiredChecks: v.array(v.string()),
    merge: v.boolean(),
  },
  handler: async (ctx, a) => {
    const repo = await ctx.db.get(a.repositoryId);
    ensure(repo, "FORBIDDEN", "Project unavailable.");
    const { actor } = await writeAccess(ctx, repo.organizationId, [
      "owner",
      "admin",
    ]);
    ensure(
      repo.enabled && repo.confirmed,
      "CONTEXT_REQUIRED",
      "Confirm this project's context first.",
    );
    const values = policyInput.parse({
      mode: a.mode,
      monthlyCredits: a.monthlyCredits,
      perRunCredits: a.perRunCredits,
      categories: a.categories,
      requiredChecks: a.requiredChecks,
      merge: a.merge,
    });
    ensure(
      !containsSecret(JSON.stringify(values)),
      "INVALID_INPUT",
      "Do not include private credentials.",
    );
    ensure(
      values.mode !== "routine" ||
        (process.env.CONTINUOUS_VERIFIED === "true" &&
          cloudExecutionAllowed(actor.subject)),
      "SETUP_REQUIRED",
      "Continuous operation needs its real integration acceptance before activation.",
    );
    const old = await ctx.db
      .query("improvementPolicies")
      .withIndex("by_repo", (q) => q.eq("repositoryId", repo._id))
      .unique();
    ensure(
      (old?.version ?? 0) === a.version,
      "APPROVAL_STALE",
      "Review the current project limits.",
    );
    const renewing = !!old && old.period !== month();
    if (renewing) {
      // A new month cannot erase unresolved work or any unknown provider cost.
      const holds = await ctx.db
        .query("reservations")
        .withIndex("by_org", (q) => q.eq("organizationId", repo.organizationId))
        .filter((q) => q.eq(q.field("state"), "active"))
        .take(1);
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_repository", (q) => q.eq("repositoryId", repo._id))
        .order("desc")
        .take(100);
      ensure(
        old.reserved === 0 &&
          holds.length === 0 &&
          runs.length < 100 &&
          !runs.some(
            (r) =>
              !["failed", "canceled"].includes(r.state) &&
              (!r.prNumber ||
                !["merged", "closed_unmerged"].includes(r.prState ?? "")),
          ),
        "COST_RECONCILIATION_REQUIRED",
        "Finish or reconcile earlier work before renewing monthly limits.",
      );
    }
    ensure(
      !old || renewing || values.monthlyCredits >= old.used + old.reserved,
      "BUDGET_EXCEEDED",
      "Keep the ceiling above already committed work.",
    );
    const now = Date.now(),
      fields = {
        ...values,
        organizationId: repo.organizationId,
        repositoryId: repo._id,
        actor: actor._id,
        version: a.version + 1,
        selectionVersion: repo.selectionVersion ?? 0,
        deploy: false,
        period: month(),
        used: renewing ? 0 : (old?.used ?? 0),
        reserved: renewing ? 0 : (old?.reserved ?? 0),
        expiresAt: now + 30 * 86400000,
        paused: values.mode !== "routine",
        status: values.mode === "routine" ? "active" : "paused",
        leaseKey: undefined,
        leaseUntil: undefined,
        updatedAt: now,
      };
    const id = old
      ? old._id
      : await ctx.db.insert("improvementPolicies", {
          ...fields,
          createdAt: now,
        });
    if (old) await ctx.db.patch(id, fields);
    await audit(
      ctx,
      repo.organizationId,
      actor._id,
      "improvement_policy_reviewed",
      id,
    );
    if (values.mode === "routine")
      await ctx.scheduler.runAfter(0, internal.improvementAutomation.tick, {
        id,
      });
    return id;
  },
});
export const pause = mutation({
  args: { repositoryId: v.id("repositories") },
  handler: async (ctx, a) => {
    const repo = await ctx.db.get(a.repositoryId);
    ensure(repo, "FORBIDDEN", "Project unavailable.");
    const { actor } = await writeAccess(ctx, repo.organizationId, [
      "owner",
      "admin",
    ]);
    const p = await ctx.db
      .query("improvementPolicies")
      .withIndex("by_repo", (q) => q.eq("repositoryId", repo._id))
      .unique();
    if (p) {
      await ctx.db.patch(p._id, {
        paused: true,
        version: p.version + 1,
        status: "paused",
        updatedAt: Date.now(),
      });
      await audit(
        ctx,
        repo.organizationId,
        actor._id,
        "improvement_policy_paused",
        p._id,
      );
    }
  },
});
export const categorize = mutation({
  args: { id: v.id("improvements"), version: v.number(), category: v.string() },
  handler: async (ctx, a) => {
    const i = await ctx.db.get(a.id);
    ensure(i, "FORBIDDEN", "Improvement unavailable.");
    await writeAccess(ctx, i.organizationId, ["owner", "admin"]);
    const p = await ctx.db.get(i.proposalId);
    ensure(
      i.version === a.version && p && (await improvementCurrent(ctx, p)),
      "APPROVAL_STALE",
      "Review the current plan.",
    );
    const plan = p.plan ?? p.planDraft;
    ensure(
      plan &&
        routineCategories.includes(a.category as any) &&
        routinePlanAllowed(plan, a.category, [a.category]),
      "POLICY_BLOCKED",
      "This plan needs individual approval because it affects protected or unsupported areas.",
    );
    await ctx.db.patch(i._id, {
      category: a.category,
      version: i.version + 1,
      updatedAt: Date.now(),
    });
  },
});
export const page = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: (ctx, a) =>
    ctx.db
      .query("improvementPolicies")
      .paginate({ cursor: a.cursor ?? null, numItems: 20 }),
});
export const claim = internalMutation({
  args: { id: v.id("improvementPolicies"), key: v.string() },
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.id);
    if (
      !p ||
      process.env.RESTORE_LOCK === "true" ||
      process.env.CONTINUOUS_VERIFIED !== "true" ||
      process.env.DISABLE_CONTINUOUS === "true" ||
      p.mode !== "routine" ||
      p.paused ||
      p.expiresAt <= Date.now() ||
      (p.leaseUntil ?? 0) > Date.now()
    )
      return null;
    const repo = await ctx.db.get(p.repositoryId),
      actor = await ctx.db.get(p.actor);
    if (
      !repo?.enabled ||
      (repo.selectionVersion ?? 0) !== p.selectionVersion ||
      !actor ||
      !cloudExecutionAllowed(actor.subject) ||
      !(await actorCurrent(ctx, p.organizationId, p.actor, ["owner", "admin"]))
    )
      return null;
    // The owner renews a monthly grant explicitly; unknown work is never reset by a calendar rollover.
    if (p.period !== month()) {
      await ctx.db.patch(p._id, {
        paused: true,
        status: "renew_limits",
        updatedAt: Date.now(),
      });
      return null;
    }
    await ctx.db.patch(p._id, {
      leaseKey: a.key,
      leaseUntil: Date.now() + 180000,
    });
    return { policy: p, repo };
  },
});
export const candidate = internalQuery({
  args: { id: v.id("improvementPolicies") },
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.id);
    if (!p) return null;
    const improvements = await ctx.db
      .query("improvements")
      .withIndex("by_repo", (q) => q.eq("repositoryId", p.repositoryId))
      .order("asc")
      .take(100);
    // One unfinished PR or worker, including manually approved jobs, blocks the next run.
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_repository", (q) => q.eq("repositoryId", p.repositoryId))
      .order("desc")
      .take(100);
    const active = runs.find(
      (r) =>
        !["failed", "canceled"].includes(r.state) &&
        (!r.prNumber ||
          !["merged", "closed_unmerged"].includes(r.prState ?? "")),
    );
    if (active)
      return active.automationPolicyId === p._id &&
        (await runPolicyCurrent(ctx, active))
        ? { run: active, improvement: null }
        : null;
    for (const i of improvements) {
      const proposal = await ctx.db.get(i.proposalId);
      if (
        !proposal ||
        proposal.privateEvaluationOrigin ||
        i.privateEvaluationOrigin ||
        runs.some((r) => r.proposalId === proposal._id) ||
        !(await improvementCurrent(ctx, proposal))
      )
        continue;
      const plan =
        proposal.plan ??
        (proposal.planDraftVersion === proposal.version
          ? proposal.planDraft
          : undefined);
      if (plan && routinePlanAllowed(plan, i.category, p.categories))
        return { run: null, improvement: i };
    }
    return null;
  },
});
export const start = internalMutation({
  args: {
    id: v.id("improvementPolicies"),
    key: v.string(),
    improvementId: v.id("improvements"),
  },
  handler: async (ctx, a) => {
    const policy = await ctx.db.get(a.id),
      i = await ctx.db.get(a.improvementId);
    ensure(
      policy &&
        i &&
        !i.privateEvaluationOrigin &&
        policy.leaseKey === a.key &&
        (policy.leaseUntil ?? 0) > Date.now() &&
        policy.repositoryId === i.repositoryId &&
        !policy.paused &&
        policy.mode === "routine" &&
        policy.expiresAt > Date.now(),
      "APPROVAL_STALE",
      "Project authority changed.",
    );
    const actor = await ctx.db.get(policy.actor);
    ensure(
      actor &&
        (await actorCurrent(ctx, policy.organizationId, policy.actor, [
          "owner",
          "admin",
        ])),
      "FORBIDDEN",
      "Project authority changed.",
    );
    const repo = await ctx.db.get(i.repositoryId);
    ensure(
      repo?.enabled && (repo.selectionVersion ?? 0) === policy.selectionVersion,
      "APPROVAL_STALE",
      "Project selection changed.",
    );
    const active = await ctx.db
      .query("runs")
      .withIndex("by_repository", (q) => q.eq("repositoryId", i.repositoryId))
      .take(100);
    ensure(
      !active.some(
        (r) =>
          !["failed", "canceled"].includes(r.state) &&
          (!r.prNumber ||
            !["merged", "closed_unmerged"].includes(r.prState ?? "")),
      ),
      "SOURCE_BUSY",
      "Another change is still in progress.",
    );
    let proposal = await ctx.db.get(i.proposalId);
    ensure(
      proposal &&
        !proposal.privateEvaluationOrigin &&
        (await improvementCurrent(ctx, proposal)),
      "APPROVAL_STALE",
      "Evidence changed.",
    );
    const plan =
      proposal.plan ??
      (proposal.planDraftVersion === proposal.version
        ? proposal.planDraft
        : undefined);
    ensure(
      plan && routinePlanAllowed(plan, i.category, policy.categories),
      "POLICY_BLOCKED",
      "This plan needs individual review.",
    );
    ensure(
      policy.period === month() &&
        policy.used + policy.reserved + policy.perRunCredits + 10 <=
          policy.monthlyCredits,
      "BUDGET_EXCEEDED",
      "The project has reached its ceiling.",
    );
    if (!proposal.plan) {
      await editPlanCore(ctx, {
        id: proposal._id,
        version: proposal.version,
        plan,
      });
      proposal = (await ctx.db.get(i.proposalId))!;
    }
    const id = await approveCore(
      ctx,
      {
        id: proposal._id,
        version: proposal.version,
        planHash: proposal.planHash!,
        baseSha: proposal.baseSha,
        executor: "cloud",
        fundingRoute: "managed_api",
        maxCredits: policy.perRunCredits,
        allowedPaths: plan.files.map((f: any) => f.path),
        highRisk: false,
      },
      { actor, membership: { role: "owner" } },
    );
    await reserve(
      ctx,
      policy.organizationId,
      `review:${id}:${policy.version}`,
      10,
    );
    await ctx.db.patch(id, {
      automationPolicyId: policy._id,
      automationPolicyVersion: policy.version,
      aiReview: {
        status: "reserved",
        key: `review:${id}:${policy.version}`,
        generation: 1,
        patchDigest: "",
        policyVersion: policy.version,
        note: "",
      },
    });
    await ctx.db.patch(policy._id, {
      used: policy.used + policy.perRunCredits + 10,
      status: "active",
      updatedAt: Date.now(),
    });
    return id;
  },
});
export const reviewStart = internalMutation({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    ensure(
      r &&
        (await runPolicyCurrent(ctx, r)) &&
        r.state === "awaiting_review" &&
        r.checksPassed &&
        !r.highRisk &&
        r.patch &&
        r.patch.length <= 60000,
      "POLICY_BLOCKED",
      "Passing checks and a bounded patch are required.",
    );
    if (r.aiReview?.status !== "reserved") return null;
    const hash = await digest(r.patch);
    const key = `review:${r._id}:${r.automationPolicyVersion}`;
    await ctx.db.patch(r._id, {
      aiReview: {
        status: "pending",
        key,
        generation: r.generation,
        patchDigest: hash,
        policyVersion: r.automationPolicyVersion!,
        note: "",
      },
    });
    return { run: r, proposal: await ctx.db.get(r.proposalId), key, hash };
  },
});
export const reviewFinish = internalMutation({
  args: {
    id: v.id("runs"),
    key: v.string(),
    credits: v.number(),
    retain: v.boolean(),
    passed: v.boolean(),
    note: v.string(),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r || r.aiReview?.key !== a.key || r.aiReview.status !== "pending")
      return;
    ensure(
      Number.isSafeInteger(a.credits) && a.credits >= 0 && a.credits <= 10,
      "BUDGET_EXCEEDED",
      "Review usage needs reconciliation.",
    );
    if (!a.retain) await settle(ctx, r.organizationId, a.key, a.credits);
    const current =
      (await runPolicyCurrent(ctx, r)) &&
      r.generation === r.aiReview.generation &&
      !!r.patch &&
      (await digest(r.patch)) === r.aiReview.patchDigest;
    await ctx.db.patch(r._id, {
      aiReview: {
        ...r.aiReview,
        status: a.retain
          ? "unknown"
          : current && a.passed
            ? "passed"
            : "blocked",
        credits: a.credits,
        note: containsSecret(a.note)
          ? "Review needs attention."
          : a.note.slice(0, 2000),
      },
      updatedAt: Date.now(),
    });
  },
});
export const publication = internalMutation({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    ensure(
      r?.patch && (await runPolicyCurrent(ctx, r)),
      "APPROVAL_STALE",
      "Project authority changed.",
    );
    return publicationCore(
      ctx,
      {
        id: r._id,
        generation: r.generation,
        patchDigest: await digest(r.patch),
      },
      true,
    );
  },
});
export const authorizedRun = internalQuery({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    ensure(
      r &&
        (await runPolicyCurrent(ctx, r)) &&
        r.aiReview?.status === "passed" &&
        r.aiReview.generation === r.generation &&
        r.aiReview.policyVersion === r.automationPolicyVersion &&
        r.patch &&
        r.aiReview.patchDigest === (await digest(r.patch)),
      "APPROVAL_STALE",
      "Current independent review is required.",
    );
    const p = await ctx.db.get(r.automationPolicyId!);
    const proposal = await ctx.db.get(r.proposalId);
    ensure(
      proposal && (await improvementCurrent(ctx, proposal)),
      "APPROVAL_STALE",
      "Evidence changed.",
    );
    return { run: r, policy: p!, repo: (await ctx.db.get(r.repositoryId))! };
  },
});
export const release = internalMutation({
  args: {
    id: v.id("improvementPolicies"),
    key: v.string(),
    status: v.string(),
  },
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.id);
    if (p?.leaseKey === a.key)
      await ctx.db.patch(p._id, {
        leaseKey: undefined,
        leaseUntil: 0,
        status: a.status,
        updatedAt: Date.now(),
      });
  },
});
export const mergeIntent = internalMutation({
  args: { id: v.id("runs"), head: v.string() },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    ensure(
      r &&
        !r.mergeIntent &&
        (await runPolicyCurrent(ctx, r)) &&
        r.aiReview?.status === "passed" &&
        r.prNumber &&
        !r.mergedAt &&
        /^[a-f0-9]{40}$/.test(a.head),
      "APPROVAL_STALE",
      "Merge authority changed or a prior result needs reconciliation.",
    );
    const p = await ctx.db.get(r.automationPolicyId!);
    const proposal = await ctx.db.get(r.proposalId);
    ensure(
      p?.merge && proposal && (await improvementCurrent(ctx, proposal)),
      "POLICY_BLOCKED",
      "Merging is not authorized.",
    );
    await ctx.db.patch(r._id, {
      mergeIntent: { head: a.head, state: "pending", at: Date.now() },
      updatedAt: Date.now(),
    });
  },
});
export const deploymentContext = internalQuery({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return null;
    const r = await ctx.db.get(a.id);
    if (!r?.mergedAt || !r.mergeCommitSha || r.deployment) return null;
    const repo = await ctx.db.get(r.repositoryId),
      p = await ctx.db.get(r.proposalId);
    if (
      !repo?.enabled ||
      !p?.improvementId ||
      !(await actorCurrent(ctx, r.organizationId, r.approvedBy, [
        "owner",
        "admin",
        "member",
      ]))
    )
      return null;
    return { run: r, repo };
  },
});
export const deploymentReceipt = internalMutation({
  args: {
    id: v.id("runs"),
    receipt: v.object({
      state: v.string(),
      commit: v.string(),
      url: v.string(),
      environment: v.string(),
      observedAt: v.number(),
    }),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    ensure(
      r?.mergedAt &&
        r.mergeCommitSha === a.receipt.commit &&
        a.receipt.state === "provider_verified" &&
        a.receipt.observedAt <= Date.now(),
      "INVALID_EVIDENCE",
      "Deployment receipt does not match the merged change.",
    );
    const url = new URL(a.receipt.url);
    ensure(
      url.protocol === "https:" && !containsSecret(a.receipt.url),
      "INVALID_EVIDENCE",
      "Deployment receipt is not public.",
    );
    await ctx.db.patch(r._id, { deployment: a.receipt, updatedAt: Date.now() });
  },
});
export const releaseUnusedReview = internalMutation({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (r?.aiReview?.status !== "reserved") return;
    if (
      ["failed", "canceled"].includes(r.state) ||
      !(await runPolicyCurrent(ctx, r))
    ) {
      await settle(ctx, r.organizationId, r.aiReview.key, 0);
      await ctx.db.patch(r._id, {
        aiReview: {
          ...r.aiReview,
          status: "not_started",
          note: "No review request was made.",
        },
      });
    }
  },
});
