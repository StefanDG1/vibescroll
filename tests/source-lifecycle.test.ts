import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { createEvidence, registryHash } from "../packages/sources/evidence";
import {
  retainedSourceRevision,
  cardSourceRetained,
  sourceRetained,
} from "../convex/lib/sourceAuthority";
import {
  referencesCurrent,
  syncKnowledge,
  memberEvidence,
} from "../convex/knowledge";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";
import {
  contentExportSections,
  exportRecord,
} from "../packages/privacy/export";
import { recoveryQuarantineSections } from "../packages/recovery/quarantine";
import { reserve } from "../convex/product";

const modules = import.meta.glob("../convex/**/*.ts");
let sequence = 0;
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const subject = `lifecycle-${++sequence}`;
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject,
    email: `${subject}@example.test`,
    name: "Synthetic lifecycle",
  });
  const owner = t.withIdentity({ subject });
  const org = await owner.mutation(api.organizations.create, {
    name: "Synthetic lifecycle workspace",
  });
  return { t, actor, owner, org };
}
async function source(
  s: Awaited<ReturnType<typeof setup>>,
  retention?: number,
) {
  const text = "Synthetic retained source evidence.";
  const now = Date.now();
  const evidence = await createEvidence({
    kind: "supplied_text",
    excerpt: text,
    canonicalUrl: "supplied:text",
    originalUrl: null,
    startOffset: 0,
    endOffset: text.length,
    provenance: "user_supplied_unverified",
    observedAt: now,
  });
  const contentHash = await registryHash([evidence]);
  const revision = {
    schemaVersion: "1.0.0",
    sourceType: "supplied_text",
    canonical: "supplied:text",
    providerIdentity: "synthetic-owner",
    contentHash,
    adapterVersion: "synthetic-v1",
    observedAt: now,
    rightsBasis: "synthetic_owner_permission",
    coverage: { method: "supplied", retrieved: 1, omitted: 0, omissions: [] },
    ...(retention === undefined
      ? {}
      : {
          retention: {
            retainUntil: retention,
            deletionWithinMs: 3600000,
            policyEvidenceId: "synthetic-policy",
          },
        }),
  };
  return s.t.run(async (ctx) => {
    const id = await ctx.db.insert("sources", {
      organizationId: s.org,
      createdAt: now,
      updatedAt: now,
      key: `synthetic-${++sequence}`,
      canonical: "supplied:text",
      sourceType: "supplied_text",
      kind: "text",
      title: "Synthetic source",
      text,
      summary: "Retained summary",
      tags: [],
      state: "ready",
      generation: 1,
      coverage: "caption_only",
      rightsAttested: true,
      sourceRetentionUntil: retention,
      analysis: { insights: [{ id: "point", claim: "retained claim" }] },
    });
    const revisionId = await ctx.db.insert("sourceRevisions", {
      organizationId: s.org,
      sourceId: id,
      createdAt: now,
      updatedAt: now,
      generation: 1,
      contentHash,
      revision,
      evidence: [evidence],
      text: "UNTRUSTED DUPLICATE RAW TEXT",
      state: "current",
    });
    await ctx.db.patch(id, { currentRevisionId: revisionId });
    return { id, revisionId, text, now };
  });
}
async function exported(
  s: Awaited<ReturnType<typeof setup>>,
  section: (typeof contentExportSections)[number],
) {
  return (
    await s.owner.query(api.jobs.exportPage, {
      organizationId: s.org,
      section,
      cursor: null,
      asOf: Date.now(),
    })
  ).page;
}

