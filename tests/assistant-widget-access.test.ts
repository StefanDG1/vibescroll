import { afterEach, expect, it, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { widgetOutputs } from "../packages/widget/outputs";
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

it.each(["Saved video", "My saved source"])(
  "uses the same safe preview title in widget source/job cards and fetch: %s",
  async (title) => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, {
        title,
        state: "queued",
        linkPreview: {
          state: "ready",
          title: "Synthetic extracted title",
          updatedAt: Date.now(),
        },
      }),
    );
    const before = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    await s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      scopes: ["knowledge:read", "jobs:read"],
    });
    const expectedTitle =
      title === "Saved video" ? "Synthetic extracted title" : title;
    const fetched = await s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: s.sourceId,
    });
    expect(fetched.title).toBe(expectedTitle);
    for (const kind of ["sources", "jobs"] as const) {
      const result = await s.assistant.query(internal.assistantWidget.browse, {
        profileId: s.organizationId,
        kind,
      });
      expect(result.items[0]).toMatchObject({ title: expectedTitle });
      expect(JSON.stringify(result)).not.toContain("PRIVATE transcript");
    }
    const after = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    expect(after.title).toBe(before.title);
    expect(after.updatedAt).toBe(before.updatedAt);
  },
);

it("discovers minimal current workspace access without context scope and removes revoked grants", async () => {
  const s = await setup();
  const grant = await s.owner.mutation(api.assistantGrants.save, s.args);
  const result = await s.assistant.query(internal.assistantWidget.profiles, {});
  expect(widgetOutputs.widget_profiles.parse(result)).toEqual(result);
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
  expect(widgetOutputs.widget_state.parse(state)).toEqual(state);
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
  expect(widgetOutputs.widget_browse.parse(result)).toEqual(result);
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

it("returns only the caller's private saved processing route and requires jobs scope even on an empty page", async () => {
  const s = await setup();
  await s.owner.mutation(api.assistantGrants.save, s.args);
  const setupId = await s.t.run(async (ctx) => {
    const organization = (await ctx.db.get(s.organizationId))!;
    return ctx.db.insert("librarySetup", {
      organizationId: s.organizationId,
      actor: organization.privateOwnerId!,
      version: 1,
      focus: ["personal"],
      goal: "Use evidence",
      interests: [],
      role: "Owner",
      connectSpaces: false,
      confirmed: true,
      stage: 2,
      provenance: "user",
      processingRoute: "local",
      updatedAt: Date.now(),
    });
  });
  expect(
    (
      await s.assistant.query(internal.assistantWidget.state, {
        profileId: s.organizationId,
      })
    ).processing_route,
  ).toBe("local");
  await s.t.mutation(internal.accounts.syncUser, {
    subject: "user_other_widget",
    name: "Other",
    email: "other-widget@example.test",
  });
  await s.t.run(async (ctx) => {
    const other = (await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", "user_other_widget"))
      .unique())!;
    await ctx.db.patch(setupId, { actor: other._id });
  });
  expect(
    (
      await s.assistant.query(internal.assistantWidget.state, {
        profileId: s.organizationId,
      })
    ).processing_route,
  ).toBeNull();
  await expect(
    s.assistant.query(internal.assistantWidget.browse, {
      profileId: s.organizationId,
      kind: "jobs",
      offset: 49,
    }),
  ).rejects.toThrow();
});

it("bootstraps a knowledge-only widget using explicit selection, the saved default, then its personal workspace", async () => {
  const s = await setup();
  await s.owner.mutation(api.assistantGrants.save, s.args);
  const team = await s.owner.mutation(api.organizations.create, {
    name: "Joined workspace",
  });
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    organizationId: team,
    sources: [],
    libraryScope: "all",
  });
  const actor = (await s.t.run((ctx) => ctx.db.get(s.organizationId)))!
    .privateOwnerId!;
  await s.t.run((ctx) => ctx.db.patch(actor, { defaultWorkspaceId: team }));
  const knowledge = s.t.withIdentity({
    subject,
    issuer,
    client_id: clientId,
    scope: "knowledge:read",
    sid: "app_consent_01234567890123456789012345",
  });
  const implicit = await knowledge.query(internal.assistantWidget.profiles, {});
  expect(widgetOutputs.widget_profiles.parse(implicit)).toEqual(implicit);
  expect(implicit).toMatchObject({
    selected_profile_id: team,
    selection_reason: "saved_default",
  });
  expect(
    implicit.profiles.find(
      (p: { profile_id: string }) => p.profile_id === team,
    ),
  ).toMatchObject({ is_default: true, selected: true, projects: [] });
  expect(
    await knowledge.query(internal.assistantWidget.state, {}),
  ).toMatchObject({
    profile_id: team,
    selection_reason: "saved_default",
    actions: { context: false, save: false },
  });
  expect(
    await knowledge.query(internal.assistantWidget.profiles, {
      profileId: s.organizationId,
    }),
  ).toMatchObject({
    selected_profile_id: s.organizationId,
    selection_reason: "explicit",
  });
  await s.t.run((ctx) =>
    ctx.db.patch(actor, { defaultWorkspaceId: undefined }),
  );
  expect(
    await knowledge.query(internal.assistantWidget.profiles, {}),
  ).toMatchObject({
    selected_profile_id: s.organizationId,
    selection_reason: "personal",
  });
  const teamGrant = (await s.t.run((ctx) =>
    ctx.db
      .query("assistantGrants")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", team)
          .eq("actor", actor)
          .eq("clientId", clientId),
      )
      .unique(),
  ))!;
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: teamGrant._id,
    expectedVersion: teamGrant.version,
  });
  await s.t.run((ctx) => ctx.db.patch(actor, { defaultWorkspaceId: team }));
  expect(
    await knowledge.query(internal.assistantWidget.state, {}),
  ).toMatchObject({
    profile_id: s.organizationId,
    selection_reason: "personal",
  });
  await expect(
    knowledge.query(internal.assistantWidget.profiles, { profileId: team }),
  ).rejects.toThrow(/grant/);
});

