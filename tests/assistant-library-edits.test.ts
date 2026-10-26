import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  libraryEditReceipt,
  libraryEditState,
} from "../packages/widget/library-edits";

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

it("renames once, returns a stable retry receipt and starts no processing", async () => {
  const s = await setup();
  const scheduledBefore = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    await s.assistant.query(internal.assistantLibrary.outcome, {
      ...s.reference,
      key: s.args.key,
    }),
  ).toBeNull();
  const result = await s.assistant.mutation(
    internal.assistantLibrary.change,
    s.args,
  );
  expect(libraryEditReceipt.parse(result)).toMatchObject({
    applied: true,
    processing_started: false,
    topic_version: 2,
    layout_version: 0,
  });
  expect(
    await s.assistant.mutation(internal.assistantLibrary.change, s.args),
  ).toEqual(result);
  expect(
    await s.assistant.query(internal.assistantLibrary.outcome, {
      ...s.reference,
      key: s.args.key,
    }),
  ).toEqual(result);
  expect(
    libraryEditState.parse(
      await s.assistant.query(internal.assistantLibrary.state, s.reference),
    ).topic,
  ).toMatchObject({
    name: "New topic",
    aliases: ["Original alias"],
    version: 2,
  });
  const after = await s.t.run(async (ctx) => ({
    commands: await ctx.db.query("assistantLibraryCommands").collect(),
    jobs: await ctx.db.query("knowledgeJobs").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(after.commands).toHaveLength(1);
  expect(after.commands[0].inputHash).toMatch(/^[a-f0-9]{64}$/);
  expect(after.commands[0]).not.toHaveProperty("name");
  expect(after.jobs).toEqual([]);
  expect(after.scheduled).toEqual(scheduledBefore);
});

it("pins and files topics using independent content and layout versions", async () => {
  const s = await setup();
  const pinned = await s.assistant.mutation(internal.assistantLibrary.change, {
    ...s.args,
    change: { kind: "pin", pinned: true },
  });
  expect(pinned.topic_version).toBe(2);
  const filed = await s.assistant.mutation(internal.assistantLibrary.change, {
    ...s.args,
    key: "synthetic-file-key",
    expectedVersion: 2,
    change: {
      kind: "structure",
      parentId: s.parentId,
      aliases: ["New_alias", "New alias"],
    },
  });
  expect(filed).toMatchObject({
    topic_version: 2,
    layout_version: 1,
    processing_started: false,
  });
  expect(
    (await s.assistant.query(internal.assistantLibrary.state, s.reference))
      .topic,
  ).toMatchObject({
    pinned: true,
    parent_id: s.parentId,
    aliases: ["New alias"],
    version: 2,
    layout_version: 1,
  });
});

it("binds a key to its original change and rejects stale competing edits", async () => {
  const s = await setup();
  await s.assistant.mutation(internal.assistantLibrary.change, s.args);
  await expect(
    s.assistant.mutation(internal.assistantLibrary.change, {
      ...s.args,
      change: { kind: "pin", pinned: true },
    }),
  ).rejects.toThrow(/original change/);
  await expect(
    s.assistant.mutation(internal.assistantLibrary.change, {
      ...s.args,
      key: "another-edit-key",
    }),
  ).rejects.toThrow(/Topic changed/);
  await expect(
    s.assistant.query(internal.assistantLibrary.outcome, {
      ...s.reference,
      topicId: s.parentId,
      key: s.args.key,
    }),
  ).rejects.toThrow(/different topic/);
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantLibraryCommands").collect()),
  ).toHaveLength(1);
});

it.each([
  "flag",
  "oauth",
  "client",
  "grant-scope",
  "viewer",
  "member-removed",
  "revoked",
  "expired",
  "scope",
  "grant-version",
  "actor",
  "workspace",
])(
  "denies library edits after %s changes, including receipt reads",
  async (reason) => {
    const s = await setup();
    let assistant = s.assistant;
    if (reason === "flag")
      vi.stubEnv("MCP_WIDGET_LIBRARY_EDITING_ENABLED", "false");
    if (reason === "oauth")
      assistant = s.t.withIdentity({ ...s.identity, scope: "knowledge:read" });
    if (reason === "client")
      vi.stubEnv(
        "MCP_CLIENTS",
        JSON.stringify([
          {
            id: clientId,
            name: "Read-only client",
            scopes: ["knowledge:read"],
          },
        ]),
      );
    await s.t.run(async (ctx) => {
      if (reason === "grant-scope")
        await ctx.db.patch(s.grantId, { scopes: ["knowledge:read"] });
      if (reason === "viewer")
        await ctx.db.patch(s.membershipId, { role: "viewer" });
      if (reason === "member-removed") await ctx.db.delete(s.membershipId);
      if (reason === "revoked")
        await ctx.db.patch(s.grantId, { state: "revoked" });
      if (reason === "expired")
        await ctx.db.patch(s.grantId, { expiresAt: Date.now() - 1 });
      if (reason === "scope")
        await ctx.db.patch(s.grantId, { libraryScope: "personal" });
      if (reason === "grant-version")
        await ctx.db.patch(s.grantId, { version: s.grantVersion + 1 });
      if (reason === "actor")
        await ctx.db.patch(s.actorId, { status: "deleting" });
      if (reason === "workspace")
        await ctx.db.patch(s.profileId, { status: "deleting" });
    });
    await expect(
      assistant.mutation(internal.assistantLibrary.change, s.args),
    ).rejects.toThrow();
    await expect(
      assistant.query(internal.assistantLibrary.state, s.reference),
    ).rejects.toThrow();
    await expect(
      assistant.query(internal.assistantLibrary.outcome, {
        ...s.reference,
        key: s.args.key,
      }),
    ).rejects.toThrow();
    expect((await s.t.run((ctx) => ctx.db.get(s.topicId)))?.name).toBe(
      "Original topic",
    );
    expect(
      await s.t.run((ctx) =>
        ctx.db.query("assistantLibraryCommands").collect(),
      ),
    ).toEqual([]);
  },
);

it.each(["self", "descendant", "foreign", "deleted"])(
  "refuses a %s parent without changing the topic or receipt",
  async (reason) => {
    const s = await setup();
    let parentId = s.parentId;
    if (reason === "self") parentId = s.topicId;
    await s.t.run(async (ctx) => {
      if (reason === "descendant")
        await ctx.db.patch(s.parentId, { parentId: s.topicId });
      if (reason === "deleted")
        await ctx.db.patch(s.parentId, { state: "deleted" });
      if (reason === "foreign") {
        const foreign = await ctx.db.insert("organizations", {
          name: "Other",
          status: "active",
          createdBy: s.actorId,
          createdAt: Date.now(),
        });
        await ctx.db.patch(s.parentId, { organizationId: foreign });
      }
    });
    await expect(
      s.assistant.mutation(internal.assistantLibrary.change, {
        ...s.args,
        change: { kind: "structure", parentId, aliases: [] },
      }),
    ).rejects.toThrow();
    expect((await s.t.run((ctx) => ctx.db.get(s.topicId)))?.layoutVersion).toBe(
      0,
    );
    expect(
      await s.t.run((ctx) =>
        ctx.db.query("assistantLibraryCommands").collect(),
      ),
    ).toEqual([]);
  },
);

it("rejects large or unsupported commands before storing a receipt", async () => {
  const s = await setup();
  await expect(
    s.assistant.mutation(internal.assistantLibrary.change, {
      ...s.args,
      change: {
        kind: "structure",
        parentId: null,
        aliases: Array(9).fill("Alias"),
      },
    }),
  ).rejects.toThrow();
  await expect(
    s.assistant.mutation(internal.assistantLibrary.change, {
      ...s.args,
      change: { kind: "rename", name: "A".repeat(161) },
    }),
  ).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantLibraryCommands").collect()),
  ).toEqual([]);
});

