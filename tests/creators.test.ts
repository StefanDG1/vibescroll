import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { fixture } from "./chat-proposal-fixture";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("reads verified creators through MCP and keeps one workspace follow through rejoin", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const creatorKey = "tiktok:123456789";
  await f.t.run(async (ctx) => {
    const source = (await ctx.db.get(f.sourceId))!;
    await ctx.db.patch(f.sourceId, {
      creator: {
        key: creatorKey,
        handle: "fixture",
        generation: source.generation,
      },
    });
  });
  const args = { organizationId: f.org, creatorKey };
  const creator = await f.assistant.query(internal.creators.assistantRead, {
    profileId: f.org,
    sourceId: f.sourceId,
  });
  expect(creator.handle).toBe("fixture");
  expect(creator.posts.map((p) => p.sourceId)).toEqual([f.sourceId]);
  await expect(f.t.query(api.creators.read, args)).rejects.toThrow();
  for (const following of [true, true, false, true]) {
    expect(
      await f.owner.mutation(api.creators.setFollow, {
        ...args,
        sourceId: f.sourceId,
        following,
      }),
    ).toBe(following);
  }
  const rows = await f.t.run((ctx) => ctx.db.query("creatorFollows").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ state: "following", creatorKey });
  expect((await f.owner.query(api.creators.read, args))?.following).toBe(true);
});
