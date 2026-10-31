import { afterEach, beforeEach, expect, it, vi } from "vitest";
import agentTest from "@convex-dev/agent/test";
import { body, prepared } from "./chat-proposal-fixture";
import type { Id } from "../convex/_generated/dataModel";
import { api, internal } from "../convex/_generated/api";
import { proposalPlanSettlement } from "../packages/contracts/proposal-loop";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture() {
  const f = await prepared();
  agentTest.register(f.t);
  const proposal = await f.save();
  vi.stubEnv(
    "PROPOSAL_SERVICE_CONFIGURATION_JSON",
    JSON.stringify({
      version: "proposal-service-v1",
      id: "plan-test-policy",
      enabled: true,
      subjects: ["user_01234567890123456789012345"],
      model: "zai/glm-5.3-flash",
      maximumApiUsd: 0.02,
      maximumTotalJobs: 5,
      privateProjectContextAllowed: true,
      permissionReference: "Synthetic isolated provider permission",
    }),
  );
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({
      version: "prepared-service-v1",
      id: "legacy-test-policy",
      enabled: true,
      maximumDurationMs: 600000,
      maximumApiUsd: 0.05,
      maximumDailyJobs: 10,
      maximumHourlyJobs: 5,
      maximumTotalJobs: 10,
      legacyOwnerFundingOrganizationId: f.org,
      contributorAllowed: true,
      providerPermissionReference: "Synthetic isolated provider permission",
      catalogPublicationAllowed: true,
    }),
  );
  return { ...f, proposalId: proposal.proposalId };
}
it("persists one message for duplicate/concurrent requests, survives reads and keeps author/version server-owned", async () => {
  const f = await fixture();
  const input = {
    proposalId: f.proposalId,
    expectedVersion: 1,
    key: "message-one-stable",
    text: "Keep the first useful result visible.",
  };
  const [a, b] = await Promise.all([
    f.owner.mutation(api.proposalLoop.comment, input),
    f.owner.mutation(api.proposalLoop.comment, input),
  ]);
  expect(a.messageId).toBe(b.messageId);
  const r = await f.owner.query(api.proposalLoop.read, {
    proposalId: f.proposalId,
  });
  expect(r.messages.page).toHaveLength(1);
  expect(r.messages.page[0]).toMatchObject({
    body: input.text,
    proposalVersion: 1,
    role: "user",
  });
  expect(r.discussionRevision).toBe(1);
  await expect(
    f.owner.mutation(api.proposalLoop.comment, {
      ...input,
      text: "Different content",
    }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect(
    (
      await f.assistant.query(api.proposalLoop.read, {
        proposalId: f.proposalId,
      })
    ).messages.page[0].id,
  ).toBe(a.messageId);
});
it("rejects another account, stale plan writes and protected URLs without appending messages", async () => {
  const f = await fixture();
  await expect(
    f.t
      .withIdentity({ subject: "stranger" })
      .query(api.proposalLoop.read, { proposalId: f.proposalId }),
  ).rejects.toThrow();
  await expect(
    f.owner.mutation(api.proposalLoop.comment, {
      proposalId: f.proposalId,
      expectedVersion: 2,
      key: "message-stale",
      text: "Feedback",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    f.owner.mutation(api.proposalLoop.comment, {
      proposalId: f.proposalId,
      expectedVersion: 1,
      key: "message-private",
      text: "https://example.test/?token=private",
    }),
  ).rejects.toThrow("POLICY_BLOCKED");
  expect(
    (await f.owner.query(api.proposalLoop.read, { proposalId: f.proposalId }))
      .messages.page,
  ).toEqual([]);
});
it("attributes MCP content as assistant content and rechecks grant revocation on reads", async () => {
  const f = await fixture();
  await f.assistant.mutation(api.proposalLoop.comment, {
    proposalId: f.proposalId,
    expectedVersion: 1,
    key: "model-message-one",
    text: "A model suggestion, not an execution report.",
  });
  expect(
    (await f.owner.query(api.proposalLoop.read, { proposalId: f.proposalId }))
      .messages.page[0],
  ).toMatchObject({ author: "Assistant", role: "assistant" });
  await f.owner.mutation(api.assistantGrants.revoke, {
    id: f.grant.id,
    expectedVersion: f.grant.version,
  });
  await expect(
    f.assistant.query(api.proposalLoop.read, { proposalId: f.proposalId }),
  ).rejects.toThrow();
  expect(
    (await f.owner.query(api.proposalLoop.read, { proposalId: f.proposalId }))
      .messages.page,
  ).toHaveLength(1);
});
it("binds the plan quote to discussion revision and preserves source/proposal versions while commenting", async () => {
  const f = await fixture();
  const before = await f.owner.query(api.proposalLoop.quote, {
    proposalId: f.proposalId,
  });
  await f.owner.mutation(api.proposalLoop.comment, {
    proposalId: f.proposalId,
    expectedVersion: 1,
    key: "quote-comment-one",
    text: "Focus on mobile.",
  });
  const after = await f.owner.query(api.proposalLoop.quote, {
    proposalId: f.proposalId,
  });
  expect(after.quoteId).not.toBe(before.quoteId);
  expect(after).toMatchObject({
    maximumCredits: 3,
    version: 1,
    discussionRevision: 1,
    fundingOrganizationId: f.org,
  });
  await expect(
    f.owner.mutation(api.proposalLoop.start, {
      proposalId: f.proposalId,
      expectedVersion: 1,
      key: "stale-plan-quote",
      quoteId: before.quoteId,
      maximumCredits: 3,
    }),
  ).rejects.toThrow("QUOTE_CHANGED");
  expect(
    (await f.owner.query(api.proposalLoop.read, { proposalId: f.proposalId }))
      .version,
  ).toBe(1);
});
it("rounds only the accumulated provider and infrastructure cost", () => {
  expect(proposalPlanSettlement(100, 100)).toEqual({
    credits: 1,
    estimatedUsd: 0.0010325,
  });
  expect(proposalPlanSettlement(120000, 0).credits).toBe(1);
  expect(proposalPlanSettlement(120001, 0).credits).toBe(2);
  expect(() => proposalPlanSettlement(-1, 1)).toThrow();
});

async function started() {
  const f = await fixture();
  const q = await f.owner.query(api.proposalLoop.quote, {
    proposalId: f.proposalId,
  });
  const input = {
    proposalId: f.proposalId,
    expectedVersion: 1,
    key: "generation-test-one",
    quoteId: q.quoteId,
    maximumCredits: 3,
  };
  const result = await f.owner.mutation(api.proposalLoop.start, input);
  return {
    ...f,
    startInput: input,
    operationId: result.operation!.id as Id<"proposalOperations">,
  };
}
const generated = (ids: string[]) => ({
  message: "Here is the revised plan.",
  body: {
    ...body,
    disposition: "relevant",
    proposedChange: "Add a focused mobile review flow.",
  },
  steps: ["Inspect current code.", "Implement and verify the focused change."],
  insightIds: ids,
});
it("reserves and admits concurrent duplicates once, claims once and settles a validated version once", async () => {
  const f = await started();
  await Promise.all([
    f.owner.mutation(api.proposalLoop.start, f.startInput),
    f.owner.mutation(api.proposalLoop.start, f.startInput),
  ]);
  expect(
    await f.t.run((ctx) => ctx.db.query("proposalServiceCounters").collect()),
  ).toMatchObject([{ jobs: 1 }]);
  expect(
    await f.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
  expect(
    await f.t.mutation(internal.proposalLoop.claim, {
      operationId: f.operationId,
    }),
  ).toBeTruthy();
  expect(
    await f.t.mutation(internal.proposalLoop.claim, {
      operationId: f.operationId,
    }),
  ).toBeNull();
  await f.t.mutation(internal.proposalLoop.recordReceipt, {
    operationId: f.operationId,
    receipt: { inputTokens: 1000, outputTokens: 1000 },
  });
  const finish = {
    operationId: f.operationId,
    requestStarted: true,
    output: generated(f.input.insightIds),
  };
  await f.t.mutation(internal.proposalLoop.finish, finish);
  await f.t.mutation(internal.proposalLoop.finish, finish);
  const read = await f.owner.query(api.proposalLoop.read, {
    proposalId: f.proposalId,
  });
  expect(read).toMatchObject({
    version: 2,
    review: "unreviewed",
    discussionRevision: 1,
    operation: null,
  });
  expect(read.body.steps).toHaveLength(2);
  expect(read.messages.page).toHaveLength(1);
  expect(
    await f.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([{ state: "settled", settled: 1 }]);
});
it("refunds failure before dispatch and preserves the unknown hold after dispatch", async () => {
  const f = await started();
  await f.t.mutation(internal.proposalLoop.finish, {
    operationId: f.operationId,
    requestStarted: false,
    errorCode: "SETUP_REQUIRED",
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([{ state: "settled", settled: 0 }]);
  const g = await started();
  await g.t.mutation(internal.proposalLoop.claim, {
    operationId: g.operationId,
  });
  await g.t.mutation(internal.proposalLoop.finish, {
    operationId: g.operationId,
    requestStarted: true,
    errorCode: "TIMEOUT",
  });
  expect(
    await g.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([{ state: "active", max: 3 }]);
  await expect(
    g.owner.mutation(api.proposalLoop.start, {
      ...g.startInput,
      key: "another-generation",
    }),
  ).rejects.toThrow("SOURCE_BUSY");
});
it("does not overwrite a plan when discussion changes during generation and still settles known usage", async () => {
  const f = await started();
  await f.t.mutation(internal.proposalLoop.claim, {
    operationId: f.operationId,
  });
  await f.owner.mutation(api.proposalLoop.comment, {
    proposalId: f.proposalId,
    expectedVersion: 1,
    key: "concurrent-comment",
    text: "A different direction.",
  });
  await f.t.mutation(internal.proposalLoop.recordReceipt, {
    operationId: f.operationId,
    receipt: { inputTokens: 50, outputTokens: 50 },
  });
  await f.t.mutation(internal.proposalLoop.finish, {
    operationId: f.operationId,
    requestStarted: true,
    output: generated(f.input.insightIds),
  });
  expect(
    (await f.owner.query(api.proposalLoop.read, { proposalId: f.proposalId }))
      .version,
  ).toBe(1);
  expect(await f.t.run((ctx) => ctx.db.get(f.operationId))).toMatchObject({
    state: "stale",
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([{ settled: 1 }]);
});
it("rechecks MCP revocation before claiming paid work", async () => {
  const f = await fixture();
  const q = await f.assistant.query(api.proposalLoop.quote, {
    proposalId: f.proposalId,
  });
  const result = await f.assistant.mutation(api.proposalLoop.start, {
    proposalId: f.proposalId,
    expectedVersion: 1,
    key: "revoked-generation",
    quoteId: q.quoteId,
    maximumCredits: 3,
  });
  await f.owner.mutation(api.assistantGrants.revoke, {
    id: f.grant.id,
    expectedVersion: f.grant.version,
  });
  await expect(
    f.t.mutation(internal.proposalLoop.claim, {
      operationId: result.operation!.id as Id<"proposalOperations">,
    }),
  ).rejects.toThrow();
  await f.t.mutation(internal.proposalLoop.finish, {
    operationId: result.operation!.id,
    requestStarted: false,
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([{ settled: 0 }]);
});

it("deletes the source conversation and scrubs in-flight private payloads without resetting admission or refunding unknown usage", async () => {
  const f = await started();
  await f.owner.mutation(api.proposalLoop.comment, {
    proposalId: f.proposalId,
    expectedVersion: 1,
    key: "before-delete-message",
    text: "Private discussion",
  });
  await f.t.mutation(internal.proposalLoop.finish, {
    operationId: f.operationId,
    requestStarted: true,
    errorCode: "UNKNOWN",
  });
  await f.owner.mutation(api.product.deleteSource, { id: f.sourceId });
  await f.t.mutation(internal.proposalLoop.retire, {
    proposalId: f.proposalId,
  });
  await expect(
    f.owner.query(api.proposalLoop.read, { proposalId: f.proposalId }),
  ).rejects.toThrow();
  expect(await f.t.run((ctx) => ctx.db.get(f.operationId))).toMatchObject({
    state: "unknown",
  });
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.operationId)))?.delegation,
  ).toBeUndefined();
  expect(
    await f.t.run((ctx) => ctx.db.query("proposalServiceCounters").collect()),
  ).toMatchObject([{ jobs: 1 }]);
  expect(
    await f.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([{ state: "active" }]);
});

it("atomically persists a paid reply and starts one revision for concurrent retries", async () => {
  const f = await fixture();
  const q = await f.owner.query(api.proposalLoop.quote, {
    proposalId: f.proposalId,
  });
  const input = {
    proposalId: f.proposalId,
    expectedVersion: 1,
    key: "atomic-reply-one",
    text: "Keep the scope focused on mobile.",
    quoteId: q.quoteId,
    maximumCredits: q.maximumCredits,
  };
  const [a, b] = await Promise.all([
    f.owner.mutation(api.proposalLoop.reply, input),
    f.owner.mutation(api.proposalLoop.reply, input),
  ]);
  expect(a.operation.id).toBe(b.operation.id);
  const read = await f.owner.query(api.proposalLoop.read, {
    proposalId: f.proposalId,
  });
  expect(read.messages.page).toHaveLength(1);
  expect(read.operation?.state).toBe("queued");
  expect(
    await f.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
  await expect(
    f.owner.mutation(api.proposalLoop.reply, {
      ...input,
      text: "Different request",
    }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
it("does not leave an orphan discussion message when a paid reply cannot reserve credits", async () => {
  const f = await fixture();
  const q = await f.owner.query(api.proposalLoop.quote, {
    proposalId: f.proposalId,
  });
  await f.t.run(async (ctx) => {
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", f.org))
      .unique();
    await ctx.db.patch(wallet!._id, { granted: 0 });
  });
  await expect(
    f.owner.mutation(api.proposalLoop.reply, {
      proposalId: f.proposalId,
      expectedVersion: 1,
      key: "insufficient-reply",
      text: "A paid request",
      quoteId: q.quoteId,
      maximumCredits: q.maximumCredits,
    }),
  ).rejects.toThrow("INSUFFICIENT_CREDITS");
  const read = await f.owner.query(api.proposalLoop.read, {
    proposalId: f.proposalId,
  });
  expect(read.messages.page).toEqual([]);
  expect(read.discussionRevision).toBe(0);
  expect(
    await f.t.run((ctx) => ctx.db.query("proposalOperations").collect()),
  ).toEqual([]);
});
