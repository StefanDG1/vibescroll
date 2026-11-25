import { z } from "zod";
import { socialPostUrl } from "./identity.mjs";

const policy = z.strictObject({
  creatorKey: z.string().regex(/^tiktok:[A-Za-z0-9_-]{1,100}$/),
  handle: z.string().regex(/^[A-Za-z0-9_.]{1,24}$/),
  token: z.string().min(16).max(4096),
  expiresAt: z.number().int().positive(),
  permissionReference: z.string().min(10).max(1000),
});
const responseSchema = z.object({
  data: z.object({
    videos: z
      .array(
        z.object({
          id: z.string().regex(/^\d{10,25}$/),
          create_time: z.number().int().positive().max(4102444800),
          share_url: z.string().max(2048),
          duration: z.number().int().min(1).max(600).optional(),
        }),
      )
      .max(20),
    cursor: z.number().int().nonnegative(),
    has_more: z.boolean(),
  }),
  error: z.object({ code: z.literal("ok") }),
});

export function creatorFeedPolicy(key: string, now = Date.now()) {
  if (process.env.VIBESCROLL_CREATOR_DISCOVERY_ENABLED !== "true") return null;
  try {
    const records = z
      .array(policy)
      .max(100)
      .parse(JSON.parse(process.env.VIBESCROLL_TIKTOK_FEEDS ?? "[]"));
    const matches = records.filter(
      (item) => item.creatorKey === key && item.expiresAt > now,
    );
    return matches.length === 1 ? matches[0] : null;
  } catch {
    return null;
  }
}

export async function readCreatorVideoPage(
  authority: NonNullable<ReturnType<typeof creatorFeedPolicy>>,
  cursor: number | null,
  transport: typeof fetch = fetch,
) {
  const response = await transport(
    "https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,share_url,duration",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authority.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        max_count: 20,
        ...(cursor === null ? {} : { cursor }),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(9000),
    },
  );
  if (!response.ok) throw new Error("CREATOR_FEED_UNAVAILABLE");
  const body = response.body?.getReader();
  if (!body) throw new Error("CREATOR_FEED_UNAVAILABLE");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    payload = "";
  try {
    while (true) {
      const next = await body.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 80000) throw new Error("CREATOR_FEED_LIMIT");
      payload += decoder.decode(next.value, { stream: true });
    }
  } finally {
    await body.cancel().catch(() => {});
    body.releaseLock();
  }
  payload += decoder.decode();
  const { data } = responseSchema.parse(JSON.parse(payload));
  const posts = data.videos.map((video) => {
    const resolved = socialPostUrl(video.share_url);
    const expected = `https://www.tiktok.com/@${authority.handle.toLowerCase()}/video/${video.id}`;
    if (
      resolved.platform !== "tiktok" ||
      resolved.postKey !== video.id ||
      resolved.canonical !== expected
    )
      throw new Error("CREATOR_FEED_IDENTITY_CHANGED");
    return {
      postKey: `tiktok:${video.id}`,
      url: resolved.canonical,
      publishedAt: video.create_time * 1000,
      ...(video.duration ? { durationMs: video.duration * 1000 } : {}),
    };
  });
  if (data.has_more && (data.cursor < 1 || data.cursor === cursor))
    throw new Error("CREATOR_FEED_CURSOR_UNAVAILABLE");
  return { posts, nextCursor: data.has_more ? data.cursor : null };
}

const instagramPolicy = z.strictObject({
  creatorKey: z.string().regex(/^instagram:[A-Za-z0-9_-]{1,100}$/),
  handle: z.string().regex(/^[A-Za-z0-9_.]{1,30}$/),
  accountId: z.string().regex(/^\d{5,30}$/),
  token: z.string().min(16).max(4096),
  expiresAt: z.number().int().positive(),
  permissionReference: z.string().min(10).max(1000),
});
const instaId = z.string().regex(/^\d{5,30}$/);
const instagramVideoType = z.enum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]);
const instagramListing = z.object({
  data: z
    .array(
      z.object({
        id: instaId,
        media_type: instagramVideoType,
        permalink: z.string().url().max(2048),
        timestamp: z.string().max(40),
      }),
    )
    .max(20),
  paging: z
    .object({
      next: z.string().optional(),
      cursors: z.object({ after: z.string().max(500) }).optional(),
    })
    .optional(),
});

export function instagramCreatorFeedPolicy(key: string, now = Date.now()) {
  if (process.env.VIBESCROLL_CREATOR_DISCOVERY_ENABLED !== "true") return null;
  try {
    const records = z
      .array(instagramPolicy)
      .max(100)
      .parse(JSON.parse(process.env.VIBESCROLL_INSTAGRAM_FEEDS ?? "[]"));
    const matches = records.filter(
      (item) => item.creatorKey === key && item.expiresAt > now,
    );
    return matches.length === 1 ? matches[0] : null;
  } catch {
    return null;
  }
}
export function creatorFeedAvailable(key: string, now = Date.now()) {
  return !!(
    creatorFeedPolicy(key, now) || instagramCreatorFeedPolicy(key, now)
  );
}

