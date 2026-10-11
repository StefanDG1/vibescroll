import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import type { FunctionArgs } from "convex/server";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup(bytesRead = 65536) {
  vi.useFakeTimers();
  const t = convexTest({
    schema,
    modules,
    transactionLimits: { bytesRead },
  });
  const ids = await t.run(async (ctx) => {
    const actor = await ctx.db.insert("users", {
      subject: "synthetic-recovery-costs",
      email: "costs@example.test",
      name: "Synthetic",
      status: "active",
      createdAt: Date.now(),
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Synthetic recovery costs",
      status: "active",
      createdBy: actor,
      createdAt: Date.now(),
    });
    const topicId = await ctx.db.insert("knowledgeTopics", {
      organizationId,
      name: "Synthetic",
      key: "synthetic",
      version: 1,
      state: "ready",
      pinned: false,
      sourceCount: 0,
      insightCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { organizationId, actor, topicId };
  });
  return { t, ...ids };
}
type Setup = Awaited<ReturnType<typeof setup>>;
function job(s: Setup, key: string, state: string, updatedAt = Date.now()) {
  return {
    organizationId: s.organizationId,
    actor: s.actor,
    topicId: s.topicId,
    version: 1,
    policyVersion: 1,
    cursor: null,
    next: null,
    done: false,
    state,
    key,
    references: [],
    processingVersion: "synthetic",
    createdAt: Date.now(),
    updatedAt,
  } satisfies Omit<Doc<"knowledgeJobs">, "_id" | "_creationTime">;
}
async function repository(s: Setup) {
  return s.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: s.organizationId,
      installationId: 1,
      providerId: 1,
      fullName: "synthetic/recovery",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      profile: "Synthetic",
      profileVersion: 1,
      confirmed: true,
      manifest: [],
      context: "",
      status: "connected",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}
async function source(
  s: Setup,
  key: string,
  text = "Synthetic private source",
) {
  return s.t.run((ctx) =>
    ctx.db.insert("sources", {
      organizationId: s.organizationId,
      key,
      canonical: key,
      kind: "text",
      title: "Synthetic",
      text,
      tags: [],
      state: "ready",
      coverage: "caption_only",
      generation: 1,
      rightsAttested: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}
it("keeps idle knowledge recovery below 64 KiB despite a large completed history", async () => {
  const { t, ...ids } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 60; i++)
      await ctx.db.insert("knowledgeJobs", {
        ...ids,
        version: 1,
        policyVersion: 1,
        cursor: null,
        next: null,
        done: true,
        state: "completed",
        key: `history-${i}`,
        references: [],
        output: "x".repeat(32000),
        processingVersion: "synthetic",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  await t.mutation(internal.knowledge.recoverPage, {});
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(0);
});
it("also skips terminal evaluation history and safely restarts a legacy history cursor", async () => {
  const s = await setup();
  const repositoryId = await repository(s);
  await s.t.run(async (ctx) => {
    for (const state of [
      "completed",
      "unknown",
      "failed",
      "deleted",
      "stale",
      "canceled",
    ])
      await ctx.db.insert("knowledgeEvaluations", {
        organizationId: s.organizationId,
        actor: s.actor,
        topicId: s.topicId,
        repositoryId,
        topicVersion: 1,
        baseSha: "a".repeat(40),
        profileVersion: 1,
        references: [],
        sourceSetHash: "synthetic",
        key: state,
        state,
        decision: "new",
        output: "x".repeat(32000),
        processingVersion: "synthetic",
        covered: 0,
        omitted: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  await s.t.mutation(internal.knowledge.recoverPage, {
    cursor: "legacy-history-cursor",
  });
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toHaveLength(0);
});
it("recovers expired leases without touching live jobs, newer topic versions or reservations", async () => {
  const s = await setup();
  const now = Date.now();
  const ids = await s.t.run(async (ctx) => {
    const expired = await ctx.db.insert(
      "knowledgeJobs",
      job(s, "expired", "running", now - 300001),
    );
    const live = await ctx.db.insert(
      "knowledgeJobs",
      job(s, "live", "running", now),
    );
    const boundary = await ctx.db.insert(
      "knowledgeJobs",
      job(s, "boundary", "running", now - 300000),
    );
    const queued = await ctx.db.insert(
      "knowledgeJobs",
      job(s, "queued", "queued"),
    );
    const hold = await ctx.db.insert("reservations", {
      organizationId: s.organizationId,
      key: "expired",
      max: 10,
      settled: 0,
      state: "active",
      expiresAt: now + 600000,
      createdAt: now,
      updatedAt: now,
    });
    return { expired, live, boundary, queued, hold };
  });
  await s.t.run((ctx) => ctx.db.patch(s.topicId, { version: 2 }));
  await s.t.mutation(internal.knowledge.recoverPage, {});
  expect((await s.t.run((ctx) => ctx.db.get(ids.expired)))?.state).toBe(
    "unknown",
  );
  for (const id of [ids.live, ids.boundary])
    expect((await s.t.run((ctx) => ctx.db.get(id)))?.state).toBe("running");
  expect((await s.t.run((ctx) => ctx.db.get(s.topicId)))?.state).toBe("ready");
  expect((await s.t.run((ctx) => ctx.db.get(ids.hold)))?.state).toBe("active");
  await s.t.mutation(internal.knowledge.recoverPage, {
    section: "knowledgeJobs",
    state: "queued",
    asOf: now,
  });
  const scheduled = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    scheduled
      .filter((row) => row.name === "knowledgeActions:organize")
      .map((row) => row.args[0]),
  ).toEqual([{ id: ids.queued }]);
  for (const flag of [
    "RESTORE_LOCK",
    "DISABLE_KNOWLEDGE",
    "DISABLE_INFERENCE",
  ]) {
    vi.stubEnv(flag, "true");
    await s.t.mutation(internal.knowledge.recoverPage, {});
    expect(
      await s.t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      ),
    ).toHaveLength(scheduled.length);
    vi.stubEnv(flag, "false");
  }
});
it("paginates every active phase when jobs leave the index between pages", async () => {
  const s = await setup();
  const repositoryId = await repository(s);
  const now = Date.now();
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 41; i++) {
      await ctx.db.insert(
        "knowledgeJobs",
        job(s, `expired-${i}`, "running", now - 300001),
      );
      await ctx.db.insert("knowledgeJobs", job(s, `queued-${i}`, "queued"));
      for (const state of ["running", "queued"])
        await ctx.db.insert("knowledgeEvaluations", {
          organizationId: s.organizationId,
          actor: s.actor,
          topicId: s.topicId,
          repositoryId,
          topicVersion: 1,
          baseSha: "a".repeat(40),
          profileVersion: 1,
          references: [],
          sourceSetHash: "synthetic",
          key: `${state}-${i}`,
          state,
          decision: "new",
          processingVersion: "synthetic",
          covered: 0,
          omitted: false,
          createdAt: now,
          updatedAt: state === "running" ? now - 300001 : now,
        });
    }
  });
  await s.t.mutation(internal.knowledge.recoverPage, {});
  // Drain only recovery continuations. Provider actions stay unexecuted.
  const seen = new Set<string>();
  for (let round = 0; round < 15; round++) {
    const scheduled = await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const next = scheduled.find(
      (row) => row.name === "knowledge:recoverPage" && !seen.has(row._id),
    );
    if (!next) break;
    seen.add(next._id);
    await s.t.mutation(
      internal.knowledge.recoverPage,
      next.args[0] as FunctionArgs<typeof internal.knowledge.recoverPage>,
    );
  }
  for (const table of ["knowledgeJobs", "knowledgeEvaluations"] as const)
    expect(
      await s.t.run((ctx) =>
        ctx.db
          .query(table)
          .withIndex("by_state_updated", (q) => q.eq("state", "running"))
          .collect(),
      ),
    ).toHaveLength(0);
  const actions = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  for (const name of ["knowledgeActions:organize", "knowledgeActions:evaluate"])
    expect(
      new Set(
        actions.filter((row) => row.name === name).map((row) => row.args[0].id),
      ).size,
    ).toBe(41);
  expect(seen.size).toBeLessThan(15);
});
it("reuses large source reads only within one backup or restore query", async () => {
  const s = await setup();
  const sourceId = await source(s, "frames", "PRIVATE ".repeat(4000));
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 25; i++)
      await ctx.db.insert("assets", {
        organizationId: s.organizationId,
        sourceId,
        key: `${s.organizationId}/frame-${i}`,
        size: 100,
        type: "image/jpeg",
        kind: "evidence",
        state: "complete",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  vi.advanceTimersByTime(1);
  const asOf = Date.now(),
    key = `${s.organizationId}/frame-0`;
  const page = await s.t.query(internal.recovery.evidencePage, {
    asOf,
    cursor: null,
  });
  expect(page.entries).toHaveLength(25);
  expect(JSON.stringify(page)).not.toContain("PRIVATE");
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    await s.t.query(internal.recovery.evidenceRestoreCurrent, { key, asOf }),
  ).toMatchObject({ source: { generation: 1 } });
  await s.t.run((ctx) => ctx.db.patch(sourceId, { generation: 2 }));
  expect(
    await s.t.query(internal.recovery.evidenceRestoreCurrent, { key, asOf }),
  ).toMatchObject({ source: { generation: 2 } });
  await s.t.run((ctx) =>
    ctx.db.insert("tombstones", {
      target: sourceId,
      organizationId: s.organizationId,
      at: Date.now(),
    }),
  );
  expect(
    await s.t.query(internal.recovery.evidenceRestoreCurrent, { key, asOf }),
  ).toBeNull();
  expect(
    (await s.t.query(internal.recovery.evidencePage, { asOf, cursor: null }))
      .entries,
  ).toHaveLength(0);
});
it("applies restore deletion below 64 KiB without scanning unrelated workspace assets or runs", async () => {
  const s = await setup();
  const sourceId = await source(s, "deleted"),
    otherSource = await source(s, "survives");
  const repositoryId = await repository(s);
  const ids = await s.t.run(async (ctx) => {
    const proposal = (sourceId: Doc<"sources">["_id"]) =>
      ctx.db.insert("proposals", {
        organizationId: s.organizationId,
        sourceId,
        repositoryId,
        baseSha: "a".repeat(40),
        profileVersion: 1,
        disposition: "relevant",
        title: "Synthetic",
        detail: {},
        review: "accepted",
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    const linkedProposal = await proposal(sourceId),
      otherProposal = await proposal(otherSource);
    const run = (proposalId: Doc<"proposals">["_id"]) => ({
      organizationId: s.organizationId,
      proposalId,
      repositoryId,
      approvedBy: s.actor,
      planHash: "synthetic",
      baseSha: "a".repeat(40),
      version: 1,
      executor: "local",
      fundingRoute: "subscription",
      maxCredits: 0,
      allowedPaths: [],
      highRisk: false,
      state: "running",
      generation: 1,
      expiresAt: Date.now() + 10000,
      leaseUntil: Date.now() + 10000,
      events: ["private event"],
      patch: "x".repeat(8192),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const linkedRun = await ctx.db.insert("runs", {
      ...run(linkedProposal),
      prNumber: 42,
      prUrl: "https://example.test/pr/42",
    });
    let otherRun;
    for (let i = 0; i < 30; i++) {
      otherRun = await ctx.db.insert("runs", run(otherProposal));
      await ctx.db.insert("assets", {
        organizationId: s.organizationId,
        sourceId: otherSource,
        key: `${s.organizationId}/other-${i}`,
        size: 100,
        type: "image/jpeg",
        kind: "evidence",
        state: "complete",
        etag: "x".repeat(8192),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    const key = `${s.organizationId}/delete-frame`;
    await ctx.db.insert("assets", {
      organizationId: s.organizationId,
      sourceId,
      key,
      size: 100,
      type: "image/jpeg",
      kind: "evidence",
      state: "complete",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { linkedRun, otherRun: otherRun!, key };
  });
  vi.stubEnv("RESTORE_LOCK", "true");
  const entries = [
    {
      kind: "source" as const,
      target: sourceId,
      organizationId: s.organizationId,
      at: Date.now(),
    },
  ];
  await s.t.mutation(internal.recovery.applyMarkers, { entries });
  expect(await s.t.run((ctx) => ctx.db.get(sourceId))).toMatchObject({
    state: "deleted",
    generation: 2,
  });
  expect((await s.t.run((ctx) => ctx.db.get(sourceId)))?.text).toBeUndefined();
  expect(await s.t.run((ctx) => ctx.db.get(ids.linkedRun))).toMatchObject({
    state: "completed",
    generation: 2,
    events: [],
    prNumber: 42,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(ids.linkedRun)))?.patch,
  ).toBeUndefined();
  expect((await s.t.run((ctx) => ctx.db.get(ids.otherRun)))?.state).toBe(
    "running",
  );
  expect((await s.t.run((ctx) => ctx.db.get(otherSource)))?.state).toBe(
    "ready",
  );
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("objectDeletions")
        .withIndex("by_key", (q) => q.eq("key", ids.key))
        .unique(),
    ),
  ).toMatchObject({ state: "pending" });
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("objectDeletions")
        .withIndex("by_key", (q) => q.eq("key", `${s.organizationId}/other-0`))
        .unique(),
    ),
  ).toBeNull();
  // Reapplying a marker must still scrub an accidentally resurrected document.
  await s.t.run((ctx) =>
    ctx.db.patch(sourceId, {
      state: "ready",
      text: "Resurrected backup content",
    }),
  );
  await s.t.mutation(internal.recovery.applyMarkers, { entries });
  expect((await s.t.run((ctx) => ctx.db.get(sourceId)))?.text).toBeUndefined();
});
