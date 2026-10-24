import { z } from "zod";
import { socialPostUrl } from "./identity.mjs";
import { canonicalJson } from "../contracts/canonical-json.mjs";

export async function socialHash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const socialPlatform = z.enum(["instagram", "tiktok"]);
const stableId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const crop = z
  .strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine(
    (value) => value.x + value.width <= 1 && value.y + value.height <= 1,
    "Crop exceeds original image",
  );
const assetBase = {
  id: stableId,
  index: z.number().int().min(0).max(34),
  contentHash: sha256,
  bytes: z.number().int().positive().max(250_000_000),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
};
export const orderedAsset = z.discriminatedUnion("kind", [
  z.strictObject({
    ...assetBase,
    kind: z.literal("image"),
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    inspected: z.boolean(),
  }),
  z.strictObject({
    ...assetBase,
    kind: z.literal("video"),
    mime: z.enum(["video/mp4", "video/webm"]),
    durationMs: z.number().int().positive().max(600_000),
    inspected: z.boolean(),
    audioInspected: z.boolean(),
  }),
]);
export const socialPostSchema = z
  .strictObject({
    schemaVersion: z.literal("social-post-v1"),
    platform: socialPlatform,
    creatorId: stableId,
    postId: stableId,
    canonical: z.string().max(2048),
    publishedAt: timestamp.nullable(),
    observedAt: timestamp,
    dateReliability: z.enum(["provider", "unknown"]),
    caption: z.string().max(60_000),
    captionHash: sha256,
    assets: z.array(orderedAsset).min(1).max(35),
    expectedAssetCount: z.number().int().min(1).max(35).nullable(),
    coverage: z.enum(["complete_manifest", "partial", "unknown"]),
    revisionHash: sha256,
    providerEvidenceId: z.string().min(1).max(200),
  })
  .superRefine((post, ctx) => {
    let identity: ReturnType<typeof socialPostUrl>;
    try {
      identity = socialPostUrl(post.canonical);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid canonical social URL" });
      return;
    }
    if (
      identity.platform !== post.platform ||
      (post.platform === "tiktok" && identity.postKey !== post.postId)
    )
      ctx.addIssue({ code: "custom", message: "Post identity mismatch" });
    if (
      new Set(post.assets.map((a) => a.id)).size !== post.assets.length ||
      new Set(post.assets.map((a) => a.index)).size !== post.assets.length ||
      post.assets.some((a, i) => i > 0 && post.assets[i - 1].index >= a.index)
    )
      ctx.addIssue({
        code: "custom",
        message: "Child identity/order mismatch",
      });
    if (
      post.assets.reduce((n, a) => n + a.bytes, 0) > 250_000_000 ||
      post.assets.reduce(
        (n, a) => n + (a.kind === "video" ? a.durationMs : 0),
        0,
      ) > 600_000
    )
      ctx.addIssue({
        code: "custom",
        message: "Post exceeds cumulative bytes or video minutes",
      });
    if (
      (post.publishedAt === null) !== (post.dateReliability === "unknown") ||
      (post.publishedAt !== null &&
        post.publishedAt > post.observedAt + 300_000)
    )
      ctx.addIssue({ code: "custom", message: "Unreliable publication date" });
    if (
      post.coverage === "complete_manifest" &&
      (post.expectedAssetCount !== post.assets.length ||
        post.assets.some((a, i) => a.index !== i))
    )
      ctx.addIssue({ code: "custom", message: "Incomplete ordered manifest" });
  });
export type SocialPost = z.infer<typeof socialPostSchema>;