async function instagramGet(
  path: string,
  query: URLSearchParams,
  token: string,
  transport: typeof fetch,
) {
  const response = await transport(
    `https://graph.instagram.com/v27.0/${path}?${query}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok || !response.body)
    throw new Error("CREATOR_FEED_UNAVAILABLE");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "",
    bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 256000) throw new Error("CREATOR_FEED_LIMIT");
      text += decoder.decode(next.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(text + decoder.decode()) as unknown;
}

export async function readInstagramCreatorPage(
  authority: NonNullable<ReturnType<typeof instagramCreatorFeedPolicy>>,
  cursor: string | null,
  transport: typeof fetch = fetch,
) {
  const query = new URLSearchParams({
    fields: "id,media_type,permalink,timestamp",
    limit: "20",
  });
  if (cursor) query.set("after", cursor);
  const body = instagramListing.parse(
    await instagramGet(
      `${authority.accountId}/media`,
      query,
      authority.token,
      transport,
    ),
  );
  const posts = body.data.map((item) => {
    const identity = socialPostUrl(item.permalink);
    const publishedAt = Date.parse(item.timestamp);
    if (
      identity.platform !== "instagram" ||
      !Number.isSafeInteger(publishedAt) ||
      publishedAt <= 0
    )
      throw new Error("CREATOR_FEED_IDENTITY_CHANGED");
    return {
      postKey: `instagram:${identity.postKey}`,
      url: identity.canonical,
      publishedAt,
      providerMediaId: item.id,
    };
  });
  const nextCursor = body.paging?.next ? body.paging.cursors?.after : null;
  if (nextCursor === undefined || (nextCursor && nextCursor === cursor))
    throw new Error("CREATOR_FEED_CURSOR_UNAVAILABLE");
  return { posts, nextCursor };
}

const instagramChild = z.object({
  id: instaId,
  media_type: z.enum(["IMAGE", "VIDEO"]),
  media_url: z.string().url().max(4096),
});
const instagramMedia = z.object({
  id: instaId,
  media_type: instagramVideoType,
  media_url: z.string().url().max(4096).optional(),
  permalink: z.string().url().max(2048),
  caption: z.string().max(60000).optional(),
  owner: z.object({ id: instaId }),
  timestamp: z.string().max(40),
  children: z
    .object({
      data: z.array(instagramChild).min(1).max(35),
      paging: z.object({ next: z.string().optional() }).optional(),
    })
    .optional(),
});

export async function readAuthorizedInstagramPost(
  authority: NonNullable<ReturnType<typeof instagramCreatorFeedPolicy>>,
  mediaId: string,
  postKey: string,
  transport: typeof fetch = fetch,
) {
  const query = new URLSearchParams({
    fields:
      "id,owner,media_type,media_url,permalink,caption,timestamp,children.limit(35){id,media_type,media_url}",
  });
  const row = instagramMedia.parse(
    await instagramGet(
      instaId.parse(mediaId),
      query,
      authority.token,
      transport,
    ),
  );
  const canonical = socialPostUrl(row.permalink);
  const publishedAt = Date.parse(row.timestamp);
  if (
    row.owner.id !== authority.accountId ||
    row.id !== mediaId ||
    canonical.platform !== "instagram" ||
    `instagram:${canonical.postKey}` !== postKey ||
    !Number.isSafeInteger(publishedAt) ||
    publishedAt <= 0
  )
    throw new Error("CREATOR_FEED_IDENTITY_CHANGED");
  const children =
    row.media_type === "CAROUSEL_ALBUM"
      ? !row.children?.paging?.next
        ? row.children?.data
        : undefined
      : [instagramChild.parse(row)];
  if (
    !children?.length ||
    new Set(children.map((child) => child.id)).size !== children.length
  )
    throw new Error("CREATOR_FEED_INCOMPLETE_MEDIA");
  const assets = children.map((child) => {
    const url = new URL(child.media_url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !/\.(cdninstagram\.com|fbcdn\.net)$/.test(url.hostname)
    )
      throw new Error("CREATOR_FEED_UNVERIFIED_ATTACHMENT");
    return {
      url: url.href,
      kind: child.media_type === "IMAGE" ? "image" : "video",
      animated: false,
    };
  });
  return {
    canonical: canonical.canonical,
    platform: "instagram" as const,
    postId: canonical.postKey,
    authorId: authority.creatorKey.slice("instagram:".length),
    authorHandle: authority.handle,
    authorName: authority.handle,
    publishedAt,
    text: row.caption ?? "",
    expectedAssetCount: assets.length,
    assets,
  };
}
