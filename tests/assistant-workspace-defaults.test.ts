import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { assistantScopes } from "../packages/policy/assistant";
import { assistantGrant } from "../convex/lib/assistantPrincipal";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { postContextPageOutput } from "../packages/contracts/post-context";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function fixture() {
  const subject = "user_04234567890123456789012345",
    clientId = "client_04234567890123456789012345";
  for (const key of [
    "MCP_ENABLED",
    "WORK_CLOUD_MEDIA_ENABLED",
    "WORK_CLOUD_MEDIA_VERIFIED",
    "WORK_CLOUD_SAVED_LINKS_ENABLED",
    "WORK_CLOUD_SAVED_LINKS_VERIFIED",
    "MCP_EVENTS_ENABLED",
  ])
    vi.stubEnv(key, "true");
  vi.stubEnv("MCP_AUTH_ISSUER", "https://synthetic.authkit.app");
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", JSON.stringify([subject]));
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      { id: clientId, name: "Synthetic defaults", scopes: assistantScopes },
    ]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "defaults@example.test",
    name: "Defaults owner",
    verified: true,
  });
  const owner = t.withIdentity({ subject });
  const org = await owner.mutation(api.organizations.createPrivate, {});
  const identity = {
    subject,
    issuer: "https://synthetic.authkit.app",
    client_id: clientId,
    scope: assistantScopes.join(" "),
    sid: "app_consent_04234567890123456789012345",
  };
  const assistant = t.withIdentity(identity);
  const team = async (
    role: "owner" | "admin" | "member" | "viewer" = "member",
    individualPro = false,
  ) =>
    t.run(async (ctx) => {
      const id = await ctx.db.insert("organizations", {
        name: `${role} joined team`,
        status: "active",
        createdBy: actor,
        createdAt: Date.now(),
        ...(individualPro
          ? { memberSubscriptionPolicy: "individual_pro_v1" as const }
          : {}),
      });
      const membership = await ctx.db.insert("memberships", {
        organizationId: id,
        userId: actor,
        role,
      });
      return { id, membership };
    });
  const grant = (organizationId: Id<"organizations">, client = clientId) =>
    t.run((ctx) =>
      ctx.db
        .query("assistantGrants")
        .withIndex("by_pair", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("actor", actor)
            .eq("clientId", client),
        )
        .unique(),
    );
  const pro = () =>
    t.run(async (ctx) => {
      const now = Date.now(),
        end = now + 86400000,
        subscription = "synthetic-default-pro";
      const wallet = await ctx.db
        .query("wallets")
        .withIndex("by_org", (q) => q.eq("organizationId", org))
        .unique();
      if (wallet)
        await ctx.db.patch(wallet._id, { tier: "pro", periodEnd: end });
      else
        await ctx.db.insert("wallets", {
          organizationId: org,
          createdAt: now,
          updatedAt: now,
          granted: 300,
          purchased: 0,
          spent: 0,
          reserved: 0,
          periodEnd: end,
          tier: "pro",
          interval: "monthly",
        });
      const billing = await ctx.db.insert("billing", {
        organizationId: org,
        customerId: subscription,
        subscriptionId: subscription,
        status: "active",
        periodEnd: end,
        verifiedAt: now,
        revision: 1,
      });
      await ctx.db.insert("billingPeriods", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        key: subscription,
        start: now - 1000,
        end,
        credits: 300,
        subscription,
      });
      return billing;
    });
  return {
    t,
    owner,
    assistant,
    actor,
    org,
    subject,
    clientId,
    identity,
    team,
    grant,
    pro,
  };
}

it("creates ordinary personal and joined-team defaults once with role-appropriate scopes and no team execution defaults", async () => {
  const f = await fixture();
  const owner = await f.team("owner"),
    admin = await f.team("admin"),
    member = await f.team("member"),
    viewer = await f.team("viewer");
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  const personal = (await f.grant(f.org))!;
  expect(personal).toMatchObject({
    libraryScope: "all",
    expiresAt: null,
    contextScope: "all_confirmed",
    state: "active",
  });
  expect(personal.cloudSaveDefaults?.resultRetention).toBe("until_deleted");
  for (const team of [owner, admin, member, viewer]) {
    const grant = (await f.grant(team.id))!;
    expect(grant).toMatchObject({
      libraryScope: "all",
      expiresAt: null,
      contextScope: "all_confirmed",
      state: "active",
      sources: [],
      repositories: [],
    });
    expect(grant.cloudSaveDefaults).toBeUndefined();
    expect(grant.cloudRequestPolicy).toBeUndefined();
    expect(grant.analysisDefaults).toBeUndefined();
    if (team === viewer)
      expect(grant.scopes).toEqual([
        "knowledge:read",
        "context:read",
        "jobs:read",
        "events:subscribe",
      ]);
    else if (team === member)
      expect(grant.scopes).not.toContain("suggestions:draft");
    else expect(grant.scopes).toEqual(assistantScopes);
  }
  const before = await f.t.run((ctx) =>
    ctx.db.query("assistantGrants").collect(),
  );
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect(
    await f.t.run((ctx) => ctx.db.query("assistantGrants").collect()),
  ).toEqual(before);
});

