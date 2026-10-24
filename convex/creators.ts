import { query } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { captureAuthorized, digest as hash } from "./product";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { scrubUnusableBase } from "./sourceAcquisition";
import { access, writeAccess, limit, audit } from "./lib";
import { ensure } from "../packages/policy";
import {
  socialCreatorUrl,
  socialPostUrl,
} from "../packages/social/identity.mjs";
import {
  discoveredPostSchema,
  selectDiscoveredPosts,
  digestDay,
} from "../packages/social/discovery";
import {
  creatorConfiguration,
  creatorPermission,
  creatorPolicyCanonical,
  creatorRightsCurrent,
  creatorBounds,
} from "./lib/creatorPolicy";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { queueDeletion } from "./assets";
import { sourceRetained } from "./lib/sourceAuthority";
import insightSchema from "../contracts/insight.schema.json";
import sourceInsightSchema from "../contracts/source-insight-v2.schema.json";

const digestSourceStates = new Set([
  "saved",
  "needs_upload",
  "queued",
  "processing",
  "ready",
  "failed",
]);
const digestSourceCoverage = new Set<string>([
  ...insightSchema.properties.coverage.enum,
  sourceInsightSchema.properties.coverage.const,
  "ordered_media",
]);

async function postRecipientCapacity(
  ctx: QueryCtx,
  postId: Id<"creatorPosts">,
) {
  const existing = await ctx.db
    .query("creatorDeliveries")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .take(creatorBounds.recipients + 1);
  ensure(
    existing.length < creatorBounds.recipients,
    "QUOTA_EXCEEDED",
    "This post reached the reviewed lifetime recipient bound.",
  );
}

async function recipientCapacity(
  ctx: QueryCtx,
  watchId: Id<"creatorWatches">,
  current?: Id<"creatorSubscriptions">,
) {
  const active = await ctx.db
    .query("creatorSubscriptions")
    .withIndex("by_watch", (q) =>
      q.eq("watchId", watchId).eq("state", "active"),
    )
    .take(creatorBounds.recipients + 1);
  ensure(
    active.filter((row) => row._id !== current).length <
      creatorBounds.recipients,
    "QUOTA_EXCEEDED",
    "This creator reached the reviewed global recipient limit.",
  );
}

