import { afterEach, expect, it, vi } from "vitest";
import { createKnowledgeHandler } from "../packages/mcp/server";
import {
  measureBackendForward,
  measureToolPresentation,
  sampledAssistantObserver,
  type AssistantObservation,
  type AssistantObserver,
} from "../packages/mcp/measurement";
import {
  assistantExceptionCode,
  safeAssistantFailure,
} from "../packages/contracts/assistant-errors";
import { chatProposalFailure } from "../packages/contracts/chat-proposals";
import { tools as assistantHttpTools } from "../convex/assistantHttp";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

async function callMcp(
  result: { ok: boolean; status: number; value: Record<string, unknown> },
  observe?: AssistantObserver,
  name = "search",
  args: Record<string, unknown> = { query: "private fixture title" },
  scopes = ["knowledge:read"],
  invokeError?: Error,
) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name,
      arguments: args,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {
          name: "Synthetic transport fixture",
          version: "1",
        },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };
  const invoke = vi.fn(async () => {
    if (invokeError) throw invokeError;
    return result;
  });
  const response = await createKnowledgeHandler(
    invoke,
    false,
    false,
    true,
    false,
    { observe },
  ).fetch(
    new Request("https://example.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/call",
        "mcp-name": name,
      },
      body: JSON.stringify(body),
    }),
    {
      parsedBody: body,
      authInfo: {
        token: "private-synthetic-bearer",
        clientId: "private-client",
        scopes,
        resource: new URL("https://scroll.companynerve.com/mcp"),
      },
    },
  );
  return { packet: await response.json(), invoke, response };
}

it("measures exact synthetic tool body bytes without recording payloads or changing the response", async () => {
  const observations: AssistantObservation[] = [];
  const value = {
    results: [
      {
        title: "Private café fixture",
        id: "private-source",
        url: "https://example.test/post",
        state: "queued",
      },
    ],
    next_offset: null,
    next_cursor: null,
    profile_id: "synthetic-profile",
    grant_version: 1,
    coverage: "synthetic",
    scanned_posts: 1,
    matched_items: 1,
    has_more: false,
    exhausted: true,
    truncated: false,
    match_limit_reached: false,
  };
  const { packet } = await callMcp({ ok: true, status: 200, value }, (e) => {
    observations.push(e);
  });
  expect(packet.result.structuredContent).toEqual(value);
  expect(observations).toEqual([
    {
      boundary: "tool_presentation",
      operation: "search",
      durationMs: expect.any(Number),
      responseBytes: bytes({
        content: packet.result.content,
        structuredContent: value,
      }),
      nativeImageBytes: 0,
      outcome: "ok",
    },
  ]);
  expect(JSON.stringify(observations)).not.toMatch(
    /café|private-source|bearer|query|client/,
  );
});

it.each([
  [401, "INSUFFICIENT_CREDITS", "AUTH_REQUIRED", "authentication"],
  [403, "FORBIDDEN", "FORBIDDEN", "authorization"],
  [400, "INSUFFICIENT_CREDITS", "INSUFFICIENT_CREDITS", "funding"],
  [409, "APPROVAL_STALE", "APPROVAL_STALE", "state"],
  [400, "SETUP_REQUIRED", "SETUP_REQUIRED", "setup"],
  [503, "PRIVATE_BACKEND_EXCEPTION", "UNAVAILABLE", "transport"],
  [503, "AUTH_REQUIRED", "UNAVAILABLE", "transport"],
])(
  "returns safe MCP error %s/%s and challenges only a real 401",
  async (status, code, expectedCode, stage) => {
    const observations: AssistantObservation[] = [];
    const { packet } = await callMcp(
      {
        ok: false,
        status,
        value: {
          code,
          error: "PRIVATE raw failure and token",
          correlation_id: "private-source-id",
          next_action: { tool: "spend_money", args: { secret: "PRIVATE" } },
        },
      },
      (e) => {
        observations.push(e);
      },
    );
    expect(packet.result.isError).toBe(true);
    const failure = JSON.parse(packet.result.content[0].text);
    expect(failure).toMatchObject({
      code: expectedCode,
      stage,
      retryability: expect.any(String),
      correlation_id: expect.stringMatching(/^[a-f0-9-]{36}$/),
    });
    expect(packet.result._meta?.["mcp/www_authenticate"] !== undefined).toBe(
      status === 401,
    );
    expect(JSON.stringify(packet)).not.toMatch(
      /PRIVATE|private-source-id|spend_money/,
    );
    expect(observations[0]).toMatchObject({
      outcome: "error",
      responseBytes: bytes({
        content: packet.result.content,
        isError: true,
        ...(status === 401
          ? {
              _meta: {
                "mcp/www_authenticate":
                  packet.result._meta["mcp/www_authenticate"],
              },
            }
          : {}),
      }),
    });
  },
);

