import { mutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { writeAccess, limit } from "./lib";
import { ensure } from "../packages/policy";
import { repositoryAllowance } from "./lib/repositoryAllowance";
import { wallet } from "./product";
import { actorCurrent } from "./knowledge";
import { snapshotPaths } from "../packages/repositories/scope";
const choice = v.object({
  installationId: v.number(),
  providerId: v.number(),
  fullName: v.string(),
  snapshotPaths: v.optional(v.array(v.string())),
});
// Refreshing one project must not reselect or prepare the rest of a workspace.
export const startRefresh = mutation({
  args: {
    id: v.id("repositories"),
    expectedSha: v.string(),
    expectedSelectionVersion: v.number(),
  },
  returns: v.object({
    id: v.id("repositories"),
    organizationId: v.id("organizations"),
    actor: v.id("users"),
    installationId: v.number(),
    providerId: v.number(),
    fullName: v.string(),
    snapshotPaths: v.array(v.string()),
    selectionVersion: v.number(),
  }),
  handler: async (ctx, a) => {
    const repo = await ctx.db.get(a.id);
    ensure(repo?.enabled, "FORBIDDEN", "Project unavailable.");
    const { actor } = await writeAccess(ctx, repo.organizationId, [
      "owner",
      "admin",
    ]);
    ensure(
      repo.sha === a.expectedSha &&
        (repo.selectionVersion ?? 0) === a.expectedSelectionVersion,
      "APPROVAL_STALE",
      "Read the current project before refreshing its snapshot.",
    );
    ensure(
      !["preparing", "drafting_context"].includes(repo.status) &&
        !repo.profileDraftKey,
      "SOURCE_BUSY",
      "This project is already preparing. Check its status before refreshing.",
    );
    await limit(ctx, `repo-refresh:${repo._id}`, 10);
    const selectionVersion = (repo.selectionVersion ?? 0) + 1;
    await ctx.db.patch(repo._id, {
      selectionVersion,
      status: "preparing",
      preparationError: undefined,
      updatedAt: Date.now(),
    });
    return {
      id: repo._id,
      organizationId: repo.organizationId,
      actor: actor._id,
      installationId: repo.installationId,
      providerId: repo.providerId,
      fullName: repo.fullName,
      snapshotPaths: repo.snapshotPaths ?? [],
      selectionVersion,
    };
  },
});
export const save = mutation({
  args: {
    organizationId: v.id("organizations"),
    choices: v.array(choice),
    draftContext: v.boolean(),
    maxCredits: v.number(),
  },
  handler: async (ctx, a) => {
    const { actor } = await writeAccess(ctx, a.organizationId, [
      "owner",
      "admin",
    ]);
    await limit(ctx, `repo-selection:${a.organizationId}`, 10);
    const entitlement = await wallet(ctx, a.organizationId);
    ensure(
      a.choices.length <=
        repositoryAllowance(entitlement.tier, actor.subject) &&
        new Set(a.choices.map((r) => r.providerId)).size === a.choices.length,
      "REPOSITORY_LIMIT",
      "Choose repositories within the existing allowance.",
    );
    const bindings = await ctx.db
      .query("githubBindings")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
    const connection = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) =>
        q.eq("organizationId", a.organizationId).eq("provider", "github"),
      )
      .unique();
    ensure(
      connection?.status === "connected",
      "FORBIDDEN",
      "Reconnect GitHub first.",
    );
    for (const c of a.choices)
      ensure(
        bindings.some(
          (b) =>
            b.status === "connected" &&
            b.installationId === c.installationId &&
            b.repositories.some(
              (r) => r.id === c.providerId && r.fullName === c.fullName,
            ),
        ),
        "FORBIDDEN",
        "Choose only currently authorized identities.",
      );
    const old = await ctx.db
      .query("repositories")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
    // Validate every requested scope before changing selection or starting provider work.
    const choices = a.choices.map((c) => ({
      ...c,
      snapshotPaths: snapshotPaths(
        c.snapshotPaths ??
          old.find((r) => r.providerId === c.providerId)?.snapshotPaths ??
          [],
      ),
    }));
    const draftCount = a.draftContext
      ? a.choices.filter(
          (c) => !old.find((r) => r.providerId === c.providerId)?.confirmed,
        ).length
      : 0;
    ensure(
      a.maxCredits === draftCount * 10,
      "QUOTE_CHANGED",
      "Review the snapshot/context batch quote. Confirmed profiles are preserved.",
    );
    const result = [];
    for (const r of old)
      if (!a.choices.some((c) => c.providerId === r.providerId)) {
        await ctx.db.patch(r._id, {
          enabled: false,
          selectionVersion: (r.selectionVersion ?? 0) + 1,
          updatedAt: Date.now(),
        });
        await ctx.scheduler.runAfter(
          0,
          internal.repositorySelection.invalidate,
          { repositoryId: r._id, cursor: null },
        );
      }
    for (const c of choices) {
      const previous = old.find((r) => r.providerId === c.providerId);
      const selectionVersion = (previous?.selectionVersion ?? 0) + 1;
      let id;
      if (previous) {
        id = previous._id;
        const scopeChanged =
          JSON.stringify(previous.snapshotPaths ?? []) !==
          JSON.stringify(c.snapshotPaths);
        await ctx.db.patch(id, {
          ...c,
          enabled: true,
          selectionVersion,
          status: "preparing",
          preparationError: undefined,
          ...(scopeChanged
            ? {
                profileDraft: undefined,
                profileDraftSha: undefined,
                profileDraftVersion: undefined,
              }
            : {}),
          updatedAt: Date.now(),
        });
      } else
        id = await ctx.db.insert("repositories", {
          ...c,
          organizationId: a.organizationId,
          selectionVersion,
          enabled: true,
          status: "preparing",
          sha: "",
          branch: "",
          profile:
            "purpose: unknown\n\naudience: unknown\n\nstage: unknown\n\ngoals: unknown\n\nbusinessModel: unknown\n\nconstraints: unknown\n\nnonGoals: unknown",
          profileVersion: 1,
          confirmed: false,
          manifest: [],
          context: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      result.push({
        id,
        ...c,
        selectionVersion,
        draftContext: a.draftContext && !previous?.confirmed,
        actor: actor._id,
      });
    }
    return result;
  },
});
import { internalMutation } from "./lib/projectedMutations";
export const preparationState = internalMutation({
  args: {
    id: v.id("repositories"),
    actor: v.id("users"),
    version: v.number(),
    state: v.union(
      v.literal("drafting_context"),
      v.literal("connected"),
      v.literal("needs_attention"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const repo = await ctx.db.get(a.id);
    if (
      !repo?.enabled ||
      repo.selectionVersion !== a.version ||
      !(await actorCurrent(ctx, repo.organizationId, a.actor, [
        "owner",
        "admin",
      ]))
    )
      return;
    await ctx.db.patch(repo._id, {
      status: a.state,
      preparationError: a.state === "needs_attention" ? a.error : undefined,
      updatedAt: Date.now(),
    });
  },
});
export const invalidate = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const repo = await ctx.db.get(a.repositoryId);
    if (!repo) return;
    const page = await ctx.db
      .query("proposals")
      .withIndex("by_org", (q) => q.eq("organizationId", repo.organizationId))
      .paginate({ cursor: a.cursor, numItems: 50 });
    for (const p of page.page)
      if (p.repositoryId === repo._id)
        await ctx.db.patch(p._id, {
          review: "needs_context",
          planHash: undefined,
        });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.repositorySelection.invalidate, {
        ...a,
        cursor: page.continueCursor,
      });
  },
});
