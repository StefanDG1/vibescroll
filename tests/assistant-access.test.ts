import { afterEach, expect, it, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";
import { setup as setupQuery } from "../convex/assistantGrants";
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
it("records explicit source judgments with replay-safe corrections while preserving manual reviews and denying stale or revoked writes", async () => {
  const s = await setup();
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    scopes: ["feedback:write"],
  });
  const input = {
    profileId: s.organizationId,
    sourceId: s.sourceId,
    generation: s.args.sources[0].generation,
    revision: s.args.sources[0].revision,
    grantVersion: 1,
    key: "stable-feedback-key",
    expectedVersion: 0,
    explicitlyRequested: true as const,
    action: "useful" as const,
    note: "I found this relevant. Benefit has not been measured.",
  };
  const manual = await s.owner.mutation(api.product.feedback, {
    organizationId: s.organizationId,
    target: s.sourceId,
    action: "manual",
    benefit: "not_measured",
    note: "Keep my prior judgment",
  });
  const first = await s.assistant.mutation(
    internal.assistant.recordFeedback,
    input,
  );
  expect(first).toMatchObject({
    version: 1,
    benefit: "not_measured",
    status: "recorded",
  });
  expect(
    (await s.assistant.mutation(internal.assistant.recordFeedback, input))
      .feedback_id,
  ).toBe(first.feedback_id);
  await expect(
    s.assistant.mutation(internal.assistant.recordFeedback, {
      ...input,
      action: "later",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  const corrected = await s.assistant.mutation(
    internal.assistant.recordFeedback,
    { ...input, expectedVersion: 1, action: "later" },
  );
  expect(corrected.version).toBe(2);
  const rows = await s.t.run((ctx) => ctx.db.query("feedback").collect());
  expect(rows).toHaveLength(3);
  expect(rows.find((r) => r._id === manual)?.note).toBe(
    "Keep my prior judgment",
  );
  expect(
    rows
      .filter((r) => r.assistantClientId)
      .every((r) => r.benefit === "not_measured" && !r.qualityVerdict),
  ).toBe(true);
  const noScope = s.t.withIdentity({
    subject,
    issuer,
    client_id: clientId,
    scope: "knowledge:read",
    sid: "app_consent_01234567890123456789012345",
  });
  await expect(
    noScope.mutation(internal.assistant.recordFeedback, {
      ...input,
      expectedVersion: 2,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.assistant.mutation(internal.assistant.recordFeedback, {
      ...input,
      expectedVersion: 2,
      revision: input.revision + 1,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: grant.id,
    expectedVersion: 1,
  });
  await expect(
    s.assistant.mutation(internal.assistant.recordFeedback, {
      ...input,
      expectedVersion: 2,
    }),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  expect(await s.t.run((ctx) => ctx.db.query("outbox").collect())).toEqual([]);
});
it("does not read source or card tables to prepare a scope grant", async () => {
  const s = await setup();
  const tables: string[] = [];
  await s.owner.run(async (ctx) => {
    const db = new Proxy(ctx.db, {
      get(target, property) {
        if (property === "query")
          return (table: string) => {
            tables.push(table);
            return target.query(table as never);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await (
      setupQuery as unknown as {
        _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
      }
    )._handler({ ...ctx, db }, { organizationId: s.organizationId });
  });
  expect(tables).not.toContain("sources");
  expect(tables).not.toContain("dashboardCards");
  expect(tables).not.toContain("sourceSpaces");
  expect(tables).toContain("assistantGrants");
});
it("keeps Connect identities out of ordinary app queries, captures and account bootstrap", async () => {
  const s = await setup();
  await expect(
    s.assistant.query(api.assistantGrants.setup, {
      organizationId: s.organizationId,
    }),
  ).rejects.toThrow("Sign in");
  await expect(
    s.assistant.mutation(api.product.capture, {
      organizationId: s.organizationId,
      key: "unauthorized-write",
      kind: "text",
      title: "Must not save",
      text: "untrusted",
      rightsAttested: true,
    }),
  ).rejects.toThrow("Sign in");
  await expect(
    s.assistant.query(api.accounts.bootstrapRequired, {}),
  ).rejects.toThrow();
  expect(
    (await s.t.run((ctx) => ctx.db.query("sources").collect())).length,
  ).toBe(1);
});
it("requires reviewed current source versions and configured scopes without a recent-authentication timer or spending", async () => {
  const s = await setup();
  const old = s.t.withIdentity({
    subject,
    issuer: "https://api.workos.com",
    auth_time: Math.floor(Date.now() / 1000) - 301,
  });
  await expect(
    s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      sources: [{ ...s.args.sources[0], revision: 0 }],
    }),
  ).rejects.toThrow("STALE_APPROVAL");
  await expect(
    s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      scopes: ["execution:write"],
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await old.mutation(api.assistantGrants.save, s.args);
  await expect(
    s.owner.mutation(api.assistantGrants.save, s.args),
  ).rejects.toThrow("STALE_APPROVAL");
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  expect(await s.t.run((ctx) => ctx.db.query("outbox").collect())).toEqual([]);
});
it("keeps an explicitly reviewed all-library grant until revoked, including future posts years later without renewal work", async () => {
  const s = await setup();
  const context = await s.owner.mutation(api.librarySpaces.saveSetup, {
    organizationId: s.organizationId,
    expectedVersion: 0,
    focus: ["personal"],
    goal: "Keep useful ideas accessible",
    role: "Project owner",
    interests: ["Testing"],
    connectSpaces: false,
    confirmed: true,
    stage: 2,
  });
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    libraryScope: "all",
    expiresAt: null,
    scopes: ["knowledge:read", "context:read"],
    contextVersion: context.version,
  });
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValue(Date.now() + 10 * 365 * 86400000);
  try {
    const future = await s.owner.mutation(api.product.capture, {
      organizationId: s.organizationId,
      key: "future-unfiled-permanent-post",
      kind: "text",
      title: "Future permanent access",
      text: "PRIVATE transcript",
      rightsAttested: true,
    });
    const profile = (await s.assistant.query(internal.assistant.getProfile, {}))
      .profiles[0];
    expect(profile).toMatchObject({
      profile_id: s.organizationId,
      expires_at: null,
    });
    expect(
      (await s.assistant.query(internal.assistant.fetch, { id: future })).id,
    ).toBe(future);
    expect(
      (
        await s.owner.query(api.assistantGrants.setup, {
          organizationId: s.organizationId,
        })
      ).sources,
    ).toEqual([]);
    expect(
      await s.t.run((ctx) => ctx.db.query("reservations").collect()),
    ).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.query("outbox").collect())).toEqual(
      [],
    );
    await s.owner.mutation(api.assistantGrants.revoke, {
      id: grant.id,
      expectedVersion: 1,
    });
    expect(
      (await s.assistant.query(internal.assistant.getProfile, {})).profiles,
    ).toEqual([]);
    await expect(
      s.assistant.query(internal.assistant.fetch, {
        profileId: s.organizationId,
        id: future,
      }),
    ).rejects.toThrow("FORBIDDEN");
  } finally {
    clock.mockRestore();
  }
});
it("retains timed expiry, explicit review, version and membership checks for access until revoked", async () => {
  const s = await setup();
  await expect(
    s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      expiresAt: Date.now() + 31 * 86400000,
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await s.owner.mutation(api.assistantGrants.save, s.args);
  const clock = vi.spyOn(Date, "now").mockReturnValue(s.args.expiresAt + 1);
  try {
    await expect(
      s.assistant.query(internal.assistant.fetch, {
        profileId: s.organizationId,
        id: s.sourceId,
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      s.owner.mutation(api.assistantGrants.save, {
        ...s.args,
        expectedVersion: 1,
        expiresAt: null,
      }),
    ).resolves.toMatchObject({ version: 2 });
  } finally {
    clock.mockRestore();
  }
  await expect(
    s.owner.mutation(api.assistantGrants.save, { ...s.args, expiresAt: null }),
  ).rejects.toThrow("STALE_APPROVAL");
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    expectedVersion: 2,
    expiresAt: null,
  });
  await s.t.run(async (ctx) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) => q.eq("organizationId", s.organizationId))
      .first();
    await ctx.db.delete(membership!._id);
  });
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
it("retrieves only selected current metadata/citations and immediately denies revocation and source changes", async () => {
  const s = await setup();
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  const grant = await s.owner.mutation(api.assistantGrants.save, s.args);
  const result = await s.assistant.query(internal.assistant.fetch, {
    profileId: s.organizationId,
    id: s.sourceId,
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE transcript");
  expect(result.url).toContain(
    `/app/${s.organizationId}/library/${s.sourceId}`,
  );
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { updatedAt: s.args.sources[0].revision + 1 }),
  );
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: grant.id,
    expectedVersion: 1,
  });
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
it("includes future posts in the chosen space and fences moving, corrections, rights, deletion and revocation", async () => {
  const s = await setup();
  await s.owner.mutation(api.librarySpaces.fileSource, {
    organizationId: s.organizationId,
    sourceId: s.sourceId,
    spaces: ["personal"],
  });
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    libraryScope: "personal",
    scopes: ["knowledge:read", "jobs:read", "feedback:write"],
  });
  const future = await s.owner.mutation(api.product.capture, {
    organizationId: s.organizationId,
    key: "future-personal-post",
    kind: "text",
    title: "Future selected source",
    text: "PRIVATE future transcript",
    rightsAttested: true,
  });
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: future,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.owner.mutation(api.librarySpaces.fileSource, {
    organizationId: s.organizationId,
    sourceId: future,
    spaces: ["personal"],
  });
  const result = await s.assistant.query(internal.assistant.fetch, {
    profileId: s.organizationId,
    id: future,
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE future transcript");
  expect(result.id).toBe(future);
  await s.owner.mutation(api.librarySpaces.fileSource, {
    organizationId: s.organizationId,
    sourceId: future,
    spaces: ["business"],
  });
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: future,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.assistant.query(internal.assistant.getJobStatus, {
      profileId: s.organizationId,
      sourceId: future,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { updatedAt: s.args.sources[0].revision + 1 }),
  );
  await expect(
    s.assistant.mutation(internal.assistant.recordFeedback, {
      profileId: s.organizationId,
      sourceId: s.sourceId,
      generation: s.args.sources[0].generation,
      revision: s.args.sources[0].revision,
      grantVersion: 1,
      key: "stale-space-feedback",
      expectedVersion: 0,
      explicitlyRequested: true,
      action: "useful",
      note: "Old evidence",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { rightsAttested: true, state: "deleted" }),
  );
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: grant.id,
    expectedVersion: 1,
  });
  await expect(
    s.assistant.query(internal.assistant.search, {
      profileId: s.organizationId,
      query: "Future",
    }),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
});
it("pages live all-library search five posts at a time, binds cursors and rejects foreign workspace or changed grants", async () => {
  const s = await setup();
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    libraryScope: "all",
  });
  await s.t.run(async (ctx) => {
    const {
      _id: _unusedId,
      _creationTime: _time,
      ...original
    } = (await ctx.db.get(s.sourceId))!;
    for (let i = 0; i < 12; i++) {
      const id = await ctx.db.insert("sources", {
        ...original,
        key: `future-all-${i}`,
        canonical: `text:future-all-${i}`,
        title: `Future source ${i}`,
        updatedAt: original.updatedAt + i + 1,
      });
      await syncDashboardCard(ctx, "sources", id, await ctx.db.get(id));
    }
  });
  const first = await s.assistant.query(internal.assistant.search, {
    profileId: s.organizationId,
    query: "Future",
  });
  expect(first.results.length).toBeLessThanOrEqual(5);
  expect(first.next_cursor).toBeTruthy();
  const second = await s.assistant.query(internal.assistant.search, {
    profileId: s.organizationId,
    query: "Future",
    cursor: first.next_cursor!,
  });
  expect(second.results.length).toBeLessThanOrEqual(5);
  expect(
    second.results.some((r) => first.results.some((f) => f.id === r.id)),
  ).toBe(false);
  await expect(
    s.assistant.query(internal.assistant.search, {
      profileId: s.organizationId,
      query: "Changed",
      cursor: first.next_cursor!,
    }),
  ).rejects.toThrow("STALE_APPROVAL");
  const foreignOrg = await s.owner.mutation(api.organizations.create, {
    name: "Separate workspace",
  });
  const foreign = await s.t.run(async (ctx) => {
    const {
      _id: _unusedId,
      _creationTime: _time,
      ...original
    } = (await ctx.db.get(s.sourceId))!;
    return await ctx.db.insert("sources", {
      ...original,
      organizationId: foreignOrg,
      key: "foreign-space-source",
      canonical: "text:foreign-space-source",
      title: "Foreign source",
    });
  });
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: foreign,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    libraryScope: "all",
    expectedVersion: 1,
  });
  await expect(
    s.assistant.query(internal.assistant.search, {
      profileId: s.organizationId,
      query: "Future",
      cursor: first.next_cursor!,
    }),
  ).rejects.toThrow("STALE_APPROVAL");
  expect((await s.t.run((ctx) => ctx.db.get(grant.id)))?.sources).toEqual([]);
});
it("passes live search cursors through the authenticated HTTP boundary without widening accepted input", async () => {
  const s = await setup();
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    libraryScope: "all",
  });
  await s.t.run(async (ctx) => {
    const {
      _id: _unusedId,
      _creationTime: _time,
      ...original
    } = (await ctx.db.get(s.sourceId))!;
    for (let index = 0; index < 6; index++) {
      const id = await ctx.db.insert("sources", {
        ...original,
        key: `http-page-${index}`,
        canonical: `text:http-page-${index}`,
        title: `Future HTTP source ${index}`,
        updatedAt: original.updatedAt + index + 1,
      });
      await syncDashboardCard(ctx, "sources", id, await ctx.db.get(id));
    }
  });
  const provider = vi.fn(async () => Response.json({ sub: subject }));
  vi.stubGlobal("fetch", provider);
  const search = (args: Record<string, unknown>) =>
    s.assistant.fetch("/assistant-tools", {
      method: "POST",
      headers: {
        authorization: "Bearer synthetic-access-token-0123456789",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        operation: "search",
        args: { profileId: s.organizationId, query: "Future", ...args },
      }),
    });
  const first = await search({});
  expect(first.status).toBe(200);
  expect(first.headers.get("cache-control")).toBe("no-store");
  const page = await first.json();
  expect(page.results).toHaveLength(5);
  expect(page.next_cursor).toBeTruthy();
  const second = await search({ cursor: page.next_cursor });
  expect(second.status).toBe(200);
  expect(second.headers.get("cache-control")).toBe("no-store");
  const following = await second.json();
  expect(following.results).toHaveLength(1);
  expect(following.next_cursor).toBeNull();
  expect(
    following.results.some((r: { id: string }) =>
      page.results.some((p: { id: string }) => p.id === r.id),
    ),
  ).toBe(false);
  expect(provider).toHaveBeenCalledTimes(2);
  for (const args of [{ cursor: "x".repeat(4097) }, { actor: "foreign" }]) {
    expect((await search(args)).status).toBe(403);
  }
  expect(provider).toHaveBeenCalledTimes(2);
  expect(
    (await search({ cursor: page.next_cursor, query: "Changed" })).status,
  ).toBe(403);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
});
it("rejects wrong client, OAuth scope, machine subject, consent and private owner", async () => {
  const s = await setup();
  await s.owner.mutation(api.assistantGrants.save, s.args);
  for (const change of [
    { client_id: "client_98765432109876543210987654" },
    { scope: "openid" },
    { subject: clientId },
    { sid: "session_01234567890123456789012345" },
    { subject: "user_98765432109876543210987654" },
  ]) {
    const caller = s.t.withIdentity({
      subject,
      issuer,
      client_id: clientId,
      scope: "knowledge:read",
      sid: "app_consent_01234567890123456789012345",
      ...change,
    });
    await expect(
      caller.query(internal.assistant.fetch, {
        profileId: s.organizationId,
        id: s.sourceId,
      }),
    ).rejects.toThrow("FORBIDDEN");
  }
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
it("saves explicit intake once in the approved space without fetching or analysis, fences ungranted retrieval and separates funding approval", async () => {
  const s = await setup();
  vi.stubEnv("LINK_PREVIEWS_ENABLED", "true");
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    scopes: ["links:save", "jobs:read", "analysis:request", "knowledge:read"],
    intakeSpace: "personal",
  });
  const args = {
    profileId: s.organizationId,
    url: "https://www.youtube.com/watch?v=synthetic-test",
    title: "Synthetic explicitly requested link",
    key: "explicit-intake-replay",
    rightsAttested: true as const,
    explicitlyRequested: true as const,
  };
  const first = await s.assistant.mutation(internal.assistant.saveLink, args);
  const replay = await s.assistant.mutation(internal.assistant.saveLink, args);
  expect(replay.source_id).toBe(first.source_id);
  expect(first.analysis_started).toBe(false);
  const source = (await s.t.run((ctx) => ctx.db.get(first.source_id)))!;
  expect(source.linkPreview).toBeUndefined();
  const filing = await s.t.run((ctx) => ctx.db.query("sourceSpaces").collect());
  expect(filing).toEqual([
    expect.objectContaining({ sourceId: first.source_id, space: "personal" }),
  ]);
  expect(
    (await s.t.run((ctx) => ctx.db.query("assistantIntakes").collect())).length,
  ).toBe(1);
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: first.source_id,
    }),
  ).rejects.toThrow("FORBIDDEN");
  const status = await s.assistant.query(internal.assistant.getJobStatus, {
    profileId: s.organizationId,
    sourceId: first.source_id,
  });
  expect(status.status).toBe("needs_upload");
  const analysis = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    {
      profileId: s.organizationId,
      sourceId: first.source_id,
    },
  );
  expect(analysis).toMatchObject({
    status: "approval_required",
    analysis_started: false,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  expect(await s.t.run((ctx) => ctx.db.query("outbox").collect())).toEqual([]);
  await s.t.run((ctx) =>
    ctx.db.patch(first.source_id, { rightsAttested: false }),
  );
  await expect(
    s.assistant.query(internal.assistant.getJobStatus, {
      profileId: s.organizationId,
      sourceId: first.source_id,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
it("rejects network targets outside existing source policy and fences intake status after replacement or revocation", async () => {
  const s = await setup();
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    scopes: ["links:save", "jobs:read"],
  });
  const args = {
    profileId: s.organizationId,
    url: "https://youtu.be/synthetic",
    title: "Synthetic intake",
    key: "scope-replacement-intake",
    rightsAttested: true as const,
    explicitlyRequested: true as const,
  };
  for (const url of [
    "http://youtu.be/test",
    "https://127.0.0.1/test",
    "https://youtube.com.evil.test/test",
    "https://user:password@youtube.com/test",
    "https://youtube.com:8443/test",
  ])
    await expect(
      s.assistant.mutation(internal.assistant.saveLink, { ...args, url }),
    ).rejects.toThrow("UNSUPPORTED_SOURCE");
  const result = await s.assistant.mutation(internal.assistant.saveLink, args);
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    scopes: ["links:save", "jobs:read"],
    expectedVersion: 1,
  });
  await expect(
    s.assistant.query(internal.assistant.getJobStatus, {
      profileId: s.organizationId,
      sourceId: result.source_id,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: grant.id,
    expectedVersion: 2,
  });
  await expect(
    s.assistant.mutation(internal.assistant.saveLink, args),
  ).rejects.toThrow("FORBIDDEN");
});
it("inherits verified identity into HTTP internal calls, checks provider revocation each time and rechecks a concurrent app revocation", async () => {
  const s = await setup();
  const grant = await s.owner.mutation(api.assistantGrants.save, s.args);
  let active = true;
  let returnedSubject = subject;
  let revokeDuringCheck = false;
  const provider = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(`${issuer}/oauth2/userinfo`);
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer synthetic-access-token-0123456789",
    );
    expect(init.body).toBeUndefined();
    if (revokeDuringCheck)
      await s.owner.mutation(api.assistantGrants.revoke, {
        id: grant.id,
        expectedVersion: 1,
      });
    return active
      ? Response.json({ sub: returnedSubject })
      : Response.json({ error: "invalid_token" }, { status: 401 });
  });
  vi.stubGlobal("fetch", provider);
  const request = {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic-access-token-0123456789",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      operation: "fetch",
      args: { profileId: s.organizationId, id: s.sourceId },
    }),
  };
  const first = await s.assistant.fetch("/assistant-tools", request);
  expect(first.status).toBe(200);
  expect(first.headers.get("cache-control")).toBe("no-store");
  expect(await first.json()).toMatchObject({ id: s.sourceId });
  returnedSubject = "user_99999999999999999999999999";
  expect((await s.assistant.fetch("/assistant-tools", request)).status).toBe(
    401,
  );
  returnedSubject = subject;
  active = false;
  expect((await s.assistant.fetch("/assistant-tools", request)).status).toBe(
    401,
  );
  active = true;
  revokeDuringCheck = true;
  expect((await s.assistant.fetch("/assistant-tools", request)).status).toBe(
    403,
  );
  expect(provider).toHaveBeenCalledTimes(4);
  expect((await s.owner.fetch("/assistant-tools", request)).status).toBe(403);
  expect(provider).toHaveBeenCalledTimes(4);
});
it("checks scope setup without returning post choices and refuses stale context without overwriting the owner's setup", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const original = (await ctx.db.get(s.sourceId))!;
    const { _id: _sourceId, _creationTime: _time, ...copy } = original;
    for (let index = 0; index < 40; index++) {
      const id = await ctx.db.insert("sources", {
        ...copy,
        key: `synthetic-page-${index}`,
        canonical: `text:synthetic-page-${index}`,
        title: `Synthetic metadata ${index}`,
        updatedAt: original.updatedAt + index + 1,
      });
      await syncDashboardCard(ctx, "sources", id, await ctx.db.get(id));
    }
  });
  const result = await s.owner.query(api.assistantGrants.setup, {
    organizationId: s.organizationId,
  });
  expect(result.sources).toEqual([]);
  expect(result.nextCursor).toBeNull();
  expect(result.privateLibrary).toBe(true);
  expect(JSON.stringify(result)).not.toContain("PRIVATE transcript");
  const context = await s.owner.mutation(api.librarySpaces.saveSetup, {
    organizationId: s.organizationId,
    expectedVersion: 0,
    focus: ["personal"],
    goal: "Synthetic confirmed goal",
    role: "Project owner",
    interests: ["Testing"],
    connectSpaces: false,
    confirmed: true,
    stage: 2,
  });
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    scopes: ["knowledge:read", "context:read"],
    contextVersion: context.version,
  });
  expect(
    (await s.assistant.query(internal.assistant.getProfile, {})).profiles[0]
      .context?.goal,
  ).toBe(context.goal);
  await s.owner.mutation(api.librarySpaces.saveSetup, {
    organizationId: s.organizationId,
    expectedVersion: 1,
    focus: ["personal"],
    goal: "Corrected current goal",
    role: "Project owner",
    interests: ["Testing"],
    connectSpaces: false,
    confirmed: true,
    stage: 2,
  });
  const profile = (await s.assistant.query(internal.assistant.getProfile, {}))
    .profiles[0];
  expect(profile.context).toBeUndefined();
  expect(profile.context_changed).toBe(true);
  await expect(
    s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      expectedVersion: 1,
      scopes: ["context:read"],
      contextVersion: 1,
    }),
  ).rejects.toThrow("STALE_APPROVAL");
});

