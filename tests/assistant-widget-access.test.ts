import { afterEach, expect, it, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
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

it("discovers minimal current workspace access without context scope and removes revoked grants", async () => {
  const s = await setup();
  const grant = await s.owner.mutation(api.assistantGrants.save, s.args);
  const result = await s.assistant.query(internal.assistantWidget.profiles, {});
  expect(result.profiles).toHaveLength(1);
  expect(result.profiles[0]).toMatchObject({
    profile_id: s.organizationId,
    projects: [],
    grant_version: 1,
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE transcript");
  const state = await s.assistant.query(internal.assistantWidget.state, {
    profileId: s.organizationId,
  });
  expect(state.actions).toMatchObject({
    context: false,
    save: false,
    cloud: false,
    draft: false,
  });
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: grant.id,
    expectedVersion: grant.version,
  });
  expect(
    (await s.assistant.query(internal.assistantWidget.profiles, {})).profiles,
  ).toEqual([]);
  await expect(
    s.assistant.query(internal.assistantWidget.state, {
      profileId: s.organizationId,
    }),
  ).rejects.toThrow();
});
it("browses only granted current sources without exposing transcripts, topic labels or financial records", async () => {
  const s = await setup();
  await s.owner.mutation(api.assistantGrants.save, s.args);
  await s.owner.mutation(api.product.capture, {
    organizationId: s.organizationId,
    key: "ungranted-widget-record",
    kind: "text",
    title: "Hidden source",
    text: "PRIVATE ungranted",
    rightsAttested: true,
  });
  const result = await s.assistant.query(internal.assistantWidget.browse, {
    profileId: s.organizationId,
    kind: "sources",
  });
  expect(result.items.map((item: { id: string }) => item.id)).toEqual([
    s.sourceId,
  ]);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|Hidden source/);
  const topics = await s.assistant.query(internal.assistantWidget.browse, {
    profileId: s.organizationId,
    kind: "topics",
  });
  expect(topics.items).toEqual([]);
  expect(topics.coverage).toContain("restricted grant");
  const usage = await s.assistant.query(internal.assistantWidget.browse, {
    profileId: s.organizationId,
    kind: "usage",
  });
  expect(usage.items).toEqual([]);
  await expect(
    s.assistant.query(internal.assistantWidget.browse, {
      profileId: s.organizationId,
      kind: "sources",
      offset: 50,
    }),
  ).rejects.toThrow();
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!;
    await ctx.db.patch(s.sourceId, { updatedAt: source.updatedAt + 1 });
  });
  expect(
    (
      await s.assistant.query(internal.assistantWidget.browse, {
        profileId: s.organizationId,
        kind: "sources",
      })
    ).items,
  ).toEqual([]);
});
it("binds full-library pagination to the exact grant version and collection", async () => {
  const s = await setup();
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    libraryScope: "all",
  });
  const first = await s.assistant.query(internal.assistantWidget.browse, {
    profileId: s.organizationId,
    kind: "sources",
  });
  expect(first.items).toHaveLength(1);
  const forged = JSON.stringify({
    grant: grant.id,
    version: 0,
    kind: "sources",
    cursor: "fake",
  });
  await expect(
    s.assistant.query(internal.assistantWidget.browse, {
      profileId: s.organizationId,
      kind: "sources",
      cursor: forged,
    }),
  ).rejects.toThrow("Access changed");
  await expect(
    s.assistant.query(internal.assistantWidget.browse, {
      profileId: s.organizationId,
      kind: "jobs",
    }),
  ).rejects.toThrow();
});
