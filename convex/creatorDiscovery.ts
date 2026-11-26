import {
  candidateSponsor,
  creatorPoolEnabled,
  rankSponsors,
} from "./lib/creatorPool";
import { captureAuthorized, digest } from "./product";
import { cacheCandidate } from "./lib/cloudCatalog";
import { requirePaidProcessing } from "./lib/paidProcessing";
import { preparedCreditQuote } from "../packages/contracts/prepared-service";
import {
  openAiGrantConfiguration,
  openAiGrantCapacity,
} from "./lib/openAiGrant";

import { PolicyError } from "../packages/policy";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import {
  creatorFeedPolicy,
  creatorFeedAvailable,
  instagramCreatorFeedPolicy,
  readCreatorVideoPage,
  readInstagramCreatorPage,
} from "../packages/social/creator-feed";
import { platformPostKey } from "../packages/sources/post-identity";
import { locateAuthorizedInstagramMedia } from "./lib/instagramMediaLocator";

const hour = 3600000;
const day = hour * 24;

export async function ensureCreatorWatch(
  ctx: MutationCtx,
  creatorKey: string,
  now: number,
) {
  if (!creatorFeedAvailable(creatorKey, now)) return;
  const old = await ctx.db
    .query("creatorWatches")
    .withIndex("by_key", (q) => q.eq("creatorKey", creatorKey))
    .unique();
  if (!old)
    await ctx.db.insert("creatorWatches", {
      creatorKey,
      dueAt: now,
      state: "incomplete",
    });
}

export const schedule = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (
      process.env.VIBESCROLL_CREATOR_DISCOVERY_ENABLED !== "true" ||
      process.env.RESTORE_LOCK === "true"
    )
      return null;
    const now = Date.now();
    const due = await ctx.db
      .query("creatorWatches")
      .withIndex("by_due", (q) => q.lte("dueAt", now))
      .take(8);
    for (const watch of due) {
      const follower = await ctx.db
        .query("creatorFollows")
        .withIndex("by_creator_state", (q) =>
          q.eq("creatorKey", watch.creatorKey).eq("state", "following"),
        )
        .first();
      if (!follower) {
        await ctx.db.delete(watch._id);
        continue;
      }
      if (!creatorFeedAvailable(watch.creatorKey, now)) {
        await ctx.db.patch(watch._id, {
          state: "unavailable",
          dueAt: now + day,
          leaseUntil: undefined,
        });
        continue;
      }
      const leaseUntil = now + 60000;
      const windowStartAt =
        watch.windowStartAt ?? (watch.lastSuccessAt ?? now) - 2 * day;
      await ctx.db.patch(watch._id, {
        state: "checking",
        leaseUntil,
        dueAt: leaseUntil,
        windowStartAt,
      });
      await ctx.scheduler.runAfter(0, internal.creatorDiscovery.check, {
        id: watch._id,
        creatorKey: watch.creatorKey,
        leaseUntil,
        windowStartAt,
        cursor: watch.cursor ?? null,
      });
    }
    const old = await ctx.db
      .query("creatorDiscoveries")
      .withIndex("by_observed", (q) => q.lt("observedAt", now - 7 * day))
      .take(40);
    for (const item of old) await ctx.db.delete(item._id);
    return null;
  },
});

const lease = {
  id: v.id("creatorWatches"),
  creatorKey: v.string(),
  leaseUntil: v.number(),
};
const discovery = v.object({
  postKey: v.string(),
  url: v.string(),
  publishedAt: v.number(),
  durationMs: v.optional(v.number()),
  providerMediaId: v.optional(v.string()),
});

