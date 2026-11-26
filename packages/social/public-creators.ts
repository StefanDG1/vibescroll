import { z } from "zod";
import { parse } from "parse5";
import { platformPostKey } from "../sources/post-identity";

import {
  numericId,
  handle,
  creatorProfileUrl,
  publicProfileLink,
  publicCreatorProfile,
  type CreatorFeedPost,
} from "./creator-identity";
export {
  creatorProfileUrl,
  publicProfileLink,
  publicCreatorProfile,
  type PublicCreatorProfile,
  type CreatorFeedPost,
} from "./creator-identity";

export function publicCreatorFeedEnabled(key: string) {
  if (
    process.env.RESTORE_LOCK === "true" ||
    process.env.VIBESCROLL_CREATOR_DISCOVERY_ENABLED !== "true"
  )
    return false;
  if (/^tiktok:[0-9]{1,30}$/.test(key))
    return (
      process.env.VIBESCROLL_ORDERED_SOCIAL_ENABLED === "true" ||
      process.env.VIBESCROLL_TIKTOK_ORDERED_ENABLED === "true"
    );
  if (/^x:[0-9]{1,30}$/.test(key))
    return process.env.WORK_CLOUD_MEDIA_ENABLED === "true";
  return (
    /^instagram:[0-9]{1,30}$/.test(key) &&
    process.env.VIBESCROLL_INSTAGRAM_PUBLIC_EMBED_ENABLED === "true" &&
    !!instagramProfileSession()
  );
}

