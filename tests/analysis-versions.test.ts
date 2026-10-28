import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
