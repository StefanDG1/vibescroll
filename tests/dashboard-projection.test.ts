import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { dashboardHome, dashboardProgress } from "../convex/dashboard";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";
import {
  projectPostSource,
  postSummaryFromCard,
} from "../convex/lib/postSummary";
import {
  postSummaryV1,
  postProgressPageV1,
} from "../packages/contracts/post-summary";
import type { Doc } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function setup(count = 1) {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject: "dashboard-owner",
    email: "owner@example.test",
    name: "Synthetic owner",
  });
  const foreignId = await t.mutation(internal.accounts.syncUser, {
    subject: "foreign",
    email: "foreign@example.test",
    name: "Synthetic foreign",
  });
  const owner = t.withIdentity({ subject: "dashboard-owner" });
  const foreign = t.withIdentity({ subject: "foreign" });
  const organizationId = await owner.mutation(
    api.organizations.createPrivate,
    {},
  );
  const rows = await t.run(async (ctx) => {
    const base = {
      organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const sources = [];
    for (let i = 0; i < count; i++)
      sources.push(
        await ctx.db.insert("sources", {
          ...base,
          key: `synthetic-${i}`,
          canonical: `synthetic-${i}`,
          title: `Synthetic source ${i}`,
          kind: "text",
          text: "PRIVATE_TRANSCRIPT".repeat(1000),
          state: "ready",
          coverage: "caption_only",
          tags: [],
          generation: 1,
          rightsAttested: true,
          analysis: {
            insights: [
              {
                id: "point",
                title: "Synthetic idea",
                body: "PRIVATE_INSIGHT_BODY",
              },
            ],
          },
        }),
      );
    const repo = await ctx.db.insert("repositories", {
      ...base,
      installationId: 1,
      providerId: 1,
      fullName: "synthetic/project",
      sha: "a".repeat(40),
      branch: "main",
      enabled: true,
      confirmed: true,
      profile: "PRIVATE_PROFILE",
      profileVersion: 1,
      context: "PRIVATE_CODE",
      manifest: [],
      status: "ready",
    });
    const proposal = await ctx.db.insert("proposals", {
      ...base,
      sourceId: sources[0],
      repositoryId: repo,
      baseSha: "a".repeat(40),
      profileVersion: 1,
      title: "Synthetic proposal",
      disposition: "useful",
      review: "unreviewed",
      version: 1,
      detail: { private: "PRIVATE_DETAIL" },
      references: [
        {
          sourceId: sources[0],
          generation: 1,
          revision: base.updatedAt,
          insightId: "point",
        },
      ],
    });
    await ctx.db.insert("proposals", {
      ...base,
      sourceId: sources[0],
      repositoryId: repo,
      baseSha: "a".repeat(40),
      profileVersion: 1,
      title: "Synthetic legacy idea",
      disposition: "useful",
      review: "unreviewed",
      version: 1,
      detail: {},
    });
    return { sources, repo, proposal };
  });
  async function migrate() {
    await t.mutation(internal.dashboard.backfill, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(internal.dashboard.setEnabled, { enabled: true });
  }
  return {
    t,
    owner,
    foreign,
    actor,
    foreignId,
    organizationId,
    ...rows,
    migrate,
  };
}

type Fixture = Awaited<ReturnType<typeof setup>>;
async function patchProjectedSource(
  s: Fixture,
  patch: Partial<Doc<"sources">>,
) {
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.sources[0], patch);
    await syncDashboardCard(
      ctx,
      "sources",
      s.sources[0],
      await ctx.db.get(s.sources[0]),
    );
  });
}
async function projectedCard(s: Fixture) {
  return (await s.t.run((ctx) =>
    ctx.db
      .query("dashboardCards")
      .withIndex("by_entity", (q) => q.eq("entityId", s.sources[0]))
      .unique(),
  ))!;
}
async function fixtureJob(s: Fixture) {
  const grantId = await s.t.run((ctx) =>
    ctx.db.insert("assistantGrants", {
      organizationId: s.organizationId,
      actor: s.actor,
      clientId: "synthetic-projection-client",
      sources: [],
      scopes: [],
      version: 1,
      state: "active",
      expiresAt: null,
      updatedAt: Date.now(),
    }),
  );
  // Projection metadata only. This synthetic grant cannot authorize execution.
  return {
    executor: "work_cloud" as const,
    actor: s.actor,
    generation: 1,
    model: "synthetic-model",
    effort: "high",
    state: "running",
    approvedAt: Date.now(),
    expiresAt: Date.now() + 10000,
    deadline: Date.now() + 10000,
    leaseUntil: Date.now() + 1000,
    stage: "acquiring",
    cloud: {
      schemaVersion: "work-cloud-text-v1" as const,
      grantId,
      grantVersion: 1,
      clientId: "synthetic-projection-client",
      selectedGeneration: 0,
      selectedRevision: Date.now(),
      inputHash: "a".repeat(64),
      policyHash: "b".repeat(64),
      funding: "own_subscription" as const,
      maxApiUsd: 0 as const,
    },
  };
}

