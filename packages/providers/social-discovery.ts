import { z } from "zod";
import { canonicalJson } from "../contracts/canonical-json.mjs";
import { socialHash, socialPlatform } from "../social/contracts";
import { discoveredPostSchema, type DiscoveredPost } from "../social/discovery";
import { socialPostUrl } from "../social/identity.mjs";

// Field mappings reviewed October 23, 2026 against the actors' official examples:
// https://apify.com/apify/instagram-scraper
// https://apify.com/clockworks/tiktok-scraper
// This module normalizes already-obtained metadata. It grants no access/rights,
// starts no actor and makes no completeness or media-content hash assertion.
const contextSchema = z.strictObject({
  platform: socialPlatform,
  creatorId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  observedAt: z.number().int().nonnegative().max(8_640_000_000_000_000),
});
type Context = z.infer<typeof contextSchema>;
type IssueCode =
  | "invalid_item"
  | "date_unknown"
  | "child_count_unknown"
  | "duration_unknown"
  | "caption_unavailable";
type Issue = { index: number; code: IssueCode };
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const object = z.record(z.string(), z.unknown());
function duration(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 600
  )
    return null;
  // The documented actor field is seconds, not milliseconds. Round up so
  // fractional seconds cannot understate the requested preparation budget.
  return Math.ceil(value * 1000);
}
function isoTime(value: unknown): number | null {
  if (typeof value !== "string" || !z.iso.datetime().safeParse(value).success)
    return null;
  const at = Date.parse(value);
  return Number.isSafeInteger(at) && at >= 0 ? at : null;
}
function publication(
  row: Record<string, unknown>,
  platform: Context["platform"],
  observedAt: number,
) {
  const iso = platform === "instagram" ? row.timestamp : row.createTimeISO;
  let at = isoTime(iso);
  if (
    platform === "tiktok" &&
    row.createTime !== undefined &&
    row.createTime !== null
  ) {
    const seconds = row.createTime;
    const epoch =
      typeof seconds === "number" &&
      Number.isSafeInteger(seconds) &&
      seconds >= 0 &&
      Number.isSafeInteger(seconds * 1000)
        ? seconds * 1000
        : null;
    if (iso !== undefined && iso !== null) {
      if (at === null || epoch === null || Math.floor(at / 1000) !== seconds)
        return null;
    } else at = epoch;
  }
  return at !== null && at <= observedAt + 300000 ? at : null;
}
function stableCreator(row: Record<string, unknown>, context: Context) {
  const author =
    context.platform === "tiktok" ? object.safeParse(row.authorMeta) : null;
  const value =
    context.platform === "instagram"
      ? row.ownerId
      : author?.success
        ? author.data.id
        : undefined;
  if (!id.safeParse(value).success) throw Error("INVALID_PROVIDER_ITEM");
  if (value !== context.creatorId) throw Error("CREATOR_IDENTITY_CHANGED");
  if (
    author?.success &&
    author.data.privateAccount !== undefined &&
    author.data.privateAccount !== false
  )
    throw Error("INVALID_PROVIDER_ITEM");
}
function instagramMedia(row: Record<string, unknown>) {
  if (row.type === "Image")
    return {
      assetCount: 1,
      videoDurationMs: 0,
      mediaKinds: ["image"] as ("image" | "video")[],
      children: [],
    };
  if (row.type === "Video")
    return {
      assetCount: 1,
      videoDurationMs: duration(row.videoDuration),
      mediaKinds: ["video"] as ("image" | "video")[],
      children: [],
    };
  if (
    row.type !== "Sidecar" ||
    !Array.isArray(row.childPosts) ||
    !row.childPosts.length ||
    row.childPosts.length > 35
  )
    throw Error("INVALID_PROVIDER_ITEM");
  const children = row.childPosts.map((raw) => {
    const child = object.parse(raw);
    if (
      !id.safeParse(child.id).success ||
      !["Image", "Video"].includes(child.type as string)
    )
      throw Error("INVALID_PROVIDER_ITEM");
    return {
      id: child.id as string,
      kind: child.type === "Video" ? ("video" as const) : ("image" as const),
      durationMs: child.type === "Video" ? duration(child.videoDuration) : 0,
    };
  });
  if (new Set(children.map((c) => c.id)).size !== children.length)
    throw Error("INVALID_PROVIDER_ITEM");
  return {
    // A returned child array does not prove an expected/full child count.
    assetCount: null,
    videoDurationMs: null,
    mediaKinds: ["image", "video"].filter((kind) =>
      children.some((c) => c.kind === kind),
    ) as ("image" | "video")[],
    children,
  };
}
function tiktokMedia(row: Record<string, unknown>) {
  if (row.isSlideshow === true) {
    if (
      !Array.isArray(row.slideshowImageLinks) ||
      !row.slideshowImageLinks.length ||
      row.slideshowImageLinks.length > 35
    )
      throw Error("INVALID_PROVIDER_ITEM");
    for (const raw of row.slideshowImageLinks) {
      const link = object.parse(raw);
      // These URLs are delivery hints, not stable child IDs or downloadable
      // capabilities. They are never returned, fetched or used as content hashes.
      if (
        typeof link.tiktokLink !== "string" ||
        !link.tiktokLink ||
        link.tiktokLink.length > 4096 ||
        typeof link.downloadLink !== "string" ||
        !link.downloadLink ||
        link.downloadLink.length > 4096
      )
        throw Error("INVALID_PROVIDER_ITEM");
    }
    return {
      assetCount: null,
      videoDurationMs: 0,
      mediaKinds: ["image"] as ("image" | "video")[],
      children: row.slideshowImageLinks.map((_, index) => ({ index })),
    };
  }
  if (row.isSlideshow !== undefined && row.isSlideshow !== false)
    throw Error("INVALID_PROVIDER_ITEM");
  if (Array.isArray(row.slideshowImageLinks) && row.slideshowImageLinks.length)
    throw Error("INVALID_PROVIDER_ITEM");
  const video = object.safeParse(row.videoMeta);
  if (!video.success) throw Error("INVALID_PROVIDER_ITEM");
  return {
    assetCount: 1,
    videoDurationMs: duration(video.data.duration),
    mediaKinds: ["video"] as ("image" | "video")[],
    children: [],
  };
}

