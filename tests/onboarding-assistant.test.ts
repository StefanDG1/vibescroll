import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { assistantScopes } from "../packages/policy/assistant";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture(paid = true) {
  const subject = "user_07234567890123456789012345",
    clientId = "client_07234567890123456789012345";
  vi.stubEnv("ONBOARDING_ENABLED", "true");
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("MCP_AUTH_ISSUER", "https://synthetic.authkit.app");
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      { id: clientId, name: "Owned test client", scopes: assistantScopes },
    ]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const userId = await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "onboarding@example.test",
    name: "Test",
    verified: true,
  });
  const owner = t.withIdentity({ subject });
  const org = await owner.mutation(api.organizations.createPrivate, {});
  await owner.mutation(api.onboarding.save, {
    draft: {
      version: 1,
      goal: "improve_product",
      interests: ["coding"],
      workStage: "existing",
      obstacle: "apply",
      projectDescription: "Owned project",
    },
  });
  if (paid)
    await t.run(async (ctx) => {
      const now = Date.now(),
        end = now + 86400000;
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
      await ctx.db.insert("billing", {
        organizationId: org,
        customerId: "owned-test",
        subscriptionId: "owned-test",
        status: "active",
        periodEnd: end,
        verifiedAt: now,
        revision: 1,
      });
      await ctx.db.insert("billingPeriods", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        key: "owned-test-period",
        start: now - 1000,
        end,
        credits: 300,
        subscription: "owned-test",
      });
    });
  const assistant = t.withIdentity({
    subject,
    issuer: "https://synthetic.authkit.app",
    client_id: clientId,
    scope: assistantScopes.join(" "),
    sid: "app_consent_07234567890123456789012345",
  });
  return { t, owner, assistant, org, userId };
}

it("allows connect later before Pro and preserves the quiz without inventing connection readiness", async () => {
  const f = await fixture(false);
  await f.owner.mutation(api.onboarding.chooseAssistant, { choice: "later" });
  expect(await f.owner.query(api.onboarding.assistantStatus, {})).toMatchObject(
    {
      ready: false,
      client: null,
    },
  );
  expect(
    (await f.owner.query(api.onboarding.status, {})).progress,
  ).toMatchObject({
    stage: "github",
    assistantChoice: "later",
    workStage: "existing",
    obstacle: "apply",
    projectDescription: "Owned project",
  });
  await expect(
    f.owner.mutation(api.onboarding.chooseAssistant, { choice: "connected" }),
  ).rejects.toThrow(/Check the connection/);
  await expect(
    f.assistant.mutation(internal.onboarding.recordAssistantConnection, {}),
  ).rejects.toThrow(/Pro checkout/);
});
it("records a current authenticated profile check once with no processing or credit charge", async () => {
  const f = await fixture();
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect((await f.owner.query(api.onboarding.assistantStatus, {})).ready).toBe(
    false,
  );
  await f.assistant.query(internal.assistant.getProfile, { detail: "summary" });
  await f.assistant.mutation(internal.onboarding.recordAssistantConnection, {});
  const first = (await f.owner.query(api.onboarding.status, {})).progress!;
  expect(first.assistantChoice).toBe("connected");
  expect(await f.owner.query(api.onboarding.assistantStatus, {})).toMatchObject(
    {
      ready: true,
      client: "Owned test client",
    },
  );
  await f.assistant.mutation(internal.onboarding.recordAssistantConnection, {});
  expect(
    (await f.owner.query(api.onboarding.status, {})).progress
      ?.assistantConnection,
  ).toEqual(first.assistantConnection);
  const wallet = await f.t.run((ctx) =>
    ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", f.org))
      .unique(),
  );
  expect(wallet).toMatchObject({ spent: 0, reserved: 0 });
});
it("a revoked or changed grant invalidates the observed status without reviving it", async () => {
  const f = await fixture();
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  await f.assistant.mutation(internal.onboarding.recordAssistantConnection, {});
  const proof = (await f.owner.query(api.onboarding.status, {})).progress!
    .assistantConnection!;
  await f.t.run((ctx) =>
    ctx.db.patch(proof.grantId, {
      state: "revoked",
      version: proof.grantVersion + 1,
    }),
  );
  expect((await f.owner.query(api.onboarding.assistantStatus, {})).ready).toBe(
    false,
  );
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect(
    await f.assistant.mutation(
      internal.onboarding.recordAssistantConnection,
      {},
    ),
  ).toBeNull();
  expect((await f.t.run((ctx) => ctx.db.get(proof.grantId)))?.state).toBe(
    "revoked",
  );
});
it("current membership loss invalidates a previously verified connection", async () => {
  const f = await fixture();
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  await f.assistant.mutation(internal.onboarding.recordAssistantConnection, {});
  await f.t.run(async (ctx) => {
    const row = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", f.org).eq("userId", f.userId),
      )
      .unique();
    await ctx.db.delete(row!._id);
  });
  expect((await f.owner.query(api.onboarding.assistantStatus, {})).ready).toBe(
    false,
  );
});
it("an expired subscription invalidates readiness while keeping the saved connection receipt", async () => {
  const f = await fixture();
  await f.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  await f.assistant.mutation(internal.onboarding.recordAssistantConnection, {});
  const proof = (await f.owner.query(api.onboarding.status, {})).progress!
    .assistantConnection;
  await f.t.run(async (ctx) => {
    const billing = await ctx.db
      .query("billing")
      .withIndex("by_org", (q) => q.eq("organizationId", f.org))
      .unique();
    await ctx.db.patch(billing!._id, { periodEnd: Date.now() - 1000 });
  });
  expect((await f.owner.query(api.onboarding.assistantStatus, {})).ready).toBe(
    false,
  );
  expect(
    (await f.owner.query(api.onboarding.status, {})).progress!
      .assistantConnection,
  ).toEqual(proof);
});
