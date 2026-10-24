import { afterEach, expect, it, vi } from "vitest";
import {
  socialCreatorUrl,
  socialPostUrl,
} from "../packages/social/identity.mjs";
import {
  socialHash,
  socialRevisionHash,
  validateSocialEvidence,
  requireSocialRights,
  socialPostSchema,
} from "../packages/social/contracts";
import {
  selectDiscoveredPosts,
  discoverBounded,
  digestDay,
  type DiscoveredPost,
} from "../packages/social/discovery";
import { creatorConfiguration } from "../convex/lib/creatorPolicy";

afterEach(() => vi.unstubAllEnvs());
const now = 1_798_000_000_000;
const rights = {
  version: "social-rights-v1",
  evidenceId: "synthetic-permission",
  provider: "test-only",
  platforms: ["instagram", "tiktok"],
  creatorScope: "specified",
  creatorIds: ["creator1"],
  collection: true,
  mediaAcquisition: true,
  aiProcessing: true,
  crossCustomerReuse: false,
  routes: ["managed_api"],
  reviewedAt: now - 1,
  expiresAt: now + 100_000,
  maxRetentionMs: 86400000,
  deletionWithinMs: 3600000,
};
function post(
  id: number,
  publishedAt: number | null = now - id,
): DiscoveredPost {
  return {
    platform: "instagram",
    creatorId: "creator1",
    postId: `post${id}`,
    canonical: `https://www.instagram.com/p/post${id}/`,
    publishedAt,
    observedAt: now,
    dateReliability: publishedAt === null ? "unknown" : "provider",
    caption: "Synthetic fixture",
    assetCount: 2,
    videoDurationMs: 0,
    mediaKinds: ["image"],
    revisionKey: `revision${id}`,
  };
}
it("normalizes social posts and creator handles without resolving short links or trusting credentials", () => {
  expect(
    socialPostUrl("https://instagram.com/reel/Ab_c12?utm_source=x"),
  ).toEqual({
    platform: "instagram",
    postKey: "Ab_c12",
    canonical: "https://www.instagram.com/p/Ab_c12/",
  });
  expect(
    socialPostUrl("https://www.tiktok.com/@Creator/photo/123456789?x=1")
      .canonical,
  ).toBe("https://www.tiktok.com/@creator/photo/123456789");
  expect(socialCreatorUrl("https://instagram.com/Some.Creator/").handle).toBe(
    "some.creator",
  );
  for (const raw of [
    "https://instagram.com@evil.test/p/abc/",
    "http://instagram.com/p/abc",
    "https://www.instagram.com:444/p/abc",
    "https://instagram.com/p/a%2fb",
    "https://vm.tiktok.com/x",
    "https://instagram.com\\@evil.test/p/abc",
  ])
    expect(() => socialPostUrl(raw)).toThrow();
  expect(() => socialCreatorUrl("https://instagram.com/accounts/")).toThrow();
});
it("validates ordered image evidence without inventing video timestamps and binds actual content hashes", async () => {
  const value = {
    schemaVersion: "social-post-v1" as const,
    platform: "instagram" as const,
    creatorId: "creator1",
    postId: "providerPost1",
    canonical: "https://www.instagram.com/p/abcDEF/",
    publishedAt: now - 1,
    observedAt: now,
    dateReliability: "provider" as const,
    caption: "Synthetic caption",
    captionHash: await socialHash("Synthetic caption"),
    assets: [
      {
        id: "slide1",
        index: 0,
        kind: "image" as const,
        mime: "image/jpeg" as const,
        contentHash: "a".repeat(64),
        bytes: 1000,
        width: 1200,
        height: 900,
        inspected: true,
      },
      {
        id: "slide2",
        index: 1,
        kind: "image" as const,
        mime: "image/jpeg" as const,
        contentHash: "b".repeat(64),
        bytes: 1000,
        width: 1200,
        height: 900,
        inspected: false,
      },
    ],
    expectedAssetCount: 2,
    coverage: "complete_manifest" as const,
    revisionHash: "c".repeat(64),
    providerEvidenceId: "synthetic",
  };
  value.revisionHash = await socialRevisionHash(value);
  const evidence = {
    id: "visible1",
    postRevisionHash: value.revisionHash,
    assetId: "slide1",
    assetIndex: 0,
    text: "Synthetic visible label",
    textHash: await socialHash("Synthetic visible label"),
    kind: "image_observation",
    basis: "visible",
    uncertainty: "",
  };
  expect(
    (await validateSocialEvidence(value, [evidence])).evidence[0],
  ).not.toHaveProperty("startMs");
  await expect(
    validateSocialEvidence(value, [
      { ...evidence, assetId: "slide2", assetIndex: 1 },
    ]),
  ).rejects.toThrow("BINDING");
  await expect(
    validateSocialEvidence(value, [{ ...evidence, startMs: 0 }]),
  ).rejects.toThrow();
  await expect(
    validateSocialEvidence(value, [{ ...evidence, text: "Changed text" }]),
  ).rejects.toThrow("HASH");
  await expect(
    validateSocialEvidence({ ...value, caption: "Changed caption" }, [
      evidence,
    ]),
  ).rejects.toThrow("HASH");
  expect(() =>
    socialPostSchema.parse({ ...value, assets: [...value.assets].reverse() }),
  ).toThrow();
  expect(() =>
    socialPostSchema.parse({
      ...value,
      assets: value.assets.map((a) => ({ ...a, bytes: 150_000_000 })),
    }),
  ).toThrow();
});
it("does not let a collection grant authorize media, AI, cross-customer reuse or another subscription route", () => {
  expect(
    requireSocialRights(
      rights,
      {
        provider: "test-only",
        platform: "instagram",
        creatorId: "creator1",
        workload: "discovery",
      },
      now,
    ),
  ).toBeTruthy();
  for (const request of [
    { creatorId: "other", workload: "discovery" as const },
    {
      creatorId: "creator1",
      workload: "reuse" as const,
      route: "managed_api" as const,
    },
    {
      creatorId: "creator1",
      workload: "analysis" as const,
      route: "own_subscription" as const,
    },
  ])
    expect(() =>
      requireSocialRights(
        rights,
        { provider: "test-only", platform: "instagram", ...request },
        now,
      ),
    ).toThrow("PERMISSION_PENDING");
  expect(() =>
    requireSocialRights(
      { ...rights, mediaAcquisition: false },
      {
        provider: "test-only",
        platform: "instagram",
        creatorId: "creator1",
        workload: "media",
      },
      now,
    ),
  ).toThrow();
  expect(() =>
    requireSocialRights(
      rights,
      {
        provider: "test-only",
        platform: "instagram",
        creatorId: "creator1",
        workload: "discovery",
      },
      now + 100_000,
    ),
  ).toThrow();
});
it("orders latest ten by actual publication time, excludes future-only history and surfaces unknown dates/limits", () => {
  const posts = Array.from({ length: 15 }, (_, i) => post(i + 1)).reverse();
  const selection = {
    platform: "instagram" as const,
    creatorId: "creator1",
    cutoff: now - 5,
    mode: "future" as const,
    maxAssets: 350,
    maxVideoMs: 600_000,
  };
  expect(
    selectDiscoveredPosts(posts, selection).selected.map((p) => p.postId),
  ).toEqual(["post1", "post2", "post3", "post4"]);
  expect(
    selectDiscoveredPosts([...posts, post(99, null)], {
      ...selection,
      mode: "latest10",
    }).selected.map((p) => p.postId),
  ).toEqual(Array.from({ length: 10 }, (_, i) => `post${i + 1}`));
  expect(
    selectDiscoveredPosts([post(99, null)], selection).needsReview,
  ).toHaveLength(1);
  expect(
    selectDiscoveredPosts(posts, { ...selection, maxAssets: 3 }).selected,
  ).toHaveLength(1);
  expect(() =>
    selectDiscoveredPosts([{ ...post(1), creatorId: "other" }], selection),
  ).toThrow("IDENTITY");
  expect(() =>
    selectDiscoveredPosts(
      [post(1), { ...post(1), revisionKey: "other" }],
      selection,
    ),
  ).toThrow("REVISION");
});
it("never dispatches discovery without all enabled/rights/whole-check budget gates", async () => {
  const transport = vi.fn();
  const request = {
    enabled: false,
    provider: "test-only",
    platform: "instagram" as const,
    creatorId: "creator1",
    rights,
    now,
    deadline: now + 1000,
    cursor: null,
    reservation: {
      key: "synthetic",
      provider: "test-only",
      expiresAt: now + 1000,
      maximumUsdMicros: 10,
      includesMinimumRetriesStorageAndLag: true,
      state: "reserved" as const,
    },
  };
  await expect(discoverBounded(request, transport, () => now)).rejects.toThrow(
    "DISABLED",
  );
  await expect(
    discoverBounded(
      {
        ...request,
        enabled: true,
        reservation: { ...request.reservation, state: "unknown" },
      },
      transport,
      () => now,
    ),
  ).rejects.toThrow("BUDGET");
  await expect(
    discoverBounded(
      { ...request, enabled: true, rights: { ...rights, collection: false } },
      transport,
      () => now,
    ),
  ).rejects.toThrow("PERMISSION");
  expect(transport).not.toHaveBeenCalled();
});
it("bounds discovery pages, refuses stalled cursors and reports partial completion instead of claiming a complete scan", async () => {
  const request = {
    enabled: true,
    provider: "test-only",
    platform: "instagram" as const,
    creatorId: "creator1",
    rights,
    now,
    deadline: now + 1000,
    cursor: null,
    reservation: {
      key: "synthetic",
      provider: "test-only",
      expiresAt: now + 1000,
      maximumUsdMicros: 10,
      includesMinimumRetriesStorageAndLag: true,
      state: "reserved" as const,
    },
  };
  let pages = 0;
  const result = await discoverBounded(
    request,
    async () => ({
      posts: [post(++pages)],
      cursor: `page${pages}`,
      complete: false,
      responseBytes: 100,
    }),
    () => now,
  );
  expect(result).toMatchObject({
    complete: false,
    cursor: "page3",
    responseBytes: 300,
  });
  expect(pages).toBe(3);
  await expect(
    discoverBounded(
      request,
      async () => ({
        posts: [],
        cursor: "same",
        complete: false,
        responseBytes: 1,
      }),
      () => now,
    ),
  ).rejects.toThrow("STALLED");
  await expect(
    discoverBounded(
      request,
      async () => ({
        posts: [],
        cursor: null,
        complete: true,
        responseBytes: 1_000_001,
      }),
      () => now,
    ),
  ).rejects.toThrow("BOUND");
});
it("uses local calendar days across DST without changing the daily discovery clock", () => {
  expect(digestDay(Date.parse("2026-10-25T00:30:00Z"), "Europe/Berlin")).toBe(
    "2026-10-25",
  );
  expect(digestDay(Date.parse("2026-10-25T01:30:00Z"), "Europe/Berlin")).toBe(
    "2026-10-25",
  );
  expect(
    digestDay(Date.parse("2026-10-25T00:30:00Z"), "America/Los_Angeles"),
  ).toBe("2026-10-24");
});
it("keeps a creator configuration closed without a verified full-check cost bound", () => {
  vi.stubEnv("CREATOR_FOLLOWING_ENABLED", "true");
  const config = {
    version: "creator-provider-v1",
    provider: "test-only",
    rights,
    reviewReference: "synthetic-pricing",
    expiresAt: now + 100_000,
    budgetKey: "social-discovery-usd-micros:v1:synthetic",
    ceilingUsdMicros: 100,
    perCheckUsdMicros: 10,
    maximumChecks: 10,
    includesMinimumRetriesStorageAndLag: true,
    includesDeliveryAndRevocationCleanup: true,
  };
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", JSON.stringify(config));
  expect(creatorConfiguration(now)).toBeTruthy();
  vi.stubEnv(
    "CREATOR_PROVIDER_CONFIGURATION",
    JSON.stringify({ ...config, maximumChecks: 11 }),
  );
  expect(creatorConfiguration(now)).toBeNull();
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", JSON.stringify(config));
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(creatorConfiguration(now)).toBeNull();
});
