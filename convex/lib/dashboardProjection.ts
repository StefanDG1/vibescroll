import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { WithoutSystemFields } from "convex/server";
import { projectPostSource } from "./postSummary";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
export type DashboardEntity = "sources" | "repositories" | "proposals" | "runs";
type Entity = Doc<DashboardEntity>;

async function fields(
  table: DashboardEntity,
  row: Entity,
): Promise<WithoutSystemFields<Doc<"dashboardCards">> | null> {
  const base = {
    organizationId: row.organizationId,
    entityId: row._id,
    title:
      "title" in row
        ? row.title.slice(0, 200)
        : "fullName" in row
          ? row.fullName.slice(0, 200)
          : "Project work",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (table === "sources" && "rightsAttested" in row) {
    if (row.state === "deleted") return null;
    const insights = Array.isArray(row.analysis?.insights)
      ? row.analysis.insights
      : [];
    return {
      ...base,
      kind: "source",
      state: row.state,
      sourceId: row._id,
      sourceKind: row.kind,
      sourceAuthorityVersion: 2,
      sourceRetentionUntil: row.sourceRetentionUntil,
      creatorRights: row.creatorRights,
      coverage: row.coverage,
      generation: row.generation,
      rightsAttested: row.rightsAttested,
      insightCount: insights.length,
      insightIds: insights
        .slice(0, 128)
        .flatMap((i: { id?: unknown }) =>
          typeof i?.id === "string" ? [i.id.slice(0, 200)] : [],
        ),
      mainPoints: insights
        .slice(0, 3)
        .flatMap((i: { title?: unknown }) =>
          typeof i?.title === "string" ? [i.title.slice(0, 140)] : [],
        ),
      postSummary: await projectPostSource(row),
    };
  }
  if (table === "repositories" && "fullName" in row)
    return {
      ...base,
      kind: "repository",
      state: row.enabled
        ? row.confirmed
          ? "confirmed"
          : "needs_context"
        : "disabled",
      repositoryId: row._id,
      enabled: row.enabled,
      confirmed: row.confirmed,
      sha: row.sha,
      profileVersion: row.profileVersion,
      selectionVersion: row.selectionVersion ?? 0,
    };
  if (table === "proposals" && "review" in row)
    return {
      ...base,
      kind: "proposal",
      state: row.review,
      review: row.review,
      sourceId: row.sourceId,
      repositoryId: row.repositoryId,
      version: row.version,
      baseSha: row.baseSha,
      profileVersion: row.profileVersion,
      references: row.references?.slice(0, 128),
      ...(row.references && row.references.length > 128
        ? { state: "stale", review: "stale" }
        : {}),
    };
  if (table === "runs" && "approvedBy" in row)
    return {
      ...base,
      kind: "run",
      state: row.state,
      repositoryId: row.repositoryId,
      proposalId: row.proposalId,
    };
  return null;
}

export async function syncDashboardCard(
  ctx: MutationCtx,
  table: DashboardEntity,
  id: string,
  row: Entity | null,
) {
  const existing = await ctx.db
    .query("dashboardCards")
    .withIndex("by_entity", (q) => q.eq("entityId", id))
    .unique();
  const card = row ? await fields(table, row) : null;
  if (!card) {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }
  if (existing) {
    const { _id, _creationTime, ...stored } = existing;
    // Skip identical projected metadata; progress updates retain row.updatedAt.
    if (canonicalJson(stored) !== canonicalJson(card))
      await ctx.db.replace(existing._id, card);
  } else await ctx.db.insert("dashboardCards", card);
}
