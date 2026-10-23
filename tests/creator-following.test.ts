import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { DiscoveredPost } from "../packages/social/discovery";
const modules = import.meta.glob("../convex/**/*.ts");
type Test = TestConvex<typeof schema>;
const NOW = Date.UTC(2026, 9, 23, 12);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function enable() {
  vi.stubEnv("CREATOR_FOLLOWING_ENABLED", "true");
  vi.stubEnv(
    "CREATOR_PROVIDER_CONFIGURATION",
    JSON.stringify({
      version: "creator-provider-v1",
      provider: "synthetic-unit-provider",
      reviewReference: "synthetic-unit-review-not-live-rights",
      expiresAt: NOW + 7 * 86400000,
      budgetKey: "social-discovery-usd-micros:v1:synthetic-unit",
      ceilingUsdMicros: 100,
      perCheckUsdMicros: 10,
      maximumChecks: 10,
      includesMinimumRetriesStorageAndLag: true,
      includesDeliveryAndRevocationCleanup: true,
      rights: {
        version: "social-rights-v1",
        evidenceId: "synthetic-unit-rights",
        provider: "synthetic-unit-provider",
        platforms: ["instagram", "tiktok"],
        creatorScope: "public_creators",
        creatorIds: [],
        collection: true,
        mediaAcquisition: true,
        aiProcessing: true,
        crossCustomerReuse: true,
        routes: ["own_subscription", "managed_api"],
        reviewedAt: NOW - 1000,
        expiresAt: NOW + 7 * 86400000,
        maxRetentionMs: 86400000,
        deletionWithinMs: 1000,
      },
    }),
  );
}
async function setup(enabled = true) {
  vi.stubEnv("CREATOR_FOLLOWING_ENABLED", "false");
  vi.stubEnv(
    "PERSONAL_ALPHA_SUBJECTS_JSON",
    '["creator-owner-a","creator-owner-b"]',
  );
  if (enabled) enable();
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  async function actor(subject: string) {
    const id = await t.mutation(internal.accounts.syncUser, {
      subject,
      email: `${subject}@example.test`,
      name: "Synthetic owner",
      verified: true,
    });
    const client = t.withIdentity({
      subject,
      auth_time: Math.floor(NOW / 1000),
    });
    const org = await client.mutation(api.organizations.createPrivate, {});
    return { id, client, org };
  }
  return {
    t,
    a: await actor("creator-owner-a"),
    b: await actor("creator-owner-b"),
  };
}
type Owner = Awaited<ReturnType<typeof setup>>["a"];
const profileUrl = "https://www.instagram.com/synthetic_creator/";
async function follow(owner: Owner, extra: Record<string, unknown> = {}) {
  return owner.client.mutation(api.creators.follow, {
    organizationId: owner.org,
    profileUrl,
    mode: "future",
    maxAssets: 30,
    maxVideoMs: 600000,
    route: "save_only",
    timezone: "UTC",
    digestHour: 9,
    rightsAttested: true,
    ...extra,
  });
}
async function resolve(t: Test, url = profileUrl) {
  return t.mutation(internal.creators.resolve, {
    profileUrl: url,
    creatorId: "stable-creator",
    provider: "synthetic-unit-provider",
    rightsEvidenceId: "synthetic-unit-rights",
  });
}
function post(id: string, extra: Partial<DiscoveredPost> = {}): DiscoveredPost {
  return {
    platform: "instagram",
    creatorId: "stable-creator",
    postId: id,
    canonical: `https://www.instagram.com/p/${id}/`,
    publishedAt: NOW + 1000,
    observedAt: NOW + 2000,
    dateReliability: "provider",
    caption: "Synthetic provider metadata; no media or inference.",
    assetCount: 1,
    videoDurationMs: 0,
    mediaKinds: ["image"],
    revisionKey: `revision-${id}`,
    ...extra,
  };
}
async function discover(
  s: Awaited<ReturnType<typeof setup>>,
  values: DiscoveredPost[],
  complete = true,
) {
  const due = await s.t.query(internal.creatorDiscovery.due, {});
  expect(due).toHaveLength(1);
  const claim = await s.t.mutation(internal.creatorDiscovery.claim, {
    id: due[0].id,
    expectedVersion: due[0].version,
  });
  const args = {
    id: claim.id,
    generation: claim.generation,
    lease: claim.lease,
    reservationKey: claim.reservationKey,
  };
  await s.t.mutation(internal.creatorDiscovery.commit, {
    ...args,
    posts: values,
    complete,
    cursor: complete ? null : "synthetic-cursor",
    finalBatch: true,
  });
  // Drive only immediate delivery explicitly. Never run all timers through retention/permission expiry.
  const stored = await s.t.run((ctx) => ctx.db.query("creatorPosts").collect());
  for (const item of stored)
    await s.t.mutation(internal.creators.deliverPage, {
      postId: item._id,
      generation: claim.generation,
      revisionKey: item.revisionKey,
      reservationKey: item.deliveryReservationKey!,
      page: 0,
      cursor: null,
    });
  return { claim, args, stored };
}
async function noProcessing(t: Test) {
  const counts = await t.run(async (ctx) => ({
    knowledge: (await ctx.db.query("knowledgeJobs").collect()).length,
    local: (await ctx.db.query("localLibraryRuns").collect()).length,
    matching: (await ctx.db.query("matchingJobs").collect()).length,
    runs: (await ctx.db.query("runs").collect()).length,
    paidReservations: (await ctx.db.query("reservations").collect()).length,
    sourceProcessing: (await ctx.db.query("sources").collect()).filter(
      (source) =>
        source.personalAnalysis !== undefined || source.state === "processing",
    ).length,
  }));
  expect(counts).toEqual({
    knowledge: 0,
    local: 0,
    matching: 0,
    runs: 0,
    paidReservations: 0,
    sourceProcessing: 0,
  });
}
it("saves pending defaults without jobs or reservations and protects private-owner/workspace boundaries", async () => {
  const s = await setup(false);
  const id = await follow(s.a);
  const page = await s.a.client.query(api.creators.list, {
    organizationId: s.a.org,
    cursor: null,
  });
  expect(page.providerAvailable).toBe(false);
  expect(page.items[0]).toMatchObject({
    _id: id,
    state: "pending",
    mode: "future",
    route: "save_only",
    operational: false,
  });
  await expect(
    s.b.client.query(api.creators.list, {
      organizationId: s.a.org,
      cursor: null,
    }),
  ).rejects.toThrow();
  await expect(
    s.b.client.mutation(api.creators.change, {
      id,
      expectedVersion: 1,
      action: "pause",
    }),
  ).rejects.toThrow();
  expect(
    (
      await s.b.client.query(api.creators.list, {
        organizationId: s.b.org,
        cursor: null,
      })
    ).items,
  ).toEqual([]);
  expect(
    await s.t.run((ctx) => ctx.db.query("inferenceReservations").collect()),
  ).toEqual([]);
  await noProcessing(s.t);
});
it("deduplicates stable creator identity and makes one global funded claim for two recipients", async () => {
  const s = await setup();
  const watch = await resolve(s.t);
  await follow(s.a);
  await follow(s.b);
  expect(await follow(s.a)).toBe(
    (
      await s.a.client.query(api.creators.list, {
        organizationId: s.a.org,
        cursor: null,
      })
    ).items[0]._id,
  );
  const version = (await s.t.run((ctx) => ctx.db.get(watch)))!.version;
  const claim = await s.t.mutation(internal.creatorDiscovery.claim, {
    id: watch,
    expectedVersion: version,
  });
  await expect(
    s.t.mutation(internal.creatorDiscovery.claim, {
      id: watch,
      expectedVersion: version,
    }),
  ).rejects.toThrow(/Reconcile/);
  await s.t.mutation(internal.creatorDiscovery.retainUnknown, {
    id: watch,
    generation: claim.generation,
    lease: claim.lease,
    reservationKey: claim.reservationKey,
  });
  const budget = (
    await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect())
  )[0];
  expect(budget).toMatchObject({ reserved: 10, spent: 0 });
  expect(
    (await s.t.run((ctx) => ctx.db.query("inferenceReservations").collect()))[0]
      .state,
  ).toBe("social_discovery_unknown");
  expect(await s.t.query(internal.creatorDiscovery.due, {})).toEqual([]);
  const subscription = (
    await s.a.client.query(api.creators.list, {
      organizationId: s.a.org,
      cursor: null,
    })
  ).items[0];
  await s.a.client.mutation(api.creators.change, {
    id: subscription._id,
    expectedVersion: subscription.version,
    action: "resume",
  });
  await expect(
    s.t.mutation(internal.creatorDiscovery.claim, {
      id: watch,
      expectedVersion: version,
    }),
  ).rejects.toThrow(/Reconcile/);
  expect(
    (await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()))[0]
      .reserved,
  ).toBe(10);
  await noProcessing(s.t);
});
it("delivers only future dated posts and marks uncertain dates for manual review", async () => {
  const s = await setup();
  await resolve(s.t);
  await follow(s.a);
  await discover(s, [
    post("old", { publishedAt: NOW - 1000 }),
    post("fresh"),
    post("undated", { publishedAt: null, dateReliability: "unknown" }),
  ]);
  const rows = await s.a.client.query(api.creators.digest, {
    organizationId: s.a.org,
    cursor: null,
  });
  expect(rows.items).toHaveLength(2);
  expect(
    rows.items.find((item) => item.canonical.includes("fresh"))?.state,
  ).toBe("pending");
  const uncertain = rows.items.find((item) => item.publishedAt === null)!;
  expect(uncertain.state).toBe("needs_review");
  await expect(
    s.a.client.mutation(api.creators.savePost, { id: uncertain.id }),
  ).rejects.toThrow(/Review/);
  await noProcessing(s.t);
});
it("pauses only the last recipient, resumes from now and unfollows without removing another owner's authority", async () => {
  const s = await setup();
  const watch = await resolve(s.t);
  const first = await follow(s.a),
    second = await follow(s.b);
  await s.a.client.mutation(api.creators.change, {
    id: first,
    expectedVersion: 1,
    action: "pause",
  });
  expect((await s.t.run((ctx) => ctx.db.get(watch)))!.state).toBe("active");
  await s.b.client.mutation(api.creators.change, {
    id: second,
    expectedVersion: 1,
    action: "unfollow",
  });
  expect((await s.t.run((ctx) => ctx.db.get(watch)))!.state).toBe("paused");
  vi.setSystemTime(NOW + 5000);
  await s.a.client.mutation(api.creators.change, {
    id: first,
    expectedVersion: 2,
    action: "resume",
  });
  expect(await s.t.run((ctx) => ctx.db.get(first))).toMatchObject({
    state: "active",
    cutoff: NOW + 5000,
  });
  expect((await s.t.run((ctx) => ctx.db.get(watch)))!.state).toBe("active");
});
it("requires an exact latest-ten quote and explicit incomplete acceptance within asset bounds, without inference", async () => {
  const s = await setup();
  await resolve(s.t);
  const id = await follow(s.a, { mode: "latest10", maxAssets: 2 });
  await discover(
    s,
    [
      post("past1", { publishedAt: NOW - 1000 }),
      post("past2", { publishedAt: NOW - 2000 }),
      post("past3", { publishedAt: NOW - 3000 }),
    ],
    false,
  );
  expect(
    (
      await s.a.client.query(api.creators.digest, {
        organizationId: s.a.org,
        cursor: null,
      })
    ).items,
  ).toEqual([]);
  const quote = await s.a.client.query(api.creators.previewBackfill, { id });
  expect(quote.posts).toHaveLength(2);
  expect(quote.assets).toBe(2);
  expect(quote.overLimit).toBe(1);
  await expect(
    s.a.client.mutation(api.creators.approveBackfill, {
      id,
      expectedVersion: 1,
      quoteHash: "wrong",
      acceptIncomplete: true,
    }),
  ).rejects.toThrow(/Review/);
  await expect(
    s.a.client.mutation(api.creators.approveBackfill, {
      id,
      expectedVersion: 1,
      quoteHash: quote.hash,
      acceptIncomplete: false,
    }),
  ).rejects.toThrow(/Review/);
  expect(
    await s.a.client.mutation(api.creators.approveBackfill, {
      id,
      expectedVersion: 1,
      quoteHash: quote.hash,
      acceptIncomplete: true,
    }),
  ).toEqual({ count: 2, processingStarted: false });
  expect(
    (
      await s.a.client.query(api.creators.digest, {
        organizationId: s.a.org,
        cursor: null,
      })
    ).items,
  ).toHaveLength(2);
  await noProcessing(s.t);
});
it("saves source metadata through capture idempotently, keeps it on unfollow and never starts analysis", async () => {
  const s = await setup();
  await resolve(s.t);
  const id = await follow(s.a);
  await discover(s, [post("saved")]);
  const delivery = (
    await s.a.client.query(api.creators.digest, {
      organizationId: s.a.org,
      cursor: null,
    })
  ).items[0];
  await expect(
    s.b.client.mutation(api.creators.savePost, { id: delivery.id }),
  ).rejects.toThrow();
  const result = await s.a.client.mutation(api.creators.savePost, {
    id: delivery.id,
  });
  expect(result.processingStarted).toBe(false);
  expect(
    await s.a.client.mutation(api.creators.savePost, { id: delivery.id }),
  ).toEqual(result);
  const source = await s.t.run((ctx) => ctx.db.get(result.sourceId));
  expect(source).toMatchObject({
    organizationId: s.a.org,
    url: delivery.canonical,
    key: `creator:${delivery.id}`,
    state: "needs_upload",
  });
  await s.a.client.mutation(api.creators.change, {
    id,
    expectedVersion: 1,
    action: "unfollow",
  });
  expect((await s.t.run((ctx) => ctx.db.get(result.sourceId)))!.state).not.toBe(
    "deleted",
  );
  await noProcessing(s.t);
});
it("preserves suppression and deleted-source tombstones during rediscovery", async () => {
  const s = await setup();
  const watch = await resolve(s.t);
  await follow(s.a);
  const found = await discover(s, [post("suppressed"), post("deleted")]);
  const rows = (
    await s.a.client.query(api.creators.digest, {
      organizationId: s.a.org,
      cursor: null,
    })
  ).items;
  const suppressed = rows.find((row) => row.canonical.includes("suppressed"))!,
    removed = rows.find((row) => row.canonical.includes("deleted"))!;
  await s.a.client.mutation(api.creators.suppress, { id: suppressed.id });
  const saved = await s.a.client.mutation(api.creators.savePost, {
    id: removed.id,
  });
  await s.a.client.mutation(api.product.deleteSource, { id: saved.sourceId });
  for (const stored of found.stored)
    await s.t.mutation(internal.creators.deliverPage, {
      postId: stored._id,
      generation: (await s.t.run((ctx) => ctx.db.get(watch)))!.generation,
      revisionKey: stored.revisionKey,
      reservationKey: stored.deliveryReservationKey!,
      page: 0,
      cursor: null,
    });
  expect(
    (
      await s.a.client.query(api.creators.digest, {
        organizationId: s.a.org,
        cursor: null,
      })
    ).items,
  ).toEqual([]);
  await expect(
    s.a.client.mutation(api.creators.savePost, { id: removed.id }),
  ).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.query("sources").collect()),
  ).toHaveLength(1);
});
it("expires provider metadata and saved-source authority without running future scheduled work", async () => {
  const s = await setup();
  await resolve(s.t);
  await follow(s.a);
  const found = await discover(s, [post("expires")]);
  const delivery = (
    await s.a.client.query(api.creators.digest, {
      organizationId: s.a.org,
      cursor: null,
    })
  ).items[0];
  const saved = await s.a.client.mutation(api.creators.savePost, {
    id: delivery.id,
  });
  const generation = (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))!
    .generation;
  vi.setSystemTime(NOW + 86400001);
  expect(
    (
      await s.a.client.query(api.creators.digest, {
        organizationId: s.a.org,
        cursor: null,
      })
    ).items,
  ).toEqual([]);
  await expect(
    s.a.client.mutation(api.creators.savePost, { id: delivery.id }),
  ).rejects.toThrow();
  await s.t.mutation(internal.creators.expirePost, {
    postId: found.stored[0]._id,
  });
  await s.t.mutation(internal.creators.expireDeliveries, {
    postId: found.stored[0]._id,
    cursor: null,
  });
  const cleanup = (await s.t.run((ctx) => ctx.db.get(delivery.id)))!;
  const bound = (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))!;
  await s.t.mutation(internal.creators.purgeSourceAssets, {
    deliveryId: delivery.id,
    maxGeneration: cleanup.sourceGeneration!,
    rightsHash: bound.creatorRights!.rightsHash,
    cursor: null,
  });
  expect(await s.t.run((ctx) => ctx.db.get(found.stored[0]._id))).toMatchObject(
    { state: "removed", metadata: { removed: true } },
  );
  expect(await s.t.run((ctx) => ctx.db.get(delivery.id))).toMatchObject({
    state: "withdrawn",
    reason: "provider_content_removed",
  });
  expect(await s.t.run((ctx) => ctx.db.get(saved.sourceId))).toMatchObject({
    generation: generation + 1,
    rightsAttested: false,
    retrievalState: "unavailable",
    state: "saved",
  });
});
it("quarantines restored watches, subscriptions, posts and deliveries without reviving consent or funding", async () => {
  const s = await setup();
  const watch = await resolve(s.t);
  const sub = await follow(s.a);
  const found = await discover(s, [post("restore")]);
  vi.stubEnv("RESTORE_LOCK", "true");
  for (const section of [
    "creatorWatches",
    "creatorPosts",
    "creatorSubscriptions",
    "creatorDeliveries",
  ] as const)
    await s.t.mutation(internal.recovery.quarantinePage, {
      section,
      cursor: null,
    });
  vi.stubEnv("RESTORE_LOCK", "false");
  expect(await s.t.run((ctx) => ctx.db.get(watch))).toMatchObject({
    state: "quarantined",
    generation: 1,
  });
  expect(await s.t.run((ctx) => ctx.db.get(sub))).toMatchObject({
    state: "quarantined",
    rightsAttested: false,
  });
  expect(await s.t.run((ctx) => ctx.db.get(found.stored[0]._id))).toMatchObject(
    { state: "removed" },
  );
  expect(await s.t.query(internal.creatorDiscovery.due, {})).toEqual([]);
  expect(
    (
      await s.a.client.query(api.creators.digest, {
        organizationId: s.a.org,
        cursor: null,
      })
    ).items,
  ).toEqual([]);
  await noProcessing(s.t);
});
it("counts reviewed backfill metadata against the same daily asset bound as future deliveries", async () => {
  const s = await setup();
  await resolve(s.t);
  const id = await follow(s.a, { mode: "latest10", maxAssets: 2 });
  await discover(
    s,
    [post("pastBound", { publishedAt: NOW - 1000, assetCount: 2 })],
    false,
  );
  const quote = await s.a.client.query(api.creators.previewBackfill, { id });
  await s.a.client.mutation(api.creators.approveBackfill, {
    id,
    expectedVersion: 1,
    quoteHash: quote.hash,
    acceptIncomplete: true,
  });
  vi.setSystemTime(NOW + 3600001);
  await discover(s, [post("futureBound", { assetCount: 1 })]);
  const deliveries = await s.t.run((ctx) =>
    ctx.db.query("creatorDeliveries").collect(),
  );
  const stored = await s.t.run((ctx) => ctx.db.query("creatorPosts").collect());
  const allowedAssets = deliveries
    .filter((row) => row.state === "pending")
    .reduce(
      (sum, row) =>
        sum +
        Number(
          (
            stored.find((item) => item._id === row.postId)!
              .metadata as DiscoveredPost
          ).assetCount,
        ),
      0,
    );
  expect(allowedAssets).toBeLessThanOrEqual(2);
});
it("invalidates a backfill quote when a future delivery consumes the same daily allowance", async () => {
  const s = await setup();
  await resolve(s.t);
  const id = await follow(s.a, { mode: "latest10", maxAssets: 2 });
  await discover(
    s,
    [post("quotedPast", { publishedAt: NOW - 1000, assetCount: 2 })],
    false,
  );
  const oldQuote = await s.a.client.query(api.creators.previewBackfill, { id });
  vi.setSystemTime(NOW + 3600001);
  await discover(s, [post("newFuture", { assetCount: 1 })]);
  await expect(
    s.a.client.mutation(api.creators.approveBackfill, {
      id,
      expectedVersion: 1,
      quoteHash: oldQuote.hash,
      acceptIncomplete: true,
    }),
  ).rejects.toThrow(/Review/);
  const current = await s.a.client.query(api.creators.previewBackfill, { id });
  expect(current.hash).not.toBe(oldQuote.hash);
  expect(current.assets).toBeLessThanOrEqual(1);
  expect(current.posts.some((item) => item.postId === "newFuture")).toBe(false);
});
it("refuses oversized discovery batches and retains the full dispatch hold after uncertainty", async () => {
  const s = await setup();
  const watch = await resolve(s.t);
  await follow(s.a);
  const claim = await s.t.mutation(internal.creatorDiscovery.claim, {
    id: watch,
    expectedVersion: 1,
  });
  const args = {
    id: watch,
    generation: claim.generation,
    lease: claim.lease,
    reservationKey: claim.reservationKey,
  };
  await expect(
    s.t.mutation(internal.creatorDiscovery.commit, {
      ...args,
      posts: Array.from({ length: 11 }, (_, index) => post(`oversize${index}`)),
      complete: true,
      cursor: null,
      finalBatch: true,
    }),
  ).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.query("creatorPosts").collect()),
  ).toEqual([]);
  await s.t.mutation(internal.creatorDiscovery.retainUnknown, args);
  expect(
    (await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()))[0],
  ).toMatchObject({ reserved: 10, spent: 0 });
});
it("keeps one stable-identity watch through a handle change and refuses a handle reassignment", async () => {
  const s = await setup();
  const watch = await resolve(s.t);
  const id = await follow(s.a);
  const renamed = "https://www.instagram.com/synthetic_renamed/";
  expect(await resolve(s.t, renamed)).toBe(watch);
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    watchId: watch,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("creatorWatches").collect()),
  ).toHaveLength(1);
  await expect(
    s.t.mutation(internal.creators.resolve, {
      profileUrl: renamed,
      creatorId: "another-stable-id",
      provider: "synthetic-unit-provider",
      rightsEvidenceId: "synthetic-unit-rights",
    }),
  ).rejects.toThrow(/handle now resolves/);
  expect(
    await s.t.run((ctx) => ctx.db.query("creatorWatches").collect()),
  ).toHaveLength(1);
});

