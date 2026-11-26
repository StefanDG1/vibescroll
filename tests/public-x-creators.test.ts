import { afterEach, expect, it, vi } from "vitest";
import {
  readPublicXCreatorPage,
  readPublicCreatorProfile,
  publicCreatorFeedEnabled,
} from "../packages/social/public-creators";
afterEach(() => vi.unstubAllEnvs());
const now = Date.UTC(2026, 10, 26),
  author = {
    id: "4686835494",
    screen_name: "creator",
    protected: false,
    description: "https://www.instagram.com/creator/",
    website: null,
  };
const status = (id: string, extra: Record<string, unknown> = {}) => ({
  type: "status",
  id,
  url: `https://x.com/creator/status/${id}`,
  created_timestamp: now / 1000 - 60,
  author,
  ...extra,
});
const payload = (
  rows = [
    status("2125691968407871598"),
    status("2125691968407871599", {
      media: { videos: [{ duration: 1.25 }, { duration: 2.5 }] },
    }),
  ],
) => ({ code: 200, results: rows, cursor: { bottom: "next-page" } });

it("reads public X posts by stable account ID, distinguishes videos from text/photos and skips reposts", async () => {
  const transport = vi.fn(async () =>
    Response.json(
      payload([
        ...payload().results,
        status("2125691968407871600", {
          author: { ...author, id: "999", screen_name: "other" },
          reposted_by: author,
        }),
      ]),
    ),
  );
  const result = await readPublicXCreatorPage(
    { creatorKey: "x:4686835494", handle: "creator" },
    null,
    transport,
    now,
  );
  expect(result.posts.map((p) => p.durationMs)).toEqual([0, 3750]);
  expect(result.profile).toMatchObject({
    key: "x:4686835494",
    handle: "creator",
    links: ["https://www.instagram.com/creator/"],
  });
  expect(result.nextCursor).toBe("next-page");
  expect(transport).toHaveBeenCalledExactlyOnceWith(
    "https://api.fxtwitter.com/2/profile/id%3A4686835494/statuses?count=20",
    expect.objectContaining({
      redirect: "error",
      headers: { "User-Agent": expect.stringContaining("VibeScroll") },
    }),
  );
});

it.each([
  status("2125691968407871598", { author: { ...author, protected: true } }),
  status("2125691968407871598", {
    url: "https://x.com/creator/status/2125691968407871599",
  }),
  status("2125691968407871598", { created_timestamp: now / 1000 + 1000 }),
  status("2125691968407871598", { author: { ...author, id: "999" } }),
])("rejects private, substituted or future X posts", async (row) => {
  await expect(
    readPublicXCreatorPage(
      { creatorKey: "x:4686835494", handle: "creator" },
      null,
      async () => Response.json(payload([row])),
      now,
    ),
  ).rejects.toThrow("CREATOR_IDENTITY_CHANGED");
});

it("uses the same verified timeline for reciprocal X profile matching and rejects repeated cursors", async () => {
  const transport = vi.fn(async () => Response.json(payload()));
  expect(
    await readPublicCreatorProfile(
      "https://x.com/creator",
      undefined,
      transport,
      now,
    ),
  ).toMatchObject({ key: "x:4686835494", handle: "creator" });
  await expect(
    readPublicXCreatorPage(
      { creatorKey: "x:4686835494", handle: "creator" },
      "next-page",
      transport,
      now,
    ),
  ).rejects.toThrow("CREATOR_FEED_CURSOR_UNAVAILABLE");
  vi.stubEnv("VIBESCROLL_CREATOR_DISCOVERY_ENABLED", "true");
  vi.stubEnv("WORK_CLOUD_MEDIA_ENABLED", "true");
  expect(publicCreatorFeedEnabled("x:4686835494")).toBe(true);
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(publicCreatorFeedEnabled("x:4686835494")).toBe(false);
});
