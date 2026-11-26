import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { fixture } from "./chat-proposal-fixture";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const creatorKey = "tiktok:123456789";

async function watched(key = creatorKey) {
  vi.useFakeTimers();
  const f = await fixture();
  vi.stubEnv("VIBESCROLL_CREATOR_DISCOVERY_ENABLED", "true");
  vi.stubEnv("VIBESCROLL_TIKTOK_ORDERED_ENABLED", "true");
  vi.stubEnv("WORK_CLOUD_MEDIA_ENABLED", "true");
  await f.t.run((c) =>
    c.db.patch(f.sourceId, {
      creator: { key, handle: "creator", generation: 1 },
    }),
  );
  await f.owner.mutation(api.creators.setFollow, {
    organizationId: f.org,
    creatorKey: key,
    sourceId: f.sourceId,
    following: true,
  });
  await f.t.mutation(internal.creatorDiscovery.schedule, {});
  const watch = (await f.t.run((c) => c.db.query("creatorWatches").unique()))!;
  return { ...f, watch };
}
function feed(now: number) {
  const user = {
    id: "123456789",
    uniqueId: "creator",
    secUid: "MS4wLjABAAAA" + "a".repeat(32),
  };
  return vi.fn(async (url: string | URL | Request) =>
    String(url).includes("/api/")
      ? Response.json({
          statusCode: 0,
          hasMorePrevious: true,
          itemList: [
            {
              id: "7553302113757990166",
              createTime: now / 1000 - 7 * 86400,
              author: user,
              imagePost: { images: [{}] },
            },
            {
              id: "7553302113757990167",
              createTime: now / 1000 - 60,
              author: user,
              imagePost: { images: [{}, {}] },
            },
          ],
        })
      : new Response(
          `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.user-detail": { userInfo: { user } } } })}</script>`,
        ),
  );
}
it("checks a public creator, retains photos and keeps pagination despite an old pinned post", async () => {
  const f = await watched();
  const now = Math.floor(Date.now() / 1000) * 1000;
  vi.stubGlobal("fetch", feed(now));
  await f.t.action(internal.creatorDiscovery.check, {
    id: f.watch._id,
    creatorKey,
    leaseUntil: f.watch.leaseUntil!,
    windowStartAt: f.watch.windowStartAt!,
    handle: "creator",
    cursor: null,
  });
  const state = await f.t.run(async (c) => ({
    watch: await c.db.get(f.watch._id),
    posts: await c.db.query("creatorDiscoveries").collect(),
    runs: await c.db.query("creatorPoolRuns").collect(),
  }));
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]).toMatchObject({
    durationMs: 0,
    postKey: "tiktok:7553302113757990167",
  });
  expect(state.watch).toMatchObject({
    state: "incomplete",
    handle: "creator",
    cursor: now - 60000,
  });
  expect(state.runs).toHaveLength(0);
});
it("records a provider outage without creating discoveries or credit work", async () => {
  const f = await watched();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 429 })),
  );
  await f.t.action(internal.creatorDiscovery.check, {
    id: f.watch._id,
    creatorKey,
    leaseUntil: f.watch.leaseUntil!,
    windowStartAt: f.watch.windowStartAt!,
    handle: "creator",
    cursor: null,
  });
  const state = await f.t.run(async (c) => ({
    watch: await c.db.get(f.watch._id),
    posts: await c.db.query("creatorDiscoveries").collect(),
    runs: await c.db.query("creatorPoolRuns").collect(),
    source: await c.db.get(f.sourceId),
  }));
  expect(state.watch?.state).toBe("unavailable");
  expect(state.posts).toHaveLength(0);
  expect(state.runs).toHaveLength(0);
  expect(state.source?.selectedAnalysisVersionId).toBe(f.versionId);
});

it("stores a real-shaped X timeline discovery after Follow without sponsoring historical posts", async () => {
  const key = "x:4686835494",
    f = await watched(key),
    now = Math.floor(Date.now() / 1000) * 1000;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        code: 200,
        results: [
          {
            type: "status",
            id: "2125691968407871598",
            url: "https://x.com/creator/status/2125691968407871598",
            created_timestamp: now / 1000 - 60,
            author: {
              id: "4686835494",
              screen_name: "creator",
              protected: false,
            },
            media: { photos: [{}] },
          },
        ],
        cursor: { bottom: null },
      }),
    ),
  );
  await f.t.action(internal.creatorDiscovery.check, {
    id: f.watch._id,
    creatorKey: key,
    leaseUntil: f.watch.leaseUntil!,
    windowStartAt: f.watch.windowStartAt!,
    handle: "creator",
    cursor: null,
  });
  const state = await f.t.run(async (c) => ({
    watch: await c.db.get(f.watch._id),
    posts: await c.db.query("creatorDiscoveries").take(10),
    runs: await c.db.query("creatorPoolRuns").take(10),
  }));
  expect(state.watch).toMatchObject({
    state: "ready",
    creatorKey: key,
    profileUrl: "https://x.com/creator",
  });
  expect(state.posts).toMatchObject([
    { postKey: "x:2125691968407871598", durationMs: 0 },
  ]);
  expect(state.runs).toEqual([]);
});