it("enforces the exact maximum check count using durable spent and unknown reservations", async () => {
  const s = await setup();
  const config = JSON.parse(process.env.CREATOR_PROVIDER_CONFIGURATION!);
  config.maximumChecks = 1;
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", JSON.stringify(config));
  await expect(resolve(s.t)).rejects.toThrow("POLICY_BLOCKED");
  config.ceilingUsdMicros = config.perCheckUsdMicros;
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", JSON.stringify(config));
  const watch = await resolve(s.t);
  await follow(s.a);
  await discover(s, []);
  const current = await s.t.run(async (ctx) => {
    await ctx.db.patch(watch, { nextCheckAt: NOW });
    return (await ctx.db.get(watch))!;
  });
  await expect(
    s.t.mutation(internal.creatorDiscovery.claim, {
      id: watch,
      expectedVersion: current.version,
    }),
  ).rejects.toThrow("BUDGET_EXCEEDED");
  expect(
    await s.t.run((ctx) => ctx.db.query("inferenceReservations").collect()),
  ).toHaveLength(1);
});
it("rejects over-cap global fanout and a single claim cannot accumulate more than100 posts", async () => {
  const s = await setup();
  const watch = await resolve(s.t);
  const subId = await follow(s.a);
  const duplicates = await s.t.run(async (ctx) => {
    const sub = (await ctx.db.get(subId))!;
    const { _id, _creationTime: _time, ...fields } = sub;
    const ids = [];
    for (let i = 0; i < 20; i++)
      ids.push(await ctx.db.insert("creatorSubscriptions", fields));
    return ids;
  });
  await expect(follow(s.b)).rejects.toThrow("QUOTA_EXCEEDED");
  await expect(
    s.t.mutation(internal.creatorDiscovery.claim, {
      id: watch,
      expectedVersion: 1,
    }),
  ).rejects.toThrow("QUOTA_EXCEEDED");
  await s.t.run(async (ctx) => {
    for (const id of duplicates) await ctx.db.delete(id);
  });
  const claim = await s.t.mutation(internal.creatorDiscovery.claim, {
    id: watch,
    expectedVersion: 1,
  });
  const args = {
    id: watch,
    generation: claim.generation,
    lease: claim.lease,
    reservationKey: claim.reservationKey,
  };
  for (let batch = 0; batch < 10; batch++)
    await s.t.mutation(internal.creatorDiscovery.commit, {
      ...args,
      posts: Array.from({ length: 10 }, (_, n) =>
        post(`bounded_${batch}_${n}`),
      ),
      complete: false,
      cursor: `cursor-${batch}`,
      finalBatch: false,
    });
  await expect(
    s.t.mutation(internal.creatorDiscovery.commit, {
      ...args,
      posts: [post("one_over")],
      complete: false,
      cursor: "over",
      finalBatch: false,
    }),
  ).rejects.toThrow("QUOTA_EXCEEDED");
  expect(
    await s.t.run((ctx) => ctx.db.query("creatorPosts").collect()),
  ).toHaveLength(100);
  expect(
    (await s.t.run((ctx) => ctx.db.query("operatorBudgets").collect()))[0],
  ).toMatchObject({ reserved: 10, spent: 0 });
});
it("keeps normal analysis generation visible but immediately closes copied source, frame and export on rights revocation", async () => {
  const s = await setup();
  const watch = await resolve(s.t);
  await follow(s.a);
  const found = await discover(s, [post("revoked")]);
  const row = (
    await s.a.client.query(api.creators.digest, {
      organizationId: s.a.org,
      cursor: null,
    })
  ).items[0];
  const saved = await s.a.client.mutation(api.creators.savePost, {
    id: row.id,
  });
  const asset = await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(saved.sourceId))!;
    await ctx.db.patch(source._id, {
      generation: source.generation + 1,
      text: "PROVIDER-SECRET",
      originalText: "PROVIDER-SECRET",
      summary: "PROVIDER-SECRET",
      title: "PROVIDER-SECRET",
    });
    return ctx.db.insert("assets", {
      organizationId: s.a.org,
      sourceId: source._id,
      key: `${s.a.org}/synthetic-provider-frame`,
      sourceGeneration: source.generation + 1,
      size: 50,
      type: "image/jpeg",
      kind: "evidence",
      state: "complete",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
  expect(
    (
      await s.a.client.query(api.creators.digest, {
        organizationId: s.a.org,
        cursor: null,
      })
    ).items,
  ).toHaveLength(1);
  vi.stubEnv("CREATOR_FOLLOWING_ENABLED", "false");
  await expect(
    s.a.client.query(api.product.detail, { id: saved.sourceId }),
  ).rejects.toThrow("SOURCE_UNAVAILABLE");
  await expect(
    s.a.client.query(api.assets.evidence, { id: asset }),
  ).rejects.toThrow();
  const exported = await s.a.client.query(api.jobs.exportPage, {
    organizationId: s.a.org,
    section: "sources",
    cursor: null,
    asOf: NOW,
  });
  expect(JSON.stringify(exported)).not.toContain("PROVIDER-SECRET");
  const invalidated = await s.t.mutation(
    internal.creators.invalidateRightsPage,
    { watchId: watch, cursor: null, revokedAt: NOW },
  );
  expect(invalidated).toMatchObject({
    complete: true,
    removed: 1,
    deletionDeadline: NOW + 1000,
  });
  await s.t.mutation(internal.creators.expireDeliveries, {
    postId: found.stored[0]._id,
    cursor: null,
  });
  const delivery = (await s.t.run((ctx) => ctx.db.get(row.id)))!,
    source = (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))!;
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    await s.t.mutation(internal.creators.purgeSourceAssets, {
      deliveryId: row.id,
      maxGeneration: delivery.sourceGeneration!,
      rightsHash: source.creatorRights!.rightsHash,
      cursor: null,
    }),
  ).toMatchObject({ paused: true });
  expect(
    (await s.t.run((ctx) => ctx.db.get(found.stored[0]._id)))?.cleanupPending,
  ).toBe(true);
  vi.stubEnv("RESTORE_LOCK", "false");
  const freshAsset = await s.t.run(async (ctx) => {
    await ctx.db.patch(saved.sourceId, {
      generation: source.generation + 1,
      creatorRights: undefined,
      rightsAttested: true,
      summary: "FRESH AUTHORED CONTENT",
    });
    await ctx.db.insert("assets", {
      organizationId: s.a.org,
      sourceId: saved.sourceId,
      key: `${s.a.org}/legacy-unknown-frame`,
      size: 50,
      type: "image/jpeg",
      state: "complete",
      createdAt: NOW,
      updatedAt: NOW,
    });
    return ctx.db.insert("assets", {
      organizationId: s.a.org,
      sourceId: saved.sourceId,
      sourceGeneration: source.generation + 1,
      key: `${s.a.org}/fresh-owned-frame`,
      size: 50,
      type: "image/jpeg",
      state: "complete",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
  const cleanupResult = await s.t.mutation(
    internal.creators.purgeSourceAssets,
    {
      deliveryId: row.id,
      maxGeneration: delivery.sourceGeneration!,
      rightsHash: source.creatorRights!.rightsHash,
      cursor: null,
    },
  );
  expect(cleanupResult).toMatchObject({
    reviewRequired: true,
    deletionConfirmed: false,
  });
  expect((await s.t.run((ctx) => ctx.db.get(asset)))?.state).toBe("deleting");
  expect((await s.t.run((ctx) => ctx.db.get(freshAsset)))?.state).toBe(
    "complete",
  );
  expect((await s.t.run((ctx) => ctx.db.get(saved.sourceId)))?.summary).toBe(
    "FRESH AUTHORED CONTENT",
  );
  expect(
    (await s.t.run((ctx) => ctx.db.get(found.stored[0]._id)))?.cleanupPending,
  ).toBe(false);
  expect(
    (await s.t.run((ctx) => ctx.db.get(found.stored[0]._id)))?.cleanupUncertain,
  ).toBe(true);
  expect(
    await s.t.run((ctx) => ctx.db.query("objectDeletions").collect()),
  ).toHaveLength(1);
});
