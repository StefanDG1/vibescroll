import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { normalizeSubscriptionCapabilities } from "../packages/runner/subscription-capabilities.mjs";
import {
  sourceTextRuntime,
  projectVariantRuntime,
  projectApplyRuntime,
} from "../packages/runner/local-task-runtime.mjs";
import { processSubscriptionTask } from "../packages/runner/subscription-coordinator.mjs";
import { createEvidence, registryHash } from "../packages/sources/evidence";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { evaluationCurrent } from "../convex/knowledge";
import { resolvePrivateVariant } from "../convex/lib/privateProjectVariant";
const modules = import.meta.glob("../convex/**/*.ts");
it("v4 grouped project proposals preserve actual private references and keep default history neutral", async () => {
  const f = await fixture(),
    connected = await f.hello(projectApplyRuntime);
  const approved = await f.variantApprove({ includeSourceContent: false });
  expect(approved.quote.payload.schemaVersion).toBe("4.0.0");
  const { job } = await f.dispatch("claim", {
    taskProtocolVersion: "4.0.0",
    localRuntimeHash: connected.localRuntimeHash,
    preferTasks: true,
  });
  const context = await f.dispatch("task_context_prepare", {
    ...ref(job),
    repositoryId: f.repo,
  });
  expect(context.application.sources).toEqual([]);
  await f.dispatch("task_record_evaluation_inspection", {
    ...ref(job),
    id: context.id,
    inspected: [],
  });
  const first = {
    disposition: "no_fit",
    title: "First private opportunity",
    rationale: "Review private evidence",
    problem: "No proved issue",
    approach: "Keep current behavior",
    acceptance: ["Review evidence"],
    tests: ["Inspect fixture"],
    risks: [],
    alternatives: [],
    questions: [],
    references: context.evidence.map((e: any) => e.reference),
    repositoryEvidence: [],
  };
  const forged = {
    ...first,
    references: first.references.map(
      ({
        schemaVersion: _s,
        runId: _r,
        privateVersion: _v,
        outputHash: _h,
        ...r
      }: any) => r,
    ),
  };
  await expect(
    f.dispatch("task_evaluation_finish", {
      ...ref(job),
      id: context.id,
      output: {
        schemaVersion: "project-opportunity-group-v1",
        opportunities: [forged],
      },
    }),
  ).rejects.toThrow("INVALID_EVIDENCE");
  await f.dispatch("task_evaluation_finish", {
    ...ref(job),
    id: context.id,
    output: {
      schemaVersion: "project-opportunity-group-v1",
      opportunities: [
        first,
        {
          ...first,
          title: "Second private opportunity",
          problem: "Different issue",
        },
      ],
    },
  });
  const done = await f.dispatch("task_finish", {
    ...ref(job),
    evaluationIds: [context.id],
  });
  expect(done.proposalIds).toHaveLength(2);
  for (const id of done.proposalIds) {
    const p = (await f.t.run((ctx) => ctx.db.get(id as Id<"proposals">)))!;
    expect(p.references?.[0]).toMatchObject({
      schemaVersion: "private-source-reference-v1",
      runId: f.privateVariantSelection.runId,
      insightId: "private-one",
    });
    expect(p.privateEvaluationOrigin?.kind).toBe("private_source_variant");
  }
  expect(
    (
      await f.owner.query(api.localLibraryTasks.resume, {
        organizationId: f.org,
        sourceId: f.source,
        cursor: null,
      })
    ).items,
  ).toEqual([]);
  expect(
    (
      await f.owner.query(api.localLibraryTasks.resume, {
        organizationId: f.org,
        sourceId: f.source,
        cursor: null,
        privateVariantSelection: f.privateVariantSelection,
      })
    ).items,
  ).toMatchObject([{ id: job.runId }]);
});
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

