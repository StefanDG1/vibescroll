import { expect, it, vi } from "vitest";
import { createKnowledgeHandler } from "../packages/mcp/server";
const invoke = vi.fn(async () => ({
  ok: true,
  status: 200,
  value: { results: [] },
}));
async function packet(response: Response) {
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = (await response.text())
      .split("\n")
      .find((line) => line.startsWith("data: "));
    if (!data) throw Error("Missing legacy MCP result");
    return JSON.parse(data.slice(6));
  }
  return response.json();
}
async function call(method: string, params: unknown, scopes: string[]) {
  const body = { jsonrpc: "2.0", id: 1, method, params };
  return createKnowledgeHandler(invoke).fetch(
    new Request("https://scroll.companynerve.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify(body),
    }),
    {
      parsedBody: body,
      authInfo: {
        token: "synthetic-test-token",
        clientId: "synthetic-test-client",
        scopes,
        resource: new URL("https://scroll.companynerve.com/mcp"),
        resourceMetadataUrl:
          "https://scroll.companynerve.com/.well-known/oauth-protected-resource/mcp",
      },
    },
  );
}
it("exposes bounded read and explicit intake schemas through actual stateless MCP dispatch", async () => {
  const response = await call("tools/list", {}, [
    "knowledge:read",
    "links:save",
  ]);
  expect(response.status).toBe(200);
  const result = await packet(response);
  expect(result.result.tools.map((t: { name: string }) => t.name)).toContain(
    "search",
  );
  const save = result.result.tools.find(
    (t: { name: string }) => t.name === "save_link",
  );
  expect(save.annotations.readOnlyHint).toBe(false);
  expect(save.inputSchema.required).not.toContain("explicitlyRequested");
  expect(save.inputSchema.required).not.toContain("rightsAttested");
  expect(save.inputSchema.additionalProperties).toBe(false);
});
it("bounds argument elements before schema validation or backend dispatch", async () => {
  invoke.mockClear();
  const response = await call(
    "tools/call",
    {
      name: "search",
      arguments: { query: "synthetic", extra: Array(1025).fill(0) },
    },
    ["knowledge:read"],
  );
  expect(JSON.stringify(await packet(response))).toContain(
    "maximum of 1024 elements",
  );
  expect(invoke).not.toHaveBeenCalled();
});
it("challenges absent tool scopes before invoking the backend and rejects unknown tool input", async () => {
  invoke.mockClear();
  const response = await call(
    "tools/call",
    { name: "search", arguments: { query: "synthetic" } },
    [],
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("www-authenticate")).toContain("knowledge:read");
  expect(invoke).not.toHaveBeenCalled();
  await call(
    "tools/call",
    { name: "search", arguments: { query: "synthetic", actor: "foreign" } },
    ["knowledge:read"],
  );
  expect(invoke).not.toHaveBeenCalled();
  const good = await call(
    "tools/call",
    { name: "search", arguments: { query: "synthetic" } },
    ["knowledge:read"],
  );
  expect((await packet(good)).result.structuredContent).toEqual({
    results: [],
  });
  expect(invoke).toHaveBeenCalledOnce();
});

