import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { excerptHash } from "../../packages/sources/evidence";
import { queryRead } from "./knowledgeReadContext";
import { ensure } from "../../packages/policy";

export const moderationReasons = [
  "copyright",
  "privacy",
  "inaccuracy",
  "abuse",
] as const;
export function moderationReason(
  value: string | undefined,
): value is (typeof moderationReasons)[number] {
  return moderationReasons.some((reason) => reason === value);
}
// Old removal records have no durable restriction. Until they are normalized,
// publication and public reuse fail closed. Every lookup is indexed and finite.
export async function legacyModerationPending(ctx: QueryCtx) {
  return queryRead(ctx, "legacy-public-moderation", async () => {
    if (
      await ctx.db
        .query("publicReports")
        .withIndex("by_state_block", (q) =>
          q.eq("state", "removed").eq("moderationBlockId", undefined),
        )
        .first()
    )
      return true;
    for (const reason of moderationReasons)
      if (
        await ctx.db
          .query("publicEditions")
          .withIndex("by_moderation_pending", (q) =>
            q.eq("removalReason", reason).eq("moderationBlockId", undefined),
          )
          .first()
      )
        return true;
    return false;
  });
}
export async function publicModerationBlocked(
  ctx: QueryCtx,
  source: Pick<Doc<"sources">, "_id" | "canonical" | "organizationId">,
  publisher: Id<"users">,
) {
  if (await legacyModerationPending(ctx)) return true;
  const canonicalHash = await excerptHash(source.canonical);
  for (const row of await Promise.all([
    ctx.db
      .query("publicModerationBlocks")
      .withIndex("by_source_state", (q) =>
        q.eq("sourceId", source._id).eq("state", "active"),
      )
      .first(),
    ctx.db
      .query("publicModerationBlocks")
      .withIndex("by_publisher_canonical_state", (q) =>
        q
          .eq("publisher", publisher)
          .eq("canonicalHash", canonicalHash)
          .eq("state", "active"),
      )
      .first(),
    ctx.db
      .query("publicModerationBlocks")
      .withIndex("by_org_canonical_state", (q) =>
        q
          .eq("organizationId", source.organizationId)
          .eq("canonicalHash", canonicalHash)
          .eq("state", "active"),
      )
      .first(),
  ]))
    if (row) return true;
  return false;
}
export async function recordModerationBlock(
  ctx: MutationCtx,
  edition: Doc<"publicEditions">,
  report: Doc<"publicReports">,
  moderator: Id<"users">,
  canonicalHash: string,
) {
  const old = await ctx.db
    .query("publicModerationBlocks")
    .withIndex("by_source_publisher_state", (q) =>
      q
        .eq("sourceId", edition.sourceId)
        .eq("publisher", edition.actor)
        .eq("state", "active"),
    )
    .first();
  const now = Date.now();
  if (old) {
    await ctx.db.patch(old._id, {
      version: old.version + 1,
      moderator,
      reportId: report._id,
      reason: report.reason as (typeof moderationReasons)[number],
      updatedAt: now,
    });
    return old._id;
  }
  return ctx.db.insert("publicModerationBlocks", {
    origin: "moderator_remove",
    organizationId: edition.organizationId,
    publisher: edition.actor,
    sourceId: edition.sourceId,
    canonicalHash,
    reportId: report._id,
    reason: report.reason as (typeof moderationReasons)[number],
    state: "active",
    version: 1,
    moderator,
    createdAt: now,
    updatedAt: now,
  });
}

// Called before destructive source/workspace cleanup, and by the bounded
// migration. A missing legacy actor/report is represented as unknown, never as
// a fabricated decision. Missing canonical identity requires explicit repair.
export async function preserveLegacyEditionModeration(
  ctx: MutationCtx,
  edition: Doc<"publicEditions">,
  source?: Doc<"sources"> | null,
) {
  const report = await ctx.db
    .query("publicReports")
    .withIndex("by_edition_state", (q) =>
      q.eq("editionId", edition._id).eq("state", "removed"),
    )
    .first();
  const blockId = edition.moderationBlockId ?? report?.moderationBlockId;
  if (blockId) {
    const block = await ctx.db.get(blockId);
    ensure(
      block &&
        block.sourceId === edition.sourceId &&
        block.organizationId === edition.organizationId &&
        block.publisher === edition.actor,
      "MODERATION_REPAIR_REQUIRED",
      "Recover the original moderation identity before deleting content.",
    );
    if (!edition.moderationBlockId)
      await ctx.db.patch(edition._id, { moderationBlockId: blockId });
    if (report && !report.moderationBlockId)
      await ctx.db.patch(report._id, { moderationBlockId: blockId });
    return;
  }
  const reason = moderationReason(edition.removalReason)
    ? edition.removalReason
    : report?.reason;
  if (!moderationReason(reason)) return;
  source ??= await ctx.db.get(edition.sourceId);
  ensure(
    source &&
      source.organizationId === edition.organizationId &&
      (!report || report.organizationId === edition.organizationId),
    "MODERATION_REPAIR_REQUIRED",
    "Recover the original moderation identity before deleting content.",
  );
  const old = await ctx.db
    .query("publicModerationBlocks")
    .withIndex("by_source_publisher_state", (q) =>
      q
        .eq("sourceId", edition.sourceId)
        .eq("publisher", edition.actor)
        .eq("state", "active"),
    )
    .first();
  const id =
    old?._id ??
    (await ctx.db.insert("publicModerationBlocks", {
      origin: "legacy_removal",
      organizationId: edition.organizationId,
      publisher: edition.actor,
      sourceId: edition.sourceId,
      canonicalHash: await excerptHash(source.canonical),
      reason,
      state: "active",
      version: 1,
      ...(report ? { reportId: report._id } : {}),
      ...(report?.reviewedBy ? { moderator: report.reviewedBy } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
  await ctx.db.patch(edition._id, { moderationBlockId: id });
  if (report) await ctx.db.patch(report._id, { moderationBlockId: id });
}