async function fixture(typed = false) {
  const s = await setup(typed);
  if (typed)
    await s.t.run(async (ctx) => {
      const source = (await ctx.db.get(s.source))!,
        revision = (await ctx.db.get(source.currentRevisionId!))!,
        deadline = Date.now() + 60000;
      await ctx.db.patch(revision._id, {
        revision: {
          ...revision.revision,
          retention: {
            retainUntil: deadline,
            deletionWithinMs: 1000,
            policyEvidenceId: "private-variant-retention-fixture",
          },
        },
      });
      await ctx.db.patch(source._id, { sourceRetentionUntil: deadline });
    });
  await s.approve();
  const earned = await complete(s);
  const row = (await s.t.run((ctx) =>
    ctx.db.get(earned.job.runId as Id<"localLibraryRuns">),
  ))!;
  const connected = await s.hello(projectVariantRuntime);
  const repo = await s.t.run((ctx) =>
    ctx.db.insert("repositories", {
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
      manifestEntries: [
        {
          path: "README.md",
          blobSha: "f".repeat(40),
          size: 19,
          mode: "100644",
        },
      ],
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
    }),
  );
  const privateVariantSelection = {
    schemaVersion: "private-source-variant-v1" as const,
    runId: row._id,
    version: row.sourceTaskResult!.version,
    outputHash: row.sourceTaskResult!.outputHash,
    insightIds: ["private-one"],
  };
  const selection = {
    organizationId: s.org,
    workload: "project_evaluation" as const,
    sourceId: s.source,
    repositoryIds: [repo],
    deviceId: s.device,
    model: "source-model",
    effort: "high",
    key: "private-project-key-001",
    privateVariantSelection,
  };
  async function approve(extra: Record<string, unknown> = {}) {
    const a = { ...selection, ...extra };
    const quote = await s.fresh().query(api.localLibraryTasks.quote, a);
    const approved = await s.fresh().mutation(api.localLibraryTasks.approve, {
      ...a,
      quoteHash: quote.hash,
      quoteExpiresAt: quote.expiresAt,
      useOwnPlan: true,
      maxInferenceCredits: 0,
    });
    return { ...approved, quote };
  }
  const claim = () =>
    s.dispatch("claim", {
      taskProtocolVersion: "3.0.0",
      localRuntimeHash: connected.localRuntimeHash,
      preferTasks: true,
    });
  async function prepare() {
    const a = await approve();
    const { job } = await claim();
    const bundle = await s.dispatch("task_context_prepare", {
      ...ref(job),
      repositoryId: repo,
    });
    return { ...a, job, bundle };
  }
  async function finish(disposition = "no_fit") {
    const p = await prepare();
    await s.dispatch("task_record_evaluation_inspection", {
      ...ref(p.job),
      id: p.bundle.id,
      inspected: [{ path: "README.md", startLine: 1, endLine: 1 }],
    });
    const output = {
      disposition,
      title: "Honest private no fit",
      rationale:
        "The selected private interpretation does not justify a change.",
      problem: "No proved problem",
      approach: "Retain current behavior",
      acceptance: ["Review exact cited evidence"],
      tests: ["Review fixture"],
      risks: [],
      alternatives: [],
      questions: [],
      references: p.bundle.evidence.map((e: any) => e.reference),
      repositoryEvidence: [],
    };
    await s.dispatch("task_evaluation_finish", {
      ...ref(p.job),
      id: p.bundle.id,
      output,
    });
    const result = await s.dispatch("task_finish", {
      ...ref(p.job),
      evaluationIds: [p.bundle.id],
    });
    return { ...p, result, output };
  }
  return {
    ...s,
    earned,
    repo,
    privateVariantSelection,
    variantSelection: selection,
    variantApprove: approve,
    variantClaim: claim,
    variantPrepare: prepare,
    variantFinish: finish,
  };
}
it("evaluates actual earned private IDs without canonical membership/topic or source mutations", async () => {
  const f = await fixture(),
    before = await f.t.run((ctx) => ctx.db.get(f.source));
  const done = await f.variantFinish();
  expect(done.result.accepted).toBe(true);
  const evaluation = (await f.t.run((ctx) =>
    ctx.db.get(done.bundle.id as Id<"knowledgeEvaluations">),
  ))!;
  expect(evaluation.topicId).toBeUndefined();
  expect(evaluation.topicVersion).toBeUndefined();
  expect(evaluation.references[0]).toMatchObject({
    insightId: "private-one",
    runId: f.privateVariantSelection.runId,
    schemaVersion: "private-source-reference-v1",
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("knowledgeMembers").collect()),
  ).toEqual([]);
  expect(await f.t.run((ctx) => ctx.db.get(f.source))).toEqual(before);
  expect(await f.t.run((ctx) => evaluationCurrent(ctx, evaluation))).toBe(true);
  const proposals = await f.t.run((ctx) => ctx.db.query("proposals").collect());
  expect(proposals[0].disposition).toBe("no_fit");
  expect(proposals[0].privateEvaluationOrigin).toMatchObject({
    kind: "private_source_variant",
    briefHash: null,
  });
});
it("requires v3 runtime admission and excludes private tasks from v1/v2 claim paths", async () => {
  const f = await fixture();
  await f.variantApprove();
  for (const version of ["1.0.0", "2.0.0"]) {
    const hello = await f.hello(sourceTextRuntime);
    const old = await f.dispatch("claim", {
      taskProtocolVersion: version,
      localRuntimeHash: hello.localRuntimeHash,
      preferTasks: true,
    });
    expect(old.job).toBeNull();
  }
  await expect(
    f.variantApprove({ key: "private-project-old-002" }),
  ).rejects.toThrow("SETUP_REQUIRED");
});
it.each(["hash", "version", "ids", "brief"])(
  "rejects private variant %s substitutions before granting work",
  async (kind) => {
    const f = await fixture();
    const selected = { ...f.privateVariantSelection };
    if (kind === "hash") selected.outputHash = "f".repeat(64);
    if (kind === "version") selected.version++;
    if (kind === "ids") selected.insightIds = ["base-one"];
    await expect(
      f.variantApprove(
        kind === "brief"
          ? { privateEvaluationBrief: "Mixing context is not authorized" }
          : { privateVariantSelection: selected },
      ),
    ).rejects.toThrow();
  },
);
it("fences canonical reference substitution and source changes during a lease", async () => {
  const f = await fixture(),
    p = await f.variantPrepare();
  await f.dispatch("task_record_evaluation_inspection", {
    ...ref(p.job),
    id: p.bundle.id,
    inspected: [],
  });
  await f.t.run(async (ctx) => {
    const source = (await ctx.db.get(f.source))!;
    await ctx.db.patch(source._id, { updatedAt: source.updatedAt + 1 });
  });
  await expect(f.dispatch("task_heartbeat", ref(p.job))).rejects.toThrow();
});
it("keeps an explicitly selected earlier earned version and refuses revoked rights", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.source, {
      privateSourceAnalysis: undefined,
      text: undefined,
    }),
  );
  expect(
    (
      await f.t.run((ctx) =>
        resolvePrivateVariant(ctx, f.org, f.actor, f.privateVariantSelection),
      )
    ).evidence[0].insight.id,
  ).toBe("private-one");
  await f.t.run((ctx) => ctx.db.patch(f.source, { rightsAttested: false }));
  await expect(f.variantApprove()).rejects.toThrow();
});
it("inherits exact variant lineage into no-topic issues and plans and quarantines no-topic evaluation output", async () => {
  const f = await fixture(),
    done = await f.variantFinish();
  const issue = await f.owner.mutation(api.issues.create, {
    id: done.bundle.id,
    followUp: false,
  });
  expect((await f.t.run((ctx) => ctx.db.get(issue)))?.topicId).toBeUndefined();
  const p = (await f.t.run((ctx) => ctx.db.query("proposals").collect()))[0];
  await f.t.run((ctx) => ctx.db.patch(p._id, { review: "accepted" }));
  const args = {
    organizationId: f.org,
    workload: "plan_draft" as const,
    proposalId: p._id,
    proposalVersion: p.version,
    deviceId: f.device,
    model: "source-model",
    effort: "high",
    key: "private-variant-plan-001",
  };
  const q = await f.owner.query(api.localLibraryTasks.quote, args);
  expect(q.payload.schemaVersion).toBe("3.0.0");
  if (q.payload.schemaVersion !== "3.0.0") throw Error("Expected variant plan");
  expect(q.payload.privateEvaluationOrigin).toEqual(p.privateEvaluationOrigin);
  vi.stubEnv("RESTORE_LOCK", "true");
  await f.t.mutation(internal.recovery.quarantinePage, {
    section: "knowledgeEvaluations",
    cursor: null,
  });
  expect(
    (
      await f.t.run((ctx) =>
        ctx.db.get(done.bundle.id as Id<"knowledgeEvaluations">),
      )
    )?.output,
  ).toBeUndefined();
});
it("uses source-indexed privacy cleanup for v3 queued context and preserves unknown usage", async () => {
  const f = await fixture();
  const a = await f.variantApprove();
  await f.t.mutation(internal.privateSourceAnalysis.scrub, {
    organizationId: f.org,
    sourceId: f.source,
    cursor: null,
    maxGeneration: 0,
  });
  const run = (await f.t.run((ctx) => ctx.db.get(a.runId)))!;
  expect(run.state).toBe("canceled");
  expect(run.task?.leaseToken).toBeUndefined();
});

