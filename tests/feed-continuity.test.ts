import { expect, it } from "vitest";
import {
  feedBookmarkKey,
  readFeedBookmark,
  newReadyPosts,
} from "../apps/starter/lib/feed-continuity";
import type { FeedPost } from "../apps/starter/lib/home-feed";
const post = (id: string, createdAt: number, state = "ready", generation = 1) =>
  ({ id, createdAt, state, generation }) as FeedPost;
it("retains the exact opaque page cursor and isolates bookmarks by account and workspace", () => {
  const value = {
    version: 1,
    sourceId: "saved-post",
    cursor: "opaque-page-cursor",
    updatedAt: 1000,
  };
  expect(readFeedBookmark(JSON.stringify(value), 1001)).toEqual({
    sourceId: value.sourceId,
    cursor: value.cursor,
    updatedAt: value.updatedAt,
  });
  expect(feedBookmarkKey("a", "workspace")).not.toBe(
    feedBookmarkKey("b", "workspace"),
  );
  expect(feedBookmarkKey("a", "workspace")).not.toBe(
    feedBookmarkKey("a", "other"),
  );
});
it("ignores corrupt, oversized, future and stale browser state", () => {
  const value = {
    version: 1,
    sourceId: "saved-post",
    cursor: null,
    updatedAt: 1000,
  };
  for (const raw of [
    "not json",
    "x".repeat(5000),
    JSON.stringify({ ...value, sourceId: "../unsafe" }),
    JSON.stringify({ ...value, updatedAt: 2000 }),
    JSON.stringify({ ...value, cursor: 3 }),
  ])
    expect(readFeedBookmark(raw, 1001)).toBeNull();
  expect(
    readFeedBookmark(JSON.stringify(value), 1000 + 8 * 86400000),
  ).toBeNull();
});
it("announces new or newly ready posts without confusing older unloaded posts or sync times with new content", () => {
  const loaded = [post("reading", 100), post("pending", 110, "processing")];
  expect(
    newReadyPosts(loaded, [
      { id: "reading", createdAt: 100, generation: 1 },
      { id: "older", createdAt: 50, generation: 1 },
    ]),
  ).toBe(0);
  expect(
    newReadyPosts(loaded, [
      { id: "new", createdAt: 120, generation: 1 },
      { id: "pending", createdAt: 110, generation: 1 },
    ]),
  ).toBe(2);
  expect(
    newReadyPosts(loaded, [{ id: "reading", createdAt: 100, generation: 2 }]),
  ).toBe(1);
});