async function owned(ctx: QueryCtx, organizationId: Id<"organizations">) {
  const authorization = await access(ctx, organizationId);
  ensure(
    authorization.organization.privateOwnerId === authorization.actor._id,
    "FORBIDDEN",
    "Creator follows are private to their owner.",
  );
  return authorization;
}
async function subscription(
  ctx: MutationCtx,
  id: Id<"creatorSubscriptions">,
  expectedVersion: number,
) {
  const row = await ctx.db.get(id);
  ensure(row, "NOT_FOUND", "Follow unavailable.");
  const authorization = await owned(ctx, row.organizationId);
  ensure(
    row.actor === authorization.actor._id && row.version === expectedVersion,
    "APPROVAL_STALE",
    "Reload this follow before changing it.",
  );
  await limit(ctx, `creator-follow:${authorization.actor._id}`, 30);
  return { row, authorization };
}
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    const { actor } = await owned(ctx, a.organizationId);
    const page = await ctx.db
      .query("creatorSubscriptions")
      .withIndex("by_owner", (q) =>
        q.eq("organizationId", a.organizationId).eq("actor", actor._id),
      )
      .order("desc")
      .paginate({ cursor: a.cursor, numItems: 20 });
    const items = await Promise.all(
      page.page.map(async (row) => {
        const watch = row.watchId ? await ctx.db.get(row.watchId) : null;
        const permission =
          watch && creatorPermission(watch.platform, watch.creatorId);
        return {
          ...row,
          operational: Boolean(
            row.state === "active" && watch?.state === "active" && permission,
          ),
          discovery: watch
            ? {
                lastCheckedAt: watch.lastCheckedAt ?? null,
                incomplete: watch.incomplete,
              }
            : null,
        };
      }),
    );
    return {
      items,
      next: page.isDone ? null : page.continueCursor,
      providerAvailable: creatorConfiguration() !== null,
      explanation:
        "Daily discovery requires verified provider rights and a reserved service budget. Analysis needs separate processing authority. Pending follows do not start paid work.",
    };
  },
});
export const follow = mutation({
  args: {
    organizationId: v.id("organizations"),
    profileUrl: v.string(),
    mode: v.union(v.literal("future"), v.literal("latest10")),
    maxAssets: v.number(),
    maxVideoMs: v.number(),
    route: v.union(
      v.literal("own_subscription"),
      v.literal("managed_api"),
      v.literal("save_only"),
    ),
    timezone: v.string(),
    digestHour: v.number(),
    rightsAttested: v.boolean(),
  },
  handler: async (ctx, a) => {
    const authorization = await owned(ctx, a.organizationId);
    await writeAccess(ctx, a.organizationId);
    await limit(ctx, `creator-follow:${authorization.actor._id}`, 30);
    ensure(
      a.rightsAttested &&
        Number.isSafeInteger(a.maxAssets) &&
        a.maxAssets >= 1 &&
        a.maxAssets <= 350 &&
        Number.isSafeInteger(a.maxVideoMs) &&
        a.maxVideoMs >= 0 &&
        a.maxVideoMs <= 6_000_000 &&
        Number.isInteger(a.digestHour) &&
        a.digestHour >= 0 &&
        a.digestHour <= 23 &&
        a.timezone.length <= 80,
      "INVALID_INPUT",
      "Review creator access and post/asset/minute limits.",
    );
    try {
      digestDay(Date.now(), a.timezone);
    } catch {
      throw Error("INVALID_TIMEZONE");
    }
    const profile = socialCreatorUrl(a.profileUrl);
    const old = await ctx.db
      .query("creatorSubscriptions")
      .withIndex("by_profile", (q) =>
        q
          .eq("organizationId", a.organizationId)
          .eq("actor", authorization.actor._id)
          .eq("canonical", profile.canonical),
      )
      .unique();
    if (old && !["unfollowed", "quarantined"].includes(old.state))
      return old._id;
    const rows = await ctx.db
      .query("creatorSubscriptions")
      .withIndex("by_owner", (q) =>
        q
          .eq("organizationId", a.organizationId)
          .eq("actor", authorization.actor._id),
      )
      .take(101);
    ensure(
      rows.filter((r) => !["unfollowed", "quarantined"].includes(r.state))
        .length < 100,
      "QUOTA_EXCEEDED",
      "Follow limit reached.",
    );
    const watch = await ctx.db
      .query("creatorWatches")
      .withIndex("by_profile", (q) => q.eq("canonical", profile.canonical))
      .unique();
    const now = Date.now(),
      operational = Boolean(
        watch &&
        watch.state === "active" &&
        creatorPermission(profile.platform, watch.creatorId),
      );
    if (operational) await recipientCapacity(ctx, watch!._id, old?._id);
    const fields = {
      organizationId: a.organizationId,
      actor: authorization.actor._id,
      canonical: profile.canonical,
      platform: profile.platform,
      watchId: watch?._id,
      version: (old?.version ?? 0) + 1,
      state: operational ? ("active" as const) : ("pending" as const),
      cutoff: now,
      mode: a.mode,
      maxAssets: a.maxAssets,
      maxVideoMs: a.maxVideoMs,
      route: a.route,
      timezone: a.timezone,
      digestHour: a.digestHour,
      rightsAttested: true,
      updatedAt: now,
    };
    if (old) {
      await ctx.db.patch(old._id, {
        ...fields,
        catchUpSince: undefined,
        lastDigestDay: undefined,
      });
      return old._id;
    }
    const id = await ctx.db.insert("creatorSubscriptions", {
      ...fields,
      createdAt: now,
    });
    await audit(
      ctx,
      a.organizationId,
      authorization.actor._id,
      "creator_follow_requested",
      id,
    );
    return id;
  },
});
export const change = mutation({
  args: {
    id: v.id("creatorSubscriptions"),
    expectedVersion: v.number(),
    action: v.union(
      v.literal("pause"),
      v.literal("resume"),
      v.literal("unfollow"),
      v.literal("catch_up"),
    ),
    catchUpSince: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const { row, authorization } = await subscription(
      ctx,
      a.id,
      a.expectedVersion,
    );
    ensure(
      row.state !== "quarantined",
      "POLICY_BLOCKED",
      "Restored follows require a fresh follow request.",
    );
    const now = Date.now();
    if (a.action === "catch_up")
      ensure(
        row.state === "active" &&
          a.catchUpSince !== undefined &&
          Number.isSafeInteger(a.catchUpSince) &&
          a.catchUpSince >= now - 30 * 86400000 &&
          a.catchUpSince <= now,
        "INVALID_INPUT",
        "Catch-up is limited to the previous 30 days and the approved asset/minute bounds.",
      );
    const watch = row.watchId
      ? await ctx.db.get(row.watchId)
      : await ctx.db
          .query("creatorWatches")
          .withIndex("by_profile", (q) => q.eq("canonical", row.canonical))
          .unique();
    const active =
      watch &&
      watch.state !== "quarantined" &&
      creatorPermission(watch.platform, watch.creatorId);
    const state =
      a.action === "unfollow"
        ? ("unfollowed" as const)
        : a.action === "pause"
          ? ("paused" as const)
          : active
            ? ("active" as const)
            : ("pending" as const);
    if (state === "active") await recipientCapacity(ctx, watch!._id, row._id);
    await ctx.db.patch(row._id, {
      state,
      watchId: watch?._id,
      version: row.version + 1,
      cutoff:
        a.action === "resume" && row.state !== "pending" ? now : row.cutoff,
      catchUpSince: a.action === "catch_up" ? a.catchUpSince : undefined,
      updatedAt: now,
    });
    if (state === "active" && watch?.state === "paused")
      await ctx.db.patch(watch._id, {
        state: "active",
        nextCheckAt: now,
        updatedAt: now,
      });
    if (a.action === "unfollow") {
      // Delivery reads recheck the subscription immediately; bounded cleanup can follow.
      const deliveries = await ctx.db
        .query("creatorDeliveries")
        .withIndex("by_subscription", (q) => q.eq("subscriptionId", row._id))
        .take(100);
      for (const delivery of deliveries)
        if (delivery.state === "pending")
          await ctx.db.patch(delivery._id, {
            state: "withdrawn",
            reason: "unfollowed",
            updatedAt: now,
          });
    }
    if ((a.action === "unfollow" || a.action === "pause") && watch) {
      const remaining = await ctx.db
        .query("creatorSubscriptions")
        .withIndex("by_watch", (q) =>
          q.eq("watchId", watch._id).eq("state", "active"),
        )
        .first();
      if (!remaining)
        await ctx.db.patch(watch._id, {
          state: "paused",
          generation: watch.generation + 1,
          lease: undefined,
          leaseUntil: undefined,
          updatedAt: now,
        });
    }
    await audit(
      ctx,
      row.organizationId,
      authorization.actor._id,
      `creator_${a.action}`,
      row._id,
    );
    return { version: row.version + 1, state };
  },
});

