import { expect, it, vi } from "vitest";
import { createKnowledgeHandler } from "../packages/mcp/server";
import { assistantResponseLimit } from "../packages/contracts/work-cloud-text";
import { readAssistantBody } from "../packages/policy/assistant-http";

it("returns a large retained JPEG as actual MCP 2 image content, with no base64 in text", async () => {
  const data = Buffer.alloc(90000, 1).toString("base64");
  const invoke = vi.fn(async () => ({
    ok: true,
    status: 200,
    value: {
      mimeType: "image/jpeg",
      data,
      frameId: "f1",
      timestampMs: 0,
      sha256: "a".repeat(64),
    },
  }));
  const handler = createKnowledgeHandler(invoke, true, false, true);
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "work_cloud_retained_frame",
      arguments: {
        sourceId: "source",
        generation: 1,
        attemptId: "attempt",
        taskId: "task",
        leaseToken: crypto.randomUUID(),
        frameId: "f1",
      },
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {
          name: "Synthetic",
          version: "1",
        },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };
  const response = await handler.fetch(
    new Request("https://scroll.companynerve.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-method": "tools/call",
        "mcp-name": "work_cloud_retained_frame",
        "mcp-protocol-version": "2026-07-28",
      },
      body: JSON.stringify(body),
    }),
    {
      parsedBody: body,
      authInfo: {
        token: "synthetic-token",
        clientId: "synthetic-client",
        scopes: ["analysis:execute"],
        resource: new URL("https://scroll.companynerve.com/mcp"),
        resourceMetadataUrl:
          "https://scroll.companynerve.com/.well-known/oauth-protected-resource/mcp",
      },
    },
  );
  const value = await response.json();
  expect(value.result.content).toEqual([
    {
      type: "text",
      text: JSON.stringify({
        mimeType: "image/jpeg",
        frameId: "f1",
        timestampMs: 0,
        sha256: "a".repeat(64),
      }),
    },
    { type: "image", mimeType: "image/jpeg", data },
  ]);
  expect(value.result.structuredContent).toBeUndefined();
});
it.each(["work_cloud_retained_frame", "analysis_version"])(
  "transports bounded large %s responses while rejecting over-bound bodies",
  async (operation) => {
    const value = { data: "x".repeat(200000) };
    expect(
      await readAssistantBody(
        Response.json(value),
        assistantResponseLimit(operation),
      ),
    ).toEqual(value);
    await expect(
      readAssistantBody(
        Response.json({ data: "x".repeat(262144) }),
        assistantResponseLimit(operation),
      ),
    ).rejects.toThrow(/too large/);
    await expect(
      readAssistantBody(Response.json(value), assistantResponseLimit("search")),
    ).rejects.toThrow(/too large/);
  },
);
