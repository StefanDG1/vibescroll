import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { makePreparedEvidence } from "../packages/contracts/prepared-evidence";
import { sharedTypedCitations } from "../convex/lib/sourceCitations";
import {
  analyzePreparedEvidence,
  preparedInsightModel,
} from "../packages/providers/vercel-insights";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function fixture(executor: "gateway" | "work_cloud" = "gateway") {
  vi.useFakeTimers();
  const s = await analysisVersionFixture();
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  const actor = (await s.t.run((ctx) =>
    ctx.db.get(source.personalAnalysis!.actor),
  ))!;
  vi.stubEnv(
    "PREPARED_MEDIA_ALPHA_JSON",
    JSON.stringify({
      id: "bounded-prepared-test",
      subject: actor.subject,
      canonical: source.canonical,
      maximumRuns: 2,
      maximumApiUsd: 0.05,
      expiresAt: Date.now() + 3600000,
      executor,
      contributorAllowed: true,
    }),
  );
  vi.stubEnv("WORK_CLOUD_SAVED_LINKS_ENABLED", "true");
  vi.stubEnv("WORK_CLOUD_SAVED_LINKS_VERIFIED", "true");
  vi.stubEnv(
    "WORK_CLOUD_ADMISSION_JSON",
    JSON.stringify({
      id: "prepared-owner-policy",
      subject: actor.subject,
      maximumJobs: 100,
      maximumHourlyJobs: 20,
      period: "day",
      startsAt: Date.now(),
      expiresAt: null,
    }),
  );
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.grant.id, {
      cloudSaveDefaults: {
        version: "link-save-cloud-v2",
        model: "synthetic-new-model",
        effort: "high",
        retentionMs: 86400000,
      },
    });
    if (
      !(await ctx.db
        .query("storageUsage")
        .withIndex("by_org", (q) => q.eq("organizationId", s.org))
        .unique())
    )
      await ctx.db.insert("storageUsage", {
        organizationId: s.org,
        bytes: s.bytes.length,
      });
  });
  await s.assistant.mutation(internal.assistantEvents.install, {
    profileId: s.org,
    grantVersion: s.grant.version,
    eventName: "video_link_saved",
    externalId: "sub_" + "b".repeat(64),
    ciphertext: "synthetic-prepared-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  });
  const args = {
    organizationId: s.org,
    url: source.url!,
    key: "prepared-comparison-key",
  };
  const begin = () => s.owner.mutation(api.preparedAnalysis.begin, args);
  return { ...s, source, actor, args, begin };
}

async function retain(s: Awaited<ReturnType<typeof fixture>>, runId: any) {
  expect(await s.t.mutation(internal.preparedAnalysis.claim, { runId })).toBe(
    true,
  );
  expect(await s.t.mutation(internal.preparedAnalysis.claim, { runId })).toBe(
    false,
  );
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId,
    stage: "transcribing",
  });
  const prepared = await makePreparedEvidence({
    requestedCanonical: s.source.canonical,
    canonical: s.source.canonical,
    platform: "instagram",
    sourceHash: "a".repeat(64),
    recipeHash: "b".repeat(64),
    downloaderVersion: "2026.10.26",
    title: "Prepared public demonstration",
    authorName: "creator",
    durationMs: 10000,
    language: "en",
    observedAt: Date.now(),
    transcript: {
      origin: "platform_manual",
      model: null,
      provider: null,
      inputSha256: "c".repeat(64),
    },
    segments: [
      { id: "speech-1", startMs: 0, endMs: 1000, text: "Check the evidence." },
    ],
    frames: [
      {
        id: "frame-1",
        timestampMs: 1000,
        sha256: createHash("sha256").update(s.bytes).digest("hex"),
        bytes: s.bytes.length,
        width: 2,
        height: 2,
      },
    ],
  });
  const frame = prepared.evidence.frames[0];
  const running = await s.t.run((ctx) => ctx.db.get(runId));
  expect(running).toMatchObject({
    organizationId: s.org,
    canonical: prepared.requestedCanonical,
  });
  const evidenceId = await s.t.mutation(internal.preparedAnalysis.retain, {
    runId,
    prepared,
    receipt: { preparation: { stopAcknowledged: true } },
    frames: [
      {
        frameId: frame.id,
        key: `${s.org}/prepared-fixture`,
        size: frame.bytes,
        sha256: frame.sha256,
        width: frame.width,
        height: frame.height,
        timestampMs: frame.timestampMs,
      },
    ],
  });
  return { prepared, evidenceId };
}