it("keeps the configured catalog service out of normal workspace discovery even when processing is disabled", async () => {
  const s = await setup();
  await s.owner.mutation(api.assistantGrants.save, s.args);
  const service = await s.owner.mutation(api.organizations.create, {
    name: "Catalog infrastructure",
  });
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    organizationId: service,
    sources: [],
    libraryScope: "all",
  });
  const actor = (await s.t.run((ctx) => ctx.db.get(s.organizationId)))!
    .privateOwnerId!;
  await s.t.run((ctx) => ctx.db.patch(actor, { defaultWorkspaceId: service }));
  vi.stubEnv("CLOUD_CATALOG_ENABLED", "false");
  vi.stubEnv(
    "CLOUD_CATALOG_CONFIGURATION_JSON",
    JSON.stringify({
      version: "cloud-catalog-config-v1",
      serviceOrganizationId: service,
      maximumStorageBytes: 1000000,
      reviewedAt: Date.now() - 10000,
      expiresAt: Date.now() - 1000,
      permissions: [],
    }),
  );
  const profiles = await s.assistant.query(
    internal.assistantWidget.profiles,
    {},
  );
  expect(
    profiles.profiles.map((p: { profile_id: string }) => p.profile_id),
  ).toEqual([s.organizationId]);
  expect(profiles.selected_profile_id).toBe(s.organizationId);
  await expect(
    s.assistant.query(internal.assistantWidget.state, { profileId: service }),
  ).rejects.toThrow(/own workspace/);
});

it("requires selection between joined workspaces when the personal grant is revoked and rejects an unauthorized explicit route", async () => {
  const s = await setup();
  const personal = await s.owner.mutation(api.assistantGrants.save, s.args);
  for (const name of ["First team", "Second team"]) {
    const organizationId = await s.owner.mutation(api.organizations.create, {
      name,
    });
    await s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      organizationId,
      sources: [],
      libraryScope: "all",
    });
  }
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: personal.id,
    expectedVersion: personal.version,
  });
  const actor = (await s.t.run((ctx) => ctx.db.get(s.organizationId)))!
    .privateOwnerId!;
  await s.t.run((ctx) =>
    ctx.db.patch(actor, { defaultWorkspaceId: undefined }),
  );
  expect(
    await s.assistant.query(internal.assistantWidget.profiles, {}),
  ).toMatchObject({
    selected_profile_id: null,
    selection_reason: "required",
    truncated: false,
  });
  await expect(
    s.assistant.query(internal.assistantWidget.state, {}),
  ).rejects.toThrow(/PROFILE_SELECTION_REQUIRED/);
  await expect(
    s.assistant.query(internal.assistantWidget.profiles, {
      profileId: s.organizationId,
    }),
  ).rejects.toThrow(/grant/);
});

it("continues explicit-source grants by offset without scanning ahead past stale references", async () => {
  const s = await setup();
  const refs = await s.t.run(async (ctx) => {
    const original = (await ctx.db.get(s.sourceId))!;
    const { _id, _creationTime, ...fields } = original;
    const refs = [
      {
        sourceId: _id,
        generation: original.generation,
        revision: original.updatedAt,
      },
    ];
    for (let i = 1; i < 6; i++) {
      const sourceId = await ctx.db.insert("sources", {
        ...fields,
        key: `offset-reference-${i}`,
        canonical: `text:offset-${i}`,
        title: `Offset ${i}`,
      });
      refs.push({
        sourceId,
        generation: original.generation,
        revision: original.updatedAt,
      });
    }
    return refs;
  });
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: refs,
  });
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { updatedAt: refs[0].revision + 1 }),
  );
  const first = await s.assistant.query(internal.assistantWidget.browse, {
    kind: "sources",
  });
  expect(first.items).toHaveLength(4);
  expect(first).toMatchObject({ next_cursor: null, next_offset: 5 });
  expect(first.coverage).toContain("next_offset");
  const second = await s.assistant.query(internal.assistantWidget.browse, {
    kind: "sources",
    offset: 5,
  });
  expect(second.items.map((p: { id: string }) => p.id)).toEqual([
    refs[5].sourceId,
  ]);
  expect(second).toMatchObject({ next_cursor: null, next_offset: null });
  await expect(
    s.assistant.query(internal.assistantWidget.browse, {
      kind: "sources",
      cursor: "wrong",
      offset: 5,
    }),
  ).rejects.toThrow(/offsets/);
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    expectedVersion: 1,
    sources: [],
    libraryScope: "all",
  });
  await expect(
    s.assistant.query(internal.assistantWidget.browse, {
      kind: "sources",
      offset: 5,
    }),
  ).rejects.toThrow(/cursors/);
});
