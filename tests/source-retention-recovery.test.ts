import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject: "retention-recovery",
    email: "recovery@example.test",
    name: "Fixture owner",
  });
  const owner = t.withIdentity({ subject: "retention-recovery" });
  const org = await owner.mutation(api.organizations.create, {
    name: "Fixture recovery",
  });
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const sourceId = await ctx.db.insert("sources", {
      organizationId: org,
      createdAt: now,
      updatedAt: now,
      key: "retention-fixture",
      canonical: "https://reddit.com/r/example/comments/abc123",
      sourceType: "reddit_thread",
      kind: "url",
      title: "Old provider title",
      text: "OLD RAW BYTES",
      summary: "OLD SUMMARY",
      analysis: { insights: [] },
      tags: [],
      state: "ready",
      generation: 1,
      coverage: "metadata_only",
      rightsAttested: true,
      sourceRetentionUntil: now + 1000,
    });
    const revisionId = await ctx.db.insert("sourceRevisions", {
      organizationId: org,
      sourceId,
      generation: 1,
      contentHash: "fixture",
      revision: {
        retention: { retainUntil: now + 1000, deletionWithinMs: 3600000 },
      },
      evidence: [{ excerpt: "OLD RAW BYTES" }],
      text: "OLD RAW BYTES",
      state: "current",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(sourceId, { currentRevisionId: revisionId });
    return { sourceId, revisionId };
  });
  return { t, owner, org, now, ...ids };
}
it("keeps one durable expiry retry while locked and physically scrubs after unlocking", async () => {
  const s = await setup();
  vi.setSystemTime(s.now + 1001);
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.sourceAcquisition.expire, {
    revisionId: s.revisionId,
  });
  await s.t.mutation(internal.sourceAcquisition.expire, {
    revisionId: s.revisionId,
  });
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  const retries = jobs.filter((j) =>
    j.name.endsWith("sourceAcquisition:expire"),
  );
  expect(retries).toHaveLength(1);
  expect((await s.t.run((ctx) => ctx.db.get(s.revisionId)))?.text).toBe(
    "OLD RAW BYTES",
  );
  vi.stubEnv("RESTORE_LOCK", "false");
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 12);
  const result = await s.t.run(async (ctx) => ({
    source: await ctx.db.get(s.sourceId),
    revision: await ctx.db.get(s.revisionId),
  }));
  expect(result.revision).toMatchObject({
    state: "removed",
    text: "",
    evidence: [],
  });
  expect(result.source?.text).toBeUndefined();
  expect(result.source?.summary).toBeUndefined();
  expect(result.source?.generation).toBe(2);
});

it("retries a locked derived continuation without erasing fresh references or financial holds", async () => {
  const s = await setup();
  const references = (generation: number) => [
    { sourceId: s.sourceId, generation, revision: s.now, insightId: "point" },
  ];
  const rows = await s.t.run(async (ctx) => {
    const topic = await ctx.db.insert("knowledgeTopics", {
      organizationId: s.org,
      createdAt: s.now,
      updatedAt: s.now,
      name: "Manual topic",
      key: "manual",
      state: "ready",
      version: 1,
      pinned: true,
      insightCount: 0,
      sourceCount: 0,
    });
    const old = await ctx.db.insert("knowledgeJobs", {
      organizationId: s.org,
      topicId: topic,
      actor: (await ctx.db.query("users").first())!._id,
      version: 1,
      policyVersion: 1,
      cursor: null,
      next: null,
      done: true,
      processingVersion: "fixture",
      references: references(1),
      key: "old-work",
      state: "ready",
      output: { summary: "OLD GENERATED" },
      createdAt: s.now,
      updatedAt: s.now,
    });
    const fresh = await ctx.db.insert("knowledgeJobs", {
      organizationId: s.org,
      topicId: topic,
      actor: (await ctx.db.query("users").first())!._id,
      version: 1,
      policyVersion: 1,
      cursor: null,
      next: null,
      done: true,
      processingVersion: "fixture",
      references: references(3),
      key: "fresh-work",
      state: "ready",
      output: { summary: "FRESH GENERATED" },
      createdAt: s.now,
      updatedAt: s.now,
    });
    const manual = await ctx.db.insert("knowledgeMembers", {
      organizationId: s.org,
      topicId: topic,
      sourceId: s.sourceId,
      generation: 1,
      revision: s.now,
      insightId: "point",
      sourceTitle: "OLD PROVIDER TITLE",
      excluded: false,
      manual: true,
      createdAt: s.now,
      updatedAt: s.now,
    });
    const hold = await ctx.db.insert("reservations", {
      organizationId: s.org,
      key: "unknown-provider-work",
      max: 10,
      settled: 0,
      state: "reserved",
      expiresAt: s.now + 86400000,
      dispatchedAt: s.now,
      createdAt: s.now,
      updatedAt: s.now,
    });
    return { old, fresh, topic, manual, hold };
  });
  vi.setSystemTime(s.now + 1001);
  await s.t.mutation(internal.sourceAcquisition.expire, {
    revisionId: s.revisionId,
  });
  vi.stubEnv("RESTORE_LOCK", "true");
  const args = {
    organizationId: s.org,
    sourceId: s.sourceId,
    maxGeneration: 1,
    section: "knowledgeJobs" as const,
    cursor: null,
  };
  const before = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  await s.t.mutation(internal.knowledge.redactDerived, args);
  const after = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  const retry = after.find((job) => !before.some((old) => old._id === job._id));
  expect(retry?.args[0]).toEqual({ ...args, deferredAttempt: 1 });
  vi.stubEnv("RESTORE_LOCK", "false");
  await s.t.mutation(internal.knowledge.redactDerived, args);
  await s.t.run(async (ctx) => {
    expect((await ctx.db.get(rows.old))?.output).toBeUndefined();
    expect((await ctx.db.get(rows.fresh))?.output).toEqual({
      summary: "FRESH GENERATED",
    });
    expect((await ctx.db.get(rows.topic))?.name).toBe("Manual topic");
    expect(await ctx.db.get(rows.manual)).toMatchObject({
      manual: true,
      retainedHistory: true,
      generation: 1,
    });
    expect((await ctx.db.get(rows.manual))?.sourceTitle).toBeUndefined();
    expect(await ctx.db.get(rows.hold)).toMatchObject({
      state: "reserved",
      max: 10,
      settled: 0,
      dispatchedAt: s.now,
    });
  });
});

