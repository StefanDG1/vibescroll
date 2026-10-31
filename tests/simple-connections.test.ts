import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { assistantScopes } from "../packages/policy/assistant";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const subject = "user_03234567890123456789012345",
    clientId = "client_03234567890123456789012345";
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
      { id: clientId, name: "Synthetic ChatGPT", scopes: assistantScopes },
    ]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "setup@example.test",
    name: "Synthetic setup owner",
    verified: true,
  });
  const owner = t.withIdentity({ subject }); // No recent-auth claim for ordinary setup.
  const org = await owner.mutation(api.organizations.createPrivate, {});
  const assistant = t.withIdentity({
    subject,
    issuer: "https://synthetic.authkit.app",
    client_id: clientId,
    scope: assistantScopes.join(" "),
    sid: "app_consent_03234567890123456789012345",
  });
  return { t, org, owner, assistant, subject, clientId };
}
it("bootstraps OAuth-authorized ordinary access once without reviving a disconnected grant", async () => {
  const s = await fixture();
  await s.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  const setup = await s.owner.query(api.assistantGrants.setup, {
    organizationId: s.org,
  });
  const grant = setup.grants[0];
  expect(grant.libraryScope).toBe("all");
  expect(grant.scopes).toEqual(assistantScopes);
  expect(grant.contextScope).toBe("all_confirmed");
  expect(grant.expiresAt).toBeNull();
  expect(grant.cloudSaveDefaults?.resultRetention).toBe("until_deleted");
  expect(grant.cloudSaveDefaults?.version).toBe("link-save-cloud-v2");
  await s.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect(
    (await s.owner.query(api.assistantGrants.setup, { organizationId: s.org }))
      .grants[0].version,
  ).toBe(grant.version);
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: grant.id,
    expectedVersion: grant.version,
  });
  await s.assistant.mutation(internal.assistantGrants.ensureDefaults, {});
  expect(
    (await s.owner.query(api.assistantGrants.setup, { organizationId: s.org }))
      .grants[0].state,
  ).toBe("revoked");
});
it("uses one Continue without per-action approval and keeps an identical grant version stable", async () => {
  const s = await fixture();
  const input = {
    organizationId: s.org,
    clientId: s.clientId,
    expectedVersion: 0,
    route: "work_cloud" as const,
    model: "gpt-6.1-sol",
    effort: "high" as const,
  };
  const first = await s.owner.mutation(
    api.assistantGrants.continueSetup,
    input,
  );
  const second = await s.owner.mutation(api.assistantGrants.continueSetup, {
    ...input,
    expectedVersion: first.version,
  });
  expect(second).toEqual(first);
  await expect(
    s.owner.mutation(api.assistantGrants.continueSetup, {
      ...input,
      route: "local",
      expectedVersion: first.version,
    }),
  ).rejects.toThrow(/SETUP_REQUIRED/);
  expect(
    (await s.owner.query(api.assistantGrants.setup, { organizationId: s.org }))
      .grants[0].cloudSaveDefaults?.resultRetention,
  ).toBe("until_deleted");
});
it("cannot bootstrap scopes the actual OAuth token did not grant or use a web session as OAuth", async () => {
  const s = await fixture();
  await expect(
    s.owner.mutation(internal.assistantGrants.ensureDefaults, {}),
  ).rejects.toThrow(/FORBIDDEN/);
  const limited = s.t.withIdentity({
    subject: s.subject,
    issuer: "https://synthetic.authkit.app",
    client_id: s.clientId,
    scope: "knowledge:read",
    sid: "app_consent_03234567890123456789012345",
  });
  await limited.mutation(internal.assistantGrants.ensureDefaults, {});
  const grant = (
    await s.owner.query(api.assistantGrants.setup, { organizationId: s.org })
  ).grants[0];
  expect(grant.scopes).toEqual(["knowledge:read"]);
  expect(grant.cloudSaveDefaults).toBeUndefined();
  await expect(
    limited.query(internal.assistant.getProfile, { profileId: s.org }),
  ).rejects.toThrow(/FORBIDDEN/);
});