it("keeps a source-scoped immutable transcript response after failure and strips provider metadata", async () => {
  const s = await fixture(),
    { runId } = await s.begin();
  const response = {
    text: "Returned speech",
    language: "en",
    durationInSeconds: 10,
    segments: [{ text: "Returned speech", startSecond: 0, endSecond: 10.003 }],
  };
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId,
    kind: "asr_output",
    receipt: {
      ...response,
      providerMetadata: { ignored: "not transcript data" },
    },
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId,
    code: "INVALID_EVIDENCE",
  });
  const status = await s.owner.query(api.preparedAnalysis.status, { runId });
  expect(status.receipt.asr_output).toEqual(response);
  await expect(
    s.t.mutation(internal.preparedAnalysis.recordReceipt, {
      runId,
      kind: "asr_output",
      receipt: { ...response, text: "Changed speech" },
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  await expect(
    s.t
      .withIdentity({ subject: "user_foreign_synthetic" })
      .query(api.preparedAnalysis.status, { runId }),
  ).rejects.toThrow();
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.analysis).toEqual(
    s.output,
  );
});

it("allows explicit retry of returned rejected ASR while preserving its hold and incumbent; timeouts stay blocked", async () => {
  const s = await fixture(),
    { runId } = await s.begin();
  await s.t.mutation(internal.preparedAnalysis.claim, { runId });
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId,
    stage: "transcribing",
  });
  vi.setSystemTime(Date.now() + 2500);
  const asr = {
    model: "microsoft/mai-transcribe-2",
    provider: "azure",
    startedAt: Date.now() - 2000,
    completedAt: Date.now(),
    providerSettledUsd: null,
  };
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId,
    kind: "preparation",
    receipt: { stopAcknowledged: true },
  });
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId,
    kind: "asr",
    receipt: asr,
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId,
    code: "INVALID_EVIDENCE",
  });
  const failed = await s.owner.query(api.preparedAnalysis.status, { runId });
  expect(failed.state).toBe("failed");
  expect(failed.receipt.asr).toEqual(asr);
  // The previously deployed implementation called this same returned failure
  // unknown. Reconciliation changes execution state, never its receipts/holds.
  await s.t.run((ctx) => ctx.db.patch(runId, { state: "unknown" }));
  expect(
    await s.t.mutation(internal.preparedAnalysis.reconcileReturnedFailure, {
      runId,
    }),
  ).toBe(true);
  const retry = await s.owner.mutation(api.preparedAnalysis.begin, {
    ...s.args,
    key: "explicit-second-preparation",
  });
  expect(retry.runId).not.toBe(runId);
  await s.t.mutation(internal.preparedAnalysis.claim, { runId: retry.runId });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId: retry.runId,
    code: "PROVIDER_TIMEOUT",
  });
  await expect(
    s.t.mutation(internal.preparedAnalysis.reconcileReturnedFailure, {
      runId: retry.runId,
    }),
  ).rejects.toThrow(/COST_RECONCILIATION_REQUIRED/);
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.analysis).toEqual(
    s.output,
  );
});

it("enforces the expanded four-preparation limit even when every ASR response is a known rejection", async () => {
  const s = await fixture();
  const policy = JSON.parse(process.env.PREPARED_MEDIA_ALPHA_JSON!);
  vi.stubEnv(
    "PREPARED_MEDIA_ALPHA_JSON",
    JSON.stringify({ ...policy, maximumRuns: 4 }),
  );
  for (let i = 0; i < 4; i++) {
    const { runId } = await s.owner.mutation(api.preparedAnalysis.begin, {
      ...s.args,
      key: `four-preparation-${i}`,
    });
    await s.t.mutation(internal.preparedAnalysis.claim, { runId });
    await s.t.mutation(internal.preparedAnalysis.progress, {
      runId,
      stage: "transcribing",
    });
    vi.setSystemTime(Date.now() + 2500);
    await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
      runId,
      kind: "preparation",
      receipt: { stopAcknowledged: true },
    });
    await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
      runId,
      kind: "asr",
      receipt: {
        model: "microsoft/mai-transcribe-2",
        provider: "azure",
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
      },
    });
    await s.t.mutation(internal.preparedAnalysis.fail, {
      runId,
      code: "INVALID_EVIDENCE",
    });
  }
  await expect(
    s.owner.mutation(api.preparedAnalysis.begin, {
      ...s.args,
      key: "fifth-preparation-blocked",
    }),
  ).rejects.toThrow(/QUOTA_EXCEEDED/);
});

