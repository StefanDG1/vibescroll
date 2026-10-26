import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createKnowledgeHandler } from "../packages/mcp/server";
const invoke = vi.fn(
  async (
    operation: string,
  ): Promise<{
    ok: boolean;
    status: number;
    value: Record<string, unknown>;
  }> => ({
    ok: true,
    status: 200,
    value:
      operation === "widget_profiles"
        ? { profiles: [], truncated: false, coverage: "No granted workspaces" }
        : { results: [] },
  }),
);
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
async function call(
  method: string,
  params: unknown,
  scopes: string[],
  libraryEditing = false,
) {
  const body = { jsonrpc: "2.0", id: 1, method, params };
  return createKnowledgeHandler(
    invoke,
    false,
    false,
    false,
    true,
    libraryEditing,
  ).fetch(
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
  expect(open._meta.ui.resourceUri).toMatch(
    /^ui:\/\/vibescroll\/workspace\/v1-[a-f0-9]{16}\.html$/,
  );
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

it("advertises widget renderers as model-visible OAuth tools for ChatGPT discovery", async () => {
  const listed = await packet(
    await call("tools/list", {}, ["knowledge:read", "links:save"]),
  );
  const renderers = listed.result.tools.filter(
    (tool: any) => tool._meta?.ui?.resourceUri,
  );
  expect(renderers.map((tool: any) => tool.name)).toContain(
    "open_vibescroll_export",
  );
  for (const tool of renderers) {
    expect(tool._meta.ui.visibility).toContain("model");
    expect(tool._meta.securitySchemes).toContainEqual({
      type: "oauth2",
      scopes: [tool.name === "save_link" ? "links:save" : "knowledge:read"],
    });
  }
});

it("binds every advertised UI cache key to its built HTML", async () => {
  const listed = await packet(
    await call("tools/list", {}, ["knowledge:read", "links:save"]),
  );
  const uris = new Set<string>(
    listed.result.tools.flatMap((tool: any) =>
      tool._meta?.ui?.resourceUri ? [tool._meta.ui.resourceUri] : [],
    ),
  );
  expect(uris.size).toBe(3);
  for (const uri of uris) {
    expect(uri).toMatch(
      /^ui:\/\/vibescroll\/(workspace|card|export)\/v1-[a-f0-9]{16}\.html$/,
    );
    const result = await packet(
      await call("resources/read", { uri }, ["knowledge:read"]),
    );
    const html = result.result.contents[0];
    expect(html.uri).toBe(uri);
    const digest = createHash("sha256")
      .update(html.text)
      .digest("hex")
      .slice(0, 16);
    expect(uri.endsWith(`/v1-${digest}.html`)).toBe(true);
    expect(html._meta.ui.csp.connectDomains).toEqual([]);
  }
});

it("keeps opt-in editing absent by default and requires both scopes when enabled", async () => {
  const disabled = await packet(
    await call("tools/list", {}, ["knowledge:read", "knowledge:write"]),
  );
  expect(
    disabled.result.tools.some((tool: any) =>
      tool.name.startsWith("widget_library_"),
    ),
  ).toBe(false);
  const enabled = await packet(
    await call("tools/list", {}, ["knowledge:read", "knowledge:write"], true),
  );
  const edits = enabled.result.tools.filter((tool: any) =>
    tool.name.startsWith("widget_library_"),
  );
  expect(edits).toHaveLength(3);
  for (const tool of edits) {
    expect(tool._meta.ui.visibility).toEqual(["app"]);
    expect(tool._meta.ui.resourceUri).toBeUndefined();
    expect(tool._meta.securitySchemes).toContainEqual({
      type: "oauth2",
      scopes: ["knowledge:read", "knowledge:write"],
    });
    expect(tool.annotations.readOnlyHint).toBe(
      tool.name !== "widget_library_edit",
    );
  }
  for (const scopes of [["knowledge:read"], ["knowledge:write"]]) {
    invoke.mockClear();
    const denied = await packet(
      await call(
        "tools/call",
        {
          name: "widget_library_state",
          arguments: {
            profileId: "profile",
            grantVersion: 1,
            topicId: "topic",
          },
        },
        scopes,
        true,
      ),
    );
    expect(denied.error ?? denied.result?.isError).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  }
});

it("recovers old v1 cards without accepting another UI contract or missing scope", async () => {
  for (const version of ["v1", "v1-0000000000000000"]) {
    const uri = `ui://vibescroll/card/${version}.html`;
    const result = await packet(
      await call("resources/read", { uri }, ["knowledge:read"]),
    );
    expect(result.result.contents[0].uri).toBe(uri);
    expect(result.result.contents[0].text).toContain('data-entry="card"');
    const denied = await packet(await call("resources/read", { uri }, []));
    expect(denied.result?.contents).toBeUndefined();
    expect(denied.error).toBeDefined();
  }
  const unsupported = await packet(
    await call("resources/read", { uri: "ui://vibescroll/card/v2.html" }, [
      "knowledge:read",
    ]),
  );
  expect(unsupported.result?.contents).toBeUndefined();
  expect(unsupported.error).toBeDefined();
});

it("renders ordinary fetched results as inline cards without changing headless content or polling tools", async () => {
  const listed = await packet(
    await call("tools/list", {}, ["knowledge:read", "links:save"]),
  );
  for (const name of ["fetch", "save_link"])
    expect(
      listed.result.tools.find((tool: { name: string }) => tool.name === name)
        ._meta.ui.resourceUri,
    ).toMatch(/^ui:\/\/vibescroll\/card\/v1-[a-f0-9]{16}\.html$/);
  expect(
    listed.result.tools.find(
      (tool: { name: string }) => tool.name === "get_job_status",
    )._meta.ui,
  ).toBeUndefined();
  const value = {
    id: "source-id~2",
    profile_id: "profile",
    title: "Current result",
    text: '{"insights":[]}',
    url: "https://scroll.companynerve.com/app/profile/library/source-id",
  };
  invoke.mockResolvedValueOnce({ ok: true, status: 200, value });
  const fetched = await packet(
    await call(
      "tools/call",
      { name: "fetch", arguments: { id: "source-id~2", profileId: "profile" } },
      ["knowledge:read"],
    ),
  );
  expect(fetched.result.structuredContent).toEqual(value);
  expect(fetched.result._meta["vibescroll/widget"].route).toEqual({
    view: "insight",
    profileId: "profile",
    sourceId: "source-id~2",
  });
});
