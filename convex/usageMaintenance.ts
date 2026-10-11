import { internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { storeRepositoryContent } from "./lib/repositoryContent";
import { storageUsage } from "./lib/storageUsage";
import { storeRepositoryManifest } from "./lib/repositoryManifest";
import { syncDashboardCard } from "./lib/dashboardProjection";

// Resumable source-only projection upgrade. Atomic triggers maintain new writes
// while legacy cards continue to use canonical source checks until upgraded.
export const projectSourceAuthority = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const page = await ctx.db.query("sources").paginate({
      cursor: a.cursor ?? null,
      numItems: 10,
      maximumBytesRead: 524288,
    });
    for (const source of page.page)
      await syncDashboardCard(ctx, "sources", source._id, source);
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.usageMaintenance.projectSourceAuthority,
        { cursor: page.continueCursor },
      );
    return { isDone: page.isDone, visited: page.page.length };
  },
});

// Explicitly run after the compatible backend deploy. Each transaction moves
// at most one repository, retains its authority and never invokes inference.
export const compactRepositories = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const page = await ctx.db
      .query("repositories")
      .paginate({ numItems: 1, cursor: a.cursor ?? null });
    for (const repo of page.page) {
      if (!repo.manifestStored)
        await storeRepositoryManifest(ctx, repo, {
          manifest: repo.manifest,
          manifestEntries: repo.manifestEntries,
        });
      if (
        !repo.contentStored &&
        (repo.context || repo.contextExcerpts?.length || repo.contextTree)
      )
        await storeRepositoryContent(ctx, repo, {
          context: repo.context,
          contextTree: repo.contextTree,
          contextExcerpts: repo.contextExcerpts,
        });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.usageMaintenance.compactRepositories,
        { cursor: page.continueCursor },
      );
    return { isDone: page.isDone, visited: page.page.length };
  },
});

export const initializeStorage = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    return (await storageUsage(ctx, a.organizationId)).bytes;
  },
});

// Empty deployments should not start Node actions just to discover no work.
export const reconcileBilling = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.RESTORE_LOCK === "true" || !process.env.STRIPE_SECRET_KEY)
      return;
    if (!(await ctx.db.query("billing").first())) return;
    // With V1 configured, the legacy action delegates every customer to the
    // same V1 reconciler. Start that reconciler once; preserve legacy behavior.
    if (!process.env.STRIPE_V1_WEBHOOK_SECRET)
      await ctx.scheduler.runAfter(0, internal.payments.reconcile, {});
    await ctx.scheduler.runAfter(0, internal.reconciliation.allBilling, {});
  },
});
export const reconcilePRs = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.RESTORE_LOCK === "true") return;
    if (
      !(await ctx.db
        .query("runs")
        .withIndex("by_state", (q) => q.eq("state", "completed"))
        .first())
    )
      return;
    await ctx.scheduler.runAfter(0, internal.integrations.reconcilePRs, {});
  },
});

export const recoverImprovements = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.RESTORE_LOCK === "true") return;
    // Paused/expired policies still need unused-review reservation cleanup.
    if (!(await ctx.db.query("improvementPolicies").first())) return;
    await ctx.scheduler.runAfter(0, internal.improvementAutomation.recover, {});
  },
});
export const recoverLibraryScans = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.RESTORE_LOCK === "true") return;
    if (
      !(await ctx.db
        .query("libraryScans")
        .withIndex("by_state", (q) => q.eq("state", "running"))
        .first())
    )
      return;
    await ctx.scheduler.runAfter(0, internal.libraryScanWorker.recover, {});
  },
});