function output(
  s: Awaited<ReturnType<typeof fixture>>,
  attemptId: string,
  prepared: Awaited<ReturnType<typeof makePreparedEvidence>>,
) {
  return {
    summary: s.output.summary,
    warnings: s.output.warnings,
    schemaVersion: "analysis-version-output-v1",
    sourceId: s.sourceId,
    attemptId,
    evidenceHash: prepared.evidence.evidenceHash,
    postRevisionHash: prepared.evidence.sourceRevisionHash,
    insights: s.output.insights.map((insight: any) => ({
      ...insight,
      evidence: [
        { kind: "video_observation", id: "speech-1", startMs: 0, endMs: 1000 },
      ],
    })),
  };
}

function rejectedGeneration(at: number) {
  return {
    id: "gen_" + "a".repeat(26),
    created_at: new Date(at).toISOString(),
    model: preparedInsightModel,
    provider_name: "meta",
    finish_reason: "error",
    total_cost: 0,
    upstream_inference_cost: 0,
    tokens_prompt: 0,
    tokens_completion: 0,
    native_tokens_prompt: 0,
    native_tokens_completion: 0,
  };
}

it("recovers a zero-inference Gateway rejection once from exact retained evidence with a fresh finite deadline", async () => {
  const s = await fixture(),
    { runId } = await s.begin(),
    { prepared, evidenceId } = await retain(s, runId);
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId,
    stage: "analyzing",
  });
  const rejectedAt = Date.now();
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId,
    code: "PROVIDER_ERROR",
  });
  const old = (await s.t.run((ctx) => ctx.db.get(runId)))!;
  vi.setSystemTime(old.deadline + 1);
  const args = {
    runId,
    key: "retained-analysis-retry",
    generation: rejectedGeneration(rejectedAt),
  };
  // Cost, actual model and matching request time must all be established.
  for (const generation of [
    { ...args.generation, total_cost: 0.001 },
    { ...args.generation, tokens_prompt: 1 },
    { ...args.generation, model: "another-model" },
    {
      ...args.generation,
      created_at: new Date(rejectedAt - 60000).toISOString(),
    },
  ]) {
    await expect(
      s.t.mutation(internal.preparedAnalysis.claimGatewayRetry, {
        ...args,
        generation,
      }),
    ).rejects.toThrow();
  }
  expect(
    await Promise.all([
      s.t.mutation(internal.preparedAnalysis.claimGatewayRetry, args),
      s.t.mutation(internal.preparedAnalysis.claimGatewayRetry, args),
    ]),
  ).toEqual([true, false]);
  const claimed = (await s.t.run((ctx) => ctx.db.get(runId)))!;
  expect(claimed.deadline).toBe(old.deadline);
  expect(claimed.receipt.originalGatewayFailure).toEqual(old.receipt.failure);
  expect(claimed.receipt.gatewayRetry).toMatchObject({
    state: "claimed",
    evidenceId,
    deadline: Date.now() + 180000,
  });
  await s.t.mutation(internal.preparedAnalysis.expire, { runId });
  expect((await s.t.run((ctx) => ctx.db.get(runId)))!.state).toBe("analyzing");
  await expect(
    s.t.query(internal.preparedAnalysis.gatewayRetryInput, {
      runId,
      key: "another-retry-key",
    }),
  ).rejects.toThrow(/COST_RECONCILIATION_REQUIRED/);
  const input = await s.t.query(internal.preparedAnalysis.gatewayRetryInput, {
    runId,
    key: args.key,
    claimed: true,
  });
  expect(input).toMatchObject({ existing: false, prepared });
  const versionId = await s.t.mutation(
    internal.preparedAnalysis.finishGateway,
    {
      runId,
      output: output(s, runId, prepared),
      receipt: { model: preparedInsightModel, rateEstimateUsd: 0.001 },
    },
  );
  expect((await s.t.run((ctx) => ctx.db.get(runId)))!).toMatchObject({
    state: "ready",
    versionId,
    receipt: { gatewayRetry: { state: "completed" } },
  });
  expect(
    await s.t.query(internal.preparedAnalysis.gatewayRetryInput, {
      runId,
      key: args.key,
    }),
  ).toEqual({ existing: true });
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.analysis).toEqual(
    s.output,
  );
});