// Only a provider action with separately reserved discovery may resolve identity.
// This internal operation neither fetches media nor starts an inference job.
export const resolve = internalMutation({
  args: {
    profileUrl: v.string(),
    creatorId: v.string(),
    provider: v.string(),
    rightsEvidenceId: v.string(),
  },
  handler: async (ctx, a) => {
    const profile = socialCreatorUrl(a.profileUrl);
    ensure(
      /^[a-zA-Z0-9_-]{1,100}$/.test(a.creatorId),
      "INVALID_INPUT",
      "Stable creator identity required.",
    );
    const policy = creatorPermission(profile.platform, a.creatorId);
    ensure(
      policy &&
        policy.provider === a.provider &&
        policy.rights.evidenceId === a.rightsEvidenceId,
      "POLICY_BLOCKED",
      "Provider collection approval is pending.",
    );
    const old = await ctx.db
      .query("creatorWatches")
      .withIndex("by_identity", (q) =>
        q.eq("platform", profile.platform).eq("creatorId", a.creatorId),
      )
      .unique();
    const byHandle = await ctx.db
      .query("creatorWatches")
      .withIndex("by_profile", (q) => q.eq("canonical", profile.canonical))
      .unique();
    ensure(
      !byHandle || byHandle._id === old?._id,
      "CREATOR_IDENTITY_CHANGED",
      "This handle now resolves to another creator. Review it before following.",
    );
    const now = Date.now();
    if (old) {
      await ctx.db.patch(old._id, {
        canonical: profile.canonical,
        provider: a.provider,
        rightsEvidenceId: a.rightsEvidenceId,
        version: old.version + 1,
        state: "active",
        updatedAt: now,
      });
      return old._id;
    }
    return ctx.db.insert("creatorWatches", {
      platform: profile.platform,
      creatorId: a.creatorId,
      canonical: profile.canonical,
      provider: a.provider,
      rightsEvidenceId: a.rightsEvidenceId,
      version: 1,
      generation: 0,
      state: "active",
      nextCheckAt: now,
      incomplete: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const digest = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    const { actor } = await owned(ctx, a.organizationId);
    const page = await ctx.db
      .query("creatorDeliveries")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .order("desc")
      .paginate({ cursor: a.cursor, numItems: 20 });
    const items = [];
    for (const row of page.page) {
      if (
        row.actor !== actor._id ||
        row.state === "withdrawn" ||
        row.state === "suppressed"
      )
        continue;
      const sub = await ctx.db.get(row.subscriptionId),
        post = await ctx.db.get(row.postId);
      if (
        !sub ||
        sub.actor !== actor._id ||
        sub.organizationId !== a.organizationId ||
        !["active", "paused"].includes(sub.state) ||
        !post ||
        sub.watchId !== post.watchId ||
        post.state !== "available" ||
        post.retainUntil <= Date.now() ||
        row.revisionKey !== post.revisionKey ||
        !post.rights ||
        !creatorRightsCurrent(post.rights)
      )
        continue;
      const watch = await ctx.db.get(post.watchId);
      if (
        !watch ||
        watch.platform !== sub.platform ||
        post.rights.platform !== watch.platform ||
        post.rights.creatorId !== watch.creatorId ||
        !creatorPermission(watch.platform, watch.creatorId)
      )
        continue;
      const source = row.sourceId ? await ctx.db.get(row.sourceId) : null;
      if (
        row.sourceId &&
        (!source ||
          source.organizationId !== a.organizationId ||
          source.state === "deleted" ||
          !source.rightsAttested ||
          !sourceRetained(source) ||
          (source.creatorRights &&
            (source.creatorRights.platform !== watch.platform ||
              source.creatorRights.creatorId !== watch.creatorId)) ||
          !digestSourceStates.has(source.state))
      )
        continue;
      if (source) {
        try {
          if (
            !source.url ||
            socialPostUrl(source.url).canonical !==
              socialPostUrl(post.canonical).canonical
          )
            continue;
        } catch {
          continue;
        }
      }
      const parsed = discoveredPostSchema.safeParse(post.metadata);
      if (!parsed.success) continue;
      const metadata = parsed.data;
      if (
        metadata.platform !== watch.platform ||
        metadata.creatorId !== watch.creatorId ||
        metadata.canonical !== post.canonical
      )
        continue;
      items.push({
        id: row._id,
        state: row.state,
        sourceId: row.sourceId ?? null,
        canonical: metadata.canonical,
        caption: metadata.caption.slice(0, 500),
        publishedAt: metadata.publishedAt,
        observedAt: metadata.observedAt,
        discoveredAt: post.observedAt,
        deliveredAt: row.createdAt,
        sourceStatus: source
          ? {
              state: source.state,
              coverage: digestSourceCoverage.has(source.coverage)
                ? source.coverage
                : null,
            }
          : null,
        mediaKinds: metadata.mediaKinds,
        assetCount: metadata.assetCount,
        revisionKey: row.revisionKey,
        timezone: sub.timezone,
        day: digestDay(row.createdAt, sub.timezone),
        incomplete: watch.incomplete,
        reason: row.reason ?? null,
      });
    }
    return { items, next: page.isDone ? null : page.continueCursor };
  },
});
export const suppress = mutation({
  args: { id: v.id("creatorDeliveries") },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.id);
    ensure(row, "NOT_FOUND", "Post unavailable.");
    const { actor } = await owned(ctx, row.organizationId);
    ensure(row.actor === actor._id, "FORBIDDEN", "Post unavailable.");
    await ctx.db.patch(row._id, {
      state: "suppressed",
      reason: "owner_suppressed",
      updatedAt: Date.now(),
    });
    return { state: "suppressed" as const };
  },
});