it("rejects a canonical reference in actual variant completion without committing an evaluation", async () => {
  const f = await fixture(),
    p = await f.variantPrepare();
  await f.dispatch("task_record_evaluation_inspection", {
    ...ref(p.job),
    id: p.bundle.id,
    inspected: [],
  });
  const { schemaVersion, runId, privateVersion, outputHash, ...forged } =
    p.bundle.evidence[0].reference;
  void [schemaVersion, runId, privateVersion, outputHash];
  const output = {
    disposition: "needs_context",
    title: "Refused canonical substitution",
    rationale: "Actual variant reference is required.",
    problem: "Unknown",
    approach: "Review",
    acceptance: ["Exact refs"],
    tests: ["Check refs"],
    risks: [],
    alternatives: [],
    questions: [],
    references: [forged],
    repositoryEvidence: [],
  };
  await expect(
    f.dispatch("task_evaluation_finish", {
      ...ref(p.job),
      id: p.bundle.id,
      output,
    }),
  ).rejects.toThrow("INVALID_EVIDENCE");
  expect(
    (
      await f.t.run((ctx) =>
        ctx.db.get(p.bundle.id as Id<"knowledgeEvaluations">),
      )
    )?.output,
  ).toBeUndefined();
});
it("separates canonical and exact private variant history without exposing raw source brief", async () => {
  const f = await fixture();
  const done = await f.variantFinish();
  const canonical = await f.owner.query(api.localLibraryTasks.resume, {
    organizationId: f.org,
    sourceId: f.source,
    cursor: null,
  });
  expect(canonical.items).toEqual([]);
  const privatePage = await f.owner.query(api.localLibraryTasks.resume, {
    organizationId: f.org,
    sourceId: f.source,
    privateVariantSelection: f.privateVariantSelection,
    cursor: null,
  });
  expect(privatePage.items.map((row) => row.id)).toEqual([done.runId]);
  expect(JSON.stringify(privatePage)).not.toContain("Explain practical uses");
});
it("runs v3 through the existing processor with exact private references and renewable runtime", async () => {
  const f = await fixture();
  await f.variantApprove();
  const { job } = await f.variantClaim();
  const client = {
    session: {
      profileBinding: "a".repeat(64),
      expiresAt: Date.now() + 3600000,
    },
    check: vi.fn(async () => {}),
    capabilities: vi.fn(async () => catalogue),
    structured: vi.fn(async (_schema: unknown, input: any) => ({
      output: {
        disposition: "already_implemented",
        title: "Already present",
        rationale: "Private interpretation matches existing behavior.",
        problem: "No proved gap",
        approach: "Keep current behavior",
        acceptance: ["Review current evidence"],
        tests: ["Read existing fixture"],
        risks: [],
        alternatives: [],
        questions: [],
        references: input.evidence.map((e: any) => e.reference),
        repositoryEvidence: [],
      },
    })),
  };
  const request = async (operation: string, args: any) => {
    if (operation === "task_context") {
      const c = await f.dispatch("task_context_prepare", args);
      await f.dispatch("task_record_evaluation_inspection", {
        ...ref(job),
        id: c.id,
        inspected: [],
      });
      return { ...c, repo: undefined };
    }
    return f.dispatch(operation, args);
  };
  expect(
    await processSubscriptionTask(job, {
      client,
      request,
      signal: new AbortController().signal,
    }),
  ).toEqual({ completed: true });
  expect(client.structured).toHaveBeenCalledOnce();
  expect(
    (await f.t.run((ctx) => ctx.db.get(job.runId as Id<"localLibraryRuns">)))
      ?.state,
  ).toBe("completed");
});
it("keeps later earned variants independent from a selected earlier immutable run", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.source, {
      privateSourceAnalysis: {
        schemaVersion: "private-source-analysis-text-v1",
        ownerId: f.actor,
        runId: f.privateVariantSelection.runId,
        version: 99,
        baseHash: "f".repeat(64),
        contextHash: "f".repeat(64),
        inputHash: "f".repeat(64),
        outputHash: "f".repeat(64),
        completedAt: Date.now(),
      },
    }),
  );
  expect((await f.variantApprove()).quote.payload.schemaVersion).toBe("3.0.0");
});
it("forbids an ambiguous duplicate insight ID even in an otherwise valid earned result", async () => {
  const f = await fixture();
  const { digest } = await import("../convex/product");
  const selected = await f.t.run(async (ctx) => {
    const run = (await ctx.db.get(f.privateVariantSelection.runId))!;
    const output = JSON.parse(run.sourceTaskResult!.outputJson);
    output.insights.push(output.insights[0]);
    const outputJson = canonicalJson(output),
      outputHash = await digest(outputJson);
    await ctx.db.patch(run._id, {
      sourceTaskResult: { ...run.sourceTaskResult!, outputJson, outputHash },
    });
    return { ...f.privateVariantSelection, outputHash };
  });
  await expect(
    f.variantApprove({ privateVariantSelection: selected }),
  ).rejects.toThrow("INVALID_EVIDENCE");
});
it("carries manual issue/improvement lineage and blocks standing automation eligibility", async () => {
  const f = await fixture(),
    done = await f.variantFinish("relevant");
  const issue = await f.owner.mutation(api.issues.create, {
    id: done.bundle.id,
    followUp: false,
  });
  const id = await f.owner.mutation(api.improvements.create, {
    issueId: issue,
    goal: "Review this exact private interpretation",
  });
  const i = (await f.t.run((ctx) => ctx.db.get(id)))!,
    p = (await f.t.run((ctx) => ctx.db.get(i.proposalId)))!;
  expect(i.privateEvaluationOrigin).toEqual(p.privateEvaluationOrigin);
  const { improvementCurrent } =
    await import("../convex/lib/improvementContext");
  expect(await f.t.run((ctx) => improvementCurrent(ctx, p))).toBe(true);
  await f.owner.mutation(api.product.deleteSource, { id: f.source });
  expect(await f.t.run((ctx) => improvementCurrent(ctx, p))).toBe(false);
});
it("removes variant-derived content through generation-fenced privacy redaction", async () => {
  const f = await fixture(),
    done = await f.variantFinish();
  await f.t.mutation(internal.knowledge.redactDerived, {
    organizationId: f.org,
    sourceId: f.source,
    maxGeneration: 0,
    section: "proposals",
    cursor: null,
  });
  const p = (await f.t.run((ctx) => ctx.db.query("proposals").collect()))[0];
  expect(p.review).toBe("needs_context");
  expect(p.detail.sourceRetentionRedacted).toBe(true);
  expect(p.references?.[0]).toHaveProperty("runId");
  expect(
    (await f.t.run((ctx) => ctx.db.get(done.runId)))?.task?.schemaVersion,
  ).toBe("3.0.0");
});
it("does not export revoked private evaluations as surviving canonical evidence", async () => {
  const f = await fixture();
  await f.variantFinish();
  const read = () =>
    f.owner.query(api.jobs.exportPage, {
      organizationId: f.org,
      section: "knowledgeEvaluations",
      cursor: null,
      asOf: Date.now(),
    });
  expect(JSON.stringify(await read())).toContain("Honest private no fit");
  await f.t.run((ctx) => ctx.db.patch(f.source, { rightsAttested: false }));
  expect(JSON.stringify(await read())).not.toContain("Honest private no fit");
});

