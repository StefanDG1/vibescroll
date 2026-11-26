import { z } from "zod";
import { socialHash } from "./contracts";
import type { PreparedPostEvidence } from "./prepared-post";

const base = {
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  fingerprints: z
    .array(
      z.object({
        difference: z.string().regex(/^[a-f0-9]{16}$/),
        mean: z.number().int().min(0).max(255),
      }),
    )
    .min(1)
    .max(3)
    .optional(),
};
const asset = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("image") }),
  z.object({
    ...base,
    kind: z.literal("video"),
    durationMs: z.number().int().positive().max(600000),
  }),
]);
export const repostSignature = z.object({
  captionHash: z.string().regex(/^[a-f0-9]{64}$/),
  captionLength: z.number().int().min(0).max(60000),
  assets: z.array(asset).max(35),
});
type ComparableAsset = z.infer<typeof asset>;

export async function makeRepostSignature(post: PreparedPostEvidence) {
  const caption = post.text.normalize("NFC").trim().replace(/\s+/g, " ");
  return repostSignature.parse({
    captionHash: await socialHash(caption),
    captionLength: caption.length,
    assets: post.assets,
  });
}

export function equivalentRepostSignatures(
  left: z.infer<typeof repostSignature>,
  right: z.infer<typeof repostSignature>,
) {
  return (
    left.captionHash === right.captionHash &&
    left.captionLength === right.captionLength &&
    equivalentRepostMedia(left.assets, right.assets, left.captionLength >= 16)
  );
}

export function equivalentRepostMedia(
  left: ComparableAsset[],
  right: ComparableAsset[],
  allowPerceptual: boolean,
) {
  if (left.length !== right.length) return false;
  if (
    left.every(
      (a, i) =>
        a.kind === right[i].kind && a.contentHash === right[i].contentHash,
    )
  )
    return true;
  if (!allowPerceptual || !left.length) return false;
  return left.every((a, i) => {
    const b = right[i];
    if (
      a.kind !== b.kind ||
      Math.abs(Math.log((a.width * b.height) / (b.width * a.height))) > 0.08
    )
      return false;
    if (
      a.kind === "video" &&
      (b.kind !== "video" ||
        Math.abs(a.durationMs - b.durationMs) > 500 ||
        a.fingerprints?.length !== 3)
    )
      return false;
    return (
      !!a.fingerprints &&
      a.fingerprints.length === b.fingerprints?.length &&
      a.fingerprints.every(
        (sample, n) =>
          Math.abs(sample.mean - b.fingerprints![n].mean) <= 10 &&
          distance(sample.difference, b.fingerprints![n].difference) <= 5,
      )
    );
  });
}
function distance(left: string, right: string) {
  let count = 0;
  for (let i = 0; i < left.length; i++) {
    let value = parseInt(left[i], 16) ^ parseInt(right[i], 16);
    while (value) {
      value &= value - 1;
      count++;
    }
  }
  return count;
}
