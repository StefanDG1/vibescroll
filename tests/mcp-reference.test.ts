import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createKnowledgeHandler } from "../packages/mcp/server";
import { format } from "prettier";
import manifest from "../docs/developers/manifest.json";

it("keeps the public input reference equal to real discovery without executing tools", async () => {
  let calls = 0;
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {
          name: "Synthetic documentation client",
          version: "1",
        },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };
  const response = await createKnowledgeHandler(
    async () => {
      calls++;
      throw Error("Documentation must not execute tools");
    },
    true,
    true,
    true,
    true,
  ).fetch(
    new Request("https://example.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/list",
      },
      body: JSON.stringify(body),
    }),
    {
      parsedBody: body,
      authInfo: {
        token: "synthetic-documentation-only",
        clientId: "synthetic-docs-client",
        scopes: [
          "knowledge:read",
          "context:read",
          "jobs:read",
          "links:save",
          "analysis:request",
          "analysis:execute",
          "events:subscribe",
          "suggestions:draft",
          "feedback:write",
        ],
        resource: new URL("https://scroll.companynerve.com/mcp"),
      },
    },
  );
  expect(response.ok).toBe(true);
  const packet = await response.json();
  type Descriptor = {
    name: string;
    description: string;
    inputSchema: object;
    annotations: object;
    _meta?: { securitySchemes?: object[] };
  };
  const tools = (packet.result.tools as Descriptor[])
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      securitySchemes: tool._meta?.securitySchemes ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  expect(calls).toBe(0);
  expect(tools.some((tool) => tool.name === "save_project_proposal")).toBe(
    true,
  );
  expect(tools.some((tool) => tool.name === "work_cloud_retained_frame")).toBe(
    true,
  );
  const text = await format(
    JSON.stringify({ source: "packages/mcp/server.ts", tools }),
    { parser: "json" },
  );
  const path = "docs/developers/mcp-tools.generated.json";
  if (process.env.MCP_REFERENCE_WRITE === "1") writeFileSync(path, text);
  expect(readFileSync(path, "utf8")).toBe(text);
});

it("compiles only allowlisted public Markdown and rejects content drift", async () => {
  const pages: Record<string, string> = {};
  for (const page of manifest.pages) {
    expect(page.file).toMatch(/^[a-z][a-z-]*\.md$/);
    pages[page.file] = readFileSync(
      `docs/developers/${page.file}`,
      "utf8",
    ).replaceAll("\r\n", "\n");
  }
  const text = await format(JSON.stringify(pages), { parser: "json" });
  const path = "docs/developers/content.generated.json";
  if (process.env.MCP_REFERENCE_WRITE === "1") writeFileSync(path, text);
  expect(readFileSync(path, "utf8")).toBe(text);
});
