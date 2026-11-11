import type { FeedPost } from "./home-feed";
export type FeedBookmark = {
  sourceId: string;
  cursor: string | null;
  updatedAt: number;
};
export const feedBookmarkKey = (readerId: string, organizationId: string) =>
  `vibescroll:feed:${readerId}:${organizationId}`;
export function readFeedBookmark(
  raw: string | null,
  now = Date.now(),
): FeedBookmark | null {
  if (!raw || raw.length > 4600) return null;
  try {
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      typeof value.sourceId !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(value.sourceId) ||
      !(
        value.cursor === null ||
        (typeof value.cursor === "string" && value.cursor.length <= 4096)
      ) ||
      !Number.isSafeInteger(value.updatedAt) ||
      value.updatedAt > now ||
      now - value.updatedAt > 7 * 86400000
    )
      return null;
    return {
      sourceId: value.sourceId,
      cursor: value.cursor,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}
export function newReadyPosts(
  posts: FeedPost[],
  head: { id: string; generation: number; createdAt: number }[],
) {
  const known = new Map(posts.map((post) => [post.id, post]));
  const newest = posts.reduce(
    (latest, post) => Math.max(latest, post.createdAt),
    0,
  );
  return head.filter((post) => {
    const old = known.get(post.id as FeedPost["id"]);
    return old
      ? old.state !== "ready" || old.generation !== post.generation
      : post.createdAt > newest;
  }).length;
}