it("requires the feedback scope and explicit request before dispatching a versioned judgment", async () => {
  invoke.mockClear();
  const input = {
    sourceId: "selected-source",
    generation: 1,
    revision: 123,
    grantVersion: 1,
    key: "feedback-key",
    expectedVersion: 0,
    explicitlyRequested: true,
    action: "later",
    note: "Review next week",
  };
  const denied = await call(
    "tools/call",
    { name: "record_feedback", arguments: input },
    ["knowledge:read"],
  );
  expect(denied.status).toBe(403);
  expect(denied.headers.get("www-authenticate")).toContain("feedback:write");
  expect(invoke).not.toHaveBeenCalled();
  await call(
    "tools/call",
    {
      name: "record_feedback",
      arguments: { ...input, explicitlyRequested: false },
    },
    ["feedback:write"],
  );
  expect(invoke).not.toHaveBeenCalled();
  const accepted = await call(
    "tools/call",
    { name: "record_feedback", arguments: input },
    ["feedback:write"],
  );
  expect(accepted.status).toBe(200);
  expect(invoke).toHaveBeenCalledWith("record_feedback", input);
});
it("blocks foreign browser origins and rebinding hosts without requiring Origin from server clients", async () => {
  const { assistantRequestAllowed, readAssistantBody } =
    await import("../packages/policy/assistant-http");
  const req = (headers: Record<string, string>) =>
    new Request("https://scroll.companynerve.com/mcp", { headers });
  expect(
    assistantRequestAllowed(req({ host: "scroll.companynerve.com" })),
  ).toBe(true);
  expect(
    assistantRequestAllowed(
      req({
        host: "scroll.companynerve.com",
        origin: "https://scroll.companynerve.com",
      }),
    ),
  ).toBe(true);
  for (const host of [
    "evil.example",
    "scroll.companynerve.com:443",
    "scroll.companynerve.com@evil.example",
    "",
  ]) {
    expect(assistantRequestAllowed(req({ host }))).toBe(false);
  }
  for (const origin of [
    "null",
    "http://scroll.companynerve.com",
    "https://scroll.companynerve.com:444",
    "https://evil.example",
    "",
  ]) {
    expect(
      assistantRequestAllowed(req({ host: "scroll.companynerve.com", origin })),
    ).toBe(false);
  }
  await expect(
    readAssistantBody(new Response("x".repeat(20)), 10),
  ).rejects.toThrow("too large");
  await expect(
    readAssistantBody(new Response(new Uint8Array([255])), 10),
  ).rejects.toThrow();
  await expect(
    readAssistantBody(
      new Response("{}", { headers: { "content-length": "-1" } }),
      10,
    ),
  ).rejects.toThrow();
});

it("serves modern MCP discovery/tools with per-request identity and rejects a missing envelope", async () => {
  const handler = createKnowledgeHandler(invoke);
  const authInfo = {
    token: "synthetic-test-token",
    clientId: "synthetic-test-client",
    scopes: ["knowledge:read"],
    resource: new URL("https://scroll.companynerve.com/mcp"),
  };
  const run = async (params: Record<string, unknown>) => {
    const body = { jsonrpc: "2.0", id: 7, method: "tools/list", params };
    return handler.fetch(
      new Request("https://scroll.companynerve.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/list",
        },
        body: JSON.stringify(body),
      }),
      { parsedBody: body, authInfo },
    );
  };
  const absent = await run({});
  expect(absent.status).toBe(400);
  const response = await run({
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        name: "Synthetic acceptance client",
        version: "1.0",
      },
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(
    (await packet(response)).result.tools.some(
      (tool: { name: string }) => tool.name === "fetch",
    ),
  ).toBe(true);
});

it("requires the project draft scope and exact review bindings through actual MCP dispatch", async () => {
  invoke.mockClear();
  const input = {
    profileId: "selected-profile",
    evaluationId: "current-evaluation",
    evaluationHash: "a".repeat(64),
    grantVersion: 1,
    explicitlyRequested: true,
  };
  const denied = await call(
    "tools/call",
    { name: "draft_project_suggestion", arguments: input },
    ["context:read"],
  );
  expect(denied.status).toBe(403);
  expect(invoke).not.toHaveBeenCalled();
  await call(
    "tools/call",
    {
      name: "draft_project_suggestion",
      arguments: { ...input, publicationApproved: true },
    },
    ["suggestions:draft", "context:read"],
  );
  expect(invoke).not.toHaveBeenCalled();
  const missingContext = await call(
    "tools/call",
    { name: "draft_project_suggestion", arguments: input },
    ["suggestions:draft"],
  );
  expect(missingContext.status).toBe(403);
  expect(invoke).not.toHaveBeenCalled();
  const good = await call(
    "tools/call",
    { name: "draft_project_suggestion", arguments: input },
    ["suggestions:draft", "context:read"],
  );
  expect(good.status).toBe(200);
  expect(invoke).toHaveBeenCalledWith("draft_project_suggestion", input);
});

