import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { createEvidence, registryHash } from "../packages/sources/evidence";
import insightSchema from "../contracts/insight.schema.json";
import sourceInsightSchema from "../contracts/source-insight-v2.schema.json";
const modules = import.meta.glob("../convex/**/*.ts");
const subject = "user_01234567890123456789012345";
const clientId = "client_01234567890123456789012345";
const issuer = "https://cloud-fixture.authkit.app";
const identity = {
  subject,
  issuer,
  client_id: clientId,
  scope: "analysis:execute",
  sid: "app_consent_01234567890123456789012345",
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup(typed = false) {
  for (const key of [
    "MCP_ENABLED",
    "WORK_CLOUD_TEXT_ENABLED",
    "WORK_CLOUD_TEXT_VERIFIED",
  ])
    vi.stubEnv(key, "true");
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", JSON.stringify([subject]));
  vi.stubEnv("MCP_AUTH_ISSUER", issuer);
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      {
        id: clientId,
        name: "Fixture only",
        scopes: ["analysis:execute", "jobs:read"],
      },
    ]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "cloud@example.test",
    name: "Fixture owner",
  });
  const owner = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const assistant = t.withIdentity(identity);
  const org = await owner.mutation(api.organizations.createPrivate, {});
  const sourceId = await owner.mutation(api.product.capture, {
    organizationId: org,
    key: "cloud-text-fixture",
    kind: "text",
    title: "Review source evidence",
    text: "Review the evidence before acting.",
    rightsAttested: true,
  });
  let typedEvidence: Awaited<ReturnType<typeof createEvidence>> | undefined;
  if (typed) {
    vi.stubEnv("DIRECT_SOURCES_ENABLED", "true");
    vi.stubEnv("GITHUB_SOURCES_ENABLED", "true");
    vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "fixture-only-not-live");
    vi.stubEnv(
      "REDDIT_SOURCE_ELIGIBILITY_JSON",
      JSON.stringify({
        status: "verified",
        evidenceId: "fixture-only-permission",
        expiresAt: Date.now() + 86400000,
        authentication: "oauth",
        workloads: [
          "selected_thread_read",
          "private_summary",
          "citation_export",
        ],
        retention: { maxAgeMs: 86400000, deletionWithinMs: 3600000 },
      }),
    );
    const now = Date.now(),
      canonical = "https://github.com/example/project";
    typedEvidence = await createEvidence({
      kind: "github_file",
      repositoryId: 42,
      repository: "example/project",
      commitSha: "c".repeat(40),
      path: "README.md",
      startLine: 1,
      endLine: 1,
      excerpt: "Review the evidence before acting.",
      canonicalUrl: `${canonical}/blob/${"c".repeat(40)}/README.md`,
      observedAt: now,
    });
    const contentHash = await registryHash([typedEvidence]);
    const record = typedEvidence;
    await t.run(async (ctx) => {
      const revision = await ctx.db.insert("sourceRevisions", {
        organizationId: org,
        sourceId,
        createdAt: now,
        updatedAt: now,
        generation: 0,
        state: "current",
        text: record.excerpt,
        contentHash,
        revision: {
          schemaVersion: "1.0.0",
          sourceType: "github_repository",
          canonical,
          providerIdentity: `github:42:${"c".repeat(40)}`,
          contentHash,
          adapterVersion: "fixture-v1",
          observedAt: now,
          rightsBasis: "synthetic_owner_permission",
          coverage: {
            method: "synthetic_selected_files",
            retrieved: 1,
            omitted: 0,
            omissions: [],
          },
        },
        evidence: [record],
      });
      await ctx.db.patch(sourceId, {
        canonical,
        url: canonical,
        kind: "url",
        sourceType: "github_repository",
        currentRevisionId: revision,
      });
    });
  }
  const source = (await t.run((ctx) => ctx.db.get(sourceId)))!;
  const grantArgs = {
    organizationId: org,
    clientId,
    sources: [
      { sourceId, generation: source.generation, revision: source.updatedAt },
    ],
    scopes: ["analysis:execute"],
    expectedVersion: 0,
    expiresAt: Date.now() + 86400000,
    acknowledged: true as const,
  };
  const grant = await owner.mutation(api.assistantGrants.save, grantArgs);
  const preview = () =>
    owner.query(api.workCloudAnalysis.preview, { sourceId, grantId: grant.id });
  const approve = async () => {
    const p = await preview();
    return owner.mutation(api.workCloudAnalysis.approve, {
      sourceId,
      generation: p.generation,
      grantId: grant.id,
      grantVersion: p.grantVersion,
      expectedInputHash: p.inputHash,
      model: "synthetic-model",
      effort: "high",
      useOwnPlan: true,
      maxApiUsd: 0,
    });
  };
  const claim = async () => {
    const approved = await approve();
    const result = await assistant.mutation(
      internal.workCloudAnalysis.dispatch,
      {
        sourceId,
        generation: approved.generation,
        taskId: "fixture-task-1",
        operation: "claim",
      },
    );
    if (!("leaseToken" in result)) throw Error("Expected a first claim token");
    return {
      sourceId,
      generation: approved.generation,
      taskId: "fixture-task-1",
      leaseToken: result.leaseToken!,
    };
  };
  return {
    t,
    owner,
    assistant,
    org,
    sourceId,
    source,
    grant,
    grantArgs,
    preview,
    approve,
    claim,
    typedEvidence,
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
type Lease = Awaited<ReturnType<Fixture["claim"]>>;
function outputFor(lease: Lease) {
  return {
    schemaVersion: "1.0.0",
    sourceId: lease.sourceId,
    processingRunId: `${lease.sourceId}:${lease.generation}`,
    coverage: "caption_only",
    summary: "Review evidence before acting.",
    warnings: ["Supplied text only; synthetic fixture."],
    insights: [
      {
        id: "point-1",
        title: "Review evidence",
        claim: "Review evidence before acting.",
        interpretation: "Keep approval explicit.",
        categories: ["coding"],
        confidence: "supported",
        verificationNeeds: [],
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
  };
}

it("completes a private text result once, stores only the token hash and preserves the original grant selection", async () => {
  const s = await setup(),
    lease = await s.claim();
  const input = await s.assistant.query(
    internal.workCloudAnalysis.input,
    lease,
  );
  expect(input).toMatchObject({
    inputKind: "supplied_text",
    schemaVersion: "work-cloud-text-v1",
    processingRunId: `${s.sourceId}:${lease.generation}`,
    expectedCoverage: "caption_only",
    text: s.source.text,
    generation: 1,
    maxApiUsd: 0,
    mediaSupported: false,
  });
  expect(JSON.parse(input.outputSchema)).toEqual(insightSchema);
  expect(JSON.stringify(input)).not.toContain(lease.leaseToken);
  const pending = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(pending.personalAnalysis?.executor).toBe("work_cloud");
  if (pending.personalAnalysis?.executor !== "work_cloud")
    throw Error("Expected Cloud job");
  expect(pending.personalAnalysis.cloud.leaseTokenHash).toMatch(
    /^[a-f0-9]{64}$/,
  );
  expect(pending.personalAnalysis.deviceId).toBeUndefined();
  expect((await s.t.run((ctx) => ctx.db.get(s.grant.id)))?.sources).toEqual(
    s.grantArgs.sources,
  );
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "heartbeat",
    }),
  ).resolves.toMatchObject({ valid: true });
  const completion = {
    ...lease,
    operation: "complete" as const,
    output: outputFor(lease),
    reportedModel: "synthetic-model",
    reportedEffort: "high",
    usage: { inputTokens: 20, outputTokens: 30 },
  };
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, completion),
  ).resolves.toEqual({ accepted: true, cached: false });
  const completed = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(completed).toMatchObject({
    state: "ready",
    analysisPipelineVersion: "official-work-cloud-text-v1",
    personalAnalysis: { state: "completed", inputTokens: 20, outputTokens: 30 },
  });
  expect(completed.analysis?.insights).toHaveLength(1);
  const notifications = await s.t.run((ctx) =>
    ctx.db.query("notifications").collect(),
  );
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, completion),
  ).resolves.toEqual({ accepted: true, cached: true });
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(completed);
  expect(
    await s.t.run((ctx) => ctx.db.query("notifications").collect()),
  ).toEqual(notifications);
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...completion,
      output: { ...completion.output, summary: "Different result" },
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  for (const table of [
    "devices",
    "publicArtifacts",
    "sourceAcquisitions",
    "localLibraryRuns",
  ] as const)
    expect(await s.t.run((ctx) => ctx.db.query(table).collect())).toEqual([]);
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect())).every(
      (row) => row.max === 0,
    ),
  ).toBe(true);
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: s.grant.id,
    expectedVersion: 1,
  });
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, completion),
  ).rejects.toThrow("FORBIDDEN");
});