it("expires receipts through bounded cleanup without undoing topic changes", async () => {
  const s = await setup();
  await s.assistant.mutation(internal.assistantLibrary.change, s.args);
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.query("assistantLibraryCommands").first())!;
    await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
  });
  expect(
    await s.assistant.query(internal.assistantLibrary.outcome, {
      ...s.reference,
      key: s.args.key,
    }),
  ).toBeNull();
  await expect(
    s.assistant.mutation(internal.assistantLibrary.change, s.args),
  ).rejects.toThrow(/receipt expired/);
  await s.t.mutation(internal.maintenance.cleanup, {});
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantLibraryCommands").collect()),
  ).toEqual([]);
  await expect(
    s.assistant.mutation(internal.assistantLibrary.change, s.args),
  ).rejects.toThrow(/Topic changed/);
  expect((await s.t.run((ctx) => ctx.db.get(s.topicId)))?.name).toBe(
    "New topic",
  );
});

it("removes command receipts during workspace deletion", async () => {
  const s = await setup();
  await s.assistant.mutation(internal.assistantLibrary.change, s.args);
  await s.t.run((ctx) => ctx.db.patch(s.profileId, { status: "deleting" }));
  await s.t.mutation(internal.maintenance.purgeOrganization, {
    organizationId: s.profileId,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantLibraryCommands").collect()),
  ).toEqual([]);
});

it("removes an actor's receipts before finishing account deletion", async () => {
  const s = await setup();
  await s.assistant.mutation(internal.assistantLibrary.change, s.args);
  const jobId = await s.t.run((ctx) =>
    ctx.db.insert("deletionJobs", {
      userId: s.actorId,
      subject,
      state: "pending",
      attempts: 0,
    }),
  );
  await s.t.mutation(internal.accounts.finishDelete, { jobId });
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantLibraryCommands").collect()),
  ).toEqual([]);
});

it("carries edits, state and reconciliation through the real strict HTTP transport", async () => {
  const s = await setup();
  const provider = vi.fn(async () => Response.json({ sub: subject }));
  vi.stubGlobal("fetch", provider);
  const post = (operation: string, args: unknown) =>
    s.assistant.fetch("/assistant-tools", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-library-http-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation, args }),
    });
  const changed = await post("widget_library_edit", s.args);
  expect(changed.status).toBe(200);
  const result = await changed.json();
  expect(libraryEditReceipt.parse(result)).toMatchObject({
    topic_version: 2,
    processing_started: false,
  });
  const state = await post("widget_library_state", s.reference);
  expect(state.status).toBe(200);
  expect(libraryEditState.parse(await state.json()).topic.name).toBe(
    "New topic",
  );
  const recovered = await post("widget_library_receipt", {
    ...s.reference,
    key: s.args.key,
  });
  expect(recovered.status).toBe(200);
  expect((await recovered.json()).receipt).toEqual(result);
  expect(provider).toHaveBeenCalledTimes(3);
});

it("returns a fixed correlated rejection after an atomic HTTP edit fails", async () => {
  const s = await setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ sub: subject })),
  );
  const response = await s.assistant.fetch("/assistant-tools", {
    method: "POST",
    headers: {
      Authorization: "Bearer synthetic-library-http-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "widget_library_edit",
      args: { ...s.args, expectedVersion: 0 },
    }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    status: "rejected",
    code: "APPROVAL_STALE",
    profile_id: s.profileId,
    topic_id: s.topicId,
    request_key: s.args.key,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantLibraryCommands").collect()),
  ).toEqual([]);
  expect((await s.t.run((ctx) => ctx.db.get(s.topicId)))?.version).toBe(1);
});
