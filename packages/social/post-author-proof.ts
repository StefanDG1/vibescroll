import { z } from "zod";
import { platformPostKey } from "../sources/post-identity";
import { creatorProfileUrl } from "./creator-identity";

export const postAuthorProof = z.strictObject({
  version: z.literal("public-post-author-v1"),
  postKey: z
    .string()
    .regex(/^(instagram:[A-Za-z0-9_-]{5,30}|(?:tiktok|x):[0-9]{10,25})$/),
  creatorKey: z.string().regex(/^(instagram|tiktok|x):[0-9]{1,30}$/),
  handle: z.string().regex(/^[A-Za-z0-9_.]{1,30}$/),
  observedAt: z.number().int().positive(),
  method: z.enum([
    "instagram_embed",
    "instagram_media_api",
    "tiktok_page",
    "x_public_api",
  ]),
  inputCanonical: z.string().max(2048).optional(),
  resolvedCanonical: z.string().max(2048).optional(),
});
export type PostAuthorProof = z.infer<typeof postAuthorProof>;

export function tikTokShortUrl(raw: string) {
  try {
    if (raw.length > 2048 || /[\\\s]/.test(raw)) return null;
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (
      (["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname) &&
        /^\/[A-Za-z0-9]{5,30}\/?$/.test(url.pathname)) ||
      (["tiktok.com", "www.tiktok.com"].includes(url.hostname) &&
        /^\/t\/[A-Za-z0-9]{5,30}\/?$/.test(url.pathname))
    )
      return `${url.origin}${url.pathname}`;
  } catch {
    /* Untrusted input cannot become a network destination. */
  }
  return null;
}

export function postAuthorMatchesUrl(proof: PostAuthorProof, raw: string) {
  return (
    platformPostKey(raw) === proof.postKey ||
    (!!proof.inputCanonical &&
      !!tikTokShortUrl(raw) &&
      tikTokShortUrl(raw) === tikTokShortUrl(proof.inputCanonical))
  );
}

export function validPostAuthorProof(raw: unknown, canonical: string) {
  const parsed = postAuthorProof.safeParse(raw);
  if (!parsed.success) return null;
  const proof = parsed.data,
    platform = proof.postKey.split(":")[0];
  if (
    !postAuthorMatchesUrl(proof, canonical) ||
    !!proof.inputCanonical !== !!proof.resolvedCanonical ||
    (proof.inputCanonical !== undefined &&
      (platform !== "tiktok" ||
        !tikTokShortUrl(proof.inputCanonical) ||
        platformPostKey(proof.resolvedCanonical!) !== proof.postKey)) ||
    !proof.creatorKey.startsWith(`${platform}:`) ||
    (!(platform === "instagram" && proof.method === "instagram_media_api") &&
      proof.method !==
        (
          {
            instagram: "instagram_embed",
            tiktok: "tiktok_page",
            x: "x_public_api",
          } as const
        )[platform as "instagram" | "tiktok" | "x"])
  )
    return null;
  try {
    creatorProfileUrl(proof.creatorKey, proof.handle);
  } catch {
    return null;
  }
  return proof;
}
