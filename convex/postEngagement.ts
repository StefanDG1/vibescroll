import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { access, limit } from "./lib";
import { ensure } from "../packages/policy";
import { readablePostKey, readPostEngagement } from "./lib/postEngagementRead";
import {
  engagementEnabled,
  engagementCounter,
  engagementRow,
  privatePostKey,
  removeEngagement,
} from "./lib/postEngagement";

async function readableKey(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  sourceId: Id<"sources">,
) {
  const source = await ctx.db.get(sourceId);
  ensure(
    source &&
      source.organizationId === organizationId &&
      source.state === "ready",
    "SOURCE_UNAVAILABLE",
    "Post unavailable.",
  );
  return readablePostKey(ctx, source);
}

const target = {
  organizationId: v.id("organizations"),
  sourceIds: v.array(v.id("sources")),
};
const state = v.object({
  scopeKey: v.string(),
  sourceId: v.id("sources"),
  likes: v.number(),
  shares: v.number(),
  liked: v.boolean(),
  revision: v.number(),
});
export const read = query({
  args: target,
  returns: v.union(v.array(state), v.null()),
  handler: async (ctx, { organizationId, sourceIds }) => {
    const { actor } = await access(ctx, organizationId);
    ensure(
      sourceIds.length <= 3 && new Set(sourceIds).size === sourceIds.length,
      "INVALID_INPUT",
      "Read at most three distinct visible posts.",
    );
    if (!engagementEnabled()) return null;
    return Promise.all(
      sourceIds.map(async (sourceId) => {
        const source = await ctx.db.get(sourceId);
        ensure(
          source?.organizationId === organizationId,
          "SOURCE_UNAVAILABLE",
          "Post unavailable.",
        );
        return readPostEngagement(ctx, source, actor._id);
      }),
    );
  },
});

export const setLike = mutation({
  args: {
    organizationId: v.id("organizations"),
    sourceId: v.id("sources"),
    liked: v.boolean(),
    expectedRevision: v.number(),
    key: v.string(),
  },
  returns: v.object({
    scopeKey: v.string(),
    liked: v.boolean(),
    revision: v.number(),
    replayed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { actor } = await access(ctx, args.organizationId, [
      "owner",
      "admin",
      "member",
    ]);
    ensure(engagementEnabled(), "SETUP_REQUIRED", "Likes are unavailable.");
    ensure(
      /^[A-Za-z0-9_-]{8,64}$/.test(args.key) &&
        Number.isSafeInteger(args.expectedRevision) &&
        args.expectedRevision >= 0,
      "INVALID_INPUT",
      "Use the current reaction revision and a stable request key.",
    );
    const key = await readableKey(ctx, args.organizationId, args.sourceId);
    const row = await engagementRow(ctx, actor._id, key);
    if (row?.lastKey === args.key) {
      ensure(
        row.lastExpectedRevision === args.expectedRevision &&
          row.liked === args.liked,
        "IDEMPOTENCY_CONFLICT",
        "This key identifies another reaction.",
      );
      return {
        scopeKey: key,
        liked: row.liked,
        revision: row.revision,
        replayed: true,
      };
    }
    ensure(
      (row?.revision ?? 0) === args.expectedRevision,
      "APPROVAL_STALE",
      "Your reaction changed. Read its current state before trying again.",
    );
    await limit(ctx, `post-like:${actor._id}`, 120);
    const revision = (row?.revision ?? 0) + 1;
    if ((row?.liked ?? false) !== args.liked)
      await engagementCounter().add(ctx, `${key}:likes`, args.liked ? 1 : -1);
    const fields = {
      liked: args.liked,
      likeUpdatedAt: Date.now(),
      revision,
      lastKey: args.key,
      lastExpectedRevision: args.expectedRevision,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, fields);
    else
      await ctx.db.insert("postEngagement", {
        userId: actor._id,
        key,
        saved: false,
        createdAt: Date.now(),
        ...fields,
      });
    return { scopeKey: key, liked: args.liked, revision, replayed: false };
  },
});

export const retirePrivate = internalMutation({
  args: { sourceId: v.id("sources") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const key = privatePostKey(sourceId);
    const rows = await ctx.db
      .query("postEngagement")
      .withIndex("by_key", (q) => q.eq("key", key))
      .take(51);
    const page = rows.slice(0, 50);
    for (const row of page) await removeEngagement(ctx, row);
    if (rows.length > 50)
      await ctx.scheduler.runAfter(0, internal.postEngagement.retirePrivate, {
        sourceId,
      });
    else if (page.length) {
      await engagementCounter().reset(ctx, `${key}:likes`);
      await engagementCounter().reset(ctx, `${key}:saves`);
    }
    return null;
  },
});