async function derivedFixture(
  s: Awaited<ReturnType<typeof setup>>,
  f: Awaited<ReturnType<typeof source>>,
) {
  return s.t.run(async (ctx) => {
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId: s.org,
      createdAt: f.now,
      updatedAt: f.now,
      installationId: 1,
      providerId: 1,
      fullName: "synthetic/retention",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "Synthetic",
      profileVersion: 1,
      manifest: [],
      context: "",
      status: "ready",
    });
    const proposal = (generation: number, typed = true) =>
      ctx.db.insert("proposals", {
        organizationId: s.org,
        createdAt: f.now,
        updatedAt: f.now,
        sourceId: f.id,
        repositoryId,
        baseSha: "a".repeat(40),
        profileVersion: 1,
        disposition: "relevant",
        title: "EXPIRED GENERATED PROPOSAL",
        detail: {
          schemaVersion: typed ? "2.0.0" : "1.0.0",
          claim: "EXPIRED GENERATED CLAIM",
        },
        review: "accepted",
        version: 1,
        plan: { copied: "EXPIRED GENERATED PLAN" },
        planDraft: { copied: "EXPIRED GENERATED DRAFT" },
        planDraftVersion: 1,
        planDraftKey: "synthetic-draft",
        planDraftActor: s.actor,
        planHash: "synthetic-approved-hash",
        references: [
          { sourceId: f.id, generation, revision: f.now, insightId: "point" },
        ],
        reviewerCorrection: {
          from: "needs_context",
          to: "relevant",
          reason: "ACTOR MANUAL CORRECTION",
          actor: s.actor,
          at: f.now,
        },
      });
    const old = await proposal(1),
      fresh = await proposal(3),
      legacy = await proposal(1, false);
    const run = (
      proposalId: typeof old,
      published = false,
      patch = "EXPIRED GENERATED PATCH",
    ) =>
      ctx.db.insert("runs", {
        organizationId: s.org,
        createdAt: f.now,
        updatedAt: f.now,
        proposalId,
        repositoryId,
        approvedBy: s.actor,
        planHash: "synthetic-approved-hash",
        baseSha: "a".repeat(40),
        version: 1,
        executor: "cloud",
        fundingRoute: "managed_api",
        maxCredits: 10,
        allowedPaths: ["README.md"],
        highRisk: false,
        state: published ? "completed" : "running",
        generation: 1,
        expiresAt: f.now + 60000,
        leaseUntil: f.now + 60000,
        patch,
        changes: [{ path: "README.md", content: "EXPIRED GENERATED FILE" }],
        report: "EXPIRED GENERATED REPORT",
        aiReview: {
          status: "passed",
          key: "synthetic-ai-review",
          generation: 1,
          patchDigest: "synthetic-digest",
          policyVersion: 1,
          note: "EXPIRED GENERATED REVIEW",
        },
        checksPassed: true,
        error: "EXPIRED GENERATED ERROR",
        events: [
          "Isolated sandbox started: sbx_synthetic",
          "EXPIRED GENERATED LOG",
        ],
        ...(published
          ? {
              prNumber: 7,
              prUrl: "https://github.com/synthetic/retention/pull/7",
              prState: "merged",
              mergedAt: "2026-10-22",
              mergeCommitSha: "b".repeat(40),
              deployment: {
                state: "succeeded",
                commit: "b".repeat(40),
                url: "https://synthetic.example.test",
                environment: "production",
                observedAt: f.now,
              },
            }
          : {}),
      });
    const active = await run(old),
      published = await run(old, true),
      freshRun = await run(fresh),
      legacyRun = await run(legacy);
    const note = await ctx.db.insert("feedback", {
      organizationId: s.org,
      actor: s.actor,
      target: old,
      action: "manual_note",
      note: "ACTOR AUTHORED FEEDBACK",
      benefit: "",
      createdAt: f.now,
      updatedAt: f.now,
    });
    return {
      repositoryId,
      old,
      fresh,
      legacy,
      active,
      published,
      freshRun,
      legacyRun,
      note,
    };
  });
}

it("scrubs old v2 proposal and run bytes while retaining manual corrections, publication receipts and held charges", async () => {
  const s = await setup(),
    f = await source(s),
    d = await derivedFixture(s, f);
  const key = `run:${d.active}`;
  await s.t.run((ctx) => reserve(ctx, s.org, key, 10));
  await s.t.run((ctx) => ctx.db.patch(f.id, { generation: 3 }));
  // Replayed/out-of-order proposal cleanup must retain its generation fence so
  // the later run pass can still remove the matching old source-derived bytes.
  for (const section of ["proposals", "runs", "runs"] as const)
    await s.t.mutation(internal.knowledge.redactDerived, {
      organizationId: s.org,
      sourceId: f.id,
      maxGeneration: 1,
      section,
      cursor: null,
    });
  const result = await s.t.run(async (ctx) => ({
    proposal: await ctx.db.get(d.old),
    active: await ctx.db.get(d.active),
    published: await ctx.db.get(d.published),
    fresh: await ctx.db.get(d.fresh),
    freshRun: await ctx.db.get(d.freshRun),
    legacy: await ctx.db.get(d.legacy),
    legacyRun: await ctx.db.get(d.legacyRun),
    note: await ctx.db.get(d.note),
    reservation: await ctx.db
      .query("reservations")
      .withIndex("by_key", (q) => q.eq("organizationId", s.org).eq("key", key))
      .unique(),
  }));
  expect(result.proposal).toMatchObject({
    detail: { schemaVersion: "2.0.0", sourceRetentionRedacted: true },
    review: "needs_context",
    version: 2,
    reviewerCorrection: { reason: "ACTOR MANUAL CORRECTION" },
  });
  expect(result.proposal?.references?.[0].generation).toBe(1);
  for (const field of [
    "plan",
    "planDraft",
    "planHash",
    "planDraftKey",
    "planDraftActor",
    "planDraftVersion",
  ] as const)
    expect(result.proposal?.[field]).toBeUndefined();
  expect(result.active).toMatchObject({
    state: "canceled",
    generation: 2,
    leaseUntil: 0,
  });
  expect(
    JSON.stringify([result.proposal, result.active, result.published]),
  ).not.toContain("EXPIRED GENERATED");
  expect(result.active?.events).toContain(
    "Isolated sandbox started: sbx_synthetic",
  );
  expect(result.published).toMatchObject({
    state: "completed",
    prNumber: 7,
    prUrl: "https://github.com/synthetic/retention/pull/7",
    prState: "merged",
    mergeCommitSha: "b".repeat(40),
    deployment: { state: "succeeded" },
  });
  expect(result.fresh?.detail.claim).toBe("EXPIRED GENERATED CLAIM");
  expect(result.freshRun?.patch).toBe("EXPIRED GENERATED PATCH");
  expect(result.legacy?.detail.claim).toBe("EXPIRED GENERATED CLAIM");
  expect(result.legacyRun?.patch).toBe("EXPIRED GENERATED PATCH");
  expect(result.note?.note).toBe("ACTOR AUTHORED FEEDBACK");
  expect(result.reservation).toMatchObject({
    state: "active",
    max: 10,
    settled: 0,
  });
  expect(
    await s.t.mutation(internal.jobs.completeCloud, {
      id: d.active,
      generation: 1,
      patch: "LATE RESTORED BYTES",
      changes: [],
      report: "LATE RESTORED BYTES",
      credits: 0,
    }),
  ).toBe(false);
  await s.t.mutation(internal.jobs.reconcileTerminatedCloud, {
    id: d.active,
    generation: 1,
    sandboxId: "sbx_synthetic",
    credits: 2,
  });
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("reservations")
        .withIndex("by_key", (q) =>
          q.eq("organizationId", s.org).eq("key", key),
        )
        .unique(),
    ),
  ).toMatchObject({ state: "settled", settled: 2 });
});

