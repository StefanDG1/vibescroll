import { query } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { access, fail } from "./lib";
import { v } from "convex/values";
import { syncDashboardCard } from "./lib/dashboardProjection";
import type { Doc } from "./_generated/dataModel";
import { cardSourceRetained } from "./lib/sourceAuthority";
const migrationName = "dashboard-v1";
const tables = ["sources", "repositories", "proposals", "runs"] as const;

// Operator-only, resumable and bounded. Never changes original evidence or
// versions and never queues inference. Concurrent writes use atomic triggers.
export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.RESTORE_LOCK === "true") fail("Recovery is locked.");
    let checkpoint = await ctx.db
      .query("dashboardMigrations")
      .withIndex("by_name", (q) => q.eq("name", migrationName))
      .unique();
    if (!checkpoint) {
      const id = await ctx.db.insert("dashboardMigrations", {
        name: migrationName,
        table: 0,
        cursor: null,
        complete: false,
        updatedAt: Date.now(),
      });
      checkpoint = (await ctx.db.get(id))!;
    }
    if (checkpoint.complete) return { complete: true };
    const table = tables[checkpoint.table];
    const page = await ctx.db
      .query(table)
      .paginate({ cursor: checkpoint.cursor, numItems: 10 });
    for (const row of page.page)
      await syncDashboardCard(ctx, table, row._id, row);
    const next = checkpoint.table + Number(page.isDone);
    const complete = next === tables.length;
    await ctx.db.patch(checkpoint._id, {
      table: next,
      cursor: page.isDone ? null : page.continueCursor,
      complete,
      updatedAt: Date.now(),
    });
    if (!complete)
      await ctx.scheduler.runAfter(0, internal.dashboard.backfill, {});
    return { complete, processed: page.page.length, table };
  },
});

export const home = query({
  args: {
    organizationId: v.id("organizations"),
    preview: v.optional(v.boolean()),
  },
  handler: async (ctx, { organizationId, preview }) => {
    const { organization, membership } = await access(ctx, organizationId);
    const migration = await ctx.db
      .query("dashboardMigrations")
      .withIndex("by_name", (q) => q.eq("name", migrationName))
      .unique();
    if (!migration?.complete || (!migration.enabled && !preview))
      return { ready: false as const };
    const pages = await Promise.all(
      (["source", "repository", "proposal", "run"] as const).map((kind) =>
        ctx.db
          .query("dashboardCards")
          .withIndex("by_org_kind_updated", (q) =>
            q.eq("organizationId", organizationId).eq("kind", kind),
          )
          .order("desc")
          .take(31),
      ),
    );
    const [sourceRows, repositories, proposals, runs] = pages.map((rows) =>
      rows.slice(0, 30),
    );
    const retention = new Map<string, boolean>();
    const retained = async (row: Doc<"dashboardCards">) => {
      if (!retention.has(row.entityId))
        retention.set(row.entityId, await cardSourceRetained(ctx, row));
      return retention.get(row.entityId)!;
    };
    const sources = [];
    for (const row of sourceRows) if (await retained(row)) sources.push(row);
    const cache = new Map<string, Doc<"dashboardCards"> | null>(
      pages.flat().map((row) => [row.entityId, row]),
    );
    let remainingReads = 128;
    const card = async (id: string) => {
      if (!cache.has(id)) {
        if (remainingReads-- <= 0) return null;
        cache.set(
          id,
          await ctx.db
            .query("dashboardCards")
            .withIndex("by_entity", (q) => q.eq("entityId", id))
            .unique(),
        );
      }
      const result = cache.get(id);
      return result?.organizationId === organizationId ? result : null;
    };
    const current = [];
    let remainingReferences = 128;
    for (const p of proposals) {
      // Legacy ideas remain in the ordinary review list. Home recommends only
      // ideas with exact evidence versions it can independently validate.
      if (
        !p.references?.length ||
        p.references.some((ref) => "schemaVersion" in ref)
      )
        continue;
      const repo = p.repositoryId && (await card(p.repositoryId));
      if (
        !repo ||
        !repo.enabled ||
        !repo.confirmed ||
        repo.sha !== p.baseSha ||
        repo.profileVersion !== p.profileVersion ||
        p.state === "stale"
      )
        continue;
      let valid = true;
      for (const r of p.references ?? []) {
        if (remainingReferences-- <= 0) {
          valid = false;
          break;
        }
        const s = await card(r.sourceId);
        if (
          !s ||
          s.state !== "ready" ||
          !s.rightsAttested ||
          !(await retained(s)) ||
          s.generation !== r.generation ||
          s.updatedAt !== r.revision ||
          !s.insightIds?.includes(r.insightId)
        ) {
          valid = false;
          break;
        }
      }
      if (valid) current.push(p);
    }
    // Return only display fields. Reference/version fences and private source
    // metadata used above remain inside the authorized backend query.
    const display = (row: Doc<"dashboardCards">) => ({
      _id: row.entityId,
      title: row.title,
      state: row.state,
      review: row.review,
      fullName: row.kind === "repository" ? row.title : undefined,
      enabled: row.enabled,
      confirmed: row.confirmed,
    });
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(30);
    return {
      ready: true as const,
      compact: true as const,
      role: membership.role,
      workspaceName: organization.name,
      privateLibrary: Boolean(organization.privateOwnerId),
      sources: sources.map(display),
      repositories: repositories.map(display),
      proposals: current.map(display),
      runs: runs.map(display),
      notifications: notifications.map(({ _id, read }) => ({ _id, read })),
      usage: null,
      libraryNext: pages[0].length > 30 ? "more" : null,
    };
  },
});

export const setEnabled = internalMutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    if (process.env.RESTORE_LOCK === "true") fail("Recovery is locked.");
    const checkpoint = await ctx.db
      .query("dashboardMigrations")
      .withIndex("by_name", (q) => q.eq("name", migrationName))
      .unique();
    if (!checkpoint?.complete) fail("Finish the metadata backfill first.");
    await ctx.db.patch(checkpoint._id, { enabled, updatedAt: Date.now() });
    return { enabled };
  },
});
