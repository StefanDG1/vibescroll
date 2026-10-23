import { z } from "zod";
import { socialPlatform, requireSocialRights } from "./contracts";
import { socialPostUrl } from "./identity.mjs";

export const discoveredPostSchema = z
  .strictObject({
    platform: socialPlatform,
    creatorId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    postId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    canonical: z.string().max(2048),
    publishedAt: z.number().int().nonnegative().nullable(),
    observedAt: z.number().int().nonnegative(),
    dateReliability: z.enum(["provider", "unknown"]),
    caption: z.string().max(60_000),
    assetCount: z.number().int().min(1).max(35).nullable(),
    videoDurationMs: z.number().int().min(0).max(600_000).nullable(),
    mediaKinds: z
      .array(z.enum(["image", "video"]))
      .min(1)
      .max(2),
    revisionKey: z.string().min(1).max(200),
  })
  .superRefine((post, ctx) => {
    try {
      const identity = socialPostUrl(post.canonical);
      if (
        identity.platform !== post.platform ||
        (post.platform === "tiktok" && post.postId !== identity.postKey)
      )
        throw Error();
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Post canonical identity mismatch",
      });
    }
    if (
      (post.publishedAt === null) !== (post.dateReliability === "unknown") ||
      (post.publishedAt !== null &&
        post.publishedAt > post.observedAt + 300_000)
    )
      ctx.addIssue({
        code: "custom",
        message: "Post publication date unavailable",
      });
  });
export type DiscoveredPost = z.infer<typeof discoveredPostSchema>;

export function selectDiscoveredPosts(
  values: unknown,
  selection: {
    creatorId: string;
    platform: "instagram" | "tiktok";
    cutoff: number;
    mode: "future" | "latest10";
    maxAssets: number;
    maxVideoMs: number;
  },
) {
  const posts = z.array(discoveredPostSchema).max(100).parse(values);
  if (
    !Number.isSafeInteger(selection.cutoff) ||
    selection.cutoff < 0 ||
    !Number.isSafeInteger(selection.maxAssets) ||
    selection.maxAssets < 1 ||
    selection.maxAssets > 350 ||
    !Number.isSafeInteger(selection.maxVideoMs) ||
    selection.maxVideoMs < 0 ||
    selection.maxVideoMs > 6_000_000
  )
    throw Error("INVALID_CREATOR_SELECTION");
  const unique = new Map<string, DiscoveredPost>();
  for (const post of posts) {
    if (
      post.creatorId !== selection.creatorId ||
      post.platform !== selection.platform
    )
      throw Error("CREATOR_IDENTITY_CHANGED");
    const old = unique.get(post.postId);
    if (old && old.revisionKey !== post.revisionKey)
      throw Error("INCONSISTENT_DISCOVERY_REVISION");
    unique.set(post.postId, post);
  }
  const uncertain = [...unique.values()].filter(
    (p) =>
      p.publishedAt === null ||
      p.assetCount === null ||
      p.videoDurationMs === null,
  );
  // Pin order is not publication order. Never claim a date cutoff was reached
  // merely because one page contains an old pinned post.
  const dated = [...unique.values()]
    .filter((p) => !uncertain.includes(p))
    .sort(
      (a, b) =>
        b.publishedAt! - a.publishedAt! || a.postId.localeCompare(b.postId),
    );
  const candidates =
    selection.mode === "latest10"
      ? dated.slice(0, 10)
      : dated.filter((p) => p.publishedAt! > selection.cutoff);
  const selected: DiscoveredPost[] = [],
    overLimit: DiscoveredPost[] = [];
  let assets = 0,
    videoMs = 0;
  for (const post of candidates) {
    if (
      assets + post.assetCount! > selection.maxAssets ||
      videoMs + post.videoDurationMs! > selection.maxVideoMs
    ) {
      overLimit.push(post);
      continue;
    }
    assets += post.assetCount!;
    videoMs += post.videoDurationMs!;
    selected.push(post);
  }
  return { selected, needsReview: uncertain, overLimit, assets, videoMs };
}