it("does not convert an ambiguous paid analysis or stale evidence authority into a retained retry", async () => {
  const s = await fixture(),
    { runId } = await s.begin();
  await retain(s, runId);
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId,
    stage: "analyzing",
  });
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId,
    kind: "analysis",
    receipt: { model: preparedInsightModel, inputTokens: 10 },
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId,
    code: "PROVIDER_ERROR",
  });
  const args = {
    runId,
    key: "blocked-paid-retry",
    generation: rejectedGeneration(Date.now()),
  };
  await expect(
    s.t.mutation(internal.preparedAnalysis.claimGatewayRetry, args),
  ).rejects.toThrow(/COST_RECONCILIATION_REQUIRED/);
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  await expect(
    s.t.query(internal.preparedAnalysis.gatewayRetryInput, {
      runId,
      key: args.key,
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
});

it("permits only one separately funded second schema correction after another proven zero-token rejection", async () => {
  const s = await fixture(),
    { runId } = await s.begin();
  await retain(s, runId);
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId,
    stage: "analyzing",
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId,
    code: "PROVIDER_ERROR",
  });
  const first = {
    runId,
    key: "first-schema-correction",
    generation: rejectedGeneration(Date.now()),
  };
  await s.t.mutation(internal.preparedAnalysis.claimGatewayRetry, first);
  vi.setSystemTime(Date.now() + 5000);
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId,
    kind: "analysis_rejection",
    receipt: { httpStatus: 400, generationId: "gen_" + "b".repeat(26) },
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId,
    code: "PROVIDER_ERROR",
  });
  const second = {
    runId,
    key: "second-schema-correction",
    maximumApiUsd: 0.02 as const,
    generation: {
      ...rejectedGeneration(Date.now()),
      id: "gen_" + "b".repeat(26),
    },
  };
  await expect(
    s.t.mutation(internal.preparedAnalysis.claimGatewayRetry, {
      ...second,
      generation: first.generation,
    }),
  ).rejects.toThrow();
  expect(
    await s.t.mutation(internal.preparedAnalysis.claimGatewayRetry, second),
  ).toBe(true);
  const input = await s.t.query(internal.preparedAnalysis.gatewayRetryInput, {
    runId,
    key: second.key,
    claimed: true,
  });
  expect(input).toMatchObject({ maximumApiUsd: 0.02, retryOrdinal: 2 });
  expect(
    (await s.t.run((ctx) => ctx.db.get(runId)))!.receipt.gatewayRetryHistory,
  ).toHaveLength(1);
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId,
    code: "PROVIDER_ERROR",
  });
  await expect(
    s.t.query(internal.preparedAnalysis.gatewayRetryInput, {
      runId,
      key: "third-retry-is-blocked",
    }),
  ).rejects.toThrow(/COST_RECONCILIATION_REQUIRED/);
});

