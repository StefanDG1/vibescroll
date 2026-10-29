import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { makePreparedEvidence } from "../packages/contracts/prepared-evidence";
import { sharedTypedCitations } from "../convex/lib/sourceCitations";

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
