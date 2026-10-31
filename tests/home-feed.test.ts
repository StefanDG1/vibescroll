import { expect, it } from "vitest";
import {
  feedNeighbors,
  mergeFeedPage,
  sourceReadKey,
  type FeedPost,
} from "../apps/starter/lib/home-feed";

const post = (id: string, title = id) =>
  ({ id, title, state: "ready", generation: 1 }) as FeedPost;

it("deduplicates overlapping cursor pages without moving the post being read", () => {
  const merged = mergeFeedPage(
    [post("a"), post("b")],
    [post("b", "Updated title"), post("c")],
  );
  expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
  expect(merged[1].title).toBe("Updated title");
});

it("bounds the detail window to the current post and immediate neighbors", () => {
  const posts = Array.from({ length: 500 }, (_, index) => post(String(index)));
  expect(feedNeighbors(posts, "250")).toEqual(["249", "250", "251"]);
  expect(feedNeighbors(posts, null)).toEqual(["0", "1"]);
  expect(feedNeighbors(posts, "499")).toEqual(["498", "499"]);
  expect(feedNeighbors([], "deleted")).toEqual([]);
});

it("invalidates a retained detail when its selected version, revision or generation changes", () => {
  const current = {
    generation: 1,
    selectedAnalysisVersionId: "v1",
    analysisSelectionRevision: 1,
    updatedAt: 10,
  };
  for (const changed of [
    { ...current, generation: 2 },
    { ...current, selectedAnalysisVersionId: "v2" },
    { ...current, analysisSelectionRevision: 2 },
    { ...current, updatedAt: 11 },
  ])
    expect(sourceReadKey(changed)).not.toBe(sourceReadKey(current));
  expect(sourceReadKey({ ...current })).toBe(sourceReadKey(current));
});