it("leaves a fresh recovered source intact when a locked old callback resumes", async () => {
  const s = await setup();
  vi.setSystemTime(s.now + 1001);
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.sourceAcquisition.expire, {
    revisionId: s.revisionId,
  });
  const freshId = await s.t.run(async (ctx) => {
    await ctx.db.patch(s.revisionId, { state: "superseded" });
    const id = await ctx.db.insert("sourceRevisions", {
      organizationId: s.org,
      sourceId: s.sourceId,
      generation: 3,
      contentHash: "fresh",
      revision: { sourceType: "supplied_text" },
      evidence: [{ excerpt: "FRESH RECOVERY" }],
      text: "FRESH RECOVERY",
      state: "current",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(s.sourceId, {
      currentRevisionId: id,
      generation: 3,
      sourceRetentionUntil: undefined,
      text: "FRESH RECOVERY",
      summary: "Fresh summary",
      analysis: { insights: [] },
      updatedAt: Date.now(),
    });
    return id;
  });
  vi.stubEnv("RESTORE_LOCK", "false");
  await s.t.mutation(internal.sourceAcquisition.expire, {
    revisionId: s.revisionId,
  });
  await s.t.run(async (ctx) => {
    expect(await ctx.db.get(s.revisionId)).toMatchObject({
      state: "removed",
      text: "",
      evidence: [],
    });
    expect(await ctx.db.get(freshId)).toMatchObject({
      state: "current",
      text: "FRESH RECOVERY",
    });
    expect(await ctx.db.get(s.sourceId)).toMatchObject({
      generation: 3,
      currentRevisionId: freshId,
      text: "FRESH RECOVERY",
      summary: "Fresh summary",
      rightsAttested: true,
    });
  });
});

it("normalizes fieldless candidate revisions by source ID with atomic scheduling deduplication", async () => {
  const s = await setup();
  vi.setSystemTime(s.now + 1001);
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    await s.t.mutation(internal.sourceAcquisition.normalizeRetention, {
      sourceId: s.sourceId,
    }),
  ).toEqual({ visited: 1, scheduled: 1 });
  expect(
    await s.t.mutation(internal.sourceAcquisition.normalizeRetention, {
      sourceId: s.sourceId,
    }),
  ).toEqual({ visited: 1, scheduled: 0 });
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    jobs.filter((job) => job.name.endsWith("sourceAcquisition:expire")),
  ).toHaveLength(1);
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.text).toBe(
    "OLD RAW BYTES",
  );
  vi.stubEnv("RESTORE_LOCK", "false");
  await s.t.mutation(internal.sourceAcquisition.expire, {
    revisionId: s.revisionId,
  });
  expect(
    await s.t.mutation(internal.sourceAcquisition.normalizeRetention, {
      sourceId: s.sourceId,
    }),
  ).toEqual({ visited: 1, scheduled: 0 });
});

it("refuses oversized candidate history without scheduling a partial repair", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const old = (await ctx.db.get(s.revisionId))!;
    const { _id, _creationTime, ...row } = old;
    for (let i = 0; i < 25; i++)
      await ctx.db.insert("sourceRevisions", { ...row, state: "superseded" });
  });
  await expect(
    s.t.mutation(internal.sourceAcquisition.normalizeRetention, {
      sourceId: s.sourceId,
    }),
  ).rejects.toThrow("LIMIT_REACHED");
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toEqual([]);
});

it("normalizes a future deadline once and leaves its bytes untouched until expiry", async () => {
  const s = await setup();
  expect(
    await s.t.mutation(internal.sourceAcquisition.normalizeRetention, {
      sourceId: s.sourceId,
    }),
  ).toEqual({ visited: 1, scheduled: 1 });
  expect(
    await s.t.mutation(internal.sourceAcquisition.normalizeRetention, {
      sourceId: s.sourceId,
    }),
  ).toEqual({ visited: 1, scheduled: 0 });
  const revision = await s.t.run((ctx) => ctx.db.get(s.revisionId));
  expect(revision?.retentionScheduledAt).toBe(s.now + 1000);
  expect(revision?.text).toBe("OLD RAW BYTES");
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 12);
  expect((await s.t.run((ctx) => ctx.db.get(s.revisionId)))?.text).toBe("");
});
