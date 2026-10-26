import { afterEach, expect, it, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  feedbackState,
  confirmedFeedback,
  feedbackAcknowledgement,
} from "../packages/widget/feedback";
const modules = import.meta.glob("../convex/**/*.ts");
const issuer = "https://synthetic-test.authkit.app";
const clientId = "client_01234567890123456789012345";
const subject = "user_01234567890123456789012345";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup() {
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("MCP_AUTH_ISSUER", issuer);
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      {
        id: clientId,
        name: "Synthetic client",
        scopes: [
          "knowledge:read",
          "context:read",
          "links:save",
          "jobs:read",
          "analysis:request",
          "feedback:write",
          "suggestions:draft",
        ],
      },
    ]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "assistant@example.test",
    name: "Synthetic owner",
  });
  const owner = t.withIdentity({
    subject,
    issuer: "https://api.workos.com",
    auth_time: Math.floor(Date.now() / 1000),
  });
  const assistant = t.withIdentity({
    subject,
    issuer,
    client_id: clientId,
    scope:
      "knowledge:read context:read links:save jobs:read analysis:request feedback:write suggestions:draft",
    sid: "app_consent_01234567890123456789012345",
  });
  const organizationId = await owner.mutation(
    api.organizations.createPrivate,
    {},
  );
  const sourceId = await owner.mutation(api.product.capture, {
    organizationId,
    key: "assistant-synthetic-source",
    kind: "text",
    title: "Synthetic selected evidence",
    text: "PRIVATE transcript must never leave through assistant fetch",
    rightsAttested: true,
  });
  const source = (await t.run((ctx) => ctx.db.get(sourceId)))!;
  const args = {
    organizationId,
    clientId,
    sources: [
      { sourceId, generation: source.generation, revision: source.updatedAt },
    ],
    scopes: ["knowledge:read"],
    expectedVersion: 0,
    expiresAt: Date.now() + 86400000,
    acknowledged: true as const,
  };
  return { t, owner, assistant, organizationId, sourceId, args };
}