it("keeps approval bound to exact preview input and current grant version in a normal session", async () => {
  const s = await setup(),
    p = await s.preview();
  const args = {
    sourceId: s.sourceId,
    generation: p.generation,
    grantId: s.grant.id,
    grantVersion: p.grantVersion,
    expectedInputHash: p.inputHash,
    model: "synthetic-model",
    effort: "high",
    useOwnPlan: true as const,
    maxApiUsd: 0 as const,
  };
  await expect(
    s.owner.mutation(api.workCloudAnalysis.approve, {
      ...args,
      grantVersion: 2,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { text: "Changed text" }));
  await expect(
    s.owner.mutation(api.workCloudAnalysis.approve, args),
  ).rejects.toThrow("APPROVAL_STALE");
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.generation).toBe(0);
});

it("refuses to supersede an unreconciled paired device request", async () => {
  const s = await setup();
  const p = await s.preview();
  const deviceId = await s.t.run(async (ctx) => {
    const actor = (await ctx.db.get(s.org))!.privateOwnerId!;
    const deviceId = await ctx.db.insert("devices", {
      organizationId: s.org,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      owner: actor,
      name: "Earlier paired fixture",
      fingerprint: "a".repeat(64),
      codeHash: "b".repeat(64),
      credentialHash: "c".repeat(64),
      state: "paired",
      expiresAt: Date.now() + 60000,
      lastSeenAt: Date.now(),
      capabilities: [],
      activePersonalSource: s.sourceId,
    });
    await ctx.db.patch(s.sourceId, {
      state: "failed",
      personalAnalysis: {
        actor,
        generation: s.source.generation,
        deviceId,
        profileBinding: "d".repeat(64),
        model: "synthetic-model",
        effort: "high",
        state: "failed",
        approvedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        leaseUntil: 0,
        deadline: 0,
      },
    });
    return deviceId;
  });
  await expect(s.preview()).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.owner.mutation(api.workCloudAnalysis.approve, {
      sourceId: s.sourceId,
      generation: p.generation,
      grantId: s.grant.id,
      grantVersion: p.grantVersion,
      expectedInputHash: p.inputHash,
      model: "synthetic-model",
      effort: "high",
      useOwnPlan: true,
      maxApiUsd: 0,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.t.run((ctx) =>
    ctx.db.patch(deviceId, { activePersonalSource: undefined }),
  );
  await expect(s.preview()).resolves.toMatchObject({ generation: 0 });
});

it.each([
  "WORK_CLOUD_TEXT_ENABLED",
  "WORK_CLOUD_TEXT_VERIFIED",
  "DISABLE_PERSONAL_ANALYSIS",
  "DISABLE_INFERENCE",
  "PERSONAL_ALPHA_SUBJECTS_JSON",
])("rechecks the %s account gate on preview and active input", async (flag) => {
  const s = await setup(),
    lease = await s.claim();
  vi.stubEnv(
    flag,
    ["DISABLE_PERSONAL_ANALYSIS", "DISABLE_INFERENCE"].includes(flag)
      ? "true"
      : flag === "PERSONAL_ALPHA_SUBJECTS_JSON"
        ? "[]"
        : "false",
  );
  await expect(s.preview()).rejects.toThrow("FORBIDDEN");
  await expect(
    s.assistant.query(internal.workCloudAnalysis.input, lease),
  ).rejects.toThrow("FORBIDDEN");
  for (const operation of ["claim", "heartbeat"] as const)
    await expect(
      s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
        ...lease,
        ...(operation === "claim" ? { leaseToken: undefined } : {}),
        operation,
      }),
    ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output: outputFor(lease),
    }),
  ).rejects.toThrow("FORBIDDEN");
});

