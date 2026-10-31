import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { cloudWaitingCurrent } from "../convex/lib/assistantEvents";
import { privateCloudMediaCanonicalMatches } from "../packages/social/contracts";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("shares the configured owner daily allowance with retained reanalysis and keeps its idempotent replay free", async () => {
  const s = await analysisVersionFixture();
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  const actor = (await s.t.run((ctx) =>
    ctx.db.get(source.personalAnalysis!.actor),
  ))!;
  vi.stubEnv(
    "WORK_CLOUD_ADMISSION_JSON",
    JSON.stringify({
      id: "owner-version-policy",
      subject: actor.subject,
      maximumJobs: 100,
      maximumHourlyJobs: 20,
      period: "day",
      startsAt: Date.now(),
      expiresAt: null,
    }),
  );
  const requested = await s.request();
  const replay = await s.request();
  expect(replay.attemptId).toBe(requested.attemptId);
  const key = `work-cloud-admission:${actor._id}:owner-version-policy:day:${Math.floor(Date.now() / 86400000)}`;
  const row = await s.t.run((ctx) =>
    ctx.db
      .query("limits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
  );
  expect(row?.count).toBe(1);
  await s.owner.mutation(api.analysisVersions.cancelWaiting, {
    sourceId: s.sourceId,
    attemptId: requested.attemptId,
  });
  await s.t.run((ctx) => ctx.db.patch(row!._id, { count: 100 }));
  await expect(s.request("owner-limit-new-version")).rejects.toThrow(
    /QUOTA_EXCEEDED/,
  );
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.analysis).toEqual(
    s.output,
  );
});
it("requires an app waiting subscription transactionally while allowing an authorized active MCP chat", async () => {
  const s = await analysisVersionFixture(false);
  await expect(s.request()).rejects.toThrow(/SETUP_REQUIRED/);
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("analysisAttempts")
        .withIndex("by_org", (q) => q.eq("organizationId", s.org))
        .take(1),
    ),
  ).toEqual([]);
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.selectedAnalysisVersionId,
  ).toBeUndefined();
  expect(
    await s.assistant.mutation(api.analysisVersions.request, {
      sourceId: s.sourceId,
      key: "active-chat-request",
      configuration: s.config,
      expectedSelectionRevision: 0,
    }),
  ).toMatchObject({ state: "queued" });
});
it("cancels only an unclaimed request and preserves the incumbent and unknown-work fence", async () => {
  const s = await analysisVersionFixture();
  const first = await s.request();
  expect(
    await s.owner.mutation(api.analysisVersions.cancelWaiting, {
      sourceId: s.sourceId,
      attemptId: first.attemptId,
    }),
  ).toEqual({ cancelled: true });
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.analysis).toEqual(
    s.output,
  );
  const second = await s.request("new-request-after-cancel");
  const claim = await s.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: s.sourceId,
    attemptId: second.attemptId,
    taskId: "claimed-before-cancel",
    operation: "claim",
  });
  await expect(
    s.owner.mutation(api.analysisVersions.cancelWaiting, {
      sourceId: s.sourceId,
      attemptId: second.attemptId,
    }),
  ).rejects.toThrow(/SOURCE_BUSY/);
  await s.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: s.sourceId,
    attemptId: second.attemptId,
    taskId: "claimed-before-cancel",
    leaseToken: claim.leaseToken,
    operation: "fail",
  });
  await expect(
    s.owner.mutation(api.analysisVersions.cancelWaiting, {
      sourceId: s.sourceId,
      attemptId: second.attemptId,
    }),
  ).rejects.toThrow(/SOURCE_BUSY/);
});
it("matches the actual Reel URL alias without accepting another post or an invalid locator", () => {
  const canonical = "https://www.instagram.com/p/De0mgVbtXE-/";
  expect(
    privateCloudMediaCanonicalMatches(
      "https://www.instagram.com/reel/De0mgVbtXE-/",
      canonical,
    ),
  ).toBe(true);
  expect(
    privateCloudMediaCanonicalMatches(
      "https://www.instagram.com/reels/De0mgVbtXE-/",
      canonical,
    ),
  ).toBe(true);
  expect(
    privateCloudMediaCanonicalMatches(
      "https://www.instagram.com/reel/De4hAfmovyg/",
      canonical,
    ),
  ).toBe(false);
  expect(privateCloudMediaCanonicalMatches("not-a-post", canonical)).toBe(
    false,
  );
});
it("delivers and exports an alias-bound candidate but blocks a different post identity", async () => {
  const s = await analysisVersionFixture(true);
  const request = await s.request();
  const snapshot = await s.t.run(async (ctx) => ({
    source: (await ctx.db.get(s.sourceId))!,
    attempt: (await ctx.db.get(request.attemptId))!,
    subscription: (
      await ctx.db
        .query("assistantSubscriptions")
        .withIndex("by_org", (q) => q.eq("organizationId", s.org))
        .take(1)
    )[0],
    deliveries: await ctx.db
      .query("assistantDeliveries")
      .withIndex("by_org", (q) => q.eq("organizationId", s.org))
      .take(2),
  }));
  expect(snapshot.deliveries).toMatchObject([
    { analysisAttemptId: request.attemptId, state: "pending" },
  ]);
  const occurrence = {
    generation: snapshot.attempt.sourceGeneration,
    completedRevision: snapshot.attempt.createdAt,
    analysisAttemptId: request.attemptId,
  };
  expect(
    await s.t.run((ctx) =>
      cloudWaitingCurrent(
        ctx,
        snapshot.subscription,
        snapshot.source,
        occurrence,
      ),
    ),
  ).toBe(true);
  for (const section of [
    "analysisEvidence",
    "analysisVersions",
    "analysisAttempts",
  ] as const) {
    const exported = await s.owner.query(api.jobs.exportPage, {
      organizationId: s.org,
      section,
      cursor: null,
      asOf: Date.now(),
    });
    expect(exported.page).toHaveLength(1);
  }
  const changed = {
    ...snapshot.source,
    canonical: "https://www.instagram.com/reel/Different123/",
  };
  expect(
    await s.t.run((ctx) =>
      cloudWaitingCurrent(ctx, snapshot.subscription, changed, occurrence),
    ),
  ).toBe(false);
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { canonical: changed.canonical }),
  );
  await expect(
    s.owner.query(api.analysisVersions.read, { sourceId: s.sourceId }),
  ).rejects.toThrow(/expired or changed/);
});
it("keeps human version numbers monotonic when enrolling a later extraction baseline", async () => {
  const s = await analysisVersionFixture();
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { nextAnalysisVersionNumber: 7 }),
  );
  const baseline = await s.owner.mutation(api.analysisVersions.enroll, {
    sourceId: s.sourceId,
  });
  expect((await s.t.run((ctx) => ctx.db.get(baseline.versionId)))?.number).toBe(
    7,
  );
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.nextAnalysisVersionNumber,
  ).toBe(8);
});
it("expires only unclaimed requests and permits a separately keyed fresh request", async () => {
  const s = await analysisVersionFixture();
  const request = await s.request();
  await s.t.run((ctx) =>
    ctx.db.patch(request.attemptId, { expiresAt: Date.now() - 1 }),
  );
  await s.t.mutation(internal.analysisVersions.expire, {
    attemptId: request.attemptId,
  });
  expect((await s.t.run((ctx) => ctx.db.get(request.attemptId)))?.state).toBe(
    "cancelled",
  );
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.pendingAnalysisAttemptId,
  ).toBeUndefined();
  expect(await s.request("separately-new-request")).toMatchObject({
    state: "queued",
    number: 3,
  });
});
it.each(["deleted", "rights_withdrawn", "evidence_blocked"])(
  "blocks content export immediately after %s without waiting for erasure",
  async (failure) => {
    const s = await analysisVersionFixture();
    const request = await s.request();
    vi.useFakeTimers();
    if (failure === "deleted")
      await s.owner.mutation(api.product.deleteSource, { id: s.sourceId });
    else if (failure === "rights_withdrawn")
      await s.t.run((ctx) =>
        ctx.db.patch(s.sourceId, { rightsAttested: false }),
      );
    else
      await s.t.run(async (ctx) => {
        const attempt = (await ctx.db.get(request.attemptId))!;
        await ctx.db.patch(attempt.evidenceId, { state: "blocked" });
      });
    for (const section of [
      "analysisEvidence",
      "analysisVersions",
      "analysisAttempts",
    ] as const) {
      const exported = await s.owner.query(api.jobs.exportPage, {
        organizationId: s.org,
        section,
        cursor: null,
        asOf: Date.now(),
      });
      expect(exported.page).toEqual([]);
    }
  },
);
it("uses the effective source-retention deadline for both evidence and every baseline version", async () => {
  const s = await analysisVersionFixture();
  const shorter = Date.now() + 60000;
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { sourceRetentionUntil: shorter }),
  );
  const enrolled = await s.owner.mutation(api.analysisVersions.enroll, {
    sourceId: s.sourceId,
  });
  const version = (await s.t.run((ctx) => ctx.db.get(enrolled.versionId)))!;
  const evidence = (await s.t.run((ctx) => ctx.db.get(version.evidenceId)))!;
  expect(version.retainUntil).toBe(shorter);
  expect(evidence.retainUntil).toBe(shorter);
});
it("quarantines restored version authority and removes compact source selections before recovery unlock", async () => {
  const s = await analysisVersionFixture();
  await s.request();
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "sources",
    cursor: null,
  });
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(source.selectedAnalysisVersionId).toBeUndefined();
  expect(source.selectedAnalysisSummary).toBeUndefined();
  for (const section of [
    "analysisEvidence",
    "analysisVersions",
    "analysisAttempts",
  ] as const) {
    await s.t.mutation(internal.recovery.quarantinePage, {
      section,
      cursor: null,
    });
    expect(await s.t.run((ctx) => ctx.db.query(section).take(1))).toEqual([]);
  }
});
it("cancels an unclaimed candidate when input is explicitly replaced, but fences a claimed candidate", async () => {
  const s = await analysisVersionFixture();
  const queued = await s.request();
  await s.owner.mutation(api.product.editSource, {
    id: s.sourceId,
    summary: "User supplied replacement",
    tags: [],
    correctedText: "Explicit replacement text.",
  });
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(source.selectedAnalysisVersionId).toBeUndefined();
  expect(source.selectedAnalysisSummary).toBeUndefined();
  expect((await s.t.run((ctx) => ctx.db.get(queued.attemptId)))?.state).toBe(
    "cancelled",
  );
  const other = await analysisVersionFixture();
  const attempt = await other.request();
  await other.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: other.sourceId,
    attemptId: attempt.attemptId,
    taskId: "active-candidate",
    operation: "claim",
  });
  await expect(
    other.owner.mutation(api.product.editSource, {
      id: other.sourceId,
      summary: "Replacement",
      tags: [],
      correctedText: "New source text.",
    }),
  ).rejects.toThrow(/Reconcile/);
  expect(
    (await other.t.run((ctx) => ctx.db.get(other.sourceId)))?.generation,
  ).toBe(1);
});
it("enrolls a baseline once without changing original results, provenance or frame grants", async () => {
  const s = await analysisVersionFixture();
  const before = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  const beforeFrame = await s.owner.query(api.assets.evidence, {
    id: s.assetId,
  });
  const first = await s.owner.mutation(api.analysisVersions.enroll, {
    sourceId: s.sourceId,
  });
  expect(
    await s.owner.mutation(api.analysisVersions.enroll, {
      sourceId: s.sourceId,
    }),
  ).toEqual(first);
  const after = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  for (const field of [
    "analysis",
    "orderedMedia",
    "personalAnalysis",
    "personalMedia",
    "generation",
    "updatedAt",
  ] as const)
    expect(after?.[field]).toEqual(before?.[field]);
  expect(await s.owner.query(api.assets.evidence, { id: s.assetId })).toEqual(
    beforeFrame,
  );
  expect(
    await s.owner.query(api.analysisVersions.history, {
      sourceId: s.sourceId,
      paginationOpts: { numItems: 10, cursor: null },
    }),
  ).toMatchObject({
    selectionRevision: 0,
    page: [{ number: 1, summary: s.output.summary }],
  });
});
it("isolates a queued/running/unknown candidate from the selected result and deduplicates requests", async () => {
  const s = await analysisVersionFixture();
  const request = await s.request();
  expect(await s.request()).toEqual(request);
  await expect(s.request("another-new-key")).rejects.toThrow(/already/);
  const claim = await s.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: s.sourceId,
    attemptId: request.attemptId,
    taskId: "new-task",
    operation: "claim",
  });
  const lease = {
    sourceId: s.sourceId,
    attemptId: request.attemptId,
    taskId: "new-task",
    leaseToken: claim.leaseToken,
  };
  await expect(
    s.assistant.mutation(internal.analysisVersions.dispatch, {
      sourceId: s.sourceId,
      attemptId: request.attemptId,
      taskId: "other-task",
      operation: "claim",
    }),
  ).rejects.toThrow();
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.analysis).toEqual(
    s.output,
  );
  await s.assistant.mutation(internal.analysisVersions.dispatch, {
    ...lease,
    operation: "fail",
  });
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.state).toBe("ready");
  expect(
    await s.owner.query(api.assets.evidence, { id: s.assetId }),
  ).toHaveProperty("key");
  await expect(s.request("third-new-request")).rejects.toThrow(/unresolved/);
});
it("completes an attempt once, preserves the incumbent, then selects and rolls back without another job", async () => {
  const s = await analysisVersionFixture();
  const request = await s.request();
  const claim = await s.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: s.sourceId,
    attemptId: request.attemptId,
    taskId: "new-task",
    operation: "claim",
  });
  const lease = {
    sourceId: s.sourceId,
    attemptId: request.attemptId,
    taskId: "new-task",
    leaseToken: claim.leaseToken,
  };
  const input = await s.assistant.query(internal.analysisVersions.input, lease);
  expect(input).toMatchObject({
    inputKind: "retained_evidence",
    publication: "private_only",
    maxApiUsd: 0,
  });
  const output = {
    schemaVersion: "analysis-version-output-v1",
    sourceId: s.sourceId,
    attemptId: request.attemptId,
    evidenceHash: input.evidenceHash,
    postRevisionHash: input.postRevisionHash,
    summary: "A better grounded candidate.",
    warnings: [],
    insights: s.output.insights,
  };
  await expect(
    s.assistant.mutation(internal.analysisVersions.dispatch, {
      ...lease,
      operation: "complete",
      output,
    }),
  ).rejects.toThrow(/every retained image/);
  await s.assistant.mutation(internal.analysisVersions.acknowledgeFrame, {
    ...lease,
    frameId: "frame-1",
  });
  const done = await s.assistant.mutation(internal.analysisVersions.dispatch, {
    ...lease,
    operation: "complete",
    output,
  });
  expect(
    await s.assistant.mutation(internal.analysisVersions.dispatch, {
      ...lease,
      operation: "complete",
      output,
    }),
  ).toMatchObject({ cached: true, versionId: done.versionId });
  await expect(
    s.assistant.mutation(internal.analysisVersions.dispatch, {
      ...lease,
      operation: "complete",
      output: { ...output, summary: "Changed after completion" },
    }),
  ).rejects.toThrow(/cannot change/);
  const beforeSelection = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  const baselineId = beforeSelection.selectedAnalysisVersionId!;
  expect(beforeSelection.analysis).toEqual(s.output);
  await s.owner.mutation(api.analysisVersions.select, {
    sourceId: s.sourceId,
    versionId: done.versionId!,
    expectedSelectionRevision: 0,
  });
  expect(
    await s.owner.query(api.analysisVersions.read, { sourceId: s.sourceId }),
  ).toMatchObject({
    version: { number: 2 },
    output: { summary: output.summary },
  });
  await expect(
    s.owner.mutation(api.analysisVersions.select, {
      sourceId: s.sourceId,
      versionId: baselineId,
      expectedSelectionRevision: 0,
    }),
  ).rejects.toThrow(/selected analysis changed/);
  await s.owner.mutation(api.analysisVersions.select, {
    sourceId: s.sourceId,
    versionId: baselineId,
    expectedSelectionRevision: 1,
  });
  expect(
    await s.owner.query(api.analysisVersions.read, { sourceId: s.sourceId }),
  ).toMatchObject({
    version: { number: 1 },
    output: { summary: s.output.summary },
  });
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.analysis).toEqual(
    s.output,
  );
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("analysisAttempts")
        .withIndex("by_org_source", (q) =>
          q.eq("organizationId", s.org).eq("sourceId", s.sourceId),
        )
        .take(5),
    ),
  ).toHaveLength(1);
});
