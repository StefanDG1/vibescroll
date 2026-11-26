import { equivalentRepostMedia } from "./repost-signature";
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
export const downloadedVideoPostMetadata = z.strictObject({
  platform: z.enum(["instagram", "tiktok"]),
  postId: stableId,
  authorId: z.string().regex(/^[0-9]{1,30}$/),
  authorHandle: z.string().regex(/^[A-Za-z0-9_.]{1,30}$/),
  text: z.string().max(60000),
});
const socialPost = z
  .strictObject({
    version: z.literal("social-post-evidence-v1"),
    platform: z.enum(["instagram", "tiktok"]),
    postId: stableId,
    authorId: stableId,
    authorHandle: z.string().regex(/^[A-Za-z0-9_.]{1,40}$/),
    publishedAt: z.number().int().positive().max(4102444800000).nullable(),
    provider: z.enum([
      "public_page",
      "instagram_embed",
      "instagram_graph",
      "pinned_video_downloader",
    ]),
    text: z.string().max(60000),
    textHash: hash,
    expectedAssetCount: z.number().int().min(1).max(35),
    coverage: z.enum(["complete_manifest", "single_downloaded_video"]),
    assets: z.array(preparedPostAsset).min(1).max(35),
  })
  .superRefine((post, ctx) => {
    if (
      (post.coverage === "single_downloaded_video"
        ? post.provider !== "pinned_video_downloader" ||
          post.assets.length !== 1 ||
          post.assets[0]?.kind !== "video"
        : post.provider === "pinned_video_downloader") ||
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
    identity.canonical === canonical &&
    (post.coverage !== "single_downloaded_video" ||
      post.platform !== "tiktok" ||
      new URL(canonical).pathname.split("/")[2] === "video")
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

export function usesOrderedPostPreparation(raw: string, enabled?: boolean) {
  if (!URL.canParse(raw)) return false;
  const url = new URL(raw);
  const host = url.hostname.replace(/^www\./, "");
  if (host === "x.com") return true;
  const all =
    enabled ?? process.env.VIBESCROLL_ORDERED_SOCIAL_ENABLED === "true";
  if (host === "instagram.com") return all;
  return (
    ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(host) &&
    (all ||
      (enabled === undefined &&
        process.env.VIBESCROLL_TIKTOK_ORDERED_ENABLED === "true"))
  );
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
  return (
    caption(left) === caption(right) &&
    equivalentRepostMedia(left.assets, right.assets, caption(left).length >= 16)
  );
}