async function feedbackSetup() {
  const s = await setup();
  const savedGrant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    libraryScope: "all",
    scopes: ["knowledge:read", "feedback:write"],
  });
  const grantId = savedGrant.id;
  const rows = await s.t.run(async (ctx) => {
    const grant = (await ctx.db.get(grantId))!;
    const membership = (await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", s.organizationId).eq("userId", grant.actor),
      )
      .unique())!;
    return { grantId, actor: grant.actor, membershipId: membership._id };
  });
  const stateInput = {
    profileId: s.organizationId,
    sourceId: s.sourceId,
    generation: s.args.sources[0].generation,
    revision: s.args.sources[0].revision,
    grantVersion: 1,
  };
  const input = {
    ...stateInput,
    key: "synthetic-feedback-read-key",
    expectedVersion: 0,
    explicitlyRequested: true as const,
    action: "useful" as const,
    note: "My private judgment",
  };
  return { ...s, ...rows, stateInput, input };
}
it("reads the current own-client judgment and corrects it after reopening", async () => {
  const s = await feedbackSetup();
  const before = feedbackState.parse(
    await s.assistant.query(
      internal.assistantWidget.feedbackState,
      s.stateInput,
    ),
  );
  expect(before.feedback).toBeNull();
  expect(before.lookup_complete).toBe(true);
  const saved = await s.assistant.mutation(
    internal.assistant.recordFeedback,
    s.input,
  );
  const current = feedbackState.parse(
    await s.assistant.query(
      internal.assistantWidget.feedbackState,
      s.stateInput,
    ),
  );
  expect(confirmedFeedback(current, s.input, saved)).toBe(true);
  expect(current.feedback).toMatchObject({
    key: s.input.key,
    version: 1,
    action: "useful",
    note: "My private judgment",
  });
  const corrected = {
    ...s.input,
    key: current.feedback!.key,
    expectedVersion: current.feedback!.version,
    action: "later" as const,
    note: "An explicit correction",
  };
  const ack = await s.assistant.mutation(
    internal.assistant.recordFeedback,
    corrected,
  );
  const reopened = feedbackState.parse(
    await s.assistant.query(
      internal.assistantWidget.feedbackState,
      s.stateInput,
    ),
  );
  expect(confirmedFeedback(reopened, corrected, ack)).toBe(true);
  expect(reopened.feedback).toMatchObject({
    version: 2,
    action: "later",
    note: corrected.note,
  });
  expect(JSON.stringify(reopened)).not.toContain("assistantInputHash");
});
it("reconciles the same key without another feedback record or changing the source", async () => {
  const s = await feedbackSetup();
  const before = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  const first = await s.assistant.mutation(
    internal.assistant.recordFeedback,
    s.input,
  );
  const recovered = feedbackState.parse(
    await s.assistant.query(internal.assistantWidget.feedbackState, {
      ...s.stateInput,
      key: s.input.key,
    }),
  );
  expect(confirmedFeedback(recovered, s.input)).toBe(true);
  const replay = await s.assistant.mutation(
    internal.assistant.recordFeedback,
    s.input,
  );
  expect(feedbackAcknowledgement.parse(replay)).toEqual(
    feedbackAcknowledgement.parse(first),
  );
  expect(
    await s.t.run((ctx) => ctx.db.query("feedback").collect()),
  ).toHaveLength(1);
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(before);
});
it.each([
  "revoked",
  "viewer",
  "grant-version",
  "generation",
  "revision",
  "rights",
  "retention",
])("denies %s without returning a private note", async (failure) => {
  const s = await feedbackSetup();
  await s.assistant.mutation(internal.assistant.recordFeedback, s.input);
  let input = s.stateInput;
  if (failure === "revoked")
    await s.t.run((ctx) => ctx.db.patch(s.grantId, { state: "revoked" }));
  if (failure === "viewer")
    await s.t.run((ctx) => ctx.db.patch(s.membershipId, { role: "viewer" }));
  if (failure === "grant-version") input = { ...input, grantVersion: 99 };
  if (failure === "generation")
    input = { ...input, generation: input.generation + 1 };
  if (failure === "revision")
    input = { ...input, revision: input.revision + 1 };
  if (failure === "rights")
    await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  if (failure === "retention")
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, { sourceRetentionUntil: Date.now() - 1 }),
    );
  await expect(
    s.assistant.query(internal.assistantWidget.feedbackState, input),
  ).rejects.toThrow();
});
it.each(["knowledge:read", "feedback:write"])(
  "requires both scopes, not only %s",
  async (scope) => {
    const s = await feedbackSetup();
    const partial = s.t.withIdentity({
      subject,
      issuer,
      client_id: clientId,
      scope,
      sid: "app_consent_01234567890123456789012345",
    });
    await expect(
      partial.query(internal.assistantWidget.feedbackState, s.stateInput),
    ).rejects.toThrow("FORBIDDEN");
  },
);
it("does not reveal a different actor's judgment even in the same shared workspace", async () => {
  const s = await feedbackSetup();
  await s.assistant.mutation(internal.assistant.recordFeedback, s.input);
  const other = "user_98765432109876543210987654";
  await s.t.mutation(internal.accounts.syncUser, {
    subject: other,
    email: "other@example.test",
    name: "Other synthetic member",
  });
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.organizationId, { privateOwnerId: undefined });
    const actor = (await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", other))
      .unique())!;
    await ctx.db.insert("memberships", {
      organizationId: s.organizationId,
      userId: actor._id,
      role: "member",
    });
  });
  const owner = s.t.withIdentity({
    subject: other,
    issuer: "https://api.workos.com",
    auth_time: Math.floor(Date.now() / 1000),
  });
  const otherGrant = await owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    libraryScope: "all",
    scopes: ["knowledge:read", "feedback:write"],
  });
  const assistant = s.t.withIdentity({
    subject: other,
    issuer,
    client_id: clientId,
    scope: "knowledge:read feedback:write",
    sid: "app_consent_98765432109876543210987654",
  });
  const result = feedbackState.parse(
    await assistant.query(internal.assistantWidget.feedbackState, s.stateInput),
  );
  expect(result.authority_id).toBe(otherGrant.id);
  expect(result.authority_id).not.toBe(s.grantId);
  expect(result.feedback).toBeNull();
  expect(JSON.stringify(result)).not.toContain(s.input.note);
});
it("reports a bounded lookup honestly when only other clients' records are in the batch", async () => {
  const s = await feedbackSetup();
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 51; i++)
      await ctx.db.insert("feedback", {
        organizationId: s.organizationId,
        actor: s.actor,
        target: s.sourceId,
        action: "later",
        note: "Another client's private note",
        benefit: "not_measured",
        assistantClientId: "client_98765432109876543210987654",
        assistantKey: `other-client-key-${i}`,
        assistantVersion: 1,
        assistantGrantVersion: 1,
        sourceGeneration: s.stateInput.generation,
        sourceRevision: s.stateInput.revision,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  const result = feedbackState.parse(
    await s.assistant.query(
      internal.assistantWidget.feedbackState,
      s.stateInput,
    ),
  );
  expect(result.lookup_complete).toBe(false);
  expect(result.feedback).toBeNull();
  expect(JSON.stringify(result)).not.toContain("private note");
});
it("does not use a judgment key to read another source", async () => {
  const s = await feedbackSetup();
  const sourceId = await s.owner.mutation(api.product.capture, {
    organizationId: s.organizationId,
    key: "other-feedback-source",
    kind: "text",
    title: "Other source",
    text: "Synthetic",
    rightsAttested: true,
  });
  const source = (await s.t.run((ctx) => ctx.db.get(sourceId)))!;
  await s.assistant.mutation(internal.assistant.recordFeedback, {
    ...s.input,
    sourceId,
    generation: source.generation,
    revision: source.updatedAt,
  });
  await expect(
    s.assistant.query(internal.assistantWidget.feedbackState, {
      ...s.stateInput,
      key: s.input.key,
    }),
  ).rejects.toThrow("INVALID_INPUT");
});
it("transports the exact current judgment and its existing mutation through real HTTP", async () => {
  const s = await feedbackSetup();
  const provider = vi.fn(async () => Response.json({ sub: subject }));
  vi.stubGlobal("fetch", provider);
  const post = (operation: string, args: unknown) =>
    s.assistant.fetch("/assistant-tools", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-feedback-http-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation, args }),
    });
  const saved = await post("record_feedback", s.input);
  expect(saved.status).toBe(200);
  const ack = await saved.json();
  const read = await post("widget_feedback_state", {
    ...s.stateInput,
    key: s.input.key,
  });
  expect(read.status).toBe(200);
  expect(
    confirmedFeedback(feedbackState.parse(await read.json()), s.input, ack),
  ).toBe(true);
  const calls = provider.mock.calls.length;
  const malformed = await post("widget_feedback_state", {
    ...s.stateInput,
    key: "invalid key!",
  });
  expect(malformed.status).toBe(403);
  expect(provider.mock.calls).toHaveLength(calls);
});
it("does not confirm another action, note, request key, version or acknowledgement", async () => {
  const s = await feedbackSetup();
  const ack = await s.assistant.mutation(
    internal.assistant.recordFeedback,
    s.input,
  );
  const state = feedbackState.parse(
    await s.assistant.query(
      internal.assistantWidget.feedbackState,
      s.stateInput,
    ),
  );
  for (const feedback of [
    { ...state.feedback!, action: "later" as const },
    { ...state.feedback!, note: "Different note" },
    { ...state.feedback!, key: "different-request-key" },
    { ...state.feedback!, version: 4 },
    { ...state.feedback!, grant_version: 9 },
  ])
    expect(confirmedFeedback({ ...state, feedback }, s.input)).toBe(false);
  expect(
    confirmedFeedback(state, s.input, { ...ack, feedback_id: "other-id" }),
  ).toBe(false);
  expect(() =>
    confirmedFeedback({ ...state, revision: state.revision + 1 }, s.input),
  ).toThrow();
});