async function boundedText(response: Response) {
  if (!response.ok || !response.body) throw Error("CREATOR_FEED_UNAVAILABLE");
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    text = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 2_000_000) throw Error("CREATOR_FEED_LIMIT");
      text += decoder.decode(next.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

function scriptJson(html: string, id?: string): unknown[] {
  const pending: any[] = [parse(html)],
    result: unknown[] = [];
  let visited = 0;
  while (pending.length && ++visited <= 30000) {
    const node = pending.pop();
    if (
      node.nodeName === "script" &&
      (id
        ? node.attrs?.some((a: any) => a.name === "id" && a.value === id)
        : node.attrs?.some(
            (a: any) => a.name === "type" && a.value === "application/json",
          ))
    ) {
      try {
        result.push(
          JSON.parse(
            node.childNodes?.map((n: any) => n.value ?? "").join("") ?? "null",
          ),
        );
      } catch {
        /* Scripts are parsed as data, never evaluated. */
      }
    }
    pending.push(...(node.childNodes ?? []));
  }
  if (pending.length) throw Error("CREATOR_FEED_LIMIT");
  return result;
}

const tiktokUser = z.object({
  id: numericId,
  uniqueId: handle.max(24),
  secUid: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/),
  privateAccount: z.boolean().optional(),
  ins_id: z.string().optional(),
  twitter_id: z.string().optional(),
  bioLink: z.object({ link: z.string().nullish() }).nullish(),
});
async function tiktokProfile(
  user: string,
  key: string | undefined,
  transport: typeof fetch,
  now: number,
) {
  const url = creatorProfileUrl("tiktok:1", user);
  const html = await boundedText(
    await transport(url, {
      redirect: "error",
      signal: AbortSignal.timeout(9000),
    }),
  );
  const data = scriptJson(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__");
  if (data.length !== 1) throw Error("CREATOR_FEED_UNAVAILABLE");
  const record = tiktokUser.parse(
    (data[0] as any)?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo?.user,
  );
  if (
    record.uniqueId.toLowerCase() !== user.toLowerCase() ||
    (key && key !== `tiktok:${record.id}`) ||
    record.privateAccount
  )
    throw Error("CREATOR_IDENTITY_CHANGED");
  const links = [
    record.bioLink?.link,
    record.ins_id && /^[A-Za-z0-9_.]{1,30}$/.test(record.ins_id)
      ? creatorProfileUrl("instagram:1", record.ins_id)
      : null,
    record.twitter_id && /^[A-Za-z0-9_]{1,15}$/.test(record.twitter_id)
      ? creatorProfileUrl("x:1", record.twitter_id)
      : null,
  ].flatMap((value) =>
    value ? [publicProfileLink(value)].filter((v): v is string => !!v) : [],
  );
  return {
    record,
    profile: publicCreatorProfile.parse({
      key: `tiktok:${record.id}`,
      handle: record.uniqueId,
      links: [...new Set(links)].slice(0, 12),
      observedAt: now,
    }),
  };
}

const ttPost = z.object({
  id: z.string().regex(/^[0-9]{10,25}$/),
  createTime: z.number().int().positive(),
  author: z.object({ id: numericId, uniqueId: handle.max(24) }),
  privateItem: z.boolean().optional(),
  secret: z.boolean().optional(),
  video: z.object({ duration: z.number().nonnegative().optional() }).optional(),
  imagePost: z
    .object({ images: z.array(z.unknown()).optional() })
    .nullable()
    .optional(),
});
export async function readPublicTikTokCreatorPage(
  author: { creatorKey: string; handle: string },
  cursor: number | null,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  if (
    !/^tiktok:[0-9]{1,30}$/.test(author.creatorKey) ||
    (cursor !== null &&
      (!Number.isSafeInteger(cursor) ||
        cursor < 1472706000000 ||
        cursor > now + 300000))
  )
    throw Error("CREATOR_IDENTITY_CHANGED");
  const { record, profile } = await tiktokProfile(
    author.handle,
    author.creatorKey,
    transport,
    now,
  );
  const current = cursor ?? now;
  const query = new URLSearchParams({
    secUid: record.secUid,
    type: "1",
    count: "15",
    aid: "1988",
    app_name: "tiktok_web",
    device_platform: "web_pc",
    cursor: String(current),
  });
  const response = z
    .object({
      statusCode: z.literal(0),
      itemList: z.array(ttPost).max(15),
      hasMorePrevious: z.union([z.boolean(), z.literal(0), z.literal(1)]),
    })
    .parse(
      JSON.parse(
        await boundedText(
          await transport(
            `https://www.tiktok.com/api/creator/item_list/?${query}`,
            { redirect: "error", signal: AbortSignal.timeout(9000) },
          ),
        ),
      ),
    );
  const posts: CreatorFeedPost[] = response.itemList.map((row) => {
    if (
      `tiktok:${row.author.id}` !== author.creatorKey ||
      row.author.uniqueId.toLowerCase() !== record.uniqueId.toLowerCase() ||
      row.privateItem ||
      row.secret ||
      row.createTime * 1000 > now + 300000
    )
      throw Error("CREATOR_IDENTITY_CHANGED");
    const images = !!row.imagePost?.images?.length;
    return {
      postKey: `tiktok:${row.id}`,
      url: `https://www.tiktok.com/@${record.uniqueId.toLowerCase()}/${images ? "photo" : "video"}/${row.id}`,
      publishedAt: row.createTime * 1000,
      ...(images
        ? { durationMs: 0 }
        : row.video?.duration
          ? { durationMs: Math.round(row.video.duration * 1000) }
          : {}),
    };
  });
  const next = posts.at(-1)?.publishedAt ?? current - 7 * 86400000;
  const nextCursor = response.hasMorePrevious
    ? next < current
      ? next
      : current - 7 * 86400000
    : null;
  return {
    profile,
    posts,
    nextCursor: nextCursor && nextCursor >= 1472706000000 ? nextCursor : null,
  };
}

const sessionSchema = z.object({
  version: z.literal("instagram-public-profile-session-v1"),
  accountHandle: handle,
  accountId: numericId,
  cookie: z
    .string()
    .min(20)
    .max(6000)
    .refine((v) => !/[\r\n]/.test(v)),
  csrf: z.string().min(5).max(300),
  userAgent: z.string().min(10).max(500),
  capturedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});
type InstagramSession = z.infer<typeof sessionSchema> & {
  dtsg: string;
  lsd: string;
  jazoest: string;
};
function instagramProfileSession(now = Date.now()) {
  try {
    const s = sessionSchema.parse(
      JSON.parse(
        process.env.VIBESCROLL_INSTAGRAM_PROFILE_SESSION_JSON ?? "null",
      ),
    );
    const cookies = s.cookie
      .split(/;\s*/)
      .map((pair) => /^([a-z_]+)=([^\s;]+)$/.exec(pair));
    if (
      s.capturedAt > now ||
      s.expiresAt <= now ||
      s.expiresAt - s.capturedAt > 90 * 86400000 ||
      cookies.length !== 3 ||
      cookies.some((pair) => !pair) ||
      new Set(cookies.map((pair) => pair?.[1])).size !== 3 ||
      cookies.some(
        (pair) => !["sessionid", "csrftoken", "ds_user_id"].includes(pair![1]),
      ) ||
      !s.cookie.split(/;\s*/).includes(`ds_user_id=${s.accountId}`) ||
      !s.cookie.split(/;\s*/).includes(`csrftoken=${s.csrf}`)
    )
      return null;
    return s;
  } catch {
    return null;
  }
}

/** The fixed first-party endpoint can recover public posts with embedding disabled. */
export async function readAuthenticatedInstagramPostAuthor(
  code: string,
  transport: typeof fetch = fetch,
) {
  if (!/^[A-Za-z0-9_-]{5,30}$/.test(code))
    throw Error("POST_AUTHOR_IDENTITY_CHANGED");
  const session = instagramProfileSession();
  if (!session) throw Error("POST_AUTHOR_UNAVAILABLE");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = BigInt(0);
  for (const letter of code)
    id = id * BigInt(64) + BigInt(alphabet.indexOf(letter));
  const data = JSON.parse(
    await boundedText(
      await transport(`https://www.instagram.com/api/v1/media/${id}/info/`, {
        headers: {
          Cookie: session.cookie,
          "X-CSRFToken": session.csrf,
          "User-Agent": session.userAgent,
          "X-IG-App-ID": "936619743392459",
        },
        redirect: "error",
        signal: AbortSignal.timeout(9000),
      }),
    ),
  );
  const identifier = z.union([
    numericId,
    z.number().int().safe().positive().transform(String),
  ]);
  const response = z
    .object({
      status: z.literal("ok"),
      items: z
        .array(
          z.object({
            code: z.literal(code),
            audience: z.enum(["public", "everyone"]).nullish(),
            is_close_friend: z.literal(false).optional(),
            is_private: z.literal(false).optional(),
            user: z.object({
              pk: identifier,
              username: handle,
              is_private: z.literal(false),
            }),
          }),
        )
        .length(1),
    })
    .parse(data);
  return {
    authorId: response.items[0].user.pk,
    authorHandle: response.items[0].user.username,
  };
}

async function freshInstagramSession(transport: typeof fetch) {
  const session = instagramProfileSession();
  if (!session) throw Error("CREATOR_SESSION_UNAVAILABLE");
  const html = await boundedText(
    await transport("https://www.instagram.com/", {
      headers: { Cookie: session.cookie, "User-Agent": session.userAgent },
      redirect: "error",
      signal: AbortSignal.timeout(9000),
    }),
  );
  const pending = scriptJson(html);
  let visited = 0,
    dtsg: string | undefined,
    lsd: string | undefined;
  while (pending.length && ++visited < 100000) {
    const value: any = pending.pop();
    if (
      Array.isArray(value) &&
      ["DTSGInitialData", "LSD"].includes(value[0]) &&
      typeof value[2]?.token === "string"
    ) {
      if (value[0] === "DTSGInitialData") dtsg = value[2].token;
      else lsd = value[2].token;
    }
    if (value && typeof value === "object")
      pending.push(...Object.values(value));
  }
  if (
    !dtsg ||
    !lsd ||
    !z.string().min(10).max(1000).safeParse(dtsg).success ||
    !z.string().min(5).max(300).safeParse(lsd).success
  )
    throw Error("CREATOR_SESSION_UNAVAILABLE");
  // Security nonces rotate independently of the bounded login session.
  return {
    ...session,
    dtsg,
    lsd,
    jazoest: `2${[...dtsg].reduce((sum, char) => sum + char.charCodeAt(0), 0)}`,
  };
}

const contentFlags = {
  __relay_internal__pv__PolarisCannesGuardianExperienceEnabledrelayprovider: true,
  __relay_internal__pv__PolarisCASB976ProfileEnabledrelayprovider: false,
  __relay_internal__pv__PolarisProfileInformTreatmentBannerEnabledrelayprovider: false,
  __relay_internal__pv__PolarisWebSchoolsEnabledrelayprovider: false,
  __relay_internal__pv__PolarisProfileRingsGradientEnabledrelayprovider: true,
  __relay_internal__pv__PolarisDSA16EntrypointEnabledrelayprovider: false,
  __relay_internal__pv__PolarisRepostsConsumptionEnabledrelayprovider: true,
  __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: true,
};
const postsFlags = {
  __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: true,
  __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: true,
  __relay_internal__pv__PolarisSEOIsCrawlerrelayprovider: false,
  __relay_internal__pv__PolarisProductTagIndicatorEnabledrelayprovider: false,
  __relay_internal__pv__PolarisThreadsStyleCommentsEnabledrelayprovider: false,
  __relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider: false,
};
async function instagramQuery(
  name: "profile" | "posts",
  variables: Record<string, unknown>,
  transport: typeof fetch,
  session: InstagramSession | null,
) {
  const friendly =
    name === "profile"
      ? "PolarisProfilePageContentQuery"
      : "PolarisProfilePostsQuery";
  const form = new URLSearchParams({
    ...(session
      ? {
          __a: "1",
          __d: "www",
          __user: "0",
          fb_dtsg: session.dtsg,
          jazoest: session.jazoest,
          lsd: session.lsd,
        }
      : {}),
    doc_id: name === "profile" ? "29609640381972919" : "29911767465181002",
    variables: JSON.stringify({
      ...(name === "profile" ? contentFlags : postsFlags),
      ...variables,
    }),
    fb_api_req_friendly_name: friendly,
  });
  const response = await transport("https://www.instagram.com/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-IG-App-ID": "936619743392459",
      "X-FB-Friendly-Name": friendly,
      ...(session
        ? {
            Cookie: session.cookie,
            "X-CSRFToken": session.csrf,
            "X-FB-LSD": session.lsd,
            "User-Agent": session.userAgent,
            Origin: "https://www.instagram.com",
            Referer: "https://www.instagram.com/",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
          }
        : {}),
    },
    body: form,
    redirect: "error",
    signal: AbortSignal.timeout(9000),
  });
  const text = await boundedText(response),
    result = JSON.parse(text.startsWith("for (;;);") ? text.slice(9) : text);
  if (result.error || result.errors?.length || !result.data)
    throw Error("CREATOR_FEED_UNAVAILABLE");
  if (session && name === "profile") {
    const viewer = result.data.viewer?.user;
    if (
      !viewer ||
      String(viewer.id ?? viewer.pk) !== session.accountId ||
      (viewer.username &&
        viewer.username.toLowerCase() !== session.accountHandle.toLowerCase())
    )
      throw Error("CREATOR_SESSION_CHANGED");
  }
  return result.data;
}

