import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { syncKnowledge } from "../convex/knowledge";
import { normalizeSubscriptionCapabilities } from "../packages/runner/subscription-capabilities.mjs";
import { exportRecord } from "../packages/privacy/export";
import { localTaskQuote } from "../convex/localLibraryTasks";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
it("keeps account capability catalogues private to the device owner in a shared workspace", async () => {
  const f = await setup();
  await f.t.run(async (ctx) => {
    const member = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", "other"))
      .unique();
    await ctx.db.insert("memberships", {
      organizationId: f.org,
      userId: member!._id,
      role: "member",
    });
  });
  const ownerDevices = await f.owner.query(api.devices.list, {
    organizationId: f.org,
  });
  expect(
    ownerDevices.find((d) => d._id === f.device)?.subscriptionCapabilities
      ?.value.models[0].slug,
  ).toBe("synthetic-model");
  const memberDevices = await f.other.query(api.devices.list, {
    organizationId: f.org,
  });
  const exposed = memberDevices.find((d) => d._id === f.device);
  expect(exposed?.subscriptionCapabilities).toBeUndefined();
  expect(exposed?.personalModels).toBeUndefined();
  expect(exposed?.personalOwned).toBe(false);
  await f.owner.mutation(api.devices.revoke, { id: f.device });
  expect(
    await f.t.run(async (ctx) => await ctx.db.get(f.device)),
  ).not.toHaveProperty("subscriptionCapabilities");
});
it("resumes persisted own task history after reload without exposing another actor's tasks or runtime authority", async () => {
  const f = await setup();
  const approved = await f.approve();
  const history = await f.owner.query(api.localLibraryTasks.resume, {
    organizationId: f.org,
    sourceId: f.source,
    cursor: null,
  });
  expect(history.items).toMatchObject([
    {
      id: approved.runId,
      state: "queued",
      model: "synthetic-model",
      effort: "xhigh",
    },
  ]);
  expect(JSON.stringify(history)).not.toContain("profileBinding");
  expect(JSON.stringify(history)).not.toContain("approvalHash");
  expect(
    await f.other.query(api.localLibraryTasks.resume, {
      organizationId: f.otherOrg,
      sourceId: f.source,
      cursor: null,
    }),
  ).toMatchObject({ items: [] });
  await expect(
    f.other.query(api.localLibraryTasks.resume, {
      organizationId: f.org,
      sourceId: f.source,
      cursor: null,
    }),
  ).rejects.toThrow();
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["owner","other"]');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const catalogue = normalizeSubscriptionCapabilities({
  data: [
    {
      model: "synthetic-model",
      supportedReasoningEfforts: [
        { reasoningEffort: "high" },
        { reasoningEffort: "xhigh" },
      ],
    },
  ],
});
const plan = {
  scope: "Improve evidence review",
  nonGoals: ["No execution"],
  files: [{ path: "README.md", isNew: false }],
  steps: ["Explain the evidence review"],
  tests: ["printf synthetic"],
  risks: [],
  rollout: "Review draft",
  rollback: "Revert",
  unknowns: [],
};
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject: "owner",
    email: "owner@example.test",
    name: "Owner",
  });
  await t.mutation(internal.accounts.syncUser, {
    subject: "other",
    email: "other@example.test",
    name: "Other",
  });
  const fresh = () =>
    t.withIdentity({
      subject: "owner",
      auth_time: Math.floor(Date.now() / 1000),
    });
  const owner = fresh(),
    other = t.withIdentity({
      subject: "other",
      auth_time: Math.floor(Date.now() / 1000),
    });
  const org = await owner.mutation(api.organizations.create, {
    name: "Owned workspace",
  });
  const otherOrg = await other.mutation(api.organizations.create, {
    name: "Other workspace",
  });
  const source = await owner.mutation(api.product.capture, {
    organizationId: org,
    key: "owned-task-source-001",
    kind: "text",
    title: "Owned synthetic idea",
    text: "Verify evidence before an implementation.",
    rightsAttested: true,
  });
  const profileBinding = "a".repeat(64),
    credentialHash = "b".repeat(64);
  const data = await t.run(async (ctx) => {
    const sourceRow = (await ctx.db.get(source))!,
      now = Date.now();
    await ctx.db.patch(source, {
      state: "ready",
      analysisPipelineVersion: "synthetic-v1",
      analysis: {
        schemaVersion: "1.0.0",
        sourceId: source,
        processingRunId: `${source}:${sourceRow.generation}`,
        coverage: "caption_only",
        summary: "Review exact evidence",
        warnings: [],
        insights: [
          {
            id: "one",
            title: "Review exact evidence",
            claim: "Review source evidence before coding.",
            interpretation: "Use inspected evidence",
            categories: ["coding"],
            topics: ["Verification"],
            evidence: [
              {
                kind: "user_note",
                id: "supplied_text",
                startMs: null,
                endMs: null,
              },
            ],
            confidence: "supported",
            verificationNeeds: [],
          },
        ],
      },
      coverage: "caption_only",
      mediaEvidence: [
        { kind: "user_note", id: "supplied_text", startMs: null, endMs: null },
      ],
    });
    await syncKnowledge(ctx, (await ctx.db.get(source))!, { enqueue: false });
    const excerpt = {
      path: "README.md",
      blobSha: "c".repeat(40),
      startLine: 1,
      endLine: 1,
      content: "Owned synthetic documentation",
    };
    const repo = await ctx.db.insert("repositories", {
      organizationId: org,
      createdAt: now,
      updatedAt: now,
      installationId: 1,
      providerId: 1,
      fullName: "owned/synthetic",
      sha: "d".repeat(40),
      branch: "main",
      enabled: true,
      confirmed: true,
      profile: "Improve source evidence review",
      profileVersion: 1,
      manifest: ["README.md", "src/uninspected.ts"],
      manifestEntries: [
        {
          path: "README.md",
          blobSha: excerpt.blobSha,
          size: excerpt.content.length,
          mode: "100644",
        },
      ],
      context: excerpt.content,
      contextExcerpts: [excerpt],
      status: "connected",
    });
    const device = await ctx.db.insert("devices", {
      organizationId: org,
      owner: actor,
      name: "Synthetic paired computer",
      createdAt: now,
      updatedAt: now,
      fingerprint: "e".repeat(64),
      codeHash: "f".repeat(64),
      credentialHash,
      state: "paired",
      expiresAt: now + 4 * 3600000,
      lastSeenAt: now,
      capabilities: [],
    });
    return { device, repo, excerpt };
  });
  const dispatch = (operation: string, args: any = {}) =>
    t.mutation(internal.assistantLocal.operation, {
      credentialHash,
      operation,
      args,
    });
  await dispatch("hello", {
    profileBinding,
    expiresAt: Date.now() + 4 * 3600000,
    capabilities: catalogue,
  });
  const selection = {
    organizationId: org,
    workload: "project_evaluation" as const,
    deviceId: data.device,
    model: "synthetic-model",
    effort: "xhigh",
    key: "own-project-task-key-001",
    sourceId: source,
    repositoryIds: [data.repo],
  };
  const approve = async (input: any = selection) => {
    const quote = await fresh().query(api.localLibraryTasks.quote, input);
    const approved = await fresh().mutation(api.localLibraryTasks.approve, {
      ...input,
      quoteHash: quote.hash,
      quoteExpiresAt: quote.expiresAt,
      useOwnPlan: true,
      maxInferenceCredits: 0,
    });
    return { quote, ...approved };
  };
  const claim = () =>
    dispatch("claim", { taskProtocolVersion: "1.0.0", preferTasks: true });
  return {
    t,
    actor,
    fresh,
    owner,
    other,
    org,
    otherOrg,
    source,
    ...data,
    dispatch,
    selection,
    approve,
    claim,
    profileBinding,
  };
}
function ref(job: any) {
  return {
    runId: job.runId,
    leaseGeneration: job.leaseGeneration,
    leaseToken: job.leaseToken,
  };
}
async function finishEvaluation(
  s: Awaited<ReturnType<typeof setup>>,
  job: any,
  disposition = "relevant",
) {
  const c = await s.dispatch("task_context_prepare", {
    ...ref(job),
    repositoryId: s.repo,
  });
  if (!c.cached) {
    await s.dispatch("task_record_evaluation_inspection", {
      ...ref(job),
      id: c.id,
      inspected: [{ path: "README.md", startLine: 1, endLine: 1 }],
    });
    await s.dispatch("task_evaluation_finish", {
      ...ref(job),
      id: c.id,
      output: {
        disposition,
        title: "Review exact evidence",
        rationale: "The selected evidence supports a review",
        problem: "Review is not explained",
        approach: "Explain current evidence",
        acceptance: ["Evidence is described"],
        tests: ["Inspect documentation"],
        risks: [],
        alternatives: [],
        questions: [],
        references: c.evidence.map((e: any) => e.reference),
        repositoryEvidence: [
          {
            path: "README.md",
            startLine: 1,
            endLine: 1,
            explanation: "Existing documentation can explain the review",
          },
        ],
      },
    });
  }
  return s.dispatch("task_finish", { ...ref(job), evaluationIds: [c.id] });
}
it("quotes and runs an actor-owned xhigh evaluation into an unreviewed proposal with no managed reservation", async () => {
  const s = await setup(),
    approved = await s.approve();
  expect(approved.quote.maxInferenceCredits).toBe(0);
  expect(approved.quote.codingAuthorized).toBe(false);
  const { job } = await s.claim();
  expect(job.runId).toBe(approved.runId);
  expect(job.effort).toBe("xhigh");
  expect(await s.dispatch("task_heartbeat", ref(job))).toMatchObject({
    valid: true,
    deadline: job.deadline,
  });
  const done = await finishEvaluation(s, job);
  const proposal = await s.t.run((ctx) =>
    ctx.db.get(done.proposalIds[0] as Id<"proposals">),
  );
  expect(proposal).toMatchObject({
    disposition: "relevant",
    review: "unreviewed",
    sourceId: s.source,
  });
  expect(proposal?.plan).toBeUndefined();
  expect(proposal?.planDraft).toBeUndefined();
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  await expect(
    s.dispatch("task_finish", { ...ref(job), evaluationIds: [] }),
  ).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.query("proposals").collect()),
  ).toHaveLength(1);
});
it.each([
  "no_fit",
  "already_implemented",
  "unsupported_claim",
  "needs_context",
  "defer",
])("persists %s without creating a coding approval", async (disposition) => {
  const s = await setup();
  await s.approve();
  const { job } = await s.claim();
  const done = await finishEvaluation(s, job, disposition);
  expect(await s.t.run((ctx) => ctx.db.get(done.proposalIds[0]))).toMatchObject(
    { disposition, review: "unreviewed" },
  );
  expect(await s.t.run((ctx) => ctx.db.query("runs").collect())).toEqual([]);
});