async function projectSuggestion() {
  const s = await setup();
  const data = await s.t.run(async (ctx) => {
    const now = Date.now();
    const actor = (await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique())!;
    await ctx.db.patch(s.sourceId, {
      state: "ready",
      analysis: {
        summary: "Synthetic",
        insights: [
          {
            id: "point-owned",
            title: "Review",
            claim: "A synthetic owned claim",
            topics: ["Review"],
            evidence: [],
          },
        ],
      },
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId: s.organizationId,
      installationId: 42,
      providerId: 55,
      fullName: "owned/synthetic",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "purpose: review synthetic ideas",
      profileVersion: 1,
      manifest: ["README.md"],
      status: "connected",
      context: "PRIVATE CODE MUST NOT BE DISCLOSED",
      createdAt: now,
      updatedAt: now,
    });
    const topicId = await ctx.db.insert("knowledgeTopics", {
      organizationId: s.organizationId,
      key: "review",
      name: "Review",
      pinned: false,
      version: 1,
      state: "ready",
      createdAt: now,
      updatedAt: now,
    });
    const references = [{ ...s.args.sources[0], insightId: "point-owned" }];
    const output = {
      disposition: "relevant",
      title: "Synthetic project suggestion",
      rationale: "An owned review task",
      problem: "Review a decision",
      approach: "Document it",
      acceptance: ["Reviewable"],
      tests: ["Inspect decision"],
      risks: ["Benefit unmeasured"],
      alternatives: [],
      questions: [],
      references,
      repositoryEvidence: [],
    };
    const evaluationId = await ctx.db.insert("knowledgeEvaluations", {
      organizationId: s.organizationId,
      topicId,
      repositoryId,
      actor: actor._id,
      topicVersion: 1,
      baseSha: "a".repeat(40),
      profileVersion: 1,
      selectionVersion: 0,
      references,
      sourceSetHash: "synthetic",
      key: "synthetic-evaluation",
      state: "ready",
      decision: "relevant",
      output,
      processingVersion: "synthetic",
      covered: 1,
      omitted: true,
      createdAt: now,
      updatedAt: now,
    });
    return { repositoryId, evaluationId, output };
  });
  const repositories = [
    {
      repositoryId: data.repositoryId,
      baseSha: "a".repeat(40),
      profileVersion: 1,
      selectionVersion: 0,
    },
  ];
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    repositories,
    scopes: ["context:read", "suggestions:draft"],
  });
  const profile = await s.assistant.query(internal.assistant.getProfile, {
    profileId: s.organizationId,
  });
  const input = {
    profileId: s.organizationId,
    evaluationId: data.evaluationId,
    evaluationHash:
      profile.profiles[0].projects[0].evaluations![0].evaluation_hash,
    grantVersion: grant.version,
    explicitlyRequested: true as const,
  };
  return { ...s, ...data, repositories, input, profile, grant };
}
it("shares only selected current project context and reuses private cited drafts without overwriting edits or granting publication", async () => {
  const s = await projectSuggestion();
  expect(JSON.stringify(s.profile)).not.toContain("PRIVATE CODE");
  expect(s.profile.profiles[0].projects[0]).toMatchObject({
    context: "purpose: review synthetic ideas",
    selection_version: 0,
  });
  expect(
    (await s.assistant.query(internal.assistant.getProfile, {})).profiles[0]
      .projects,
  ).toEqual([]);
  const first = await s.assistant.mutation(
    internal.assistant.draftProjectSuggestion,
    s.input,
  );
  expect(first).toMatchObject({
    draft_created: true,
    publication_started: false,
    coding_started: false,
    status: "draft",
  });
  const draft = (await s.t.run((ctx) => ctx.db.get(first.draft_id!)))!;
  expect(draft.body).toContain(`/library/${s.sourceId}`);
  expect(draft.body).toContain("Benefit and effort remain hypotheses");
  await s.t.run((ctx) =>
    ctx.db.patch(draft._id, {
      title: "My manual correction",
      body: "My private manual body",
      version: 2,
    }),
  );
  const replay = await s.assistant.mutation(
    internal.assistant.draftProjectSuggestion,
    s.input,
  );
  expect(replay).toMatchObject({ draft_id: draft._id, draft_created: false });
  expect((await s.t.run((ctx) => ctx.db.get(draft._id)))!.body).toBe(
    "My private manual body",
  );
  for (const table of ["issueAttempts", "reservations", "runs"] as const)
    expect(await s.t.run((ctx) => ctx.db.query(table).collect())).toEqual([]);
});
it("requires exact current evaluation, project, grant and all selected evidence for assistant project drafts", async () => {
  const s = await projectSuggestion();
  await expect(
    s.assistant.mutation(internal.assistant.draftProjectSuggestion, {
      ...s.input,
      evaluationHash: "b".repeat(64),
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.assistant.mutation(internal.assistant.draftProjectSuggestion, {
      ...s.input,
      grantVersion: 2,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.t.run((ctx) => ctx.db.patch(s.repositoryId, { profileVersion: 2 }));
  await expect(
    s.assistant.mutation(internal.assistant.draftProjectSuggestion, s.input),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(
    (
      await s.assistant.query(internal.assistant.getProfile, {
        profileId: s.organizationId,
      })
    ).profiles[0].projects[0],
  ).toMatchObject({ context_changed: true });
  await s.t.run((ctx) => ctx.db.patch(s.repositoryId, { profileVersion: 1 }));
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  await expect(
    s.assistant.mutation(internal.assistant.draftProjectSuggestion, s.input),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(await s.t.run((ctx) => ctx.db.query("issueDrafts").collect())).toEqual(
    [],
  );
});
it("keeps non-fit judgments distinct and denies unselected context or a revoked project grant", async () => {
  const s = await projectSuggestion();
  for (const disposition of [
    "no_fit",
    "already_implemented",
    "unsupported_claim",
    "needs_context",
    "defer",
  ]) {
    await s.t.run((ctx) =>
      ctx.db.patch(s.evaluationId, { output: { ...s.output, disposition } }),
    );
    const current = await s.assistant.query(internal.assistant.getProfile, {
      profileId: s.organizationId,
    });
    const result = await s.assistant.mutation(
      internal.assistant.draftProjectSuggestion,
      {
        ...s.input,
        evaluationHash:
          current.profiles[0].projects[0].evaluations![0].evaluation_hash,
      },
    );
    expect(result).toMatchObject({ status: disposition, draft_created: false });
  }
  expect(await s.t.run((ctx) => ctx.db.query("issueDrafts").collect())).toEqual(
    [],
  );
  await expect(
    s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      expectedVersion: 1,
      repositories: s.repositories,
      scopes: ["suggestions:draft"],
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await expect(
    s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      expectedVersion: 1,
      repositories: [{ ...s.repositories[0], baseSha: "b".repeat(40) }],
      scopes: ["context:read"],
    }),
  ).rejects.toThrow("STALE_APPROVAL");
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: s.grant.id,
    expectedVersion: 1,
  });
  await expect(
    s.assistant.query(internal.assistant.getProfile, {
      profileId: s.organizationId,
    }),
  ).rejects.toThrow("FORBIDDEN");
});

it("pages project choices independently and rejects foreign or duplicate project bindings without broadening source approval", async () => {
  const s = await projectSuggestion();
  const foreign = await s.owner.mutation(api.organizations.create, {
    name: "Other owned workspace",
  });
  await s.t.run(async (ctx) => {
    const existing = (await ctx.db.get(s.repositoryId))!;
    const { _id, _creationTime, ...record } = existing;
    for (let n = 0; n < 22; n++)
      await ctx.db.insert("repositories", {
        ...record,
        providerId: 100 + n,
        fullName: `owned/other-${n}`,
      });
    await ctx.db.patch(s.repositoryId, { organizationId: foreign });
  });
  const first = await s.owner.query(api.assistantGrants.projectChoices, {
    organizationId: s.organizationId,
  });
  const second = await s.owner.query(api.assistantGrants.projectChoices, {
    organizationId: s.organizationId,
    cursor: first.repositoryNextCursor,
  });
  expect(first.repositories.length + second.repositories.length).toBe(22);
  expect(
    first.repositories.some((r) => r.repositoryId === s.repositoryId),
  ).toBe(false);
  await expect(
    s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      expectedVersion: 1,
      repositories: s.repositories,
      scopes: ["context:read"],
    }),
  ).rejects.toThrow("STALE_APPROVAL");
  await s.t.run((ctx) =>
    ctx.db.patch(s.repositoryId, { organizationId: s.organizationId }),
  );
  await expect(
    s.owner.mutation(api.assistantGrants.save, {
      ...s.args,
      expectedVersion: 1,
      repositories: [...s.repositories, ...s.repositories],
      scopes: ["context:read"],
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    expectedVersion: 1,
    sources: [],
    repositories: s.repositories,
    scopes: ["context:read", "links:save"],
  });
  expect(
    (
      await s.assistant.query(internal.assistant.getProfile, {
        profileId: s.organizationId,
      })
    ).profiles[0].projects[0].evaluations,
  ).toEqual([]);
});

it("preserves owner/admin drafting authority when current membership loses that role", async () => {
  const s = await projectSuggestion();
  await s.t.run(async (ctx) => {
    const actor = (await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique())!;
    const member = (await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", s.organizationId).eq("userId", actor._id),
      )
      .unique())!;
    await ctx.db.patch(member._id, { role: "member" });
  });
  await expect(
    s.assistant.mutation(internal.assistant.draftProjectSuggestion, s.input),
  ).rejects.toThrow("FORBIDDEN");
  expect(await s.t.run((ctx) => ctx.db.query("issueDrafts").collect())).toEqual(
    [],
  );
});

it("withholds derived evaluation metadata from a context-only grant or OAuth scope", async () => {
  const s = await projectSuggestion();
  const contextOnly = s.t.withIdentity({
    subject,
    issuer,
    client_id: clientId,
    scope: "context:read",
    sid: "app_consent_01234567890123456789012345",
  });
  expect(
    (
      await contextOnly.query(internal.assistant.getProfile, {
        profileId: s.organizationId,
      })
    ).profiles[0].projects[0].evaluations,
  ).toEqual([]);
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    expectedVersion: 1,
    repositories: s.repositories,
    scopes: ["context:read"],
  });
  const profile = await s.assistant.query(internal.assistant.getProfile, {
    profileId: s.organizationId,
  });
  expect(profile.profiles[0].projects[0].context).toBe(
    "purpose: review synthetic ideas",
  );
  expect(profile.profiles[0].projects[0].evaluations).toEqual([]);
});