it("propagates bounded source generations through paginated run cleanup before the proposal section", async () => {
  const s = await setup(),
    f = await source(s),
    d = await derivedFixture(s, f);
  await s.t.run(async (ctx) => {
    const initial = (await ctx.db.get(d.active))!;
    const { _id, _creationTime, ...base } = initial;
    for (let index = 0; index < 12; index++)
      await ctx.db.insert("runs", { ...base, patch: "x".repeat(120000) });
  });
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  while (pages++ < 20) {
    await s.t.mutation(internal.knowledge.redactDerived, {
      organizationId: s.org,
      sourceId: f.id,
      maxGeneration: 1,
      section: "runs",
      cursor,
    });
    const scheduled = await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const next = scheduled.find(
      (row) => row.name.endsWith("redactDerived") && !seen.has(row._id),
    );
    expect(next).toBeDefined();
    seen.add(next!._id);
    const args = next!.args[0] as {
      maxGeneration: number;
      section: string;
      cursor: string | null;
    };
    expect(args.maxGeneration).toBe(1);
    if (args.section === "proposals") break;
    expect(args.section).toBe("runs");
    cursor = args.cursor;
  }
  expect(pages).toBeGreaterThan(1);
  expect(pages).toBeLessThan(20);
  const oldRuns = await s.t.run((ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_proposal", (q) => q.eq("proposalId", d.old))
      .collect(),
  );
  expect(oldRuns).toHaveLength(14);
  for (const run of oldRuns) expect(run.patch).toBeUndefined();
  expect((await s.t.run((ctx) => ctx.db.get(d.freshRun)))?.patch).toBe(
    "EXPIRED GENERATED PATCH",
  );
});

it("retains manual topic history without source titles, counts or fresh-generation promotion and removes it on full deletion", async () => {
  const s = await setup(),
    f = await source(s);
  const rows = await s.t.run(async (ctx) => {
    const makeTopic = (key: string, count: number) =>
      ctx.db.insert("knowledgeTopics", {
        organizationId: s.org,
        createdAt: f.now,
        updatedAt: f.now,
        key,
        name: "Actor-authored filing choice",
        pinned: true,
        version: 1,
        state: "ready",
        sourceCount: count,
        insightCount: count,
      });
    const manualTopic = await makeTopic("manual-history", 1),
      excludedTopic = await makeTopic("excluded-history", 0),
      automaticTopic = await makeTopic("automatic-history", 1);
    const makeMember = (
      topicId: typeof manualTopic,
      manual: boolean,
      excluded: boolean,
    ) =>
      ctx.db.insert("knowledgeMembers", {
        organizationId: s.org,
        sourceId: f.id,
        topicId,
        createdAt: f.now,
        updatedAt: f.now,
        generation: 1,
        revision: f.now,
        insightId: "point",
        sourceTitle: "EXPIRED PRIVATE SOURCE TITLE",
        manual,
        excluded,
      });
    const manual = await makeMember(manualTopic, true, false),
      excluded = await makeMember(excludedTopic, true, true),
      automatic = await makeMember(automaticTopic, false, false);
    await ctx.db.patch(f.id, {
      state: "failed",
      generation: 2,
      rightsAttested: false,
      analysis: undefined,
    });
    await syncKnowledge(ctx, (await ctx.db.get(f.id))!, {
      preserveManualHistory: true,
      enqueue: false,
    });
    return {
      manualTopic,
      excludedTopic,
      automaticTopic,
      manual,
      excluded,
      automatic,
    };
  });
  const history = await s.t.run(async (ctx) => ({
    manual: await ctx.db.get(rows.manual),
    excluded: await ctx.db.get(rows.excluded),
    automatic: await ctx.db.get(rows.automatic),
    topic: await ctx.db.get(rows.manualTopic),
  }));
  expect(history.manual).toMatchObject({
    manual: true,
    excluded: false,
    retainedHistory: true,
    generation: 1,
    revision: f.now,
  });
  expect(history.excluded).toMatchObject({
    manual: true,
    excluded: true,
    retainedHistory: true,
    generation: 1,
    revision: f.now,
  });
  expect(history.manual?.sourceTitle).toBeUndefined();
  expect(history.excluded?.sourceTitle).toBeUndefined();
  expect(history.automatic).toBeNull();
  expect(history.topic).toMatchObject({ sourceCount: 0, insightCount: 0 });
  expect(
    await s.t.run((ctx) =>
      memberEvidence(ctx, [history.manual!, history.excluded!]),
    ),
  ).toEqual([]);
  await s.t.run(async (ctx) => {
    await ctx.db.patch(f.id, {
      state: "ready",
      generation: 3,
      updatedAt: f.now + 3,
      rightsAttested: true,
      currentRevisionId: undefined,
      sourceType: "media",
      analysis: {
        schemaVersion: "1.0.0",
        insights: [
          {
            id: "point",
            claim: "Fresh claim with a reused insight ID",
            topics: ["Fresh topic"],
          },
        ],
      },
    });
    await syncKnowledge(ctx, (await ctx.db.get(f.id))!, { enqueue: false });
  });
  const after = await s.t.run((ctx) =>
    ctx.db
      .query("knowledgeMembers")
      .withIndex("by_source", (q) => q.eq("sourceId", f.id))
      .collect(),
  );
  expect(after.filter((row) => row.retainedHistory)).toHaveLength(2);
  for (const row of after.filter((row) => row.retainedHistory))
    expect(row).toMatchObject({ generation: 1, revision: f.now });
  const current = after.filter((row) => !row.retainedHistory);
  expect(current).toHaveLength(1);
  expect(current[0]).toMatchObject({
    generation: 3,
    revision: f.now + 3,
    manual: false,
    excluded: false,
  });
  expect(
    (await s.owner.query(api.knowledge.detail, { id: rows.manualTopic }))
      .members,
  ).toEqual([]);
  await s.t.run(async (ctx) => {
    await ctx.db.patch(f.id, { state: "deleted", analysis: undefined });
    await syncKnowledge(ctx, (await ctx.db.get(f.id))!, { enqueue: false });
  });
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("knowledgeMembers")
        .withIndex("by_source", (q) => q.eq("sourceId", f.id))
        .collect(),
    ),
  ).toEqual([]);
});

