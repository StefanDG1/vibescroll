// @vitest-environment node
import { expect, it, vi } from "vitest";
import {
  assertLocalDockerEndpoint,
  controllerAnnouncement,
  createRunnerRequest,
  createSubscriptionCoordinator,
} from "../packages/runner/subscription-coordinator.mjs";
import {
  normalizeSubscriptionCapabilities,
  assertReportedAllowance,
} from "../packages/runner/subscription-capabilities.mjs";
import {
  OfficialAssistantClient,
  hash,
} from "../packages/runner/assistant-local.mjs";
import {
  OfficialPersonalClient,
  processPersonalJob,
} from "../packages/runner/personal-analysis.mjs";

const binding = "a".repeat(64);
const advertised = (
  model = "gpt-6.1-sol",
  efforts = ["medium"],
  inputModalities = ["text", "image"],
) => ({
  model,
  supportedReasoningEfforts: efforts.map((reasoningEffort) => ({
    reasoningEffort,
  })),
  inputModalities,
});
const caps = (models = [advertised(), advertised("alternative", ["high"])]) =>
  normalizeSubscriptionCapabilities({ data: models });
const pjob = (id = "source") => ({
  id,
  generation: 1,
  profileBinding: binding,
  model: "alternative",
  effort: "high",
});
const ajob = (runId = "run") => ({
  runId,
  profileBinding: binding,
  extract: false,
  repositories: [],
});
function harness(overrides: any = {}) {
  const abort = new AbortController(),
    calls: string[] = [];
  let personalJob: any = null,
    assistantJob: any = null;
  const official = {
    session: { profileBinding: binding, expiresAt: Date.now() + 4 * 3600000 },
    check: vi.fn(async () => {}),
    capabilities: vi.fn(async () => caps()),
    server: {
      request: vi.fn(async () => ({
        rateLimits: { primary: { usedPercent: 0 } },
      })),
    },
  };
  const requestPersonal = vi.fn(
    async (operation: string, _args?: any): Promise<any> => {
      calls.push(`personal:${operation}`);
      return operation === "hello"
        ? { workspaceId: "workspace" }
        : operation === "poll"
          ? { job: personalJob }
          : { accepted: true };
    },
  );
  const requestAssistant = vi.fn(
    async (operation: string, _args?: any): Promise<any> => {
      calls.push(`assistant:${operation}`);
      return operation === "hello"
        ? { workspaceId: "workspace" }
        : operation === "claim"
          ? { job: assistantJob }
          : { accepted: true };
    },
  );
  const options = {
    official,
    personal: {},
    requestPersonal,
    requestAssistant,
    processPersonal: vi.fn(async () => {}),
    processAssistant: vi.fn(async () => {}),
    signal: abort.signal,
    config: { workspaceId: "workspace", localAsr: {} },
    onStatus: vi.fn(),
    ...overrides,
  };
  return {
    abort,
    calls,
    ...options,
    coordinator: createSubscriptionCoordinator(options),
    jobs(p: any, a: any) {
      personalJob = p;
      assistantJob = a;
    },
  };
}
it("serves both existing queues serially and alternates busy routes without claiming a second concurrent job", async () => {
  const h = harness();
  h.jobs(pjob(), ajob());
  expect(await h.coordinator.step()).toMatchObject({
    route: "personal",
    worked: true,
    delayMs: 1000,
  });
  expect(h.calls).toEqual([
    "personal:hello",
    "assistant:hello",
    "personal:poll",
  ]);
  expect(await h.coordinator.step()).toMatchObject({
    route: "assistant",
    worked: true,
  });
  h.jobs(pjob("second"), ajob("second-run"));
  expect(await h.coordinator.step()).toMatchObject({ route: "personal" });
  expect(h.processPersonal).toHaveBeenCalledTimes(2);
  expect(h.processAssistant).toHaveBeenCalledOnce();
  expect(h.processPersonal.mock.calls[0][1].signal).toBe(h.abort.signal);
  expect(h.processAssistant.mock.calls[0][1].signal).toBe(h.abort.signal);
  expect(h.requestPersonal).toHaveBeenCalledWith("hello", {
    models: [
      { slug: "gpt-6.1-sol", displayName: "gpt-6.1-sol" },
      { slug: "alternative", displayName: "alternative" },
    ],
    profileBinding: binding,
  });
});
it("rejects concurrent coordinator ownership while a processor is pending", async () => {
  let finish!: () => void, entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const h = harness({
    processPersonal: vi.fn(async () => {
      entered();
      await new Promise<void>((r) => {
        finish = r;
      });
    }),
  });
  h.jobs(pjob(), ajob());
  const first = h.coordinator.step();
  await started;
  await expect(h.coordinator.step()).rejects.toThrow("COORDINATOR_BUSY");
  expect(
    h.requestAssistant.mock.calls.filter(([op]: any) => op === "claim"),
  ).toHaveLength(0);
  finish();
  await first;
});
it("polls each idle route at most once per step with a bounded 30 second idle delay", async () => {
  const h = harness();
  expect(await h.coordinator.step()).toEqual({ worked: false, delayMs: 30000 });
  expect(h.calls).toEqual([
    "personal:hello",
    "assistant:hello",
    "personal:poll",
    "assistant:claim",
  ]);
  h.calls.length = 0;
  await h.coordinator.step();
  expect(h.calls).toHaveLength(2);
  expect(h.calls).toContain("personal:poll");
  expect(h.calls).toContain("assistant:claim");
});
it("keeps personal alternatives running without advertising unsupported Sol/medium or xhigh-only legacy models", async () => {
  const h = harness();
  h.official.capabilities.mockResolvedValue(
    caps([
      advertised("alternative", ["high"], ["text"]),
      advertised("xhigh-only", ["xhigh"]),
    ]),
  );
  h.jobs(pjob(), ajob());
  await h.coordinator.step();
  expect(h.requestAssistant).not.toHaveBeenCalled();
  expect(h.requestPersonal.mock.calls[0]).toEqual([
    "hello",
    {
      models: [{ slug: "alternative", displayName: "alternative" }],
      profileBinding: binding,
    },
  ]);
  expect(h.processPersonal).toHaveBeenCalledOnce();
});
it("fences workspace/profile changes without exposing the other queue or processing swapped jobs", async () => {
  const foreign = harness();
  foreign.requestPersonal.mockResolvedValue({ workspaceId: "foreign" });
  await expect(foreign.coordinator.step()).rejects.toThrow("WORKSPACE_CHANGED");
  expect(foreign.requestAssistant).not.toHaveBeenCalled();
  const profile = harness();
  profile.jobs({ ...pjob(), profileBinding: "b".repeat(64) }, null);
  await expect(profile.coordinator.step()).rejects.toThrow("JOB_CHANGED");
  expect(profile.processPersonal).not.toHaveBeenCalled();
  expect(profile.requestPersonal).toHaveBeenCalledWith("fail", {
    id: "source",
    generation: 1,
  });
});
it("keeps owner/admin assistant authorization separate from member personal authorization", async () => {
  const h = harness();
  h.jobs(pjob(), ajob());
  h.requestAssistant.mockRejectedValue(
    Object.assign(Error("refused"), { responseStatus: 403 }),
  );
  await h.coordinator.step();
  expect(h.processPersonal).toHaveBeenCalledOnce();
  expect(h.processAssistant).not.toHaveBeenCalled();
  expect(h.onStatus).toHaveBeenCalledWith({
    route: "assistant",
    state: "unavailable",
  });
});
it("does not retry a claimed generation, use another route, or erase uncertain work after processor/ack failure", async () => {
  const h = harness({
    processPersonal: vi.fn(async () => {
      throw Error("unknown after dispatch");
    }),
  });
  h.jobs(pjob(), null);
  const original = h.requestPersonal.getMockImplementation()!;
  h.requestPersonal.mockImplementation(
    async (operation: string, args?: any) => {
      if (operation === "fail") throw Error("unknown acknowledgement");
      return original(operation, args);
    },
  );
  await expect(h.coordinator.step()).rejects.toThrow("unknown after dispatch");
  await expect(h.coordinator.step()).rejects.toThrow("COORDINATOR_HALTED");
  expect(h.processPersonal).toHaveBeenCalledOnce();
  expect(h.processAssistant).not.toHaveBeenCalled();
});
it("reconciles the existing personal expired lease instead of claiming another job", async () => {
  const h = harness();
  const original = h.requestPersonal.getMockImplementation()!;
  h.requestPersonal.mockImplementation(async (op: string, args?: any) =>
    op === "poll"
      ? { reconcile: { id: "source", generation: null } }
      : original(op, args),
  );
  await h.coordinator.step();
  expect(h.requestPersonal).toHaveBeenCalledWith("fail", { id: "source" });
  expect(
    h.requestAssistant.mock.calls.some(([op]: any) => op === "claim"),
  ).toBe(false);
  expect(h.processPersonal).not.toHaveBeenCalled();
});
it.each([true, false])(
  "halts after an official turn loses its start acknowledgement even when app fail acknowledgement is %s",
  async (acknowledged) => {
    const profileBinding = hash("owner@example.test");
    const server = {
      account: async () => ({
        account: { type: "chatgpt", email: "owner@example.test" },
      }),
      models: async () => ({
        data: [advertised(), advertised("alternative", ["high"])],
      }),
      onEvent: () => () => {},
      interrupt: vi.fn(),
      request: vi.fn(async (method: string, params?: any) => {
        if (method === "account/rateLimits/read")
          return { rateLimits: { primary: { usedPercent: 0 } } };
        if (method === "thread/start")
          return { model: params.model, thread: { id: "thread" } };
        if (method === "turn/start")
          throw Error("start acknowledgement lost after dispatch");
      }),
    };
    const official = new OfficialAssistantClient(
      { profileBinding, expiresAt: Date.now() + 4 * 3600000 },
      server,
    );
    const h = harness({
      official,
      processPersonal: async () =>
        official.structured({}, {}, [], {
          model: "alternative",
          effort: "high",
        }),
    });
    h.jobs({ ...pjob(), profileBinding }, { ...ajob(), profileBinding });
    const original = h.requestPersonal.getMockImplementation()!;
    h.requestPersonal.mockImplementation(
      async (operation: string, args?: any) => {
        if (operation === "fail" && !acknowledged)
          throw Error("acknowledgement also lost");
        return original(operation, args);
      },
    );
    await expect(h.coordinator.step()).rejects.toThrow(
      "start acknowledgement lost after dispatch",
    );
    expect(h.requestPersonal).toHaveBeenCalledWith("fail", {
      id: "source",
      generation: 1,
    });
    const requestCount =
      h.requestPersonal.mock.calls.length +
      h.requestAssistant.mock.calls.length;
    await expect(h.coordinator.step()).rejects.toThrow("COORDINATOR_HALTED");
    expect(
      h.requestPersonal.mock.calls.length +
        h.requestAssistant.mock.calls.length,
    ).toBe(requestCount);
    expect(
      server.request.mock.calls.filter(([method]) => method === "turn/start"),
    ).toHaveLength(1);
    expect(server.interrupt).not.toHaveBeenCalled(); // No returned turnId: stopping is unproven, so the worker must tear down.
    expect(
      h.requestAssistant.mock.calls.some(
        ([operation]: any) => operation === "claim",
      ),
    ).toBe(false);
  },
);
it("refuses a replayed completed claim rather than dispatching the same generation twice", async () => {
  const h = harness();
  h.jobs(pjob(), null);
  await h.coordinator.step();
  await expect(h.coordinator.step()).rejects.toThrow("DUPLICATE_CLAIM");
  expect(h.processPersonal).toHaveBeenCalledOnce();
});
it("stops both routes on shared shutdown and rotates before an expiring session claims work", async () => {
  const h = harness();
  h.abort.abort();
  await expect(h.coordinator.step()).rejects.toThrow();
  expect(h.calls).toEqual([]);
  const expiring = harness();
  expiring.official.session.expiresAt = Date.now() + 30000;
  expect(await expiring.coordinator.step()).toEqual({
    rotate: true,
    worked: false,
    delayMs: 0,
  });
  expect(expiring.calls).toEqual([]);
});
it("passes shared cancellation through an active processor and never announces its late result as complete", async () => {
  const h = harness();
  h.jobs(pjob(), null);
  h.processPersonal.mockImplementation(async (_job: any, deps: any) => {
    h.abort.abort();
    expect(deps.signal.aborted).toBe(true);
  });
  await expect(h.coordinator.step()).rejects.toThrow();
  expect(
    h.onStatus.mock.calls.some(([s]: any) => s.state === "completed"),
  ).toBe(false);
});
it("refuses model/image/allowance incompatibility before costly preparation", async () => {
  const h = harness();
  h.jobs({ ...pjob(), media: { frames: [{}] } }, null);
  h.official.capabilities.mockResolvedValue(
    caps([advertised("alternative", ["high"], ["text"])]),
  );
  await expect(h.coordinator.step()).rejects.toThrow("MODALITY_UNAVAILABLE");
  expect(h.processPersonal).not.toHaveBeenCalled();
  const exhausted = harness();
  exhausted.jobs(pjob(), null);
  exhausted.official.server.request.mockResolvedValue({
    rateLimits: {
      primary: { usedPercent: 0 },
      rateLimitReachedType: "workspace_member_usage_limit_reached",
    },
  } as any);
  await expect(exhausted.coordinator.step()).rejects.toThrow(
    "ALLOWANCE_UNAVAILABLE",
  );
  expect(exhausted.processPersonal).not.toHaveBeenCalled();
});
it("rechecks reported quota at actual turn dispatch if it changes during preparation", async () => {
  let prepared = 0,
    exhausted = false;
  const requests: string[] = [];
  const profileBinding = hash("owner@example.test");
  const server = {
    account: async () => ({
      account: { type: "chatgpt", email: "owner@example.test" },
    }),
    models: async () => ({ data: [advertised()] }),
    onEvent: () => () => {},
    interrupt: vi.fn(),
    request: vi.fn(async (method: string) => {
      requests.push(method);
      if (method === "thread/start")
        return { model: "gpt-6.1-sol", thread: { id: "thread" } };
      if (method === "account/rateLimits/read")
        return {
          rateLimits: {
            primary: { usedPercent: 0 },
            ...(exhausted
              ? { rateLimitReachedType: "rate_limit_reached" }
              : {}),
          },
        };
      throw Error("No model turn is authorized in this fixture");
    }),
  };
  const official = new OfficialAssistantClient(
    { profileBinding, expiresAt: Date.now() + 4 * 3600000 },
    server,
  );
  const job = {
    id: "source",
    generation: 1,
    profileBinding,
    model: "gpt-6.1-sol",
    effort: "medium",
    coverage: "audio_only",
    media: { frames: [] },
    deadline: Date.now() + 180000,
  };
  const request = vi.fn(async (operation: string): Promise<any> =>
    operation === "hello"
      ? { workspaceId: "workspace" }
      : operation === "poll"
        ? { job }
        : operation === "heartbeat"
          ? { valid: true, deadline: job.deadline }
          : { accepted: true },
  );
  const coordinator = createSubscriptionCoordinator({
    official,
    personal: new OfficialPersonalClient(official),
    requestPersonal: request,
    requestAssistant: async (op) =>
      op === "hello" ? { workspaceId: "workspace" } : { job: null },
    signal: new AbortController().signal,
    config: { workspaceId: "workspace" },
    processPersonal: (claimed, deps) =>
      processPersonalJob(claimed, {
        ...deps,
        prepareInput: async () => {
          prepared++;
          exhausted = true;
          return { transcript: [], frameEvidence: [], frames: [] };
        },
      }),
    processAssistant: vi.fn(),
  });
  await expect(coordinator.step()).rejects.toThrow(
    "Personal analysis failed at inference",
  );
  expect(prepared).toBe(1);
  expect(
    requests.filter((op) => op === "account/rateLimits/read"),
  ).toHaveLength(2);
  expect(requests).not.toContain("turn/start");
  expect(request.mock.calls.map(([op]) => op)).not.toContain("complete");
  expect(request).toHaveBeenCalledWith("fail", { id: "source", generation: 1 });
});
it.each([
  {},
  { rateLimits: {} },
  { rateLimits: { primary: { usedPercent: 100 } } },
  { rateLimits: { primary: { usedPercent: -1 } } },
  { rateLimits: { primary: { usedPercent: 1.5 } } },
  {
    rateLimits: {
      primary: { usedPercent: 0 },
      individualLimit: { remainingPercent: 0 },
    },
  },
  {
    rateLimits: {
      primary: { usedPercent: 0 },
      rateLimitReachedType: "workspace_owner_credits_depleted",
    },
  },
])(
  "refuses unknown, malformed or exhausted reported allowance %j",
  (limits) => {
    expect(() => assertReportedAllowance(limits)).toThrow(
      "ALLOWANCE_UNAVAILABLE",
    );
  },
);
it("binds session files only to this child's completed trusted controller announcement", () => {
  const own = controllerAnnouncement(),
    worker = "vibe-trial-abcd-codex",
    other = "vibe-trial-eeee-codex",
    now = Date.now();
  const session = {
    worker,
    profileBinding: binding,
    connectionSaved: true,
    purpose: "personal_library",
    startedAt: now,
    expiresAt: now + 3600000,
  };
  expect(own.accepts(session, now, now)).toBe(false); // Busy child never announced: another process's fresh file is insufficient.
  own.push('{"status":"own_account_');
  expect(own.accepts(session, now, now)).toBe(false);
  own.push(`connected","worker":"${worker}","connectionSaved":true}\n`);
  expect(own.accepts(session, now, now)).toBe(true);
  expect(own.accepts({ ...session, worker: other }, now, now)).toBe(false);
  expect(own.accepts({ ...session, startedAt: now - 1 }, now, now)).toBe(false);
  expect(
    own.accepts({ ...session, expiresAt: now + 4 * 3600000 + 30001 }, now, now),
  ).toBe(false);
  expect(() =>
    own.push(
      `{"status":"own_account_connected","worker":"${other}","connectionSaved":true}\n`,
    ),
  ).toThrow("CONTROLLER_CHANGED");
  expect(() => controllerAnnouncement().push("x".repeat(16001))).toThrow(
    "OUTPUT_LIMIT",
  );
});
it("preserves the personal route's local Docker boundary in the unified entry", () => {
  expect(() =>
    assertLocalDockerEndpoint("npipe:////./pipe/dockerDesktopLinuxEngine\n"),
  ).not.toThrow();
  expect(() => assertLocalDockerEndpoint("tcp://remote.example:2375")).toThrow(
    "LOCAL_DOCKER_REQUIRED",
  );
  expect(() =>
    assertLocalDockerEndpoint(
      "npipe:////./pipe/docker_engine",
      "tcp://remote.example:2375",
    ),
  ).toThrow();
});
it("uses the unchanged route envelopes with bounded reads, shared cancellation and no redirect/retry", async () => {
  const abort = new AbortController(),
    fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{"job":null}', {
          headers: { "content-type": "application/json" },
        }),
    );
  const request = createRunnerRequest({
    server: "https://fixture.convex.site/",
    credential: "x".repeat(43),
    route: "personal",
    signal: abort.signal,
    fetchImpl,
  });
  expect(await request("poll")).toEqual({ job: null });
  expect((fetchImpl.mock.calls[0][0] as URL).href).toBe(
    "https://fixture.convex.site/runner/personal/v1",
  );
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({
    method: "POST",
    redirect: "error",
    cache: "no-store",
    body: '{"protocolVersion":"1.0.0","operation":"poll","args":{}}',
  });
  fetchImpl.mockResolvedValue(
    new Response("{}", {
      headers: {
        "content-type": "application/json",
        "content-length": "1000001",
      },
    }),
  );
  await expect(request("poll")).rejects.toThrow("RESPONSE_LIMIT");
  fetchImpl.mockResolvedValue(
    new Response("x".repeat(1000001), {
      headers: { "content-type": "application/json" },
    }),
  );
  await expect(request("poll")).rejects.toThrow("RESPONSE_LIMIT");
  fetchImpl.mockResolvedValue(
    new Response("{}", {
      status: 403,
      headers: { "content-type": "application/json" },
    }),
  );
  await expect(request("poll")).rejects.toMatchObject({ responseStatus: 403 });
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  abort.abort();
  await expect(request("poll")).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});
