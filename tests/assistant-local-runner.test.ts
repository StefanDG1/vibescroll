// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import {
  hash,
  idleDelay,
  strictSchema,
  processAssistantJob,
  OfficialAssistantClient,
} from "../packages/runner/assistant-local.mjs";
import insightSchema from "../contracts/insight.schema.json";
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
it("refuses tool execution emitted during an official analysis turn", async () => {
  let listener: (message: any) => void = () => {};
  const server = {
    account: async () => ({
      account: { type: "chatgpt", email: "owner@example.test" },
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
