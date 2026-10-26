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
  return createKnowledgeHandler(invoke, false, false, false, true).fetch(
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

it("registers self-contained widget resources and read-only entrypoints without widening writes", async () => {
  const response = await call("tools/list", {}, ["knowledge:read"]);
  const result = await packet(response);
  const open = result.result.tools.find(
    (tool: { name: string }) => tool.name === "open_vibescroll",
  );
  expect(open.annotations.readOnlyHint).toBe(true);
  expect(open._meta.ui.resourceUri).toBe("ui://vibescroll/workspace/v1.html");
  expect(open.inputSchema.required ?? []).toEqual([]);
  const resources = await packet(
    await call("resources/list", {}, ["knowledge:read"]),
  );
  expect(resources.result.resources).toHaveLength(3);
  const html = await packet(
    await call("resources/read", { uri: "ui://vibescroll/card/v1.html" }, [
      "knowledge:read",
    ]),
  );
  expect(html.result.contents[0].text).toContain('data-entry="card"');
  expect(html.result.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
  expect(html.result.contents[0].text).not.toContain("demo-private-workspace");
});
it("opens an empty-argument workspace through profile discovery and reauthorizes every citation read", async () => {
  invoke.mockClear();
  await call("tools/call", { name: "open_vibescroll", arguments: {} }, [
    "knowledge:read",
  ]);
  expect(invoke).toHaveBeenCalledWith("widget_profiles", {});
  invoke.mockClear();
  await call(
    "resources/read",
    { uri: "vibescroll://profile/example/source/source-id~2" },
    ["knowledge:read"],
  );
  expect(invoke).toHaveBeenCalledWith("fetch", {
    profileId: "example",
    id: "source-id~2",
  });
  invoke.mockClear();
  await call(
    "resources/read",
    { uri: "vibescroll://profile/example/source/source-id" },
    [],
  );
  expect(invoke).not.toHaveBeenCalled();
});