it.each(["base", "profile"])(
  "rejects a legacy accepted proposal after %s drift at quote and again at active task use",
  async (change) => {
    const s = await setup();
    const id = await s.t.run((ctx) =>
      ctx.db.insert("proposals", {
        organizationId: s.org,
        sourceId: s.source,
        repositoryId: s.repo,
        baseSha: "d".repeat(40),
        profileVersion: 1,
        title: "Legacy accepted proposal",
        disposition: "relevant",
        review: "accepted",
        version: 1,
        detail: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const selection = {
      organizationId: s.org,
      workload: "plan_draft" as const,
      deviceId: s.device,
      model: "synthetic-model",
      effort: "high",
      key: "legacy-exact-base-001",
      proposalId: id,
      proposalVersion: 1,
    };
    const original =
        change === "base" ? { baseSha: "d".repeat(40) } : { profileVersion: 1 },
      stale =
        change === "base"
          ? { baseSha: "0".repeat(40) }
          : { profileVersion: 99 };
    await s.t.run((ctx) => ctx.db.patch(id, stale));
    await expect(
      s.owner.query(api.localLibraryTasks.quote, selection),
    ).rejects.toThrow("APPROVAL_STALE");
    await s.t.run((ctx) => ctx.db.patch(id, original));
    await s.approve(selection);
    const { job } = await s.claim();
    await s.t.run((ctx) => ctx.db.patch(id, stale));
    await expect(s.dispatch("task_heartbeat", ref(job))).rejects.toThrow(
      "APPROVAL_STALE",
    );
    await expect(
      s.dispatch("task_context_prepare", { ...ref(job), repositoryId: s.repo }),
    ).rejects.toThrow("APPROVAL_STALE");
  },
);
it("rejects over-count and duplicate member input before any database get", async () => {
  const get = vi.fn(() => {
    throw Error("UNEXPECTED_DATABASE_READ");
  });
  for (const members of [
    Array.from({ length: 13 }, (_, n) => `member-${n}`),
    ["same-member", "same-member"],
  ]) {
    await expect(
      localTaskQuote(
        { db: { get } } as any,
        { members } as any,
        Date.now() + 300000,
      ),
    ).rejects.toThrow("INVALID_INPUT");
  }
  expect(get).not.toHaveBeenCalled();
});
it("keeps source, repository, catalogue, actor and quote identity fenced before claim", async () => {
  const s = await setup();
  const q = await s.owner.query(api.localLibraryTasks.quote, s.selection);
  await s.t.run((ctx) => ctx.db.patch(s.repo, { selectionVersion: 2 }));
  await expect(
    s.owner.mutation(api.localLibraryTasks.approve, {
      ...s.selection,
      quoteHash: q.hash,
      quoteExpiresAt: q.expiresAt,
      useOwnPlan: true,
      maxInferenceCredits: 0,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.other.query(api.localLibraryTasks.quote, s.selection),
  ).rejects.toThrow();
  await s.t.run((ctx) => ctx.db.patch(s.repo, { selectionVersion: 0 }));
  await s.approve();
  await s.t.run((ctx) => ctx.db.patch(s.source, { generation: 99 }));
  expect((await s.claim()).job).toBeNull();
});
it.each([
  "source",
  "repository",
  "profile",
  "membership",
  "cancel",
  "retention",
])(
  "refuses heartbeat and late completion after %s authority changes",
  async (change) => {
    const s = await setup();
    await s.approve();
    const { job } = await s.claim();
    if (change === "cancel")
      await s.owner.mutation(api.localLibraryTasks.cancel, {
        runId: job.runId,
      });
    else
      await s.t.run(async (ctx) => {
        if (change === "source")
          await ctx.db.patch(s.source, { generation: 2 });
        if (change === "retention")
          await ctx.db.patch(s.source, {
            sourceRetentionUntil: Date.now() - 1,
          });
        if (change === "repository")
          await ctx.db.patch(s.repo, { sha: "0".repeat(40) });
        if (change === "profile") {
          const d = (await ctx.db.get(s.device))!;
          await ctx.db.patch(s.device, {
            subscriptionCapabilities: {
              ...d.subscriptionCapabilities!,
              profileBinding: "0".repeat(64),
            },
          });
        }
        if (change === "membership") {
          const m = await ctx.db
            .query("memberships")
            .withIndex("by_pair", (q) =>
              q.eq("organizationId", s.org).eq("userId", s.actor),
            )
            .unique();
          await ctx.db.delete(m!._id);
        }
      });
    await expect(s.dispatch("task_heartbeat", ref(job))).rejects.toThrow();
    await expect(
      s.dispatch("task_finish", { ...ref(job), evaluationIds: [] }),
    ).rejects.toThrow();
    expect(await s.t.run((ctx) => ctx.db.query("proposals").collect())).toEqual(
      [],
    );
  },
);
it("rejects lease swaps, raw-browser result submission and forged repository citations", async () => {
  const s = await setup();
  await s.approve();
  const { job } = await s.claim();
  await expect(
    s.dispatch("task_heartbeat", { ...ref(job), leaseToken: "0".repeat(36) }),
  ).rejects.toThrow();
  const c = await s.dispatch("task_context_prepare", {
    ...ref(job),
    repositoryId: s.repo,
  });
  await expect(
    s.owner.mutation(api.localLibrary.evaluationFinish, {
      id: c.id,
      output: {},
    }),
  ).rejects.toThrow();
  await expect(
    s.dispatch("evaluation_prepare", {
      runId: job.runId,
      topicId: "foreign",
      repositoryId: s.repo,
    }),
  ).rejects.toThrow();
  await s.dispatch("task_record_evaluation_inspection", {
    ...ref(job),
    id: c.id,
    inspected: [{ path: "README.md", startLine: 1, endLine: 1 }],
  });
  await expect(
    s.dispatch("task_evaluation_finish", {
      ...ref(job),
      id: c.id,
      output: {
        disposition: "relevant",
        title: "Fake",
        rationale: "Fake",
        problem: "Fake",
        approach: "Fake",
        acceptance: ["Fake"],
        tests: ["Fake"],
        risks: [],
        alternatives: [],
        questions: [],
        references: c.evidence.map((e: any) => e.reference),
        repositoryEvidence: [
          {
            path: "src/uninspected.ts",
            startLine: 1,
            endLine: 2,
            explanation: "Never inspected",
          },
        ],
      },
    }),
  ).rejects.toThrow("INVALID_EVIDENCE");
});
it("drafts a version-bound editable plan only after explicit proposal review and preserves separate coding approval", async () => {
  const s = await setup();
  await s.approve();
  const { job } = await s.claim();
  const done = await finishEvaluation(s, job);
  const id = done.proposalIds[0] as Id<"proposals">;
  await s.t.run((ctx) => ctx.db.patch(id, { review: "accepted", version: 2 })); // Synthetic explicit-review state, no execution approval.
  const selection = {
    organizationId: s.org,
    workload: "plan_draft",
    deviceId: s.device,
    model: "synthetic-model",
    effort: "high",
    key: "own-plan-task-key-001",
    proposalId: id,
    proposalVersion: 2,
  };
  const approved = await s.approve(selection);
  const { job: draft } = await s.claim();
  expect(draft.runId).toBe(approved.runId);
  await expect(
    s.owner.mutation(api.planning.start, {
      id,
      version: 2,
      maxCredits: 10,
      key: "managed-cannot-overlap",
    }),
  ).rejects.toThrow("SOURCE_BUSY");
  const c = await s.dispatch("task_context_prepare", {
    ...ref(draft),
    repositoryId: s.repo,
  });
  await s.dispatch("task_record_inspection", {
    ...ref(draft),
    inspected: [s.excerpt],
    manifest: c.repo.manifestEntries,
  });
  await expect(
    s.dispatch("task_finish", {
      ...ref(draft),
      plan: { ...plan, files: [{ path: "src/uninspected.ts", isNew: false }] },
    }),
  ).rejects.toThrow("INVALID_EVIDENCE");
  expect(
    await s.dispatch("task_finish", { ...ref(draft), plan }),
  ).toMatchObject({ accepted: true });
  const p = await s.t.run((ctx) => ctx.db.get(id));
  expect(p?.planDraft).toEqual(plan);
  expect(p?.planDraftVersion).toBe(2);
  expect(p?.plan).toBeUndefined();
  expect(p?.planHash).toBeUndefined();
  expect(await s.t.run((ctx) => ctx.db.query("runs").collect())).toEqual([]);
  const beforeReplay = await s.t.run((ctx) =>
    ctx.db.query("localLibraryRuns").collect(),
  );
  const replay = await s.approve({
    ...selection,
    key: "same-plan-new-ui-key-002",
  });
  expect(replay).toMatchObject({ runId: draft.runId, cached: true });
  expect(
    await s.t.run((ctx) => ctx.db.query("localLibraryRuns").collect()),
  ).toHaveLength(beforeReplay.length);
  expect((await s.claim()).job).toBeNull();
});
it("keeps failed dispatched work uncertain and refuses renewal/replay without inventing a free completion", async () => {
  const s = await setup();
  const a = await s.approve();
  const duplicate = await s.owner.mutation(api.localLibraryTasks.approve, {
    ...s.selection,
    quoteHash: a.quote.hash,
    quoteExpiresAt: a.quote.expiresAt,
    useOwnPlan: true,
    maxInferenceCredits: 0,
  });
  expect(duplicate.runId).toBe(a.runId);
  const { job } = await s.claim();
  expect(await s.dispatch("task_fail", ref(job))).toMatchObject({
    usage: "unknown",
  });
  expect(await s.claim()).toMatchObject({ job: null, reconcileTask: true });
  await expect(s.dispatch("task_heartbeat", ref(job))).rejects.toThrow();
  await expect(
    s.owner.mutation(api.localLibraryTasks.reconcile, {
      runId: job.runId,
      acknowledgeUnknownUsage: true,
    }),
  ).rejects.toThrow();
  vi.setSystemTime(Date.now() + 1800001);
  expect(
    await s.fresh().mutation(api.localLibraryTasks.reconcile, {
      runId: job.runId,
      acknowledgeUnknownUsage: true,
    }),
  ).toMatchObject({ usage: "unknown_retained", grantsExecution: false });
});
it("exports decisions without executor tokens/context and quarantines restored local task and device authority", async () => {
  const s = await setup();
  await s.approve();
  const { job } = await s.claim();
  const raw = (await s.t.run((ctx) =>
    ctx.db.get(job.runId as Id<"localLibraryRuns">),
  ))!;
  const exported = JSON.stringify(
    exportRecord("localLibraryRuns", {
      ...raw,
      task: {
        ...raw.task!,
        inspected: [{ content: "Private repository bytes" }],
        inspectionManifest: [{ path: "private.ts" }],
      },
    }),
  );
  expect(exported).not.toContain(job.leaseToken);
  expect(exported).not.toContain("Private repository bytes");
  expect(exported).not.toContain("inspectionManifest");
  expect(exported).not.toContain("profileBinding");
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "localLibraryRuns",
    cursor: null,
  });
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "devices",
    cursor: null,
  });
  const restored = await s.t.run((ctx) =>
    ctx.db.get(job.runId as Id<"localLibraryRuns">),
  );
  expect(restored?.state).toBe("canceled");
  expect(restored?.task).toBeUndefined();
  expect(await s.t.run((ctx) => ctx.db.get(s.device))).toBeNull();
});