export const finish = internalMutation({
  args: {
    ...lease,
    result: v.union(
      v.null(),
      v.object({
        posts: v.array(discovery),
        nextCursor: v.union(v.number(), v.string(), v.null()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { id, creatorKey, leaseUntil, result }) => {
    const now = Date.now(),
      watch = await ctx.db.get(id);
    if (
      process.env.RESTORE_LOCK === "true" ||
      !watch ||
      watch.creatorKey !== creatorKey ||
      watch.leaseUntil !== leaseUntil ||
      leaseUntil <= now ||
      watch.state !== "checking"
    )
      return null;
    if (!result || !creatorFeedAvailable(creatorKey, now)) {
      await ctx.db.patch(id, {
        state: "unavailable",
        leaseUntil: undefined,
        dueAt: now + 6 * hour,
      });
      return null;
    }
    if (result.posts.length > 20) throw new Error("CREATOR_FEED_LIMIT");
    for (const post of result.posts) {
      if (
        !Number.isSafeInteger(post.publishedAt) ||
        post.publishedAt > now + 300000 ||
        post.publishedAt < (watch.windowStartAt ?? now - 2 * day) ||
        platformPostKey(post.url) !== post.postKey
      )
        continue;
      const old = await ctx.db
        .query("creatorDiscoveries")
        .withIndex("by_creator_post", (q) =>
          q.eq("creatorKey", creatorKey).eq("postKey", post.postKey),
        )
        .unique();
      const discoveryId =
        old?._id ??
        (await ctx.db.insert("creatorDiscoveries", {
          ...post,
          creatorKey,
          observedAt: now,
        }));
      if (
        creatorPoolEnabled(creatorKey) &&
        post.durationMs &&
        post.publishedAt >= now - 2 * day
      )
        await ctx.scheduler.runAfter(
          0,
          internal.creatorDiscovery.sponsorDiscovered,
          { discoveryId },
        );
    }
    if (result.nextCursor === null) {
      await ctx.db.patch(id, {
        state: "ready",
        lastSuccessAt: now,
        dueAt: now + day,
        leaseUntil: undefined,
        cursor: undefined,
        windowStartAt: undefined,
      });
    } else {
      await ctx.db.patch(id, {
        state: "incomplete",
        dueAt: now + 15 * 60000,
        leaseUntil: undefined,
        cursor: result.nextCursor,
      });
    }
    return null;
  },
});

export const check = internalAction({
  args: {
    ...lease,
    cursor: v.union(v.number(), v.string(), v.null()),
    windowStartAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tiktok = creatorFeedPolicy(args.creatorKey);
    const instagram = instagramCreatorFeedPolicy(args.creatorKey);
    let result: Awaited<
      | ReturnType<typeof readCreatorVideoPage>
      | ReturnType<typeof readInstagramCreatorPage>
    > | null = null;
    if (
      (tiktok || instagram) &&
      args.leaseUntil > Date.now() &&
      process.env.RESTORE_LOCK !== "true"
    ) {
      try {
        if (tiktok && typeof args.cursor !== "string") {
          result = await readCreatorVideoPage(tiktok, args.cursor);
          if (
            result.posts.some((post) => post.publishedAt < args.windowStartAt)
          )
            result.nextCursor = null;
        } else if (instagram && typeof args.cursor !== "number") {
          result = await readInstagramCreatorPage(instagram, args.cursor);
        }
      } catch {
        // Credentials, raw provider responses and transport details stay private.
      }
    }
    await ctx.runMutation(internal.creatorDiscovery.finish, {
      id: args.id,
      creatorKey: args.creatorKey,
      leaseUntil: args.leaseUntil,
      result,
    });
    return null;
  },
});

export const sponsorDiscovered = internalMutation({
  args: { discoveryId: v.id("creatorDiscoveries") },
  returns: v.null(),
  handler: async (ctx, { discoveryId }) => {
    const item = await ctx.db.get(discoveryId);
    if (!item || !creatorPoolEnabled(item.creatorKey)) return null;
    const prior = await ctx.db
      .query("creatorPoolRuns")
      .withIndex("by_post", (q) => q.eq("postKey", item.postKey))
      .take(3);
    const ready = prior.find((run) => run.state === "ready");
    if (ready) {
      await ctx.scheduler.runAfter(
        0,
        internal.creatorDiscovery.deliverPublished,
        { poolId: ready._id },
      );
      return null;
    }
    if (prior.length >= 2 || prior.some((run) => run.state !== "failed"))
      return null;
    if (prior.length) {
      const prep = await ctx.db.get(prior[0].runId);
      // Deliberately retry only a returned, isolated provider result. A denied
      // source or an uncertain dispatch cannot start a different paid attempt.
      if (
        prep?.receipt?.billing?.state !== "settled" ||
        !prep.receipt?.analysis_output ||
        prep.receipt?.billing?.chargedCredits !== 0
      )
        return null;
      const providerId = prep.receipt.admission?.providerReservationId
        ? ctx.db.normalizeId(
            "providerFundingReservations",
            prep.receipt.admission.providerReservationId,
          )
        : null;
      if (providerId) {
        const settled = await ctx.db.get(providerId);
        if (!settled || !["settled", "released"].includes(settled.state))
          return null;
      }
      if (
        prep.receipt.admission?.quote?.openAi &&
        prep.receipt.analysis?.provider !== "openai"
      )
        return null;
    }
    const followers = await ctx.db
      .query("creatorFollows")
      .withIndex("by_creator_sponsor", (q) =>
        q
          .eq("creatorKey", item.creatorKey)
          .eq("state", "following")
          .eq("sponsor", true),
      )
      .take(64);
    if (followers.length === 64) return null;
    const candidates = [];
    const seen = new Set<string>();
    const dayStart = Math.floor(Date.now() / day) * day;
    for (const follower of followers) {
      if (
        seen.has(follower.actorId) ||
        prior.some((run) => run.sponsorId === follower.actorId)
      )
        continue;
      const candidate = await candidateSponsor(ctx, follower, item.publishedAt);
      if (!candidate) continue;
      seen.add(follower.actorId);
      const policy = openAiGrantConfiguration(candidate.actor.subject);
      let grantAvailable = false;
      if (policy?.allowedModels.includes("gpt-6.2-sol")) {
        try {
          await openAiGrantCapacity(ctx, policy);
          grantAvailable = true;
        } catch {
          // Admission repeats the exact and current authorization check.
        }
      }
      const estimate = preparedCreditQuote(
        Math.min(600000, (item.durationMs ?? 600000) + 1000),
        "gateway",
        false,
        grantAvailable ? "gpt-6.2-sol" : "meta/muse-ember",
      ).maximum;
      candidates.push({
        followId: follower._id,
        sponsorId: follower.actorId,
        used: candidate.allowance.used,
        cap: candidate.allowance.cap,
        quote: estimate,
        draw: await digest(
          `creator-sponsor-v1:${dayStart}:${item.postKey}:${follower.actorId}`,
        ),
      });
    }
    for (const candidate of rankSponsors(candidates).slice(0, 8)) {
      try {
        const result = await ctx.runMutation(
          internal.preparedService.startCreatorSponsored,
          {
            discoveryId,
            followId: candidate.followId,
          },
        );
        if (result) return null;
      } catch (error) {
        const code =
          error instanceof PolicyError
            ? error.code
            : error instanceof Error
              ? error.message.match(/\b([A-Z][A-Z_]{1,63}):/)?.[1]
              : null;
        if (
          ![
            "INSUFFICIENT_CREDITS",
            "PAYMENT_REQUIRED",
            "PAYMENT_REVIEW_REQUIRED",
            "PRO_REQUIRED",
            "QUOTA_EXCEEDED",
          ].includes(code ?? "")
        ) {
          // Budget, source, provider and inconclusive results stop the rotation.
          return null;
        }
      }
    }
    return null;
  },
});

export const deliverPublished = internalMutation({
  args: { poolId: v.id("creatorPoolRuns") },
  returns: v.null(),
  handler: async (ctx, { poolId }) => {
    const pool = await ctx.db.get(poolId);
    if (!pool || pool.state !== "ready" || !creatorPoolEnabled(pool.creatorKey))
      return null;
    const [source, item] = await Promise.all([
      ctx.db.get(pool.sourceId),
      ctx.db
        .query("creatorDiscoveries")
        .withIndex("by_creator_post", (q) =>
          q.eq("creatorKey", pool.creatorKey).eq("postKey", pool.postKey),
        )
        .unique(),
    ]);
    if (
      !source ||
      !item ||
      source.state !== "ready" ||
      !source.rightsAttested ||
      source.catalogStatus?.state !== "published"
    )
      return null;
    const followers = await ctx.db
      .query("creatorFollows")
      .withIndex("by_creator_sponsor", (q) =>
        q
          .eq("creatorKey", pool.creatorKey)
          .eq("state", "following")
          .eq("sponsor", true),
      )
      .take(64);
    if (followers.length === 64) return null;
    for (const follower of followers) {
      if (
        follower.sponsor &&
        follower.actorId !== pool.sponsorId &&
        (follower.activeSince ?? follower.firstFollowedAt) < item.publishedAt
      )
        await ctx.scheduler.runAfter(0, internal.creatorDiscovery.deliverOne, {
          poolId,
          followId: follower._id,
        });
    }
    return null;
  },
});

export const deliverOne = internalMutation({
  args: { poolId: v.id("creatorPoolRuns"), followId: v.id("creatorFollows") },
  returns: v.null(),
  handler: async (ctx, { poolId, followId }) => {
    const [pool, follow] = await Promise.all([
      ctx.db.get(poolId),
      ctx.db.get(followId),
    ]);
    if (
      !pool ||
      pool.state !== "ready" ||
      !follow ||
      !follow.sponsor ||
      follow.state !== "following" ||
      follow.creatorKey !== pool.creatorKey ||
      !creatorPoolEnabled(pool.creatorKey)
    )
      return null;
    const source = await ctx.db.get(pool.sourceId);
    const item = await ctx.db
      .query("creatorDiscoveries")
      .withIndex("by_creator_post", (q) =>
        q.eq("creatorKey", pool.creatorKey).eq("postKey", pool.postKey),
      )
      .unique();
    if (
      !item ||
      (follow.activeSince ?? follow.firstFollowedAt) >= item.publishedAt ||
      source?.catalogStatus?.state !== "published" ||
      source?.state !== "ready" ||
      !source.rightsAttested
    )
      return null;
    const [actor, organization, membership] = await Promise.all([
      ctx.db.get(follow.actorId),
      ctx.db.get(follow.organizationId),
      ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q
            .eq("organizationId", follow.organizationId)
            .eq("userId", follow.actorId),
        )
        .unique(),
    ]);
    if (
      actor?.status !== "active" ||
      organization?.status !== "active" ||
      organization.privateOwnerId !== actor._id ||
      membership?.role !== "owner"
    )
      return null;
    await requirePaidProcessing(ctx, actor, organization._id);
    if (!(await cacheCandidate(ctx, organization._id, item.url))) return null;
    await captureAuthorized(
      ctx,
      {
        organizationId: organization._id,
        key: `creator-${await digest(item.postKey)}`.slice(0, 56),
        kind: "url",
        url: item.url,
        title: source.title,
        rightsAttested: true,
      },
      { actor, organization, membership },
      true,
      true,
      true,
    );
    return null;
  },
});

export const notifyPublisher = internalMutation({
  args: { sourceId: v.id("sources") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    if (process.env.VIBESCROLL_CREATOR_POOL_ENABLED !== "true") return null;
    const pool = await ctx.db
      .query("creatorPoolRuns")
      .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
      .order("desc")
      .first();
    if (pool?.state === "ready" && creatorPoolEnabled(pool.creatorKey))
      await ctx.scheduler.runAfter(
        0,
        internal.creatorDiscovery.deliverPublished,
        { poolId: pool._id },
      );
    return null;
  },
});

export const instagramMediaLocator = internalQuery({
  args: { runId: v.id("mediaPreparations") },
  returns: v.union(
    v.null(),
    v.object({
      creatorKey: v.string(),
      postKey: v.string(),
      mediaId: v.string(),
    }),
  ),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    const source = run ? await ctx.db.get(run.sourceId) : null;
    const expected = run?.receipt?.admission?.quote?.instagramGraph;
    if (
      !run ||
      !source?.rightsAttested ||
      source.generation !== run.generation ||
      source.organizationId !== run.organizationId ||
      (!expected && process.env.VIBESCROLL_ORDERED_SOCIAL_ENABLED !== "true")
    )
      return null;
    const locator = await locateAuthorizedInstagramMedia(
      ctx,
      source.url ?? source.canonical,
    );
    if (
      expected &&
      (locator?.creatorKey !== expected.creatorKey ||
        locator?.mediaId !== expected.mediaId ||
        locator?.postKey !== expected.postKey)
    )
      return null;
    return locator;
  },
});
