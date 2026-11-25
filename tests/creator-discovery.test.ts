import { afterEach, expect, it, vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import { creatorPoolEnabled, rankSponsors } from "../convex/lib/creatorPool";
import {
  creatorFeedPolicy,
  readCreatorVideoPage,
  readAuthorizedInstagramPost,
  readInstagramCreatorPage,
} from "../packages/social/creator-feed";

afterEach(() => vi.unstubAllEnvs());
const key = "tiktok:123456789";
const authority = {
  creatorKey: key,
  handle: "creator",
  token: "synthetic-token-for-tests",
  expiresAt: Date.UTC(2099, 1, 20),
  permissionReference: "Explicit published video discovery test",
};

it("keeps recurring video checks and scheduled sponsorship behind independent authority", () => {
  vi.stubEnv("VIBESCROLL_TIKTOK_FEEDS", JSON.stringify([authority]));
  expect(creatorFeedPolicy(key)).toBeNull();
  vi.stubEnv("VIBESCROLL_CREATOR_DISCOVERY_ENABLED", "true");
  expect(creatorFeedPolicy(key)?.creatorKey).toBe(key);
  vi.stubEnv("VIBESCROLL_CREATOR_POOL_ENABLED", "true");
  vi.stubEnv("VIBESCROLL_MANAGED_AUTO_ENABLED", "true");
  expect(creatorPoolEnabled(key)).toBe(false);
  vi.stubEnv("VIBESCROLL_CREATOR_POOL_DAILY_NANO_USD", "1000000");
  expect(creatorPoolEnabled(key)).toBe(true);
  expect(creatorPoolEnabled("tiktok:another")).toBe(false);
});

it("accepts only concrete same-account originals and trusted dates from the approved video feed", async () => {
  const row = {
    id: "7240568259186019630",
    create_time: 1750000000,
    share_url: "https://www.tiktok.com/@creator/video/7240568259186019630",
    duration: 24,
  };
  const traffic = (rowOverride = row) =>
    vi.fn(async () =>
      Response.json({
        data: { videos: [rowOverride], cursor: 1750000000000, has_more: true },
        error: { code: "ok" },
      }),
    );
  const transport = traffic();
  await expect(
    readCreatorVideoPage(authority, null, transport),
  ).resolves.toEqual({
    nextCursor: 1750000000000,
    posts: [
      {
        postKey: "tiktok:7240568259186019630",
        publishedAt: 1750000000000,
        url: row.share_url,
        durationMs: 24000,
      },
    ],
  });
  expect(transport).toHaveBeenCalledOnce();
  await expect(
    readCreatorVideoPage(
      authority,
      null,
      traffic({
        ...row,
        share_url: row.share_url.replace("@creator", "@lookalike"),
      }),
    ),
  ).rejects.toThrow("CREATOR_FEED_IDENTITY_CHANGED");
  await expect(
    readCreatorVideoPage(authority, 1750000000000, traffic()),
  ).rejects.toThrow("CREATOR_FEED_CURSOR_UNAVAILABLE");
});

it("prefers comparable unused allocation and breaks close choices with a stable draw", () => {
  const row = (
    s: string,
    cap: number,
    used: number,
    quote: number,
    draw: string,
  ) => ({ sponsorId: s as Id<"users">, cap, used, quote, draw });
  const choices = [
    row("high-usage", 30, 10, 2, "0"),
    row("old-reservation", 30, 5, 2, "1"),
    row("smaller-cap", 15, 0, 2, "2"),
    row("unused", 30, 0, 2, "3"),
  ];
  expect(rankSponsors(choices).map((c) => c.sponsorId)).toEqual([
    "unused",
    "smaller-cap",
    "old-reservation",
    "high-usage",
  ]);
  expect(
    rankSponsors([row("x", 30, 0, 2, "z"), row("y", 30, 0, 2, "a")])[0]
      .sponsorId,
  ).toBe("y");
});

it("accepts an authorized Instagram carousel only with every child and matching ownership", async () => {
  const account = {
    ...authority,
    creatorKey: "instagram:123456789",
    accountId: "123456789",
  };
  const id = "123456789012345";
  const post = "instagram:ABCDEFGHIJ";
  const permalink = "https://www.instagram.com/p/ABCDEFGHIJ/";
  const timestamp = "2026-11-24T13:48:59Z";
  const entry = { id, permalink, timestamp, media_type: "CAROUSEL_ALBUM" };
  await expect(
    readInstagramCreatorPage(
      account,
      null,
      vi.fn(async () =>
        Response.json({
          data: [entry],
        }),
      ),
    ),
  ).resolves.toMatchObject({
    posts: [{ url: permalink, postKey: post, providerMediaId: id }],
  });
  const children = [
    {
      id: "123456780",
      media_type: "IMAGE",
      media_url: "https://scontent.cdninstagram.com/first.jpg",
    },
    {
      id: "123456781",
      media_type: "VIDEO",
      media_url: "https://scontent.cdninstagram.com/second.mp4",
    },
  ];
  const complete = {
    ...entry,
    owner: { id: account.accountId },
    caption: "Complete caption",
    children: { data: children },
  };
  const good = await readAuthorizedInstagramPost(
    account,
    id,
    post,
    vi.fn(async () => Response.json(complete)),
  );
  expect(good.assets.map((asset) => asset.kind)).toEqual(["image", "video"]);
  expect(good).toMatchObject({
    authorId: "123456789",
    expectedAssetCount: 2,
    text: "Complete caption",
  });
  await expect(
    readAuthorizedInstagramPost(
      account,
      id,
      post,
      vi.fn(async () =>
        Response.json({
          ...complete,
          children: {
            data: children,
            paging: { next: "secret-containing provider link" },
          },
        }),
      ),
    ),
  ).rejects.toThrow("CREATOR_FEED_INCOMPLETE_MEDIA");
  await expect(
    readAuthorizedInstagramPost(
      account,
      id,
      post,
      vi.fn(async () =>
        Response.json({
          ...complete,
          owner: { id: "123456789999" },
        }),
      ),
    ),
  ).rejects.toThrow("CREATOR_FEED_IDENTITY_CHANGED");
});