it("validates retained registries against their canonical source, exact pointer, generation, hash and deadline", async () => {
  const s = await setup(),
    f = await source(s, Date.now() + 60000);
  const current = () =>
    s.t.run(async (ctx) =>
      retainedSourceRevision(ctx, (await ctx.db.get(f.revisionId))!),
    );
  expect(await current()).not.toBeNull();
  for (const patch of [
    { contentHash: "0".repeat(64) },
    { generation: 2 },
    { state: "removed" as const },
  ]) {
    const original = await s.t.run((ctx) => ctx.db.get(f.revisionId));
    await s.t.run((ctx) => ctx.db.patch(f.revisionId, patch));
    expect(await current()).toBeNull();
    await s.t.run((ctx) => ctx.db.replace(f.revisionId, original!));
  }
  await s.t.run((ctx) => ctx.db.patch(f.id, { canonical: "supplied:changed" }));
  expect(await current()).toBeNull();
  await s.t.run((ctx) =>
    ctx.db.patch(f.id, {
      canonical: "supplied:text",
      sourceRetentionUntil: Date.now() - 1,
    }),
  );
  expect(await current()).toBeNull();
  expect(sourceRetained(Number.NaN)).toBe(false);
  expect(sourceRetained(Date.now())).toBe(false);
});

it("excludes expired source evidence and derived outputs from exports before cleanup runs", async () => {
  const s = await setup(),
    f = await source(s, Date.now() + 60000);
  const refs = [
    { sourceId: f.id, generation: 1, revision: f.now, insightId: "point" },
  ];
  const topic = await s.t.run((ctx) =>
    ctx.db.insert("knowledgeTopics", {
      organizationId: s.org,
      createdAt: f.now,
      updatedAt: f.now,
      key: "topic",
      name: "Synthetic topic",
      pinned: false,
      version: 1,
      state: "ready",
    }),
  );
  await s.t.run((ctx) =>
    ctx.db.insert("knowledgeJobs", {
      organizationId: s.org,
      actor: s.actor,
      topicId: topic,
      createdAt: f.now,
      updatedAt: f.now,
      version: 1,
      policyVersion: 1,
      cursor: null,
      next: null,
      done: true,
      state: "ready",
      key: "old-job",
      references: refs,
      processingVersion: "synthetic",
      output: { summary: "EXPIRED DERIVED OUTPUT" },
    }),
  );
  const valid = await exported(s, "sourceRevisions");
  expect(valid).toHaveLength(1);
  expect(JSON.stringify(valid)).toContain(f.text);
  expect(JSON.stringify(valid)).not.toContain("UNTRUSTED DUPLICATE RAW TEXT");
  await s.t.run((ctx) =>
    ctx.db.patch(f.id, { sourceRetentionUntil: Date.now() - 1 }),
  );
  expect(await exported(s, "sourceRevisions")).toEqual([]);
  const records = JSON.stringify([
    await exported(s, "sources"),
    await exported(s, "knowledgeJobs"),
  ]);
  expect(records).not.toContain(f.text);
  expect(records).not.toContain("EXPIRED DERIVED OUTPUT");
  expect(await s.t.run((ctx) => referencesCurrent(ctx, s.org, refs))).toBe(
    false,
  );
});