it.each([false, true])(
  "an app Save can reuse independent prepared evidence without another download, ASR or asset copy, prior validation failed=%s",
  async (rejected) => {
    const s = await fixture(),
      { runId } = await s.begin(),
      { prepared, evidenceId } = await retain(s, runId);
    await s.t.mutation(internal.preparedAnalysis.progress, {
      runId,
      stage: "analyzing",
    });
    if (rejected) {
      vi.setSystemTime(Date.now() + 1000);
      await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
        runId,
        kind: "analysis",
        receipt: {
          model: preparedInsightModel,
          provider: "meta",
          requestId: "gen_" + "c".repeat(26),
          startedAt: Date.now() - 500,
          completedAt: Date.now(),
          rateEstimateUsd: 0.001,
        },
      });
      await s.t.mutation(internal.preparedAnalysis.fail, {
        runId,
        code: "INVALID_EVIDENCE",
      });
    } else
      await s.t.mutation(internal.preparedAnalysis.finishGateway, {
        runId,
        output: output(s, runId, prepared),
        receipt: { model: preparedInsightModel, rateEstimateUsd: 0.001 },
      });
    const policy = JSON.parse(process.env.PREPARED_MEDIA_ALPHA_JSON!);
    vi.stubEnv(
      "PREPARED_MEDIA_ALPHA_JSON",
      JSON.stringify({
        ...policy,
        executor: "work_cloud",
        maximumApiUsd: 0.02,
        reuseEvidenceFromRunId: runId,
      }),
    );
    const scheduledBefore = await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const saved = await s.owner.mutation(api.workCloudSaves.capture, {
      ...s.args,
      key: "prepared-reuse-save",
      title: s.source.title,
      rightsAttested: true,
      grantId: s.grant.id,
      grantVersion: s.grant.version,
    });
    expect(saved.status).toBe("preparing_evidence");
    const runs = await s.t.run((ctx) =>
      ctx.db
        .query("mediaPreparations")
        .withIndex("by_org_source", (q) =>
          q.eq("organizationId", s.org).eq("sourceId", s.sourceId),
        )
        .collect(),
    );
    const next = runs.find((r) => r._id !== runId)!;
    expect(next).toMatchObject({
      state: "evidence_ready",
      evidenceId,
      receipt: { reusedPreparation: { runId, evidenceId } },
    });
    const scheduledAfter = await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const added = scheduledAfter.filter(
      (r) => !scheduledBefore.some((old) => old._id === r._id),
    );
    expect(
      added.some((r) => r.name.includes("preparedAnalysis:queueSubscription")),
    ).toBe(true);
    expect(added.some((r) => r.name.includes("preparedMedia:run"))).toBe(false);
    const attemptId = await s.t.mutation(
      internal.preparedAnalysis.queueSubscription,
      { runId: next._id },
    );
    const attempt = await s.t.run((ctx) => ctx.db.get(attemptId));
    expect(attempt!.evidenceId).toBe(evidenceId);
    expect((await s.t.run((ctx) => ctx.db.get(runId)))!.state).toBe(
      rejected ? "unknown" : "ready",
    );
    expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.analysis).toEqual(
      s.output,
    );
    // A stale or foreign evidence choice cannot silently fall back to acquisition.
    vi.stubEnv(
      "PREPARED_MEDIA_ALPHA_JSON",
      JSON.stringify({
        ...policy,
        executor: "work_cloud",
        reuseEvidenceFromRunId: "foreign-run",
      }),
    );
    await expect(
      s.owner.mutation(api.workCloudSaves.capture, {
        ...s.args,
        key: "foreign-evidence-save",
        title: s.source.title,
        rightsAttested: true,
        grantId: s.grant.id,
        grantVersion: s.grant.version,
      }),
    ).rejects.toThrow();
  },
);

it("retains a private immutable rejected model answer and bounded diagnostics without publishing it", async () => {
  const s = await fixture(),
    { runId } = await s.begin(),
    raw = {
      model: preparedInsightModel,
      requestId: "gen_" + "d".repeat(26),
      responseSha256: "f".repeat(64),
      content: '{"summary":"Rejected model answer"}',
    };
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId,
    kind: "analysis_output",
    receipt: raw,
  });
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId,
    kind: "analysis_validation",
    receipt: {
      code: "GATEWAY_OUTPUT_SCHEMA_INVALID",
      issues: [{ path: "insights", code: "invalid_type" }],
    },
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId,
    code: "INVALID_EVIDENCE",
  });
  const status = await s.owner.query(api.preparedAnalysis.status, { runId });
  expect(status.receipt.analysis_output).toEqual(raw);
  expect(status.versionId).toBeNull();
  await expect(
    s.t.mutation(internal.preparedAnalysis.recordReceipt, {
      runId,
      kind: "analysis_output",
      receipt: { ...raw, content: "changed" },
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  await expect(
    s.t
      .withIdentity({ subject: "foreign-user" })
      .query(api.preparedAnalysis.status, { runId }),
  ).rejects.toThrow();
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.analysis).toEqual(
    s.output,
  );
});

