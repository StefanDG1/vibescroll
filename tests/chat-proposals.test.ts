import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { api, internal } from "../convex/_generated/api";
import { createKnowledgeHandler } from "../packages/mcp/server";
import { tools as assistantHttpTools } from "../convex/assistantHttp";
const subject = "user_01234567890123456789012345";
const clientId = "client_01234567890123456789012345";
const scopes = [
  "knowledge:read",
  "context:read",
  "suggestions:draft",
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

const body = {
  title: "Review a useful idea for this project",
  disposition: "needs_context" as const,
  currentProblem: "The project profile may benefit from this source idea.",
  proposedChange:
    "Inspect the current implementation before choosing a change.",
  benefitHypothesis:
    "This might improve the workflow, subject to verification.",
  risks: ["The project code has not been inspected."],
  nonGoals: ["No implementation starts here."],
  acceptanceCriteria: ["Verify the source claim against current project code."],
  verificationNeeds: ["Inspect the selected repository revision."],
};
async function prepared() {
  const f = await fixture();
  const context = await f.read();
  const input = {
    ...f.input,
    analysisVersionId: f.versionId,
    insightIds: context.source.insights.map((i: any) => i.id),
    contextHash: context.contextHash,
    expectedVersion: 0,
    key: "create-chat-proposal-one",
    body,
  };
  return {
    ...f,
    context,
    input,
    save: (args = input) =>
      f.assistant.mutation(internal.assistantProposals.save, args),
  };
}

it("saves a profile-level proposal in existing records and reopens it without model calls or evidence copies", async () => {
  const f = await prepared();
  const network = vi.fn(() => {
    throw Error("No model or media request allowed");
  });
  vi.stubGlobal("fetch", network);
  const original = await f.t.run((ctx) => ctx.db.get(f.sourceId));
  const saved = await f.save();
  expect(saved).toMatchObject({
    version: 1,
    replayed: false,
    body,
    codingAuthorized: false,
    publicationAuthorized: false,
    creditsSpent: 0,
    analysisStarted: false,
    repositoryCodeIncluded: false,
  });
  expect(
    await f.assistant.query(internal.assistantProposals.read, {
      proposalId: saved.proposalId,
    }),
  ).toMatchObject({ proposalId: saved.proposalId, version: 1, body });
  const app = await f.owner.query(api.product.proposal, {
    id: saved.proposalId,
  });
  expect(app.title).toBe(body.title);
  expect(saved.reviewUrl).toBe(
    `https://scroll.companynerve.com/app/${f.org}/proposals/${saved.proposalId}`,
  );
  expect(app.detail.repositoryEvidence).toEqual([]);
  expect(app.detail.sourceEvidence.length).toBeGreaterThan(0);
  expect(JSON.stringify(app.detail)).not.toContain(
    "PRIVATE REPOSITORY CODE MUST STAY OUT",
  );
  expect(await f.t.run((ctx) => ctx.db.get(f.sourceId))).toEqual(original);
  expect(network).not.toHaveBeenCalled();
});

it("coalesces duplicate create requests and rejects a reused key with different content", async () => {
  const f = await prepared();
  const [a, b] = await Promise.all([f.save(), f.save()]);
  expect(a.proposalId).toBe(b.proposalId);
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("proposals")
        .withIndex("by_source", (q) => q.eq("sourceId", f.sourceId))
        .take(10),
    ),
  ).toHaveLength(1);
  await expect(
    f.save({ ...f.input, body: { ...body, title: "Different content" } }),
  ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
});

