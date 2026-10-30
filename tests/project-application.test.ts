import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { api, internal } from "../convex/_generated/api";
import { projectCategoryMatches } from "../packages/contracts/project-application";
import { socialHash } from "../packages/social/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { createKnowledgeHandler } from "../packages/mcp/server";
import { tools as assistantHttpTools } from "../convex/assistantHttp";

const subject = "user_01234567890123456789012345";
const clientId = "client_01234567890123456789012345";
const scopes = [
  "knowledge:read",
  "context:read",
  "analysis:request",
  "analysis:execute",
  "jobs:read",
];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture() {
  const f = await analysisVersionFixture(false);
  const enrolled = await f.owner.mutation(api.analysisVersions.enroll, {
    sourceId: f.sourceId,
  });
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Synthetic application", scopes }]),
  );
  const now = Date.now();
  const projectId = await f.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: f.org,
      installationId: 42,
      providerId: 55,
      fullName: "owned/synthetic",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "A software product with testing and an AI assistant.",
      profileVersion: 1,
      manifest: ["README.md"],
      status: "connected",
      context: "PRIVATE REPOSITORY CODE MUST STAY OUT",
      createdAt: now,
      updatedAt: now,
    }),
  );
  const grant = await f.owner.mutation(api.assistantGrants.save, {
    organizationId: f.org,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes,
    expectedVersion: f.grant.version,
    expiresAt: null,
    acknowledged: true,
    repositories: [
      {
        repositoryId: projectId,
        baseSha: "a".repeat(40),
        profileVersion: 1,
        selectionVersion: 0,
      },
    ],
  });
  const identity = {
    subject,
    issuer: "https://fixture.authkit.app",
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  };
  const assistant = f.t.withIdentity(identity);
  const input = { sourceId: f.sourceId, projectId };
  return {
    ...f,
    assistant,
    identity,
    projectId,
    versionId: enrolled.versionId,
    grant,
    input,
    read: (args = input) =>
      assistant.query(internal.assistant.projectApplicationContext, args),
  };
}

it("combines one exact version and current confirmed project without media, repository code or any write", async () => {
  const f = await fixture();
  const network = vi.fn(() => {
    throw Error("No network may run");
  });
  vi.stubGlobal("fetch", network);
  const before = await f.t.run((ctx) => ctx.db.get(f.sourceId));
  const bundle = await f.read();
  expect(bundle).toMatchObject({
    source: {
      id: f.sourceId,
      analysisVersionId: f.versionId,
      versionNumber: 1,
      selected: true,
      omittedInsights: 0,
    },
    project: {
      id: f.projectId,
      baseSha: "a".repeat(40),
      profileVersion: 1,
      repositoryCodeIncluded: false,
    },
    analysisStarted: false,
    creditsSpent: 0,
    codingAuthorized: false,
    publicationAuthorized: false,
  });
  expect(bundle.source.insights[0].reference).toEqual({
    sourceId: f.sourceId,
    analysisVersionId: f.versionId,
    insightId: f.output.insights[0].id,
  });
  expect(bundle.contextHash).toMatch(/^[a-f0-9]{64}$/);
  expect(await f.read()).toEqual(bundle);
  expect(JSON.stringify(bundle)).not.toContain("PRIVATE REPOSITORY CODE");
  expect(JSON.stringify(bundle)).not.toContain("original-frame");
  expect(network).not.toHaveBeenCalled();
  expect(await f.t.run((ctx) => ctx.db.get(f.sourceId))).toEqual(before);
  expect(
    await f.t.run((ctx) => ctx.db.query("analysisAttempts").collect()),
  ).toHaveLength(0);
  expect(
    await f.t.run((ctx) => ctx.db.query("knowledgeEvaluations").collect()),
  ).toHaveLength(0);
  expect(
    await f.t.run((ctx) => ctx.db.query("issueDrafts").collect()),
  ).toHaveLength(0);
});

it("defaults to the whole post, including insights beyond the former eight-insight limit", async () => {
  const f = await fixture();
  const output = {
    ...f.output,
    insights: Array.from({ length: 20 }, (_, index) => ({
      ...f.output.insights[0],
      id: `whole-post-${index}`,
    })),
  };
  const outputHash = await socialHash(canonicalJson(output));
  await f.t.run((ctx) => ctx.db.patch(f.versionId, { output, outputHash }));
  const context = await f.read();
  expect(context.source.insights.map((item) => item.id)).toEqual(
    output.insights.map((item) => item.id),
  );
  expect(context.source.omittedInsights).toBe(0);
  const explicit = await f.assistant.query(
    internal.assistant.projectApplicationContext,
    { ...f.input, insightIds: output.insights.map((item) => item.id) },
  );
  expect(explicit.contextHash).toBe(context.contextHash);
});

it.each(["knowledge:read", "context:read"])(
  "requires actual OAuth and grant scope %s",
  async (scope) => {
    const f = await fixture();
    const restricted = f.t.withIdentity({
      ...f.identity,
      scope: scopes.filter((s) => s !== scope).join(" "),
    });
    await expect(
      restricted.query(internal.assistant.projectApplicationContext, f.input),
    ).rejects.toThrow("FORBIDDEN");
    await f.t.run((ctx) =>
      ctx.db.patch(f.grant.id, { scopes: scopes.filter((s) => s !== scope) }),
    );
    await expect(f.read()).rejects.toThrow("FORBIDDEN");
  },
);