it("denies anonymous, foreign accounts and old OAuth scopes", async () => {
  const s = await setup();
  await expect(
    s.t.query(api.workCloudAnalysis.preview, {
      sourceId: s.sourceId,
      grantId: s.grant.id,
    }),
  ).rejects.toThrow();
  await s.t.mutation(internal.accounts.syncUser, {
    subject: "foreign",
    email: "foreign@example.test",
    name: "Foreign",
  });
  await expect(
    s.t
      .withIdentity({ subject: "foreign" })
      .query(api.workCloudAnalysis.preview, {
        sourceId: s.sourceId,
        grantId: s.grant.id,
      }),
  ).rejects.toThrow();
  const approved = await s.approve();
  await expect(
    s.t
      .withIdentity({ ...identity, scope: "analysis:request jobs:read" })
      .mutation(internal.workCloudAnalysis.dispatch, {
        sourceId: s.sourceId,
        generation: approved.generation,
        taskId: "fixture-task",
        operation: "claim",
      }),
  ).rejects.toThrow("FORBIDDEN");
});

it.each(["revoked", "version", "membership", "source", "rights", "retention"])(
  "fences input, heartbeat and completion after %s changes",
  async (change) => {
    const s = await setup(),
      lease = await s.claim();
    await s.t.run(async (ctx) => {
      if (change === "revoked")
        await ctx.db.patch(s.grant.id, { state: "revoked" });
      if (change === "version") await ctx.db.patch(s.grant.id, { version: 2 });
      if (change === "source")
        await ctx.db.patch(s.sourceId, { title: "Different approved input" });
      if (change === "rights")
        await ctx.db.patch(s.sourceId, { rightsAttested: false });
      if (change === "retention")
        await ctx.db.patch(s.sourceId, {
          sourceRetentionUntil: Date.now() - 1,
        });
      if (change === "membership") {
        const membership = (await ctx.db.query("memberships").collect()).find(
          (m) => m.organizationId === s.org,
        )!;
        await ctx.db.delete(membership._id);
      }
    });
    await expect(
      s.assistant.query(internal.workCloudAnalysis.input, lease),
    ).rejects.toThrow();
    await expect(
      s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
        ...lease,
        operation: "heartbeat",
      }),
    ).rejects.toThrow();
    await expect(
      s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
        ...lease,
        operation: "complete",
        output: outputFor(lease),
      }),
    ).rejects.toThrow();
    expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.state).toBe(
      "processing",
    );
  },
);