it("rejects expired current cards and resolves legacy card deadlines from canonical sources", async () => {
  const s = await setup(),
    f = await source(s, Date.now() - 1);
  const card = await s.t.run(async (ctx) => {
    await syncDashboardCard(ctx, "sources", f.id, (await ctx.db.get(f.id))!);
    return (await ctx.db
      .query("dashboardCards")
      .withIndex("by_entity", (q) => q.eq("entityId", f.id))
      .unique())!;
  });
  expect(card.sourceAuthorityVersion).toBe(2);
  expect(await s.t.run((ctx) => cardSourceRetained(ctx, card))).toBe(false);
  expect(
    await s.t.run((ctx) =>
      cardSourceRetained(ctx, {
        ...card,
        sourceAuthorityVersion: 1,
        sourceRetentionUntil: undefined,
      }),
    ),
  ).toBe(false);
});

it("removes expired source cards and their recommendations from Home before scheduled cleanup", async () => {
  const s = await setup(),
    f = await source(s, Date.now() + 60000);
  await s.t.run(async (ctx) => {
    await ctx.db.insert("dashboardMigrations", {
      name: "dashboard-v1",
      table: 4,
      cursor: null,
      complete: true,
      enabled: true,
      updatedAt: f.now,
    });
    await syncDashboardCard(ctx, "sources", f.id, (await ctx.db.get(f.id))!);
    const repoId = await ctx.db.insert("repositories", {
      organizationId: s.org,
      createdAt: f.now,
      updatedAt: f.now,
      installationId: 1,
      providerId: 1,
      fullName: "synthetic/lifecycle",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "Synthetic project",
      profileVersion: 1,
      manifest: [],
      context: "",
      status: "ready",
    });
    await syncDashboardCard(
      ctx,
      "repositories",
      repoId,
      (await ctx.db.get(repoId))!,
    );
    await ctx.db.insert("dashboardCards", {
      organizationId: s.org,
      entityId: "synthetic-proposal",
      kind: "proposal",
      title: "EXPIRED RECOMMENDATION",
      state: "proposed",
      review: "unreviewed",
      repositoryId: repoId,
      baseSha: "a".repeat(40),
      profileVersion: 1,
      references: [
        { sourceId: f.id, generation: 1, revision: f.now, insightId: "point" },
      ],
      createdAt: f.now,
      updatedAt: f.now,
    });
  });
  const before = await s.owner.query(api.dashboard.home, {
    organizationId: s.org,
  });
  expect(before.ready && before.sources).toHaveLength(1);
  expect(before.ready && before.proposals).toHaveLength(1);
  vi.setSystemTime(Date.now() + 60001);
  const after = await s.owner.query(api.dashboard.home, {
    organizationId: s.org,
  });
  expect(after.ready && after.sources).toEqual([]);
  expect(after.ready && after.proposals).toEqual([]);
  expect(JSON.stringify(after)).not.toContain("EXPIRED RECOMMENDATION");
});

