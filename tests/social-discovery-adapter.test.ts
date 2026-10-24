// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { normalizeApifyDiscovery as normalize } from "../packages/providers/social-discovery";
import { selectDiscoveredPosts } from "../packages/social/discovery";
const now = Date.parse("2026-10-23T10:00:00.000Z");
const instagram = {
  platform: "instagram" as const,
  creatorId: "creator-1",
  observedAt: now,
};
const tiktok = {
  platform: "tiktok" as const,
  creatorId: "creator-1",
  observedAt: now,
};
const image = (extra: Record<string, unknown> = {}) => ({
  id: "post-1",
  ownerId: "creator-1",
  ownerUsername: "visible-handle",
  shortCode: "ABC_1",
  url: "https://www.instagram.com/p/ABC_1/",
  type: "Image",
  caption: "Synthetic owned image caption",
  timestamp: "2026-10-23T09:00:00.000Z",
  images: [],
  childPosts: [],
  ...extra,
});
const video = (extra: Record<string, unknown> = {}) => ({
  id: "1234567890123456789",
  authorMeta: {
    id: "creator-1",
    name: "visible_handle",
    privateAccount: false,
  },
  webVideoUrl:
    "https://www.tiktok.com/@visible_handle/video/1234567890123456789",
  createTimeISO: "2026-10-23T09:00:00.000Z",
  createTime: Date.parse("2026-10-23T09:00:00.000Z") / 1000,
  videoMeta: { duration: 12.125 },
  text: "Synthetic owned video caption",
  isSlideshow: false,
  ...extra,
});
afterEach(() => vi.restoreAllMocks());
it("maps documented Instagram image identity/date without inventing a page or inspection completeness receipt", async () => {
  const result = await normalize([image()], instagram);
  expect(result).toMatchObject({
    completeness: "unknown",
    issues: [],
    posts: [
      {
        platform: "instagram",
        creatorId: "creator-1",
        postId: "post-1",
        canonical: "https://www.instagram.com/p/ABC_1/",
        publishedAt: Date.parse("2026-10-23T09:00:00.000Z"),
        observedAt: now,
        dateReliability: "provider",
        assetCount: 1,
        videoDurationMs: 0,
        mediaKinds: ["image"],
      },
    ],
  });
  expect(result.posts[0].revisionKey).toMatch(/^apify-meta-v1:[a-f0-9]{64}$/);
  expect(result.posts[0]).not.toHaveProperty("contentHash");
});
it("does not count a video's thumbnail list as additional post children and rounds seconds upward", async () => {
  const result = await normalize(
    [
      image({
        type: "Video",
        videoDuration: 1.0001,
        images: ["https://cdn.invalid/thumb1", "https://cdn.invalid/thumb2"],
        productType: "clips",
      }),
    ],
    instagram,
  );
  expect(result.posts[0]).toMatchObject({
    assetCount: 1,
    videoDurationMs: 1001,
    mediaKinds: ["video"],
  });
});
it("keeps sidecar child ordering in metadata revisions while treating expected child count and total duration as unknown", async () => {
  const children = [
    { id: "child-1", type: "Image" },
    { id: "child-2", type: "Video", videoDuration: 2 },
  ];
  const first = await normalize(
    [image({ type: "Sidecar", childPosts: children })],
    instagram,
  );
  expect(first.posts[0]).toMatchObject({
    assetCount: null,
    videoDurationMs: null,
    mediaKinds: ["image", "video"],
  });
  expect(first.issues.map((i) => i.code)).toContain("child_count_unknown");
  const changed = await normalize(
    [image({ type: "Sidecar", childPosts: children.slice().reverse() })],
    instagram,
  );
  expect(first.posts[0].revisionKey).not.toBe(changed.posts[0].revisionKey);
  expect(
    selectDiscoveredPosts(first.posts, {
      creatorId: "creator-1",
      platform: "instagram",
      cutoff: 0,
      mode: "future",
      maxAssets: 35,
      maxVideoMs: 600000,
    }),
  ).toMatchObject({ selected: [], needsReview: first.posts });
});
it("maps nested TikTok identity and seconds fields from the official JSON form, preserving large string IDs", async () => {
  const result = await normalize([video()], tiktok);
  expect(result.posts[0]).toMatchObject({
    postId: "1234567890123456789",
    creatorId: "creator-1",
    videoDurationMs: 12125,
    assetCount: 1,
    mediaKinds: ["video"],
    dateReliability: "provider",
  });
});
it("preserves slideshow count uncertainty instead of treating returned image hints as a complete manifest", async () => {
  const raw = video({
    isSlideshow: true,
    webVideoUrl:
      "https://www.tiktok.com/@visible_handle/photo/1234567890123456789",
    slideshowImageLinks: [
      {
        tiktokLink: "https://cdn.invalid/slide-1?signature=a",
        downloadLink: "https://cdn.invalid/slide-1?signature=b",
      },
    ],
  });
  const result = await normalize([raw], tiktok);
  expect(result.posts[0]).toMatchObject({
    assetCount: null,
    videoDurationMs: 0,
    mediaKinds: ["image"],
  });
  expect(result.issues).toEqual([{ index: 0, code: "child_count_unknown" }]);
  expect(JSON.stringify(result)).not.toContain("signature=");
});
it.each([
  undefined,
  null,
  "invalid",
  "2026-10-24T10:00:00.000Z",
  "2026-02-30T10:00:00.000Z",
])(
  "keeps unavailable, malformed or future publication date unknown: %s",
  async (timestamp) => {
    const result = await normalize([image({ timestamp })], instagram);
    expect(result.posts[0]).toMatchObject({
      publishedAt: null,
      dateReliability: "unknown",
      observedAt: now,
    });
    expect(result.issues).toContainEqual({ index: 0, code: "date_unknown" });
  },
);
it("refuses conflicting TikTok date fields and never substitutes discovery time as publication time", async () => {
  const result = await normalize([video({ createTime: 10 })], tiktok);
  expect(result.posts[0]).toMatchObject({
    publishedAt: null,
    dateReliability: "unknown",
  });
  const epochOnly = await normalize(
    [video({ createTimeISO: undefined })],
    tiktok,
  );
  expect(epochOnly.posts[0].publishedAt).toBe(
    Date.parse("2026-10-23T09:00:00.000Z"),
  );
});
it("requires stable creator identity rather than a handle and rejects a foreign creator batch", async () => {
  await expect(
    normalize([image({ ownerId: "another-creator" })], instagram),
  ).rejects.toThrow("CREATOR_IDENTITY_CHANGED");
  expect(
    (await normalize([image({ ownerId: undefined })], instagram)).posts,
  ).toEqual([]);
  expect(
    (await normalize([video({ authorMeta: { name: "creator-1" } })], tiktok))
      .posts,
  ).toEqual([]);
});
it.each([
  video({
    webVideoUrl:
      "https://www.tiktok.com/@visible_handle/video/9999999999999999999",
  }),
  video({ authorMeta: { id: "creator-1", privateAccount: true } }),
  video({ authorMeta: { id: "creator-1", privateAccount: "false" } }),
  video({
    isSlideshow: false,
    slideshowImageLinks: [{ tiktokLink: "x", downloadLink: "y" }],
  }),
])(
  "does not normalize inconsistent or private provider metadata",
  async (row) => {
    expect(await normalize([row], tiktok)).toMatchObject({
      posts: [],
      issues: [{ index: 0, code: "invalid_item" }],
      completeness: "unknown",
    });
  },
);
it("does not leak provider comments or ephemeral delivery URLs and never requests media or an actor", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(Error("No network is authorized"));
  const a = await normalize(
    [
      video({
        videoUrl: "https://cdn.invalid/file?secret=one",
        isPinned: true,
        latestComments: [{ text: "PRIVATE_COMMENT" }],
      }),
    ],
    tiktok,
  );
  const b = await normalize(
    [
      video({
        videoUrl: "https://cdn.invalid/file?secret=two",
        isPinned: false,
        latestComments: [],
      }),
    ],
    tiktok,
  );
  expect(a.posts[0].revisionKey).toBe(b.posts[0].revisionKey);
  expect(JSON.stringify(a)).not.toMatch(/PRIVATE_COMMENT|cdn\.invalid|secret=/);
  expect(fetch).not.toHaveBeenCalled();
});
it("deduplicates identical rows but refuses conflicting revisions in the same response", async () => {
  expect((await normalize([image(), image()], instagram)).posts).toHaveLength(
    1,
  );
  await expect(
    normalize([image(), image({ caption: "Changed caption" })], instagram),
  ).rejects.toThrow("INCONSISTENT_DISCOVERY_REVISION");
});
it("bounds response bytes/count and rejects unidentifiable sidecar children without minting IDs", async () => {
  await expect(normalize(Array(101).fill(image()), instagram)).rejects.toThrow(
    "DISCOVERY_RESPONSE_BOUND",
  );
  await expect(
    normalize([image({ unused: "x".repeat(1000001) })], instagram),
  ).rejects.toThrow("DISCOVERY_RESPONSE_BOUND");
  expect(
    (
      await normalize(
        [image({ type: "Sidecar", childPosts: [{ type: "Image" }] })],
        instagram,
      )
    ).posts,
  ).toEqual([]);
});
