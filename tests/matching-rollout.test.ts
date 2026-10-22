import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { reserve, settle } from "../convex/product";
import { failedInferenceSettlement } from "../convex/lib/googleInference";
import { RETRIEVAL_VERSION } from "../packages/repositories/retrieval";
import insight from "../fixtures/insight.json";
import proposal from "../fixtures/proposal.json";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function legacyFixture(completed = false) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject: "matching-rollout-owner",
    email: "rollout@example.test",
    name: "Synthetic rollout owner",
  });
  const owner = t.withIdentity({ subject: "matching-rollout-owner" });
  const organizationId = await owner.mutation(api.organizations.create, {
    name: "Matching rollout fixture",
  });
  const now = Date.now();
  const saved = await t.run(async (ctx) => {
    const sourceId = await ctx.db.insert("sources", {
      organizationId,
      key: "rollout-legacy-source",
      canonical: "text:rollout-legacy-source",
      kind: "text",
      title: "Synthetic retained legacy source",
      text: "Permitted synthetic note.",
      state: "ready",
      coverage: "caption_only",
      tags: [],
      rightsAttested: true,
      generation: 1,
      analysis: insight,
      createdAt: now,
      updatedAt: now,
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      installationId: 1,
      providerId: 1,
      fullName: "fixture/rollout",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      status: "ready",
      profile: "Synthetic current project",
      profileVersion: 1,
      manifest: proposal.repositoryEvidence.map((e) => e.path),
      context: "Synthetic inspected context",
      contextExcerpts: proposal.repositoryEvidence.map((e) => ({
        path: e.path,
        startLine: 1,
        endLine: 25,
        blobSha: "b".repeat(40),
        content: Array(25)
          .fill("Synthetic observed repository line")
          .join("\n"),
      })),
      createdAt: now,
      updatedAt: now,
    });
    const detail = {
      ...proposal,
      repositoryId,
      insightIds: insight.insights.map((i) => i.id),
      sourceEvidence: insight.insights.flatMap((i) => i.evidence),
    };
    // Exact pre-upgrade key shape: there was no source.updatedAt component.
    const semanticKey = `match:${RETRIEVAL_VERSION}:${sourceId}:1:${repositoryId}:${"a".repeat(40)}:1`;
    const key = `${semanticKey}:attempt:1`;
    await reserve(ctx, organizationId, key, 10);
    const proposalId = completed
      ? await ctx.db.insert("proposals", {
          organizationId,
          sourceId,
          repositoryId,
          baseSha: "a".repeat(40),
          profileVersion: 1,
          disposition: detail.disposition,
          title: detail.title,
          detail,
          review: "unreviewed",
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
      : undefined;
    const jobId = await ctx.db.insert("matchingJobs", {
      organizationId,
      sourceId,
      repositoryId,
      key: semanticKey,
      reservationKey: key,
      attempt: 1,
      state: completed ? "completed" : "pending",
      ...(proposalId ? { proposalId } : {}),
      insightIds: detail.insightIds,
      createdAt: now,
      updatedAt: now,
      // Deliberately no actor/sourceGeneration/sourceRevision or typed bindings.
    });
    if (completed) await settle(ctx, organizationId, key, 2);
    return {
      sourceId,
      repositoryId,
      detail,
      semanticKey,
      key,
      jobId,
      proposalId,
    };
  });
  const commit = () =>
    t.mutation(internal.product.addProposal, {
      sourceId: saved.sourceId,
      repositoryId: saved.repositoryId,
      detail: saved.detail,
      matchKey: saved.semanticKey,
      sourceGeneration: 1,
    });
  return { t, owner, actor, organizationId, ...saved, commit };
}

it("rejects a pre-upgrade pending completion and settles only measured work once without inventing authority or fallback", async () => {
  const s = await legacyFixture(),
    network = vi.spyOn(globalThis, "fetch");
  const sourceBefore = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  let rejection: unknown;
  try {
    await s.commit();
  } catch (error) {
    rejection = error;
  }
  expect(rejection).toBeInstanceOf(Error);
  expect(String(rejection)).toContain("APPROVAL_STALE");
  const finish = {
    organizationId: s.organizationId,
    key: s.key,
    semanticKey: s.semanticKey,
    ...failedInferenceSettlement(rejection, true, 3),
  };
  await s.t.mutation(internal.jobs.finishMatch, finish);
  await s.t.mutation(internal.jobs.finishMatch, finish);
  await expect(s.commit()).rejects.toThrow("APPROVAL_STALE");
  await s.t.run(async (ctx) => {
    const job = (await ctx.db.get(s.jobId))!;
    expect(job).toMatchObject({
      state: "failed",
      reservationKey: s.key,
      attempt: 1,
    });
    expect(job.actor).toBeUndefined();
    expect(job.sourceGeneration).toBeUndefined();
    expect(job.sourceRevision).toBeUndefined();
    expect(job.proposalId).toBeUndefined();
    expect(await ctx.db.get(s.sourceId)).toEqual(sourceBefore);
    const reservations = await ctx.db.query("reservations").collect();
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      key: s.key,
      max: 10,
      settled: 3,
      state: "settled",
    });
    expect(await ctx.db.query("costEntries").collect()).toMatchObject([
      { key: s.key, credits: 3, units: 3, costStatus: "ceiling_only" },
    ]);
    expect(await ctx.db.query("wallets").collect()).toMatchObject([
      { spent: 3, reserved: 0 },
    ]);
    expect(await ctx.db.query("creditPools").collect()).toMatchObject([
      { spent: 3, reserved: 0 },
    ]);
    for (const budget of await ctx.db.query("operatorBudgets").collect())
      expect(budget).toMatchObject({ spent: 3, reserved: 0 });
    for (const table of [
      "proposals",
      "runs",
      "outbox",
      "localLibraryRuns",
      "inferenceReservations",
    ] as const)
      expect(await ctx.db.query(table).collect()).toEqual([]);
  });
  expect(network).not.toHaveBeenCalled();
});