it("bounds delayed expiry cleanup by reference generation and propagates the bound to continuation", async () => {
  const s = await setup(),
    f = await source(s);
  const jobs = await s.t.run(async (ctx) => {
    const topicId = await ctx.db.insert("knowledgeTopics", {
      organizationId: s.org,
      createdAt: f.now,
      updatedAt: f.now,
      key: "topic",
      name: "Synthetic",
      pinned: false,
      version: 1,
      state: "ready",
    });
    const make = (generation: number) =>
      ctx.db.insert("knowledgeJobs", {
        organizationId: s.org,
        actor: s.actor,
        topicId,
        createdAt: f.now,
        updatedAt: f.now,
        version: 1,
        policyVersion: 1,
        cursor: null,
        next: null,
        done: true,
        state: "ready",
        key: `job-${generation}`,
        references: [
          { sourceId: f.id, generation, revision: f.now, insightId: "point" },
        ],
        processingVersion: "synthetic",
        output: { summary: `generation ${generation}` },
      });
    return { old: await make(1), fresh: await make(3) };
  });
  await s.t.mutation(internal.knowledge.redactDerived, {
    organizationId: s.org,
    sourceId: f.id,
    maxGeneration: 1,
    section: "knowledgeJobs",
    cursor: null,
  });
  const result = await s.t.run(async (ctx) => ({
    old: await ctx.db.get(jobs.old),
    fresh: await ctx.db.get(jobs.fresh),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(result.old?.output).toBeUndefined();
  expect(result.fresh?.output).toEqual({ summary: "generation 3" });
  const next = result.scheduled.find((row) =>
    row.name.endsWith("redactDerived"),
  );
  expect(next?.args[0]).toMatchObject({
    maxGeneration: 1,
    section: "knowledgeEvaluations",
  });
  await s.t.mutation(internal.knowledge.redactDerived, {
    organizationId: s.org,
    sourceId: f.id,
    section: "knowledgeJobs",
    cursor: null,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(jobs.fresh)))?.output,
  ).toBeUndefined();
});

it("reserves matching only for the exact current typed analysis and persists actor and source fences", async () => {
  const s = await setup(),
    f = await source(s, Date.now() + 60000);
  const repo = await s.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: s.org,
      createdAt: f.now,
      updatedAt: f.now,
      installationId: 1,
      providerId: 1,
      fullName: "synthetic/matching",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "Synthetic",
      profileVersion: 1,
      manifest: [],
      context: "",
      status: "ready",
    }),
  );
  const args = { id: f.id, repositoryId: repo, maxCredits: 10 };
  // A v1 result cannot authorize matching for a source with typed registry evidence.
  await expect(s.owner.mutation(api.jobs.reserveMatch, args)).rejects.toThrow(
    "SOURCE_CHANGED",
  );
  const revision = await s.t.run((ctx) => ctx.db.get(f.revisionId));
  await s.t.run((ctx) =>
    ctx.db.patch(f.id, {
      analysis: {
        schemaVersion: "2.0.0",
        sourceRevisionId: f.revisionId,
        sourceContentHash: "0".repeat(64),
        insights: [{ id: "point" }],
      },
    }),
  );
  await expect(s.owner.mutation(api.jobs.reserveMatch, args)).rejects.toThrow(
    "SOURCE_CHANGED",
  );
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  await s.t.run((ctx) =>
    ctx.db.patch(f.id, {
      analysis: {
        schemaVersion: "2.0.0",
        sourceRevisionId: f.revisionId,
        sourceContentHash: revision!.contentHash,
        sourceId: f.id,
        processingRunId: `${f.id}:1`,
        coverage: "source_text",
        summary: "Synthetic cited analysis",
        warnings: ["Synthetic fixture"],
        insights: [
          {
            id: "point",
            title: "Inspect current evidence",
            claim: "Inspect the supplied evidence before approving work.",
            interpretation: "Keep review explicit.",
            categories: ["coding"],
            confidence: "supported",
            verificationNeeds: [],
            evidence: [
              {
                kind: "supplied_text",
                id: revision!.evidence[0].id,
                startMs: null,
                endMs: null,
              },
            ],
          },
        ],
      },
    }),
  );
  const result = await s.owner.mutation(api.jobs.reserveMatch, args);
  expect(result.sourceRevisionRegistry).toMatchObject({
    id: f.revisionId,
    revision: { contentHash: revision!.contentHash },
  });
  const job = await s.t.run((ctx) =>
    ctx.db
      .query("matchingJobs")
      .withIndex("by_key", (q) => q.eq("key", result.semanticKey))
      .unique(),
  );
  expect(job).toMatchObject({
    actor: s.actor,
    sourceGeneration: 1,
    sourceRevision: f.now,
    sourceRevisionId: f.revisionId,
    sourceContentHash: revision!.contentHash,
  });
  await s.t.run((ctx) =>
    ctx.db.patch(f.id, { sourceRetentionUntil: Date.now() - 1 }),
  );
  await expect(s.owner.mutation(api.jobs.reserveMatch, args)).rejects.toThrow(
    "SOURCE_CHANGED",
  );
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
});

it("keeps ordinary captured supplied text eligible for legacy v1 project matching", async () => {
  const s = await setup();
  const sourceId = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    key: "synthetic-ordinary-captured-text",
    kind: "text",
    title: "Ordinary supplied text",
    text: "Synthetic permitted text for the ordinary capture flow.",
    rightsAttested: true,
  });
  const repositoryId = await s.t.run(async (ctx) => {
    await ctx.db.patch(sourceId, {
      state: "ready",
      generation: 1,
      analysis: {
        schemaVersion: "1.0.0",
        coverage: "caption_only",
        insights: [
          {
            id: "ordinary-point",
            evidence: [
              {
                kind: "user_note",
                id: "supplied_text",
                startMs: null,
                endMs: null,
              },
            ],
          },
        ],
      },
    });
    return ctx.db.insert("repositories", {
      organizationId: s.org,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      installationId: 1,
      providerId: 1,
      fullName: "synthetic/ordinary-text",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "Synthetic project",
      profileVersion: 1,
      manifest: [],
      context: "",
      status: "ready",
    });
  });
  const captured = await s.t.run((ctx) => ctx.db.get(sourceId));
  expect(captured?.sourceType).toBe("supplied_text");
  expect(captured?.currentRevisionId).toBeUndefined();
  const result = await s.owner.mutation(api.jobs.reserveMatch, {
    id: sourceId,
    repositoryId,
    maxCredits: 10,
  });
  expect(result.cached).toBe(false);
  expect(result.sourceRevisionRegistry).toBeNull();
  expect(result.source.analysis.insights[0].id).toBe("ordinary-point");
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
});

