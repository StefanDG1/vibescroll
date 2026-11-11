import { z } from "zod";
import { xPostUrl } from "../media/x-identity.mjs";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const assetBase = {
  id: z.string().regex(/^asset-[1-9][0-9]?$/),
  index: z.number().int().min(0).max(34),
  contentHash: hash,
  bytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
};
export const xPostAsset = z.discriminatedUnion("kind", [
  z.strictObject({
    ...assetBase,
    kind: z.literal("image"),
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  }),
  z.strictObject({
    ...assetBase,
    kind: z.literal("video"),
    mime: z.literal("video/mp4"),
    durationMs: z.number().int().positive().max(600000),
    animated: z.boolean(),
    audioStatus: z.enum(["none", "silent", "prepared"]),
  }),
]);
export const xPostEvidence = z
  .strictObject({
    version: z.literal("x-post-evidence-v1"),
    postId: z.string().regex(/^[0-9]{2,20}$/),
    provider: z.enum(["gallery-dl", "fxtwitter"]),
    text: z.string().max(60000),
    textHash: hash,
    expectedAssetCount: z.number().int().min(0).max(35),
    coverage: z.literal("complete_manifest"),
    assets: z.array(xPostAsset).max(35),
  })
  .superRefine((post, ctx) => {
    if (
      (!post.text.trim() && !post.assets.length) ||
      post.assets.length !== post.expectedAssetCount ||
      post.assets.some((a, i) => a.index !== i || a.id !== `asset-${i + 1}`) ||
      post.assets.reduce((n, a) => n + a.bytes, 0) > 50 * 1024 * 1024 ||
      post.assets.reduce(
        (n, a) => n + (a.kind === "video" ? a.durationMs : 0),
        0,
      ) > 600000
    )
      ctx.addIssue({
        code: "custom",
        message: "Incomplete or over-limit X post.",
      });
  });
export type XPostEvidence = z.infer<typeof xPostEvidence>;
export function xPostCanonicalMatches(canonical: string, post: XPostEvidence) {
  return (
    xPostUrl(canonical).postId === post.postId &&
    xPostUrl(canonical).canonical === canonical
  );
}