export async function writeCreatorPage(
  ctx: MutationCtx,
  watch: Doc<"creatorWatches">,
  values: unknown,
  complete: boolean,
  cursor: string | null,
  reservationKey: string,
) {
  const posts = z.array(discoveredPostSchema).max(10).parse(values);
  ensure(
    posts.every(
      (p) => p.creatorId === watch.creatorId && p.platform === watch.platform,
    ) &&
      (complete ? cursor === null : Boolean(cursor && cursor.length <= 2000)),
    "INVALID_DISCOVERY_PAGE",
    "Incomplete or mismatched discovery page.",
  );
  const policy = creatorPermission(watch.platform, watch.creatorId);
  ensure(
    policy &&
      policy.provider === watch.provider &&
      policy.rights.evidenceId === watch.rightsEvidenceId,
    "POLICY_BLOCKED",
    "Creator permission changed.",
  );
  const now = Date.now();
  const rights = {
    platform: watch.platform,
    creatorId: watch.creatorId,
    provider: policy.provider,
    evidenceId: policy.rights.evidenceId,
    policyCanonical: creatorPolicyCanonical(policy),
    rightsHash: await hash(canonicalJson(policy.rights)),
    expiresAt: Math.min(policy.expiresAt, policy.rights.expiresAt),
    deletionWithinMs: policy.rights.deletionWithinMs,
  };
  for (const value of posts) {
    const old = await ctx.db
      .query("creatorPosts")
      .withIndex("by_identity", (q) =>
        q.eq("watchId", watch._id).eq("postId", value.postId),
      )
      .unique();
    if (old?.state === "removed") continue;
    const retainUntil = Math.min(
      now + policy.rights.maxRetentionMs,
      rights.expiresAt,
    );
    const postId =
      old?._id ??
      (await ctx.db.insert("creatorPosts", {
        watchId: watch._id,
        postId: value.postId,
        revisionKey: value.revisionKey,
        canonical: value.canonical,
        publishedAt: value.publishedAt ?? undefined,
        observedAt: now,
        metadata: { ...value, observedAt: now },
        state: "available",
        version: 1,
        retainUntil,
        rights,
        deliveryReservationKey: reservationKey,
        updatedAt: now,
      }));
    if (!old)
      await ctx.scheduler.runAt(retainUntil, internal.creators.expirePost, {
        postId,
      });
    if (old && old.revisionKey !== value.revisionKey)
      await ctx.db.patch(old._id, {
        revisionKey: value.revisionKey,
        metadata: value,
        version: old.version + 1,
        deliveryReservationKey: reservationKey,
        updatedAt: now,
      });
    if (!old || old.revisionKey !== value.revisionKey)
      await ctx.scheduler.runAfter(0, internal.creators.deliverPage, {
        postId,
        generation: watch.generation,
        revisionKey: value.revisionKey,
        reservationKey,
        page: 0,
        cursor: null,
      });
  }
  await ctx.db.patch(watch._id, {
    checkpoint: cursor ?? undefined,
    incomplete: !complete,
    lastCheckedAt: now,
    nextCheckAt: now + (complete ? 86400000 : 3600000),
    updatedAt: now,
  });
  return { observed: posts.length, complete };
}