async function publicRows(
  s: Awaited<ReturnType<typeof setup>>,
  f: Awaited<ReturnType<typeof source>>,
) {
  return s.t.run(async (ctx) => {
    const edition = await ctx.db.insert("publicEditions", {
      organizationId: s.org,
      actor: s.actor,
      sourceId: f.id,
      sourceGeneration: 1,
      sourceRevision: f.now,
      state: "published",
      version: 1,
      slug: `synthetic-${++sequence}`,
      payload: {
        title: "Restored title",
        summary: "PUBLIC BASE CONTENT",
        publisher: "Synthetic",
        sourceUrl: null,
        coverage: "caption_only",
        language: "en",
        pipelineVersion: "synthetic-v1",
        schemaVersion: "1.0.0",
        insights: [],
      },
      payloadHash: "invalid",
      rightsBasis: "owner_created",
      permissionReference: "Synthetic rights",
      permissionExpiresAt: Date.now() + 60000,
      reuseAllowed: true,
      publishedAt: f.now,
      createdAt: f.now,
      updatedAt: f.now,
    });
    const artifact = await ctx.db.insert("publicArtifacts", {
      organizationId: s.org,
      editionId: edition,
      editionVersion: 1,
      compatibilityKey: "opaque-base-compat",
      contentHash: "opaque-hash",
      language: "en",
      pipelineVersion: "synthetic-v1",
      schemaVersion: "1.0.0",
      coverage: "caption_only",
      state: "eligible",
      createdAt: f.now,
      updatedAt: f.now,
    });
    const layer = await ctx.db.insert("publicImports", {
      organizationId: s.org,
      actor: s.actor,
      sourceId: f.id,
      artifactId: artifact,
      editionVersion: 1,
      compatibilityKey: "opaque-base-compat",
      privateNote: "ACTOR AUTHORED NOTE",
      corrections: [{ insightId: "point-1", text: "Personal correction" }],
      createdAt: f.now,
      updatedAt: f.now,
    });
    const collection = await ctx.db.insert("publicCollections", {
      organizationId: s.org,
      actor: s.actor,
      slug: `collection-${++sequence}`,
      title: "Restored collection",
      description: "PUBLIC COLLECTION CONTENT",
      topic: "Synthetic",
      state: "published",
      version: 1,
      editions: [edition],
      bindings: [{ id: edition, version: 1, hash: "invalid" }],
      reviewedHash: "invalid",
      createdAt: f.now,
      updatedAt: f.now,
    });
    await ctx.db.insert("publicGeography", {
      organizationId: s.org,
      actor: s.actor,
      cell: "NL",
      enabled: true,
      createdAt: f.now,
      updatedAt: f.now,
    });
    return { edition, artifact, layer, collection };
  });
}

it("exports only the requesting actor's authored public-import layer and rejects malformed public base hashes", async () => {
  vi.stubEnv("PUBLIC_KNOWLEDGE_ENABLED", "true");
  const s = await setup(),
    f = await source(s),
    p = await publicRows(s, f);
  const other = await s.t.mutation(internal.accounts.syncUser, {
    subject: `other-${++sequence}`,
    email: "other@example.test",
    name: "Other synthetic",
  });
  await s.t.run((ctx) =>
    ctx.db.insert("publicImports", {
      organizationId: s.org,
      actor: other,
      sourceId: f.id,
      artifactId: p.artifact,
      editionVersion: 1,
      compatibilityKey: "opaque-base-compat",
      privateNote: "ANOTHER ACTOR PRIVATE NOTE",
      corrections: [],
      createdAt: f.now,
      updatedAt: f.now,
    }),
  );
  const layers = await exported(s, "publicImports");
  expect(layers).toHaveLength(1);
  expect(layers[0]).toMatchObject({
    privateNote: "ACTOR AUTHORED NOTE",
    corrections: [{ text: "Personal correction" }],
  });
  expect(JSON.stringify(layers)).not.toContain("ANOTHER ACTOR");
  expect(JSON.stringify(layers)).not.toContain("opaque-base");
  expect(JSON.stringify(await exported(s, "publicEditions"))).not.toContain(
    "PUBLIC BASE CONTENT",
  );
  expect(JSON.stringify(await exported(s, "publicCollections"))).not.toContain(
    "PUBLIC COLLECTION CONTENT",
  );
  expect(
    exportRecord("sources", {
      publicImportId: p.layer,
      title: "Saved public source",
      analysis: { summary: "COPIED PUBLIC BASE" },
      text: "COPIED PUBLIC BASE",
    }),
  ).toEqual({ publicImportId: p.layer, title: "Saved public source" });
});