it("projects a strict current private proposal only with both knowledge and selected context grants", async () => {
  const s = await projectSuggestion();
  const first = await s.assistant.mutation(
    internal.assistant.draftProjectSuggestion,
    s.input,
  );
  await expect(
    s.assistant.query(internal.assistantWidget.proposal, {
      profileId: s.organizationId,
      proposalId: first.draft_id!,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    repositories: s.repositories,
    scopes: ["knowledge:read", "context:read", "suggestions:draft"],
    expectedVersion: s.grant.version,
  });
  const result = await s.assistant.query(internal.assistantWidget.proposal, {
    profileId: s.organizationId,
    proposalId: first.draft_id!,
  });
  expect(widgetOutputs.widget_proposal.parse(result)).toMatchObject({
    id: first.draft_id,
    coding_started: false,
    publication_started: false,
  });
});

it.each([undefined, 7 * 86400])(
  "allows a valid normal app session with auth age %s to review assistant access",
  async (age) => {
    const s = await setup();
    const normal = s.t.withIdentity({
      subject,
      issuer: "https://api.workos.com",
      ...(age === undefined
        ? {}
        : { auth_time: Math.floor(Date.now() / 1000) - age }),
    });
    const grant = await normal.mutation(api.assistantGrants.save, s.args);
    expect(grant.version).toBe(1);
    expect(
      await s.t.run((ctx) => ctx.db.query("reservations").collect()),
    ).toEqual([]);
  },
);
it("still denies unsigned, assistant, inactive and read-only identities from changing grants", async () => {
  const s = await setup();
  await expect(s.t.mutation(api.assistantGrants.save, s.args)).rejects.toThrow(
    "Sign in",
  );
  await expect(
    s.assistant.mutation(api.assistantGrants.save, s.args),
  ).rejects.toThrow("Sign in");
  await s.t.run(async (ctx) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("organizationId", s.organizationId))
      .first();
    await ctx.db.patch(membership!._id, { role: "viewer" });
  });
  await expect(
    s.owner.mutation(api.assistantGrants.save, s.args),
  ).rejects.toThrow("permission");
  await s.t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    await ctx.db.patch(user!._id, { status: "deleting" });
  });
  await expect(
    s.owner.mutation(api.assistantGrants.save, s.args),
  ).rejects.toThrow("Account unavailable");
});
