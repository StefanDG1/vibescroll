import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { normalizeSubscriptionCapabilities } from "../packages/runner/subscription-capabilities.mjs";
import { sourceTextRuntime } from "../packages/runner/local-task-runtime.mjs";
import { processSubscriptionTask } from "../packages/runner/subscription-coordinator.mjs";
import { createEvidence, registryHash } from "../packages/sources/evidence";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import {
  sourceTaskRunLimit,
  sourceTextInput,
} from "../convex/lib/privateSourceAnalysis";
import { syncKnowledge } from "../convex/knowledge";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const catalogue = normalizeSubscriptionCapabilities({
  data: [
    {
      model: "source-model",
      supportedReasoningEfforts: [{ reasoningEffort: "high" }],
    },
  ],
});
const point = {
  id: "base-one",
  title: "Review supplied evidence",
  claim: "Review exact source evidence.",
  interpretation: "Check the evidence first.",
  categories: ["general_advice"],
  topics: ["Evidence"],
  evidence: [
    { kind: "user_note", id: "supplied_text", startMs: null, endMs: null },
  ],
  confidence: "supported",
  verificationNeeds: [],
};
async function setup(typed = false) {
  vi.useFakeTimers();
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["source-owner"]');
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "true");
  vi.stubEnv("GITHUB_SOURCES_ENABLED", "true");
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject: "source-owner",
    name: "Synthetic owner",
    email: "source@example.test",
  });
  const fresh = () =>
    t.withIdentity({
      subject: "source-owner",
      auth_time: Math.floor(Date.now() / 1000),
    });
  const owner = fresh(),
    org = await owner.mutation(api.organizations.createPrivate, {});
  const source = await owner.mutation(api.product.capture, {
    organizationId: org,
    key: "private-source-fixture",
    kind: "text",
    title: "Owned text",
    text: "Review actual retained evidence before acting.",
    rightsAttested: true,
  });
  const profileBinding = "a".repeat(64),
    credentialHash = "b".repeat(64),
    now = Date.now();
  const device = await t.run(async (ctx) => {
    const row = (await ctx.db.get(source))!;
    await ctx.db.patch(source, {
      state: "ready",
      analysis: {
        schemaVersion: "1.0.0",
        sourceId: source,
        processingRunId: `${source}:${row.generation}`,
        coverage: "caption_only",
        summary: "Canonical summary",
        insights: [point],
        warnings: [],
      },
      coverage: "caption_only",
    });
    return ctx.db.insert("devices", {
      organizationId: org,
      owner: actor,
      name: "Synthetic runtime",
      fingerprint: "c".repeat(64),
      codeHash: "d".repeat(64),
      credentialHash,
      state: "paired",
      expiresAt: now + 4 * 3600000,
      capabilities: [],
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });
  if (typed) {
    const canonical = "https://github.com/example/owned",
      text = "Review actual retained evidence before acting.";
    const record = await createEvidence({
      kind: "github_file",
      repositoryId: 42,
      repository: "example/owned",
      commitSha: "e".repeat(40),
      path: "README.md",
      startLine: 1,
      endLine: 1,
      excerpt: text,
      canonicalUrl: `${canonical}/blob/${"e".repeat(40)}/README.md`,
      observedAt: now,
    });
    const contentHash = await registryHash([record]);
    await t.run(async (ctx) => {
      const s = (await ctx.db.get(source))!;
      const revision = await ctx.db.insert("sourceRevisions", {
        organizationId: org,
        sourceId: source,
        generation: s.generation,
        contentHash,
        state: "current",
        text,
        evidence: [record],
        revision: {
          schemaVersion: "1.0.0",
          sourceType: "github_repository",
          canonical,
          providerIdentity: `github:42:${"e".repeat(40)}`,
          contentHash,
          adapterVersion: "synthetic-source-v1",
          observedAt: now,
          rightsBasis: "synthetic_fixture_permission",
          coverage: {
            method: "selected_files",
            retrieved: 1,
            omitted: 0,
            omissions: [],
          },
        },
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(source, {
        sourceType: "github_repository",
        canonical,
        url: canonical,
        kind: "url",
        currentRevisionId: revision,
        analysis: {
          ...s.analysis,
          schemaVersion: "2.0.0",
          sourceRevisionId: revision,
          sourceContentHash: contentHash,
          coverage: "source_text",
          insights: [
            {
              ...point,
              evidence: [
                {
                  kind: record.kind,
                  id: record.id,
                  startMs: null,
                  endMs: null,
                },
              ],
            },
          ],
        },
        coverage: "source_text",
      });
    });
  }
  const dispatch = (operation: string, args: any = {}) =>
    t.mutation(internal.assistantLocal.operation, {
      credentialHash,
      operation,
      args,
    });
  const hello = (runtime: unknown = sourceTextRuntime) =>
    dispatch("hello", {
      profileBinding,
      expiresAt: Date.now() + 4 * 3600000,
      capabilities: catalogue,
      ...(runtime === null ? {} : { localTaskRuntime: runtime }),
    });
  const connected = await hello();
  const selection = {
    organizationId: org,
    workload: "source_reanalysis_text" as const,
    sourceId: source,
    deviceId: device,
    model: "source-model",
    effort: "high",
    key: "source-reanalysis-key-001",
    expectedPrivateVersion: 0,
    privateSourceBrief: "Explain practical uses for my private review.",
  };
  const approve = async (extra: Partial<typeof selection> = {}) => {
    const input = { ...selection, ...extra },
      q = await fresh().query(api.localLibraryTasks.quote, input);
    if (q.payload.schemaVersion !== "2.0.0")
      throw Error("Source fixture requires v2 quote");
    const approved = await fresh().mutation(api.localLibraryTasks.approve, {
      ...input,
      quoteHash: q.hash,
      quoteExpiresAt: q.expiresAt,
      useOwnPlan: true,
      maxInferenceCredits: 0,
    });
    return { ...approved, quote: { ...q, payload: q.payload } };
  };
  const claim = () =>
    dispatch("claim", {
      taskProtocolVersion: "2.0.0",
      localRuntimeHash: connected.localRuntimeHash,
      preferTasks: true,
    });
  const context = (job: any) =>
    t.action(internal.assistantLocalActions.taskContext, {
      credentialHash,
      args: ref(job),
    });
  const output = (job: any, input: any) => ({
    schemaVersion: input.sourceRevisionId ? "2.0.0" : "1.0.0",
    sourceId: source,
    processingRunId: job.runId,
    coverage: input.expectedCoverage,
    summary: "Private interpretation",
    warnings: [],
    insights: [
      {
        ...point,
        id: "private-one",
        evidence: input.evidence.map((e: any) => ({
          kind: e.kind,
          id: e.id,
          startMs: null,
          endMs: null,
        })),
      },
    ],
    ...(input.sourceRevisionId
      ? {
          sourceRevisionId: input.sourceRevisionId,
          sourceContentHash: input.sourceContentHash,
        }
      : {}),
  });
  return {
    t,
    actor,
    owner,
    fresh,
    org,
    source,
    device,
    dispatch,
    hello,
    connected,
    selection,
    approve,
    claim,
    context,
    output,
  };
}
function ref(job: any) {
  return {
    runId: job.runId,
    leaseGeneration: job.leaseGeneration,
    leaseToken: job.leaseToken,
  };
}
async function complete(s: Awaited<ReturnType<typeof setup>>) {
  const { job } = await s.claim(),
    input = await s.context(job),
    output = s.output(job, input);
  await s.dispatch("task_finish", {
    ...ref(job),
    outputJson: JSON.stringify(output),
  });
  return { job, input, output };
}
it("runs text-only v2 work through the existing official processor without changing canonical source identity", async () => {
  const s = await setup(),
    before = await s.t.run((ctx) => ctx.db.get(s.source));
  const approved = await s.approve();
  expect(approved.quote.payload.sourceReanalysisBinding).not.toHaveProperty(
    "inputHash",
  );
  const { job } = await s.claim();
  expect(job).toMatchObject({
    taskProtocolVersion: "2.0.0",
    workload: "source_reanalysis_text",
    repositories: [],
  });
  const client = {
    session: {
      profileBinding: "a".repeat(64),
      expiresAt: Date.now() + 4 * 3600000,
    },
    check: vi.fn(async () => {}),
    capabilities: vi.fn(async () => catalogue),
    structured: vi.fn(async (_schema: any, input: any) => ({
      output: s.output(job, input),
    })),
  };
  const request = (operation: string, args: any) =>
    operation === "task_context" ? s.context(job) : s.dispatch(operation, args);
  expect(await processSubscriptionTask(job, { client, request })).toEqual({
    completed: true,
    privateVersion: 1,
  });
  expect(client.structured.mock.calls[0][1]).toMatchObject({
    processingRunId: job.runId,
    privateSourceBrief: s.selection.privateSourceBrief,
    expectedCoverage: "caption_only",
  });
  const after = (await s.t.run((ctx) => ctx.db.get(s.source)))!;
  for (const key of [
    "generation",
    "updatedAt",
    "state",
    "analysis",
    "summary",
    "searchable",
    "tags",
  ] as const)
    expect(after[key]).toEqual(before?.[key]);
  expect(after.privateSourceAnalysis).not.toHaveProperty("outputJson");
  const stored = (await s.t.run((ctx) => ctx.db.get(approved.runId)))!;
  expect(stored.sourceTaskResult?.outputJson).toBe(
    canonicalJson(JSON.parse(stored.sourceTaskResult!.outputJson)),
  );
  expect(
    await s.t.run((ctx) => ctx.db.query("knowledgeMembers").collect()),
  ).toEqual([]);
  expect(
    await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect()),
  ).toEqual([]);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
    }),
  ).toMatchObject({ available: true, version: 1 });
});
it("requires separate runtime admission, leaves v2 queued for old claims and clears admission on old hello", async () => {
  const s = await setup();
  await s.hello(null);
  await expect(s.approve()).rejects.toThrow("SETUP_REQUIRED");
  await s.hello();
  const approved = await s.approve();
  expect(
    (
      await s.dispatch("claim", {
        taskProtocolVersion: "1.0.0",
        preferTasks: true,
      })
    ).job,
  ).toBeNull();
  expect((await s.t.run((ctx) => ctx.db.get(approved.runId)))?.state).toBe(
    "queued",
  );
  await expect(
    s.dispatch("claim", {
      taskProtocolVersion: "2.0.0",
      localRuntimeHash: "f".repeat(64),
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  const { job } = await s.claim();
  await s.hello(null);
  await expect(s.dispatch("task_heartbeat", ref(job))).rejects.toThrow(
    "APPROVAL_STALE",
  );
});
it("preserves a previous result during new pending/unknown work and prevents new-key or cross-device bypass", async () => {
  const s = await setup();
  await s.approve();
  const first = await complete(s);
  const next = await s.approve({
    key: "source-reanalysis-key-002",
    expectedPrivateVersion: 1,
    privateSourceBrief: "A different private goal.",
  });
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
    }),
  ).toMatchObject({ available: true, version: 1 });
  const otherDevice = await s.t.run(async (ctx) => {
    const { _id, _creationTime, ...d } = (await ctx.db.get(s.device))!;
    void [_id, _creationTime];
    return ctx.db.insert("devices", { ...d, credentialHash: "f".repeat(64) });
  });
  await expect(
    s.approve({
      key: "source-reanalysis-key-003",
      expectedPrivateVersion: 1,
      deviceId: otherDevice,
    }),
  ).rejects.toThrow("SOURCE_BUSY");
  const { job } = await s.claim();
  expect(job.runId).toBe(next.runId);
  await s.dispatch("task_fail", ref(job));
  await expect(
    s.approve({ key: "source-reanalysis-key-004", expectedPrivateVersion: 1 }),
  ).rejects.toThrow("SOURCE_BUSY");
  expect((await s.claim()).reconcileTask).toBe(true);
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
      runId: first.job.runId,
    }),
  ).toMatchObject({ available: true, version: 1 });
  vi.setSystemTime(Date.now() + 1800001);
  await s.fresh().mutation(api.localLibraryTasks.reconcile, {
    runId: job.runId,
    acknowledgeUnknownUsage: true,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.source)))?.privateSourceAnalysisRunId,
  ).toBeUndefined();
  expect(
    await s.t.run((ctx) => ctx.db.query("localLibraryRuns").collect()),
  ).toHaveLength(2);
});
it.each([
  "media coverage",
  "forged frame",
  "empty citations",
  "wrong run",
  "unknown property",
])("rejects private output with %s", async (kind) => {
  const s = await setup();
  await s.approve();
  const { job } = await s.claim(),
    input = await s.context(job),
    output: any = s.output(job, input);
  if (kind === "media coverage") output.coverage = "full_sampled";
  if (kind === "forged frame")
    output.insights[0].evidence = [
      { kind: "frame", id: "invented", startMs: 0, endMs: 0 },
    ];
  if (kind === "empty citations") output.insights[0].evidence = [];
  if (kind === "wrong run") output.processingRunId = "invented-run";
  if (kind === "unknown property") output.toolApproval = true;
  await expect(
    s.dispatch("task_finish", {
      ...ref(job),
      outputJson: JSON.stringify(output),
    }),
  ).rejects.toThrow();
  expect(
    (await s.t.run((ctx) => ctx.db.get(job.runId as Id<"localLibraryRuns">)))
      ?.sourceTaskResult,
  ).toBeUndefined();
});
it("supports retained citations and preserves earned reads when capture/runtime eligibility is paused", async () => {
  const s = await setup(true);
  await s.approve();
  const result = await complete(s);
  expect(result.input.expectedCoverage).toBe("source_text");
  expect(result.output.schemaVersion).toBe("2.0.0");
  vi.stubEnv("DISABLE_CAPTURE", "true");
  vi.stubEnv("DISABLE_PERSONAL_ANALYSIS", "true");
  await s.hello(null).catch(() => {});
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
    }),
  ).toMatchObject({ available: true, version: 1 });
  await s.t.run((ctx) => ctx.db.patch(s.source, { rightsAttested: false }));
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
    }),
  ).toMatchObject({ available: false, output: null });
});
it("stores worst-case escaped output only once within the 320KiB run bound", async () => {
  const s = await setup();
  await s.approve({ privateSourceBrief: "\\".repeat(4000) });
  const { job } = await s.claim(),
    input = await s.context(job),
    output = s.output(job, input);
  output.insights = Array.from({ length: 20 }, (_, i) => ({
    ...output.insights[0],
    id: `private-${i}`,
    claim: "\\".repeat(1900),
    interpretation: '"'.repeat(700),
  }));
  expect(new TextEncoder().encode(canonicalJson(output)).length).toBeLessThan(
    120000,
  );
  await s.dispatch("task_finish", {
    ...ref(job),
    outputJson: JSON.stringify(output),
  });
  const run = (await s.t.run((ctx) =>
    ctx.db.get(job.runId as Id<"localLibraryRuns">),
  ))!;
  const size = new TextEncoder().encode(canonicalJson(run)).length;
  expect(size).toBeGreaterThan(192 * 1024);
  expect(size).toBeLessThanOrEqual(sourceTaskRunLimit);
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.source)))?.privateSourceAnalysis,
  ).not.toHaveProperty("outputJson");
});
it("keeps output and private context out of ordinary source projections and exports only rights-current results", async () => {
  const s = await setup();
  await s.approve();
  const { job } = await complete(s);
  const library = await s.owner.query(api.product.library, {
    organizationId: s.org,
  });
  expect(JSON.stringify(library)).not.toContain("privateSourceAnalysis");
  expect(JSON.stringify(library)).not.toContain("Private interpretation");
  const detail = await s.owner.query(api.product.detail, { id: s.source });
  expect(detail.privateSourceEligibility?.currentPrivateVersion).toBe(1);
  expect(detail.privateSourceAnalysis).toBeUndefined();
  const exported = await s.owner.query(api.jobs.exportPage, {
    organizationId: s.org,
    section: "localLibraryRuns",
    cursor: null,
    asOf: Date.now(),
  });
  expect(JSON.stringify(exported)).toContain("Private interpretation");
  expect(JSON.stringify(exported)).not.toContain(job.leaseToken);
  await s.t.run((ctx) => ctx.db.patch(s.source, { rightsAttested: false }));
  const fenced = await s.owner.query(api.jobs.exportPage, {
    organizationId: s.org,
    section: "localLibraryRuns",
    cursor: null,
    asOf: Date.now(),
  });
  expect(JSON.stringify(fenced)).not.toContain("Private interpretation");
});
it("quarantines ordinary supplied-text pointers before recovery's early return and clears run output", async () => {
  const s = await setup();
  await s.approve();
  const { job } = await complete(s);
  vi.stubEnv("RESTORE_LOCK", "true");
  for (const section of ["sources", "localLibraryRuns"] as const)
    await s.t.mutation(internal.recovery.quarantinePage, {
      section,
      cursor: null,
    });
  const source = (await s.t.run((ctx) => ctx.db.get(s.source)))!,
    run = (await s.t.run((ctx) =>
      ctx.db.get(job.runId as Id<"localLibraryRuns">),
    ))!;
  expect(source.analysis).toBeDefined();
  expect(source.privateSourceAnalysis).toBeUndefined();
  expect(run.task).toBeUndefined();
  expect(run.sourceTaskResult).toBeUndefined();
  vi.stubEnv("RESTORE_LOCK", "false");
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
      runId: job.runId,
    }),
  ).toMatchObject({ available: false });
});
it("uses exact source-indexed five-row cleanup and leaves unrelated/new-generation results untouched", async () => {
  const s = await setup();
  await s.approve();
  const { job } = await complete(s);
  const rows = await s.t.run(async (ctx) => {
    const { _id, _creationTime, ...run } = (await ctx.db.get(
      job.runId as Id<"localLibraryRuns">,
    ))!;
    void [_id, _creationTime];
    if (run.task?.schemaVersion !== "2.0.0")
      throw Error("Expected source task");
    const task = run.task,
      ids = [];
    for (let i = 0; i < 5; i++)
      ids.push(
        await ctx.db.insert("localLibraryRuns", {
          ...run,
          task: { ...task, key: `history-${i}` },
        }),
      );
    const {
      _id: _sourceId,
      _creationTime: _sourceTime,
      ...source
    } = (await ctx.db.get(s.source))!;
    void [_sourceId, _sourceTime];
    const otherSource = await ctx.db.insert("sources", {
      ...source,
      canonical: `${source.canonical}:unrelated`,
      key: "unrelated-source",
    });
    const unrelated = await ctx.db.insert("localLibraryRuns", {
      ...run,
      task: {
        ...task,
        key: "unrelated",
        sourceReanalysisBinding: {
          ...task.sourceReanalysisBinding,
          sourceId: otherSource,
        },
      },
    });
    const newer = await ctx.db.insert("localLibraryRuns", {
      ...run,
      task: {
        ...task,
        key: "newer",
        sourceReanalysisBinding: {
          ...task.sourceReanalysisBinding,
          generation: task.sourceReanalysisBinding.generation + 1,
        },
      },
    });
    return {
      ids,
      unrelated,
      newer,
      generation: task.sourceReanalysisBinding.generation,
    };
  });
  const page = await s.t.mutation(internal.privateSourceAnalysis.scrub, {
    organizationId: s.org,
    sourceId: s.source,
    maxGeneration: rows.generation,
    cursor: null,
  });
  expect(page.isDone).toBe(false);
  const remaining = await s.t.run(async (ctx) =>
    (await ctx.db.query("localLibraryRuns").collect()).filter(
      (run) => run.sourceTaskResult,
    ),
  );
  expect(remaining).toHaveLength(3);
  await s.t.mutation(internal.privateSourceAnalysis.scrub, {
    organizationId: s.org,
    sourceId: s.source,
    maxGeneration: rows.generation,
    cursor: page.continueCursor,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(rows.unrelated)))?.sourceTaskResult,
  ).toBeDefined();
  expect(
    (await s.t.run((ctx) => ctx.db.get(rows.newer)))?.sourceTaskResult,
  ).toBeDefined();
});
it("requires real text within the full input bound and rejects import/media flags before execution", async () => {
  const s = await setup();
  for (const flags of [
    { personalMedia: {} },
    { publicImportId: s.source as unknown as Id<"publicImports"> },
    { objectKey: "not-permitted" },
  ]) {
    await expect(
      s.t.run(async (ctx) =>
        sourceTextInput(
          ctx,
          { ...(await ctx.db.get(s.source))!, ...flags },
          s.actor,
          "source-model",
          "high",
          undefined,
          0,
        ),
      ),
    ).rejects.toThrow("SOURCE_UNAVAILABLE");
  }
  await s.t.run((ctx) => ctx.db.patch(s.source, { text: "\\".repeat(30000) }));
  await expect(s.approve()).rejects.toThrow("complete private model request");
  expect(
    await s.t.run((ctx) => ctx.db.query("localLibraryRuns").collect()),
  ).toEqual([]);
});
it("fences quote swaps and source changes during a lease without touching the previous base", async () => {
  const s = await setup(),
    quote = await s.owner.query(api.localLibraryTasks.quote, s.selection);
  await expect(
    s.owner.mutation(api.localLibraryTasks.approve, {
      ...s.selection,
      privateSourceBrief: "Changed after quote",
      quoteHash: quote.hash,
      quoteExpiresAt: quote.expiresAt,
      useOwnPlan: true,
      maxInferenceCredits: 0,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.approve();
  const { job } = await s.claim(),
    input = await s.context(job);
  await s.t.run((ctx) =>
    ctx.db.patch(s.source, { text: "Changed source bytes after approval" }),
  );
  await expect(s.dispatch("task_heartbeat", ref(job))).rejects.toThrow(
    "APPROVAL_STALE",
  );
  await expect(
    s.dispatch("task_finish", {
      ...ref(job),
      outputJson: JSON.stringify(s.output(job, input)),
    }),
  ).rejects.toThrow("APPROVAL_STALE");
});
it("keeps earned supplied-text output when raw bytes are pruned, but refuses another inference", async () => {
  const s = await setup();
  await s.approve();
  const { job } = await complete(s);
  await s.t.run((ctx) => ctx.db.patch(s.source, { text: undefined }));
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
      runId: job.runId,
    }),
  ).toMatchObject({ available: true, version: 1 });
  await expect(
    s.approve({ key: "source-after-pruning-001", expectedPrivateVersion: 1 }),
  ).rejects.toThrow("INVALID_INPUT");
});
it("rejects foreign membership, result tampering and ignored operation fields", async () => {
  const s = await setup();
  await s.approve();
  const { job } = await s.claim();
  await expect(
    s.dispatch("task_heartbeat", { ...ref(job), silentlyIgnored: true }),
  ).rejects.toThrow("INVALID_INPUT");
  const input = await s.context(job);
  await s.dispatch("task_finish", {
    ...ref(job),
    outputJson: JSON.stringify(s.output(job, input)),
  });
  const other = await s.t.mutation(internal.accounts.syncUser, {
    subject: "foreign-reader",
    name: "Foreign",
    email: "foreign@example.test",
  });
  await s.t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId: s.org,
      userId: other,
      role: "owner",
    }),
  );
  await expect(
    s.t
      .withIdentity({ subject: "foreign-reader" })
      .query(api.privateSourceAnalysis.detail, { sourceId: s.source }),
  ).rejects.toThrow();
  await s.t.run(async (ctx) => {
    const run = (await ctx.db.get(job.runId as Id<"localLibraryRuns">))!;
    await ctx.db.patch(run._id, {
      sourceTaskResult: { ...run.sourceTaskResult!, outputJson: "{}" },
    });
  });
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
    }),
  ).toMatchObject({ available: false });
});
it("withdraws provider-expired results through the actual retention callback and indexed scrub", async () => {
  const s = await setup(true),
    deadline = Date.now() + 60000;
  const revisionId = await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.source))!,
      revision = (await ctx.db.get(source.currentRevisionId!))!;
    await ctx.db.patch(revision._id, {
      revision: {
        ...revision.revision,
        retention: {
          retainUntil: deadline,
          deletionWithinMs: 1000,
          policyEvidenceId: "synthetic-policy",
        },
      },
    });
    await ctx.db.patch(source._id, { sourceRetentionUntil: deadline });
    return revision._id;
  });
  await s.approve();
  const { job } = await complete(s);
  vi.setSystemTime(deadline + 1);
  expect(
    await s
      .fresh()
      .query(api.privateSourceAnalysis.detail, { sourceId: s.source }),
  ).toMatchObject({ available: false });
  expect(
    await s.t.mutation(internal.sourceAcquisition.expire, { revisionId }),
  ).toMatchObject({ expired: true });
  const run = (await s.t.run((ctx) =>
    ctx.db.get(job.runId as Id<"localLibraryRuns">),
  ))!;
  if (run.task?.schemaVersion !== "2.0.0")
    throw Error("Source fixture requires v2 task");
  await s.t.mutation(internal.privateSourceAnalysis.scrub, {
    organizationId: s.org,
    sourceId: s.source,
    maxGeneration: run.task.sourceReanalysisBinding.generation,
    cursor: null,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(job.runId as Id<"localLibraryRuns">)))
      ?.sourceTaskResult,
  ).toBeUndefined();
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.source)))?.privateSourceAnalysis,
  ).toBeUndefined();
});
it("preserves retained results after raw-only pruning and compares actual retained rights metadata", async () => {
  const s = await setup(true);
  await s.approve();
  await complete(s);
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.source))!;
    await ctx.db.patch(source.currentRevisionId!, { evidence: [], text: "" });
    await ctx.db.patch(source._id, { text: undefined });
  });
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
    }),
  ).toMatchObject({ available: true });
  await expect(
    s.approve({ key: "raw-pruned-01", expectedPrivateVersion: 1 }),
  ).rejects.toThrow();
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.source))!,
      revision = (await ctx.db.get(source.currentRevisionId!))!;
    await ctx.db.patch(revision._id, {
      revision: {
        ...revision.revision,
        rightsBasis: "withdrawn-original-basis",
      },
    });
  });
  expect(
    await s.owner.query(api.privateSourceAnalysis.detail, {
      sourceId: s.source,
    }),
  ).toMatchObject({ available: false });
});
it("schedules indexed private cleanup during actual fresh-rights recovery", async () => {
  const s = await setup(true);
  await s.approve();
  const { job } = await complete(s);
  await s.t.run((ctx) => ctx.db.patch(s.source, { rightsAttested: false }));
  const before = (await s.t.run((ctx) => ctx.db.get(s.source)))!;
  await s.owner.mutation(api.sourceAcquisition.prepare, {
    id: s.source,
    key: "fresh-rights-recovery-001",
    rightsBasis: "synthetic-renewed-permission",
    rightsAttested: true,
    expectedGeneration: before.generation,
    expectedRevision: before.updatedAt,
  });
  const fresh = (await s.t.run((ctx) => ctx.db.get(s.source)))!;
  expect(fresh.privateSourceAnalysis).toBeUndefined();
  expect(fresh.privateSourceAnalysisRunId).toBeUndefined();
  const scheduled = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  const cleanup = scheduled.find((row) =>
    row.name.endsWith("privateSourceAnalysis:scrub"),
  );
  expect(cleanup?.args).toMatchObject([
    { sourceId: s.source, maxGeneration: before.generation },
  ]);
  await s.t.mutation(internal.privateSourceAnalysis.scrub, {
    organizationId: s.org,
    sourceId: s.source,
    maxGeneration: before.generation,
    cursor: null,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(job.runId as Id<"localLibraryRuns">)))
      ?.sourceTaskResult,
  ).toBeUndefined();
});
it("expires superseded provider results without mutating a newer source", async () => {
  const s = await setup(true),
    deadline = Date.now() + 60000;
  const old = await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.source))!,
      revision = (await ctx.db.get(source.currentRevisionId!))!;
    await ctx.db.patch(revision._id, {
      revision: {
        ...revision.revision,
        retention: {
          retainUntil: deadline,
          deletionWithinMs: 1000,
          policyEvidenceId: "synthetic-old-policy",
        },
      },
    });
    await ctx.db.patch(source._id, { sourceRetentionUntil: deadline });
    return { revisionId: revision._id, generation: source.generation };
  });
  await s.approve();
  const { job } = await complete(s);
  const replaced = await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.source))!;
    await ctx.db.patch(old.revisionId, { state: "superseded" });
    await ctx.db.patch(source._id, {
      currentRevisionId: undefined,
      generation: source.generation + 1,
      updatedAt: source.updatedAt + 1,
      privateSourceAnalysis: undefined,
    });
    return ctx.db.get(source._id);
  });
  vi.setSystemTime(deadline + 1);
  await s.t.mutation(internal.sourceAcquisition.expire, {
    revisionId: old.revisionId,
  });
  expect(await s.t.run((ctx) => ctx.db.get(s.source))).toEqual(replaced);
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    jobs.some(
      (row) =>
        row.name.endsWith("privateSourceAnalysis:scrub") &&
        (row.args[0] as { maxGeneration?: number }).maxGeneration ===
          old.generation,
    ),
  ).toBe(true);
  await s.t.mutation(internal.privateSourceAnalysis.scrub, {
    organizationId: s.org,
    sourceId: s.source,
    maxGeneration: old.generation,
    cursor: null,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(job.runId as Id<"localLibraryRuns">)))
      ?.sourceTaskResult,
  ).toBeUndefined();
});
it("keeps privacy cleanup retryable under restore lock", async () => {
  const s = await setup();
  await s.approve();
  const { job } = await complete(s);
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    await s.t.mutation(internal.privateSourceAnalysis.scrub, {
      organizationId: s.org,
      sourceId: s.source,
      cursor: null,
    }),
  ).toMatchObject({ paused: true });
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    jobs.some(
      (row) =>
        row.name.endsWith("privateSourceAnalysis:scrub") &&
        row.scheduledTime >= Date.now() + 60000,
    ),
  ).toBe(true);
  vi.stubEnv("RESTORE_LOCK", "false");
  await s.t.mutation(internal.privateSourceAnalysis.scrub, {
    organizationId: s.org,
    sourceId: s.source,
    cursor: null,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(job.runId as Id<"localLibraryRuns">)))
      ?.sourceTaskResult,
  ).toBeUndefined();
});
it("lets old workers claim a later v1 project behind six queued v2 jobs and fences expired active source leases", async () => {
  const s = await setup();
  for (let i = 0; i < 6; i++) {
    const sourceId =
      i === 0
        ? s.source
        : await s.t.run(async (ctx) => {
            const { _id, _creationTime, ...source } = (await ctx.db.get(
              s.source,
            ))!;
            void [_id, _creationTime];
            const id = await ctx.db.insert("sources", {
              ...source,
              key: `queued-source-${i}`,
              canonical: `${source.canonical}:queued-${i}`,
              privateSourceAnalysis: undefined,
              privateSourceAnalysisRunId: undefined,
            });
            await ctx.db.patch(id, {
              analysis: { ...source.analysis, sourceId: id },
            });
            return id;
          });
    await s.approve({ sourceId, key: `source-queue-fairness-${i}` });
  }
  const repo = await s.t.run(async (ctx) => {
    await syncKnowledge(ctx, (await ctx.db.get(s.source))!, { enqueue: false });
    return ctx.db.insert("repositories", {
      organizationId: s.org,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      installationId: 1,
      providerId: 1,
      fullName: "example/owned",
      sha: "e".repeat(40),
      branch: "main",
      enabled: true,
      confirmed: true,
      profile: "Review exact evidence",
      profileVersion: 1,
      status: "connected",
      manifest: ["README.md"],
      context: "Owned documentation",
      contextExcerpts: [
        {
          path: "README.md",
          blobSha: "f".repeat(40),
          startLine: 1,
          endLine: 1,
          content: "Owned documentation",
        },
      ],
    });
  });
  const selection = {
    organizationId: s.org,
    workload: "project_evaluation" as const,
    sourceId: s.source,
    repositoryIds: [repo],
    deviceId: s.device,
    model: "source-model",
    effort: "high",
    key: "legacy-queue-fairness-001",
  };
  const quote = await s.owner.query(api.localLibraryTasks.quote, selection);
  const legacy = await s.owner.mutation(api.localLibraryTasks.approve, {
    ...selection,
    quoteHash: quote.hash,
    quoteExpiresAt: quote.expiresAt,
    useOwnPlan: true,
    maxInferenceCredits: 0,
  });
  const oldClaim = await s.dispatch("claim", {
    taskProtocolVersion: "1.0.0",
    preferTasks: true,
  });
  expect(oldClaim.job).toMatchObject({
    taskProtocolVersion: "1.0.0",
    runId: legacy.runId,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.query("localLibraryRuns").collect())).filter(
      (run) => run.task?.schemaVersion === "2.0.0" && run.state === "queued",
    ),
  ).toHaveLength(6);
  await s.owner.mutation(api.localLibraryTasks.cancel, { runId: legacy.runId });
  const s2 = await setup();
  await s2.approve();
  const { job } = await s2.claim();
  vi.setSystemTime(Date.now() + 40001);
  expect(
    await s2.dispatch("claim", {
      taskProtocolVersion: "1.0.0",
      preferTasks: true,
    }),
  ).toMatchObject({ reconcileTask: true });
  expect(
    (await s2.t.run((ctx) => ctx.db.get(job.runId as Id<"localLibraryRuns">)))
      ?.state,
  ).toBe("unknown");
});
it("acknowledges only the exact completed approval when replaying its receipt", async () => {
  const s = await setup(),
    approved = await s.approve();
  await complete(s);
  const receipt = {
    ...s.selection,
    quoteHash: approved.quote.hash,
    quoteExpiresAt: approved.quote.expiresAt,
    useOwnPlan: true as const,
    maxInferenceCredits: 0 as const,
  };
  expect(
    await s.owner.mutation(api.localLibraryTasks.approve, receipt),
  ).toEqual({ runId: approved.runId, cached: true });
  await expect(
    s.owner.mutation(api.localLibraryTasks.approve, {
      ...receipt,
      privateSourceBrief: "A changed request cannot reuse this receipt",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(
    await s.t.run((ctx) => ctx.db.query("localLibraryRuns").collect()),
  ).toHaveLength(1);
});