export async function normalizeApifyDiscovery(
  input: unknown,
  contextValue: Context,
) {
  const context = contextSchema.parse(contextValue);
  if (!Array.isArray(input) || input.length > 100)
    throw Error("DISCOVERY_RESPONSE_BOUND");
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw Error("DISCOVERY_RESPONSE_BOUND");
  }
  if (new TextEncoder().encode(serialized).byteLength > 1000000)
    throw Error("DISCOVERY_RESPONSE_BOUND");
  const posts: DiscoveredPost[] = [],
    issues: Issue[] = [],
    seen = new Map<string, string>();
  for (let index = 0; index < input.length; index++) {
    try {
      const row = object.parse(input[index]);
      stableCreator(row, context);
      const postId = id.parse(row.id);
      const identity = socialPostUrl(
        context.platform === "instagram"
          ? (row.url as string)
          : (row.webVideoUrl as string),
      );
      if (
        identity.platform !== context.platform ||
        (context.platform === "tiktok"
          ? identity.postKey !== postId
          : identity.postKey !== id.parse(row.shortCode))
      )
        throw Error("INVALID_PROVIDER_ITEM");
      const media =
        context.platform === "instagram"
          ? instagramMedia(row)
          : tiktokMedia(row);
      if (
        context.platform === "tiktok" &&
        identity.canonical.includes("/photo/") &&
        row.isSlideshow !== true
      )
        throw Error("INVALID_PROVIDER_ITEM");
      const publishedAt = publication(
        row,
        context.platform,
        context.observedAt,
      );
      const rawCaption =
        context.platform === "instagram" ? row.caption : row.text;
      if (
        rawCaption !== undefined &&
        rawCaption !== null &&
        (typeof rawCaption !== "string" || rawCaption.length > 60000)
      )
        throw Error("INVALID_PROVIDER_ITEM");
      const caption = typeof rawCaption === "string" ? rawCaption : "";
      const localIssues: IssueCode[] = [];
      if (publishedAt === null) localIssues.push("date_unknown");
      if (media.assetCount === null) localIssues.push("child_count_unknown");
      if (media.videoDurationMs === null) localIssues.push("duration_unknown");
      if (rawCaption === undefined || rawCaption === null)
        localIssues.push("caption_unavailable");
      const revisionKey = `apify-meta-v1:${await socialHash(canonicalJson({ platform: context.platform, creatorId: context.creatorId, postId, caption, publishedAt, assetCount: media.assetCount, videoDurationMs: media.videoDurationMs, mediaKinds: media.mediaKinds, children: media.children }))}`;
      const post = discoveredPostSchema.parse({
        platform: context.platform,
        creatorId: context.creatorId,
        postId,
        canonical: identity.canonical,
        publishedAt,
        observedAt: context.observedAt,
        dateReliability: publishedAt === null ? "unknown" : "provider",
        caption,
        assetCount: media.assetCount,
        videoDurationMs: media.videoDurationMs,
        mediaKinds: media.mediaKinds,
        revisionKey,
      });
      const prior = seen.get(postId);
      if (prior && prior !== revisionKey)
        throw Error("INCONSISTENT_DISCOVERY_REVISION");
      if (!prior) {
        seen.set(postId, revisionKey);
        posts.push(post);
      }
      for (const code of localIssues) issues.push({ index, code });
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "CREATOR_IDENTITY_CHANGED",
          "INCONSISTENT_DISCOVERY_REVISION",
        ].includes(error.message)
      )
        throw error;
      issues.push({ index, code: "invalid_item" });
    }
  }
  return { posts, issues, completeness: "unknown" as const };
}
