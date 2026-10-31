import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { prepared, body } from "./chat-proposal-fixture";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const steps = [
  "Inspect the selected repository",
  "Implement and verify the reviewed change",
];
async function fixture() {
  const f = await prepared();
  const saved = await f.assistant.mutation(internal.assistantProposals.save, {
    ...f.input,
    body: { ...body, steps },
  });
  const input = {
    ...f.input,
    proposalId: saved.proposalId,
    expectedVersion: 1,
    expectedReview: "unreviewed",
    key: "edit-via-older-client",
    body: { ...body, title: "Clarify the existing plan" },
  };
  return { ...f, saved, edit: input };
}
it("preserves generated steps when an older MCP client omits that optional field, including a replay", async () => {
  const f = await fixture();
  const saved = await f.assistant.mutation(
    internal.assistantProposals.save,
    f.edit,
  );
  expect(saved.body.steps).toEqual(steps);
  expect(
    await f.assistant.mutation(internal.assistantProposals.save, f.edit),
  ).toMatchObject({ version: 2, replayed: true, body: { steps } });
});
it("allows an explicitly empty step set to clear the plan", async () => {
  const f = await fixture();
  const saved = await f.assistant.mutation(internal.assistantProposals.save, {
    ...f.edit,
    body: { ...f.edit.body, steps: [] },
  });
  expect(saved.body.steps).toEqual([]);
});
it("refuses to implicitly carry old steps into a changed project revision", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.projectId, { sha: "b".repeat(40), selectionVersion: 1 }),
  );
  const context = await f.owner.query(api.projectPlanning.context, {
    sourceId: f.sourceId,
    projectId: f.projectId,
    analysisVersionId: f.versionId,
  });
  await expect(
    f.owner.mutation(api.projectPlanning.save, {
      ...f.edit,
      contextHash: context.contextHash,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  const saved = await f.t.run((ctx) => ctx.db.get(f.saved.proposalId));
  expect(saved?.version).toBe(1);
  expect(saved?.detail.steps).toEqual(steps);
});