it("turns a thrown forwarding exception into safe uncertain-work recovery without reflecting it", async () => {
  const { packet } = await callMcp(
    { ok: true, status: 200, value: {} },
    undefined,
    "search",
    { query: "private fixture" },
    ["knowledge:read"],
    Error("PRIVATE network credentials"),
  );
  expect(packet.result.isError).toBe(true);
  expect(JSON.parse(packet.result.content[0].text)).toMatchObject({
    code: "UNAVAILABLE",
    retryability: "reconcile_first",
    next_action: { action: "reconcile_existing" },
  });
  expect(JSON.stringify(packet)).not.toContain("PRIVATE");
  expect(packet.result._meta?.["mcp/www_authenticate"]).toBeUndefined();
});

it("preserves the proposal-specific safe message and workspace recovery action", () => {
  expect(safeAssistantFailure("SOURCE_BUSY", { proposal: true }).error).toBe(
    chatProposalFailure("SOURCE_BUSY")!.error,
  );
  expect(safeAssistantFailure("PROFILE_SELECTION_REQUIRED")).toMatchObject({
    next_action: { tool: "get_profile", args: {} },
  });
  expect(
    assistantExceptionCode(
      Error("Uncaught PolicyError: INSUFFICIENT_CREDITS: PRIVATE user detail"),
    ),
  ).toBe("INSUFFICIENT_CREDITS");
  expect(
    assistantExceptionCode(Error("UNKNOWN_SECRET: private detail")),
  ).toBeUndefined();
});

it("measures native image bytes separately from base64 and tool envelope bytes", async () => {
  const observations: AssistantObservation[] = [];
  const { packet } = await callMcp(
    {
      ok: true,
      status: 200,
      value: {
        data: "AQIDBA==",
        mimeType: "image/jpeg",
        width: 1,
        height: 1,
      },
    },
    (e) => {
      observations.push(e);
    },
    "work_cloud_retained_frame",
    {
      sourceId: "private-source",
      generation: 1,
      taskId: "private-task",
      leaseToken: crypto.randomUUID(),
      attemptId: "private-attempt",
      frameId: "frame-1",
    },
    ["analysis:execute"],
  );
  expect(packet.result.content[1]).toMatchObject({
    type: "image",
    data: "AQIDBA==",
  });
  expect(observations[0]).toMatchObject({
    nativeImageBytes: 4,
    responseBytes: bytes({ content: packet.result.content }),
  });
  expect(observations[0].responseBytes).toBeGreaterThan(4);
});

it.each([200, 401, 403, 503])(
  "measures exact backend body bytes for HTTP %s while preserving the readable response",
  async (status) => {
    const observations: AssistantObservation[] = [];
    const body = ' { "value": "private café fixture" }\n';
    const response = await measureBackendForward(
      "search",
      (e) => {
        observations.push(e);
      },
      async () => new Response(body, { status }),
    );
    expect(await response.text()).toBe(body);
    expect(observations[0]).toMatchObject({
      boundary: "backend_forward",
      responseBytes: new TextEncoder().encode(body).byteLength,
      nativeImageBytes: 0,
      outcome: status === 200 ? "ok" : status === 503 ? "error" : "denied",
    });
    expect(JSON.stringify(observations)).not.toContain("private");
  },
);

it("bounds sampled byte inspection and preserves oversized response rejection by its caller", async () => {
  const observe = vi.fn();
  const response = await measureBackendForward(
    "search",
    observe,
    async () => new Response("x".repeat(1000)),
    10,
  );
  expect(observe).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: "unknown" }),
  );
  expect((await response.text()).length).toBe(1000);
});

it("does not let synchronous or asynchronous observer failures change user operations", async () => {
  for (const observe of [
    () => {
      throw Error("PRIVATE observer detail");
    },
    async () => {
      throw Error("PRIVATE async observer");
    },
  ]) {
    const value = { content: [{ type: "text", text: "safe fixture" }] };
    expect(
      await measureToolPresentation("search", observe, async () => value),
    ).toBe(value);
    const response = await measureBackendForward("search", observe, async () =>
      Response.json({ ok: true }),
    );
    expect(await response.json()).toEqual({ ok: true });
  }
  const error = Error("PRIVATE network detail");
  const observe = vi.fn();
  await expect(
    measureBackendForward("search", observe, async () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(observe).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: "unknown", responseBytes: 0 }),
  );
  expect(JSON.stringify(observe.mock.calls)).not.toContain("PRIVATE");
});

