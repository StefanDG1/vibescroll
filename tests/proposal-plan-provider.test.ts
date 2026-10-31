import { expect, it, vi } from "vitest";
import {
  generateProposalPlan,
  proposalProviderSchema,
} from "../packages/providers/proposal-plan";
import { body } from "./chat-proposal-fixture";
const output = {
  message: "The updated plan is ready.",
  body,
  steps: ["Inspect the repository before implementation."],
};
const result = (overrides = {}) => ({
  model: "zai/glm-5.3-flash",
  id: "request-test",
  usage: { prompt_tokens: 1000, completion_tokens: 500 },
  choices: [
    { message: { content: JSON.stringify(output) }, finish_reason: "stop" },
  ],
  ...overrides,
});
function call(response = result()) {
  const receipts: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async () => Response.json(response));
  return {
    receipts,
    fetchMock,
    args: {
      packet: {
        source: { insights: [{ id: "retained-one" }, { id: "retained-two" }] },
        project: { profile: "Current project context" },
        proposal: body,
        discussion: [],
      },
      apiKey: "synthetic-test-key",
      deadline: Date.now() + 10000,
      fetch: fetchMock as unknown as typeof fetch,
      onReceipt: async (r: Record<string, unknown>) => {
        receipts.push(r);
      },
    },
  };
}
it("uses the bounded baseline provider and binds the full retained insight set on the server", async () => {
  const f = call();
  expect(await generateProposalPlan(f.args)).toMatchObject({
    insightIds: ["retained-one", "retained-two"],
    steps: output.steps,
  });
  const request = JSON.parse(
    (f.fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as string,
  );
  expect(request).toMatchObject({
    model: "zai/glm-5.3-flash",
    max_tokens: 8000,
    providerOptions: {
      gateway: { only: ["deepinfra"], disallowPromptTraining: true },
    },
  });
  expect(f.receipts.at(-1)).toMatchObject({
    inputTokens: 1000,
    outputTokens: 500,
    estimatedUsd: 0.0012,
  });
  const schema = proposalProviderSchema();
  expect((schema.properties!.body as any).properties.steps).toBeUndefined();
});
it("retains diagnostic and known usage before rejecting truncated or invalid structured output, without retry", async () => {
  const f = call(
    result({
      choices: [{ message: { content: "bad json" }, finish_reason: "length" }],
    }),
  );
  await expect(generateProposalPlan(f.args)).rejects.toThrow();
  expect(f.fetchMock).toHaveBeenCalledTimes(1);
  expect(
    f.receipts.some(
      (r) => r.rawOutput === "bad json" && r.inputTokens === 1000,
    ),
  ).toBe(true);
});
it("does not apply another model's rates, and bounds input before dispatch", async () => {
  const f = call(result({ model: "different/model" }));
  await expect(generateProposalPlan(f.args)).rejects.toThrow("PROVIDER_ERROR");
  expect(f.receipts.some((r) => r.inputTokens !== undefined)).toBe(false);
  const g = call();
  const dispatch = vi.fn();
  await expect(
    generateProposalPlan({
      ...g.args,
      onDispatch: dispatch,
      packet: { ...g.args.packet, discussion: ["x".repeat(170000)] },
    }),
  ).rejects.toThrow("LIMIT_REACHED");
  expect(dispatch).not.toHaveBeenCalled();
  expect(g.fetchMock).not.toHaveBeenCalled();
});