it.each([
  "repository",
  "sha",
  "profile",
  "grant",
  "source",
  "version",
  "retention",
  "secret",
])("refuses changed, revoked or unsafe %s context", async (change) => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    if (change === "repository")
      await ctx.db.patch(f.projectId, { enabled: false });
    if (change === "sha")
      await ctx.db.patch(f.projectId, { sha: "b".repeat(40) });
    if (change === "profile")
      await ctx.db.patch(f.projectId, { profileVersion: 2 });
    if (change === "grant")
      await ctx.db.patch(f.grant.id, { state: "revoked" });
    if (change === "source")
      await ctx.db.patch(f.sourceId, { rightsAttested: false });
    if (change === "version")
      await ctx.db.patch(f.versionId, { state: "blocked" });
    if (change === "retention")
      await ctx.db.patch(f.sourceId, { sourceRetentionUntil: Date.now() - 1 });
    if (change === "secret")
      await ctx.db.patch(f.projectId, {
        profile: "Synthetic credential: " + "sk-" + "a".repeat(24),
      });
  });
  await expect(f.read()).rejects.toThrow();
});

it("keeps historical references exact after selection changes and rejects unknown or duplicate insight IDs", async () => {
  const f = await fixture();
  const original = await f.read();
  const output = { ...f.output, summary: "New candidate summary" };
  const outputHash = await socialHash(canonicalJson(output));
  const candidateId = await f.t.run(async (ctx) => {
    const old = (await ctx.db.get(f.versionId))!;
    const { _id, _creationTime, ...copy } = old;
    return ctx.db.insert("analysisVersions", {
      ...copy,
      number: 2,
      output,
      outputHash,
    });
  });
  await f.owner.mutation(api.analysisVersions.select, {
    sourceId: f.sourceId,
    versionId: candidateId,
    expectedSelectionRevision: 0,
  });
  const selected = await f.read();
  expect(selected.source.analysisVersionId).toBe(candidateId);
  const historic = await f.assistant.query(
    internal.assistant.projectApplicationContext,
    { ...f.input, analysisVersionId: f.versionId },
  );
  expect(historic.source).toMatchObject({
    analysisVersionId: f.versionId,
    summary: original.source.summary,
    selected: false,
  });
  expect(historic.source.insights).toEqual(original.source.insights);
  for (const insightIds of [
    ["not-in-this-version"],
    [f.output.insights[0].id, f.output.insights[0].id],
  ])
    await expect(
      f.assistant.query(internal.assistant.projectApplicationContext, {
        ...f.input,
        insightIds,
      }),
    ).rejects.toThrow("INVALID_EVIDENCE");
});

it("treats category overlap as a bounded hint and never matches a substring inside another word", () => {
  expect(projectCategoryMatches(["ai"], "An email product")).toEqual([]);
  expect(
    projectCategoryMatches(
      ["ai", "coding", "coding"],
      "An AI assistant for TypeScript testing",
    ),
  ).toEqual([
    { category: "ai", matchedTerms: ["ai", "assistant"] },
    { category: "coding", matchedTerms: ["typescript", "testing"] },
  ]);
});

it("carries both scopes and exact version context through MCP 2.0 and authenticated HTTP", async () => {
  const f = await fixture();
  const provider = vi.fn(async () => Response.json({ sub: subject }));
  vi.stubGlobal("fetch", provider);
  const http = (
    assistantHttpTools as unknown as {
      _handler: (ctx: unknown, request: Request) => Promise<Response>;
    }
  )._handler;
  const invoke = vi.fn(async (operation, args) => {
    const response = await http(
      {
        runMutation: (reference: any, value: any) =>
          f.assistant.mutation(reference, value),
        runQuery: (reference: any, value: any) =>
          f.assistant.query(reference, value),
      },
      new Request("https://synthetic.example/assistant-tools", {
        method: "POST",
        headers: { authorization: "Bearer synthetic-access-token-0123456789" },
        body: JSON.stringify({ operation, args }),
      }),
    );
    return {
      ok: response.ok,
      status: response.status,
      value: await response.json(),
    };
  });
  const mcp = createKnowledgeHandler(invoke, false, false, true);
  const send = async (
    args: Record<string, unknown>,
    grantedScopes = scopes,
  ) => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_project_application_context",
        arguments: args,
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
    const response = await mcp.fetch(
      new Request("https://scroll.companynerve.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": "get_project_application_context",
        },
        body: JSON.stringify(body),
      }),
      {
        parsedBody: body,
        authInfo: {
          token: "synthetic-token",
          clientId,
          scopes: grantedScopes,
          resource: new URL("https://scroll.companynerve.com/mcp"),
          resourceMetadataUrl:
            "https://scroll.companynerve.com/.well-known/oauth-protected-resource/mcp",
        },
      },
    );
    const raw = await response.text();
    return JSON.parse(
      response.headers.get("content-type")?.includes("text/event-stream")
        ? raw
            .split("\n")
            .find((line) => line.startsWith("data: "))!
            .slice(6)
        : raw,
    );
  };
  expect((await send({ ...f.input, runAnalysis: true })).result.isError).toBe(
    true,
  );
  expect(invoke).not.toHaveBeenCalled();
  const denied = await send(f.input, ["context:read"]);
  expect(denied.error).toBeDefined();
  expect(invoke).not.toHaveBeenCalled();
  const result = await send(f.input);
  expect(result.result.structuredContent).toMatchObject({
    source: { analysisVersionId: f.versionId },
    project: { id: f.projectId },
    analysisStarted: false,
    creditsSpent: 0,
  });
  expect(invoke).toHaveBeenCalledOnce();
  expect(provider).toHaveBeenCalledOnce();
});
