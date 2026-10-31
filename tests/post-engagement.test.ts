import { afterEach, beforeEach, expect, it, vi } from "vitest";
import counterTest from "@convex-dev/sharded-counter/test";
import { api, internal } from "../convex/_generated/api";
import { prepared, subject } from "./chat-proposal-fixture";
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
  return {
    ...f,
    target: { organizationId: f.org, sourceIds: [f.sourceId] },
    like: {
      organizationId: f.org,
      sourceId: f.sourceId,
      liked: true,
      expectedRevision: 0,
      key: "like-post-once",
    },
  };
}
it("counts one concurrent keyed like and prevents an old retry from resurrecting a later Unlike", async () => {
  const f = await fixture();
  const result = await Promise.all([
    f.owner.mutation(api.postEngagement.setLike, f.like),
    f.owner.mutation(api.postEngagement.setLike, f.like),
  ]);
  expect(result.filter((x) => x.replayed)).toHaveLength(1);
  expect(await f.owner.query(api.postEngagement.read, f.target)).toMatchObject([
    { likes: 1, liked: true, revision: 1, shares: 0 },
  ]);
  await f.owner.mutation(api.postEngagement.setLike, {
    ...f.like,
    liked: false,
    expectedRevision: 1,
    key: "unlike-post-once",
  });
  await expect(
    f.owner.mutation(api.postEngagement.setLike, f.like),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(await f.owner.query(api.postEngagement.read, f.target)).toMatchObject([
    { likes: 0, liked: false, revision: 2 },
  ]);
});
it("counts successful duplicate Saves once and does not charge analysis credits", async () => {
  const f = await fixture();
  const walletBefore = await f.t.run((ctx) =>
    ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", f.org))
      .unique(),
  );
  const source = (await f.t.run((ctx) => ctx.db.get(f.sourceId)))!;
  const save = {
    organizationId: f.org,
    key: "another-explicit-save",
    kind: "url",
    url: source.url!,
    title: "Existing retained post",
    rightsAttested: true,
  };
  expect(await f.owner.mutation(api.product.capture, save)).toBe(f.sourceId);
  expect(await f.owner.mutation(api.product.capture, save)).toBe(f.sourceId);
  expect(await f.owner.query(api.postEngagement.read, f.target)).toMatchObject([
    { shares: 1, likes: 0 },
  ]);
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("wallets")
        .withIndex("by_org", (q) => q.eq("organizationId", f.org))
        .unique(),
    ),
  ).toEqual(walletBefore);
});
it("rejects foreign and removed-source reactions and bounds every visible read", async () => {
  const f = await fixture();
  await expect(
    f.t
      .withIdentity({ subject: "stranger" })
      .query(api.postEngagement.read, f.target),
  ).rejects.toThrow();
  await expect(
    f.owner.query(api.postEngagement.read, {
      ...f.target,
      sourceIds: Array(4).fill(f.sourceId),
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await f.t.run((ctx) => ctx.db.patch(f.sourceId, { state: "deleted" }));
  await expect(
    f.owner.mutation(api.postEngagement.setLike, f.like),
  ).rejects.toThrow("SOURCE_UNAVAILABLE");
});
it("reacts through the existing metadata subscription without disclosing full analysis or requiring visible sources", async () => {
  const f = await fixture();
  await f.owner.mutation(api.postEngagement.setLike, f.like);
  const result = await f.owner.query(api.preparedAnalysis.feedLive, {
    ...f.target,
    withEngagement: true,
  });
  expect(result.sources[0].engagement).toMatchObject({ likes: 1, liked: true });
  expect(result.sources[0]).not.toHaveProperty("analysis");
  expect(result.sources[0]).not.toHaveProperty("transcript");
  expect(result.recentReady.map((post: any) => post.id)).toContain(f.sourceId);
  expect(
    (
      await f.owner.query(api.preparedAnalysis.feedLive, {
        organizationId: f.org,
        sourceIds: [],
      })
    ).readerId,
  ).toBe(result.readerId);
  expect(
    Array.isArray(await f.owner.query(api.preparedAnalysis.liveMany, f.target)),
  ).toBe(true);
});
it("retires user reactions and their counts during account deletion", async () => {
  const f = await fixture();
  await f.owner.mutation(api.postEngagement.setLike, f.like);
  const userId = (await f.t.run((ctx) =>
    ctx.db.query("postEngagement").first(),
  ))!.userId;
  await f.t.run(async (ctx) => {
    await recordPostSave(ctx, (await ctx.db.get(f.sourceId))!, userId);
  });
  const jobId = await f.t.run((ctx) =>
    ctx.db.insert("deletionJobs", {
      userId,
      subject,
      state: "pending",
      attempts: 0,
    }),
  );
  await f.t.mutation(internal.accounts.finishDelete, { jobId });
  expect(
    await f.t.run((ctx) => ctx.db.query("postEngagement").take(1)),
  ).toEqual([]);
  expect(
    await f.t.run((ctx) =>
      engagementCounter().count(ctx, `${privatePostKey(f.sourceId)}:likes`),
    ),
  ).toBe(0);
});
it("removes private reactions after the authorized source-deletion boundary", async () => {
  const f = await fixture();
  await f.owner.mutation(api.postEngagement.setLike, f.like);
  await f.owner.mutation(api.product.deleteSource, { id: f.sourceId });
  await f.t.mutation(internal.postEngagement.retirePrivate, {
    sourceId: f.sourceId,
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("postEngagement").take(1)),
  ).toEqual([]);
  expect(
    await f.t.run((ctx) =>
      engagementCounter().count(ctx, `${privatePostKey(f.sourceId)}:likes`),
    ),
  ).toBe(0);
});
