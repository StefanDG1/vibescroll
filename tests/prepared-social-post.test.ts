import { expect, it, vi } from "vitest";
import { makePreparedEvidence } from "../packages/contracts/prepared-evidence";
import { preparedCreditQuote } from "../packages/contracts/prepared-service";
import { neutralCloudObservations } from "../packages/contracts/cloud-catalog";
import { socialHash } from "../packages/social/contracts";
import {
  isEquivalentPreparedRepost,
  preparedPostEvidence,
  preparedPostSourceIdentity,
  usesOrderedPostPreparation,
} from "../packages/social/prepared-post";

const canonical = "https://www.tiktok.com/@author/photo/7240568259186019630";

async function photoEvidence() {
  const assets = ["asset-1", "asset-2"].map((id, index) => ({
    id,
    index,
    kind: "image",
    mime: "image/jpeg",
    contentHash: (index ? "b" : "a").repeat(64),
    bytes: 1024,
    width: 500,
    height: 600,
  }));
  const caption =
    "First slide sets the context. The next slide shows the result.";
  const post = preparedPostEvidence.parse({
    version: "social-post-evidence-v1",
    platform: "tiktok",
    postId: "7240568259186019630",
    authorId: "435743298030331",
    authorHandle: "author",
    publishedAt: 1700000000000,
    provider: "public_page",
    text: caption,
    textHash: await socialHash(caption),
    expectedAssetCount: 2,
    coverage: "complete_manifest",
    assets,
  });
  return {
    post,
    requestedCanonical: "https://vm.tiktok.com/Example11/",
    canonical,
    platform: "tiktok" as const,
    sourceHash: await socialHash(preparedPostSourceIdentity(canonical, post)),
    recipeHash: "b".repeat(64),
    downloaderVersion: "public-post-page-v1",
    title: "A real order",
    authorName: "Author",
    durationMs: 0,
    language: "und",
    observedAt: 1793268000000,
    transcript: {
      origin: "none" as const,
      model: null,
      provider: null,
      inputSha256: null,
    },
    segments: [],
    frames: assets.map((asset) => ({
      id: `${asset.id}-frame-000`,
      assetId: asset.id,
      assetIndex: asset.index,
      timestampMs: 0,
      sha256: asset.contentHash,
      bytes: 1010,
      width: 500,
      height: 600,
    })),
  };
}

it("retains the complete ordered proof and untimed citations for a Photo Mode share", async () => {
  const value = await makePreparedEvidence(await photoEvidence());
  const citations = neutralCloudObservations(value.evidence);
  expect(citations.map((o) => [o.kind, o.assetIndex, o.startMs])).toEqual([
    ["caption", 0, null],
    ["image_observation", 0, null],
    ["image_observation", 1, null],
  ]);
  expect(
    preparedCreditQuote(0, "gateway", false, "meta/muse-ember", "post").maximum,
  ).toBe(2);
});

it("rejects incomplete and relabeled post media even before it is sent to the model", async () => {
  const input = await photoEvidence();
  await expect(
    makePreparedEvidence({ ...input, frames: input.frames.slice(0, 1) }),
  ).rejects.toThrow("PREPARED_POST_COVERAGE_INVALID");
  await expect(
    makePreparedEvidence({
      ...input,
      canonical: canonical.replace(/\d+$/, "7240568259186019631"),
    }),
  ).rejects.toThrow("PREPARED_POST_COVERAGE_INVALID");
  expect(
    preparedPostEvidence.safeParse({ ...input.post, expectedAssetCount: 3 })
      .success,
  ).toBe(false);
});

it("retains the native video caption without treating one download as ordered coverage", async () => {
  const photo = await photoEvidence();
  const video = canonical.replace("/photo/", "/video/");
  const post = preparedPostEvidence.parse({
    ...photo.post,
    provider: "pinned_video_downloader",
    coverage: "single_downloaded_video",
    expectedAssetCount: 1,
    assets: [
      {
        ...photo.post.assets[0],
        kind: "video",
        mime: "video/mp4",
        durationMs: 2000,
        audioStatus: "none",
        animated: false,
      },
    ],
  });
  expect(
    preparedPostEvidence.safeParse({ ...post, coverage: "complete_manifest" })
      .success,
  ).toBe(false);
  const input = {
    ...photo,
    post,
    canonical: video,
    durationMs: 2000,
    frames: photo.frames.slice(0, 1),
    sourceHash: await socialHash(preparedPostSourceIdentity(video, post)),
  };
  const result = await makePreparedEvidence(input);
  expect(result.evidence.post?.coverage).toBe("single_downloaded_video");
  expect(neutralCloudObservations(result.evidence).map((o) => o.kind)).toEqual([
    "caption",
    "video_observation",
  ]);
  await expect(
    makePreparedEvidence({
      ...input,
      canonical,
      sourceHash: await socialHash(preparedPostSourceIdentity(canonical, post)),
    }),
  ).rejects.toThrow("PREPARED_POST_COVERAGE_INVALID");
});

it("checks social media type from the platform when ordered preparation is enabled", () => {
  for (const url of [
    canonical,
    canonical.replace("/photo/", "/video/"),
    "https://vm.tiktok.com/Example11/",
    "https://www.instagram.com/reel/ABCdef12345/",
    "https://www.instagram.com/share/p/Example11/",
  ]) {
    expect(usesOrderedPostPreparation(url, false)).toBe(false);
    expect(usesOrderedPostPreparation(url, true)).toBe(true);
  }
  expect(
    usesOrderedPostPreparation("https://x.com/i/web/status/123", false),
  ).toBe(true);
  expect(usesOrderedPostPreparation("https://vimeo.com/12345", true)).toBe(
    false,
  );
});

it("allows a TikTok-only rollout across share URLs without enabling Instagram", () => {
  vi.stubEnv("VIBESCROLL_ORDERED_SOCIAL_ENABLED", undefined);
  vi.stubEnv("VIBESCROLL_TIKTOK_ORDERED_ENABLED", "true");
  try {
    expect(usesOrderedPostPreparation(canonical)).toBe(true);
    expect(usesOrderedPostPreparation("https://vm.tiktok.com/Example11/")).toBe(
      true,
    );
    expect(
      usesOrderedPostPreparation("https://www.instagram.com/p/ABCdef12345/"),
    ).toBe(false);
    expect(usesOrderedPostPreparation(canonical, false)).toBe(false);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("groups comparable re-encodes from a verified creator without matching reordered or edited posts", async () => {
  const { post } = await photoEvidence();
  const original = {
    ...post,
    assets: post.assets.map((asset, index) => ({
      ...asset,
      fingerprints: [
        {
          difference: index ? "ffffffffffffffff" : "1111111111111111",
          mean: 80,
        },
      ],
    })),
  };
  const reencoded = {
    ...original,
    assets: original.assets.map((asset, index) => ({
      ...asset,
      contentHash: "c".repeat(64),
      fingerprints: [
        {
          difference: index ? "fffffffffffffffe" : "1111111111111110",
          mean: 83,
        },
      ],
    })),
  };
  expect(isEquivalentPreparedRepost(original, reencoded)).toBe(true);
  expect(
    isEquivalentPreparedRepost(original, {
      ...reencoded,
      assets: [...reencoded.assets].reverse(),
    }),
  ).toBe(false);
  expect(
    isEquivalentPreparedRepost(original, {
      ...reencoded,
      text: "Updated caption",
    }),
  ).toBe(false);
});
