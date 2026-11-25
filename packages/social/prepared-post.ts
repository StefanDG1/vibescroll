import { z } from "zod";
import { canonicalJson } from "../contracts/canonical-json.mjs";
import { socialHash } from "./contracts";
import { socialPostUrl } from "./identity.mjs";
import {
  preparedPostAsset,
  xPostCanonicalMatches,
  xPostEvidence,
} from "./x-post";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const stableId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const socialPost = z
  .strictObject({
    version: z.literal("social-post-evidence-v1"),
    platform: z.enum(["instagram", "tiktok"]),
    postId: stableId,
    authorId: stableId,
    authorHandle: z.string().regex(/^[A-Za-z0-9_.]{1,40}$/),
    publishedAt: z.number().int().positive().max(4102444800000).nullable(),
    provider: z.enum(["public_page", "instagram_embed", "instagram_graph"]),
    text: z.string().max(60000),
    textHash: hash,
    expectedAssetCount: z.number().int().min(1).max(35),
    coverage: z.literal("complete_manifest"),
    assets: z.array(preparedPostAsset).min(1).max(35),
  })
  .superRefine((post, ctx) => {
    if (
      post.assets.length !== post.expectedAssetCount ||
      post.assets.some(
        (asset, index) =>
          asset.index !== index || asset.id !== `asset-${index + 1}`,
      ) ||
      post.assets.reduce((bytes, asset) => bytes + asset.bytes, 0) >
        50 * 1024 * 1024 ||
      post.assets.reduce(
        (ms, asset) => ms + (asset.kind === "video" ? asset.durationMs : 0),
        0,
      ) > 600000
    )
      ctx.addIssue({
        code: "custom",
        message: "Incomplete or over-limit post manifest.",
      });
  });

export const preparedPostEvidence = z.discriminatedUnion("version", [
  xPostEvidence,
  socialPost,
]);
export type PreparedPostEvidence = z.infer<typeof preparedPostEvidence>;

export function preparedPostCanonicalMatches(
  canonical: string,
  post: PreparedPostEvidence,
) {
  if (post.version === "x-post-evidence-v1")
    return xPostCanonicalMatches(canonical, post);
  const identity = socialPostUrl(canonical);
  return (
    identity.platform === post.platform &&
    identity.postKey === post.postId &&
    identity.canonical === canonical
  );
}

export function preparedPostSourceIdentity(
  canonical: string,
  post: PreparedPostEvidence,
) {
  return canonicalJson(
    post.version === "x-post-evidence-v1"
      ? { canonical, text: post.text, assets: post.assets }
      : { canonical, post },
  );
}

export function usesOrderedPostPreparation(raw: string, enabled: boolean) {
  const url = new URL(raw);
  const host = url.hostname.replace(/^www\./, "");
  if (host === "x.com") return true;
  if (!enabled) return false;
  return [
    "instagram.com",
    "tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
  ].includes(host);
}

export function preparedMediaContentKey(post: PreparedPostEvidence) {
  return socialHash(
    canonicalJson({
      caption: post.text.normalize("NFC").trim().replace(/\s+/g, " "),
      assets: post.assets.map((asset) => ({
        kind: asset.kind,
        hash: asset.contentHash,
      })),
    }),
  );
}

export function isEquivalentPreparedRepost(
  left: PreparedPostEvidence,
  right: PreparedPostEvidence,
) {
  const caption = (post: PreparedPostEvidence) =>
    post.text.normalize("NFC").trim().replace(/\s+/g, " ");
  if (
    left.assets.length !== right.assets.length ||
    caption(left) !== caption(right)
  )
    return false;
  if (
    left.assets.every(
      (asset, index) =>
        asset.kind === right.assets[index].kind &&
        asset.contentHash === right.assets[index].contentHash,
    )
  )
    return true;
  // Perceptual matches require corroborating text and same ordered composition.
  // Flat covers, missing samples and material edits remain separate.
  if (caption(left).length < 16 || !left.assets.length) return false;
  return left.assets.every((asset, index) => {
    const other = right.assets[index];
    if (
      asset.kind !== other.kind ||
      Math.abs(
        Math.log((asset.width * other.height) / (other.width * asset.height)),
      ) > 0.08
    )
      return false;
    if (
      asset.kind === "video" &&
      (other.kind !== "video" ||
        Math.abs(asset.durationMs - other.durationMs) > 500 ||
        asset.fingerprints?.length !== 3)
    )
      return false;
    return (
      !!asset.fingerprints &&
      asset.fingerprints.length === other.fingerprints?.length &&
      asset.fingerprints.every((sample, n) => {
        const target = other.fingerprints![n];
        return (
          Math.abs(sample.mean - target.mean) <= 10 &&
          differenceDistance(sample.difference, target.difference) <= 5
        );
      })
    );
  });
}

function differenceDistance(left: string, right: string) {
  let count = 0;
  for (let index = 0; index < left.length; index++) {
    let difference = parseInt(left[index], 16) ^ parseInt(right[index], 16);
    while (difference) {
      difference &= difference - 1;
      count++;
    }
  }
  return count;
}
