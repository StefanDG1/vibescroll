// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import {
  mergeHomePostProgress,
  parseHomePostProgressSourceIds,
} from "../packages/browser/home-post-progress";
import type {
  HomeSummaryV1,
  PostProgressPageV1,
  PostSummaryV1,
} from "../packages/contracts/post-summary";

vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({ backend: vi.fn(), query: vi.fn() }));
vi.mock("../apps/starter/lib/backend", async () => ({
  backend: session.backend,
  api: (await import("../convex/_generated/api")).api,
}));
import {
  workspacePostProgress,
  workspaceData,
} from "../apps/starter/lib/workspace-data";
import { GET } from "../apps/starter/app/api/workspace/[org]/route";

afterEach(() => vi.resetAllMocks());
it("never falls back to heavy Library reads when Home projections are unavailable", async () => {
  session.backend.mockResolvedValue({ query: session.query });
  session.query.mockImplementation(async (ref) => {
    const name = getFunctionName(ref);
    if (name === "dashboard:home") return { ready: false };
    if (name === "organizations:details")
      return { name: "My team", private: true, role: "owner" };
    throw Error(`UNEXPECTED_HEAVY_QUERY:${name}`);
  });
  const result = await workspaceData({ org: "organization", view: "home" });
  expect(result).toMatchObject({
    homeProjectionPending: true,
    sources: [],
    usage: null,
  });
  expect(session.query).toHaveBeenCalledTimes(2);
});
const hash = (character: string) => character.repeat(64);
function post(id = "post-1"): PostSummaryV1 {
  return {
    version: "post-summary-v1",
    sourceId: id,
    generation: 1,
    projection: "complete",
    contentRevision: hash("a"),
    title: "Saved result",
    sourceKind: "video",
    coverage: "full_video",
    capturedAt: 10,
    savedAt: 10,
    publishedAt: null,
    availableUntil: 10000,
    thumbnail: null,
    insightCount: 1,
    insightPreview: [
      { insightId: "idea", title: "Idea", claimExcerpt: "Claim" },
    ],
    insightPreviewTruncated: false,
    progress: {
      version: "post-progress-v1",
      sourceId: id,
      generation: 1,
      contentRevision: hash("a"),
      progressRevision: hash("b"),
      state: "processing",
      executor: "work_cloud",
      executionState: "running",
      stage: "acquiring",
      orderedPhase: null,
      active: true,
      activeUntil: 1000,
      availableUntil: 10000,
      measuredProgress: null,
    },
  };
}
function fixture() {
  const snapshot: HomeSummaryV1 = {
    version: "home-summary-v1",
    organizationId: "organization",
    scopeKey: hash("c"),
    revision: hash("d"),
    asOf: 100,
    recent: [post(), post("post-2")],
    hasMoreRecent: false,
    projectionComplete: true,
    counts: {
      coverage: "loaded-window",
      posts: 2,
      ready: 0,
      active: 2,
      needsAttention: 0,
    },
  };
  const page: PostProgressPageV1 = {
    version: "post-progress-page-v1",
    organizationId: snapshot.organizationId,
    scopeKey: snapshot.scopeKey,
    asOf: 200,
    items: snapshot.recent.map((p) => ({ ...p.progress })),
    unavailableSourceIds: [],
  };
  return { snapshot, page };
}

it("patches stages and leases without requesting content or forging full Home revisions", () => {
  const { snapshot, page } = fixture();
  const before = structuredClone(snapshot);
  page.items[0] = {
    ...page.items[0],
    stage: "analyzing",
    activeUntil: 2000,
    progressRevision: hash("e"),
  };
  const merged = mergeHomePostProgress(snapshot, page, 300);
  expect(merged).toMatchObject({
    requiresRefresh: false,
    scopeChanged: false,
    asOf: 200,
  });
  expect(merged.postSummaries[0].insightPreview).toEqual(
    snapshot.recent[0].insightPreview,
  );
  expect(merged.postSummaries[0].progress).toEqual(page.items[0]);
  expect(merged.postSummaries[0].contentRevision).toBe(
    snapshot.recent[0].contentRevision,
  );
  expect(merged).not.toHaveProperty("revision");
  expect(merged).not.toHaveProperty("counts");
  expect(snapshot).toEqual(before);
});

it.each(["organizationId", "scopeKey"] as const)(
  "clears protected previews on %s mismatch",
  (field) => {
    const { snapshot, page } = fixture();
    page[field] = field === "scopeKey" ? hash("f") : "other-org";
    expect(mergeHomePostProgress(snapshot, page, 300)).toMatchObject({
      postSummaries: [],
      requiresRefresh: true,
      scopeChanged: true,
    });
  },
);

it.each(["generation", "contentRevision", "completion"] as const)(
  "removes stale %s content immediately and requests a full read",
  (change) => {
    const { snapshot, page } = fixture();
    if (change === "generation") page.items[0].generation = 2;
    else page.items[0].contentRevision = hash("f");
    if (change === "completion") {
      page.items[0].state = "ready";
      page.items[0].executionState = "completed";
      page.items[0].active = false;
    }
    const merged = mergeHomePostProgress(snapshot, page, 300);
    expect(merged.postSummaries.map((p) => p.sourceId)).toEqual(["post-2"]);
    expect(merged.requiresRefresh).toBe(true);
  },
);