it("keeps selected-source grants usable without whole-library edit authority", async () => {
  const s = await feedbackSetup();
  await s.assistant.mutation(internal.assistant.recordFeedback, s.input);
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    scopes: ["knowledge:read", "feedback:write"],
    expectedVersion: 1,
  });
  const result = feedbackState.parse(
    await s.assistant.query(internal.assistantWidget.feedbackState, {
      ...s.stateInput,
      grantVersion: 2,
    }),
  );
  expect(result.feedback).toMatchObject({
    note: s.input.note,
    grant_version: 1,
  });
  expect(result.grant_version).toBe(2);
});

it("reuses a server-derived first-judgment key across reopened widgets", async () => {
  const s = await feedbackSetup();
  const first = feedbackState.parse(
    await s.assistant.query(
      internal.assistantWidget.feedbackState,
      s.stateInput,
    ),
  );
  const reopened = feedbackState.parse(
    await s.assistant.query(
      internal.assistantWidget.feedbackState,
      s.stateInput,
    ),
  );
  expect(first.request_key).toBe(reopened.request_key);
  const input = { ...s.input, key: first.request_key };
  await s.assistant.mutation(internal.assistant.recordFeedback, input);
  await expect(
    s.assistant.mutation(internal.assistant.recordFeedback, {
      ...input,
      action: "later",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(
    await s.t.run((ctx) => ctx.db.query("feedback").collect()),
  ).toHaveLength(1);
});