it("binds a single claim to its OAuth consent, task and secret token without reclaim", async () => {
  const s = await setup(),
    lease = await s.claim();
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      sourceId: lease.sourceId,
      generation: lease.generation,
      taskId: lease.taskId,
      operation: "claim",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  for (const args of [
    { ...lease, taskId: "other-task" },
    { ...lease, leaseToken: "wrong-token" },
  ])
    await expect(
      s.assistant.query(internal.workCloudAnalysis.input, args),
    ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.t
      .withIdentity({
        ...identity,
        sid: "app_consent_98765432109876543210987654",
      })
      .query(internal.workCloudAnalysis.input, lease),
  ).rejects.toThrow("APPROVAL_STALE");
  vi.advanceTimersByTime(40001);
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "heartbeat",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      sourceId: lease.sourceId,
      generation: lease.generation,
      taskId: "new-task",
      operation: "claim",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
});

it("expires unclaimed approval and bounds heartbeats by the fixed task deadline", async () => {
  const s = await setup(),
    approved = await s.approve();
  vi.advanceTimersByTime(900001);
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      sourceId: s.sourceId,
      generation: approved.generation,
      taskId: "late-task",
      operation: "claim",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  const active = await setup(),
    lease = await active.claim();
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(30000);
    await active.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "heartbeat",
    });
  }
  vi.advanceTimersByTime(30001);
  await expect(
    active.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output: outputFor(lease),
    }),
  ).rejects.toThrow("APPROVAL_STALE");
});

