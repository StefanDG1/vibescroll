import { v, ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { access } from "./lib";
import { ensure, PolicyError } from "../packages/policy";
import { readablePostKey, readPostEngagement } from "./lib/postEngagementRead";
import { engagementEnabled } from "./lib/postEngagement";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";

export const read = query({
  args: {
    organizationId: v.id("organizations"),
    windowDays: v.union(v.literal(7), v.literal(30)),
    dayUTC: v.number(),
  },
  returns: v.any(),
  handler: async (raw, { organizationId, windowDays, dayUTC }) => {
    const ctx = knowledgeReadContext(raw);
    const { actor } = await access(ctx, organizationId);
    ensure(
      Number.isSafeInteger(dayUTC) &&
        dayUTC % 86400000 === 0 &&
        dayUTC >= Date.UTC(2000, 0, 1) &&
        dayUTC <= Date.UTC(2100, 0, 1),
      "INVALID_INPUT",
      "Choose a UTC calendar day.",
    );
    const windowEnd = dayUTC + 86400000;
    const windowStart = windowEnd - windowDays * 86400000;
    const cards = await ctx.db
      .query("dashboardCards")
      .withIndex("by_org_kind_state", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("kind", "source")
          .eq("state", "ready"),
      )
      .order("desc")
      .take(13);
    const posts = [];
    const seen = new Set<string>();
    if (engagementEnabled())
      for (const card of cards.slice(0, 12)) {
        if (!card.sourceId) continue;
        const source = await ctx.db.get(card.sourceId);
        if (!source || source.organizationId !== organizationId) continue;
        try {
          const key = await readablePostKey(ctx, source);
          if (seen.has(key)) continue;
          seen.add(key);
          const counts = await readPostEngagement(ctx, source, actor._id);
          const [likes, saves, categories] = await Promise.all([
            ctx.db
              .query("postEngagement")
              .withIndex("by_key_like_time", (q) =>
                q
                  .eq("key", key)
                  .eq("liked", true)
                  .gte("likeUpdatedAt", windowStart)
                  .lt("likeUpdatedAt", windowEnd),
              )
              .order("desc")
              .take(101),
            ctx.db
              .query("postEngagement")
              .withIndex("by_key_save_time", (q) =>
                q
                  .eq("key", key)
                  .gte("savedAt", windowStart)
                  .lt("savedAt", windowEnd),
              )
              .order("desc")
              .take(101),
            ctx.db
              .query("sourceCategories")
              .withIndex("by_source", (q) => q.eq("sourceId", source._id))
              .take(40),
          ]);
          const windowLikes = Math.min(likes.length, 100);
          const windowSaves = Math.min(
            saves.filter((row) => row.saved).length,
            100,
          );
          let platform = "unknown platform";
          try {
            platform = new URL(source.url ?? source.canonical).hostname.replace(
              /^www\./,
              "",
            );
          } catch {
            /* No invented provider identity. */
          }
          posts.push({
            id: source._id,
            title: card.title,
            creator: source.linkPreview?.authorName
              ? `${source.linkPreview.authorName.slice(0, 100)} · ${platform}`
              : null,
            categories: [
              ...new Set(categories.map((c) => c.categoryKey)),
            ].slice(0, 12),
            likes: counts.likes,
            saves: counts.shares,
            windowLikes,
            windowSaves,
            limited: likes.length > 100 || saves.length > 100,
            activity: windowLikes + windowSaves,
          });
        } catch (error) {
          if (!(error instanceof PolicyError || error instanceof ConvexError))
            throw error;
        }
      }
    posts.sort(
      (a, b) =>
        b.activity - a.activity ||
        b.likes - a.likes ||
        a.id.localeCompare(b.id),
    );
    const creators = new Map<
      string,
      { name: string; posts: number; activity: number; limited: boolean }
    >();
    const categories = new Map<
      string,
      { name: string; posts: number; activity: number; limited: boolean }
    >();
    for (const post of posts) {
      for (const [map, keys] of [
        [creators, post.creator ? [post.creator] : []],
        [categories, post.categories],
      ] as const)
        for (const name of keys) {
          const old = map.get(name) ?? {
            name,
            posts: 0,
            activity: 0,
            limited: false,
          };
          map.set(name, {
            name,
            posts: old.posts + 1,
            activity: old.activity + post.activity,
            limited: old.limited || post.limited,
          });
        }
    }
    const sorted = (map: typeof creators) =>
      [...map.values()]
        .sort(
          (a, b) =>
            b.activity - a.activity ||
            b.posts - a.posts ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 6);
    return {
      enabled: engagementEnabled(),
      windowEnd,
      dayUTC,
      windowStart,
      windowDays,
      scope: "recent_requested_workspace_posts" as const,
      sample: {
        posts: posts.length,
        maximumPosts: 12,
        moreAvailable: cards.length > 12,
        maximumWindowRowsPerPostAndSignal: 100,
      },
      totals: {
        windowLikes: posts.reduce((n, p) => n + p.windowLikes, 0),
        windowSaves: posts.reduce((n, p) => n + p.windowSaves, 0),
        limited: posts.some((p) => p.limited),
      },
      posts,
      creators: sorted(creators),
      categories: sorted(categories),
      interpretation:
        "Current Likes changed in the window and first recorded distinct-person Saves. Category/creator groups overlap. These are sampled VibeScroll counts, not source-platform popularity or measured outcomes.",
      creditsSpent: 0,
      analysisStarted: false,
    };
  },
});