export const deliverPage = internalMutation({
  args: {
    postId: v.id("creatorPosts"),
    generation: v.number(),
    revisionKey: v.string(),
    reservationKey: v.string(),
    page: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    const post = await ctx.db.get(a.postId),
      watch = post ? await ctx.db.get(post.watchId) : null;
    if (
      !post ||
      post.state !== "available" ||
      post.retainUntil <= Date.now() ||
      !post.rights ||
      !creatorRightsCurrent(post.rights) ||
      post.revisionKey !== a.revisionKey ||
      post.deliveryReservationKey !== a.reservationKey ||
      !watch ||
      watch.state !== "active" ||
      watch.generation !== a.generation ||
      !creatorPermission(watch.platform, watch.creatorId)
    )
      return;
    ensure(
      Number.isSafeInteger(a.page) &&
        a.page >= 0 &&
        a.page < creatorBounds.deliveryPages &&
        (a.page === 0) === (a.cursor === null),
      "QUOTA_EXCEEDED",
      "Delivery continuation exceeded its reviewed bound.",
    );
    const active = await ctx.db
      .query("creatorSubscriptions")
      .withIndex("by_watch", (q) =>
        q.eq("watchId", watch._id).eq("state", "active"),
      )
      .take(creatorBounds.recipients + 1);
    ensure(
      active.length <= creatorBounds.recipients,
      "QUOTA_EXCEEDED",
      "The reviewed global recipient bound changed.",
    );
    const reservation = await ctx.db
      .query("inferenceReservations")
      .withIndex("by_key", (q) => q.eq("key", a.reservationKey))
      .unique();
    ensure(
      reservation &&
        [
          "social_discovery_reserved",
          "social_discovery_bounded_complete",
        ].includes(reservation.state),
      "COST_RECONCILIATION_REQUIRED",
      "Deliver only under the original funded discovery envelope.",
    );
    const value = discoveredPostSchema.parse(post.metadata),
      now = Date.now();
    const page = await ctx.db
      .query("creatorSubscriptions")
      .withIndex("by_watch", (q) =>
        q.eq("watchId", watch._id).eq("state", "active"),
      )
      .paginate({ cursor: a.cursor, numItems: creatorBounds.deliveryPage });
    for (const sub of page.page) {
      const actor = await ctx.db.get(sub.actor),
        org = await ctx.db.get(sub.organizationId);
      const member = await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q.eq("organizationId", sub.organizationId).eq("userId", sub.actor),
        )
        .unique();
      if (
        actor?.status !== "active" ||
        org?.status !== "active" ||
        org.privateOwnerId !== sub.actor ||
        !member ||
        !sub.rightsAttested
      )
        continue;
      const existing = await ctx.db
        .query("creatorDeliveries")
        .withIndex("by_identity", (q) =>
          q.eq("subscriptionId", sub._id).eq("postId", post._id),
        )
        .unique();
      if (existing) {
        const source = existing.sourceId
          ? await ctx.db.get(existing.sourceId)
          : null;
        if (existing.sourceId && (!source || source.state === "deleted")) {
          await ctx.db.patch(existing._id, {
            state: "withdrawn",
            reason: "source_removed",
            updatedAt: now,
          });
          continue;
        }
        if (
          existing.revisionKey !== value.revisionKey &&
          !["suppressed", "withdrawn"].includes(existing.state)
        ) {
          if (
            source &&
            source.key === `creator:${existing._id}` &&
            source.sourceRetentionUntil !== undefined
          )
            await scrubUnusableBase(ctx, source, now);
          await ctx.db.patch(existing._id, {
            state: "needs_review",
            reason: "source_revision_changed",
            revisionKey: value.revisionKey,
            updatedAt: now,
          });
        }
        continue;
      }
      const window = Math.floor(now / 86400000);
      const usedAssets =
        sub.deliveryWindow === window ? (sub.deliveredAssets ?? 0) : 0;
      const usedVideo =
        sub.deliveryWindow === window ? (sub.deliveredVideoMs ?? 0) : 0;
      const selected = selectDiscoveredPosts([value], {
        creatorId: watch.creatorId,
        platform: watch.platform,
        cutoff: sub.catchUpSince ?? sub.cutoff,
        mode: "future",
        maxAssets: Math.max(1, sub.maxAssets - usedAssets),
        maxVideoMs: Math.max(0, sub.maxVideoMs - usedVideo),
      });
      const overLimit =
        usedAssets >= sub.maxAssets || selected.overLimit.length > 0;
      if (
        !selected.selected.length &&
        !selected.needsReview.length &&
        !overLimit
      )
        continue;
      if (
        value.publishedAt !== null &&
        value.publishedAt <= (sub.catchUpSince ?? sub.cutoff)
      )
        continue;
      await postRecipientCapacity(ctx, post._id);
      await ctx.db.insert("creatorDeliveries", {
        organizationId: sub.organizationId,
        actor: sub.actor,
        subscriptionId: sub._id,
        postId: post._id,
        revisionKey: value.revisionKey,
        state:
          overLimit || selected.needsReview.length ? "needs_review" : "pending",
        reason: overLimit
          ? "daily_asset_or_minute_limit"
          : selected.needsReview.length
            ? "metadata_incomplete"
            : "processing_approval_required",
        createdAt: now,
        updatedAt: now,
      });
      if (!overLimit && selected.selected.length)
        await ctx.db.patch(sub._id, {
          deliveryWindow: window,
          deliveredAssets: usedAssets + selected.assets,
          deliveredVideoMs: usedVideo + selected.videoMs,
        });
    }
    if (!page.isDone) {
      ensure(
        a.page + 1 < creatorBounds.deliveryPages,
        "QUOTA_EXCEEDED",
        "Delivery fanout reached its reviewed bound.",
      );
      await ctx.scheduler.runAfter(0, internal.creators.deliverPage, {
        ...a,
        page: a.page + 1,
        cursor: page.continueCursor,
      });
    }
    return { visited: page.page.length, complete: page.isDone };
  },
});

export const savePost = mutation({
  args: { id: v.id("creatorDeliveries") },
  handler: async (ctx, a) => {
    const delivery = await ctx.db.get(a.id);
    ensure(delivery, "NOT_FOUND", "Post unavailable.");
    const authorization = await owned(ctx, delivery.organizationId);
    ensure(
      delivery.actor === authorization.actor._id &&
        !["suppressed", "withdrawn"].includes(delivery.state),
      "FORBIDDEN",
      "This delivery is unavailable.",
    );
    const sub = await ctx.db.get(delivery.subscriptionId),
      post = await ctx.db.get(delivery.postId),
      watch = post ? await ctx.db.get(post.watchId) : null;
    ensure(
      sub &&
        ["active", "paused"].includes(sub.state) &&
        post?.state === "available" &&
        post.retainUntil > Date.now() &&
        post.rights &&
        creatorRightsCurrent(post.rights) &&
        watch &&
        creatorPermission(watch.platform, watch.creatorId),
      "POLICY_BLOCKED",
      "Creator access is unavailable.",
    );
    ensure(
      delivery.revisionKey === post.revisionKey &&
        delivery.state !== "needs_review",
      "APPROVAL_STALE",
      "Review changed or incomplete post metadata before saving.",
    );
    if (delivery.sourceId) {
      const old = await ctx.db.get(delivery.sourceId);
      ensure(
        old &&
          old.organizationId === delivery.organizationId &&
          old.state !== "deleted",
        "SOURCE_UNAVAILABLE",
        "The removed source cannot be recreated by rediscovery.",
      );
      return { sourceId: old._id, processingStarted: false };
    }
    const metadata = discoveredPostSchema.parse(post.metadata);
    const sourceId = await captureAuthorized(
      ctx,
      {
        organizationId: delivery.organizationId,
        key: `creator:${delivery._id}`,
        kind: "url",
        url: metadata.canonical,
        title:
          metadata.caption.trim().slice(0, 160) || `${metadata.platform} post`,
        rightsAttested: sub.rightsAttested,
      },
      authorization,
      false,
      true,
    );
    const source = await ctx.db.get(sourceId);
    if (source?.key === `creator:${delivery._id}`)
      await ctx.db.patch(sourceId, {
        sourceRetentionUntil: post.retainUntil,
        creatorRights: post.rights,
      });
    await ctx.db.patch(delivery._id, {
      state: "saved",
      sourceId,
      sourceGeneration: source!.generation,
      reason: "metadata_saved_processing_not_started",
      updatedAt: Date.now(),
    });
    return { sourceId, processingStarted: false };
  },
});