async function instagramProfile(
  user: string,
  key: string | undefined,
  transport: typeof fetch,
  now: number,
  session: InstagramSession | null = null,
) {
  let id = key?.slice("instagram:".length);
  if (!id) {
    const html = await boundedText(
      await transport(creatorProfileUrl("instagram:1", user), {
        redirect: "error",
        signal: AbortSignal.timeout(9000),
      }),
    );
    const pending = scriptJson(html),
      ids = new Set<string>();
    let visited = 0;
    while (pending.length && ++visited < 100000) {
      const value: any = pending.pop();
      if (value && typeof value === "object") {
        if (
          typeof value.enable_highlights_query === "boolean" &&
          numericId.safeParse(value.id).success
        )
          ids.add(value.id);
        pending.push(...Object.values(value));
      }
    }
    if (ids.size !== 1) throw Error("CREATOR_IDENTITY_CHANGED");
    id = [...ids][0];
  }
  numericId.parse(id);
  const data = await instagramQuery(
    "profile",
    { id, enable_integrity_filters: true },
    transport,
    session,
  );
  const row = z
    .object({
      id: numericId,
      username: handle,
      is_private: z.literal(false),
      bio_links: z.array(z.object({ url: z.string().nullish() })).nullish(),
      external_url: z.string().nullable().optional(),
    })
    .parse(data.user);
  if (
    row.id !== id ||
    (!key && row.username.toLowerCase() !== user.toLowerCase())
  )
    throw Error("CREATOR_IDENTITY_CHANGED");
  const links = [
    ...(row.bio_links?.map((l) => l.url) ?? []),
    ...(row.external_url ? [row.external_url] : []),
  ].flatMap((url) => {
    const value = url ? publicProfileLink(url) : null;
    return value ? [value] : [];
  });
  return publicCreatorProfile.parse({
    key: `instagram:${row.id}`,
    handle: row.username,
    links: [...new Set(links)].slice(0, 12),
    observedAt: now,
  });
}

