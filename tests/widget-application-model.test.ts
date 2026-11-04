import { expect, it } from "vitest";
import { appendDiscovery, discoveryPage } from "../packages/reader/discovery";
import { observedProcessing } from "../packages/reader/processing";
import {
  bootstrapProfiles,
  boundedMerge,
  continuationOf,
  selectedWorkspace,
} from "../apps/widget/src/application-model";

const ranked = (version = "v1") => ({
  mode: "ranked_v1",
  profile_id: "personal",
  grant_version: 7,
  posts: [
    {
      id: "p1",
      fetch_id: "p1",
      title: "Cited post",
      url: "https://scroll.companynerve.com/app/personal/posts/p1",
      reference: { generation: 1, revision: 4, analysisVersionId: version },
    },
  ],
  matches: [
    {
      id: "p1~i1",
      post_id: "p1",
      kind: "insight",
      insight_id: "i1",
      title: "Useful idea",
      excerpt: "Retained excerpt",
    },
  ],
  next_cursor: null,
  has_more: false,
  exhausted: true,
  truncated: false,
  coverage: "One bounded indexed page.",
});
it("uses only returned citation parents and preserves source/version identity across pages", () => {
  const first = discoveryPage({
    ...ranked(),
    matches: [
      ...ranked().matches,
      {
        id: "foreign",
        post_id: "unreturned",
        kind: "insight",
        title: "Invented relationship",
        excerpt: "must not render",
      },
    ],
  });
  expect(first.insights).toHaveLength(1);
  expect(first.insights[0].sourceKey).toBe(first.sources[0].key);
  expect(appendDiscovery(first, discoveryPage(ranked())).insights).toHaveLength(
    1,
  );
  const changed = appendDiscovery(first, discoveryPage(ranked("v2")));
  expect(changed.sources).toHaveLength(2);
  expect(changed.insights).toHaveLength(2);
  expect(() =>
    appendDiscovery(first, discoveryPage({ ...ranked(), grant_version: 8 })),
  ).toThrow("access changed");
  expect(() =>
    appendDiscovery(first, discoveryPage({ ...ranked(), profile_id: "other" })),
  ).toThrow("access changed");
});
it("does not infer an insight from a legacy post result and retains empty partial continuations", () => {
  const post = discoveryPage({
    profile_id: "p",
    grant_version: 2,
    results: [
      {
        id: "source",
        title: "Post title",
        state: "ready",
        url: "https://scroll.companynerve.com/app/p/posts/source",
      },
    ],
    next_cursor: "next",
    has_more: true,
    exhausted: false,
    coverage: "Candidates remain.",
  });
  expect(post.insights[0].kind).toBe("post");
  expect(post.insights[0].excerpt).toBe("");
  expect(post.partial).toBe(true);
  const empty = discoveryPage({
    ...ranked(),
    matches: [],
    posts: [],
    next_cursor: "more",
    has_more: true,
    exhausted: false,
  });
  expect(empty.hasMore).toBe(true);
  expect(empty.insights).toEqual([]);
});
it("uses the server's saved/team selection and supports both continuation shapes without fabricating a choice", () => {
  const snapshot = {
    selected_profile_id: "team",
    profiles: ["personal", "team"].map((id) => ({
      profile_id: id,
      name: id,
      grant_version: 3,
      projects: [],
    })),
  };
  const profiles = bootstrapProfiles(snapshot);
  expect(selectedWorkspace(snapshot, profiles)).toBe("team");
  expect(selectedWorkspace(snapshot, profiles, "personal")).toBe("personal");
  expect(selectedWorkspace(null, profiles)).toBe("");
  expect(continuationOf({ next_offset: 5 })).toEqual({ offset: 5 });
  expect(continuationOf({ next_cursor: "opaque", next_offset: null })).toEqual({
    cursor: "opaque",
  });
  expect(continuationOf({ next_offset: null })).toBeNull();
  expect(
    boundedMerge(
      [{ id: "one", value: 1 }],
      [
        { id: "one", value: 2 },
        { id: "two", value: 3 },
      ],
    ),
  ).toEqual([
    { id: "one", value: 2 },
    { id: "two", value: 3 },
  ]);
});
it("observes pending reanalysis while keeping the ready incumbent and actual preparation stage", () => {
  const pending = observedProcessing(
    {
      source_status: "ready",
      status: "completed",
      processing: { state: "completed", stage: "evidence_ready" },
      pending_analysis_version: { state: "running" },
      selected_analysis_version_id: "incumbent",
    },
    "ready",
    1000,
  );
  expect(pending.active).toBe(true);
  expect(pending.progress?.title).toBe("Reanalyzing");
  expect(pending.progress?.description).toContain(
    "current analysis stays available",
  );
  expect(pending.steps.map((s) => s.label)).toEqual([
    "Analyze saved evidence",
    "Save the new version",
  ]);
  expect(pending.versionId).toBe("incumbent");
  const preparing = observedProcessing(
    { processing: { state: "running", stage: "transcribing" } },
    "processing",
    1000,
  );
  expect(preparing.progress?.title).toBe("Preparing the transcript");
  expect(preparing.steps[1].state).toBe("running");
});
it("keeps blocked and unknown work stationary and does not imply a retry or successful finish", () => {
  const blocked = observedProcessing(
    {
      processing: {
        state: "processing_blocked",
        failure_code: "QUOTA_EXCEEDED",
      },
      account: {
        processing: {
          allowed: false,
          message: "Hourly processing capacity is used.",
        },
      },
    },
    "saved",
    1000,
  );
  expect(blocked.active).toBe(false);
  expect(blocked.progress).toMatchObject({
    title: "Saved, processing unavailable",
    busy: false,
    description: "Hourly processing capacity is used.",
  });
  expect(blocked.steps).toEqual([]);
  for (const state of ["unknown", "recovering", "failed"]) {
    const model = observedProcessing({ processing: { state } }, "saved", 1000);
    expect(model.active).toBe(false);
    expect(model.progress?.busy).toBe(false);
  }
  expect(
    observedProcessing({ status: "ready" }, "ready", 1000).progress,
  ).toBeNull();
});