it("quarantines restored public/provider authority while retaining authored notes and conservative global quotas", async () => {
  const s = await setup(),
    f = await source(s, Date.now() + 60000),
    p = await publicRows(s, f);
  const ids = await s.t.run(async (ctx) => ({
    quota: await ctx.db.insert("sourceProviderQuotas", {
      provider: "github",
      windowStart: f.now,
      used: 7,
      limit: 10,
      retryAt: f.now + 60000,
    }),
    acquisition: await ctx.db.insert("sourceAcquisitions", {
      organizationId: s.org,
      sourceId: f.id,
      actor: s.actor,
      generation: 1,
      provider: "github",
      key: "synthetic-acquisition",
      state: "fetching",
      version: 1,
      sourceRevision: f.now,
      selectedPaths: ["README.md"],
      rightsBasis: "owner permission",
      lease: "OLD DISPATCH LEASE",
      deadline: f.now + 60000,
      requestCount: 1,
      byteCount: 10,
      createdAt: f.now,
      updatedAt: f.now,
    }),
  }));
  await expect(
    s.t.mutation(internal.recovery.quarantinePage, {
      section: "sourceRevisions",
      cursor: null,
    }),
  ).rejects.toThrow("POLICY_BLOCKED");
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    (await s.t.query(internal.recovery.readiness, {})).quarantineComplete,
  ).toBe(false);
  for (const section of [
    "sourceRevisions",
    "sources",
    "publicEditions",
    "publicCollections",
    "publicArtifacts",
    "publicImports",
    "publicGeography",
    "sourceAcquisitions",
  ] as const)
    await s.t.mutation(internal.recovery.quarantinePage, {
      section,
      cursor: null,
    });
  const result = await s.t.run(async (ctx) => ({
    source: await ctx.db.get(f.id),
    revision: await ctx.db.get(f.revisionId),
    edition: await ctx.db.get(p.edition),
    collection: await ctx.db.get(p.collection),
    artifact: await ctx.db.get(p.artifact),
    layer: await ctx.db.get(p.layer),
    acquisition: await ctx.db.get(ids.acquisition),
    geography: await ctx.db.query("publicGeography").collect(),
    quota: await ctx.db.get(ids.quota),
  }));
  expect(result.source).toMatchObject({
    state: "needs_upload",
    generation: 2,
    coverage: "metadata_only",
  });
  expect(result.source?.text).toBeUndefined();
  expect(result.source?.analysis).toBeUndefined();
  expect(result.source?.currentRevisionId).toBeUndefined();
  expect(result.revision).toBeNull();
  expect(result.edition).toMatchObject({
    state: "removed",
    payload: { summary: "", insights: [] },
  });
  expect(result.collection).toMatchObject({
    state: "removed",
    editions: [],
    bindings: [],
  });
  expect(result.artifact).toBeNull();
  expect(result.layer?.privateNote).toBe("ACTOR AUTHORED NOTE");
  expect(result.acquisition).toBeNull();
  expect(result.geography).toEqual([]);
  expect(result.quota?.used).toBe(7);
  expect(
    (await s.t.query(internal.recovery.readiness, {})).quarantineComplete,
  ).toBe(true);
});

it("withdraws restored payment observations without erasing replay deduplication", async () => {
  const s = await setup(),
    now = Date.now();
  const id = await s.t.run((ctx) =>
    ctx.db.insert("pilotPaymentObservations", {
      organizationId: s.org,
      key: "pilot-payment:test:synthetic-digest",
      event: "payment_verified",
      mode: "test",
      purchaseKind: "topup",
      properties: { schema_version: "1", mode: "test", purchase_kind: "topup" },
      state: "pending",
      createdAt: now,
      updatedAt: now,
    }),
  );
  expect(
    JSON.stringify(await exported(s, "pilotPaymentObservations")),
  ).not.toContain("synthetic-digest");
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    (await s.t.query(internal.recovery.readiness, {})).quarantineComplete,
  ).toBe(false);
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "pilotPaymentObservations",
    cursor: null,
  });
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "withdrawn",
    key: "pilot-payment:test:synthetic-digest",
  });
  expect(
    (await s.t.query(internal.recovery.readiness, {})).quarantineComplete,
  ).toBe(true);
});

it("includes every tenant source/public table in lifecycle lists and preserves global quota state on tenant purge", async () => {
  const s = await setup(),
    f = await source(s),
    p = await publicRows(s, f);
  const quota = await s.t.run((ctx) =>
    ctx.db.insert("sourceProviderQuotas", {
      provider: "reddit",
      windowStart: Date.now(),
      used: 8,
      limit: 10,
      retryAt: Date.now() + 60000,
      lastOrganizationId: s.org,
    }),
  );
  for (const section of [
    "publicEditions",
    "publicCollections",
    "publicReports",
    "publicCorrections",
    "publicArtifacts",
    "publicImports",
    "publicGeography",
    "sourceRevisions",
    "sourceAcquisitions",
    "pilotPaymentObservations",
  ] as const) {
    expect(contentExportSections).toContain(section);
    expect(recoveryQuarantineSections).toContain(section);
  }
  expect(contentExportSections).not.toContain("sourceProviderQuotas");
  expect(recoveryQuarantineSections).not.toContain("sourceProviderQuotas");
  await s.owner.mutation(api.organizations.remove, {
    organizationId: s.org,
    confirmation: "Synthetic lifecycle workspace",
  });
  await s.t.mutation(internal.maintenance.purgeOrganization, {
    organizationId: s.org,
  });
  expect(await s.t.run((ctx) => ctx.db.get(p.layer))).toBeNull();
  expect(await s.t.run((ctx) => ctx.db.get(f.revisionId))).toBeNull();
  expect(await s.t.run((ctx) => ctx.db.get(quota))).toMatchObject({ used: 8 });
});
