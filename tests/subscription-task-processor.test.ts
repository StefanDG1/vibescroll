// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { processSubscriptionTask } from "../packages/runner/subscription-coordinator.mjs";
import {
  OfficialAssistantClient,
  hash,
} from "../packages/runner/assistant-local.mjs";
import { normalizeSubscriptionCapabilities } from "../packages/runner/subscription-capabilities.mjs";
afterEach(() => vi.useRealTimers());
const catalogue = normalizeSubscriptionCapabilities({
  data: [
    {
      model: "task-model",
      supportedReasoningEfforts: [{ reasoningEffort: "xhigh" }],
      inputModalities: ["text"],
    },
  ],
});
function setup(workload = "project_evaluation") {
  const binding = hash("owner@example.test");
  const job = {
    taskProtocolVersion: "1.0.0",
    workload,
    runId: "run",
    profileBinding: binding,
    model: "task-model",
    effort: "xhigh",
    repositories: ["repository"],
    deadline: Date.now() + 600000,
    leaseGeneration: 1,
    leaseToken: "11111111-1111-1111-1111-111111111111",
  };
  const plan = {
    scope: "Review the evidence",
    nonGoals: [],
    files: [{ path: "README.md", isNew: false }],
    steps: ["Explain the review"],
    tests: ["printf synthetic"],
    risks: [],
    rollout: "Review",
    rollback: "Revert",
    unknowns: [],
  };
  const client = {
    session: { profileBinding: binding, expiresAt: Date.now() + 4 * 3600000 },
    check: vi.fn(async () => {}),
    capabilities: vi.fn(async () => catalogue),
    structured: vi.fn(
      async (
        _schema: any,
        _input: any,
        _frames: any,
        _options: any,
      ): Promise<any> => ({
        output: workload === "plan_draft" ? plan : { disposition: "no_fit" },
      }),
    ),
  };
  const request = vi.fn(async (operation: string, _args?: any): Promise<any> =>
    operation === "task_heartbeat"
      ? { valid: true, deadline: job.deadline, leaseGeneration: 1 }
      : operation === "task_context"
        ? { id: "evaluation", cached: false, excerpts: [], evidence: [] }
        : { accepted: true },
  );
  return { job, client, request, plan };
}
it("runs an exact model/effort evaluation with real lease operations and no proposal acceptance or paid fallback", async () => {
  const s = setup();
  expect(await processSubscriptionTask(s.job, s)).toEqual({ completed: true });
  expect(s.request.mock.calls.map(([op]) => op)).toEqual([
    "task_heartbeat",
    "task_context",
    "task_evaluation_finish",
    "task_heartbeat",
    "task_finish",
  ]);
  expect(s.client.structured.mock.calls[0][3]).toMatchObject({
    model: "task-model",
    effort: "xhigh",
    signal: expect.any(AbortSignal),
  });
  expect(s.request.mock.calls.at(-1)?.[1]).toMatchObject({
    evaluationIds: ["evaluation"],
    runId: "run",
    leaseGeneration: 1,
    leaseToken: s.job.leaseToken,
  });
  expect(JSON.stringify(s.request.mock.calls)).not.toContain(
    '"review":"accepted"',
  );
});
it("reuses an authorized compatible evaluation without a generic model turn", async () => {
  const s = setup(),
    original = s.request.getMockImplementation()!;
  s.request.mockImplementation(async (op, args) =>
    op === "task_context"
      ? { id: "evaluation", cached: true }
      : original(op, args),
  );
  await processSubscriptionTask(s.job, s);
  expect(s.client.structured).not.toHaveBeenCalled();
  expect(s.request.mock.calls.map(([op]) => op)).not.toContain(
    "task_evaluation_finish",
  );
});
it("uses the shared exact editable-plan schema and submits only a draft under the task lease", async () => {
  const s = setup("plan_draft");
  await processSubscriptionTask(s.job, s);
  expect(s.client.structured.mock.calls[0][0]).toMatchObject({
    type: "object",
    required: expect.arrayContaining([
      "scope",
      "files",
      "steps",
      "tests",
      "rollback",
    ]),
  });
  expect(s.request.mock.calls.at(-1)?.[1]).toMatchObject({
    plan: s.plan,
    leaseToken: s.job.leaseToken,
  });
  expect(s.request.mock.calls.map(([op]) => op)).not.toContain(
    "task_evaluation_finish",
  );
});
it("does not start a model after cancellation during repository retrieval", async () => {
  const s = setup(),
    cancel = new AbortController(),
    original = s.request.getMockImplementation()!;
  s.request.mockImplementation(async (op, args) => {
    const result = await original(op, args);
    if (op === "task_context") cancel.abort();
    return result;
  });
  await expect(
    processSubscriptionTask(s.job, { ...s, signal: cancel.signal }),
  ).rejects.toThrow();
  expect(s.client.structured).not.toHaveBeenCalled();
  expect(s.request.mock.calls.map(([op]) => op)).not.toContain("task_finish");
});
it.each(["lease", "account"])(
  "interrupts an actual official turn after %s authority is lost",
  async (failure) => {
    vi.useFakeTimers();
    const s = setup();
    let started!: () => void,
      hb = 0,
      accountChanged = false;
    const starting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const server = {
      account: vi.fn(async () => ({
        account: {
          type: "chatgpt",
          email: accountChanged ? "changed@example.test" : "owner@example.test",
        },
      })),
      models: async () => ({
        data: [
          {
            model: "task-model",
            supportedReasoningEfforts: [{ reasoningEffort: "xhigh" }],
          },
        ],
      }),
      onEvent: () => () => {},
      interrupt: vi.fn(async () => {}),
      request: vi.fn(async (method: string) => {
        if (method === "thread/start")
          return { model: "task-model", thread: { id: "thread" } };
        if (method === "account/rateLimits/read")
          return { rateLimits: { primary: { usedPercent: 0 } } };
        if (method === "turn/start") {
          started();
          return { turn: { id: "turn" } };
        }
      }),
    };
    const official = new OfficialAssistantClient(s.client.session, server);
    const original = s.request.getMockImplementation()!;
    s.request.mockImplementation(async (op, args) => {
      if (op === "task_heartbeat") {
        hb++;
        return {
          valid: failure !== "lease" || hb === 1,
          deadline: s.job.deadline,
          leaseGeneration: 1,
        };
      }
      return original(op, args);
    });
    const running = processSubscriptionTask(s.job, { ...s, client: official });
    const rejected = expect(running).rejects.toThrow();
    await starting;
    if (failure === "account") accountChanged = true;
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(server.interrupt).toHaveBeenCalledExactlyOnceWith("thread", "turn");
    expect(s.request.mock.calls.map(([op]) => op)).not.toContain("task_finish");
    expect(s.request.mock.calls.map(([op]) => op)).not.toContain(
      "task_evaluation_finish",
    );
  },
);
it.each([
  { taskProtocolVersion: "0.9.0" },
  { profileBinding: "0".repeat(64) },
  { deadline: Date.now() + 1900000 },
  { leaseGeneration: 0 },
  { repositories: Array(6).fill("same") },
])("refuses invalid authority before any task call %j", async (extra) => {
  const s = setup();
  await expect(
    processSubscriptionTask({ ...s.job, ...extra }, s),
  ).rejects.toThrow("TASK_INVALID");
  expect(s.request).not.toHaveBeenCalled();
});