it("fences cancelled work and records failure as unknown without permitting reapproval", async () => {
  const s = await setup(),
    lease = await s.claim();
  await s.owner.mutation(api.personalAnalysis.cancel, { id: s.sourceId });
  await expect(
    s.assistant.query(internal.workCloudAnalysis.input, lease),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(s.preview()).rejects.toThrow("APPROVAL_STALE");
  const failed = await setup(),
    failedLease = await failed.claim();
  await expect(
    failed.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...failedLease,
      operation: "fail",
    }),
  ).resolves.toEqual({ accepted: true, state: "unknown", hostStopped: false });
  await expect(failed.preview()).rejects.toThrow("APPROVAL_STALE");
});

it("keeps unresolved claimed-task metadata across an actual source replacement without retaining the old input", async () => {
  const s = await setup(),
    lease = await s.claim();
  await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    ...lease,
    operation: "fail",
  });
  const prior = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  await s.owner.mutation(api.product.attachSource, {
    id: s.sourceId,
    text: "New separately supplied text",
    rightsAttested: true,
  });
  const replaced = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(replaced).toMatchObject({
    text: "New separately supplied text",
    state: "saved",
    generation: lease.generation + 1,
    personalAnalysis: { state: "unknown", generation: lease.generation },
  });
  expect(replaced.personalAnalysis).toEqual(prior.personalAnalysis);
  await expect(s.preview()).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output: outputFor(lease),
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.owner.mutation(api.product.deleteSource, { id: s.sourceId });
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.state).toBe(
    "deleted",
  );
});

it("rejects media and unretained URLs before approval", async () => {
  const s = await setup();
  for (const patch of [
    { kind: "url" as const },
    { kind: "upload" as const },
    { objectKey: "private/object" },
  ]) {
    await s.t.run((ctx) => ctx.db.patch(s.sourceId, patch));
    await expect(s.preview()).rejects.toThrow("SOURCE_UNAVAILABLE");
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, {
        kind: "text",
        objectKey: undefined,
      }),
    );
  }
});

it("rejects secrets, oversized UTF-8 input and completion fields on other operations", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { text: "界".repeat(50000) }),
  );
  await expect(s.preview()).rejects.toThrow("INVALID_INPUT");
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { text: "sk-" + "a".repeat(48) }),
  );
  await expect(s.preview()).rejects.toThrow("INVALID_INPUT");
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { text: s.source.text }));
  const lease = await s.claim();
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "heartbeat",
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
  ).rejects.toThrow("INVALID_INPUT");
});

it("validates completion evidence, UTF-8 size, usage and requested versus reported model", async () => {
  const s = await setup(),
    lease = await s.claim(),
    output = outputFor(lease);
  for (const bad of [
    {
      output: {
        ...output,
        insights: [{ ...output.insights[0], evidence: [] }],
      },
    },
    {
      output: {
        ...output,
        insights: [
          {
            ...output.insights[0],
            evidence: [
              { kind: "user_note", id: "invented", startMs: null, endMs: null },
            ],
          },
        ],
      },
    },
    { output: { ...output, summary: "😀".repeat(30001) } },
    { output, reportedModel: "different-model" },
    { output, usage: { inputTokens: -1, outputTokens: 0 } },
  ])
    await expect(
      s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
        ...lease,
        operation: "complete",
        ...bad,
      }),
    ).rejects.toThrow();
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.state).toBe(
    "processing",
  );
});

