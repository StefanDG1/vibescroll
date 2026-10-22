// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import {
  normalizeSubscriptionCapabilities as normalize,
  readSubscriptionCapabilities,
  assertSubscriptionInput,
  subscriptionInputLimits,
} from "../packages/runner/subscription-capabilities.mjs";
import protocol from "../packages/runner/protocol/v2/ModelListResponse.json";
import {
  OfficialAssistantClient,
  hash,
} from "../packages/runner/assistant-local.mjs";
import {
  OfficialPersonalClient,
  processPersonalJob,
} from "../packages/runner/personal-analysis.mjs";

const runtime = vi.hoisted(() => ({
  server: null as any,
  worker: null as any,
}));
vi.mock("../packages/runner/assistant-runtime.mjs", () => ({
  docker: async () => JSON.stringify([runtime.worker]),
  prepareLocalUrl: async () => {
    throw Error("No preparation authorized");
  },
}));
vi.mock("../packages/runner/app-server.mjs", () => ({
  AppServer: class {
    constructor() {
      return runtime.server;
    }
  },
}));
afterEach(() => vi.useRealTimers());
const model = (extra: any = {}) => ({
  id: "catalogue-id",
  model: "fixture-model",
  displayName: "Fixture",
  description: "Fixture only",
  hidden: false,
  isDefault: true,
  defaultReasoningEffort: "high",
  supportedReasoningEfforts: [
    { reasoningEffort: "high", description: "High" },
    { reasoningEffort: "xhigh", description: "Extra" },
  ],
  ...extra,
});
const capabilities = (extra: any = {}) => normalize({ data: [model(extra)] });
it("imports the actual capability and processor graph on native pinned Node without starting an account or worker", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "await import('./packages/runner/subscription-capabilities.mjs'); await import('./packages/runner/personal-analysis.mjs'); await import('./packages/runner/assistant-local.mjs'); process.stdout.write('imports passed');",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 20000 },
  );
  expect(output).toBe("imports passed");
}, 25000);
function serverFor(entry = model()) {
  let listener: any = () => {};
  return {
    account: vi.fn(async () => ({
      account: { type: "chatgpt", email: "owner@example.test" },
    })),
    models: vi.fn(async () => ({ data: [entry] })),
    onEvent: (fn: any) => {
      listener = fn;
      return () => {};
    },
    send: vi.fn(),
    close: vi.fn(),
    deny: vi.fn(),
    interrupt: vi.fn(async () => {}),
    request: vi.fn(async (method: string, params: any) => {
      if (method === "initialize") return {};
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
  };
}
function session() {
  return {
    profileBinding: hash("owner@example.test"),
    expiresAt: Date.now() + 100000,
    image: `sha256:${"a".repeat(64)}`,
    purpose: "personal_library",
    worker: "vibe-trial-abcd-codex",
    socket: "private-socket",
  };
}
it("uses the pinned omitted-modality default and preserves per-model efforts without asserting access", () => {
  expect(protocol.definitions.Model.properties.inputModalities.default).toEqual(
    ["text", "image"],
  );
  expect(capabilities()).toMatchObject({
    schemaVersion: "1.0.0",
    access: "advertised_not_verified",
    models: [
      {
        slug: "fixture-model",
        reasoningEfforts: ["high", "xhigh"],
        defaultReasoningEffort: "high",
        inputModalities: ["text", "image"],
        modalitySource: "protocol_default",
      },
    ],
    localLimits: subscriptionInputLimits,
  });
  expect(capabilities().models[0]).not.toHaveProperty("entitled");
});
it.each([
  { hidden: true },
  { inputModalities: ["text", "audio"] },
  { inputModalities: null },
  { inputModalities: [] },
  { supportedReasoningEfforts: [{ reasoningEffort: "high\n" }] },
  { defaultReasoningEffort: "low" },
  { displayName: "bad\nname" },
])("fails closed for invalid or unsupported catalogue values %j", (extra) => {
  expect(capabilities(extra).models).toEqual([]);
});
it("removes conflicting duplicate model authority, including a malformed duplicate", () => {
  expect(
    normalize({ data: [model(), model({ inputModalities: ["text"] })] }).models,
  ).toEqual([]);
  expect(
    normalize({ data: [model(), model({ supportedReasoningEfforts: [] })] })
      .models,
  ).toEqual([]);
  expect(normalize({ data: [model(), model()] }).models).toHaveLength(1);
});
it("reads bounded official pagination and rejects repeated/truncated cursors", async () => {
  const server = {
    models: vi.fn(async () => ({ data: [], nextCursor: "second" })),
    request: vi.fn(async () => ({ data: [model()] })),
  };
  expect((await readSubscriptionCapabilities(server)).models).toHaveLength(1);
  expect(server.request).toHaveBeenCalledWith("model/list", {
    includeHidden: false,
    cursor: "second",
    limit: 100,
  });
  server.request.mockResolvedValue({ data: [], nextCursor: "second" } as any);
  await expect(readSubscriptionCapabilities(server)).rejects.toThrow(
    "CAPABILITIES_INVALID",
  );
});
it("connects a verified isolated account without requiring Sol or medium, leaving legacy models DTO unchanged", async () => {
  runtime.server = serverFor();
  const approved = session();
  runtime.worker = {
    State: { Running: true },
    Image: approved.image,
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
    },
    Mounts: [{ Type: "volume", Destination: "/run", Name: approved.socket }],
  };
  const client = await OfficialAssistantClient.connect(approved);
  expect(
    runtime.server.request.mock.calls.some(
      ([method]: any) => method === "turn/start",
    ),
  ).toBe(false);
  const personal = new OfficialPersonalClient(client);
  expect(await personal.models()).toEqual([
    { slug: "fixture-model", displayName: "Fixture" },
  ]);
  expect((await personal.capabilities()).models[0].reasoningEfforts).toEqual([
    "high",
    "xhigh",
  ]);
  await client.structured({ type: "object", properties: {} }, {}, [], {
    model: "fixture-model",
    effort: "xhigh",
  });
  expect(runtime.server.request).toHaveBeenCalledWith(
    "turn/start",
    expect.objectContaining({ model: "fixture-model", effort: "xhigh" }),
  );
});
it("rejects unavailable legacy defaults and text-only image requests before creating a thread", async () => {
  const server = serverFor(model({ inputModalities: ["text"] }));
  const client = new OfficialAssistantClient(session(), server);
  await expect(client.structured({}, {})).rejects.toThrow("MODEL_UNAVAILABLE");
  await expect(
    client.structured({}, {}, ["data:image/jpeg;base64,/9j/2Q=="], {
      model: "fixture-model",
      effort: "high",
    }),
  ).rejects.toThrow("MODALITY_UNAVAILABLE");
  expect(server.request).not.toHaveBeenCalled();
});
it("retains xhigh-only capability metadata without widening standalone legacy model choices", async () => {
  const client = new OfficialPersonalClient(
    new OfficialAssistantClient(
      session(),
      serverFor(
        model({
          defaultReasoningEffort: "xhigh",
          supportedReasoningEfforts: [{ reasoningEffort: "xhigh" }],
        }),
      ),
    ),
  );
  expect((await client.capabilities()).models[0].reasoningEfforts).toEqual([
    "xhigh",
  ]);
  expect(await client.models()).toEqual([]);
});
it("enforces canonical UTF8 text, decoded frame, count and aggregate limits before dispatch", () => {
  const selected = capabilities();
  const check = (input: any, frames: any) =>
    assertSubscriptionInput(selected, "fixture-model", "high", input, frames);
  const frame = `data:image/jpeg;base64,${Buffer.alloc(1000000).toString("base64")}`;
  expect(() => check({}, [frame])).not.toThrow();
  expect(() => check("é".repeat(500000), [])).toThrow("INPUT_LIMIT");
  expect(() => check({}, [frame + "A"])).toThrow("INPUT_LIMIT");
  expect(() => check({}, Array(13).fill(frame))).toThrow("INPUT_LIMIT");
  expect(() =>
    check({}, Array(49).fill("data:image/jpeg;base64,AA==")),
  ).toThrow("INPUT_LIMIT");
  expect(() => check({}, ["https://example.test/private-frame"])).toThrow(
    "INPUT_LIMIT",
  );
});
it("does not turn advertised capability into a successful-access claim when the official request is denied", async () => {
  const server = serverFor();
  const original = server.request.getMockImplementation()!;
  server.request.mockImplementation(async (method: string, params: any) => {
    if (method === "turn/start") throw Error("Request denied by provider");
    return original(method, params);
  });
  const client = new OfficialAssistantClient(session(), server);
  expect((await client.capabilities()).access).toBe("advertised_not_verified");
  await expect(
    client.structured({}, {}, [], { model: "fixture-model", effort: "high" }),
  ).rejects.toThrow("Request denied by provider");
  expect((await client.capabilities()).access).toBe("advertised_not_verified");
  expect(
    server.request.mock.calls.filter(([method]) => method === "turn/start"),
  ).toHaveLength(1);
});
it("rechecks the immutable account binding after catalogue retrieval before dispatch", async () => {
  const server = serverFor();
  server.account.mockResolvedValueOnce({
    account: { type: "chatgpt", email: "owner@example.test" },
  });
  server.account.mockResolvedValue({
    account: { type: "chatgpt", email: "changed@example.test" },
  });
  const client = new OfficialAssistantClient(session(), server);
  await expect(
    client.structured({}, {}, [], { model: "fixture-model", effort: "high" }),
  ).rejects.toThrow("ACCOUNT_CHANGED");
  expect(server.request).not.toHaveBeenCalled();
});
it("does not dispatch a turn after cancellation arrives during the allowance check", async () => {
  const abort = new AbortController(),
    server = serverFor();
  const original = server.request.getMockImplementation()!;
  server.request.mockImplementation(async (method: string, params: any) => {
    if (method === "account/rateLimits/read") abort.abort();
    return original(method, params);
  });
  const client = new OfficialAssistantClient(session(), server);
  await expect(
    client.structured({}, {}, [], {
      model: "fixture-model",
      effort: "high",
      signal: abort.signal,
    }),
  ).rejects.toThrow();
  expect(
    server.request.mock.calls.some(([method]) => method === "turn/start"),
  ).toBe(false);
});
it("does not start media inference when its immediate analyzing heartbeat is refused", async () => {
  const job = {
    id: "source",
    generation: 1,
    media: {},
    coverage: "audio_only",
    model: "fixture-model",
    effort: "high",
    deadline: Date.now() + 170000,
    profileBinding: session().profileBinding,
  };
  let heartbeats = 0;
  const request = vi.fn(async () => ({
    valid: ++heartbeats === 1,
    deadline: job.deadline,
  }));
  const client = {
    status: async () => ({ profileBinding: job.profileBinding }),
    respond: vi.fn(),
  };
  await expect(
    processPersonalJob(job, {
      client,
      request,
      prepareInput: async () => ({
        transcript: [],
        frameEvidence: [],
        frames: [],
      }),
    }),
  ).rejects.toThrow("PERSONAL_LEASE_INVALID");
  expect(client.respond).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(2);
});
it("interrupts an in-flight personal turn when a later heartbeat rejects the lease, without completing or falling back", async () => {
  vi.useFakeTimers();
  const server = serverFor();
  let started!: () => void;
  const starting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const original = server.request.getMockImplementation()!;
  server.request.mockImplementation(async (method: string, params: any) => {
    if (method === "turn/start") {
      started();
      return { turn: { id: "turn" } };
    }
    return original(method, params);
  });
  const client = new OfficialPersonalClient(
    new OfficialAssistantClient(session(), server),
  );
  const job = {
    id: "source",
    generation: 1,
    text: "Owned fixture",
    coverage: "caption_only",
    model: "fixture-model",
    effort: "high",
    deadline: Date.now() + 170000,
    profileBinding: session().profileBinding,
  };
  let heartbeats = 0;
  const request = vi.fn(async (operation: string) =>
    operation === "heartbeat"
      ? { valid: ++heartbeats === 1, deadline: job.deadline }
      : { accepted: true },
  );
  const work = processPersonalJob(job, { client, request });
  const rejected = expect(work).rejects.toThrow(
    "Personal analysis failed at inference",
  );
  await starting;
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(server.interrupt).toHaveBeenCalledExactlyOnceWith("thread", "turn");
  expect(request.mock.calls.map(([op]) => op)).toEqual([
    "heartbeat",
    "heartbeat",
  ]);
  expect(
    server.request.mock.calls.filter(([method]) => method === "turn/start"),
  ).toHaveLength(1);
});
