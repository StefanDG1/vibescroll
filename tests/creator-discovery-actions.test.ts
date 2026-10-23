import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  createCreatorTransport,
  creatorActorInput,
  creatorTransportSchema,
} from "../packages/providers/creator-transport";

const modules = import.meta.glob("../convex/**/*.ts");
const NOW = Date.UTC(2026, 9, 23, 12);
const descriptor = {
  adapter: "apify-discovery-v1" as const,
  actors: [
    {
      platform: "instagram" as const,
      name: "apify~instagram-scraper" as const,
      id: "actor1",
      build: "1.2.3",
      buildId: "build1",
    },
  ],
  timeoutSeconds: 20,
  memoryMb: 256 as const,
  maximumItems: 100,
  runMaximumUsdMicros: 5,
  minimumCheckUsdMicros: 10,
  allowIncompleteSnapshots: false,
};
const run = (status = "SUCCEEDED", overrides = {}) => ({
  data: {
    id: "run1",
    actId: "actor1",
    buildId: "build1",
    defaultDatasetId: "dataset1",
    defaultKeyValueStoreId: "store1",
    defaultRequestQueueId: "queue1",
    status,
    ...overrides,
  },
});
const image = {
  id: "post1",
  ownerId: "creator1",
  shortCode: "ABC_1",
  url: "https://www.instagram.com/p/ABC_1/",
  type: "Image",
  caption: "Synthetic metadata",
  timestamp: "2026-10-23T11:00:00.000Z",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function enable(transport: unknown = descriptor) {
  vi.stubEnv("CREATOR_FOLLOWING_ENABLED", "true");
  vi.stubEnv("APIFY_TOKEN", "synthetic-test-token-not-a-credential");
  vi.stubEnv(
    "CREATOR_PROVIDER_CONFIGURATION",
    JSON.stringify({
      version: "creator-provider-v1",
      provider: "apify",
      reviewReference: "synthetic-not-live",
      expiresAt: NOW + 86400000,
      budgetKey: "social-discovery-usd-micros:v1:synthetic-transport",
      ceilingUsdMicros: 100,
      perCheckUsdMicros: 10,
      maximumChecks: 10,
      includesMinimumRetriesStorageAndLag: true,
      includesDeliveryAndRevocationCleanup: true,
      ...(transport ? { transport } : {}),
      rights: {
        version: "social-rights-v1",
        evidenceId: "synthetic-rights",
        provider: "apify",
        platforms: ["instagram"],
        creatorScope: "public_creators",
        creatorIds: [],
        collection: true,
        mediaAcquisition: true,
        aiProcessing: true,
        crossCustomerReuse: true,
        routes: ["save_only", "own_subscription", "managed_api"].filter(
          (r) => r !== "save_only",
        ),
        reviewedAt: NOW - 1000,
        expiresAt: NOW + 86400000,
        maxRetentionMs: 86400000,
        deletionWithinMs: 1000,
      },
    }),
  );
}
async function setup(transport: unknown = descriptor) {
  enable(transport);
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["creator-transport-owner"]');
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject: "creator-transport-owner",
    email: "synthetic@example.test",
    name: "Synthetic",
    verified: true,
  });
  const client = t.withIdentity({
    subject: "creator-transport-owner",
    auth_time: NOW / 1000,
  });
  const org = await client.mutation(api.organizations.createPrivate, {});
  await client.mutation(api.creators.follow, {
    organizationId: org,
    profileUrl: "https://www.instagram.com/synthetic_creator/",
    mode: "future",
    maxAssets: 30,
    maxVideoMs: 600000,
    route: "save_only",
    timezone: "UTC",
    digestHour: 9,
    rightsAttested: true,
  });
  const id = await t.mutation(internal.creators.resolve, {
    profileUrl: "https://www.instagram.com/synthetic_creator/",
    creatorId: "creator1",
    provider: "apify",
    rightsEvidenceId: "synthetic-rights",
  });
  await client.mutation(api.creators.change, {
    id: (
      await client.query(api.creators.list, {
        organizationId: org,
        cursor: null,
      })
    ).items[0]._id,
    expectedVersion: 1,
    action: "resume",
  });
  return { t, id, client, org };
}
async function addHealthyWatch(s: Awaited<ReturnType<typeof setup>>) {
  const profileUrl = "https://www.instagram.com/healthy_creator/";
  await s.client.mutation(api.creators.follow, {
    organizationId: s.org,
    profileUrl,
    mode: "future",
    maxAssets: 30,
    maxVideoMs: 600000,
    route: "save_only",
    timezone: "UTC",
    digestHour: 9,
    rightsAttested: true,
  });
  const id = await s.t.mutation(internal.creators.resolve, {
    profileUrl,
    creatorId: "creator2",
    provider: "apify",
    rightsEvidenceId: "synthetic-rights",
  });
  const list = await s.client.query(api.creators.list, {
    organizationId: s.org,
    cursor: null,
  });
  const subscription = list.items.find((row) => row.canonical === profileUrl)!;
  await s.client.mutation(api.creators.change, {
    id: subscription._id,
    expectedVersion: subscription.version,
    action: "resume",
  });
  await s.t.run((ctx) => ctx.db.patch(s.id, { nextCheckAt: NOW - 1000 }));
  return id;
}
function fakeSupplier(
  extra?: (url: URL, init: RequestInit) => Promise<Response | undefined>,
) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(String(url));
      calls.push({ url: u, init: init ?? {} });
      const custom = await extra?.(u, init ?? {});
      if (custom) return custom;
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (u.pathname.endsWith("/items")) return json([image]);
      return json(run());
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return { calls, fetcher };
}
it("stays pending without a reviewed descriptor or token and reserves nothing", async () => {
  const s = await setup(null),
    f = fakeSupplier();
  expect(
    await s.t.action(internal.creatorDiscoveryActions.dispatch, {}),
  ).toEqual({ attempted: 0, pending: true });
  expect(f.calls).toHaveLength(0);
  expect(
    await s.t.run((ctx) => ctx.db.query("inferenceReservations").collect()),
  ).toEqual([]);
  enable();
  vi.stubEnv("APIFY_TOKEN", "");
  expect(
    (await s.t.action(internal.creatorDiscoveryActions.dispatch, {})).pending,
  ).toBe(true);
});
it("runs the real action once with pinned build, caps, durable receipts, normalized posts and confirmed owned cleanup", async () => {
  const s = await setup(),
    f = fakeSupplier();
  expect(
    await s.t.action(internal.creatorDiscoveryActions.dispatch, {}),
  ).toEqual({ attempted: 1, pending: false });
  const watch = await s.t.run((ctx) => ctx.db.get(s.id));
  expect(watch).toMatchObject({
    state: "paused",
    incomplete: true,
    supplierCleanup: "confirmed",
    supplierOperations: {
      start: 1,
      dataset: 1,
      delete_dataset: 1,
      delete_store: 1,
      delete_queue: 1,
      delete_run: 1,
    },
  });
  const start = f.calls[0];
  expect(start.url.pathname).toBe("/v2/actors/apify~instagram-scraper/runs");
  expect(Object.fromEntries(start.url.searchParams)).toMatchObject({
    build: "1.2.3",
    timeout: "20",
    memory: "256",
    maxItems: "100",
    maxTotalChargeUsd: "0.000005",
    restartOnError: "false",
    waitForFinish: "0",
  });
  expect(start.init.redirect).toBe("error");
  expect(JSON.parse(start.init.body as string)).toEqual({
    directUrls: ["https://www.instagram.com/synthetic_creator/"],
    resultsType: "posts",
    resultsLimit: 100,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("creatorPosts").collect()),
  ).toHaveLength(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
  ).toMatchObject([{ reserved: 0, spent: 10 }]);
  expect(
    await s.t.run((ctx) => ctx.db.query("matchingJobs").collect()),
  ).toEqual([]);
  expect(
    await s.t.run((ctx) => ctx.db.query("localLibraryRuns").collect()),
  ).toEqual([]);
  expect(
    (await s.t.action(internal.creatorDiscoveryActions.dispatch, {})).attempted,
  ).toBe(0);
});
it("allows reviewed daily incomplete snapshots but never marks creator coverage complete", async () => {
  const s = await setup({ ...descriptor, allowIncompleteSnapshots: true });
  fakeSupplier();
  await s.t.action(internal.creatorDiscoveryActions.dispatch, {});
  expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
    state: "active",
    incomplete: true,
    supplierCleanup: "confirmed",
  });
});
it("pauses an unauthorized first watch and discovers the next watch without allocating the rejected check", async () => {
  const s = await setup(),
    healthy = await addHealthyWatch(s);
  await s.t.run(async (ctx) => {
    const sub = await ctx.db
      .query("creatorSubscriptions")
      .withIndex("by_watch", (q) => q.eq("watchId", s.id).eq("state", "active"))
      .unique();
    await ctx.db.patch(sub!._id, { rightsAttested: false });
  });
  const f = fakeSupplier(async (url) =>
    url.pathname.endsWith("/items")
      ? json([{ ...image, ownerId: "creator2" }])
      : undefined,
  );
  expect(
    await s.t.action(internal.creatorDiscoveryActions.dispatch, {}),
  ).toEqual({ attempted: 2, pending: false });
  expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
    state: "paused",
  });
  expect(await s.t.run((ctx) => ctx.db.get(healthy))).toMatchObject({
    supplierCleanup: "confirmed",
  });
  expect(
    f.calls.filter((call) => call.url.pathname.endsWith("/runs")),
  ).toHaveLength(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
  ).toMatchObject([{ reserved: 0, spent: 10 }]);
});
it("advances past a bounded prefix of unsupported-platform watches without reserving supplier work", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    for (let index = 0; index < 20; index++)
      await ctx.db.insert("creatorWatches", {
        platform: "tiktok",
        creatorId: `unsupported${index}`,
        canonical: `https://www.tiktok.com/@unsupported${index}/`,
        provider: "apify",
        rightsEvidenceId: "synthetic-rights",
        version: 1,
        generation: 0,
        state: "active",
        nextCheckAt: NOW - 1000,
        incomplete: true,
        createdAt: NOW,
        updatedAt: NOW,
      });
  });
  const f = fakeSupplier();
  for (let pass = 0; pass < 4; pass++) {
    expect(
      await s.t.action(internal.creatorDiscoveryActions.dispatch, {}),
    ).toEqual({ attempted: 5, pending: false });
    expect(f.calls).toHaveLength(0);
    expect(
      await s.t.run((ctx) => ctx.db.query("inferenceReservations").collect()),
    ).toEqual([]);
  }
  expect(
    await s.t.action(internal.creatorDiscoveryActions.dispatch, {}),
  ).toEqual({ attempted: 1, pending: false });
  expect(
    f.calls.filter((call) => call.url.pathname.endsWith("/runs")),
  ).toHaveLength(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
  ).toMatchObject([{ reserved: 0, spent: 10 }]);
});
it("leaves a current claim alone, then holds and pauses its abandoned attempt before later healthy discovery", async () => {
  const s = await setup(),
    healthy = await addHealthyWatch(s);
  const watch = await s.t.run((ctx) => ctx.db.get(s.id));
  const claim = await s.t.mutation(internal.creatorDiscovery.claim, {
    id: s.id,
    expectedVersion: watch!.version,
    requireTransport: true,
  });
  // A concurrent dispatcher may observe a current action. It cannot pause it.
  expect(
    await s.t.mutation(internal.creatorDiscovery.preflight, {
      id: s.id,
      expectedVersion: watch!.version,
      expectedGeneration: watch!.generation,
    }),
  ).toBe("busy");
  expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
    state: "active",
    lease: claim.lease,
  });
  await s.t.mutation(internal.creatorDiscovery.operation, {
    id: claim.id,
    generation: claim.generation,
    lease: claim.lease,
    reservationKey: claim.reservationKey,
    operation: "start",
  });
  vi.setSystemTime(NOW + 60001);
  const f = fakeSupplier(async (url) =>
    url.pathname.endsWith("/items")
      ? json([{ ...image, ownerId: "creator2" }])
      : undefined,
  );
  // The first observed unknown stops this dispatch and keeps its complete hold.
  expect(
    await s.t.action(internal.creatorDiscoveryActions.dispatch, {}),
  ).toEqual({ attempted: 1, pending: false });
  expect(f.calls).toHaveLength(0);
  expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
    state: "paused",
    reservationKey: claim.reservationKey,
    supplierOperations: { start: 1 },
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
  ).toMatchObject([{ reserved: 10, spent: 0 }]);
  expect(
    await s.t.action(internal.creatorDiscoveryActions.dispatch, {}),
  ).toEqual({ attempted: 1, pending: false });
  expect(await s.t.run((ctx) => ctx.db.get(healthy))).toMatchObject({
    supplierCleanup: "confirmed",
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("inferenceReservations").collect()),
  ).toMatchObject([
    { key: claim.reservationKey, state: "social_discovery_unknown" },
    { state: "social_discovery_bounded_complete" },
  ]);
  expect(
    await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
  ).toMatchObject([{ reserved: 10, spent: 10 }]);
  expect(
    f.calls.filter((call) => call.url.pathname.endsWith("/runs")),
  ).toHaveLength(1);
});
it("refuses creator-specific Instagram handle collection before reservation", async () => {
  const s = await setup();
  const config = JSON.parse(process.env.CREATOR_PROVIDER_CONFIGURATION!);
  config.rights.creatorScope = "specified";
  config.rights.creatorIds = ["creator1"];
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", JSON.stringify(config));
  const f = fakeSupplier();
  await s.t.action(internal.creatorDiscoveryActions.dispatch, {});
  expect(f.calls).toHaveLength(0);
  expect(
    await s.t.run((ctx) => ctx.db.query("inferenceReservations").collect()),
  ).toEqual([]);
  expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
    state: "paused",
  });
});
it.each(["lost", "429", "503"])(
  "retains the entire hold on %s start acknowledgement and never retries or resumes",
  async (failure) => {
    const s = await setup();
    const f = fakeSupplier(async (u) => {
      if (u.pathname.endsWith("/runs")) {
        if (failure === "lost") throw Error("synthetic lost acknowledgement");
        return json({}, Number(failure));
      }
    });
    expect(
      (await s.t.action(internal.creatorDiscoveryActions.dispatch, {}))
        .attempted,
    ).toBe(1);
    expect(f.calls).toHaveLength(1);
    expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
      state: "paused",
      supplierOperations: { start: 1 },
      supplierCleanup: "unknown",
    });
    expect(
      await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
    ).toMatchObject([{ reserved: 10, spent: 0 }]);
    expect(
      await s.t.run((ctx) => ctx.db.query("inferenceReservations").collect()),
    ).toMatchObject([{ state: "social_discovery_unknown" }]);
    expect(
      (await s.t.action(internal.creatorDiscoveryActions.dispatch, {}))
        .attempted,
    ).toBe(0);
  },
);
it("halts on partial dataset with bounded paging, cleanup and no continuation launch", async () => {
  const s = await setup();
  const f = fakeSupplier(async (u) =>
    u.pathname.endsWith("/items")
      ? json(Array.from({ length: 40 }, () => image))
      : undefined,
  );
  await s.t.action(internal.creatorDiscoveryActions.dispatch, {});
  expect(f.calls.filter((c) => c.url.pathname.endsWith("/items"))).toHaveLength(
    3,
  );
  expect(f.calls.filter((c) => c.url.pathname.endsWith("/runs"))).toHaveLength(
    1,
  );
  expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
    state: "paused",
    supplierCleanup: "confirmed",
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("creatorPosts").collect()),
  ).toEqual([]);
  expect(
    await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
  ).toMatchObject([{ reserved: 10, spent: 0 }]);
});
it.each(["foreign_creator", "changed_build", "cleanup_lost"])(
  "does not accept %s as successful",
  async (failure) => {
    const s = await setup();
    fakeSupplier(async (u, init) => {
      if (failure === "foreign_creator" && u.pathname.endsWith("/items"))
        return json([{ ...image, ownerId: "foreign" }]);
      if (failure === "changed_build" && u.pathname.endsWith("/runs"))
        return json(run("SUCCEEDED", { buildId: "foreignBuild" }));
      if (failure === "cleanup_lost" && init.method === "DELETE")
        throw Error("synthetic lost cleanup");
      return undefined;
    });
    await s.t.action(internal.creatorDiscoveryActions.dispatch, {});
    expect(
      await s.t.run((ctx) => ctx.db.query("creatorPosts").collect()),
    ).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
      state: "paused",
    });
    expect(
      await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
    ).toMatchObject([{ reserved: 10, spent: 0 }]);
  },
);
it("cancels after lost recipient authority while still aborting and cleaning only the original owned run", async () => {
  const s = await setup();
  const f = fakeSupplier(async (u) => {
    if (u.pathname.endsWith("/runs")) {
      const list = await s.client.query(api.creators.list, {
        organizationId: s.org,
        cursor: null,
      });
      await s.client.mutation(api.creators.change, {
        id: list.items[0]._id,
        expectedVersion: list.items[0].version,
        action: "pause",
      });
      return json(run("RUNNING"));
    }
    if (u.pathname.endsWith("/abort")) return json(run("ABORTED"));
    return undefined;
  });
  await s.t.action(internal.creatorDiscoveryActions.dispatch, {});
  expect(f.calls.some((c) => c.url.pathname.endsWith("/abort"))).toBe(true);
  expect(f.calls.some((c) => c.url.pathname.endsWith("/items"))).toBe(false);
  expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
    generation: 1,
    state: "paused",
    supplierCleanup: "confirmed",
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
  ).toMatchObject([{ reserved: 10, spent: 0 }]);
});
it("enforces durable per-attempt counters across transport instances, without inventing a new start after unknown", async () => {
  const s = await setup();
  const watch = await s.t.run((ctx) => ctx.db.get(s.id));
  const claim = await s.t.mutation(internal.creatorDiscovery.claim, {
    id: s.id,
    expectedVersion: watch!.version,
    requireTransport: true,
  });
  const binding = {
    id: claim.id,
    generation: claim.generation,
    lease: claim.lease,
    reservationKey: claim.reservationKey,
  };
  await s.t.mutation(internal.creatorDiscovery.operation, {
    ...binding,
    operation: "start",
  });
  await expect(
    s.t.mutation(internal.creatorDiscovery.operation, {
      ...binding,
      operation: "start",
    }),
  ).rejects.toThrow("physical request bound");
  await s.t.mutation(internal.creatorDiscovery.retainUnknown, binding);
  await expect(
    s.t.mutation(internal.creatorDiscovery.claim, {
      id: s.id,
      expectedVersion: watch!.version,
      requireTransport: true,
    }),
  ).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()),
  ).toMatchObject([{ reserved: 10, spent: 0 }]);
  // Restore/resolve cannot clear an uncertain external attempt by removing
  // active lease fields. Its original reservation remains authoritative.
  await s.t.run((ctx) =>
    ctx.db.patch(s.id, {
      state: "active",
      generation: 1,
      lease: undefined,
      leaseUntil: undefined,
      reservationKey: undefined,
    }),
  );
  await expect(
    s.t.mutation(internal.creatorDiscovery.claim, {
      id: s.id,
      expectedVersion: watch!.version,
      requireTransport: true,
    }),
  ).rejects.toThrow("unresolved supplier attempt");
});
it.each(["declared", "streamed"])(
  "halts and cancels %s oversized responses before another content request",
  async (mode) => {
    const calls: string[] = [];
    let cancelled = false;
    const fetcher = vi.fn(async () => {
      calls.push("start");
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(1_000_001));
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(stream, {
        headers: mode === "declared" ? { "content-length": "1000001" } : {},
      });
    });
    const transport = createCreatorTransport({
      descriptor,
      platform: "instagram",
      creatorId: "creator1",
      canonical: "https://www.instagram.com/synthetic/",
      token: "synthetic",
      deadline: NOW + 60000,
      before: async () => {},
      recordRun: async () => {},
      fetch: fetcher,
    });
    await expect(transport.start()).rejects.toThrow("CREATOR_RESPONSE_BOUND");
    await expect(transport.start()).rejects.toThrow("CREATOR_TRANSPORT_BOUND");
    expect(calls).toHaveLength(1);
    expect(cancelled).toBe(true);
  },
);
it("rechecks the absolute deadline after its durable reservation and before HTTP dispatch", async () => {
  const fetcher = vi.fn();
  const transport = createCreatorTransport({
    descriptor,
    platform: "instagram",
    creatorId: "creator1",
    canonical: "https://www.instagram.com/synthetic/",
    token: "synthetic",
    deadline: NOW + 60000,
    workDeadline: NOW + 1000,
    before: async () => {
      vi.setSystemTime(NOW + 1001);
    },
    recordRun: async () => {},
    fetch: fetcher,
  });
  await expect(transport.start()).rejects.toThrow("CREATOR_TRANSPORT_BOUND");
  expect(fetcher).not.toHaveBeenCalled();
});
it("bounds physical dispatch before fetch even if callers retry or cleanup loses its ACK", async () => {
  let starts = 0;
  const f = fakeSupplier(async (u, init) => {
    if (u.pathname.endsWith("/runs")) starts++;
    if (init.method === "DELETE") throw Error("lost deletion ACK");
    return undefined;
  });
  const transport = createCreatorTransport({
    descriptor,
    platform: "instagram",
    creatorId: "creator1",
    canonical: "https://www.instagram.com/synthetic_creator/",
    token: "synthetic",
    deadline: NOW + 60000,
    before: async () => {},
    recordRun: async () => {},
    fetch: f.fetcher,
  });
  await transport.start();
  await expect(transport.start()).rejects.toThrow("CREATOR_TRANSPORT_BOUND");
  await expect(transport.cleanup()).rejects.toThrow("lost deletion ACK");
  await expect(transport.cleanup()).rejects.toThrow("CREATOR_TRANSPORT_BOUND");
  expect(starts).toBe(1);
  expect(f.calls.filter((c) => c.init.method === "DELETE")).toHaveLength(1);
});
it("rejects descriptor drift and keeps TikTok paid media, AI, subtitles and follower extras off", () => {
  expect(() =>
    creatorTransportSchema.parse({
      ...descriptor,
      actors: [{ ...descriptor.actors[0], build: "latest" }],
    }),
  ).toThrow();
  const input = creatorActorInput(
    "tiktok",
    "creator1",
    "https://www.tiktok.com/@synthetic/",
    100,
  );
  expect(input).toMatchObject({
    profiles: ["creator1"],
    shouldDownloadVideos: false,
    shouldDownloadSlideshowImages: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    aiVideoDescription: false,
    aiVideoSummary: false,
    commentsPerPost: 0,
    maxFollowersPerProfile: 0,
    maxFollowingPerProfile: 0,
  });
  expect(input).not.toHaveProperty("videoKvStoreIdOrName");
});