it("retains unknown pre-upgrade work until measured reconciliation and never revives a deleted source", async () => {
  vi.stubEnv("MANAGED_INFERENCE_ROUTE", "google_metered");
  const s = await legacyFixture();
  await expect(s.commit()).rejects.toThrow("APPROVAL_STALE");
  await s.t.mutation(internal.jobs.finishMatch, {
    organizationId: s.organizationId,
    key: s.key,
    semanticKey: s.semanticKey,
    ...failedInferenceSettlement(new Error("APPROVAL_STALE"), true),
  });
  await s.t.run(async (ctx) => {
    expect(await ctx.db.query("reservations").collect()).toMatchObject([
      { state: "active", max: 10, settled: 0 },
    ]);
    expect(await ctx.db.query("wallets").collect()).toMatchObject([
      { spent: 0, reserved: 10 },
    ]);
    expect(await ctx.db.query("costEntries").collect()).toEqual([]);
    await ctx.db.patch(s.sourceId, { state: "deleted", generation: 2 });
  });
  expect(await s.commit()).toBeNull();
  for (let replay = 0; replay < 2; replay++)
    await s.t.mutation(internal.jobs.finishMatch, {
      organizationId: s.organizationId,
      key: s.key,
      semanticKey: s.semanticKey,
      credits: 4,
    });
  await s.t.run(async (ctx) => {
    expect(await ctx.db.get(s.sourceId)).toMatchObject({
      state: "deleted",
      generation: 2,
    });
    expect(await ctx.db.get(s.jobId)).toMatchObject({ state: "failed" });
    expect((await ctx.db.get(s.jobId))?.actor).toBeUndefined();
    expect(await ctx.db.query("proposals").collect()).toEqual([]);
    expect(await ctx.db.query("reservations").collect()).toMatchObject([
      { state: "settled", settled: 4 },
    ]);
    expect(await ctx.db.query("wallets").collect()).toMatchObject([
      { spent: 4, reserved: 0 },
    ]);
    expect(await ctx.db.query("costEntries").collect()).toHaveLength(1);
  });
});

it("does not silently replay completed legacy cache or backfill its actor when a user explicitly requests a fresh quote", async () => {
  const s = await legacyFixture(true),
    network = vi.spyOn(globalThis, "fetch");
  const old = await s.t.run((ctx) =>
    Promise.all([ctx.db.get(s.jobId), ctx.db.get(s.proposalId!)]),
  );
  await expect(s.commit()).rejects.toThrow("APPROVAL_STALE");
  const fresh = await s.owner.mutation(api.jobs.reserveMatch, {
    id: s.sourceId,
    repositoryId: s.repositoryId,
    maxCredits: 10,
  });
  expect(fresh.cached).toBe(false);
  expect(fresh.semanticKey).not.toBe(s.semanticKey);
  expect(fresh.key).not.toBe(s.key);
  await s.t.run(async (ctx) => {
    expect(
      await Promise.all([ctx.db.get(s.jobId), ctx.db.get(s.proposalId!)]),
    ).toEqual(old);
    const jobs = await ctx.db.query("matchingJobs").collect();
    expect(jobs).toHaveLength(2);
    expect(jobs.find((j) => j.key === fresh.semanticKey)).toMatchObject({
      actor: s.actor,
      state: "pending",
      sourceGeneration: 1,
    });
    expect(jobs.find((j) => j.key === s.semanticKey)?.actor).toBeUndefined();
    expect(await ctx.db.query("proposals").collect()).toHaveLength(1);
    expect(await ctx.db.query("costEntries").collect()).toMatchObject([
      { key: s.key, credits: 2 },
    ]);
    expect(await ctx.db.query("wallets").collect()).toMatchObject([
      { spent: 2, reserved: 10 },
    ]);
    expect(await ctx.db.query("runs").collect()).toEqual([]);
    // Execution approval lives on runs.approvedBy, not a separate approvals table.
    expect((await ctx.db.get(s.proposalId!))?.review).toBe("unreviewed");
    expect((await ctx.db.get(s.proposalId!))?.planHash).toBeUndefined();
    expect(await ctx.db.query("outbox").collect()).toEqual([]);
  });
  expect(network).not.toHaveBeenCalled();
});
