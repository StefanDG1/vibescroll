import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  onboardingDraft,
  previewClaim,
  readOnboardingValue,
  signOnboardingValue,
  starterScore,
} from "../packages/onboarding/journey";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const draft = {
  version: 1 as const,
  interests: ["coding" as const],
  goal: "build_faster" as const,
};
async function account(enabled = true) {
  if (enabled) vi.stubEnv("ONBOARDING_ENABLED", "true");
  const t = convexTest(schema, modules);
  const id = await t.mutation(internal.accounts.syncUser, {
    subject: "new-onboarding-user",
    email: "new@example.test",
    name: "New user",
    verified: true,
  });
  const actor = t.withIdentity({ subject: "new-onboarding-user" });
  const org = await actor.mutation(api.organizations.createPrivate, {});
  return { t, id, actor, org };
}
it("keeps old accounts outside onboarding even after the feature is enabled", async () => {
  const f = await account(false);
  vi.stubEnv("ONBOARDING_ENABLED", "true");
  await f.t.mutation(internal.accounts.syncUser, {
    subject: "new-onboarding-user",
    email: "new@example.test",
    name: "New user",
    verified: true,
  });
  expect(await f.actor.query(api.onboarding.status, {})).toMatchObject({
    legacy: true,
    progress: null,
  });
  await expect(
    f.actor.query(api.product.repositories, { organizationId: f.org }),
  ).resolves.toEqual([]);
});
it("persists the quiz before optional GitHub and resumes the same unpaid account at the paywall", async () => {
  const f = await account();
  expect(await f.actor.query(api.onboarding.status, {})).toMatchObject({
    legacy: false,
    paid: false,
    progress: { stage: "quiz" },
  });
  await f.actor.mutation(api.onboarding.save, { draft });
  await f.actor.mutation(api.onboarding.chooseProject, {
    organizationId: f.org,
  });
  const secondSession = f.t.withIdentity({ subject: "new-onboarding-user" });
  await f.actor.mutation(api.onboarding.selectPlan, { interval: "annual" });
  expect(await secondSession.query(api.onboarding.status, {})).toMatchObject({
    paid: false,
    progress: {
      stage: "paywall",
      interests: ["coding"],
      goal: "build_faster",
      interval: "annual",
    },
  });
  await secondSession.mutation(api.onboarding.save, { draft });
  expect(
    (await secondSession.query(api.onboarding.status, {})).progress?.stage,
  ).toBe("paywall");
});
it("allows unpaid GitHub and billing setup but blocks ordinary direct workspace and capture access", async () => {
  const f = await account();
  await expect(
    f.actor.mutation(api.githubLinks.begin, { organizationId: f.org }),
  ).resolves.toEqual(expect.any(String));
  await expect(
    f.actor.query(api.githubLinks.choices, { organizationId: f.org }),
  ).resolves.toEqual([]);
  await expect(
    f.actor.query(api.billing.authorize, { organizationId: f.org }),
  ).resolves.toMatchObject({ personal: true });
  await expect(f.actor.query(internal.billing.processingAvailable, { organizationId: f.org, requirePro: false })).resolves.toBe(false);
  await expect(f.actor.query(internal.billing.processingAvailable, { organizationId: f.org, requirePro: true })).rejects.toThrow(/Pro/);
  await expect(
    f.actor.query(api.product.repositories, { organizationId: f.org }),
  ).rejects.toThrow(/Pro/);
  await expect(
    f.actor.mutation(api.product.capture, {
      organizationId: f.org,
      key: "unpaid-capture-attempt",
      kind: "url",
      url: "https://www.instagram.com/reel/AbCdEfG1234/",
      title: "No free analysis",
      rightsAttested: true,
    }),
  ).rejects.toThrow(/Pro/);
  await expect(f.actor.mutation(api.onboarding.complete, {})).rejects.toThrow();
  await expect(f.actor.query(api.accounts.current, {})).resolves.toMatchObject({
    user: { email: "new@example.test" },
  });
});
it("validates repository choices against this account's current GitHub bindings", async () => {
  const f = await account();
  await f.actor.mutation(api.onboarding.save, { draft });
  await f.t.run((ctx) =>
    ctx.db.insert("githubBindings", {
      organizationId: f.org,
      githubUserId: 7,
      installationId: 8,
      repositories: [{ id: 9, fullName: "owner/project" }],
      status: "connected",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await expect(
    f.actor.mutation(api.onboarding.chooseProject, {
      organizationId: f.org,
      repositoryId: 10,
    }),
  ).rejects.toThrow(/connected repository/);
  await f.actor.mutation(api.onboarding.chooseProject, {
    organizationId: f.org,
    repositoryId: 9,
  });
  expect(
    (await f.actor.query(api.onboarding.status, {})).progress?.repository,
  ).toEqual({ id: 9, fullName: "owner/project", installationId: 8 });
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("githubBindings").first();
    await ctx.db.patch(row!._id, { status: "revoked" });
  });
  await expect(
    f.actor.mutation(api.onboarding.chooseProject, {
      organizationId: f.org,
      repositoryId: 9,
    }),
  ).rejects.toThrow(/connected repository/);
});
it("unlocks only after verified Pro, and fails closed again when the provider period expires", async () => {
  const f = await account();
  await f.actor.mutation(api.onboarding.save, { draft });
  await f.actor.mutation(api.onboarding.chooseProject, {
    organizationId: f.org,
  });
  const now = Date.now(),
    end = now + 86400000;
  await f.t.run(async (ctx) => {
    await ctx.db.insert("wallets", {
      organizationId: f.org,
      createdAt: now,
      updatedAt: now,
      granted: 300,
      spent: 0,
      reserved: 0,
      purchased: 0,
      periodEnd: end,
      tier: "pro",
      interval: "monthly",
    });
    await ctx.db.insert("billing", {
      organizationId: f.org,
      customerId: "fixture-customer",
      subscriptionId: "fixture-sub",
      status: "active",
      periodEnd: end,
      verifiedAt: now,
      revision: 1,
    });
  });
  expect((await f.actor.query(api.onboarding.status, {})).paid).toBe(false);
  await f.t.run((ctx) =>
    ctx.db.insert("billingPeriods", {
      organizationId: f.org,
      createdAt: now,
      updatedAt: now,
      key: "fixture-period",
      start: now - 1,
      end,
      credits: 300,
      subscription: "fixture-sub",
    }),
  );
  expect((await f.actor.query(api.onboarding.status, {})).paid).toBe(true);
  await f.actor.mutation(api.onboarding.complete, {});
  await f.actor.mutation(api.onboarding.complete, {});
  expect((await f.actor.query(api.onboarding.status, {})).progress?.stage).toBe(
    "complete",
  );
  await expect(
    f.actor.query(api.product.repositories, { organizationId: f.org }),
  ).resolves.toEqual([]);
  await f.t.run(async (ctx) => {
    const billing = await ctx.db.query("billing").first();
    await ctx.db.patch(billing!._id, { status: "canceled" });
  });
  expect((await f.actor.query(api.onboarding.status, {})).paid).toBe(false);
  await expect(
    f.actor.query(api.product.repositories, { organizationId: f.org }),
  ).rejects.toThrow(/Pro/);
});
it("does not let an unrelated workspace or client token manufacture onboarding access", async () => {
  const f = await account();
  await f.actor.mutation(api.onboarding.save, { draft });
  const otherId = await f.t.mutation(internal.accounts.syncUser, {
    subject: "other",
    email: "other@example.test",
    name: "Other",
  });
  const otherOrg = await f.t.run((ctx) =>
    ctx.db.insert("organizations", {
      name: "Other",
      privateOwnerId: otherId,
      createdBy: otherId,
      status: "active",
      createdAt: Date.now(),
    }),
  );
  await expect(
    f.actor.mutation(api.onboarding.chooseProject, {
      organizationId: otherOrg,
    }),
  ).rejects.toThrow(/Organization unavailable/);
  await expect(
    f.actor.mutation(api.onboarding.save, { draft: { ...draft, paid: true } }),
  ).rejects.toThrow();
  await expect(
    f.actor.mutation(api.onboarding.save, {
      draft: { ...draft, interests: ["coding", "coding"] },
    }),
  ).rejects.toThrow();
});
it("does not bypass payment through an authenticated MCP connection", async () => {
  const f = await account();
  const subject = "user_33333333333333333333333333",
    clientId = "client_33333333333333333333333333";
  await f.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "mcp-new@example.test",
    name: "MCP user",
    verified: true,
  });
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("MCP_AUTH_ISSUER", "https://fixture.authkit.app");
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      {
        id: clientId,
        name: "Test MCP",
        scopes: ["knowledge:read", "context:read", "links:save"],
      },
    ]),
  );
  const assistant = f.t.withIdentity({
    subject,
    issuer: "https://fixture.authkit.app",
    client_id: clientId,
    scope: "knowledge:read context:read links:save",
    sid: "app_consent_" + "a".repeat(24),
  });
  await expect(
    assistant.query(internal.assistant.getProfile, {}),
  ).rejects.toThrow(/Complete Pro checkout/);
});
it("starts onboarding when a newly-created webhook identity first verifies after launch", async () => {
  const f = await account(false);
  vi.stubEnv("ONBOARDING_ENABLED", "true");
  vi.stubEnv("ONBOARDING_LAUNCH_AT", String(Date.now() - 1000));
  const id = await f.t.mutation(internal.accounts.syncUser, {
    subject: "webhook-new",
    email: "webhook@example.test",
    name: "Webhook user",
  });
  await f.t.mutation(internal.accounts.syncUser, {
    subject: "webhook-new",
    email: "webhook@example.test",
    name: "Webhook user",
    verified: true,
  });
  expect((await f.t.run((ctx) => ctx.db.get(id)))?.onboarding?.stage).toBe(
    "quiz",
  );
  expect((await f.actor.query(api.onboarding.status, {})).legacy).toBe(true);
});
it("authenticates preview claims and keeps thumbnail authority separate from full insight access", async () => {
  const secret = "synthetic-test-key-that-is-not-a-credential";
  const value = {
    version: 1,
    familyId: "familyfixture123",
    kind: "thumbnail",
    session: crypto.randomUUID(),
    expiresAt: Date.now() + 60000,
  };
  const token = await signOnboardingValue(value, secret);
  expect(previewClaim.parse(await readOnboardingValue(token, secret))).toEqual(
    value,
  );
  expect(await readOnboardingValue(token + "x", secret)).toBeNull();
  expect(await readOnboardingValue(token, secret + "changed")).toBeNull();
  expect(await readOnboardingValue("a".repeat(6001), secret)).toBeNull();
  expect(starterScore(["coding", "ai"], ["coding"])).toBe(1);
  expect(onboardingDraft.safeParse({ ...draft, interests: [] }).success).toBe(
    false,
  );
});