it("serves scoped Events through the actual modern SDK and excludes legacy/disabled catalogs", async () => {
  const operation = vi.fn(async (op: string) => ({
    ok: true,
    status: 200,
    value:
      op === "events/subscribe"
        ? {
            id: "sub_synthetic",
            refreshBefore: "2026-10-07T06:00:00Z",
            cursor: null,
            truncated: false,
          }
        : {},
  }));
  const run = async (
    method: string,
    params: Record<string, unknown>,
    scopes = ["events:subscribe"],
    enabled = true,
  ) => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": {
            name: "Synthetic Events",
            version: "1",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    };
    return createKnowledgeHandler(operation, enabled).fetch(
      new Request("https://scroll.companynerve.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": method,
        },
        body: JSON.stringify(body),
      }),
      {
        parsedBody: body,
        authInfo: {
          token: "synthetic-token",
          clientId: "synthetic",
          scopes,
          resource: new URL("https://scroll.companynerve.com/mcp"),
        },
      },
    );
  };
  const discovery = await run("server/discover", {});
  expect(discovery.status, await discovery.clone().text()).toBe(200);
  expect((await packet(discovery)).result.capabilities.events).toEqual({});
  const list = await run("events/list", {});
  expect(list.status, await list.clone().text()).toBe(200);
  expect((await packet(list)).result.events[0].name).toBe("analysis_completed");
  operation.mockClear();
  const denied = await run("events/list", {}, []);
  expect((await packet(denied)).error).toBeDefined();
  expect(operation).not.toHaveBeenCalled();
  const params = {
    name: "analysis_completed",
    arguments: {
      profileId: "private",
      sourceId: "source",
      generation: 1,
      grantVersion: 1,
    },
    delivery: {
      mode: "webhook",
      url: "https://receiver.example/callback",
      secret: "whsec_" + Buffer.alloc(24, 1).toString("base64"),
    },
    cursor: null,
  };
  const subscribed = await run("events/subscribe", params);
  expect((await packet(subscribed)).result.id).toBe("sub_synthetic");
  expect(operation).toHaveBeenCalledWith("events/subscribe", params);
  operation.mockClear();
  await run("events/subscribe", {
    ...params,
    arguments: { ...params.arguments, actor: "foreign" },
  });
  expect(operation).not.toHaveBeenCalled();
  const stopped = await run("events/unsubscribe", {
    name: params.name,
    arguments: params.arguments,
    delivery: { mode: "webhook", url: params.delivery.url },
  });
  expect((await packet(stopped)).result).toBeDefined();
  const disabled = await run(
    "server/discover",
    {},
    ["events:subscribe"],
    false,
  );
  expect((await packet(disabled)).result.capabilities.events).toBeUndefined();
  const legacy = await call("events/list", {}, ["events:subscribe"]);
  expect((await packet(legacy)).error).toBeDefined();
});

it("explains unsupported intake before backend dispatch and preserves supported-link dispatch", async () => {
  invoke.mockClear();
  const args = {
    url: "https://github.com/owner/disposable",
    title: "Owned test",
    key: "intake-replay-key",
    explicitlyRequested: true,
    rightsAttested: true,
  };
  const rejected = await packet(
    await call("tools/call", { name: "save_link", arguments: args }, [
      "links:save",
    ]),
  );
  expect(rejected.result.isError).toBe(true);
  expect(JSON.parse(rejected.result.content[0].text).code).toBe(
    "UNSUPPORTED_SOURCE",
  );
  expect(invoke).not.toHaveBeenCalled();
  await call(
    "tools/call",
    {
      name: "save_link",
      arguments: { ...args, url: "https://www.youtube.com/watch?v=owned_test" },
    },
    ["links:save"],
  );
  expect(invoke).toHaveBeenCalledOnce();
});
