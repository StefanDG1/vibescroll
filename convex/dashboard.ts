import { query } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { access, fail } from "./lib";
import { v } from "convex/values";
import { syncDashboardCard } from "./lib/dashboardProjection";
import type { Doc } from "./_generated/dataModel";
import { cardSourceRetained } from "./lib/sourceAuthority";
import { postSummaryFromCard, postRevision } from "./lib/postSummary";
import {
  homeSummaryV1,
  postProgressPageV1,
  type PostSummaryV1,
} from "../packages/contracts/post-summary";
import { ensure } from "../packages/policy";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
const migrationName = "dashboard-v1";
const tables = ["sources", "repositories", "proposals", "runs"] as const;

async function dashboardScopeKey(a: Awaited<ReturnType<typeof access>>) {
  return postRevision({
    actor: a.actor._id,
    organization: a.organization._id,
    privateOwner: a.organization.privateOwnerId,
    membership: a.membership._id,
    role: a.membership.role,
  });
}

export async function dashboardProgress(
  ctx: QueryCtx,
  a: { organizationId: Id<"organizations">; sourceIds: Id<"sources">[] },
) {
  const authorization = await access(ctx, a.organizationId);
  ensure(
    a.sourceIds.length <= 30 &&
      new Set(a.sourceIds).size === a.sourceIds.length,
    "INVALID_INPUT",
    "Choose up to thirty distinct visible posts.",
  );
  const asOf = Date.now();
  const items = [],
    unavailableSourceIds = [];
  for (const id of a.sourceIds) {
    const card = await ctx.db
      .query("dashboardCards")
      .withIndex("by_entity", (q) => q.eq("entityId", id))
      .unique();
    const summary =
      card?.organizationId === a.organizationId
        ? await postSummaryFromCard(card, asOf)
        : null;
    if (summary) items.push(summary.progress);
    else unavailableSourceIds.push(id);
  }
  return postProgressPageV1.parse({
    version: "post-progress-page-v1",
    organizationId: a.organizationId,
    scopeKey: await dashboardScopeKey(authorization),
    asOf,
    items,
    unavailableSourceIds,
  });
}
export const progress = query({
  args: {
    organizationId: v.id("organizations"),
    sourceIds: v.array(v.id("sources")),
  },
  returns: v.any(),
  handler: dashboardProgress,
});

// Operator-only, resumable and bounded. Never changes original evidence or
// versions and never queues inference. Concurrent writes use atomic triggers.
export const backfill = internalMutation({
  args: { refreshPosts: v.optional(v.boolean()) },
  handler: async (ctx, { refreshPosts }) => {
    if (process.env.RESTORE_LOCK === "true") fail("Recovery is locked.");
    const name = refreshPosts ? "dashboard-post-summary-v1" : migrationName;
    const migrationTables = refreshPosts ? (["sources"] as const) : tables;
    let checkpoint = await ctx.db
      .query("dashboardMigrations")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (!checkpoint) {
      const id = await ctx.db.insert("dashboardMigrations", {
        name,
        table: 0,
        cursor: null,
        complete: false,
        updatedAt: Date.now(),
      });
      checkpoint = (await ctx.db.get(id))!;
    }
    if (checkpoint.complete) return { complete: true };
    const table = migrationTables[checkpoint.table];
    const page = await ctx.db
      .query(table)
      .paginate({ cursor: checkpoint.cursor, numItems: 10 });
    for (const row of page.page)
      await syncDashboardCard(ctx, table, row._id, row);
    const next = checkpoint.table + Number(page.isDone);
    const complete = next === migrationTables.length;
    await ctx.db.patch(checkpoint._id, {
      table: next,
      cursor: page.isDone ? null : page.continueCursor,
      complete,
      updatedAt: Date.now(),
    });
    if (!complete)
      await ctx.scheduler.runAfter(
        0,
        internal.dashboard.backfill,
        refreshPosts ? { refreshPosts: true } : {},
      );
    return { complete, processed: page.page.length, table };
  },
});

export async function dashboardHome(
  ctx: QueryCtx,
  {
    organizationId,
    preview,
  }: { organizationId: Id<"organizations">; preview?: boolean },
) {
  const authorization = await access(ctx, organizationId);
  const { organization, membership } = authorization;
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
  const asOf = Date.now();
  const postSummaries: PostSummaryV1[] = [];
  for (const row of sources) {
    const summary = await postSummaryFromCard(row, asOf);
    if (summary) postSummaries.push(summary);
  }
  const snapshot = {
    version: "home-summary-v1" as const,
    organizationId,
    scopeKey: await dashboardScopeKey(authorization),
    recent: postSummaries,
    hasMoreRecent: pages[0].length > 30,
    projectionComplete:
      postSummaries.length === sources.length &&
      postSummaries.every((row) => row.projection === "complete"),
    counts: {
      coverage: "loaded-window" as const,
      posts: postSummaries.length,
      ready: postSummaries.filter((row) => row.progress.state === "ready")
        .length,
      active: postSummaries.filter((row) => row.progress.active).length,
      needsAttention: postSummaries.filter(
        (row) =>
          row.progress.state === "failed" ||
          row.progress.executionState === "unknown",
      ).length,
    },
  };
  const homeSnapshot = homeSummaryV1.parse({
    ...snapshot,
    asOf,
    revision: await postRevision(snapshot),
  });
  return {
    ready: true as const,
    compact: true as const,
    role: membership.role,
    workspaceName: organization.name,
    privateLibrary: Boolean(organization.privateOwnerId),
    sources: sources.map(display),
    postSummaries,
    homeSnapshot,
    repositories: repositories.map(display),
    proposals: current.map(display),
    runs: runs.map(display),
    notifications: notifications.map(({ _id, read }) => ({ _id, read })),
    usage: null,
    libraryNext: pages[0].length > 30 ? "more" : null,
  };
}
export const home = query({
  args: {
    organizationId: v.id("organizations"),
    preview: v.optional(v.boolean()),
  },
  handler: dashboardHome,
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
