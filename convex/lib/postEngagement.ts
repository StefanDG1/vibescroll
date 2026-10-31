import { ShardedCounter } from "@convex-dev/sharded-counter";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const engagementEnabled = () =>
  process.env.POST_ENGAGEMENT_ENABLED === "true";
export const engagementCounter = () =>
  new ShardedCounter(components.shardedCounter, { defaultShards: 16 });
export const privatePostKey = (sourceId: Id<"sources">) =>
  `private:${sourceId}`;
export const sharedPostKey = (familyId: Id<"catalogFamilies">) =>
  `shared:${familyId}`;
export const engagementRow = (
  ctx: QueryCtx,
  userId: Id<"users">,
  key: string,
) =>
  ctx.db
    .query("postEngagement")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
    .unique();

// Trusted callers have already authorized the Save/cache association. No input
// from a model can supply the actor, shared family or a successful-save receipt.
export async function recordPostSave(
  ctx: MutationCtx,
  source: Doc<"sources">,
  userId: Id<"users">,
) {
  if (!engagementEnabled()) return;
  const layer = source.publicImportId
    ? await ctx.db.get(source.publicImportId)
    : null;
  const shared =
    layer &&
    "origin" in layer &&
    layer.origin === "cloud" &&
    layer.sourceId === source._id &&
    layer.organizationId === source.organizationId &&
    layer.sourceGeneration === source.generation;
  const key = shared
    ? sharedPostKey(layer.familyId)
    : privatePostKey(source._id);
  const privateKey = privatePostKey(source._id);
  let row = await engagementRow(ctx, userId, key);
  const former = shared ? await engagementRow(ctx, userId, privateKey) : null;
  const counter = engagementCounter();
  if (former) {
    if (former.liked) await counter.dec(ctx, `${privateKey}:likes`);
    if (former.saved) await counter.dec(ctx, `${privateKey}:saves`);
    if (!row) {
      const { _id: _formerId, _creationTime, ...values } = former;
      const id = await ctx.db.insert("postEngagement", {
        ...values,
        key,
        updatedAt: Date.now(),
      });
      row = (await ctx.db.get(id))!;
      if (row.liked) await counter.inc(ctx, `${key}:likes`);
      if (row.saved) await counter.inc(ctx, `${key}:saves`);
    } else if (former.likeUpdatedAt > row.likeUpdatedAt) {
      if (former.liked !== row.liked)
        await counter.add(ctx, `${key}:likes`, former.liked ? 1 : -1);
      const preference = {
        liked: former.liked,
        likeUpdatedAt: former.likeUpdatedAt,
        revision: Math.max(row.revision, former.revision) + 1,
        lastKey: former.lastKey,
        lastExpectedRevision: former.lastExpectedRevision,
        updatedAt: Date.now(),
      };
      await ctx.db.patch(row._id, preference);
      row = { ...row, ...preference };
    }
    // Preserve the most recent explicit preference, with global winning ties.
    // A stale private like must not resurrect a later global Unlike.
    await ctx.db.delete(former._id);
  }
  if (row?.saved) {
    if (
      former?.savedAt !== undefined &&
      (row.savedAt ?? Infinity) > former.savedAt
    )
      await ctx.db.patch(row._id, { savedAt: former.savedAt });
    return;
  }
  const savedAt = former?.savedAt ?? Date.now();
  if (row)
    await ctx.db.patch(row._id, {
      saved: true,
      savedAt,
      updatedAt: Date.now(),
    });
  else
    await ctx.db.insert("postEngagement", {
      userId,
      key,
      saved: true,
      savedAt,
      liked: false,
      revision: 0,
      likeUpdatedAt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  await counter.inc(ctx, `${key}:saves`);
}

export async function removeEngagement(
  ctx: MutationCtx,
  row: Doc<"postEngagement">,
) {
  const counter = engagementCounter();
  if (row.liked) await counter.dec(ctx, `${row.key}:likes`);
  if (row.saved) await counter.dec(ctx, `${row.key}:saves`);
  await ctx.db.delete(row._id);
}