it("rejects stale or foreign context and model-supplied evidence fields before storing a proposal", async () => {
  const f = await prepared();
  await expect(
    f.save({ ...f.input, contextHash: "f".repeat(64) }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  await expect(
    f.save({
      ...f.input,
      body: { ...body, repositoryEvidence: [{ path: "invented.ts" }] },
    } as any),
  ).rejects.toThrow();
  await f.t.run((ctx) =>
    ctx.db.patch(f.sourceId, { updatedAt: Date.now() + 1 }),
  );
  await expect(f.save()).rejects.toThrow(/APPROVAL_STALE/);
  expect(await f.t.run((ctx) => ctx.db.query("proposals").take(2))).toEqual([]);
});

it("accepts one racing edit, preserves the winner and safely replays an acknowledged update", async () => {
  const f = await prepared();
  const first = await f.save();
  const edit = {
    ...f.input,
    proposalId: first.proposalId,
    expectedVersion: 1,
    expectedReview: "unreviewed",
    key: "edit-chat-proposal-one",
    body: { ...body, title: "First revision" },
  };
  const other = {
    ...edit,
    key: "edit-chat-proposal-two",
    body: { ...body, title: "Competing revision" },
  };
  const outcomes = await Promise.allSettled([
    f.assistant.mutation(internal.assistantProposals.save, edit),
    f.assistant.mutation(internal.assistantProposals.save, other),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
  const winner = outcomes[0].status === "fulfilled" ? edit : other;
  const current = await f.assistant.query(internal.assistantProposals.read, {
    proposalId: first.proposalId,
  });
  expect(current).toMatchObject({
    version: 2,
    body: { title: winner.body.title },
  });
  const replay = await f.assistant.mutation(
    internal.assistantProposals.save,
    winner,
  );
  expect(replay).toMatchObject({
    proposalId: first.proposalId,
    version: 2,
    replayed: true,
    appliedVersion: 2,
  });
  expect(await f.save()).toMatchObject({
    proposalId: first.proposalId,
    version: 2,
    replayed: true,
    appliedVersion: 1,
  });
});

it("does not overwrite an intervening reviewer assessment and blocks planning-only execution", async () => {
  const f = await prepared();
  const first = await f.save();
  await f.owner.mutation(api.product.decide, {
    id: first.proposalId,
    version: 1,
    decision: "deferred",
    disposition: "no_fit",
    note: "The current project needs a different approach after review.",
  });
  await expect(
    f.assistant.mutation(internal.assistantProposals.save, {
      ...f.input,
      proposalId: first.proposalId,
      expectedVersion: 1,
      expectedReview: "unreviewed",
      key: "edit-after-manual-review",
      body: { ...body, title: "Stale change" },
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  const row = await f.owner.query(api.product.proposal, {
    id: first.proposalId,
  });
  expect(row.review).toBe("deferred");
  await expect(
    f.owner.mutation(api.product.editPlan, {
      id: first.proposalId,
      version: row.version,
      plan: {},
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
});

it("hides proposals after source deletion or revoked project context", async () => {
  const f = await prepared();
  const first = await f.save();
  await f.t.run((ctx) => ctx.db.patch(f.sourceId, { state: "deleted" }));
  await expect(
    f.assistant.query(internal.assistantProposals.read, {
      proposalId: first.proposalId,
    }),
  ).rejects.toThrow();
  await expect(
    f.owner.query(api.product.proposal, { id: first.proposalId }),
  ).rejects.toThrow(/FORBIDDEN/);
  expect(
    (
      await f.assistant.query(internal.assistantProposals.list, {
        profileId: f.org,
      })
    ).items,
  ).toEqual([]);
});

it("lists metadata only and preserves proposal content after permission revocation", async () => {
  const f = await prepared();
  const first = await f.save();
  const page = await f.assistant.query(internal.assistantProposals.list, {
    profileId: f.org,
  });
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({
    proposalId: first.proposalId,
    title: body.title,
  });
  expect(page.items[0]).not.toHaveProperty("body");
  await f.t.run(async (ctx) => {
    const grant = (await ctx.db.query("assistantGrants").take(2))[0];
    await ctx.db.patch(grant._id, {
      scopes: grant.scopes.filter((scope) => scope !== "context:read"),
    });
  });
  await expect(
    f.assistant.query(internal.assistantProposals.read, {
      proposalId: first.proposalId,
    }),
  ).rejects.toThrow(/FORBIDDEN/);
  expect((await f.t.run((ctx) => ctx.db.get(first.proposalId)))?.title).toBe(
    body.title,
  );
});

it("routes save, read and list through MCP2 and authenticated HTTP while rejecting missing write scope", async () => {
  const f = await prepared();
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
    name: string,
    args: Record<string, unknown>,
    grantedScopes = scopes,
  ) => {
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
          "mcp-name": name,
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

  expect(
    (await send("save_project_proposal", { ...f.input, runAnalysis: true }))
      .result.isError,
  ).toBe(true);
  expect(invoke).not.toHaveBeenCalled();
  expect(
    (
      await send("save_project_proposal", f.input, [
        "knowledge:read",
        "context:read",
      ])
    ).error,
  ).toBeDefined();
  expect(invoke).not.toHaveBeenCalled();
  const saved = (await send("save_project_proposal", f.input)).result
    .structuredContent;
  expect(saved).toMatchObject({
    version: 1,
    body,
    creditsSpent: 0,
    codingAuthorized: false,
  });
  expect(
    (await send("get_project_proposal", { proposalId: saved.proposalId }))
      .result.structuredContent,
  ).toMatchObject({ proposalId: saved.proposalId, version: 1, body });
  expect(
    (await send("list_project_proposals", { profileId: f.org })).result
      .structuredContent.items,
  ).toHaveLength(1);
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(provider).toHaveBeenCalledTimes(3);
  const stale = (
    await send("save_project_proposal", {
      ...f.input,
      proposalId: saved.proposalId,
      expectedVersion: 2,
      expectedReview: "unreviewed",
      key: "http-stale-edit",
    })
  ).result;
  expect(stale.isError).toBe(true);
  expect(JSON.parse(stale.content[0].text)).toMatchObject({
    code: "APPROVAL_STALE",
  });
  expect(stale.content[0].text).not.toContain("Review your Connections");
  const conflict = (
    await send("save_project_proposal", {
      ...f.input,
      body: { ...body, title: "Conflicting create" },
    })
  ).result;
  expect(JSON.parse(conflict.content[0].text)).toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
  const large = (
    await send("save_project_proposal", {
      ...f.input,
      key: "http-large-valid-body",
      body: {
        ...body,
        proposedChange: "x".repeat(4000),
        currentProblem: "x".repeat(2000),
        benefitHypothesis: "x".repeat(1500),
        risks: ["y".repeat(500), "z".repeat(500)],
      },
    })
  ).result;
  expect(large.isError).toBeUndefined();
  expect(large.structuredContent.version).toBe(1);
});

it("rejects embedded asset capabilities and foreign-workspace sources without creating a proposal", async () => {
  const f = await prepared();
  await expect(
    f.save({
      ...f.input,
      body: {
        ...body,
        currentProblem:
          "See https://example.test/file?token=private-capability",
      },
    }),
  ).rejects.toThrow(/POLICY_BLOCKED/);
  const other = await f.t.run(async (ctx) => {
    const row = (await ctx.db.get(f.sourceId))!;
    const { _id, _creationTime, ...source } = row;
    const org = await ctx.db.insert("organizations", {
      name: "Unrelated workspace",
      createdBy: (await ctx.db.query("users").take(1))[0]._id,
      createdAt: Date.now(),
      status: "active",
    });
    return ctx.db.insert("sources", { ...source, organizationId: org });
  });
  await expect(f.save({ ...f.input, sourceId: other })).rejects.toThrow(
    /FORBIDDEN/,
  );
  expect(await f.t.run((ctx) => ctx.db.query("proposals").take(2))).toEqual([]);
});

it("preserves an intervening review even when its numeric version is unchanged, then accepts a reconciled edit", async () => {
  const f = await prepared();
  const first = await f.save();
  const edit = {
    ...f.input,
    proposalId: first.proposalId,
    expectedVersion: 1,
    expectedReview: "unreviewed",
    key: "edit-after-review-decision",
    body: { ...body, title: "Reviewed revision" },
  };
  await f.owner.mutation(api.product.decide, {
    id: first.proposalId,
    version: 1,
    decision: "deferred",
    note: "",
  });
  await expect(
    f.assistant.mutation(internal.assistantProposals.save, edit),
  ).rejects.toThrow(/APPROVAL_STALE/);
  const current = await f.assistant.query(internal.assistantProposals.read, {
    proposalId: first.proposalId,
  });
  expect(current).toMatchObject({ version: 1, review: "deferred" });
  expect(
    await f.assistant.mutation(internal.assistantProposals.save, {
      ...edit,
      expectedReview: current.review,
    }),
  ).toMatchObject({ version: 2, review: "unreviewed" });
});

it("does not recreate a deleted proposal when an update is retried", async () => {
  const f = await prepared();
  const first = await f.save();
  await f.t.run((ctx) => ctx.db.delete(first.proposalId));
  await expect(
    f.assistant.mutation(internal.assistantProposals.save, {
      ...f.input,
      proposalId: first.proposalId,
      expectedVersion: 1,
      expectedReview: "unreviewed",
      key: "edit-deleted-proposal",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
  expect(await f.t.run((ctx) => ctx.db.query("proposals").take(2))).toEqual([]);
});

async function webPrepared() {
  const f = await prepared();
  const args = {
    ...f.input,
    analysisVersionId: f.versionId,
    insightIds: f.context.source.insights.map((i: { id: string }) => i.id),
  };
  const context = await f.owner.query(api.projectPlanning.context, {
    sourceId: args.sourceId,
    projectId: args.projectId,
    analysisVersionId: args.analysisVersionId,
    insightIds: args.insightIds,
  });
  const input = {
    ...args,
    contextHash: context.contextHash,
    key: "web-proposal-create-one",
  };
  return {
    ...f,
    webContext: context,
    webInput: input,
    webSave: () => f.owner.mutation(api.projectPlanning.save, input),
  };
}

it("creates one website draft for duplicate requests and exposes the same exact version to MCP", async () => {
  const f = await webPrepared();
  const [one, two] = await Promise.all([f.webSave(), f.webSave()]);
  expect(one.proposalId).toBe(two.proposalId);
  expect(one).toMatchObject({
    origin: "web_planning",
    creditsSpent: 0,
    analysisStarted: false,
    codingAuthorized: false,
    publicationAuthorized: false,
  });
  expect(JSON.stringify(one)).not.toContain(
    "PRIVATE REPOSITORY CODE MUST STAY OUT",
  );
  const chat = await f.assistant.query(internal.assistantProposals.read, {
    proposalId: one.proposalId,
  });
  expect(chat).toMatchObject({
    proposalId: one.proposalId,
    body,
    version: 1,
    analysisVersionId: f.versionId,
  });
  const edited = await f.assistant.mutation(internal.assistantProposals.save, {
    ...f.input,
    contextHash: chat.contextHash,
    proposalId: one.proposalId,
    expectedVersion: 1,
    expectedReview: "unreviewed",
    key: "chat-refine-web-proposal",
    body: { ...body, title: "Refined in chat" },
  });
  expect(edited.version).toBe(2);
  expect(await f.webSave()).toMatchObject({
    proposalId: one.proposalId,
    version: 2,
    replayed: true,
    body: { title: "Refined in chat" },
  });
  expect(
    (await f.owner.query(api.product.proposal, { id: one.proposalId })).version,
  ).toBe(2);
});

it("lets a normal app session plan without MCP setup, while revoked assistant access stays denied", async () => {
  const f = await webPrepared();
  await f.owner.mutation(api.assistantGrants.revoke, {
    id: f.grant.id,
    expectedVersion: f.grant.version,
  });
  vi.stubEnv("MCP_ENABLED", "false");
  const saved = await f.webSave();
  expect(saved.origin).toBe("web_planning");
  await expect(
    f.assistant.query(internal.assistantProposals.read, {
      proposalId: saved.proposalId,
    }),
  ).rejects.toThrow(/FORBIDDEN/);
});

it("does not accept assistant tokens on normal website endpoints or reuse route-bound context hashes", async () => {
  const f = await webPrepared();
  const args = {
    sourceId: f.sourceId,
    projectId: f.projectId,
    analysisVersionId: f.versionId,
    insightIds: f.webInput.insightIds,
  };
  await expect(
    f.assistant.query(api.projectPlanning.context, args),
  ).rejects.toThrow(/Sign in/);
  await expect(
    f.assistant.mutation(api.projectPlanning.save, f.webInput),
  ).rejects.toThrow(/Sign in/);
  await expect(f.t.query(api.projectPlanning.context, args)).rejects.toThrow(
    /Sign in/,
  );
  await expect(
    f.owner.mutation(api.projectPlanning.save, {
      ...f.webInput,
      contextHash: f.context.contextHash,
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
});

it("rechecks source and confirmed project context before a website draft is saved", async () => {
  const f = await webPrepared();
  await f.t.run((ctx) => ctx.db.patch(f.projectId, { profileVersion: 2 }));
  await expect(f.webSave()).rejects.toThrow(/APPROVAL_STALE/);
  await f.t.run((ctx) => ctx.db.patch(f.projectId, { confirmed: false }));
  await expect(f.webSave()).rejects.toThrow(/APPROVAL_STALE/);
  expect(await f.t.run((ctx) => ctx.db.query("proposals").take(1))).toEqual([]);
});

it("allows a viewer to read authorized planning context but never to create a proposal", async () => {
  const f = await webPrepared();
  await f.t.run(async (ctx) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("organizationId", f.org))
      .first();
    if (!membership) throw Error("Missing fixture membership");
    await ctx.db.patch(membership._id, { role: "viewer" });
  });
  const input = f.webInput;
  expect(
    (
      await f.owner.query(api.projectPlanning.context, {
        sourceId: input.sourceId,
        projectId: input.projectId,
        analysisVersionId: input.analysisVersionId,
        insightIds: input.insightIds,
      })
    ).source.id,
  ).toBe(f.sourceId);
  await expect(f.webSave()).rejects.toThrow(/permission/);
  expect(await f.t.run((ctx) => ctx.db.query("proposals").take(1))).toEqual([]);
});