/** A supplied link is a user's reference, not evidence of platform retrieval. */
export const providedMediaMetadata = z.strictObject({
  schemaVersion: z.literal("provided-media-v1"),
  submissionId: stableId,
  originalUrl: z
    .string()
    .max(2048)
    .nullable()
    .refine((value) => {
      if (value === null) return true;
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.port &&
          !url.hash &&
          url.href === value
        );
      } catch {
        return false;
      }
    }, "Invalid supplied HTTPS reference"),
  publishedAt: z.null(),
  observedAt: timestamp,
  dateReliability: z.literal("unknown"),
  provenance: z.literal("user_supplied_unverified"),
  caption: z.string().max(60_000),
  expectedAssetCount: z.number().int().min(1).max(35),
});
export const providedMediaSchema = providedMediaMetadata
  .extend({
    captionHash: sha256,
    assets: z.array(orderedAsset).min(1).max(35),
    coverage: z.enum(["complete_manifest", "partial", "unknown"]),
    revisionHash: sha256,
  })
  .superRefine((post, ctx) => {
    if (
      new Set(post.assets.map((a) => a.id)).size !== post.assets.length ||
      new Set(post.assets.map((a) => a.index)).size !== post.assets.length ||
      post.assets.some(
        (a, i) => i > 0 && post.assets[i - 1].index >= a.index,
      ) ||
      post.assets.reduce((n, a) => n + a.bytes, 0) > 250_000_000 ||
      post.assets.reduce(
        (n, a) => n + (a.kind === "video" ? a.durationMs : 0),
        0,
      ) > 600_000 ||
      post.assets.length > post.expectedAssetCount ||
      post.assets.some((a) => a.index >= post.expectedAssetCount) ||
      (post.coverage === "complete_manifest" &&
        (post.assets.length !== post.expectedAssetCount ||
          post.assets.some((a, i) => a.index !== i)))
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid supplied ordered manifest",
      });
  });
export type ProvidedMedia = z.infer<typeof providedMediaSchema>;
export const orderedPostSchema = z.union([
  socialPostSchema,
  providedMediaSchema,
]);
export type OrderedPost = z.infer<typeof orderedPostSchema>;

const evidenceBase = {
  id: stableId,
  postRevisionHash: sha256,
  assetId: stableId,
  assetIndex: z.number().int().min(0).max(34),
  text: z.string().min(1).max(6000),
  textHash: sha256,
};
export const socialEvidenceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...evidenceBase,
    kind: z.literal("image_observation"),
    crop: crop.optional(),
    basis: z.enum(["visible", "ocr"]),
    uncertainty: z.string().max(500),
  }),
  z.strictObject({
    ...evidenceBase,
    kind: z.literal("video_observation"),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    basis: z.enum(["transcript", "visible", "ocr"]),
    uncertainty: z.string().max(500),
  }),
]);
export type SocialEvidence = z.infer<typeof socialEvidenceSchema>;
export async function socialRevisionHash(
  post: Omit<SocialPost, "revisionHash"> | SocialPost,
) {
  return socialHash(
    canonicalJson({
      version: post.schemaVersion,
      platform: post.platform,
      creatorId: post.creatorId,
      postId: post.postId,
      canonical: socialPostUrl(post.canonical).canonical,
      captionHash: post.captionHash,
      assets: post.assets.map(({ inspected: _inspected, ...asset }) =>
        asset.kind === "video"
          ? (({ audioInspected: _audio, ...rest }) => rest)(asset)
          : asset,
      ),
      expectedAssetCount: post.expectedAssetCount,
      coverage: post.coverage,
    }),
  );
}
export async function orderedRevisionHash(
  post:
    | Omit<SocialPost, "revisionHash">
    | SocialPost
    | Omit<ProvidedMedia, "revisionHash">
    | ProvidedMedia,
) {
  if (post.schemaVersion === "social-post-v1") return socialRevisionHash(post);
  return socialHash(
    canonicalJson({
      version: post.schemaVersion,
      submissionId: post.submissionId,
      originalUrl: post.originalUrl,
      provenance: post.provenance,
      captionHash: post.captionHash,
      assets: post.assets.map(({ inspected: _inspected, ...asset }) =>
        asset.kind === "video"
          ? (({ audioInspected: _audio, ...rest }) => rest)(asset)
          : asset,
      ),
      expectedAssetCount: post.expectedAssetCount,
      coverage: post.coverage,
    }),
  );
}
export async function validateSocialEvidence(
  postValue: unknown,
  evidenceValue: unknown,
) {
  const post = socialPostSchema.parse(postValue);
  return validateOrderedEvidence(post, evidenceValue).then((value) => ({
    ...value,
    post,
  }));
}
export async function validateOrderedEvidence(
  postValue: unknown,
  evidenceValue: unknown,
) {
  const post = orderedPostSchema.parse(postValue);
  const evidence = z.array(socialEvidenceSchema).max(200).parse(evidenceValue);
  if (new Set(evidence.map((e) => e.id)).size !== evidence.length)
    throw Error("DUPLICATE_SOCIAL_EVIDENCE");
  if (
    (await socialHash(post.caption)) !== post.captionHash ||
    (await orderedRevisionHash(post)) !== post.revisionHash
  )
    throw Error("SOCIAL_CONTENT_HASH_MISMATCH");
  for (const e of evidence) {
    const asset = post.assets.find(
      (a) => a.id === e.assetId && a.index === e.assetIndex,
    );
    if (
      !asset ||
      !asset.inspected ||
      e.postRevisionHash !== post.revisionHash ||
      (e.kind === "image_observation"
        ? asset.kind !== "image"
        : asset.kind !== "video" ||
          e.startMs >= e.endMs ||
          e.endMs > asset.durationMs ||
          (e.basis === "transcript" && !asset.audioInspected))
    )
      throw Error("INVALID_SOCIAL_EVIDENCE_BINDING");
    if ((await socialHash(e.text)) !== e.textHash)
      throw Error("SOCIAL_EVIDENCE_HASH_MISMATCH");
  }
  return { post, evidence };
}