it("uses the exact retained text registry, advances its generation once and validates typed citations", async () => {
  const s = await setup(true),
    lease = await s.claim();
  const input = await s.assistant.query(
    internal.workCloudAnalysis.input,
    lease,
  );
  expect(input.inputKind).toBe("source_text");
  expect(JSON.parse(input.outputSchema)).toEqual(sourceInsightSchema);
  expect(input.expectedCoverage).toBe("source_text");
  expect(input.evidence).toEqual([s.typedEvidence]);
  const row = await s.t.run((ctx) => ctx.db.get(input.sourceRevisionId!));
  expect(row?.generation).toBe(lease.generation);
  const output = {
    ...outputFor(lease),
    schemaVersion: "2.0.0",
    coverage: "source_text",
    sourceRevisionId: input.sourceRevisionId,
    sourceContentHash: input.sourceContentHash,
    insights: [
      {
        ...outputFor(lease).insights[0],
        evidence: [
          {
            kind: "github_file",
            id: s.typedEvidence!.id,
            startMs: null,
            endMs: null,
          },
        ],
      },
    ],
  };
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output,
    }),
  ).resolves.toMatchObject({ accepted: true, cached: false });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.analysis?.schemaVersion,
  ).toBe("2.0.0");
  await s.t.run((ctx) =>
    ctx.db.patch(input.sourceRevisionId!, { contentHash: "f".repeat(64) }),
  );
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output,
    }),
  ).rejects.toThrow("INVALID_EVIDENCE");
});

it("cannot switch an unknown claimed Cloud attempt to the managed executor", async () => {
  const s = await setup(),
    lease = await s.claim();
  await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    ...lease,
    operation: "fail",
  });
  const before = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  await expect(
    s.owner.mutation(api.product.processSource, {
      id: s.sourceId,
      maxCredits: 10,
    }),
  ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(before);
});

it("recovers only the owner's current unclaimed approval with active exact grant, settings and input", async () => {
  const s = await setup(),
    approved = await s.approve();
  const first = await s.owner.query(api.product.detail, { id: s.sourceId });
  expect(first.workCloudHandoff).toMatchObject({
    sourceId: s.sourceId,
    generation: approved.generation,
    inputHash: approved.inputHash,
    model: "synthetic-model",
    effort: "high",
    media: false,
    grantVersion: s.grant.version,
  });
  expect(JSON.stringify(first.workCloudHandoff)).not.toContain("leaseToken");
  await expect(
    s.t
      .withIdentity({ subject: "another-owner" })
      .query(api.product.detail, { id: s.sourceId }),
  ).rejects.toThrow();
  vi.stubEnv("WORK_CLOUD_TEXT_ENABLED", "false");
  expect(
    (await s.owner.query(api.product.detail, { id: s.sourceId }))
      .workCloudHandoff,
  ).toBeNull();
  vi.stubEnv("WORK_CLOUD_TEXT_ENABLED", "true");
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { text: "Changed source input" }),
  );
  expect(
    (await s.owner.query(api.product.detail, { id: s.sourceId }))
      .workCloudHandoff,
  ).toBeNull();
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { text: s.source.text }));
  await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    sourceId: s.sourceId,
    generation: approved.generation,
    taskId: "claim-after-reload",
    operation: "claim",
  });
  expect(
    (await s.owner.query(api.product.detail, { id: s.sourceId }))
      .workCloudHandoff,
  ).toBeNull();
});
it.each(["expired", "revoked", "version"])(
  "does not recover a queued handoff after %s authority",
  async (change) => {
    const s = await setup();
    await s.approve();
    if (change === "expired") vi.setSystemTime(Date.now() + 900001);
    else
      await s.t.run(async (ctx) => {
        const g = (await ctx.db.get(s.grant.id))!;
        await ctx.db.patch(
          g._id,
          change === "revoked"
            ? { state: "revoked" }
            : { version: g.version + 1 },
        );
      });
    expect(
      (await s.owner.query(api.product.detail, { id: s.sourceId }))
        .workCloudHandoff,
    ).toBeNull();
  },
);

it("allows an established normal session to approve the exact private Cloud source", async () => {
  const s = await setup(),
    p = await s.preview();
  await expect(
    s.t
      .withIdentity({ subject })
      .mutation(api.workCloudAnalysis.approve, {
        sourceId: s.sourceId,
        generation: p.generation,
        grantId: s.grant.id,
        grantVersion: p.grantVersion,
        expectedInputHash: p.inputHash,
        model: "synthetic-model",
        effort: "high",
        useOwnPlan: true,
        maxApiUsd: 0,
      }),
  ).resolves.toBeDefined();
});