it("does not give a v2 claim v3 work even when this device has advertised the new feature", async () => {
  const f = await fixture();
  const a = await f.variantApprove();
  const hello = await f.hello(projectVariantRuntime);
  expect(
    (
      await f.dispatch("claim", {
        taskProtocolVersion: "2.0.0",
        localRuntimeHash: hello.localRuntimeHash,
        preferTasks: true,
      })
    ).job,
  ).toBeNull();
  expect((await f.t.run((ctx) => ctx.db.get(a.runId)))?.state).toBe("queued");
});
it("keeps unknown variant attempts held across new UI keys and expires runtime before dispatch", async () => {
  const f = await fixture();
  await f.variantApprove();
  const { job } = await f.variantClaim();
  await f.dispatch("task_fail", ref(job));
  await f.variantApprove({ key: "private-unknown-new-002" });
  expect(await f.variantClaim()).toMatchObject({ reconcileTask: true });
  vi.setSystemTime(Date.now() + 300001);
  await expect(
    f.variantApprove({ key: "private-runtime-expired-003" }),
  ).rejects.toThrow();
});
it("completes an inherited editable v3 plan with exact lineage and no coding grant", async () => {
  const f = await fixture();
  await f.variantFinish("relevant");
  const p = (await f.t.run((ctx) => ctx.db.query("proposals").collect()))[0];
  await f.t.run((ctx) => ctx.db.patch(p._id, { review: "accepted" }));
  const a = {
    organizationId: f.org,
    workload: "plan_draft" as const,
    deviceId: f.device,
    model: "source-model",
    effort: "high",
    key: "plan-plan-01",
    proposalId: p._id,
    proposalVersion: p.version,
  };
  const q = await f.owner.query(api.localLibraryTasks.quote, a);
  await f.owner.mutation(api.localLibraryTasks.approve, {
    ...a,
    quoteHash: q.hash,
    quoteExpiresAt: q.expiresAt,
    useOwnPlan: true,
    maxInferenceCredits: 0,
  });
  const { job } = await f.variantClaim();
  expect(job.taskProtocolVersion).toBe("3.0.0");
  const c = await f.dispatch("task_context_prepare", {
    ...ref(job),
    repositoryId: f.repo,
  });
  await f.dispatch("task_record_inspection", {
    ...ref(job),
    inspected: c.repo.contextExcerpts,
    manifest: c.repo.manifestEntries,
  });
  const plan = {
    scope: "Review private variant evidence",
    nonGoals: [],
    files: [{ path: "README.md", isNew: false }],
    steps: ["Review exact cited text"],
    tests: ["git diff --check"],
    risks: [],
    rollout: "Review manually",
    rollback: "Revert documentation change",
    unknowns: [],
  };
  expect(await f.dispatch("task_finish", { ...ref(job), plan })).toMatchObject({
    accepted: true,
  });
  const updated = (await f.t.run((ctx) => ctx.db.get(p._id)))!;
  expect(updated.planDraft).toEqual(plan);
  expect(updated.privateEvaluationOrigin).toEqual(p.privateEvaluationOrigin);
  expect(updated.plan).toBeUndefined();
  expect(await f.t.run((ctx) => ctx.db.query("runs").collect())).toEqual([]);
});
it("rejects foreign earned-run ownership and execution pause without destroying an earned read", async () => {
  const f = await fixture();
  const other = await f.t.mutation(internal.accounts.syncUser, {
    subject: "foreign-variant-owner",
    name: "Foreign",
    email: "foreign@example.test",
  });
  await expect(
    f.t.run((ctx) =>
      resolvePrivateVariant(ctx, f.org, other, f.privateVariantSelection),
    ),
  ).rejects.toThrow("FORBIDDEN");
  vi.stubEnv("DISABLE_INFERENCE", "true");
  expect(
    (
      await f.owner.query(api.privateSourceAnalysis.detail, {
        sourceId: f.source,
      })
    ).available,
  ).toBe(true);
  await expect(f.variantApprove()).rejects.toThrow();
});

