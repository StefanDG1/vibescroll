// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { execFileSync } from "node:child_process";
import {
  hash,
  idleDelay,
  strictSchema,
  processAssistantJob,
  OfficialAssistantClient,
} from "../packages/runner/assistant-local.mjs";
import insightSchema from "../contracts/insight.schema.json";

it("starts the real Node CLI with shared policies without connecting an account", () => {
  const output = execFileSync(
    process.execPath,
    ["packages/runner/assistant-runner.mjs", "--check"],
    { cwd: resolve("."), encoding: "utf8", timeout: 20000, windowsHide: true },
  );
  expect(output).toContain("assistant runtime ready");
}, 25000);
async function cleanFixture(directory: string) {
  if (
    !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
    !basename(directory).startsWith("vibescroll-assistant-test-")
  )
    throw Error("Unexpected cleanup directory");
  await rm(directory, { recursive: true, force: true });
}

it("supplies provider-required types throughout the real structured insight schema", () => {
  const schema = strictSchema(insightSchema);
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.enum) expect(node.type).toBeDefined();
    if (node.type === "object" && node.properties)
      expect(node.required).toEqual(Object.keys(node.properties));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  };
  visit(schema);
  expect(idleDelay(0)).toBe(30000);
  expect(idleDelay(20)).toBe(300000);
});
it("processes an isolated prepared frame into a cited zero-credit import and never evaluates projects by default", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vibescroll-assistant-test-"));
  try {
    const bytes = Buffer.from([255, 216, 255, 0, 255, 217]);
    await writeFile(join(directory, "frame-000.jpg"), bytes);
    await writeFile(
      join(directory, "receipt.json"),
      JSON.stringify({
        manifest: {
          durationSeconds: 1,
          frames: [{ id: "frame-000.jpg", timestampMs: 0 }],
        },
        assets: [
          { name: "frame-000.jpg", bytes: bytes.length, sha256: hash(bytes) },
        ],
      }),
    );
    await writeFile(
      join(directory, "acquisition.json"),
      JSON.stringify({ description: "Caption" }),
    );
    const request = vi.fn(async (operation: string, _args: any) =>
      operation === "source_prepare" ? "prepared-import" : { accepted: true },
    );
    const client = {
      session: { profileBinding: "a".repeat(64) },
      structured: vi.fn(async () => ({
        output: { sourceId: "source", processingRunId: "source:0" },
        inputHash: "b".repeat(64),
        outputHash: "c".repeat(64),
      })),
    };
    await processAssistantJob(
      {
        sourceId: "source",
        runId: "run",
        generation: 0,
        revision: 1,
        inputHash: "input",
        profileBinding: client.session.profileBinding,
        extract: true,
        repositories: [],
        expiresAt: Date.now() + 100000,
      },
      {
        client,
        request,
        config: { mediaImage: "image" },
        prepare: async () => ({ status: "prepared", directory }),
      },
    );
    expect(request.mock.calls.map(([op]) => op)).toEqual([
      "source_prepare",
      "frame",
      "source_finish",
      "done",
    ]);
    expect(request.mock.calls[2][1].receipt).toMatchObject({
      appCredits: 0,
      separateApiCall: false,
      model: "gpt-6.1-sol",
    });
    expect(client.structured.mock.calls).toHaveLength(1);
  } finally {
    await cleanFixture(directory);
  }
});
it("treats empty project evidence as a completed extraction without inventing matches", async () => {
  const request = vi.fn(async (operation: string) =>
    operation === "project_work"
      ? { members: [], repositories: ["repo"] }
      : { accepted: true },
  );
  await processAssistantJob(
    {
      runId: "run",
      extract: false,
      repositories: ["repo"],
      profileBinding: "a".repeat(64),
      expiresAt: Date.now() + 10000,
    },
    {
      client: { session: { profileBinding: "a".repeat(64) } },
      request,
      config: {},
    },
  );
  expect(request.mock.calls.map(([op]) => op)).toEqual([
    "project_work",
    "done",
  ]);
});
it("preserves platform refusal status without starting transcription or AI", async () => {
  const request = vi.fn(),
    transcribe = vi.fn();
  const client = {
    session: { profileBinding: "a".repeat(64) },
    structured: vi.fn(),
  };
  await expect(
    processAssistantJob(
      {
        runId: "run",
        sourceId: "source",
        extract: true,
        profileBinding: client.session.profileBinding,
        expiresAt: Date.now() + 10000,
      },
      {
        client,
        request,
        transcribe,
        config: { mediaImage: "image" },
        prepare: async () => ({ status: "needs_auth" }),
      },
    ),
  ).rejects.toMatchObject({ mediaStatus: "needs_auth" });
  expect(transcribe).not.toHaveBeenCalled();
  expect(client.structured).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
it("refuses tool execution emitted during an official analysis turn", async () => {
  let listener: (message: any) => void = () => {};
  const server = {
    account: async () => ({
      account: { type: "chatgpt", email: "owner@example.test" },
    }),
    models: async () => ({
      data: [
        {
          model: "gpt-6.1-sol",
          supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
        },
      ],
    }),
    onEvent: (fn: any) => {
      listener = fn;
      return () => {};
    },
    request: vi.fn(async (method: string) => {
      if (method === "thread/start")
        return { model: "gpt-6.1-sol", thread: { id: "thread" } };
      if (method === "account/rateLimits/read")
        return { rateLimits: { primary: { usedPercent: 0 } } };
      if (method === "turn/start") {
        listener({
          method: "item/started",
          params: { threadId: "thread", item: { type: "commandExecution" } },
        });
        return { turn: { id: "turn" } };
      }
    }),
    interrupt: vi.fn(async () => {}),
  };
  const client = new OfficialAssistantClient(
    {
      profileBinding: hash("owner@example.test"),
      expiresAt: Date.now() + 10000,
    },
    server,
  );
  await expect(
    client.structured({ type: "object", properties: {} }, {}),
  ).rejects.toThrow("ASSISTANT_LOCAL_UNEXPECTED_ACTION");
  expect(server.interrupt).toHaveBeenCalledWith("thread", "turn");
});

it("keeps default Sol/medium exact while using only approved available model and effort overrides", async () => {
  let listener: (message: any) => void = () => {};
  const server = {
    account: async () => ({
      account: { type: "chatgpt", email: "owner@example.test" },
    }),
    models: vi.fn(async () => ({
      data: [
        {
          model: "gpt-6.1-sol",
          supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
        },
        {
          model: "fixture-high",
          supportedReasoningEfforts: [{ reasoningEffort: "high" }],
        },
      ],
    })),
    onEvent: (fn: any) => {
      listener = fn;
      return () => {};
    },
    request: vi.fn(async (method: string, params: any) => {
      if (method === "thread/start")
        return { model: params.model, thread: { id: "thread" } };
      if (method === "account/rateLimits/read")
        return { rateLimits: { primary: { usedPercent: 0 } } };
      if (method === "turn/start") {
        queueMicrotask(() => {
          listener({
            method: "item/completed",
            params: {
              threadId: "thread",
              item: { type: "agentMessage", text: "{}" },
            },
          });
          listener({
            method: "turn/completed",
            params: { threadId: "thread", turn: { status: "completed" } },
          });
        });
        return { turn: { id: "turn" } };
      }
    }),
    interrupt: vi.fn(async () => {}),
  };
  const client = new OfficialAssistantClient(
    {
      profileBinding: hash("owner@example.test"),
      expiresAt: Date.now() + 10000,
    },
    server,
  );
  await client.structured({ type: "object", properties: {} }, {});
  expect(server.models).toHaveBeenCalledOnce();
  expect(server.request).toHaveBeenCalledWith(
    "turn/start",
    expect.objectContaining({ model: "gpt-6.1-sol", effort: "medium" }),
  );
  const abort = new AbortController();
  await client.structured({ type: "object", properties: {} }, {}, [], {
    model: "fixture-high",
    effort: "high",
    signal: abort.signal,
  });
  expect(server.request).toHaveBeenCalledWith(
    "turn/start",
    expect.objectContaining({ model: "fixture-high", effort: "high" }),
  );
  const turns = server.request.mock.calls.filter(
    ([method]) => method === "turn/start",
  ).length;
  await expect(
    client.structured({ type: "object", properties: {} }, {}, [], {
      model: "fixture-high",
      effort: "low",
    }),
  ).rejects.toThrow("ASSISTANT_LOCAL_MODEL_UNAVAILABLE");
  expect(
    server.request.mock.calls.filter(([method]) => method === "turn/start"),
  ).toHaveLength(turns);
});

it("interrupts an official turn when the approved personal job signal is canceled", async () => {
  const abort = new AbortController();
  const server = {
    account: async () => ({
      account: { type: "chatgpt", email: "owner@example.test" },
    }),
    models: async () => ({
      data: [
        {
          model: "fixture-high",
          supportedReasoningEfforts: [{ reasoningEffort: "high" }],
        },
      ],
    }),
    onEvent: () => () => {},
    request: vi.fn(async (method: string, params: any) => {
      if (method === "thread/start")
        return { model: params.model, thread: { id: "thread" } };
      if (method === "account/rateLimits/read")
        return { rateLimits: { primary: { usedPercent: 0 } } };
      if (method === "turn/start") {
        queueMicrotask(() => abort.abort());
        return { turn: { id: "turn" } };
      }
    }),
    interrupt: vi.fn(async () => {}),
  };
  const client = new OfficialAssistantClient(
    {
      profileBinding: hash("owner@example.test"),
      expiresAt: Date.now() + 10000,
    },
    server,
  );
  await expect(
    client.structured({ type: "object", properties: {} }, {}, [], {
      model: "fixture-high",
      effort: "high",
      signal: abort.signal,
    }),
  ).rejects.toThrow("ASSISTANT_LOCAL_CANCELED");
  expect(server.interrupt).toHaveBeenCalledWith("thread", "turn");
});

it("passes the controlling lease signal through project evaluation and refuses a late result", async () => {
  const abort = new AbortController();
  const request = vi.fn(async (operation: string) =>
    operation === "project_work"
      ? { topicId: "topic", members: ["member"], repositories: ["repo"] }
      : operation === "evaluation"
        ? { id: "evaluation", cached: false }
        : { accepted: true },
  );
  const client = {
    session: { profileBinding: "a".repeat(64) },
    structured: vi.fn(
      async (_schema: any, _input: any, frames: any, options: any) => {
        expect(frames).toEqual([]);
        expect(options.signal.aborted).toBe(false);
        abort.abort();
        expect(options.signal.aborted).toBe(true);
        return { output: {} };
      },
    ),
  };
  await expect(
    processAssistantJob(
      {
        runId: "run",
        repositories: ["repo"],
        extract: false,
        profileBinding: client.session.profileBinding,
        expiresAt: Date.now() + 10000,
      },
      { client, request, config: {}, signal: abort.signal },
    ),
  ).rejects.toThrow();
  expect(request.mock.calls.map(([operation]) => operation)).toEqual([
    "project_work",
    "evaluation",
  ]);
  expect(client.structured).toHaveBeenCalledOnce();
});