it("projects only bounded generic previews and existing thumbnail pointers with strict contracts", async () => {
  const s = await setup();
  const assetId = await s.t.run((ctx) =>
    ctx.db.insert("assets", {
      organizationId: s.organizationId,
      sourceId: s.sources[0],
      sourceGeneration: 1,
      key: "PRIVATE_ASSET_KEY",
      size: 100,
      type: "image/jpeg",
      kind: "thumbnail",
      state: "complete",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await patchProjectedSource(s, {
    summary: "A generic result",
    originalSavedAt: Date.now() - 1000,
    publishedAt: Date.now() - 2000,
    linkPreview: { state: "ready", assetId, updatedAt: Date.now() },
    sourceRetentionUntil: Date.now() + 20000,
    analysis: {
      privateContext: "PRIVATE_CONTEXT",
      credential: "PRIVATE_CREDENTIAL",
      insights: Array.from({ length: 7 }, (_, i) => ({
        id: `idea-${i}`,
        title: "t".repeat(200),
        claim: "c".repeat(400),
        rawMedia: "PRIVATE_MEDIA",
      })),
    },
  });
  const card = await projectedCard(s);
  const summary = await postSummaryFromCard(card);
  expect(summary).not.toBeNull();
  expect(summary!.insightPreview).toHaveLength(3);
  expect(summary!.insightPreview[0].title).toHaveLength(140);
  expect(summary!.insightPreview[0].claimExcerpt).toHaveLength(240);
  expect(summary).toMatchObject({
    projection: "complete",
    insightCount: 7,
    insightPreviewTruncated: true,
    thumbnail: {
      kind: "source-thumbnail-asset-v1",
      assetId,
      sourceId: s.sources[0],
      generation: 1,
    },
  });
  expect(JSON.stringify(summary)).not.toContain("PRIVATE_");
  expect(
    postSummaryV1.safeParse({ ...summary, originalText: "forbidden" }).success,
  ).toBe(false);
  expect(
    postSummaryV1.safeParse({
      ...summary,
      insightPreview: Array(4).fill(summary!.insightPreview[0]),
    }).success,
  ).toBe(false);
  expect(
    postSummaryV1.safeParse({
      ...summary,
      thumbnail: {
        ...summary!.thumbnail,
        url: "https://example.test/forbidden",
      },
    }).success,
  ).toBe(false);
  const foreignProgress = {
    ...summary,
    progress: { ...summary!.progress, sourceId: s.sources[1] ?? "unrelated" },
  };
  expect(
    await postSummaryFromCard({ ...card, postSummary: foreignProgress }),
  ).toBeNull();
});

it("keeps full-content revisions stable through stage/phase/lease changes while progress changes without feed movement", async () => {
  const s = await setup();
  const source = (await s.t.run((ctx) => ctx.db.get(s.sources[0])))!;
  const job = await fixtureJob(s);
  const first = await projectPostSource({
    ...source,
    state: "processing",
    personalAnalysis: job,
  });
  const phase = await projectPostSource({
    ...source,
    state: "processing",
    personalAnalysis: { ...job, stage: "analyzing" },
  });
  const lease = await projectPostSource({
    ...source,
    state: "processing",
    updatedAt: source.updatedAt + 500,
    personalAnalysis: { ...job, leaseUntil: job.leaseUntil + 500 },
  });
  expect(phase.contentRevision).toBe(first.contentRevision);
  expect(phase.progress.progressRevision).not.toBe(
    first.progress.progressRevision,
  );
  expect(lease.contentRevision).toBe(first.contentRevision);
  expect(lease.progress.activeUntil).toBe(job.leaseUntil + 500);
  expect(lease.progress.progressRevision).not.toBe(
    first.progress.progressRevision,
  );
  const paired = {
    ...job,
    executor: "paired_computer",
    deviceId: "fixture-device",
    profileBinding: "fixture",
    cloud: undefined,
    ordered: {
      schemaVersion: "ordered-personal-v1",
      phase: "preflight",
      inputBinding: "fixture",
    },
  };
  const before = await projectPostSource({
    ...source,
    personalAnalysis: paired,
  } as unknown as Doc<"sources">);
  const after = await projectPostSource({
    ...source,
    personalAnalysis: {
      ...paired,
      ordered: { ...paired.ordered, phase: "analysis" },
    },
  } as unknown as Doc<"sources">);
  expect(after.contentRevision).toBe(before.contentRevision);
  expect(before.progress.activeUntil).toBe(job.leaseUntil);
  expect(after.progress.progressRevision).not.toBe(
    before.progress.progressRevision,
  );
  await patchProjectedSource(s, { state: "processing", personalAnalysis: job });
  const cardBefore = await projectedCard(s);
  await patchProjectedSource(s, {
    personalAnalysis: {
      ...job,
      stage: "analyzing",
      leaseUntil: job.leaseUntil + 1,
    },
  });
  expect((await projectedCard(s)).updatedAt).toBe(cardBefore.updatedAt);
  const unknown = await projectPostSource({
    ...source,
    state: "failed",
    personalAnalysis: {
      ...job,
      state: "unknown",
      stage: "PRIVATE_UNRECOGNIZED_STAGE",
    },
  });
  expect(unknown.progress).toMatchObject({
    active: false,
    executionState: "unknown",
    stage: null,
    measuredProgress: null,
  });
  expect(JSON.stringify(unknown)).not.toContain("PRIVATE_");
  const unrecognized = await projectPostSource({
    ...source,
    state: "processing",
    personalAnalysis: { ...job, state: "PRIVATE_UNRECOGNIZED_STATE" },
  });
  expect(unrecognized.progress).toMatchObject({
    active: false,
    executionState: null,
  });
});

it.each(["analysis", "text", "evidence", "coverage", "retention"] as const)(
  "changes full-content revision for actual %s changes beyond the clipped preview",
  async (change) => {
    const s = await setup();
    const source = (await s.t.run((ctx) => ctx.db.get(s.sources[0])))!;
    const base = {
      ...source,
      analysis: {
        insights: Array.from({ length: 5 }, (_, i) => ({
          id: `i${i}`,
          title: "Idea",
          claim: "Original",
        })),
      },
    };
    const original = await projectPostSource(base);
    const next = structuredClone(base);
    if (change === "analysis")
      next.analysis.insights[4].claim = "Changed outside preview";
    if (change === "text") next.text = "Changed original content";
    if (change === "evidence")
      next.originalMediaEvidence = [{ kind: "frame", id: "changed-evidence" }];
    if (change === "coverage") next.coverage = "audio_only";
    if (change === "retention") next.sourceRetentionUntil = Date.now() + 1000;
    expect((await projectPostSource(next)).contentRevision).not.toBe(
      original.contentRevision,
    );
  },
);

it("keeps legacy projections explicit and fail-closed without inventing content freshness or expiry", async () => {
  const s = await setup();
  await s.migrate();
  const card = await projectedCard(s);
  const legacy = { ...card, postSummary: undefined };
  expect(await postSummaryFromCard(legacy)).toMatchObject({
    projection: "legacy",
    contentRevision: null,
    savedAt: null,
    publishedAt: null,
    thumbnail: null,
    insightPreview: [],
    insightPreviewTruncated: true,
  });
  expect(
    await postSummaryFromCard({ ...legacy, sourceAuthorityVersion: 1 }),
  ).toBeNull();
  expect(
    await postSummaryFromCard({ ...legacy, sourceRetentionUntil: Date.now() }),
  ).toBeNull();
  expect(
    await postSummaryFromCard({
      ...card,
      postSummary: { ...card.postSummary, credentials: "PRIVATE_TOKEN" },
    }),
  ).toBeNull();
});

it("reads visible projected progress and Home without loading source documents, and stops watching at expiry", async () => {
  const s = await setup(2);
  await s.migrate();
  const job = await fixtureJob(s);
  await patchProjectedSource(s, { state: "processing", personalAnalysis: job });
  const original = await s.owner.query(api.dashboard.progress, {
    organizationId: s.organizationId,
    sourceIds: s.sources,
  });
  expect(original.items[0].active).toBe(true);
  await s.t.run(async (ctx) => {
    const db = new Proxy(ctx.db, {
      get(target, property) {
        if (property === "get")
          return async (id: string) => {
            if (ctx.db.normalizeId("sources", id))
              throw Error("RAW_SOURCE_READ_FORBIDDEN");
            return ctx.db.get(id as never);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const query = {
      ...ctx,
      db,
      auth: {
        getUserIdentity: async () => ({
          subject: "dashboard-owner",
          issuer: "fixture",
          tokenIdentifier: "fixture",
        }),
      },
    } as QueryCtx;
    const result = await dashboardProgress(query, {
      organizationId: s.organizationId,
      sourceIds: s.sources,
    });
    expect(result).toEqual(original);
    const home = await dashboardHome(query, {
      organizationId: s.organizationId,
    });
    expect(home.ready && home.postSummaries).toHaveLength(2);
    expect(home.ready && home.homeSnapshot.counts.coverage).toBe(
      "loaded-window",
    );
  });
  vi.setSystemTime(job.deadline);
  const stopped = await s.owner.query(api.dashboard.progress, {
    organizationId: s.organizationId,
    sourceIds: s.sources,
  });
  expect(stopped.items[0]).toMatchObject({
    active: false,
    contentRevision: original.items[0].contentRevision,
  });
  expect(stopped.items[0].progressRevision).not.toBe(
    original.items[0].progressRevision,
  );
  await patchProjectedSource(s, { sourceRetentionUntil: Date.now() + 1000 });
  vi.advanceTimersByTime(1000);
  const expired = await s.owner.query(api.dashboard.progress, {
    organizationId: s.organizationId,
    sourceIds: s.sources,
  });
  expect(expired.unavailableSourceIds).toEqual([s.sources[0]]);
  expect(expired.items).toHaveLength(1);
  expect(postProgressPageV1.parse(expired)).toEqual(expired);
});

it.each(["running", "recovering"] as const)(
  "stops %s Cloud progress at lease expiry before its overall expiry and resumes after renewal",
  async (state) => {
    const s = await setup();
    await s.migrate();
    const job = {
      ...(await fixtureJob(s)),
      state,
      // Recovery deliberately retains an expired provider execution deadline.
      deadline: state === "recovering" ? Date.now() - 1 : Date.now() + 10000,
    };
    await patchProjectedSource(s, {
      state: state === "recovering" ? "failed" : "processing",
      personalAnalysis: job,
    });
    const query = () =>
      s.owner.query(api.dashboard.progress, {
        organizationId: s.organizationId,
        sourceIds: s.sources,
      });
    const first = (await query()).items[0];
    const updatedAt = (await projectedCard(s)).updatedAt;
    expect(first).toMatchObject({ active: true, activeUntil: job.leaseUntil });

    vi.setSystemTime(job.leaseUntil + 1);
    const expired = (await query()).items[0];
    expect(expired.active).toBe(false);
    expect(expired.contentRevision).toBe(first.contentRevision);
    expect(expired.progressRevision).not.toBe(first.progressRevision);
    expect(Date.now()).toBeLessThan(job.expiresAt);
    if (state === "running") expect(Date.now()).toBeLessThan(job.deadline);

    const leaseUntil = Date.now() + 2000;
    await patchProjectedSource(s, {
      personalAnalysis: { ...job, leaseUntil },
    });
    const renewed = (await query()).items[0];
    expect(renewed).toMatchObject({ active: true, activeUntil: leaseUntil });
    expect(renewed.contentRevision).toBe(first.contentRevision);
    expect(renewed.progressRevision).not.toBe(first.progressRevision);
    expect((await projectedCard(s)).updatedAt).toBe(updatedAt);
    vi.setSystemTime(leaseUntil);
    expect((await query()).items[0].active).toBe(false);

    await patchProjectedSource(s, {
      personalAnalysis: { ...job, leaseUntil: 0 },
    });
    expect((await query()).items[0]).toMatchObject({
      active: false,
      activeUntil: 0,
    });
  },
);

it.each(["queued", "preparing"] as const)(
  "preserves unclaimed %s progress without requiring an execution lease",
  async (state) => {
    const s = await setup();
    const job = {
      ...(await fixtureJob(s)),
      state,
      leaseUntil: 0,
      deadline: 0,
    };
    await patchProjectedSource(s, {
      state: state === "queued" ? "queued" : "processing",
      personalAnalysis: job,
    });
    const summary = await postSummaryFromCard(await projectedCard(s));
    expect(summary?.progress).toMatchObject({
      active: true,
      activeUntil: job.expiresAt,
    });
  },
);

it("bounds and authorizes every progress request without revealing foreign post existence", async () => {
  const s = await setup();
  await s.migrate();
  await expect(
    s.foreign.query(api.dashboard.progress, {
      organizationId: s.organizationId,
      sourceIds: s.sources,
    }),
  ).rejects.toThrow("unavailable");
  await expect(
    s.owner.query(api.dashboard.progress, {
      organizationId: s.organizationId,
      sourceIds: Array(31).fill(s.sources[0]),
    }),
  ).rejects.toThrow("thirty");
  await expect(
    s.owner.query(api.dashboard.progress, {
      organizationId: s.organizationId,
      sourceIds: [s.sources[0], s.sources[0]],
    }),
  ).rejects.toThrow("distinct");
  const other = await s.foreign.mutation(api.organizations.create, {
    name: "Other",
  });
  const result = await s.foreign.query(api.dashboard.progress, {
    organizationId: other,
    sourceIds: s.sources,
  });
  expect(result.items).toEqual([]);
  expect(result.unavailableSourceIds).toEqual(s.sources);
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    s.owner.query(api.dashboard.progress, {
      organizationId: s.organizationId,
      sourceIds: s.sources,
    }),
  ).rejects.toThrow("Recovery");
});

it("refreshes only source projections through a separate versioned checkpoint without rewinding ready Home", async () => {
  const s = await setup(25);
  await s.migrate();
  const before = await s.t.run((ctx) =>
    ctx.db
      .query("dashboardMigrations")
      .withIndex("by_name", (q) => q.eq("name", "dashboard-v1"))
      .unique(),
  );
  await s.t.run(async (ctx) => {
    for (const card of await ctx.db.query("dashboardCards").collect())
      if (card.kind === "source")
        await ctx.db.patch(card._id, { postSummary: undefined });
  });
  const legacyHome = await s.owner.query(api.dashboard.home, {
    organizationId: s.organizationId,
  });
  expect(legacyHome.ready && legacyHome.homeSnapshot.projectionComplete).toBe(
    false,
  );
  const first = await s.t.mutation(internal.dashboard.backfill, {
    refreshPosts: true,
  });
  expect(first).toMatchObject({
    complete: false,
    processed: 10,
    table: "sources",
  });
  expect(
    (
      await s.owner.query(api.dashboard.home, {
        organizationId: s.organizationId,
      })
    ).ready,
  ).toBe(true);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const checkpoint = await s.t.run((ctx) =>
    ctx.db
      .query("dashboardMigrations")
      .withIndex("by_name", (q) => q.eq("name", "dashboard-v1"))
      .unique(),
  );
  expect(checkpoint).toEqual(before);
  expect(
    await s.t.mutation(internal.dashboard.backfill, { refreshPosts: true }),
  ).toEqual({ complete: true });
  const home = await s.owner.query(api.dashboard.home, {
    organizationId: s.organizationId,
  });
  expect(home.ready && home.homeSnapshot.projectionComplete).toBe(true);
});
it("backfills ten original records per transaction, resumes and returns bounded metadata without private payloads", async () => {
  const s = await setup(35);
  expect(
    await s.owner.query(api.dashboard.home, {
      organizationId: s.organizationId,
    }),
  ).toEqual({ ready: false });
  const first = await s.t.mutation(internal.dashboard.backfill, {});
  expect(first.processed).toBe(10);
  expect(
    await s.t.run((ctx) => ctx.db.query("dashboardCards").collect()),
  ).toHaveLength(10);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await s.owner.query(api.dashboard.home, {
      organizationId: s.organizationId,
    }),
  ).toEqual({ ready: false });
  const preview = await s.owner.query(api.dashboard.home, {
    organizationId: s.organizationId,
    preview: true,
  });
  expect(preview.ready).toBe(true);
  await s.t.mutation(internal.dashboard.setEnabled, { enabled: true });
  const home = await s.owner.query(api.dashboard.home, {
    organizationId: s.organizationId,
  });
  expect(home.ready).toBe(true);
  if (!home.ready) throw new Error("Backfill incomplete");
  expect(home.sources).toHaveLength(30);
  expect(home.libraryNext).toBe("more");
  expect(home.proposals).toHaveLength(1);
  expect(JSON.stringify(home)).not.toContain("PRIVATE_");
  expect(
    JSON.stringify(
      await s.t.run((ctx) => ctx.db.query("dashboardCards").collect()),
    ),
  ).not.toContain("PRIVATE_");
  expect((await s.t.run((ctx) => ctx.db.get(s.sources[0])))?.text).toContain(
    "PRIVATE_TRANSCRIPT",
  );
  expect(await s.t.mutation(internal.dashboard.backfill, {})).toEqual({
    complete: true,
  });
  await s.t.mutation(internal.dashboard.setEnabled, { enabled: false });
  expect(
    await s.owner.query(api.dashboard.home, {
      organizationId: s.organizationId,
    }),
  ).toEqual({ ready: false });
  expect(
    (
      await s.owner.query(api.dashboard.home, {
        organizationId: s.organizationId,
        preview: true,
      })
    ).ready,
  ).toBe(true);
});
it("atomically fences a proposal when an existing source mutation changes its revision and deletes its card on redaction", async () => {
  const s = await setup();
  await s.migrate();
  await s.owner.mutation(api.product.editSource, {
    id: s.sources[0],
    summary: "A manual correction",
    tags: [],
  });
  const home = await s.owner.query(api.dashboard.home, {
    organizationId: s.organizationId,
  });
  expect(home.ready && home.proposals).toEqual([]);
  const source = await s.t.run((ctx) => ctx.db.get(s.sources[0]));
  const card = await s.t.run((ctx) =>
    ctx.db
      .query("dashboardCards")
      .withIndex("by_entity", (q) => q.eq("entityId", s.sources[0]))
      .unique(),
  );
  expect(card?.updatedAt).toBe(source?.updatedAt);
  expect(source?.updatedAt).toBeGreaterThan(Date.now());
  await expect(
    s.owner.query(api.product.proposal, { id: s.proposal }),
  ).rejects.toThrow("evidence unavailable");
  await s.owner.mutation(api.product.deleteSource, { id: s.sources[0] });
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("dashboardCards")
        .withIndex("by_entity", (q) => q.eq("entityId", s.sources[0]))
        .unique(),
    ),
  ).toBeNull();
  const after = await s.owner.query(api.dashboard.home, {
    organizationId: s.organizationId,
  });
  expect(after.ready && after.sources).toEqual([]);
});
it("rejects foreign/private-owner mismatches, membership revocation and restore locks on every compact read", async () => {
  const s = await setup();
  await s.migrate();
  await s.t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId: s.organizationId,
      userId: s.foreignId,
      role: "owner",
    }),
  );
  await expect(
    s.foreign.query(api.dashboard.home, { organizationId: s.organizationId }),
  ).rejects.toThrow("unavailable");
  await s.t.run(async (ctx) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", s.organizationId).eq("userId", s.actor),
      )
      .unique();
    await ctx.db.delete(membership!._id);
  });
  await expect(
    s.owner.query(api.dashboard.home, { organizationId: s.organizationId }),
  ).rejects.toThrow("unavailable");
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    s.owner.query(api.dashboard.home, { organizationId: s.organizationId }),
  ).rejects.toThrow("Recovery");
  await expect(s.t.mutation(internal.dashboard.backfill, {})).rejects.toThrow(
    "Recovery",
  );
});

