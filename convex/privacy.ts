import { clearRepositoryContent } from "./lib/repositoryContent";
import { internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { invoiceDeadline } from "../packages/policy";
import { redactSource } from "./product";
import { queueDeletion } from "./assets";
import { sweepExpiredServiceArtifacts } from "./lib/serviceArtifacts";
import { sweepCreatorRetention } from "./creators";
export const receipt = internalMutation({
  args: { provider: v.string(), key: v.string() },
  handler: async (ctx, a) => {
    if (
      await ctx.db
        .query("webhookReceipts")
        .withIndex("by_key", (q) =>
          q.eq("provider", a.provider).eq("key", a.key),
        )
        .unique()
    )
      return;
    await ctx.db.insert("webhookReceipts", {
      ...a,
      at: Date.now(),
      state: "reconciled",
    });
  },
});
export const invoiceTask = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    invoiceId: v.string(),
    issuedAt: v.number(),
  },
  handler: async (ctx, a) => {
    const tasks = await ctx.db
      .query("invoiceTasks")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
    if (tasks.some((t) => t.invoiceId === a.invoiceId)) return;
    const holidays = JSON.parse(process.env.RO_REVIEWED_HOLIDAYS_JSON ?? "[]");
    const dueAt = invoiceDeadline(
      a.issuedAt,
      holidays,
      process.env.RO_CALENDAR_REVIEWED === "true",
    );
    await ctx.db.insert("invoiceTasks", {
      organizationId: a.organizationId,
      invoiceId: a.invoiceId,
      dueAt,
      state: "pending_submission",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.RESTORE_LOCK === "true") return;
    await sweepExpiredServiceArtifacts(ctx);
    await sweepCreatorRetention(ctx);
    for (const stage of await ctx.db
      .query("mediaStages")
      .withIndex("by_updated", (q) =>
        q.lt("updatedAt", Date.now() - 7 * 86400000),
      )
      .take(100))
      await ctx.db.delete(stage._id);
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_expiry", (q) =>
        q.gt("expiresAt", 0).lt("expiresAt", Date.now()),
      )
      .take(100);
    for (const asset of assets) {
      await ctx.db.patch(asset._id, { state: "deleting", expiresAt: 0 });
      await queueDeletion(ctx, asset.key);
    }
    for (const section of ["tombstones", "repositories", "runs"] as const)
      await ctx.scheduler.runAfter(0, internal.privacy.retentionPage, {
        section,
        cursor: null,
      });
    for (const job of await ctx.db
      .query("objectDeletions")
      .withIndex("by_state", (q) => q.eq("state", "pending"))
      .take(100)) {
      await ctx.db.patch(job._id, {
        attempts: job.attempts + 1,
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.integrations.deleteObject, {
        key: job.key,
      });
    }
  },
});

export const retentionPage = internalMutation({
  args: {
    section: v.union(
      v.literal("tombstones"),
      v.literal("repositories"),
      v.literal("runs"),
    ),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true")
      return { isDone: false, continueCursor: a.cursor ?? "", paused: true };
    const result = await ctx.db
      .query(a.section)
      .paginate({ cursor: a.cursor, numItems: 5 });
    for (const row of result.page) {
      if ("target" in row) {
        const id = ctx.db.normalizeId("sources", row.target);
        if (!id) continue;
        const source = await ctx.db.get(id);
        // Bind tombstone ownership as well as the target ID before restore redaction.
        if (
          source &&
          source.organizationId === row.organizationId &&
          source.state !== "deleted"
        )
          await redactSource(ctx, id);
      } else if ("context" in row) {
        if (
          (row.context || row.contentStored) &&
          (row.snapshotAt ?? row.updatedAt) < Date.now() - 86400000
        ) {
          await clearRepositoryContent(ctx, row._id);
          await ctx.db.patch(row._id, {
            context: "",
            contextTree: "",
            contextFiles: [],
            contextExcerpts: [],
          });
        }
      } else if (
        row.updatedAt < Date.now() - 14 * 86400000 &&
        ["completed", "failed", "canceled"].includes(row.state) &&
        (row.events.length > 0 ||
          row.patch !== undefined ||
          row.changes !== undefined ||
          row.report !== undefined)
      ) {
        await ctx.db.patch(row._id, {
          events: [],
          patch: undefined,
          changes: undefined,
          report: undefined,
        });
      }
    }
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.privacy.retentionPage, {
        section: a.section,
        cursor: result.continueCursor,
      });
    return { isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