it("never revives per-client revoked or expired grants or widens custom personal settings", async () => {
  const f = await fixture(),
    off = await f.team(),
    expired = await f.team();
  await f.owner.mutation(api.assistantGrants.save, {
    organizationId: f.org,
    clientId: f.clientId,
    sources: [],
    libraryScope: "personal",
    scopes: ["knowledge:read"],
    expectedVersion: 0,
    expiresAt: null,
    acknowledged: true,
  });
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  const offGrant = (await f.grant(off.id))!,
    expiredGrant = (await f.grant(expired.id))!;
  await f.owner.mutation(api.assistantGrants.revoke, {
    id: offGrant._id,
    expectedVersion: offGrant.version,
  });
  await f.t.run((ctx) =>
    ctx.db.patch(expiredGrant._id, { expiresAt: Date.now() - 1 }),
  );
  const before = await f.t.run((ctx) =>
    ctx.db.query("assistantGrants").collect(),
  );
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {
    organizationIds: [off.id, expired.id],
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("assistantGrants").collect()),
  ).toEqual(before);
  expect((await f.grant(f.org))?.libraryScope).toBe("personal");
  expect((await f.grant(f.org))?.scopes).toEqual(["knowledge:read"]);
  await expect(
    f.assistant.run((ctx) => assistantGrant(ctx, off.id, "knowledge:read")),
  ).rejects.toThrow(/FORBIDDEN/);
  await expect(
    f.assistant.run((ctx) => assistantGrant(ctx, expired.id, "knowledge:read")),
  ).rejects.toThrow(/FORBIDDEN/);
});

it("intersects configured client scopes with the actual token and keeps clients independent", async () => {
  const f = await fixture(),
    team = await f.team("owner");
  const limited = f.t.withIdentity({ ...f.identity, scope: "knowledge:read" });
  await limited.mutation(internal.assistantGrants.ensureDefaults, {});
  expect((await f.grant(team.id))?.scopes).toEqual(["knowledge:read"]);
  expect((await f.grant(team.id))?.contextScope).toBeUndefined();
  const second = "client_05234567890123456789012345";
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      { id: f.clientId, name: "Original", scopes: assistantScopes },
      { id: second, name: "Read client", scopes: ["knowledge:read"] },
    ]),
  );
  const secondIdentity = f.t.withIdentity({ ...f.identity, client_id: second });
  await secondIdentity.mutation(internal.assistantGrants.ensureDefaults, {});
  expect((await f.grant(team.id, second))?.scopes).toEqual(["knowledge:read"]);
  expect((await f.grant(team.id))?.version).toBe(1);
});

it("checks current individual Pro and membership rather than borrowing the team's subscription", async () => {
  const f = await fixture(),
    team = await f.team("member", true);
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect(await f.grant(team.id)).toBeNull();
  const billing = await f.pro();
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect((await f.grant(team.id))?.state).toBe("active");
  await f.assistant.run((ctx) =>
    assistantGrant(ctx, team.id, "knowledge:read"),
  );
  await f.t.run((ctx) => ctx.db.patch(billing, { status: "canceled" }));
  await expect(
    f.assistant.run((ctx) => assistantGrant(ctx, team.id, "knowledge:read")),
  ).rejects.toThrow(/own active Pro/);
  await f.t.run((ctx) => ctx.db.patch(billing, { status: "active" }));
  await f.t.run((ctx) => ctx.db.delete(team.membership));
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {
    organizationIds: [team.id],
  });
  await expect(
    f.assistant.run((ctx) => assistantGrant(ctx, team.id, "knowledge:read")),
  ).rejects.toThrow(/FORBIDDEN/);
});