it("defaults measurement off and logs only sanitized sampled scalars", () => {
  const log = vi.fn();
  expect(sampledAssistantObserver({}, () => 0, log)).toBeUndefined();
  for (const value of ["NaN", "-1", "1.1", "0"])
    expect(
      sampledAssistantObserver(
        { MCP_MEASUREMENT_SAMPLE_RATE: value },
        () => 0,
        log,
      ),
    ).toBeUndefined();
  expect(
    sampledAssistantObserver(
      { MCP_MEASUREMENT_SAMPLE_RATE: "0.1" },
      () => 0.5,
      log,
    ),
  ).toBeUndefined();
  const observe = sampledAssistantObserver(
    { MCP_MEASUREMENT_SAMPLE_RATE: "1" },
    () => 0,
    log,
  )!;
  const event = {
    boundary: "backend_forward" as const,
    operation: "search",
    durationMs: 2,
    responseBytes: 10,
    nativeImageBytes: 0,
    outcome: "ok" as const,
    secret: "PRIVATE",
  };
  observe(event);
  expect(log).toHaveBeenCalledExactlyOnceWith({
    boundary: event.boundary,
    operation: "search",
    durationMs: 2,
    responseBytes: 10,
    nativeImageBytes: 0,
    outcome: "ok",
  });
  observe({ ...event, operation: "private/source-id" });
  observe({ ...event, durationMs: NaN });
  expect(log).toHaveBeenCalledOnce();
});

const http = (
  assistantHttpTools as unknown as {
    _handler: (ctx: unknown, request: Request) => Promise<Response>;
  }
)._handler;
async function httpFixture(
  error?: Error,
  userinfoStatus = 200,
  args: unknown = { query: "private fixture" },
) {
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("MCP_AUTH_ISSUER", "https://synthetic-transport.authkit.app");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ sub: "private-subject" }, { status: userinfoStatus }),
    ),
  );
  const runQuery = vi.fn(async () => {
    if (error) throw error;
    return { results: [] };
  });
  const runMutation = vi.fn(async () => ({
    issuer: "https://synthetic-transport.authkit.app",
    subject: "private-subject",
  }));
  const response = await http(
    { runQuery, runMutation },
    new Request("https://example.test/assistant-tools", {
      method: "POST",
      headers: { authorization: "Bearer private-synthetic-token-0123456789" },
      body: JSON.stringify({ operation: "search", args }),
    }),
  );
  return { response, runQuery, runMutation };
}

it.each([
  ["INSUFFICIENT_CREDITS", 400, "funding"],
  ["APPROVAL_STALE", 409, "state"],
  ["FORBIDDEN", 403, "authorization"],
  ["UNKNOWN_DETAIL", 503, "transport"],
])(
  "keeps backend exception details private for %s",
  async (code, status, stage) => {
    const { response } = await httpFixture(
      Error(`${code}: PRIVATE credential and source-id`),
    );
    expect(response.status).toBe(status);
    const value = await response.json();
    expect(value).toMatchObject({
      code: code === "UNKNOWN_DETAIL" ? "UNAVAILABLE" : code,
      stage,
    });
    expect(JSON.stringify(value)).not.toMatch(
      /PRIVATE|source-id|private-subject/,
    );
  },
);

it("distinguishes a provider outage from an expired token and rejects malformed inputs before dispatch", async () => {
  for (const status of [401, 403, 503]) {
    const { response, runQuery } = await httpFixture(undefined, status);
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(
      status === 401
        ? "AUTH_REQUIRED"
        : status === 403
          ? "FORBIDDEN"
          : "UNAVAILABLE",
    );
    expect(runQuery).not.toHaveBeenCalled();
  }
  const { response, runQuery, runMutation } = await httpFixture(
    undefined,
    200,
    { query: "private", extra: "PRIVATE" },
  );
  expect(response.status).toBe(400);
  expect((await response.json()).code).toBe("INVALID_INPUT");
  expect(runQuery).not.toHaveBeenCalled();
  expect(runMutation).not.toHaveBeenCalled();
});