it("creates one separately funded API version from independent evidence, preserving the rejected run and enforcing paid and fresh quotas separately", async () => {
  const s = await fixture(),
    first = await s.begin(),
    { prepared, evidenceId } = await retain(s, first.runId);
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId: first.runId,
    stage: "analyzing",
  });
  vi.setSystemTime(Date.now() + 1000);
  const paid = {
    model: preparedInsightModel,
    provider: "meta",
    requestId: "gen_" + "e".repeat(26),
    startedAt: Date.now() - 500,
    completedAt: Date.now(),
    rateEstimateUsd: 0.001,
  };
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId: first.runId,
    kind: "analysis",
    receipt: paid,
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId: first.runId,
    code: "INVALID_EVIDENCE",
  });
  const policy = JSON.parse(process.env.PREPARED_MEDIA_ALPHA_JSON!);
  vi.stubEnv(
    "PREPARED_MEDIA_ALPHA_JSON",
    JSON.stringify({
      ...policy,
      maximumRuns: 3,
      maximumFreshPreparations: 1,
      maximumGatewayAnalyses: 2,
      maximumApiUsd: 0.02,
      reuseEvidenceFromRunId: first.runId,
    }),
  );
  const second = await s.owner.mutation(api.preparedAnalysis.begin, {
    ...s.args,
    key: "separate-retained-api-version",
  });
  const r = (await s.t.run((ctx) => ctx.db.get(second.runId)))!;
  expect(r).toMatchObject({
    state: "evidence_ready",
    evidenceId,
    deadline: Date.now() + 180000,
    receipt: { reusedPreparation: { runId: first.runId } },
  });
  expect(
    await s.t.mutation(internal.preparedAnalysis.claimRetainedGateway, {
      runId: second.runId,
    }),
  ).toBe(true);
  expect(
    await s.t.mutation(internal.preparedAnalysis.claimRetainedGateway, {
      runId: second.runId,
    }),
  ).toBe(false);
  expect(
    await s.t.query(internal.preparedAnalysis.retainedGatewayInput, {
      runId: second.runId,
    }),
  ).toMatchObject({ prepared, maximumApiUsd: 0.02 });
  const versionId = await s.t.mutation(
    internal.preparedAnalysis.finishGateway,
    {
      runId: second.runId,
      output: output(s, second.runId, prepared),
      receipt: paid,
    },
  );
  const original = (await s.t.run((ctx) => ctx.db.get(first.runId)))!;
  expect(original.state).toBe("unknown");
  expect(original.receipt.analysis).toEqual(paid);
  await expect(
    s.owner.mutation(api.preparedAnalysis.begin, {
      ...s.args,
      key: "third-paid-analysis-blocked",
    }),
  ).rejects.toThrow(/QUOTA_EXCEEDED/);
  vi.stubEnv(
    "PREPARED_MEDIA_ALPHA_JSON",
    JSON.stringify({
      ...policy,
      maximumRuns: 3,
      maximumFreshPreparations: 1,
      maximumGatewayAnalyses: 2,
      maximumApiUsd: 0.02,
      executor: "work_cloud",
      reuseEvidenceFromRunId: first.runId,
    }),
  );
  await s.owner.mutation(api.workCloudSaves.capture, {
    ...s.args,
    key: "native-uses-independent-evidence",
    title: s.source.title,
    rightsAttested: true,
    grantId: s.grant.id,
    grantVersion: s.grant.version,
  });
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.analysis).toEqual(
    s.output,
  );
  expect((await s.t.run((ctx) => ctx.db.get(versionId)))!.evidenceId).toBe(
    evidenceId,
  );
});

it("uses Gateway's strict required-property subset, preserving local citation validation and rejection diagnostics", async () => {
  const s = await fixture(),
    { runId } = await s.begin(),
    { prepared } = await retain(s, runId);
  const expected = output(s, runId, prepared),
    requests: any[] = [],
    receipts: any[] = [],
    outputs: any[] = [],
    validations: any[] = [];
  const args = {
    sourceId: s.sourceId,
    attemptId: runId,
    prepared,
    frames: [{ id: "frame-1", bytes: s.bytes }],
    apiKey: "synthetic-api-credential-only",
    maximumUsd: 0.03,
    contributorAllowed: true,
  };
  let rejection = false,
    invalidCitation = false;
  const transport: typeof fetch = async (url, init) => {
    if (String(url).endsWith("/models"))
      return Response.json({
        data: [
          {
            id: preparedInsightModel,
            modalities: { input: ["image"] },
            tags: ["structured-output"],
            pricing: { input: "0.0000001", output: "0.0000002" },
          },
        ],
      });
    requests.push(JSON.parse(init!.body as string));
    if (rejection)
      return Response.json(
        {
          id: "gen_" + "b".repeat(26),
          error: {
            message:
              "Invalid schema " + args.apiKey + " https://private.example/test",
          },
        },
        { status: 400 },
      );
    const result = structuredClone(expected);
    if (invalidCitation) result.insights[0].evidence[0].id = "invented-frame";
    const body = {
      summary: result.summary,
      warnings: result.warnings,
      insights: result.insights,
    };
    return Response.json({
      id: "gen_" + "c".repeat(26),
      model: preparedInsightModel,
      usage: { prompt_tokens: 100, completion_tokens: 200 },
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(body) } },
      ],
    });
  };
  expect(
    (await analyzePreparedEvidence({ ...args, fetch: transport })).output,
  ).toEqual(expected);
  expect(requests[0].response_format.json_schema.strict).toBe(true);
  expect(
    requests[0].response_format.json_schema.schema.properties.insights.items
      .required,
  ).toContain("icon");
  expect(
    requests[0].response_format.json_schema.schema.properties.insights.items
      .required,
  ).toContain("topics");
  expect(requests[0].response_format.json_schema.schema.required).toEqual([
    "summary",
    "warnings",
    "insights",
  ]);
  expect(
    requests[0].response_format.json_schema.schema.properties.insights.items
      .properties.evidence.items.anyOf,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        properties: expect.objectContaining({
          id: { type: "string", const: "speech-1" },
          startMs: { type: "integer", const: 0 },
          endMs: { type: "integer", const: 1000 },
        }),
      }),
    ]),
  );
  expect(requests[0].messages[1].content[0].text).not.toContain(s.sourceId);
  invalidCitation = true;
  await expect(
    analyzePreparedEvidence({
      ...args,
      fetch: transport,
      onOutput: async (r) => {
        outputs.push(r);
      },
      onValidation: async (r) => {
        validations.push(r);
      },
    }),
  ).rejects.toThrow(/INVALID_EVIDENCE/);
  expect(outputs).toHaveLength(1);
  expect(outputs[0].content).toContain("invented-frame");
  expect(validations[0]).toMatchObject({
    code: "ANALYSIS_VERSION_CITATION_INVALID",
    responseSha256: outputs[0].responseSha256,
  });
  invalidCitation = false;
  rejection = true;
  await expect(
    analyzePreparedEvidence({
      ...args,
      fetch: transport,
      onRejection: async (r) => {
        receipts.push(r);
      },
    }),
  ).rejects.toThrow(/PROVIDER_ERROR/);
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({
    httpStatus: 400,
    generationId: "gen_" + "b".repeat(26),
    message: "Invalid schema [redacted] [url]",
  });
  expect(receipts[0].responseSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(requests).toHaveLength(3);
});

