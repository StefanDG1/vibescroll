import { afterEach, beforeEach, expect, it, vi } from "vitest";
import counterTest from "@convex-dev/sharded-counter/test";
import { api } from "../convex/_generated/api";
import { prepared } from "./chat-proposal-fixture";
import {
  engagementCounter,
  privatePostKey,
  recordPostSave,
} from "../convex/lib/postEngagement";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture() {
  const f = await prepared();
  counterTest.register(f.t);
  vi.stubEnv("POST_ENGAGEMENT_ENABLED", "true");
  const args = {
    organizationId: f.org,
    windowDays: 7 as const,
    dayUTC: Math.floor(Date.now() / 86400000) * 86400000,
  };
  return { ...f, args };
}
it("uses real current preferences and distinct Saves, without inventing history or copying source content", async () => {
  const f = await fixture();
  expect(await f.owner.query(api.postTrends.read, f.args)).toMatchObject({
    totals: { windowLikes: 0, windowSaves: 0 },
    creditsSpent: 0,
    analysisStarted: false,
  });
  await f.owner.mutation(api.postEngagement.setLike, {
    organizationId: f.org,
    sourceId: f.sourceId,
    liked: true,
    expectedRevision: 0,
    key: "trend-like-once",
  });
  const userId = (await f.t.run((ctx) =>
    ctx.db.query("postEngagement").first(),
  ))!.userId;
  await f.t.run(async (ctx) => {
    const source = (await ctx.db.get(f.sourceId))!;
    await recordPostSave(ctx, source, userId);
    await recordPostSave(ctx, source, userId);
    await ctx.db.patch(source._id, {
      linkPreview: {
        state: "ready",
        authorName: "Reported creator",
        updatedAt: Date.now(),
      },
    });
    for (const categoryKey of ["coding", "ai"])
      await ctx.db.insert("sourceCategories", {
        organizationId: f.org,
        sourceId: source._id,
        categoryKey,
        title: "Post",
        sourceCreatedAt: Date.now(),
        sourceUpdatedAt: Date.now(),
        savedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  const result = await f.owner.query(api.postTrends.read, f.args);
  expect(result.totals).toEqual({
    windowLikes: 1,
    windowSaves: 1,
    limited: false,
  });
  expect(result.posts).toHaveLength(1);
  expect(result.creators[0]).toMatchObject({ posts: 1, activity: 2 });
  expect(result.categories.map((c: any) => c.activity)).toEqual([2, 2]);
  expect(result.posts[0]).not.toHaveProperty("analysis");
  expect(result.posts[0]).not.toHaveProperty("transcript");
  expect(result).not.toHaveProperty("users");
  await f.owner.mutation(api.postEngagement.setLike, {
    organizationId: f.org,
    sourceId: f.sourceId,
    liked: false,
    expectedRevision: 1,
    key: "trend-unlike-once",
  });
  expect(
    (await f.owner.query(api.postTrends.read, f.args)).totals.windowLikes,
  ).toBe(0);
});
it("enforces source retention, workspace authority and explicit time windows", async () => {
  const f = await fixture();
  await f.owner.mutation(api.postEngagement.setLike, {
    organizationId: f.org,
    sourceId: f.sourceId,
    liked: true,
    expectedRevision: 0,
    key: "trend-time-window",
  });
  await f.t.run((ctx) =>
    ctx.db.patch(f.sourceId, {
      sourceRetentionUntil: Date.now() + 100 * 86400000,
    }),
  );
  vi.advanceTimersByTime(10 * 86400000);
  const current = {
    ...f.args,
    dayUTC: Math.floor(Date.now() / 86400000) * 86400000,
  };
  expect(
    (await f.owner.query(api.postTrends.read, current)).totals.windowLikes,
  ).toBe(0);
  expect(
    (await f.owner.query(api.postTrends.read, { ...current, windowDays: 30 }))
      .totals.windowLikes,
  ).toBe(1);
  await expect(
    f.t
      .withIdentity({ subject: "stranger" })
      .query(api.postTrends.read, f.args),
  ).rejects.toThrow();
  await f.t.run((ctx) =>
    ctx.db.patch(f.sourceId, { sourceRetentionUntil: Date.now() - 1 }),
  );
  expect((await f.owner.query(api.postTrends.read, f.args)).posts).toEqual([]);
});
it("caps each indexed window at 100 with explicit lower-bound flags, while keeping exact all-time totals", async () => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    const key = privatePostKey(f.sourceId);
    for (let i = 0; i < 101; i++) {
      const userId = await ctx.db.insert("users", {
        subject: `historical-user-${i}`,
        name: "Historical member",
        email: `member-${i}@example.invalid`,
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.insert("postEngagement", {
        userId,
        key,
        liked: true,
        saved: true,
        savedAt: Date.now(),
        likeUpdatedAt: Date.now(),
        revision: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    await engagementCounter().add(ctx, `${key}:likes`, 101);
    await engagementCounter().add(ctx, `${key}:saves`, 101);
  });
  const result = await f.owner.query(api.postTrends.read, f.args);
  expect(result.totals).toEqual({
    windowLikes: 100,
    windowSaves: 100,
    limited: true,
  });
  expect(result.posts[0]).toMatchObject({
    likes: 101,
    saves: 101,
    limited: true,
  });
});
