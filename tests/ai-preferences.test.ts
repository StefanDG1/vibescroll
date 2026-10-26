import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
it("does not advertise hosted media after its verified free-plan boundary expires", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.accounts.syncUser, {
    subject: "synthetic-plan-expiry",
    email: "plan@example.test",
    name: "Synthetic",
  });
  const user = t.withIdentity({ subject: "synthetic-plan-expiry" });
  const org = await user.mutation(api.organizations.create, {
    name: "Synthetic verified plan",
  });
  vi.stubEnv("MANAGED_INFERENCE_ROUTE", "cloudflare_free");
  vi.stubEnv("DISABLE_INFERENCE", "false");
  vi.stubEnv("MEDIA_VERIFIED", "true");
  vi.stubEnv("HOSTED_MEDIA_ANALYSIS_VERIFIED", "false");
  vi.stubEnv("ACQUISITION_VERIFIED", "true");
  vi.stubEnv("CLOUDFLARE_AI_TOKEN", "synthetic-token");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "synthetic-account");
  vi.stubEnv("CLOUDFLARE_FREE_PLAN_VERIFIED_AT", new Date().toISOString());
  expect(
    (await user.query(api.aiPreferences.read, { organizationId: org }))
      .cloudAnalysisEnabled,
  ).toBe(false);
  vi.stubEnv("HOSTED_MEDIA_ANALYSIS_VERIFIED", "true");
  vi.stubEnv("HOSTED_MEDIA_PUBLIC_RELEASE_APPROVED", "true");
  expect(
    (await user.query(api.aiPreferences.read, { organizationId: org }))
      .cloudAnalysisEnabled,
  ).toBe(true);
  for (const stamp of [
    new Date(Date.now() - 86400001).toISOString(),
    new Date(Date.now() + 60000).toISOString(),
    "invalid",
    "",
  ]) {
    vi.stubEnv("CLOUDFLARE_FREE_PLAN_VERIFIED_AT", stamp);
    const status = await user.query(api.aiPreferences.read, {
      organizationId: org,
    });
    expect(status.cloudAnalysisEnabled).toBe(false);
    // Public acquisition also prepares media for the independently authorized
    // laptop route, which does not consume Workers AI inference.
    expect(status.linkAnalysisEnabled).toBe(true);
    expect(JSON.stringify(status)).not.toContain("synthetic-token");
  }
  vi.stubEnv("CLOUDFLARE_FREE_PLAN_VERIFIED_AT", new Date().toISOString());
  vi.stubEnv("DISABLE_INFERENCE", "true");
  expect(
    (await user.query(api.aiPreferences.read, { organizationId: org }))
      .cloudAnalysisEnabled,
  ).toBe(false);
});
it("keeps plan preference personal, off by default and independent of hosted authorization", async () => {
  const t = convexTest(schema, modules);
  for (const subject of ["preference-alice", "preference-bob"])
    await t.mutation(internal.accounts.syncUser, {
      subject,
      email: `${subject}@example.test`,
      name: subject,
    });
  const alice = t.withIdentity({ subject: "preference-alice" }),
    bob = t.withIdentity({ subject: "preference-bob" });
  const a = await alice.mutation(api.organizations.create, {
      name: "Preference A",
    }),
    b = await bob.mutation(api.organizations.create, { name: "Preference B" });
  expect(
    await alice.query(api.aiPreferences.read, { organizationId: a }),
  ).toEqual({
    preferChatGPTPlan: false,
    hostedStatus: "awaiting_commercial_access",
    active: false,
    personalAlphaEnabled: false,
    orderedPersonalAnalysisEnabled: false,
    linkAnalysisEnabled: false,
    cloudAnalysisEnabled: false,
    processingRoute: null,
  });
  await expect(
    bob.mutation(api.aiPreferences.save, {
      organizationId: a,
      preferChatGPTPlan: true,
    }),
  ).rejects.toThrow("Organization unavailable");
  await alice.mutation(api.aiPreferences.save, {
    organizationId: a,
    preferChatGPTPlan: true,
  });
  expect(
    (await alice.query(api.aiPreferences.read, { organizationId: a })).active,
  ).toBe(false);
  expect(
    (await alice.query(api.accounts.exportAccount, {})).profile
      .preferChatGPTPlan,
  ).toBe(true);
  expect(
    (await bob.query(api.aiPreferences.read, { organizationId: b }))
      .preferChatGPTPlan,
  ).toBe(false);
  await alice.mutation(api.aiPreferences.save, {
    organizationId: a,
    preferChatGPTPlan: false,
  });
  expect(
    (await alice.query(api.aiPreferences.read, { organizationId: a }))
      .preferChatGPTPlan,
  ).toBe(false);
});
