import { afterEach, expect, it, vi } from "vitest";
import { createKnowledgeHandler } from "../packages/mcp/server";
import { tools as assistantHttpTools } from "../convex/assistantHttp";
import { readAssistantBody } from "../packages/policy/assistant-http";
import {
  cloudCompletionEnvelope,
  parseWorkCloudResult,
  workCloudCompleteInput,
  workCloudLeaseInput,
  workCloudFrameInput,
  workCloudPreparationStage,
  validateWorkCloudTextOutput,
} from "../packages/contracts/work-cloud-text";

const lease = {
  sourceId: "synthetic-source",
  generation: 2,
  taskId: "actual-host-task",
  leaseToken: crypto.randomUUID(),
};
it.each(["metadata", "frame"])(
  "returns %s through the existing connected preparation tool and authenticated handler",
  async (stage) => {
    const issuer = "https://synthetic-test.authkit.app";
    vi.stubEnv("MCP_ENABLED", "true");
    vi.stubEnv("MCP_AUTH_ISSUER", issuer);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ sub: "synthetic-subject" })),
    );
    const runMutation = vi.fn(
      async (_op: unknown, args: Record<string, unknown>) =>
        Object.keys(args).length === 0
          ? { issuer, subject: "synthetic-subject" }
          : { accepted: true },
    );
    const runAction = vi.fn(async () => ({ assetId: "synthetic-frame" }));
    const payload = {
      schemaVersion: "work-cloud-media-stage-v1",
      stage,
      ...(stage === "metadata"
        ? { metadata: { title: "Native title", authorName: "Creator" } }
        : {
            frameId: "frame-1",
            preparationHash: "a".repeat(64),
            data: Buffer.alloc(81920, 1).toString("base64"),
          }),
    };
    const args = { ...lease, preparationJson: JSON.stringify(payload) };
    const host = mcp(false, ["analysis:execute"], true);
    expect(
      (
        await packet(
          await host.call("tools/call", {
            name: "work_cloud_prepare",
            arguments: args,
          }),
        )
      ).result.isError,
    ).not.toBe(true);
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith(
      "work_cloud_prepare",
      args,
    );
    const handler = (
      assistantHttpTools as unknown as {
        _handler: (ctx: unknown, request: Request) => Promise<Response>;
      }
    )._handler;
    const response = await handler(
      { runMutation, runAction },
      new Request("https://synthetic.example/assistant-tools", {
        method: "POST",
        headers: { authorization: "Bearer synthetic-access-token-0123456789" },
        body: JSON.stringify({ operation: "work_cloud_prepare", args }),
      }),
    );
    expect(response.status).toBe(200);
    const validated = workCloudPreparationStage.parse(payload);
    if (validated.stage === "metadata") {
      expect(runMutation.mock.calls[1][1]).toEqual({
        ...lease,
        operation: "metadata",
        metadata: validated.metadata,
      });
      expect(runAction).not.toHaveBeenCalled();
    } else {
      expect(runAction).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
        ...lease,
        frameId: validated.frameId,
        preparationHash: validated.preparationHash,
        data: validated.data,
      });
      expect(runMutation).toHaveBeenCalledOnce();
    }
    for (const patch of [
      { sourceId: "other-source" },
      { leaseToken: crypto.randomUUID() },
      { extra: true },
      ...(stage === "frame"
        ? [
            { data: "a".repeat(109232) },
            { data: Buffer.alloc(81921).toString("base64") },
          ]
        : []),
    ]) {
      expect(
        workCloudPreparationStage.safeParse({ ...payload, ...patch }).success,
      ).toBe(false);
    }
  },
);
it("rejects deeply nested unknown output before recursive hashing or serialization", () => {
  let extra: unknown = null;
  for (let i = 0; i < 20000; i++) extra = { nested: extra };
  expect(() =>
    validateWorkCloudTextOutput(
      {
        schemaVersion: "1.0.0",
        sourceId: "synthetic",
        processingRunId: "synthetic:1",
        coverage: "caption_only",
        summary: "No invented insight",
        insights: [],
        warnings: [],
        extra,
      },
      false,
    ),
  ).toThrow(/unrecognized_keys/);
});
async function packet(response: Response) {
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = (await response.text())
      .split("\n")
      .find((line) => line.startsWith("data: "));
    if (!data) throw Error("Missing MCP packet");
    return JSON.parse(data.slice(6));
  }
  return response.json();
}
function mcp(
  enabled: boolean,
  scopes = ["analysis:execute"],
  media = false,
  protocol = "2025-11-25",
) {
  const invoke = vi.fn(async () => ({
    ok: true,
    status: 200,
    value: { accepted: true },
  }));
  const handler = createKnowledgeHandler(invoke, false, enabled, media);
  return {
    invoke,
    async call(method: string, params: unknown) {
      const body = {
        jsonrpc: "2.0",
        id: 1,
        method,
        params:
          protocol === "2026-07-28"
            ? {
                ...(params as Record<string, unknown>),
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": protocol,
                  "io.modelcontextprotocol/clientInfo": {
                    name: "Synthetic Cloud",
                    version: "1",
                  },
                  "io.modelcontextprotocol/clientCapabilities": {},
                },
              }
            : params,
      };
      return handler.fetch(
        new Request("https://scroll.companynerve.com/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": protocol,
            "mcp-method": method,
            ...(method === "tools/call"
              ? { "mcp-name": String((params as { name: string }).name) }
              : {}),
          },
          body: JSON.stringify(body),
        }),
        {
          parsedBody: body,
          authInfo: {
            token: "synthetic-token",
            clientId: "synthetic-client",
            scopes,
            resource: new URL("https://scroll.companynerve.com/mcp"),
            resourceMetadataUrl:
              "https://scroll.companynerve.com/.well-known/oauth-protected-resource/mcp",
          },
        },
      );
    },
  };
}
const cloudRequest = {
  sourceId: lease.sourceId,
  mode: "work_cloud",
  generation: 2,
  revision: 0,
  grantVersion: 1,
  cloud: {
    model: "requested-model",
    effort: "medium",
    useOwnPlan: true,
    maxApiUsd: 0,
    retainUntil: 1800000000000,
  },
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each(["2025-11-25", "2026-07-28"])(
  "transports native metadata and separate repair authority over %s",
  async (protocol) => {
    const host = mcp(false, ["analysis:execute"], true, protocol);
    const tools = (await packet(await host.call("tools/list", {}))).result
      .tools;
    for (const [name, args] of [
      [
        "work_cloud_metadata",
        {
          ...lease,
          metadata: { title: "Native title", authorName: "Creator" },
        },
      ],
      [
        "work_cloud_repair_claim",
        {
          sourceId: lease.sourceId,
          generation: lease.generation,
          taskId: "fresh-repair",
        },
      ],
      ["work_cloud_repair_input", lease],
      ["work_cloud_repair_heartbeat", lease],
      ["work_cloud_repair_complete", lease],
      [
        "work_cloud_frame",
        {
          ...lease,
          repair: true,
          frameId: "frame-1",
          preparationHash: "a".repeat(64),
          data: "YQ==",
        },
      ],
    ] as const) {
      expect(tools.some((tool: { name: string }) => tool.name === name)).toBe(
        true,
      );
      const result = await packet(
        await host.call("tools/call", { name, arguments: args }),
      );
      expect(result.result.isError).not.toBe(true);
      expect(host.invoke).toHaveBeenLastCalledWith(name, args);
      const disabled = mcp(false, ["analysis:execute"], false, protocol);
      await disabled.call("tools/call", { name, arguments: args });
      expect(disabled.invoke).not.toHaveBeenCalled();
    }
  },
);
it.each(["2025-11-25", "2026-07-28"])(
  "transports bounded frame bytes only through the media capability over %s",
  async (protocol) => {
    const host = mcp(false, ["analysis:execute"], true, protocol);
    const args = {
      ...lease,
      frameId: "frame-1",
      preparationHash: "a".repeat(64),
      data: "YQ==",
    };
    const response = await packet(
      await host.call("tools/call", {
        name: "work_cloud_frame",
        arguments: args,
      }),
    );
    expect(response.result.isError).not.toBe(true);
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith(
      "work_cloud_frame",
      args,
    );
    const disabled = mcp(true, ["analysis:execute"], false, protocol);
    await disabled.call("tools/call", {
      name: "work_cloud_frame",
      arguments: args,
    });
    expect(disabled.invoke).not.toHaveBeenCalled();
    expect(
      workCloudFrameInput.safeParse({ ...args, data: "a".repeat(200004) })
        .success,
    ).toBe(false);
    expect(
      workCloudFrameInput.safeParse({ ...args, data: "YQ==\n" }).success,
    ).toBe(false);
    expect(
      cloudCompletionEnvelope({ operation: "work_cloud_frame", args }),
    ).toBe(true);
    expect(
      cloudCompletionEnvelope(
        {
          method: "tools/call",
          params: { name: "work_cloud_frame", arguments: args },
        },
        true,
      ),
    ).toBe(true);
  },
);
it.each(["2025-11-25", "2026-07-28"])(
  "transports exact Cloud requests and preserves legacy modes over %s",
  async (protocol) => {
    const host = mcp(
      false,
      ["analysis:request", "analysis:execute"],
      true,
      protocol,
    );
    const tools = (await packet(await host.call("tools/list", {}))).result
      .tools;
    const request = tools.find(
      (tool: { name: string }) => tool.name === "request_analysis",
    );
    expect(request.inputSchema.properties.mode.enum).toContain("work_cloud");
    expect(request.inputSchema.properties.cloud.additionalProperties).toBe(
      false,
    );
    expect(request.description).toContain(
      "does not automatically launch a host task",
    );
    const response = await host.call("tools/call", {
      name: "request_analysis",
      arguments: cloudRequest,
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await packet(response)).result.structuredContent).toEqual({
      accepted: true,
    });
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith(
      "request_analysis",
      cloudRequest,
    );
    for (const mode of [undefined, "local", "credits", "projects", "cancel"]) {
      host.invoke.mockClear();
      await host.call("tools/call", {
        name: "request_analysis",
        arguments: { sourceId: lease.sourceId, ...(mode ? { mode } : {}) },
      });
      expect(host.invoke).toHaveBeenCalledOnce();
    }
  },
);
it("keeps Cloud requests unavailable by default or with only the text gate", async () => {
  for (const host of [
    mcp(false, ["analysis:request"]),
    mcp(true, ["analysis:request"]),
  ]) {
    const tools = (await packet(await host.call("tools/list", {}))).result
      .tools;
    for (const name of ["save_link", "request_analysis"]) {
      const tool = tools.find((tool: { name: string }) => tool.name === name);
      expect(tool.description).not.toContain("Work Cloud chat");
      expect(tool.description).not.toContain("mode=work_cloud");
    }
    expect(
      tools.find((tool: { name: string }) => tool.name === "request_analysis")
        .description,
    ).toMatch(/^Request supported media local extraction/);
    expect(
      tools.find((tool: { name: string }) => tool.name === "request_analysis")
        .inputSchema.properties.mode.enum,
    ).not.toContain("work_cloud");
    await host.call("tools/call", {
      name: "request_analysis",
      arguments: cloudRequest,
    });
    expect(host.invoke).not.toHaveBeenCalled();
    await host.call("tools/call", {
      name: "request_analysis",
      arguments: { sourceId: lease.sourceId },
    });
    expect(host.invoke).toHaveBeenCalledOnce();
  }
});
it.each(["2025-11-25", "2026-07-28"])(
  "guides an awake Cloud host inline without turning save into execution over %s",
  async (protocol) => {
    const host = mcp(false, ["links:save", "analysis:request"], true, protocol);
    const tools = (await packet(await host.call("tools/list", {}))).result
      .tools;
    for (const name of ["save_link", "request_analysis"]) {
      const { description } = tools.find(
        (tool: { name: string }) => tool.name === name,
      );
      expect(description).toMatch(/^For an exact supported video/);
      expect(description).toContain("continue in this same user turn");
      expect(description).toContain(
        "Before request_analysis or work_cloud_claim",
      );
      expect(description).toContain(
        "Save with analyze=false, then read get_job_status",
      );
      expect(description).toContain("explicit_per_source_v1");
      expect(description).toContain("maxApiUsd=0");
      expect(description).toContain("saving alone grants no Cloud execution");
      expect(description).toContain(
        "No pasted second message, Events subscription, GitHub or fresh per-post app approval",
      );
      expect(description).toContain("private_only");
      expect(description).toContain(
        "does not automatically launch a host task",
      );
      expect(description).toContain(
        "separately accepted background wake/execution bridge",
      );
      expect(description).toMatch(
        /Never choose credits automatically|without automatically spending credits/,
      );
    }
    const args = {
      url: "https://www.instagram.com/reel/ExactVideo/",
      title: "Requested video",
      key: "inline-cloud-fixture",
      analyze: false,
    };
    const saved = await host.call("tools/call", {
      name: "save_link",
      arguments: args,
    });
    expect(saved.status).toBe(200);
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith("save_link", args);
  },
);
it("challenges missing request scope before invoking a Cloud request", async () => {
  const host = mcp(false, ["analysis:execute"], true);
  const response = await host.call("tools/call", {
    name: "request_analysis",
    arguments: cloudRequest,
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("www-authenticate")).toContain(
    "analysis:request",
  );
  expect(host.invoke).not.toHaveBeenCalled();
});
it("rejects malformed Cloud request fields before invoking", async () => {
  const host = mcp(false, ["analysis:request"], true);
  for (const patch of [
    { generation: -1 },
    { generation: 1.5 },
    { revision: -1 },
    { revision: 0.5 },
    { grantVersion: 0 },
    { grantVersion: 1.5 },
    ...[
      { model: "" },
      { model: "x".repeat(101) },
      { effort: "ultra" },
      { useOwnPlan: false },
      { maxApiUsd: 1 },
      { retainUntil: 0 },
      { retainUntil: 1.5 },
      { extra: true },
    ].map((cloud) => ({ cloud: { ...cloudRequest.cloud, ...cloud } })),
    { extra: true },
  ]) {
    await host.call("tools/call", {
      name: "request_analysis",
      arguments: { ...cloudRequest, ...patch },
    });
    expect(host.invoke).not.toHaveBeenCalled();
  }
});
it("validates exact Cloud request fields through the authenticated HTTP adapter", async () => {
  const issuer = "https://synthetic-test.authkit.app";
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("MCP_AUTH_ISSUER", issuer);
  const provider = vi.fn(async () =>
    Response.json({ sub: "synthetic-subject" }),
  );
  vi.stubGlobal("fetch", provider);
  const runMutation = vi.fn(
    async (_operation: unknown, args: Record<string, unknown>) =>
      Object.keys(args).length === 0
        ? { issuer, subject: "synthetic-subject" }
        : { accepted: true },
  );
  const handler = (
    assistantHttpTools as unknown as {
      _handler: (
        ctx: { runMutation: typeof runMutation },
        request: Request,
      ) => Promise<Response>;
    }
  )._handler;
  const ctx = { runMutation };
  const run = (args: unknown) =>
    handler(
      ctx,
      new Request("https://synthetic.example/assistant-tools", {
        method: "POST",
        headers: { authorization: "Bearer synthetic-access-token-0123456789" },
        body: JSON.stringify({ operation: "request_analysis", args }),
      }),
    );
  const accepted = await run(cloudRequest);
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toEqual({ accepted: true });
  expect(runMutation.mock.calls[1][1]).toEqual({
    ...cloudRequest,
    profileId: undefined,
  });
  for (const patch of [
    { revision: -1 },
    { grantVersion: 0 },
    ...[
      { model: "" },
      { model: "x".repeat(101) },
      { effort: "ultra" },
      { useOwnPlan: false },
      { maxApiUsd: 1 },
      { retainUntil: 0 },
      { retainUntil: 1.5 },
      { extra: true },
    ].map((cloud) => ({ cloud: { ...cloudRequest.cloud, ...cloud } })),
    { extra: true },
  ]) {
    runMutation.mockClear();
    provider.mockClear();
    expect((await run({ ...cloudRequest, ...patch })).status).toBe(403);
    expect(runMutation).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  }
});
it("keeps Cloud tools absent by default and challenges old scopes before dispatch", async () => {
  const closed = mcp(false);
  const tools = (await packet(await closed.call("tools/list", {}))).result
    .tools;
  expect(
    tools.some((tool: { name: string }) => tool.name.startsWith("work_cloud_")),
  ).toBe(false);
  const old = mcp(true, ["analysis:request", "knowledge:read"]);
  const response = await old.call("tools/call", {
    name: "work_cloud_claim",
    arguments: {
      sourceId: lease.sourceId,
      generation: lease.generation,
      taskId: lease.taskId,
    },
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("www-authenticate")).toContain(
    "analysis:execute",
  );
  expect(old.invoke).not.toHaveBeenCalled();
});
it("transports a bounded canonical result as a scalar without raising the SDK traversal limit", async () => {
  const host = mcp(true);
  const resultJson = JSON.stringify({
    insights: Array.from({ length: 100 }, (_, n) => ({
      title: `Synthetic ${n}`,
      nested: Array(8).fill("evidence"),
    })),
  });
  const args = { ...lease, resultJson };
  const response = await host.call("tools/call", {
    name: "work_cloud_complete",
    arguments: args,
  });
  expect((await packet(response)).result.structuredContent).toEqual({
    accepted: true,
  });
  expect(host.invoke).toHaveBeenCalledExactlyOnceWith(
    "work_cloud_complete",
    args,
  );
  host.invoke.mockClear();
  await host.call("tools/call", {
    name: "work_cloud_complete",
    arguments: { ...args, output: JSON.parse(resultJson) },
  });
  expect(host.invoke).not.toHaveBeenCalled();
});
it("rejects unknown operation fields, invalid tasks and multibyte results beyond the byte cap", () => {
  expect(
    workCloudLeaseInput.safeParse({ ...lease, maxApiUsd: 1 }).success,
  ).toBe(false);
  expect(
    workCloudLeaseInput.safeParse({
      ...lease,
      taskId: "https://arbitrary-host.example/task",
    }).success,
  ).toBe(false);
  expect(
    workCloudCompleteInput.safeParse({
      ...lease,
      resultJson: "{}",
      reportedEffort: "ultra",
    }).success,
  ).toBe(false);
  expect(() =>
    parseWorkCloudResult(JSON.stringify({ text: "é".repeat(60000) })),
  ).toThrow("byte bound");
  expect(() => parseWorkCloudResult("{")).toThrow();
});
it("preserves the original non-completion raw byte limits, including whitespace and declared lengths", async () => {
  const read = (raw: string, headers?: Record<string, string>) =>
    readAssistantBody(
      new Request("https://synthetic.example", {
        method: "POST",
        body: raw,
        headers,
      }),
      262144,
      (value) => (cloudCompletionEnvelope(value) ? 262144 : 8192),
    );
  await expect(
    read(
      " ".repeat(8192) +
        JSON.stringify({ operation: "work_cloud_input", args: lease }),
    ),
  ).rejects.toThrow("this operation");
  const raw = JSON.stringify({
    operation: "work_cloud_complete",
    args: { ...lease, resultJson: JSON.stringify({ text: '"'.repeat(50000) }) },
  });
  expect(raw.length).toBeGreaterThan(120000);
  expect((await read(raw)).operation).toBe("work_cloud_complete");
  await expect(read(raw, { "content-length": "262145" })).rejects.toThrow(
    "too large",
  );
  expect(
    cloudCompletionEnvelope(
      { method: "tools/call", params: { name: "work_cloud_complete" } },
      true,
    ),
  ).toBe(true);
  expect(
    cloudCompletionEnvelope(
      { method: "tools/list", params: { name: "work_cloud_complete" } },
      true,
    ),
  ).toBe(false);
});

it("exposes preparation only behind the separate media gate and transports its bounded scalar through MCP", async () => {
  const text = mcp(true);
  const oldTools = (await packet(await text.call("tools/list", {}))).result
    .tools;
  expect(
    oldTools.some((t: { name: string }) => t.name === "work_cloud_prepare"),
  ).toBe(false);
  const host = mcp(false, ["analysis:execute"], true);
  const tools = (await packet(await host.call("tools/list", {}))).result.tools;
  expect(
    tools.some((t: { name: string }) => t.name === "work_cloud_prepare"),
  ).toBe(true);
  const args = {
    ...lease,
    preparationJson: JSON.stringify({
      evidence: Array(220).fill({ text: '"'.repeat(30) }),
    }),
  };
  expect(
    (
      await packet(
        await host.call("tools/call", {
          name: "work_cloud_prepare",
          arguments: args,
        }),
      )
    ).result.structuredContent,
  ).toEqual({ accepted: true });
  expect(host.invoke).toHaveBeenCalledExactlyOnceWith(
    "work_cloud_prepare",
    args,
  );
  expect(cloudCompletionEnvelope({ operation: "work_cloud_prepare" })).toBe(
    true,
  );
  expect(
    cloudCompletionEnvelope(
      { method: "tools/call", params: { name: "work_cloud_prepare" } },
      true,
    ),
  ).toBe(true);
  host.invoke.mockClear();
  await host.call("tools/call", {
    name: "work_cloud_prepare",
    arguments: { ...args, providerVerified: true },
  });
  expect(host.invoke).not.toHaveBeenCalled();
});
