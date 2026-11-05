import { expect, it, vi } from "vitest";
import { proposalRuntime } from "../apps/widget/src/proposal-runtime";

it("uses existing semantic tools and preserves the exact approved version, visibility and request key", async () => {
  const call = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    confirmed: true,
  }));
  const invoke = proposalRuntime(call, "workspace");
  const args = {
    proposalId: "plan",
    expectedVersion: 4,
    contextHash: "a".repeat(64),
    visibility: "private",
    key: "stable-approval-key",
    acknowledged: true,
  };
  await invoke("proposalIssueApprove", args);
  await invoke("proposalIssueApprove", args);
  expect(call.mock.calls).toEqual([
    ["approve_project_issue", { ...args, profileId: "workspace" }],
    ["approve_project_issue", { ...args, profileId: "workspace" }],
  ]);
  await expect(
    invoke("proposalIssueApprove", { ...args, acknowledged: false }),
  ).rejects.toThrow();
  await expect(invoke("arbitrary_backend_mutation", {})).rejects.toThrow(
    "unavailable",
  );
  expect(call).toHaveBeenCalledTimes(2);
});
it("keeps discussion reads, free comments and explicitly quoted generation separate", async () => {
  const call = vi.fn(
    async (_name: string, _args: Record<string, unknown>) => ({}),
  );
  const invoke = proposalRuntime(call, "workspace");
  await invoke("proposalDiscussion", { proposalId: "plan" });
  await invoke("proposalComment", {
    proposalId: "plan",
    expectedVersion: 2,
    key: "stable-comment-key",
    text: "Keep this feedback",
  });
  expect(call.mock.calls.map(([tool]) => tool)).toEqual([
    "get_proposal_discussion",
    "add_proposal_message",
  ]);
  await expect(
    invoke("proposalPlanStart", {
      proposalId: "plan",
      expectedVersion: 2,
      key: "stable-start-key",
    }),
  ).rejects.toThrow();
  expect(call).toHaveBeenCalledTimes(2);
});