it("claims once, replays Save idempotently, fences concurrent preparation and preserves the incumbent pixels", async () => {
  const s = await fixture();
  const first = await s.begin();
  expect((await s.begin()).runId).toBe(first.runId);
  const claimed = await Promise.all([
    s.t.mutation(internal.preparedAnalysis.claim, { runId: first.runId }),
    s.t.mutation(internal.preparedAnalysis.claim, { runId: first.runId }),
  ]);
  expect(claimed.sort()).toEqual([false, true]);
  await expect(
    s.owner.mutation(api.preparedAnalysis.begin, {
      ...s.args,
      key: "different-prepared-key",
    }),
  ).rejects.toThrow(/QUOTA_EXCEEDED|SOURCE_BUSY/);
  const next = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(next.analysis).toEqual(s.output);
  expect(next.updatedAt).toBe(s.source.updatedAt);
  expect(next.personalMedia.cloudFrames).toEqual(
    s.source.personalMedia.cloudFrames,
  );
  expect(
    await s.owner.query(api.assets.evidence, { id: s.assetId }),
  ).toMatchObject({ type: "image/jpeg" });
  const metadata: any[] = await s.owner.query(api.preparedAnalysis.liveMany, {
    organizationId: s.org,
    sourceIds: [s.sourceId],
  });
  expect(metadata[0].personalMedia.stage).toBe("starting");
  expect(metadata[0].analysis).toBeUndefined();
  expect(metadata[0].orderedMedia).toBeUndefined();
  expect(metadata[0].personalMedia.cloudFrames).toBeUndefined();
  vi.stubEnv("PREPARED_MEDIA_ALPHA_JSON", "");
  await expect(
    s.t.query(internal.preparedAnalysis.input, { runId: first.runId }),
  ).rejects.toThrow(/APPROVAL_STALE/);
});

