import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { queueDeletion } from "./assets";
import { rememberDeletion } from "./lib/deletionMarkers";
export const deletionJob = internalQuery({
  args: { jobId: v.id("deletionJobs") },
  handler: (ctx, { jobId }) => ctx.db.get(jobId),
});
export const purgeOrganization = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const org = await ctx.db.get(organizationId);
    if (!org || org.status !== "deleting") return;
    await rememberDeletion(ctx, "workspace", organizationId);
    const received = await ctx.db
      .query("teamKnowledgeGrants")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientOrganizationId", organizationId),
      )
      .take(100);
    for (const grant of received) await ctx.db.delete(grant._id);
    if (received.length === 100) {
      await ctx.scheduler.runAfter(0, internal.maintenance.purgeOrganization, {
        organizationId,
      });
      return;
    }
    for (const table of [
      "publicEditions",
      "publicCollections",
      "publicReports",
      "publicCorrections",
      "publicArtifacts",
      "publicImports",
      "publicGeography",
      "analysisAttempts",
      "analysisVersions",
      "analysisEvidence",
      "sourceRevisions",
      "sourceAcquisitions",
      "sourceRelationships",
      "pilotPaymentObservations",
      "assistantDeliveries",
      "assistantSubscriptions",
      "assistantIntakes",
      "assistantGrants",
      "teamKnowledgeGrants",
      "librarySetup",
      "sourceSpaces",
      "dashboardCards",
      "improvements",
      "improvementOutcomes",
      "improvementPolicies",
      "improvementPreferences",
      "libraryScans",
      "subscriptionTrials",
      "localLibraryRuns",
      "localSourceImports",
      "knowledgePolicies",
      "knowledgeTopics",
      "knowledgeMembers",
      "knowledgeJobs",
      "knowledgeEvaluations",
      "issueDrafts",
      "issueAttempts",
      "creditPools",
      "sourceCounts",
      "mediaStages",
      "billingChanges",
      "githubBindings",
      "matchingJobs",
      "githubLinks",
      "assets",
      "storageUsage",
      "sources",
      "workspaceCategories",
      "sourceCategories",
      "categorySuggestions",
      "repositories",
      "repositoryContent",
      "repositoryManifests",
      "proposals",
      "runs",
      "wallets",
      "reservations",
      "outbox",
      "connections",
      "devices",
      "feedback",
      "notifications",
      "preferences",
      "projects",
      "memberships",
      "invitations",
      "billing",
      "audit",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .take(100);
      for (const row of rows) {
        if (table === "assets") await queueDeletion(ctx, (row as any).key);
        await ctx.db.delete(row._id);
      }
      if (rows.length === 100) {
        await ctx.scheduler.runAfter(
          0,
          internal.maintenance.purgeOrganization,
          { organizationId },
        );
        return;
      }
    }
    await ctx.db.delete(organizationId);
  },
});
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const batches = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_processed", (q) =>
          q.lt("processedAt", Date.now() - 30 * 86400000),
        )
        .take(200),
      ctx.db
        .query("limits")
        .withIndex("by_window", (q) =>
          q.lt("window", Math.floor(Date.now() / 60000) - 60),
        )
        .take(200),
      ctx.db
        .query("invitations")
        .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
        .take(200),
    ]);
    for (const rows of batches)
      for (const row of rows) await ctx.db.delete(row._id);
    if (batches.some((rows) => rows.length === 200))
      await ctx.scheduler.runAfter(0, internal.maintenance.cleanup, {});
  },
});