export async function readPublicInstagramCreatorPage(
  author: { creatorKey: string; handle: string },
  cursor: string | null,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  if (
    !/^instagram:[0-9]{1,30}$/.test(author.creatorKey) ||
    (cursor !== null && !/^[A-Za-z0-9_=+/-]{1,1000}$/.test(cursor))
  )
    throw Error("CREATOR_IDENTITY_CHANGED");
  const session = await freshInstagramSession(transport);
  const profile = await instagramProfile(
    author.handle,
    author.creatorKey,
    transport,
    now,
    session,
  );
  const data = await instagramQuery(
    "posts",
    {
      username: profile.handle,
      data: {
        count: 20,
        include_reel_media_seen_timestamp: true,
        include_relationship_info: true,
        latest_besties_reel_media: true,
        latest_reel_media: true,
      },
      ...(cursor ? { after: cursor } : {}),
    },
    transport,
    session,
  );
  const page = z
    .object({
      edges: z
        .array(
          z.object({
            node: z.object({
              code: z.string().regex(/^[A-Za-z0-9_-]{5,40}$/),
              taken_at: z.number().int().positive(),
              user: z.object({
                pk: z
                  .union([numericId, z.number().int().positive()])
                  .optional(),
                id: numericId.optional(),
                username: handle,
              }),
              media_type: z.number().int().optional(),
              video_duration: z.number().nonnegative().optional(),
              carousel_media: z
                .array(
                  z.object({
                    media_type: z.number().int(),
                    video_duration: z.number().nonnegative().nullish(),
                  }),
                )
                .max(35)
                .nullish(),
            }),
          }),
        )
        .max(20),
      page_info: z.object({
        has_next_page: z.boolean(),
        end_cursor: z.string().max(1000).nullable(),
      }),
    })
    .parse(data.xdt_api__v1__feed__user_timeline_graphql_connection);
  const posts: CreatorFeedPost[] = page.edges.map(({ node }) => {
    if (
      `instagram:${node.user.pk ?? node.user.id}` !== profile.key ||
      node.user.username.toLowerCase() !== profile.handle.toLowerCase() ||
      node.taken_at * 1000 > now + 300000
    )
      throw Error("CREATOR_IDENTITY_CHANGED");
    return {
      postKey: `instagram:${node.code}`,
      url: `https://www.instagram.com/p/${node.code}/`,
      publishedAt: node.taken_at * 1000,
      ...(node.media_type === 1 ||
      (node.media_type === 8 &&
        !!node.carousel_media?.length &&
        node.carousel_media.every((child) => child.media_type === 1))
        ? { durationMs: 0 }
        : node.video_duration
          ? { durationMs: Math.round(node.video_duration * 1000) }
          : {}),
    };
  });
  if (
    page.page_info.has_next_page &&
    (!page.page_info.end_cursor || page.page_info.end_cursor === cursor)
  )
    throw Error("CREATOR_FEED_CURSOR_UNAVAILABLE");
  return {
    profile,
    posts,
    nextCursor: page.page_info.has_next_page ? page.page_info.end_cursor : null,
  };
}

