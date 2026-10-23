import { z } from "zod";
import { socialPostUrl } from "./identity.mjs";

const stableId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
export const orderedIntakeMetadata = z
  .strictObject({
    schemaVersion: z.literal("social-post-v1"),
    platform: z.enum(["instagram", "tiktok"]),
    creatorId: stableId,
    postId: stableId,
    canonical: z.string().max(2048),
    publishedAt: timestamp.nullable(),
    observedAt: timestamp,
    dateReliability: z.enum(["provider", "unknown"]),
    caption: z.string().max(60000),
    expectedAssetCount: z.number().int().min(1).max(35).nullable(),
    providerEvidenceId: z.string().min(1).max(200),
  })
  .superRefine((value, ctx) => {
    let identity;
    try {
      identity = socialPostUrl(value.canonical);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Invalid social canonical identity",
      });
      return;
    }
    if (
      identity.canonical !== value.canonical ||
      identity.platform !== value.platform ||
      (value.platform === "tiktok" && identity.postKey !== value.postId) ||
      (value.publishedAt === null) !== (value.dateReliability === "unknown") ||
      (value.publishedAt !== null &&
        value.publishedAt > value.observedAt + 300000)
    )
      ctx.addIssue({
        code: "custom",
        message: "Changed social source identity or date",
      });
  });
export const orderedIntakeAssets = z
  .array(
    z.strictObject({
      id: stableId,
      index: z.number().int().min(0).max(34),
      kind: z.enum(["image", "video"]),
      key: z.string().min(1).max(1024),
      bytes: z.number().int().positive().max(250000000),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  )
  .min(1)
  .max(35)
  .superRefine((assets, ctx) => {
    if (
      new Set(assets.map((a) => a.id)).size !== assets.length ||
      new Set(assets.map((a) => a.key)).size !== assets.length ||
      assets.some((a, i) => i > 0 && assets[i - 1].index >= a.index) ||
      assets.reduce((n, a) => n + a.bytes, 0) > 250000000
    )
      ctx.addIssue({
        code: "custom",
        message: "Changed ordered asset identity/order/byte bound",
      });
  });