it("scrubs superseded provider-derived private evaluations, issues and proposals while preserving fresh source and unknown attempts", async () => {
  const f = await fixture(true),
    done = await f.variantFinish("relevant");
  const issueId = await f.owner.mutation(api.issues.create, {
    id: done.bundle.id,
    followUp: false,
  });
  const oldSource = (await f.t.run((ctx) => ctx.db.get(f.source)))!;
  const oldRevisionId = oldSource.currentRevisionId!;
  const pending = await f.variantApprove({ key: "private-expiry-unknown-002" });
  const { job: pendingJob } = await f.variantClaim();
  expect(pendingJob.runId).toBe(pending.runId);
  await f.owner.mutation(api.sourceAcquisition.supplyText, {
    id: f.source,
    expectedGeneration: oldSource.generation,
    expectedRevision: oldSource.updatedAt,
    text: "New separately supplied permitted text survives the earlier provider deadline.",
    rightsAttested: true,
  });
  const freshSource = (await f.t.run((ctx) => ctx.db.get(f.source)))!;
  expect(freshSource.generation).toBe(oldSource.generation + 1);
  expect(freshSource.currentRevisionId).not.toBe(oldRevisionId);
  vi.setSystemTime(oldSource.sourceRetentionUntil! + 1);
  expect(
    await f.t.mutation(internal.sourceAcquisition.expire, {
      revisionId: oldRevisionId,
    }),
  ).toMatchObject({ expired: true });
  const scheduled = await f.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    scheduled.some(
      (row) =>
        row.name.endsWith("knowledge:redactDerived") &&
        (row.args[0] as { sourceId?: string; maxGeneration?: number })
          .sourceId === f.source &&
        (row.args[0] as { maxGeneration?: number }).maxGeneration ===
          oldSource.generation,
    ),
  ).toBe(true);
  await f.t.mutation(internal.privateSourceAnalysis.scrub, {
    organizationId: f.org,
    sourceId: f.source,
    maxGeneration: oldSource.generation,
    cursor: null,
  });
  for (const section of [
    "knowledgeJobs",
    "knowledgeEvaluations",
    "issueDrafts",
    "improvements",
    "improvementOutcomes",
    "runs",
    "proposals",
  ] as const)
    await f.t.mutation(internal.knowledge.redactDerived, {
      organizationId: f.org,
      sourceId: f.source,
      maxGeneration: oldSource.generation,
      section,
      cursor: null,
    });
  const evaluation = (await f.t.run((ctx) =>
    ctx.db.get(done.bundle.id as Id<"knowledgeEvaluations">),
  ))!;
  expect(evaluation.output).toBeUndefined();
  expect(evaluation.inspected).toBeUndefined();
  expect((await f.t.run((ctx) => ctx.db.get(issueId)))?.body).toBe("");
  const proposals = await f.t.run((ctx) => ctx.db.query("proposals").collect());
  expect(proposals[0].review).toBe("needs_context");
  expect(proposals[0].detail).toMatchObject({ sourceRetentionRedacted: true });
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.privateVariantSelection.runId)))
      ?.sourceTaskResult,
  ).toBeUndefined();
  const unknown = (await f.t.run((ctx) => ctx.db.get(pending.runId)))!;
  expect(unknown.state).toBe("unknown");
  expect(unknown.task?.deadline).toBe(pendingJob.deadline);
  expect(unknown.task?.leaseToken).toBeUndefined();
  expect(await f.t.run((ctx) => ctx.db.get(f.source))).toEqual(freshSource);
  expect(
    (await f.t.run((ctx) => ctx.db.get(freshSource.currentRevisionId!)))?.text,
  ).toContain("New separately supplied");
});