it("loads complete Library project choices and bounded current attention without private editor content", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const original = (await ctx.db.get(s.repo))!;
    const { _id, _creationTime, ...base } = original;
    for (let i = 0; i < 35; i++)
      await ctx.db.insert("repositories", {
        ...base,
        providerId: i + 2,
        fullName: `synthetic/project-${i}`,
      });
    for (let i = 0; i < 35; i++)
      await ctx.db.insert("notifications", {
        organizationId: s.organizationId,
        createdAt: Date.now() + i,
        updatedAt: Date.now() + i,
        key: `notice-${i}`,
        message: "PRIVATE_NOTIFICATION",
        read: false,
      });
  });
  const context = await s.owner.query(api.product.libraryContext, {
    organizationId: s.organizationId,
  });
  expect(context.repositories).toHaveLength(36);
  expect(context.notifications).toHaveLength(30);
  expect(context.proposals).toContainEqual({
    _id: s.proposal,
    review: "unreviewed",
  });
  expect(Object.keys(context.repositories[0]).sort()).toEqual([
    "_id",
    "confirmed",
    "enabled",
    "fullName",
  ]);
  expect(JSON.stringify(context)).not.toContain("PRIVATE_");
  await s.owner.mutation(api.product.editSource, {
    id: s.sources[0],
    summary: "Manual correction",
    tags: [],
  });
  const after = await s.owner.query(api.product.libraryContext, {
    organizationId: s.organizationId,
  });
  expect(after.proposals.some((p) => p._id === s.proposal)).toBe(false);
});
it("denies foreign, private-owner mismatch, lost membership and locked recovery Library contexts", async () => {
  const s = await setup();
  const query = () =>
    s.owner.query(api.product.libraryContext, {
      organizationId: s.organizationId,
    });
  await expect(
    s.foreign.query(api.product.libraryContext, {
      organizationId: s.organizationId,
    }),
  ).rejects.toThrow();
  await s.t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId: s.organizationId,
      userId: s.foreignId,
      role: "owner",
    }),
  );
  await expect(
    s.foreign.query(api.product.libraryContext, {
      organizationId: s.organizationId,
    }),
  ).rejects.toThrow();
  await s.t.run(async (ctx) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", s.organizationId).eq("userId", s.actor),
      )
      .unique();
    await ctx.db.delete(membership!._id);
  });
  await expect(query()).rejects.toThrow();
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(query()).rejects.toThrow("Recovery");
});