async function backfillQuote(ctx: QueryCtx, sub: Doc<"creatorSubscriptions">) {
  const watch = sub.watchId ? await ctx.db.get(sub.watchId) : null;
  ensure(
    watch && creatorPermission(watch.platform, watch.creatorId),
    "POLICY_BLOCKED",
    "Creator discovery is not ready.",
  );
  const rows = await ctx.db
    .query("creatorPosts")
    .withIndex("by_published", (q) => q.eq("watchId", watch._id))
    .order("desc")
    .take(100);
  const values = rows
    .filter(
      (row) =>
        row.state === "available" &&
        row.retainUntil > Date.now() &&
        row.rights &&
        creatorRightsCurrent(row.rights),
    )
    .map((row) => discoveredPostSchema.parse(row.metadata));
  const window = Math.floor(Date.now() / 86400000);
  const usedAssets =
    sub.deliveryWindow === window ? (sub.deliveredAssets ?? 0) : 0;
  const usedVideo =
    sub.deliveryWindow === window ? (sub.deliveredVideoMs ?? 0) : 0;
  const latest = selectDiscoveredPosts(values, {
    platform: watch.platform,
    creatorId: watch.creatorId,
    cutoff: sub.cutoff,
    mode: "latest10",
    maxAssets: 350,
    maxVideoMs: 6_000_000,
  });
  const unseen = [];
  for (const value of latest.selected) {
    const postId = rows.find((row) => row.postId === value.postId)!._id;
    const existing = await ctx.db
      .query("creatorDeliveries")
      .withIndex("by_identity", (q) =>
        q.eq("subscriptionId", sub._id).eq("postId", postId),
      )
      .unique();
    if (!existing) unseen.push(value);
  }
  const result = selectDiscoveredPosts(unseen, {
    platform: watch.platform,
    creatorId: watch.creatorId,
    cutoff: sub.cutoff,
    mode: "latest10",
    maxAssets: Math.max(1, sub.maxAssets - usedAssets),
    maxVideoMs: Math.max(0, sub.maxVideoMs - usedVideo),
  });
  if (usedAssets >= sub.maxAssets) {
    result.overLimit.push(...result.selected);
    result.selected = [];
    result.assets = 0;
    result.videoMs = 0;
  }
  const postIds = result.selected.map(
    (p) => rows.find((row) => row.postId === p.postId)!._id,
  );
  const binding = {
    subscriptionId: sub._id,
    version: sub.version,
    watchId: watch._id,
    watchVersion: watch.version,
    watchGeneration: watch.generation,
    revisions: result.selected.map((p) => [p.postId, p.revisionKey]),
    assets: result.assets,
    videoMs: result.videoMs,
    incomplete: watch.incomplete,
    window,
    usedAssets,
    usedVideo,
  };
  return {
    hash: await hash(canonicalJson(binding)),
    postIds,
    posts: result.selected.map((p) => ({
      postId: p.postId,
      canonical: p.canonical,
      publishedAt: p.publishedAt,
      assetCount: p.assetCount,
      videoDurationMs: p.videoDurationMs,
    })),
    assets: result.assets,
    videoMs: result.videoMs,
    needsReview: latest.needsReview.length,
    overLimit: result.overLimit.length,
    incomplete: watch.incomplete,
    processingStarted: false,
    window,
    usedAssets,
    usedVideo,
  };
}
export const previewBackfill = query({
  args: { id: v.id("creatorSubscriptions") },
  handler: async (ctx, a) => {
    const sub = await ctx.db.get(a.id);
    ensure(sub, "NOT_FOUND", "Follow unavailable.");
    const { actor } = await owned(ctx, sub.organizationId);
    ensure(sub.actor === actor._id, "FORBIDDEN", "Follow unavailable.");
    return backfillQuote(ctx, sub);
  },
});
export const approveBackfill = mutation({
  args: {
    id: v.id("creatorSubscriptions"),
    expectedVersion: v.number(),
    quoteHash: v.string(),
    acceptIncomplete: v.boolean(),
  },
  handler: async (ctx, a) => {
    const { row: sub } = await subscription(ctx, a.id, a.expectedVersion);
    ensure(
      ["active", "paused"].includes(sub.state),
      "POLICY_BLOCKED",
      "Resume the current follow first.",
    );
    const quote = await backfillQuote(ctx, sub);
    ensure(
      quote.hash === a.quoteHash && (!quote.incomplete || a.acceptIncomplete),
      "QUOTE_CHANGED",
      "Review the observed latest-ten scope and incomplete coverage.",
    );
    const now = Date.now();
    for (const postId of quote.postIds) {
      const old = await ctx.db
        .query("creatorDeliveries")
        .withIndex("by_identity", (q) =>
          q.eq("subscriptionId", sub._id).eq("postId", postId),
        )
        .unique();
      if (old) continue;
      const post = await ctx.db.get(postId);
      await postRecipientCapacity(ctx, postId);
      await ctx.db.insert("creatorDeliveries", {
        organizationId: sub.organizationId,
        actor: sub.actor,
        subscriptionId: sub._id,
        postId,
        revisionKey: post!.revisionKey,
        state: "pending",
        reason: "reviewed_backfill_processing_not_started",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(sub._id, {
      mode: "future",
      version: sub.version + 1,
      deliveryWindow: quote.window,
      deliveredAssets: quote.usedAssets + quote.assets,
      deliveredVideoMs: quote.usedVideo + quote.videoMs,
      updatedAt: now,
    });
    return { count: quote.postIds.length, processingStarted: false };
  },
});

export const expirePost = internalMutation({
  args: { postId: v.id("creatorPosts") },
  handler: async (ctx, a) => {
    const post = await ctx.db.get(a.postId);
    if (
      process.env.RESTORE_LOCK === "true" ||
      !post ||
      post.state === "removed" ||
      (post.retainUntil > Date.now() &&
        post.rights &&
        creatorRightsCurrent(post.rights))
    )
      return;
    await ctx.db.patch(post._id, {
      state: "removed",
      retainUntil: 0,
      cleanupPending: true,
      metadata: { removed: true },
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.creators.expireDeliveries, {
      postId: post._id,
      cursor: null,
    });
  },
});
export const expireDeliveries = internalMutation({
  args: { postId: v.id("creatorPosts"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true")
      return { complete: false, paused: true };
    const post = await ctx.db.get(a.postId);
    if (!post || post.state !== "removed") return;
    const page = await ctx.db
      .query("creatorDeliveries")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .paginate({ cursor: a.cursor, numItems: 10 });
    for (const row of page.page) {
      const source = row.sourceId ? await ctx.db.get(row.sourceId) : null;
      if (
        [
          "provider_content_removed",
          "provider_cleanup_review_required",
        ].includes(row.reason ?? "")
      )
        continue;
      if (
        row.reason === "provider_cleanup_pending" &&
        source?.generation !== row.sourceGeneration
      ) {
        await ctx.scheduler.runAfter(0, internal.creators.purgeSourceAssets, {
          deliveryId: row._id,
          maxGeneration: row.sourceGeneration!,
          rightsHash: post.rights?.rightsHash ?? "",
          cursor: null,
        });
        continue;
      }
      if (
        source &&
        source.state !== "deleted" &&
        source.key === `creator:${row._id}` &&
        source.creatorRights &&
        ((source.sourceRetentionUntil !== undefined &&
          source.sourceRetentionUntil <= Date.now()) ||
          !creatorRightsCurrent(source.creatorRights))
      ) {
        const alreadyScrubbed =
          row.reason === "provider_cleanup_pending" &&
          row.sourceGeneration === source.generation;
        if (!alreadyScrubbed) await scrubUnusableBase(ctx, source, Date.now());
        const maxGeneration = source.generation + Number(!alreadyScrubbed);
        await ctx.db.patch(row._id, {
          state: "withdrawn",
          reason: "provider_cleanup_pending",
          sourceGeneration: maxGeneration,
          updatedAt: Date.now(),
        });
        await ctx.scheduler.runAfter(0, internal.creators.purgeSourceAssets, {
          deliveryId: row._id,
          maxGeneration,
          rightsHash: source.creatorRights.rightsHash,
          cursor: null,
        });
      } else
        await ctx.db.patch(row._id, {
          state: "withdrawn",
          reason: "provider_content_removed",
          updatedAt: Date.now(),
        });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.creators.expireDeliveries, {
        ...a,
        cursor: page.continueCursor,
      });
    if (page.isDone) await completePostCleanup(ctx, post._id);
    return { complete: page.isDone };
  },
});

// Operator-driven bounded revocation drain. Configuration changes close reads
// immediately; an operator must drain these pages within the recorded supplier
// deletion window. This is not an automatically activated recurring collector.
export const invalidateRightsPage = internalMutation({
  args: {
    watchId: v.id("creatorWatches"),
    cursor: v.union(v.string(), v.null()),
    revokedAt: v.number(),
  },
  handler: async (ctx, a) => {
    ensure(
      Number.isSafeInteger(a.revokedAt) &&
        a.revokedAt >= 0 &&
        a.revokedAt <= Date.now(),
      "INVALID_INPUT",
      "Use the actual recorded revocation time for every cleanup page.",
    );
    if (process.env.RESTORE_LOCK === "true")
      return { complete: false, paused: true, next: a.cursor };
    const watch = await ctx.db.get(a.watchId);
    ensure(watch, "NOT_FOUND", "Creator watch unavailable.");
    const page = await ctx.db
      .query("creatorPosts")
      .withIndex("by_watch", (q) => q.eq("watchId", watch._id))
      .paginate({ cursor: a.cursor, numItems: 10 });
    let removed = 0;
    for (const post of page.page) {
      if (
        post.state === "removed" ||
        (post.rights && creatorRightsCurrent(post.rights))
      )
        continue;
      await ctx.db.patch(post._id, {
        state: "removed",
        retainUntil: 0,
        cleanupPending: true,
        metadata: { removed: true },
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.creators.expireDeliveries, {
        postId: post._id,
        cursor: null,
      });
      removed++;
    }
    if (!creatorPermission(watch.platform, watch.creatorId))
      await ctx.db.patch(watch._id, {
        state: "paused",
        generation: watch.generation + Number(watch.state !== "paused"),
        leaseUntil: 0,
        updatedAt: Date.now(),
      });
    const deadline = Math.min(
      ...page.page
        .filter((post) => post.rights && !creatorRightsCurrent(post.rights))
        .map((post) => a.revokedAt + post.rights!.deletionWithinMs),
    );
    return {
      visited: page.page.length,
      removed,
      complete: page.isDone,
      next: page.isDone ? null : page.continueCursor,
      deletionDeadline: Number.isFinite(deadline) ? deadline : null,
      overdue: deadline < Date.now(),
      automaticRetry: false,
      unknownReservationRetained: !!watch.reservationKey,
    };
  },
});

async function completePostCleanup(
  ctx: MutationCtx,
  postId: Id<"creatorPosts">,
) {
  const deliveries = await ctx.db
    .query("creatorDeliveries")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .take(creatorBounds.recipients + 1);
  ensure(
    deliveries.length <= creatorBounds.recipients,
    "QUOTA_EXCEEDED",
    "Review legacy cleanup exceeding the lifetime recipient bound.",
  );
  if (
    deliveries.every(
      (row) =>
        row.state === "withdrawn" &&
        [
          "provider_content_removed",
          "provider_cleanup_review_required",
        ].includes(row.reason ?? ""),
    )
  )
    await ctx.db.patch(postId, {
      cleanupPending: false,
      cleanupUncertain: deliveries.some(
        (row) =>
          row.cleanupUnknown ||
          row.reason === "provider_cleanup_review_required",
      ),
    });
}
export const purgeSourceAssets = internalMutation({
  args: {
    deliveryId: v.id("creatorDeliveries"),
    maxGeneration: v.number(),
    rightsHash: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true")
      return { complete: false, paused: true };
    const delivery = await ctx.db.get(a.deliveryId);
    if (
      !delivery ||
      delivery.state !== "withdrawn" ||
      delivery.reason !== "provider_cleanup_pending"
    )
      return { complete: true };
    const source = delivery.sourceId
      ? await ctx.db.get(delivery.sourceId)
      : null;
    const post = await ctx.db.get(delivery.postId);
    if (
      !source ||
      source.organizationId !== delivery.organizationId ||
      source.key !== `creator:${delivery._id}` ||
      !Number.isSafeInteger(a.maxGeneration) ||
      delivery.sourceGeneration !== a.maxGeneration ||
      source.generation < a.maxGeneration ||
      post?.rights?.rightsHash !== a.rightsHash
    ) {
      await ctx.db.patch(delivery._id, {
        reason: "provider_cleanup_review_required",
        cleanupUnknown: true,
        updatedAt: Date.now(),
      });
      await completePostCleanup(ctx, delivery.postId);
      return {
        complete: true,
        freshSourcePreserved: true,
        reviewRequired: true,
        deletionConfirmed: false,
      };
    }
    const page = await ctx.db
      .query("assets")
      .withIndex("by_org_source", (q) =>
        q
          .eq("organizationId", source.organizationId)
          .eq("sourceId", source._id),
      )
      .paginate({ cursor: a.cursor, numItems: 10 });
    let unknown = delivery.cleanupUnknown ?? false,
      queued = 0;
    for (const asset of page.page) {
      if (!Number.isSafeInteger(asset.sourceGeneration)) {
        unknown = true;
        continue;
      }
      if (asset.sourceGeneration! > a.maxGeneration) continue;
      if (asset.state !== "deleting")
        await ctx.db.patch(asset._id, {
          state: "deleting",
          expiresAt: 0,
          updatedAt: Date.now(),
        });
      await queueDeletion(ctx, asset.key);
      queued++;
    }
    if (unknown) await ctx.db.patch(delivery._id, { cleanupUnknown: true });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.creators.purgeSourceAssets, {
        ...a,
        cursor: page.continueCursor,
      });
    else {
      await ctx.db.patch(delivery._id, {
        reason: unknown
          ? "provider_cleanup_review_required"
          : "provider_content_removed",
        updatedAt: Date.now(),
      });
      await completePostCleanup(ctx, delivery.postId);
    }
    return {
      complete: page.isDone,
      queued,
      reviewRequired: unknown,
      deletionConfirmed: false,
    };
  },
});

// Existing privacy sweep recovers known expiry and interrupted cleanup after a
// recovery lock. Earlier rights revocation uses invalidateRightsPage explicitly.
export async function sweepCreatorRetention(ctx: MutationCtx) {
  if (process.env.RESTORE_LOCK === "true") return;
  const expired = await ctx.db
    .query("creatorPosts")
    .withIndex("by_retention", (q) =>
      q.gt("retainUntil", 0).lte("retainUntil", Date.now()),
    )
    .take(5);
  for (const post of expired)
    await ctx.scheduler.runAfter(0, internal.creators.expirePost, {
      postId: post._id,
    });
  const pending = await ctx.db
    .query("creatorPosts")
    .withIndex("by_cleanup", (q) => q.eq("cleanupPending", true))
    .take(5);
  for (const post of pending)
    await ctx.scheduler.runAfter(0, internal.creators.expireDeliveries, {
      postId: post._id,
      cursor: null,
    });
}
