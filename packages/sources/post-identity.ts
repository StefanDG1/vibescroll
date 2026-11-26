import { xPostUrl } from "../media/x-identity.mjs";
import { socialPostUrl } from "../social/identity.mjs";

/** Identity of a direct post link. A short-link token stays unresolved. */
export function platformPostKey(raw: string) {
  try {
    const url = new URL(raw);
    if (
      [
        "x.com",
        "www.x.com",
        "twitter.com",
        "www.twitter.com",
        "mobile.twitter.com",
      ].includes(url.hostname)
    )
      return `x:${xPostUrl(raw).postId}`;
    if (["instagram.com", "www.instagram.com"].includes(url.hostname))
      url.pathname = url.pathname.replace(/^\/reels\//, "/reel/");
    const post = socialPostUrl(url.href);
    return `${post.platform}:${post.postKey}`;
  } catch {
    return undefined;
  }
}
