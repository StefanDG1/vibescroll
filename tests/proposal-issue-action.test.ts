import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { prepared, body } from "./chat-proposal-fixture";

vi.mock("../convex/lib/githubAuthorization", () => ({
  authorizeRepository: vi.fn(async () => {
    throw Error("BASE_CHANGED: current main moved");
  }),
}));
vi.mock("../packages/providers/issues", () => ({
  issueAccess: vi.fn(),
  createIssue: vi.fn(),
  findIssue: vi.fn(),
}));
import { createIssue, issueAccess } from "../packages/providers/issues";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("retains the stale-base diagnosis before issue dispatch instead of suggesting a GitHub reconnect", async () => {
  const f = await prepared();
  const saved = await f.assistant.mutation(internal.assistantProposals.save, {
    ...f.input,
    body: { ...body, disposition: "relevant" },
  });
  const current = await f.owner.query(api.proposalLoop.read, {
    proposalId: saved.proposalId,
  });
  const approved = await f.owner.mutation(api.proposalIssues.approve, {
    proposalId: saved.proposalId,
    expectedVersion: 1,
    contextHash: current.contextHash,
    key: "stale-base-proof",
    visibility: "public",
    acknowledged: true,
  });
  await f.t.action(internal.proposalIssueActions.publish, {
    operationId: approved.operationId,
  });
  expect(
    await f.t.run((ctx) => ctx.db.get(approved.operationId)),
  ).toMatchObject({ state: "failed", errorCode: "BASE_CHANGED" });
  expect(issueAccess).not.toHaveBeenCalled();
  expect(createIssue).not.toHaveBeenCalled();
  const op = await f.t.run((ctx) => ctx.db.get(approved.operationId));
  expect(op!.receipt?.dispatchedAt).toBeUndefined();
});