export const socialRightsSchema = z.strictObject({
  version: z.literal("social-rights-v1"),
  evidenceId: z.string().min(1).max(200),
  provider: z.string().min(1).max(100),
  platforms: z.array(socialPlatform).min(1).max(2),
  creatorScope: z.enum(["specified", "public_creators"]),
  creatorIds: z.array(stableId).max(100),
  collection: z.boolean(),
  mediaAcquisition: z.boolean(),
  aiProcessing: z.boolean(),
  crossCustomerReuse: z.boolean(),
  routes: z.array(z.enum(["own_subscription", "managed_api"])).max(2),
  reviewedAt: timestamp,
  expiresAt: timestamp,
  maxRetentionMs: z.number().int().positive().max(31_536_000_000),
  deletionWithinMs: z.number().int().positive().max(604_800_000),
});
export type SocialRights = z.infer<typeof socialRightsSchema>;
export function requireSocialRights(
  value: unknown,
  request: {
    provider: string;
    platform: "instagram" | "tiktok";
    creatorId?: string;
    workload: "discovery" | "media" | "analysis" | "reuse";
    route?: "own_subscription" | "managed_api";
  },
  now: number,
) {
  const rights = socialRightsSchema.parse(value);
  if (
    rights.provider !== request.provider ||
    !rights.platforms.includes(request.platform) ||
    rights.reviewedAt > now ||
    rights.expiresAt <= now ||
    !rights.collection ||
    (rights.creatorScope === "specified" &&
      (!request.creatorId || !rights.creatorIds.includes(request.creatorId))) ||
    (request.workload !== "discovery" && !rights.mediaAcquisition) ||
    (["analysis", "reuse"].includes(request.workload) &&
      (!rights.aiProcessing ||
        !request.route ||
        !rights.routes.includes(request.route))) ||
    (request.workload === "reuse" && !rights.crossCustomerReuse)
  )
    throw Error("SOCIAL_PROVIDER_PERMISSION_PENDING");
  return rights;
}
