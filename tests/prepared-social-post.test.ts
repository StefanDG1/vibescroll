import { expect, it } from "vitest";
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

it("keeps the verified video flow separate during the ordered-media rollout", () => {
  expect(usesOrderedPostPreparation(canonical, false)).toBe(false);
  expect(usesOrderedPostPreparation(canonical, true)).toBe(true);
  expect(
    usesOrderedPostPreparation("https://vm.tiktok.com/Example11/", true),
  ).toBe(true);
  expect(
    usesOrderedPostPreparation(
      "https://www.instagram.com/reel/ABCdef12345/",
      true,
    ),
  ).toBe(false);
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
