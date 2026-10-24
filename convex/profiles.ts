import { workspaceReadable } from "./lib/workspacePrivacy";
import { repositoryContent } from "./lib/repositoryContent";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { writeAccess, fail, audit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import { reserve, settle } from "./product";
import { internal } from "./_generated/api";
import { snapshotScopeCurrent } from "../packages/repositories/scope";
import { BUSINESS_CONTEXT_VERSION } from "../packages/repositories/business-context";
export const saveDraft = mutation({
  args: {
    id: v.id("repositories"),
    sha: v.string(),
    version: v.number(),
    selectionVersion: v.optional(v.number()),
    previousDraft: v.string(),
    profile: v.string(),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    ensure(r?.enabled, "FORBIDDEN", "Repository unavailable.");
    const { actor } = await writeAccess(ctx, r.organizationId, [
      "owner",
      "admin",
    ]);
    ensure(
      r.sha === a.sha &&
        (r.selectionVersion ?? 0) === (a.selectionVersion ?? 0) &&
        r.profileVersion === a.version &&
        snapshotScopeCurrent(r) &&
        (r.profileDraft ?? "") === a.previousDraft,
      "APPROVAL_STALE",
      "Review the current repository/context version and saved draft.",
    );
    ensure(
      !r.profileDraftKey,
      "SOURCE_BUSY",
      "Reconcile the pending context request before editing its draft.",
    );
    ensure(
      a.profile.trim().length > 0 &&
        a.profile.length <= 8000 &&
        !containsSecret(a.profile),
      "POLICY_BLOCKED",
      "Use a nonempty context draft within 8,000 characters, without secrets.",
    );
    await ctx.db.patch(r._id, {
      profileDraft: a.profile,
      profileDraftSha: a.sha,
      profileDraftVersion: a.version,
      profileDraftProcessingVersion: BUSINESS_CONTEXT_VERSION,
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      r.organizationId,
      actor._id,
      "repository.context_draft_saved",
      r._id,
    );
    return { saved: true };
  },
});

export const confirmDraft = mutation({
  args: {
    id: v.id("repositories"),
    sha: v.string(),
    version: v.number(),
    selectionVersion: v.optional(v.number()),
    profile: v.string(),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    ensure(r?.enabled, "FORBIDDEN", "Repository unavailable.");
    await writeAccess(ctx, r.organizationId, ["owner", "admin"]);
    ensure(
      r.sha === a.sha &&
        (r.selectionVersion ?? 0) === (a.selectionVersion ?? 0) &&
        r.profileVersion === a.version &&
        a.profile.length > 0 &&
        a.profile.length <= 8000 &&
        !containsSecret(a.profile),
      "APPROVAL_STALE",
      "Review the current repository/context version.",
    );
    await ctx.db.patch(r._id, {
      profile: a.profile,
      confirmed: true,
      profileVersion: r.profileVersion + 1,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.repositorySelection.invalidate, {
      repositoryId: r._id,
      cursor: null,
    });
  },
});

export const start = mutation({
  args: { id: v.id("repositories"), key: v.string(), maxCredits: v.number() },
  handler: async (ctx, a) => {
    const repo = await repositoryContent(ctx, await ctx.db.get(a.id));
    if (!repo) fail("Repository unavailable.");
    const { actor } = await writeAccess(ctx, repo.organizationId, [
      "owner",
      "admin",
    ]);
    ensure(
      repo.enabled &&
        !!repo.contextExcerpts?.length &&
        snapshotScopeCurrent(repo),
      "CONTEXT_REQUIRED",
      "Refresh an enabled repository snapshot before drafting.",
    );
    ensure(
      a.maxCredits === 10 && /^[a-zA-Z0-9_-]{12,80}$/.test(a.key),
      "QUOTE_CHANGED",
      "Review the 10-credit profile quote.",
    );
    if (
      repo.profileDraft &&
      repo.profileDraftSha === repo.sha &&
      repo.profileDraftVersion === repo.profileVersion &&
      repo.profileDraftProcessingVersion === BUSINESS_CONTEXT_VERSION
    )
      return { repo, cached: true, key: "", reviewHistory: [] };
    ensure(
      !repo.profileDraftKey,
      "SOURCE_BUSY",
      "A profile draft is already processing. An interrupted attempt requires reconciliation.",
    );
    const key = `profile:${repo._id}:${a.key}`;
    await reserve(ctx, repo.organizationId, key, 10);
    await ctx.db.patch(repo._id, {
      profileDraftKey: key,
      profileDraftActor: actor._id,
      profileDraftSelectionVersion: repo.selectionVersion ?? 0,
      updatedAt: Date.now(),
    });
    const history = await ctx.db
      .query("knowledgeEvaluations")
      .withIndex("by_repo", (q) => q.eq("repositoryId", repo._id))
      .order("desc")
      .take(10);
    const reviewHistory = history
      .filter(
        (e) =>
          e.organizationId === repo.organizationId &&
          !e.privateEvaluationOrigin &&
          ["rejected", "deferred"].includes(e.decision),
      )
      .map((e) => ({
        decision: e.decision,
        title: String(e.output?.title ?? "").slice(0, 160),
        note: String(e.output?.rationale ?? "").slice(0, 400),
      }));
    const preferences = await ctx.db
      .query("improvementPreferences")
      .withIndex("by_org", (q) => q.eq("organizationId", repo.organizationId))
      .unique();
    return {
      repo,
      cached: false,
      key,
      reviewHistory,
      ownerPreferences: preferences?.note ?? "",
    };
  },
});

export const finish = internalMutation({
  args: {
    id: v.id("repositories"),
    organizationId: v.id("organizations"),
    key: v.string(),
    sha: v.string(),
    version: v.number(),
    selectionVersion: v.optional(v.number()),
    profile: v.optional(v.string()),
    credits: v.number(),
    retainReservation: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const repo = await repositoryContent(ctx, await ctx.db.get(a.id));
    if (
      !repo ||
      repo.organizationId !== a.organizationId ||
      repo.profileDraftKey !== a.key
    )
      return;
    ensure(
      Number.isSafeInteger(a.credits) && a.credits >= 0 && a.credits <= 10,
      "BUDGET_EXCEEDED",
      "Profile usage exceeded its approval.",
    );
    ensure(
      a.profile === undefined ||
        (a.profile.length <= 8000 && !containsSecret(a.profile)),
      "POLICY_BLOCKED",
      "Invalid profile draft.",
    );
    const actor = repo.profileDraftActor
      ? await ctx.db.get(repo.profileDraftActor)
      : null;
    const membership = actor
      ? await ctx.db
          .query("memberships")
          .withIndex("by_pair", (q) =>
            q.eq("organizationId", repo.organizationId).eq("userId", actor._id),
          )
          .unique()
      : null;
    const organization = await ctx.db.get(repo.organizationId);
    const current =
      repo.enabled &&
      repo.sha === a.sha &&
      (repo.selectionVersion ?? 0) === (a.selectionVersion ?? 0) &&
      repo.profileVersion === a.version &&
      actor?.status === "active" &&
      workspaceReadable(organization, actor._id) &&
      membership &&
      ["owner", "admin"].includes(membership.role);
    if (!a.retainReservation)
      await settle(ctx, a.organizationId, a.key, a.credits);
    await ctx.db.patch(repo._id, {
      profileDraftKey: a.retainReservation ? repo.profileDraftKey : undefined,
      profileDraftActor: a.retainReservation
        ? repo.profileDraftActor
        : undefined,
      profileDraftSelectionVersion: a.retainReservation
        ? repo.profileDraftSelectionVersion
        : undefined,
      ...(current && a.profile !== undefined
        ? {
            profileDraft: a.profile,
            profileDraftSha: a.sha,
            profileDraftVersion: a.version,
            profileDraftProcessingVersion: BUSINESS_CONTEXT_VERSION,
          }
        : {}),
      updatedAt: Date.now(),
    });
    return { saved: !!current && a.profile !== undefined };
  },
});
