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

const instagramId = z.string().regex(/^\d{5,30}$/);
const instagramHandle = z.string().regex(/^[A-Za-z0-9_.]{1,30}$/);
const instagramPolicy = z.strictObject({
  creatorKey: z.string().regex(/^instagram:[A-Za-z0-9_-]{1,100}$/),
  handle: instagramHandle,
  accountId: instagramId,
  businessDiscoveryRequesterId: instagramId.optional(),
  token: z.string().min(16).max(4096),
  expiresAt: z.number().int().positive(),
  permissionReference: z.string().min(10).max(1000),
});
const businessDiscoveryCursor = z.string().regex(/^[A-Za-z0-9_=+/-]{1,500}$/);
const businessDiscoveryMediaPageSize = 5;
const businessDiscoveryPages = 4;
const businessDiscoveryListingSize =
  businessDiscoveryMediaPageSize * businessDiscoveryPages;
const businessDiscoveryMediaFields = "id,media_type,permalink,timestamp";
const instagramVideoType = z.enum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]);
const instagramListingItem = z.object({
  id: instagramId,
  media_type: instagramVideoType,
  permalink: z.string().url().max(2048),
  timestamp: z.string().max(40),
});
const instagramListing = z.object({
  data: z.array(instagramListingItem).max(20),
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
    const configured = matches.length === 1 ? matches[0] : null;
    if (
      !configured ||
      (configured.businessDiscoveryRequesterId &&
        configured.creatorKey !== `instagram:${configured.accountId}`)
    )
      return null;
    return configured;
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
  host: "graph.instagram.com" | "graph.facebook.com" = "graph.instagram.com",
) {
  const response = await transport(`https://${host}/v27.0/${path}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
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

const businessDiscoveryResponse = z.object({
  business_discovery: z.object({
    id: instagramId,
    username: instagramHandle,
    media: z.object({
      data: z
        .array(z.looseObject({ id: instagramId }))
        .max(businessDiscoveryListingSize),
      paging: z
        .object({
          cursors: z
            .object({ after: businessDiscoveryCursor.optional() })
            .optional(),
        })
        .optional(),
    }),
  }),
});

async function readInstagramBusinessMediaPage(
  authority: z.infer<typeof instagramPolicy>,
  cursor: string | null,
  fields: string,
  limit: number,
  transport: typeof fetch,
) {
  if (authority.expiresAt <= Date.now())
    throw new Error("CREATOR_FEED_UNAVAILABLE");
  const requesterId = instagramId.parse(authority.businessDiscoveryRequesterId);
  const handle = instagramHandle.parse(authority.handle);
  const after = cursor
    ? `.after(${businessDiscoveryCursor.parse(cursor)})`
    : "";
  const query = new URLSearchParams({
    fields: `business_discovery.username(${handle}){id,username,media.limit(${limit})${after}{${fields}}}`,
  });
  const { business_discovery: target } = businessDiscoveryResponse.parse(
    await instagramGet(
      requesterId,
      query,
      authority.token,
      transport,
      "graph.facebook.com",
    ),
  );
  if (
    target.id !== authority.accountId ||
    target.username.toLowerCase() !== handle.toLowerCase()
  )
    throw new Error("CREATOR_FEED_IDENTITY_CHANGED");
  if (target.media.data.length > limit) throw new Error("CREATOR_FEED_LIMIT");
  const nextCursor = target.media.data.length
    ? (target.media.paging?.cursors?.after ?? null)
    : null;
  if (nextCursor && nextCursor === cursor)
    throw new Error("CREATOR_FEED_CURSOR_UNAVAILABLE");
  return { data: target.media.data, nextCursor };
}

export async function readInstagramCreatorPage(
  authority: NonNullable<ReturnType<typeof instagramCreatorFeedPolicy>>,
  cursor: string | null,
  transport: typeof fetch = fetch,
) {
  let items: z.infer<typeof instagramListingItem>[];
  let nextCursor: string | null | undefined;
  if (authority.businessDiscoveryRequesterId) {
    const { data, nextCursor: after } = await readInstagramBusinessMediaPage(
      authority,
      cursor,
      businessDiscoveryMediaFields,
      businessDiscoveryListingSize,
      transport,
    );
    items = data.map((item) => instagramListingItem.parse(item));
    nextCursor = after;
  } else {
    const query = new URLSearchParams({
      fields: businessDiscoveryMediaFields,
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
    items = body.data;
    nextCursor = body.paging?.next ? body.paging.cursors?.after : null;
  }
  const posts = items.map((item) => {
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
  if (nextCursor === undefined || (nextCursor && nextCursor === cursor))
    throw new Error("CREATOR_FEED_CURSOR_UNAVAILABLE");
  return { posts, nextCursor };
}

const instagramChild = z.object({
  id: instagramId,
  media_type: z.enum(["IMAGE", "VIDEO"]),
  media_url: z.string().url().max(4096),
});
const instagramMedia = instagramListingItem.extend({
  media_url: z.string().url().max(4096).optional(),
  caption: z.string().max(60000).optional(),
  children: z
    .object({
      data: z.array(instagramChild).min(1).max(35),
      paging: z
        .object({
          next: z.string().optional(),
          cursors: z.object({ after: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
});
const ownedInstagramMedia = instagramMedia.extend({
  owner: z.object({ id: instagramId }),
});
const instagramOrderedMediaFields = `${businessDiscoveryMediaFields},media_url,caption,children.limit(35){id,media_type,media_url}`;

async function readInstagramBusinessPost(
  authority: z.infer<typeof instagramPolicy>,
  mediaId: string,
  transport: typeof fetch,
) {
  let cursor: string | null = null;
  for (let page = 0; page < businessDiscoveryPages; page++) {
    const result = await readInstagramBusinessMediaPage(
      authority,
      cursor,
      instagramOrderedMediaFields,
      businessDiscoveryMediaPageSize,
      transport,
    );
    const matches = result.data.filter((row) => row.id === mediaId);
    if (matches.length > 1) throw new Error("CREATOR_FEED_IDENTITY_CHANGED");
    if (matches.length === 1) return instagramMedia.parse(matches[0]);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  throw new Error("CREATOR_FEED_MEDIA_UNAVAILABLE");
}

export async function readAuthorizedInstagramPost(
  authority: NonNullable<ReturnType<typeof instagramCreatorFeedPolicy>>,
  mediaId: string,
  postKey: string,
  transport: typeof fetch = fetch,
) {
  instagramId.parse(mediaId);
  let row: z.infer<typeof instagramMedia>;
  if (authority.businessDiscoveryRequesterId) {
    row = await readInstagramBusinessPost(authority, mediaId, transport);
  } else {
    const owned = ownedInstagramMedia.parse(
      await instagramGet(
        mediaId,
        new URLSearchParams({ fields: `owner,${instagramOrderedMediaFields}` }),
        authority.token,
        transport,
      ),
    );
    if (owned.owner.id !== authority.accountId)
      throw new Error("CREATOR_FEED_IDENTITY_CHANGED");
    row = owned;
  }
  const canonical = socialPostUrl(row.permalink);
  const publishedAt = Date.parse(row.timestamp);
  if (
    row.id !== mediaId ||
    canonical.platform !== "instagram" ||
    `instagram:${canonical.postKey}` !== postKey ||
    !Number.isSafeInteger(publishedAt) ||
    publishedAt <= 0
  )
    throw new Error("CREATOR_FEED_IDENTITY_CHANGED");
  const partialAlbum =
    row.children?.paging?.next ||
    (authority.businessDiscoveryRequesterId &&
      row.children?.paging?.cursors?.after);
  const children =
    row.media_type === "CAROUSEL_ALBUM"
      ? partialAlbum
        ? undefined
        : row.children?.data
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