export type DiscoveryPage = {
  posts: DiscoveredPost[];
  cursor: string | null;
  complete: boolean;
  responseBytes: number;
};
export type DiscoveryRequest = {
  enabled: boolean;
  provider: string;
  platform: "instagram" | "tiktok";
  creatorId: string;
  rights: unknown;
  now: number;
  deadline: number;
  cursor: string | null;
  reservation: {
    key: string;
    provider: string;
    expiresAt: number;
    maximumUsdMicros: number;
    includesMinimumRetriesStorageAndLag: boolean;
    state: "reserved" | "unknown" | "settled";
  };
};
/** Transport is injected by the trusted action. A supplier SDK cannot grant rights or funds. */
export async function discoverBounded(
  request: DiscoveryRequest,
  transport: (input: {
    creatorId: string;
    cursor: string | null;
    signal: AbortSignal;
    reservationKey: string;
  }) => Promise<DiscoveryPage>,
  now: () => number = Date.now,
) {
  if (!request.enabled) throw Error("CREATOR_DISCOVERY_DISABLED");
  requireSocialRights(
    request.rights,
    {
      provider: request.provider,
      platform: request.platform,
      creatorId: request.creatorId,
      workload: "discovery",
    },
    request.now,
  );
  const r = request.reservation;
  if (
    r.state !== "reserved" ||
    !r.key ||
    r.provider !== request.provider ||
    r.expiresAt <= request.now ||
    !Number.isSafeInteger(r.maximumUsdMicros) ||
    r.maximumUsdMicros <= 0 ||
    !r.includesMinimumRetriesStorageAndLag ||
    request.deadline <= request.now ||
    request.deadline > request.now + 60_000
  )
    throw Error("DISCOVERY_BUDGET_UNVERIFIED");
  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(),
    Math.max(1, request.deadline - now()),
  );
  try {
    let cursor = request.cursor,
      bytes = 0;
    const posts: DiscoveredPost[] = [],
      seen = new Set<string>();
    for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
      if (now() >= request.deadline || now() >= r.expiresAt)
        throw Error("DISCOVERY_DEADLINE");
      requireSocialRights(
        request.rights,
        {
          provider: request.provider,
          platform: request.platform,
          creatorId: request.creatorId,
          workload: "discovery",
        },
        now(),
      );
      const page = await transport({
        creatorId: request.creatorId,
        cursor,
        signal: abort.signal,
        reservationKey: r.key,
      });
      if (abort.signal.aborted || now() >= request.deadline)
        throw Error("DISCOVERY_DEADLINE");
      if (
        !Number.isSafeInteger(page.responseBytes) ||
        page.responseBytes < 0 ||
        (bytes += page.responseBytes) > 1_000_000 ||
        typeof page.complete !== "boolean" ||
        (page.cursor !== null &&
          (typeof page.cursor !== "string" || page.cursor.length > 2000))
      )
        throw Error("DISCOVERY_RESPONSE_BOUND");
      const parsed = z.array(discoveredPostSchema).max(100).parse(page.posts);
      if (
        parsed.some(
          (p) =>
            p.creatorId !== request.creatorId ||
            p.platform !== request.platform,
        ) ||
        posts.length + parsed.length > 100
      )
        throw Error("DISCOVERY_IDENTITY_OR_COUNT");
      posts.push(...parsed);
      if (page.complete) {
        if (page.cursor !== null) throw Error("INCONSISTENT_DISCOVERY_CURSOR");
        return { posts, cursor: null, complete: true, responseBytes: bytes };
      }
      if (!page.cursor || seen.has(page.cursor) || page.cursor === cursor)
        throw Error("DISCOVERY_CURSOR_STALLED");
      seen.add(page.cursor);
      cursor = page.cursor;
    }
    return { posts, cursor, complete: false, responseBytes: bytes };
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

export function digestDay(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join("-");
}
