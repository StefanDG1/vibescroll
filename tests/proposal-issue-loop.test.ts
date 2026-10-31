import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepared, body } from "./chat-proposal-fixture";
import { api, internal } from "../convex/_generated/api";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture() {
  const f = await prepared();
  const saved = await f.assistant.mutation(internal.assistantProposals.save, {
    ...f.input,
    body: {
      ...body,
      disposition: "relevant",
      steps: ["Inspect current code", "Implement and verify"],
    },
  });
  const current = await f.owner.query(api.proposalLoop.read, {
    proposalId: saved.proposalId,
  });
  const input = {
    proposalId: saved.proposalId,
    expectedVersion: 1,
    contextHash: current.contextHash,
    key: "approve-issue-one",
    visibility: "public" as const,
    acknowledged: true,
  };
  return { ...f, proposalId: saved.proposalId, approval: input };
}
it("atomically approves one exact version and freezes one issue under concurrent duplicate clicks", async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([
    f.owner.mutation(api.proposalIssues.approve, f.approval),
    f.owner.mutation(api.proposalIssues.approve, f.approval),
  ]);
  expect(a.operationId).toBe(b.operationId);
  expect(
    await f.t.run((ctx) => ctx.db.query("proposalOperations").collect()),
  ).toHaveLength(1);
  const p = await f.t.run((ctx) => ctx.db.get(f.proposalId));
  expect(p?.review).toBe("accepted");
  expect(p?.detail.handoff.body).toContain("## Implementation plan");
  await expect(
    f.owner.mutation(api.proposalIssues.approve, {
      ...f.approval,
      key: "different-approval",
    }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
it("rejects stale, unacknowledged and foreign approvals without changing review or freezing a handoff", async () => {
  const f = await fixture();
  await expect(
    f.owner.mutation(api.proposalIssues.approve, {
      ...f.approval,
      expectedVersion: 2,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    f.owner.mutation(api.proposalIssues.approve, {
      ...f.approval,
      acknowledged: false,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    f.t
      .withIdentity({ subject: "stranger" })
      .mutation(api.proposalIssues.approve, f.approval),
  ).rejects.toThrow();
  expect(await f.t.run((ctx) => ctx.db.get(f.proposalId))).toMatchObject({
    review: "unreviewed",
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("proposalOperations").collect()),
  ).toEqual([]);
});
it("retains the dispatch barrier after a lost response; lookup absence never allows another POST", async () => {
  const f = await fixture();
  const { operationId } = await f.owner.mutation(
    api.proposalIssues.approve,
    f.approval,
  );
  const claim = await f.t.mutation(internal.proposalIssues.claim, {
    operationId,
  });
  expect(
    await f.t.mutation(internal.proposalIssues.claim, { operationId }),
  ).toBeNull();
  expect(
    await f.t.mutation(internal.proposalIssues.dispatch, {
      operationId,
      leaseId: claim!.leaseId,
      visibility: "public",
    }),
  ).toBe(true);
  await f.t.mutation(internal.proposalIssues.finish, {
    operationId,
    leaseId: claim!.leaseId,
    errorCode: "TIMEOUT",
  });
  expect(await f.t.run((ctx) => ctx.db.get(operationId))).toMatchObject({
    state: "unknown",
  });
  await f.owner.mutation(api.proposalIssues.retry, {
    proposalId: f.proposalId,
    operationId,
  });
  const retry = await f.t.mutation(internal.proposalIssues.claim, {
    operationId,
  });
  expect(retry!.receipt.dispatchedAt).toBeTruthy();
  expect(
    await f.t.mutation(internal.proposalIssues.dispatch, {
      operationId,
      leaseId: retry!.leaseId,
      visibility: "public",
    }),
  ).toBe(false);
  await f.t.mutation(internal.proposalIssues.finish, {
    operationId,
    leaseId: retry!.leaseId,
  });
  expect(await f.t.run((ctx) => ctx.db.get(operationId))).toMatchObject({
    state: "unknown",
  });
  await expect(
    f.assistant.mutation(internal.assistantProposals.save, {
      ...f.input,
      proposalId: f.proposalId,
      expectedVersion: 1,
      expectedReview: "accepted",
      key: "edit-while-unknown",
    }),
  ).rejects.toThrow("SOURCE_BUSY");
});
it("known preflight failure can retry the same intent, verifies exact bytes and keeps API receipts distinct from webhooks", async () => {
  const f = await fixture();
  const { operationId } = await f.owner.mutation(
    api.proposalIssues.approve,
    f.approval,
  );
  let c = await f.t.mutation(internal.proposalIssues.claim, { operationId });
  await expect(
    f.t.mutation(internal.proposalIssues.dispatch, {
      operationId,
      leaseId: c!.leaseId,
      visibility: "private",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await f.t.mutation(internal.proposalIssues.finish, {
    operationId,
    leaseId: c!.leaseId,
    errorCode: "ISSUES_PERMISSION_REQUIRED",
  });
  await f.owner.mutation(api.proposalIssues.retry, {
    proposalId: f.proposalId,
    operationId,
  });
  const previous = c;
  c = await f.t.mutation(internal.proposalIssues.claim, { operationId });
  await expect(
    f.t.mutation(internal.proposalIssues.dispatch, {
      operationId,
      leaseId: previous!.leaseId,
      visibility: "public",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await f.t.mutation(internal.proposalIssues.dispatch, {
    operationId,
    leaseId: c!.leaseId,
    visibility: "public",
  });
  const issue = {
    number: 12,
    html_url: "https://github.com/owned/synthetic/issues/12",
    title: c!.handoff.title,
    body: c!.handoff.body,
  };
  await f.t.mutation(internal.proposalIssues.finish, {
    operationId,
    leaseId: c!.leaseId,
    issue: { ...issue, body: "copied marker" },
  });
  expect(await f.t.run((ctx) => ctx.db.get(operationId))).toMatchObject({
    state: "unknown",
  });
  await f.t.mutation(internal.proposalIssues.finish, {
    operationId,
    leaseId: c!.leaseId,
    issue,
  });
  const p = await f.t.run((ctx) => ctx.db.get(f.proposalId));
  expect(p?.detail.handoff.publication).toMatchObject({
    provenance: "github_api_receipt",
    number: 12,
    bodyMatchesFrozen: true,
  });
  expect(p?.detail.handoff.githubIssue).toBeUndefined();
  expect(await f.t.run((ctx) => ctx.db.get(operationId))).toMatchObject({
    state: "complete",
  });
});
