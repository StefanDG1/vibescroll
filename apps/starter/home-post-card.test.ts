// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HomePostCard } from "./components/home-post-card";
import { postPagePath } from "../../packages/browser/post-route";
import type { PostSummaryV1 } from "../../packages/contracts/post-summary";

it("opens a bookmarkable post from every card action without rendering insight text", () => {
  const summary: PostSummaryV1 = {
    version: "post-summary-v1",
    sourceId: "post-1",
    generation: 0,
    projection: "complete",
    contentRevision: "a".repeat(64),
    title: "Saved Reel",
    authorName: "Creator",
    sourceKind: "url",
    coverage: "metadata_only",
    capturedAt: 1,
    savedAt: 1,
    publishedAt: null,
    availableUntil: null,
    thumbnail: null,
    insightCount: 1,
    insightPreview: [
      {
        insightId: "idea",
        title: "PRIVATE_INSIGHT_TITLE",
        claimExcerpt: "PRIVATE_ANALYSIS",
      },
    ],
    insightPreviewTruncated: false,
    progress: {
      version: "post-progress-v1",
      sourceId: "post-1",
      generation: 0,
      contentRevision: "a".repeat(64),
      progressRevision: "b".repeat(64),
      state: "saved",
      executor: null,
      executionState: null,
      stage: null,
      orderedPhase: null,
      active: false,
      activeUntil: null,
      availableUntil: null,
      measuredProgress: null,
    },
  };
  const href = postPagePath("org-1", summary.sourceId);
  const markup = renderToStaticMarkup(
    createElement(HomePostCard, { summary, href }),
  );
  expect(markup.match(/href="\/app\/org-1\/posts\/post-1"/g)).toHaveLength(3);
  expect(markup).toContain('class="home-post-card-body" href=');
  expect(markup).toContain("Creator");
  expect(markup).not.toMatch(
    /PRIVATE_INSIGHT|PRIVATE_ANALYSIS|aria-expanded|<button/,
  );
  expect(() => postPagePath("org-1", "../foreign")).toThrow("unavailable");
  summary.progress = {
    ...summary.progress,
    active: true,
    executor: "work_cloud",
    executionState: null,
    stage: "preflight",
    activeUntil: 1000,
  };
  expect(
    renderToStaticMarkup(
      createElement(HomePostCard, { summary, href, progressTime: 999 }),
    ),
  ).toContain("Waiting for ChatGPT");
  expect(
    renderToStaticMarkup(
      createElement(HomePostCard, { summary, href, progressTime: 1000 }),
    ),
  ).toContain("Review Cloud setup");
});
