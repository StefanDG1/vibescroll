import { expect, it } from "vitest";
import { projectProposalDraft } from "../packages/contracts/project-proposal-draft";
const input = {
  sourceId: "post",
  projectId: "project",
  analysisVersionId: "version",
  insightId: "insight",
  contextHash: "a".repeat(64),
  title: "Review onboarding",
  goal: "Reduce setup friction",
  change: "",
};
it("reuses one explicit draft key across retries/reloads and normalizes field whitespace", async () => {
  const a = await projectProposalDraft(input);
  expect(
    await projectProposalDraft({ ...input, goal: "  Reduce setup friction  " }),
  ).toEqual(a);
  expect(a).toMatchObject({
    expectedVersion: 0,
    insightIds: ["insight"],
    body: {
      disposition: "needs_context",
      proposedChange: null,
      benefitHypothesis: null,
    },
  });
  expect(a.key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
});
it("changes identity for a deliberately changed goal, evidence version or current context", async () => {
  const a = await projectProposalDraft(input);
  for (const change of [
    { goal: "Improve documentation" },
    { analysisVersionId: "another-version" },
    { contextHash: "b".repeat(64) },
  ])
    expect((await projectProposalDraft({ ...input, ...change })).key).not.toBe(
      a.key,
    );
});
it("rejects an empty goal or oversized draft before a write is attempted", async () => {
  await expect(
    projectProposalDraft({ ...input, goal: "  " }),
  ).rejects.toThrow();
  await expect(
    projectProposalDraft({ ...input, change: "x".repeat(4001) }),
  ).rejects.toThrow();
});
