import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { prepared } from "./chat-proposal-fixture";
import {
  compareProjectRecommendations,
  projectTopicFit,
} from "../packages/contracts/project-fit";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("returns exact existing-plan hints through website and MCP without changing the approval context or charging", async () => {
  const f = await prepared();
  const saved = await f.save();
  const after = await f.read();
  expect(after.contextHash).toBe(f.context.contextHash);
  expect(after.priorProposals.items).toMatchObject([
    { id: saved.proposalId, current: true },
  ]);
  const result = await f.owner.query(api.projectRecommendations.read, {
    organizationId: f.org,
    sourceId: f.sourceId,
  });
  expect(result).toMatchObject({
    rubric: "topic-history-priority-v2",
    creditsSpent: 0,
    analysisStarted: false,
  });
  expect(result.items[0].history.samePost).toMatchObject([
    { id: saved.proposalId, current: true },
  ]);
  expect(result.items[0].history.measuredOutcomes).toBeNull();
  expect(result.items[0]).not.toHaveProperty("context");
  await f.t.run((ctx) => ctx.db.patch(f.projectId, { sha: "b".repeat(40) }));
  expect(
    (
      await f.owner.query(api.projectRecommendations.read, {
        organizationId: f.org,
        sourceId: f.sourceId,
      })
    ).fingerprint,
  ).not.toBe(result.fingerprint);
});

it("stores personal priority with stale-write protection and rejects foreign/assistant sessions", async () => {
  const f = await prepared();
  const input = {
    organizationId: f.org,
    repositoryId: f.projectId,
    priority: "high" as const,
    expectedRevision: 0,
  };
  expect(
    await f.owner.mutation(api.projectRecommendations.setPriority, input),
  ).toEqual({ priority: "high", revision: 1 });
  await expect(
    f.owner.mutation(api.projectRecommendations.setPriority, {
      ...input,
      priority: "low",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  const state = await f.owner.query(api.projectRecommendations.read, {
    organizationId: f.org,
    sourceId: f.sourceId,
  });
  expect(state.items[0]).toMatchObject({
    priority: "high",
    priorityRevision: 1,
  });
  await expect(
    f.assistant.query(api.projectRecommendations.read, {
      organizationId: f.org,
      sourceId: f.sourceId,
    }),
  ).rejects.toThrow("Sign in");
  await expect(
    f.t
      .withIdentity({ subject: "stranger" })
      .mutation(api.projectRecommendations.setPriority, input),
  ).rejects.toThrow();
  const userId = (await f.t.run((ctx) =>
    ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("organizationId", f.org))
      .first(),
  ))!.userId;
  const jobId = await f.t.run((ctx) =>
    ctx.db.insert("deletionJobs", {
      userId,
      subject: "owner",
      state: "pending",
      attempts: 0,
    }),
  );
  await f.t.mutation(internal.accounts.finishDelete, { jobId });
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("projectRecommendationPreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(2),
    ),
  ).toEqual([]);
});

it("separates related-topic plans from same-post plans and stops counting unavailable historical sources", async () => {
  const f = await prepared();
  const priorId = await f.t.run(async (ctx) => {
    const original = (await ctx.db.get(f.sourceId))!;
    const { _id, _creationTime, ...copy } = original;
    const id = await ctx.db.insert("sources", {
      ...copy,
      key: "related-prior-post",
      canonical: "https://www.instagram.com/reel/RelatedOnly/",
      url: "https://www.instagram.com/reel/RelatedOnly/",
    });
    await ctx.db.insert("sourceCategories", {
      organizationId: f.org,
      sourceId: id,
      categoryKey: "coding",
      title: "Related",
      sourceCreatedAt: Date.now(),
      sourceUpdatedAt: Date.now(),
      savedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const proposalId = await ctx.db.insert("proposals", {
      organizationId: f.org,
      sourceId: id,
      repositoryId: f.projectId,
      baseSha: "a".repeat(40),
      profileVersion: 1,
      disposition: "relevant",
      title: "Related earlier plan",
      detail: {},
      review: "accepted",
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("dashboardCards", {
      organizationId: f.org,
      entityId: proposalId,
      proposalId,
      sourceId: id,
      repositoryId: f.projectId,
      kind: "proposal",
      title: "Related earlier plan",
      state: "accepted",
      review: "accepted",
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  });
  const args = { organizationId: f.org, sourceId: f.sourceId };
  const before = await f.owner.query(api.projectRecommendations.read, args);
  expect(before.items[0].history).toMatchObject({
    samePost: [],
    relatedPosts: 1,
    relatedAccepted: 1,
  });
  await f.t.run((ctx) =>
    ctx.db.patch(priorId, { sourceRetentionUntil: Date.now() - 1 }),
  );
  const after = await f.owner.query(api.projectRecommendations.read, args);
  expect(after.items[0].history).toMatchObject({
    relatedPosts: 0,
    relatedAccepted: 0,
  });
  expect(after.fingerprint).not.toBe(before.fingerprint);
});

it("keeps coverage honest and uses declared priorities and observed approvals only as tie breakers", () => {
  expect(
    projectTopicFit(
      ["coding"],
      "Purpose: Sell food.\n\nNon-goals: coding software",
    ).matched,
  ).toBe(0);
  const a = {
    id: "a",
    name: "A",
    fit: { matched: 2, total: 3 },
    priority: "low" as const,
    history: { relatedAccepted: 0, lastPlanActivityAt: null },
  };
  const b = {
    ...a,
    id: "b",
    fit: { matched: 1, total: 3 },
    priority: "high" as const,
  };
  expect(compareProjectRecommendations(a, b)).toBeLessThan(0);
  expect(
    compareProjectRecommendations(a, { ...b, fit: a.fit }),
  ).toBeGreaterThan(0);
  expect(
    compareProjectRecommendations(a, {
      ...a,
      history: { ...a.history, relatedAccepted: 1 },
    }),
  ).toBeGreaterThan(0);
});

it("shows authenticated agent reports separately from GitHub observations and measured outcomes", async () => {
  const f = await prepared();
  const proposal = await f.save();
  const { handoff } = await f.assistant.mutation(
    internal.assistantProposalWork.prepare,
    {
      proposalId: proposal.proposalId,
      expectedVersion: proposal.version,
      expectedReview: proposal.review,
      contextHash: proposal.contextHash,
      key: "recommendation-outcome-handoff",
    },
  );
  await f.assistant.mutation(internal.assistantProposalWork.report, {
    proposalId: proposal.proposalId,
    handoffId: handoff.id,
    key: "recommendation-model-report",
    status: "completed",
    summary: "The agent reports finishing. No measured result is established.",
    workUrls: [],
    commitSha: null,
  });
  const context = await f.read();
  expect(context.priorProposals.items[0].outcome).toEqual({
    githubIssueState: null,
    githubObservedAt: null,
    issuePublicationConfirmed: false,
    modelReportedStatus: "completed",
    measuredBenefit: null,
  });
});