it("stores exact prepared images, a managed candidate and immutable idempotent completion without replacing an incumbent", async () => {
  const s = await fixture(),
    { runId } = await s.begin();
  const { prepared, evidenceId } = await retain(s, runId);
  const evidence = (await s.t.run((ctx) => ctx.db.get(evidenceId)))!;
  expect(
    await s.owner.query(api.assets.evidence, {
      id: evidence.frames[0].assetId!,
    }),
  ).toMatchObject({ type: "image/jpeg" });
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId,
    stage: "analyzing",
  });
  const result = output(s, runId, prepared),
    receipt = {
      model: "meta/muse-spark-1.3-contributor",
      rateEstimateUsd: 0.003,
    };
  const versionId = await s.t.mutation(
    internal.preparedAnalysis.finishGateway,
    { runId, output: result, receipt },
  );
  const history = await s.owner.query(api.analysisVersions.history, {
    sourceId: s.sourceId,
    paginationOpts: { numItems: 5, cursor: null },
  });
  expect(history.page.find((v) => v.id === versionId)).toMatchObject({
    state: "ready",
    insightCount: result.insights.length,
  });
  expect(history.selectedVersionId).toBe(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.selectedAnalysisVersionId,
  );
  expect(history.selectedVersionId).not.toBe(versionId);
  expect(
    await s.t.mutation(internal.preparedAnalysis.finishGateway, {
      runId,
      output: result,
      receipt,
    }),
  ).toBe(versionId);
  expect(
    await s.owner.query(api.analysisVersions.read, {
      sourceId: s.sourceId,
      versionId,
    }),
  ).toMatchObject({
    version: { number: 2, provenance: "managed_api_reported" },
    output: { summary: result.summary },
  });
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.analysis).toEqual(
    s.output,
  );
  await s.owner.mutation(api.analysisVersions.select, {
    sourceId: s.sourceId,
    versionId,
    expectedSelectionRevision: 0,
  });
  const projected = await s.owner.query(api.product.detail, {
    id: s.sourceId,
    organizationId: s.org,
  });
  expect(projected.preparedService?.transcript[0].text).toBe(
    "Check the evidence.",
  );
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!;
    const citations = await sharedTypedCitations(ctx, source, versionId);
    expect(citations?.sourceContentHash).toBe(
      prepared.evidence.sourceRevisionHash,
    );
  });
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  await expect(
    s.owner.query(api.assets.evidence, { id: evidence.frames[0].assetId! }),
  ).rejects.toThrow(/unavailable/);
});

it.each([false, true])(
  "an app Save uses the existing subscription tools for retained evidence, initial=%s",
  async (initial) => {
    const s = await fixture("work_cloud");
    if (initial)
      await s.t.run((ctx) =>
        ctx.db.patch(s.sourceId, {
          state: "needs_upload",
          generation: 0,
          analysis: undefined,
          orderedMedia: undefined,
          personalAnalysis: undefined,
          personalMedia: undefined,
        }),
      );
    const saved = await s.owner.mutation(api.workCloudSaves.capture, {
      ...s.args,
      title: s.source.title,
      rightsAttested: true,
      grantId: s.grant.id,
      grantVersion: s.grant.version,
    });
    expect(saved.status).toBe("preparing_evidence");
    const run = await s.t.run((ctx) =>
      ctx.db
        .query("mediaPreparations")
        .withIndex("by_org_source", (q) =>
          q.eq("organizationId", s.org).eq("sourceId", s.sourceId),
        )
        .unique(),
    );
    const { prepared } = await retain(s, run!._id);
    const attemptId = await s.t.mutation(
      internal.preparedAnalysis.queueSubscription,
      { runId: run!._id },
    );
    const task = {
      sourceId: s.sourceId,
      attemptId,
      taskId: "prepared-native-event",
    };
    const claim = await s.assistant.mutation(
      internal.analysisVersions.dispatch,
      {
        ...task,
        operation: "claim",
      },
    );
    const context = await s.assistant.query(internal.analysisVersions.input, {
      ...task,
      leaseToken: claim.leaseToken,
    });
    expect(context).toMatchObject({
      inputKind: "retained_evidence",
      maxApiUsd: 0,
      transcript: [{ text: "Check the evidence." }],
    });
    await s.assistant.mutation(internal.analysisVersions.acknowledgeFrame, {
      ...task,
      leaseToken: claim.leaseToken,
      frameId: "frame-1",
    });
    await s.assistant.mutation(internal.analysisVersions.dispatch, {
      ...task,
      leaseToken: claim.leaseToken,
      operation: "complete",
      output: output(s, attemptId, prepared),
    });
    expect(
      await s.owner.query(api.preparedAnalysis.status, { runId: run!._id }),
    ).toMatchObject({ state: "ready" });
    const completed = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    const history = await s.assistant.query(api.analysisVersions.history, {
      sourceId: s.sourceId,
      paginationOpts: { numItems: 5, cursor: null },
    });
    expect(history.page[0]).toMatchObject({
      state: "ready",
      insightCount: s.output.insights.length,
    });
    if (initial) {
      expect(completed.state).toBe("ready");
      expect(completed.selectedAnalysisVersionId).toBeTruthy();
      expect(completed.personalAnalysis).toBeUndefined();
      expect(
        await s.owner.query(api.analysisVersions.read, {
          sourceId: s.sourceId,
        }),
      ).toMatchObject({ version: { number: 1 } });
    } else expect(completed.analysis).toEqual(s.output);
  },
);