it.each([
  "unavailable",
  "missing",
  "retention",
  "shortened-retention",
] as const)(
  "erases %s previews without waiting for the full refresh",
  (change) => {
    const { snapshot, page } = fixture();
    if (change === "unavailable" || change === "missing") page.items.shift();
    if (change === "unavailable") page.unavailableSourceIds.push("post-1");
    if (change === "retention") {
      snapshot.recent[0].availableUntil =
        snapshot.recent[0].progress.availableUntil = 300;
      page.items[0].availableUntil = 300;
    }
    if (change === "shortened-retention") page.items[0].availableUntil = 300;
    const merged = mergeHomePostProgress(snapshot, page, 300);
    expect(merged.postSummaries.map((p) => p.sourceId)).toEqual(["post-2"]);
    expect(merged.requiresRefresh).toBe(true);
  },
);

it.each(["duplicate", "overlap", "foreign"] as const)(
  "fails closed for %s response coverage",
  (change) => {
    const { snapshot, page } = fixture();
    if (change === "duplicate") page.items.push(page.items[0]);
    if (change === "overlap") page.unavailableSourceIds.push("post-1");
    if (change === "foreign") page.items[0].sourceId = "foreign-post";
    expect(mergeHomePostProgress(snapshot, page, 300)).toMatchObject({
      postSummaries: [],
      requiresRefresh: true,
    });
  },
);

it("conservatively removes legacy previews on any progress revision change", () => {
  const { snapshot, page } = fixture();
  snapshot.recent[0].projection = "legacy";
  snapshot.recent[0].contentRevision =
    snapshot.recent[0].progress.contentRevision = null;
  page.items[0].contentRevision = null;
  expect(mergeHomePostProgress(snapshot, page, 300).requiresRefresh).toBe(
    false,
  );
  page.items[0].progressRevision = hash("e");
  expect(
    mergeHomePostProgress(snapshot, page, 300).postSummaries.map(
      (p) => p.sourceId,
    ),
  ).toEqual(["post-2"]);
});

it("rejects older progress without applying it and still removes locally expired content", () => {
  const { snapshot, page } = fixture();
  page.asOf = 50;
  page.items[1].stage = "queued";
  const merged = mergeHomePostProgress(snapshot, page, 10000);
  expect(merged).toMatchObject({ postSummaries: [], requiresRefresh: true });
});

it("rejects unknown runtime shapes, invalid time and broken snapshot identity bindings", () => {
  const { snapshot, page } = fixture();
  expect(() =>
    mergeHomePostProgress(
      snapshot,
      { ...page, secret: "forbidden" } as PostProgressPageV1,
      300,
    ),
  ).toThrow();
  expect(() => mergeHomePostProgress(snapshot, page, NaN)).toThrow();
  snapshot.recent[0].progress.sourceId = "foreign-post";
  expect(() => mergeHomePostProgress(snapshot, page, 300)).toThrow("bindings");
});

it("bounds distinct request IDs before any backend initialization or query", async () => {
  expect(
    parseHomePostProgressSourceIds(
      Array.from({ length: 30 }, (_, i) => `post-${i}`),
    ),
  ).toHaveLength(30);
  for (const ids of [
    Array.from({ length: 31 }, (_, i) => `post-${i}`),
    ["same", "same"],
    ["x".repeat(101)],
    [""],
    ["post/invalid"],
  ])
    await expect(workspacePostProgress("organization", ids)).rejects.toThrow();
  await expect(workspacePostProgress("x".repeat(101), [])).rejects.toThrow();
  expect(session.backend).not.toHaveBeenCalled();
  expect(session.query).not.toHaveBeenCalled();
});

function servingFixture() {
  const { page } = fixture();
  session.backend.mockResolvedValue({ query: session.query });
  session.query.mockImplementation(async (ref, args) => {
    expect(getFunctionName(ref)).toBe("dashboard:progress");
    expect(args).toEqual({
      organizationId: "organization",
      sourceIds: ["post-1", "post-2"],
    });
    return page;
  });
  return page;
}
it("serves repeated sourceIds through the existing GET with exactly one scoped compact query", async () => {
  const page = servingFixture();
  const response = await GET(
    new Request(
      "https://example.test/api/workspace/organization?view=post-progress&sourceIds=post-1&sourceIds=post-2",
    ),
    { params: Promise.resolve({ org: "organization" }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual(page);
  expect(session.query).toHaveBeenCalledTimes(1);
});

it("does not turn invalid input, revoked authorization or mismatched output into broad workspace fallback", async () => {
  servingFixture();
  const request = (query = "sourceIds=post-1&sourceIds=post-2") =>
    GET(
      new Request(
        `https://example.test/api/workspace/organization?view=post-progress&${query}`,
      ),
      { params: Promise.resolve({ org: "organization" }) },
    );
  expect((await request("sourceIds=same&sourceIds=same")).status).toBe(404);
  expect(session.query).not.toHaveBeenCalled();
  session.query.mockRejectedValueOnce(Error("ACCESS_LOST"));
  expect((await request()).status).toBe(404);
  session.query.mockResolvedValueOnce({
    ...fixture().page,
    organizationId: "foreign-org",
  });
  expect((await request()).status).toBe(404);
  expect(session.query).toHaveBeenCalledTimes(2);
});