it("does not copy personal posts or disclose another private workspace when creating team access", async () => {
  const f = await fixture(),
    team = await f.team();
  const privateSource = await f.owner.mutation(api.product.capture, {
    organizationId: f.org,
    key: "private-before-team-default",
    kind: "text",
    title: "Personal only",
    text: "Private library content",
    rightsAttested: true,
  });
  const personalSources = await f.t.run((ctx) =>
    ctx.db.query("sources").collect(),
  );
  const foreign = await f.t.run(async (ctx) => {
    const user = await ctx.db.insert("users", {
      subject: "user_06234567890123456789012345",
      email: "other@example.test",
      name: "Other",
      status: "active",
      createdAt: Date.now(),
    });
    const id = await ctx.db.insert("organizations", {
      name: "Other private account",
      status: "active",
      privateOwnerId: user,
      createdBy: user,
      createdAt: Date.now(),
    });
    await ctx.db.insert("memberships", {
      organizationId: id,
      userId: f.actor,
      role: "member",
    });
    return id;
  });
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {
    organizationIds: [foreign],
  });
  expect(await f.grant(foreign)).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.query("sources").collect())).toEqual(
    personalSources,
  );
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      profileId: team.id,
      id: privateSource,
      format: "structured_v1",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
});

it("creates one member default in a team with more than50 other grants without scanning or changing them", async () => {
  const f = await fixture(),
    team = await f.team();
  await f.t.run(async (ctx) => {
    for (let index = 0; index < 55; index++) {
      const member = await ctx.db.insert("users", {
        subject: `other-default-member-${index}`,
        email: `member-${index}@example.test`,
        name: `Member ${index}`,
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.insert("memberships", {
        organizationId: team.id,
        userId: member,
        role: "member",
      });
      await ctx.db.insert("assistantGrants", {
        organizationId: team.id,
        actor: member,
        clientId: f.clientId,
        sources: [],
        libraryScope: "all",
        repositories: [],
        scopes: ["knowledge:read"],
        version: 1,
        state: "active",
        expiresAt: null,
        updatedAt: Date.now(),
      });
    }
  });
  const before = await f.t.run((ctx) =>
    ctx.db
      .query("assistantGrants")
      .withIndex("by_org", (q) => q.eq("organizationId", team.id))
      .collect(),
  );
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect((await f.grant(team.id))?.state).toBe("active");
  const after = await f.t.run((ctx) =>
    ctx.db
      .query("assistantGrants")
      .withIndex("by_org", (q) => q.eq("organizationId", team.id))
      .collect(),
  );
  expect(after.filter((grant) => grant.actor !== f.actor)).toEqual(before);
});

it("keeps reads available when a partial token lacks the context dependency for suggestions", async () => {
  const f = await fixture(),
    team = await f.team("owner");
  const partial = f.t.withIdentity({
    ...f.identity,
    scope: "knowledge:read suggestions:draft",
  });
  await partial.mutation(internal.assistantGrants.ensureDefaults, {});
  expect((await f.grant(team.id))?.scopes).toEqual(["knowledge:read"]);
});

it("rechecks role changes even though default creation preserves existing grant rows", async () => {
  const f = await fixture(),
    team = await f.team("owner");
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  const before = (await f.grant(team.id))!;
  expect(before.scopes).toContain("links:save");
  await f.t.run((ctx) => ctx.db.patch(team.membership, { role: "viewer" }));
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect(await f.grant(team.id)).toEqual(before);
  await expect(
    f.assistant.run((ctx) => assistantGrant(ctx, team.id, "links:save")),
  ).rejects.toThrow(/FORBIDDEN/);
  await f.assistant.run((ctx) =>
    assistantGrant(ctx, team.id, "knowledge:read"),
  );
});

it("bounds discovery and can provision an explicitly selected joined workspace outside its first10 memberships", async () => {
  const f = await fixture();
  const teams = [];
  for (let index = 0; index < 13; index++) teams.push(await f.team());
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect(await f.grant(teams[12].id)).toBeNull();
  expect(
    await f.t.run((ctx) => ctx.db.query("assistantGrants").collect()),
  ).toHaveLength(10);
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {
    organizationIds: [teams[12].id],
  });
  expect((await f.grant(teams[12].id))?.state).toBe("active");
  await expect(
    f.assistant.mutation(internal.assistantGrants.ensureDefaults, {
      organizationIds: teams.slice(0, 4).map((team) => team.id),
    }),
  ).rejects.toThrow(/INVALID_INPUT/);
});

it("keeps implicit read, status, proposal and widget selection on the app default after joined-team defaults appear", async () => {
  const f = await fixture(),
    team = await f.team("owner");
  const personal = await f.owner.mutation(api.product.capture, {
    organizationId: f.org,
    key: "default-read-personal",
    kind: "text",
    title: "Personal needle",
    text: "Personal data",
    rightsAttested: true,
  });
  const shared = await f.owner.mutation(api.product.capture, {
    organizationId: team.id,
    key: "default-read-team",
    kind: "text",
    title: "Team needle",
    text: "Shared team data",
    rightsAttested: true,
  });
  await f.owner.mutation(api.organizations.ensureDefault, {
    preferredId: f.org,
  });
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  const summary = await f.assistant.query(internal.assistant.fetch, {
    id: personal,
    format: "structured_v1",
  });
  expect(summary.profile_id).toBe(f.org);
  const status = await f.assistant.query(internal.assistant.getJobStatus, {
    sourceId: personal,
  });
  expect(status.profile_id).toBe(f.org);
  const proposals = await f.assistant.query(internal.assistantProposals.list, {
    detail: "summary",
  });
  expect(proposals.items).toEqual([]);
  expect(proposals.examined).toBe(0);
  const widget = await f.assistant.query(internal.assistantWidget.state, {});
  expect(widget.profile_id).toBe(f.org);
  vi.stubEnv("WORKSPACE_SEARCH_ENABLED", "true");
  vi.stubEnv("WORKSPACE_SEARCH_CURSOR_SECRET", "c".repeat(64));
  for (const organizationId of [f.org, team.id]) {
    for (let page = 0; page < 4; page++) {
      if (
        (
          await f.t.mutation(internal.workspaceSearch.bootstrap, {
            organizationId,
          })
        ).done
      )
        break;
    }
  }
  const ranked = await f.assistant.action(
    internal.workspaceSearchActions.search,
    {
      query: "needle",
    },
  );
  expect(ranked.profile_id).toBe(f.org);
  expect(ranked.posts.map(({ reference }) => reference.sourceId)).toEqual([
    personal,
  ]);
  expect(ranked.posts.map(({ reference }) => reference.sourceId)).not.toContain(
    shared,
  );
  expect(ranked.workspaces).toBeUndefined();
  const filtered = await f.assistant.action(
    internal.workspaceSearchActions.search,
    {
      query: "needle",

      filters: { platforms: ["text"] },
    },
  );
  expect(filtered.profile_id).toBe(f.org);
  expect(filtered.workspaces).toBeUndefined();
  await f.t.run((ctx) =>
    ctx.db.patch(f.actor, { defaultWorkspaceId: undefined }),
  );
  await expect(
    f.assistant.action(internal.workspaceSearchActions.search, {
      query: "needle",
    }),
  ).rejects.toThrow(/PROFILE_SELECTION_REQUIRED/);
  await expect(
    f.assistant.query(internal.assistantProposals.list, { detail: "summary" }),
  ).rejects.toThrow(/PROFILE_SELECTION_REQUIRED/);
  await expect(
    f.assistant.query(internal.assistantWidget.state, {}),
  ).resolves.toMatchObject({ profile_id: f.org, selection_reason: "personal" });
  await expect(
    f.assistant.query(internal.assistant.getJobStatus, { sourceId: personal }),
  ).rejects.toThrow(/PROFILE_SELECTION_REQUIRED/);
});

it("uses the same app default for whole-post context and ordinary frame authorization", async () => {
  vi.useFakeTimers();
  const f = await analysisVersionFixture();
  await f.request();
  await f.owner.mutation(api.organizations.create, {
    name: "Second context workspace",
  });
  await f.owner.mutation(api.organizations.ensureDefault, {
    preferredId: f.org,
  });
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  const page = postContextPageOutput.parse(
    await f.assistant.query(internal.assistant.fetch, {
      id: f.sourceId,
      format: "post_context_v1",
    }),
  );
  expect(page.profile_id).toBe(f.org);
  const frame = await f.assistant.query(internal.postContext.frameContext, {
    sourceId: f.sourceId,
    analysisVersionId: page.context.analysisVersionId as Id<"analysisVersions">,
    frameId: "frame-1",
    expectedEvidenceHash: page.context.evidenceHash,
  });
  expect(frame.sourceId).toBe(f.sourceId);
});
