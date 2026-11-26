import { z } from "zod";

export const numericId = z.string().regex(/^[0-9]{1,30}$/);
export const handle = z.string().regex(/^[A-Za-z0-9_.]{1,30}$/);
export const publicCreatorProfile = z.object({
  key: z.string().regex(/^(instagram|tiktok|x):[0-9]{1,30}$/),
  handle,
  links: z.array(z.string().max(200)).max(12),
  observedAt: z.number().int().positive(),
});
export type PublicCreatorProfile = z.infer<typeof publicCreatorProfile>;
export type CreatorFeedPost = {
  postKey: string;
  url: string;
  publishedAt: number;
  durationMs?: number;
};

export function creatorProfileUrl(key: string, user: string) {
  if (!handle.safeParse(user).success) throw Error("CREATOR_IDENTITY_CHANGED");
  const name = user.toLowerCase();
  if (
    !key.startsWith("tiktok:") &&
    [
      "accounts",
      "api",
      "direct",
      "explore",
      "reels",
      "p",
      "reel",
      "stories",
      "about",
      "legal",
      "privacy",
      "terms",
      "settings",
      "login",
      "logout",
      "signup",
      "home",
      "search",
      "intent",
      "share",
      "i",
    ].includes(name)
  )
    throw Error("CREATOR_IDENTITY_CHANGED");
  if (key.startsWith("instagram:")) return `https://www.instagram.com/${name}/`;
  if (key.startsWith("tiktok:")) return `https://www.tiktok.com/@${name}`;
  if (key.startsWith("x:") && /^[A-Za-z0-9_]{1,15}$/.test(user))
    return `https://x.com/${name}`;
  throw Error("CREATOR_IDENTITY_CHANGED");
}

export function publicProfileLink(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    const host = u.hostname.replace(/^www\./, "");
    if (
      host === "instagram.com" &&
      /^\/[A-Za-z0-9_.]{1,30}\/?$/.test(u.pathname)
    )
      return creatorProfileUrl("instagram:1", u.pathname.split("/")[1]);
    if (host === "tiktok.com" && /^\/@[A-Za-z0-9_.]{1,24}\/?$/.test(u.pathname))
      return creatorProfileUrl("tiktok:1", u.pathname.split("/")[1].slice(1));
    if (
      ["x.com", "twitter.com"].includes(host) &&
      /^\/[A-Za-z0-9_]{1,15}\/?$/.test(u.pathname)
    )
      return creatorProfileUrl("x:1", u.pathname.split("/")[1]);
  } catch {
    /* An untrusted bio link is never a network destination. */
  }
  return null;
}

/** Exact reciprocal profile links establish account identity. Handles alone do not. */
export function reciprocalCreatorComponent(
  profiles: PublicCreatorProfile[],
  seed: string,
) {
  const byKey = new Map(profiles.map((p) => [p.key, p])),
    visited = new Set([seed]),
    queue = [seed];
  for (let i = 0; i < queue.length; i++) {
    const a = byKey.get(queue[i]);
    if (!a) continue;
    for (const b of profiles)
      if (
        !visited.has(b.key) &&
        a.links.includes(creatorProfileUrl(b.key, b.handle)) &&
        b.links.includes(creatorProfileUrl(a.key, a.handle))
      ) {
        visited.add(b.key);
        queue.push(b.key);
      }
  }
  return [...visited].filter((key) => byKey.has(key)).sort();
}