export async function readPublicCreatorProfile(
  url: string,
  expectedKey?: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  const link = publicProfileLink(url);
  if (!link || link !== url) throw Error("CREATOR_IDENTITY_CHANGED");
  const u = new URL(link),
    name = u.pathname.split("/")[1];
  if (u.hostname === "www.tiktok.com")
    return (await tiktokProfile(name.slice(1), expectedKey, transport, now))
      .profile;
  if (u.hostname === "www.instagram.com")
    return instagramProfile(
      name,
      expectedKey,
      transport,
      now,
      instagramProfileSession()
        ? await freshInstagramSession(transport)
        : null,
    );
  return (
    await xTimeline(
      { creatorKey: expectedKey, handle: name },
      null,
      transport,
      now,
    )
  ).profile;
}

const xAuthor = z.object({
  id: numericId,
  screen_name: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
  protected: z.boolean(),
  description: z.string().max(10000).nullish(),
  website: z.object({ url: z.string().max(2048).nullable() }).nullish(),
});
const xStatus = z.object({
  type: z.literal("status"),
  id: z.string().regex(/^[0-9]{10,25}$/),
  url: z.string().max(2048),
  created_timestamp: z.number().int().positive(),
  author: xAuthor,
  reposted_by: z.unknown().optional(),
  media: z
    .object({
      videos: z
        .array(z.object({ duration: z.number().nonnegative().nullish() }))
        .max(10)
        .optional(),
    })
    .nullish(),
});
async function xTimeline(
  author: { creatorKey?: string; handle: string },
  cursor: string | null,
  transport: typeof fetch,
  now: number,
) {
  creatorProfileUrl(author.creatorKey ?? "x:1", author.handle);
  if (
    (author.creatorKey && !/^x:[0-9]{1,30}$/.test(author.creatorKey)) ||
    (cursor !== null && !/^[A-Za-z0-9_+=/-]{1,1000}$/.test(cursor))
  )
    throw Error("CREATOR_IDENTITY_CHANGED");
  const target = author.creatorKey
      ? `id:${author.creatorKey.slice(2)}`
      : author.handle,
    query = new URLSearchParams({ count: "20", ...(cursor ? { cursor } : {}) });
  const data = z
    .object({
      code: z.literal(200),
      results: z.array(xStatus).max(40),
      cursor: z.object({ bottom: z.string().max(1000).nullable() }),
    })
    .parse(
      JSON.parse(
        await boundedText(
          await transport(
            `https://api.fxtwitter.com/2/profile/${encodeURIComponent(target)}/statuses?${query}`,
            {
              headers: {
                "User-Agent":
                  "VibeScroll/1.0 (+https://scroll.companynerve.com)",
              },
              redirect: "error",
              signal: AbortSignal.timeout(9000),
            },
          ),
        ),
      ),
    );
  const owned = data.results.filter((row) =>
    author.creatorKey
      ? `x:${row.author.id}` === author.creatorKey
      : row.author.screen_name.toLowerCase() === author.handle.toLowerCase(),
  );
  const identities = new Set(
    owned.map(
      (row) => `${row.author.id}:${row.author.screen_name.toLowerCase()}`,
    ),
  );
  if (
    !owned.length ||
    identities.size !== 1 ||
    owned.some((row) => row.author.protected)
  )
    throw Error("CREATOR_IDENTITY_CHANGED");
  const owner = owned[0].author,
    key = `x:${owner.id}`;
  if (
    data.results.some((row) => `x:${row.author.id}` !== key && !row.reposted_by)
  )
    throw Error("CREATOR_IDENTITY_CHANGED");
  const posts: CreatorFeedPost[] = [],
    seen = new Set<string>();
  for (const row of owned) {
    if (seen.has(row.id)) continue;
    if (
      platformPostKey(row.url) !== `x:${row.id}` ||
      row.created_timestamp * 1000 > now + 300000
    )
      throw Error("CREATOR_IDENTITY_CHANGED");
    seen.add(row.id);
    const videos = row.media?.videos,
      durations = videos?.map((v) => v.duration);
    posts.push({
      postKey: `x:${row.id}`,
      url: `https://x.com/${owner.screen_name.toLowerCase()}/status/${row.id}`,
      publishedAt: row.created_timestamp * 1000,
      ...(!videos?.length
        ? { durationMs: 0 }
        : durations?.every((v): v is number => typeof v === "number")
          ? {
              durationMs: Math.ceil(
                durations.reduce((sum, v) => sum + v, 0) * 1000,
              ),
            }
          : {}),
    });
  }
  if (posts.length > 20) throw Error("CREATOR_FEED_LIMIT");
  const nextCursor = data.cursor.bottom;
  if (
    nextCursor &&
    (nextCursor === cursor || !/^[A-Za-z0-9_+=/-]{1,1000}$/.test(nextCursor))
  )
    throw Error("CREATOR_FEED_CURSOR_UNAVAILABLE");
  const links = [
    owner.website?.url,
    ...(owner.description?.match(/https:\/\/[^\s<>]+/g) ?? []),
  ].flatMap((raw) => {
    const link = raw ? publicProfileLink(raw) : null;
    return link ? [link] : [];
  });
  return {
    profile: publicCreatorProfile.parse({
      key,
      handle: owner.screen_name,
      links: [...new Set(links)].slice(0, 12),
      observedAt: now,
    }),
    posts,
    nextCursor,
  };
}

export async function readPublicXCreatorPage(
  author: { creatorKey: string; handle: string },
  cursor: string | null,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  return xTimeline(author, cursor, transport, now);
}
