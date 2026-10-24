import { expect, it, vi } from "vitest";
import { createKnowledgeHandler } from "../packages/mcp/server";
import { readAssistantBody } from "../packages/policy/assistant-http";
import {
  cloudCompletionEnvelope,
  parseWorkCloudResult,
  workCloudCompleteInput,
  workCloudLeaseInput,
  validateWorkCloudTextOutput,
} from "../packages/contracts/work-cloud-text";

const lease = {
  sourceId: "synthetic-source",
  generation: 2,
  taskId: "actual-host-task",
  leaseToken: crypto.randomUUID(),
};
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
function mcp(enabled: boolean, scopes = ["analysis:execute"]) {
  const invoke = vi.fn(async () => ({
    ok: true,
    status: 200,
    value: { accepted: true },
  }));
  const handler = createKnowledgeHandler(invoke, false, enabled);
  return {
    invoke,
    async call(method: string, params: unknown) {
      const body = { jsonrpc: "2.0", id: 1, method, params };
      return handler.fetch(
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
