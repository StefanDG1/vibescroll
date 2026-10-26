import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { libraryEditReceipt } from "../packages/widget/library-edits";

const modules = import.meta.glob("../convex/**/*.ts");
const issuer = "https://synthetic-library.authkit.app";
const subject = "user_01234567890123456789012345";
const clientId = "client_01234567890123456789012345";
const scopes = ["knowledge:read", "knowledge:write"];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("MCP_WIDGET_LIBRARY_EDITING_ENABLED", "true");
  vi.stubEnv("MCP_AUTH_ISSUER", issuer);
  vi.stubEnv("DISABLE_KNOWLEDGE", "true");
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      { id: clientId, name: "Synthetic library client", scopes },
    ]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "library@example.test",
    name: "Synthetic editor",
  });
  const owner = t.withIdentity({
    subject,
    issuer: "https://api.workos.com",
    auth_time: Math.floor(Date.now() / 1000),
  });
  const identity = {
    subject,
    issuer,
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  };
  const assistant = t.withIdentity(identity);
  const profileId = await owner.mutation(api.organizations.createPrivate, {});
  await owner.mutation(api.assistantGrants.save, {
    organizationId: profileId,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes,
    expectedVersion: 0,
    expiresAt: null,
    acknowledged: true,
  });
  const rows = await t.run(async (ctx) => {
    const actor = (await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique())!;
    const grant = (await ctx.db
      .query("assistantGrants")
      .withIndex("by_org", (q) => q.eq("organizationId", profileId))
      .unique())!;
    const membership = (await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", profileId).eq("userId", actor._id),
      )
      .unique())!;
    const topicId = await ctx.db.insert("knowledgeTopics", {
      organizationId: profileId,
      name: "Original topic",
      aliases: ["Original alias"],
      key: "synthetic",
      searchText: "Original topic Original alias",
      pinned: false,
      version: 1,
      layoutVersion: 0,
      state: "ready",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const parentId = await ctx.db.insert("knowledgeTopics", {
      organizationId: profileId,
      name: "Parent topic",
      key: "synthetic-parent",
      pinned: false,
      version: 1,
      state: "ready",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return {
      actorId: actor._id,
      grantId: grant._id,
      grantVersion: grant.version,
      membershipId: membership._id,
      topicId,
      parentId,
    };
  });
  const args = {
    profileId,
    grantVersion: rows.grantVersion,
    topicId: rows.topicId,
    expectedVersion: 1,
    expectedLayoutVersion: 0,
    key: "synthetic-edit-key",
    explicitlyRequested: true as const,
    change: { kind: "rename" as const, name: "New_topic" },
  };
  const reference = {
    profileId,
    grantVersion: rows.grantVersion,
    topicId: rows.topicId,
  };
  return { t, owner, assistant, identity, profileId, args, reference, ...rows };
}

import {
  filingState,
  filingReceipt,
  verifiedFilingReceipt,
  filingResult,
} from "../packages/widget/evidence-filing";
async function filingSetup() {
  const s = await setup();
  const sourceId = await s.owner.mutation(api.product.capture, {
    organizationId: s.profileId,
    key: "synthetic-filing-source",
    kind: "text",
    title: "Synthetic cited idea",
    text: "Synthetic supplied source",
    rightsAttested: true,
  });
  const rows = await s.t.run(async (ctx) => {
    await ctx.db.patch(sourceId, {
      state: "ready",
      analysis: {
        summary: "Synthetic",
        insights: [
          {
            id: "idea-one",
            title: "A cited idea",
            claim: "A synthetic claim",
            evidence: [],
          },
        ],
      },
    });
    const source = (await ctx.db.get(sourceId))!;
    const reference = {
      sourceId,
      generation: source.generation,
      revision: source.updatedAt,
      insightId: "idea-one",
    };
    const memberId = await ctx.db.insert("knowledgeMembers", {
      organizationId: s.profileId,
      topicId: s.topicId,
      ...reference,
      sourceTitle: source.title,
      excluded: false,
      manual: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(s.topicId, { sourceCount: 1, insightCount: 1 });
    await ctx.db.patch(s.parentId, { sourceCount: 0, insightCount: 0 });
    return { source, reference, memberId };
  });
  const input = {
    profileId: s.profileId,
    grantVersion: s.grantVersion,
    reference: rows.reference,
    key: "synthetic-filing-key",
    explicitlyRequested: true as const,
    origin: {
      topicId: s.topicId,
      memberId: rows.memberId,
      version: 1,
      excluded: false,
    },
    change: {
      kind: "move" as const,
      destination: { topicId: s.parentId, version: 1 },
    },
  };
  return {
    ...s,
    ...rows,
    sourceId,
    input,
    stateInput: {
      profileId: s.profileId,
      grantVersion: s.grantVersion,
      reference: rows.reference,
    },
  };
}
it("moves the exact idea once with current receipts and no processing dispatch", async () => {
  const s = await filingSetup();
  const scheduled = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  const result = await s.assistant.mutation(
    internal.assistantLibrary.fileEvidence,
    s.input,
  );
  expect(verifiedFilingReceipt(result, s.input)).toMatchObject({
    applied: true,
    processing_started: false,
    operation: "move",
    excluded: true,
    origin_version: 2,
    destination: { topic_id: s.parentId, version: 2 },
  });
  expect(
    await s.assistant.mutation(internal.assistantLibrary.fileEvidence, s.input),
  ).toEqual(result);
  expect(
    await s.assistant.query(internal.assistantLibrary.evidenceOutcome, {
      ...s.stateInput,
      key: s.input.key,
    }),
  ).toEqual(result);
  const facts = await s.t.run(async (ctx) => ({
    origin: await ctx.db.get(s.memberId),
    topic: await ctx.db.get(s.topicId),
    destination: await ctx.db.get(s.parentId),
    members: await ctx.db
      .query("knowledgeMembers")
      .withIndex("by_source", (q) => q.eq("sourceId", s.sourceId))
      .collect(),
    source: await ctx.db.get(s.sourceId),
    receipts: await ctx.db.query("assistantLibraryCommands").collect(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(facts.origin).toMatchObject({ excluded: true, manual: true });
  expect(facts.topic).toMatchObject({
    version: 2,
    sourceCount: 0,
    insightCount: 0,
  });
  expect(facts.destination).toMatchObject({
    version: 2,
    sourceCount: 1,
    insightCount: 1,
  });
  expect(facts.members).toHaveLength(2);
  expect(facts.receipts).toHaveLength(1);
  expect(facts.source).toEqual(s.source);
  expect(facts.jobs).toEqual(scheduled);
});
it("removes and restores a filing without deleting or reanalyzing the source", async () => {
  const s = await filingSetup();
  const first = await s.assistant.mutation(
    internal.assistantLibrary.fileEvidence,
    { ...s.input, change: { kind: "exclude" } },
  );
  expect(filingReceipt.parse(first)).toMatchObject({
    excluded: true,
    destination: null,
    origin_version: 2,
  });
  const state = filingState.parse(
    await s.assistant.query(
      internal.assistantLibrary.evidenceState,
      s.stateInput,
    ),
  );
  expect(state.items).toMatchObject([
    { member_id: s.memberId, excluded: true, version: 2 },
  ]);
  const restored = await s.assistant.mutation(
    internal.assistantLibrary.fileEvidence,
    {
      ...s.input,
      key: "restore-filing-key",
      origin: { ...s.input.origin, excluded: true, version: 2 },
      change: { kind: "restore" },
    },
  );
  expect(restored).toMatchObject({
    excluded: false,
    origin_version: 3,
    destination: null,
  });
  expect(await s.t.run((ctx) => ctx.db.get(s.topicId))).toMatchObject({
    sourceCount: 1,
    insightCount: 1,
  });
});
it.each([false, true])(
  "reuses an existing destination filing, previously removed=%s",
  async (excluded) => {
    const s = await filingSetup();
    const destinationMember = await s.t.run(async (ctx) => {
      await ctx.db.patch(s.parentId, {
        sourceCount: Number(!excluded),
        insightCount: Number(!excluded),
      });
      return ctx.db.insert("knowledgeMembers", {
        organizationId: s.profileId,
        topicId: s.parentId,
        ...s.reference,
        excluded,
        manual: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const result = await s.assistant.mutation(
      internal.assistantLibrary.fileEvidence,
      s.input,
    );
    expect(result.destination?.member_id).toBe(destinationMember);
    expect(await s.t.run((ctx) => ctx.db.get(s.parentId))).toMatchObject({
      sourceCount: 1,
      insightCount: 1,
    });
    expect(await s.t.run((ctx) => ctx.db.get(destinationMember))).toMatchObject(
      { excluded: false, manual: true },
    );
    expect(
      await s.t.run((ctx) => ctx.db.query("knowledgeMembers").collect()),
    ).toHaveLength(2);
  },
);
it.each([
  "flag",
  "viewer",
  "revoked",
  "grant-version",
  "selected",
  "source-revision",
  "source-generation",
  "rights",
  "retention",
  "source-deleted",
  "retained-member",
  "origin-deleted",
  "destination-version",
  "origin-version",
  "origin-excluded",
  "wrong-idea",
  "destination-origin",
])("denies %s before changing any filing", async (failure) => {
  const s = await filingSetup();
  let input = s.input;
  if (failure === "flag")
    vi.stubEnv("MCP_WIDGET_LIBRARY_EDITING_ENABLED", "false");
  if (failure === "viewer")
    await s.t.run((ctx) => ctx.db.patch(s.membershipId, { role: "viewer" }));
  if (failure === "revoked")
    await s.t.run((ctx) => ctx.db.patch(s.grantId, { state: "revoked" }));
  if (failure === "grant-version") input = { ...input, grantVersion: 99 };
  if (failure === "selected")
    await s.t.run((ctx) =>
      ctx.db.patch(s.grantId, {
        libraryScope: undefined,
        sources: [
          {
            sourceId: s.sourceId,
            generation: s.reference.generation,
            revision: s.reference.revision,
          },
        ],
      }),
    );
  if (failure === "source-revision")
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, { updatedAt: s.source.updatedAt + 1 }),
    );
  if (failure === "source-generation")
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, { generation: s.source.generation + 1 }),
    );
  if (failure === "rights")
    await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  if (failure === "retention")
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, { sourceRetentionUntil: Date.now() - 1 }),
    );
  if (failure === "source-deleted")
    await s.t.run((ctx) => ctx.db.patch(s.sourceId, { state: "deleted" }));
  if (failure === "retained-member")
    await s.t.run((ctx) => ctx.db.patch(s.memberId, { retainedHistory: true }));
  if (failure === "origin-deleted")
    await s.t.run((ctx) => ctx.db.patch(s.topicId, { state: "deleted" }));
  if (failure === "destination-version")
    input = {
      ...input,
      change: {
        kind: "move",
        destination: { topicId: s.parentId, version: 99 },
      },
    };
  if (failure === "origin-version")
    input = { ...input, origin: { ...input.origin, version: 99 } };
  if (failure === "origin-excluded")
    input = { ...input, origin: { ...input.origin, excluded: true } };
  if (failure === "wrong-idea")
    input = {
      ...input,
      reference: { ...input.reference, insightId: "another-idea" },
    };
  if (failure === "destination-origin")
    input = {
      ...input,
      change: { kind: "move", destination: { topicId: s.topicId, version: 1 } },
    };
  const before = await s.t.run((ctx) =>
    ctx.db.query("knowledgeMembers").collect(),
  );
  await expect(
    s.assistant.mutation(internal.assistantLibrary.fileEvidence, input),
  ).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.query("knowledgeMembers").collect()),
  ).toEqual(before);
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantLibraryCommands").collect()),
  ).toHaveLength(0);
});
it("denies mismatched request reuse and lost access to a retained receipt", async () => {
  const s = await filingSetup();
  await s.assistant.mutation(internal.assistantLibrary.fileEvidence, s.input);
  await expect(
    s.assistant.mutation(internal.assistantLibrary.fileEvidence, {
      ...s.input,
      change: { kind: "exclude" },
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  await expect(
    s.assistant.query(internal.assistantLibrary.evidenceOutcome, {
      ...s.stateInput,
      key: s.input.key,
    }),
  ).rejects.toThrow();
});
it("does not confuse topic metadata and idea filing request keys", async () => {
  const s = await filingSetup();
  const meta = await s.assistant.mutation(internal.assistantLibrary.change, {
    ...s.args,
    key: s.input.key,
  });
  expect(libraryEditReceipt.parse(meta).operation).toBe("rename");
  await expect(
    s.assistant.mutation(internal.assistantLibrary.fileEvidence, s.input),
  ).rejects.toThrow("INVALID_INPUT");
  await expect(
    s.assistant.query(internal.assistantLibrary.evidenceOutcome, {
      ...s.stateInput,
      key: s.input.key,
    }),
  ).rejects.toThrow("INVALID_INPUT");
});
it("pages only exact current reference filings and refuses another reference's cursor", async () => {
  const s = await filingSetup();
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 13; i++) {
      const topicId = await ctx.db.insert("knowledgeTopics", {
        organizationId: s.profileId,
        name: `Other ${i}`,
        key: `other-${i}`,
        pinned: false,
        version: 1,
        state: "ready",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("knowledgeMembers", {
        organizationId: s.profileId,
        topicId,
        ...s.reference,
        excluded: false,
        manual: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  });
  const first = filingState.parse(
    await s.assistant.query(
      internal.assistantLibrary.evidenceState,
      s.stateInput,
    ),
  );
  expect(first.items).toHaveLength(12);
  expect(first.next_cursor).toBeTruthy();
  const second = filingState.parse(
    await s.assistant.query(internal.assistantLibrary.evidenceState, {
      ...s.stateInput,
      cursor: first.next_cursor,
    }),
  );
  expect(second.items).toHaveLength(2);
  expect(second.next_cursor).toBeNull();
  await expect(
    s.assistant.query(internal.assistantLibrary.evidenceState, {
      ...s.stateInput,
      grantVersion: 2,
      cursor: first.next_cursor,
    }),
  ).rejects.toThrow();
});
it("transports real filing writes, recovery and a correlated rejection through HTTP", async () => {
  const s = await filingSetup();
  const provider = vi.fn(async () => Response.json({ sub: subject }));
  vi.stubGlobal("fetch", provider);
  const post = (operation: string, args: unknown) =>
    s.assistant.fetch("/assistant-tools", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-filing-http-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation, args }),
    });
  const state = await post("widget_evidence_state", s.stateInput);
  expect(state.status).toBe(200);
  filingState.parse(await state.json());
  const saved = await post("widget_evidence_edit", s.input);
  expect(saved.status).toBe(200);
  verifiedFilingReceipt(await saved.json(), s.input);
  const found = await post("widget_evidence_receipt", {
    ...s.stateInput,
    key: s.input.key,
  });
  expect(found.status).toBe(200);
  expect((await found.json()).receipt.operation).toBe("move");
  const stale = await post("widget_evidence_edit", {
    ...s.input,
    key: "stale-filing-key",
  });
  expect(stale.status).toBe(409);
  expect(filingResult.parse(await stale.json())).toMatchObject({
    status: "rejected",
    code: "APPROVAL_STALE",
  });
  const calls = provider.mock.calls.length;
  const malformed = await post("widget_evidence_edit", {
    ...s.input,
    credits: 100,
  });
  expect(malformed.status).toBe(403);
  expect(provider.mock.calls).toHaveLength(calls);
});

it("refuses cross-workspace targets and oversized source/topic batches atomically", async () => {
  const s = await filingSetup();
  const foreign = await s.t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      name: "Other synthetic workspace",
      status: "active",
      createdBy: s.actorId,
      createdAt: Date.now(),
    });
    return ctx.db.insert("knowledgeTopics", {
      organizationId,
      name: "Foreign topic",
      key: "foreign-topic",
      pinned: false,
      version: 1,
      state: "ready",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  await expect(
    s.assistant.mutation(internal.assistantLibrary.fileEvidence, {
      ...s.input,
      change: { kind: "move", destination: { topicId: foreign, version: 1 } },
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 256; i++)
      await ctx.db.insert("knowledgeMembers", {
        organizationId: s.profileId,
        topicId: s.topicId,
        ...s.reference,
        insightId: `other-${i}`,
        excluded: false,
        manual: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  await expect(
    s.assistant.mutation(internal.assistantLibrary.fileEvidence, s.input),
  ).rejects.toThrow("INVALID_INPUT");
  expect(await s.t.run((ctx) => ctx.db.get(s.memberId))).toMatchObject({
    excluded: false,
    manual: false,
  });
  expect(await s.t.run((ctx) => ctx.db.get(s.parentId))).toMatchObject({
    version: 1,
    sourceCount: 0,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantLibraryCommands").collect()),
  ).toHaveLength(0);
});
it("correlates every receipt binding and refuses false processing or destination claims", async () => {
  const s = await filingSetup();
  const receipt = await s.assistant.mutation(
    internal.assistantLibrary.fileEvidence,
    s.input,
  );
  for (const bad of [
    {
      ...receipt,
      reference: {
        ...receipt.reference,
        revision: receipt.reference.revision + 1,
      },
    },
    { ...receipt, origin_version: receipt.origin_version + 1 },
    { ...receipt, request_key: "another-request-key" },
    { ...receipt, operation: "restore" },
    { ...receipt, excluded: false },
    { ...receipt, destination: null },
    {
      ...receipt,
      destination: {
        ...receipt.destination!,
        version: receipt.destination!.version + 1,
      },
    },
    { ...receipt, processing_started: true },
  ])
    expect(() => verifiedFilingReceipt(bad, s.input)).toThrow();
});

it("removes source-bound filing receipts through the existing deleted-source cleanup", async () => {
  const s = await filingSetup();
  await s.assistant.mutation(internal.assistantLibrary.fileEvidence, s.input);
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { state: "deleted" }));
  await s.t.mutation(internal.assistant.redactIntakes, {
    sourceId: s.sourceId,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantLibraryCommands").collect()),
  ).toHaveLength(0);
});

it("retains pagination after a first page of old filings filters to empty", async () => {
  const s = await filingSetup();
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.memberId, { retainedHistory: true });
    for (let i = 0; i < 11; i++)
      await ctx.db.insert("knowledgeMembers", {
        organizationId: s.profileId,
        topicId: s.topicId,
        ...s.reference,
        excluded: true,
        retainedHistory: true,
        manual: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    await ctx.db.insert("knowledgeMembers", {
      organizationId: s.profileId,
      topicId: s.parentId,
      ...s.reference,
      excluded: false,
      manual: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  const page = filingState.parse(
    await s.assistant.query(
      internal.assistantLibrary.evidenceState,
      s.stateInput,
    ),
  );
  expect(page.items).toEqual([]);
  expect(page.next_cursor).toBeTruthy();
  const next = filingState.parse(
    await s.assistant.query(internal.assistantLibrary.evidenceState, {
      ...s.stateInput,
      cursor: page.next_cursor,
    }),
  );
  expect(next.items).toMatchObject([{ topic_id: s.parentId, excluded: false }]);
  expect(next.next_cursor).toBeNull();
});
