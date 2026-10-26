import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { prerequisiteIds } from "../packages/onboarding/preflight-report";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject: "setup-fixture",
    email: "setup@example.test",
    name: "Synthetic setup",
  });
  const client = t.withIdentity({ subject: "setup-fixture" });
  const org = await client.mutation(api.organizations.createPrivate, {});
  return { t, client, org };
}
it("resumes explicit route and optional reviews without inventing local readiness or granting work", async () => {
  const { t, client, org } = await fixture();
  const empty = await client.query(api.setupJourney.status, {
    organizationId: org,
  });
  expect(empty?.snapshot).toMatchObject({
    purposeSaved: false,
    paired: false,
    accountConnected: false,
    workerAvailable: false,
    sampleCited: false,
    startupEnabled: false,
  });
  await expect(
    client.mutation(api.setupJourney.save, {
      organizationId: org,
      expectedVersion: 0,
      route: "cloud",
    }),
  ).rejects.toThrow();
  await client.mutation(api.librarySpaces.saveSetup, {
    organizationId: org,
    expectedVersion: 0,
    focus: ["personal"],
    goal: "Keep useful source evidence",
    interests: [],
    role: "",
    connectSpaces: false,
    confirmed: true,
    stage: 2,
  });
  await client.mutation(api.setupJourney.save, {
    organizationId: org,
    expectedVersion: 1,
    route: "save_only",
    importReviewed: true,
  });
  const resumed = await client.query(api.setupJourney.status, {
    organizationId: org,
  });
  expect(resumed).toMatchObject({
    version: 2,
    snapshot: {
      purposeSaved: true,
      route: "save_only",
      importReviewed: true,
      preferencesReviewed: false,
      sampleCited: false,
      assistantReviewed: false,
    },
  });
  expect(
    (await client.query(api.aiPreferences.read, { organizationId: org }))
      .processingRoute,
  ).toBe("save_only");
  await expect(
    client.mutation(api.setupJourney.save, {
      organizationId: org,
      expectedVersion: 1,
      route: "local",
    }),
  ).rejects.toThrow();
  const counts = await t.run(async (ctx) => ({
    grants: (await ctx.db.query("assistantGrants").collect()).length,
    sources: (await ctx.db.query("sources").collect()).length,
    reservations: (await ctx.db.query("reservations").collect()).length,
  }));
  expect(counts).toEqual({ grants: 0, sources: 0, reservations: 0 });
  const report = {
    version: 1,
    kind: "local_prerequisites",
    readyForLocalStart: true,
    processingReady: "unverified",
    checks: prerequisiteIds.map((id) => ({ id, status: "passed" })),
    limits: [],
  };
  await client.mutation(api.setupJourney.save, {
    organizationId: org,
    expectedVersion: 2,
    preflightReport: report,
  });
  expect(
    await client.query(api.setupJourney.status, { organizationId: org }),
  ).toMatchObject({
    localPreflight: {
      provenance: "user_provided",
      passed: true,
      processingReady: "unverified",
    },
    snapshot: {
      prerequisitesChecked: true,
      sampleCited: false,
      paired: false,
      startupEnabled: false,
    },
  });
  await expect(
    client.mutation(api.setupJourney.save, {
      organizationId: org,
      expectedVersion: 3,
      preflightReport: {
        ...report,
        checks: report.checks.map((c, index) =>
          index === 0 ? { ...c, status: "blocked" } : c,
        ),
      },
    }),
  ).rejects.toThrow();
});
it("denies another actor's private setup and accepts no client readiness claims", async () => {
  const { t, org } = await fixture();
  await t.mutation(internal.accounts.syncUser, {
    subject: "setup-other",
    email: "setup-other@example.test",
    name: "Other fixture",
  });
  const other = t.withIdentity({ subject: "setup-other" });
  await expect(
    other.query(api.setupJourney.status, { organizationId: org }),
  ).rejects.toThrow();
  await expect(
    other.mutation(api.setupJourney.save, {
      organizationId: org,
      expectedVersion: 0,
      preferencesReviewed: true,
    }),
  ).rejects.toThrow();
});
it("persists connection prerequisites without certifying processing and expires the acknowledgement", async () => {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://setup-fixture.convex.cloud");
  vi.stubEnv("CONVEX_SITE_URL", "https://setup-fixture.convex.site");
  const { t, client, org } = await fixture();
  await client.mutation(api.librarySpaces.saveSetup, {
    organizationId: org,
    expectedVersion: 0,
    focus: ["personal"],
    goal: "Keep useful source evidence",
    interests: [],
    role: "",
    connectSpaces: false,
    confirmed: true,
    stage: 2,
  });
  await client.mutation(api.setupJourney.save, {
    organizationId: org,
    expectedVersion: 1,
    preflightReport: {
      version: 1,
      kind: "local_prerequisites",
      readyForLocalStart: false,
      readyToConnect: true,
      processingReady: "unverified",
      checks: prerequisiteIds.map((id) => ({
        id,
        status: id === "saved_account" ? "blocked" : "passed",
      })),
      limits: [],
    },
  });
  expect(
    await client.query(api.setupJourney.status, { organizationId: org }),
  ).toMatchObject({
    pairingConfiguration: {
      server: "https://setup-fixture.convex.site/",
      workspaceId: org,
      credentialVaultAdapter: "windows-credential-manager",
    },
    localPreflight: {
      readyToConnect: true,
      passed: false,
      processingReady: "unverified",
    },
    snapshot: {
      connectionPrerequisitesChecked: true,
      prerequisitesChecked: false,
      accountConnected: false,
      workerAvailable: false,
      sampleCited: false,
    },
  });
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
  expect(
    await client.query(api.setupJourney.status, { organizationId: org }),
  ).toMatchObject({
    snapshot: {
      connectionPrerequisitesChecked: false,
      prerequisitesChecked: false,
    },
  });
  expect(
    await t.run(async (ctx) => ({
      grants: (await ctx.db.query("assistantGrants").collect()).length,
      sources: (await ctx.db.query("sources").collect()).length,
      reservations: (await ctx.db.query("reservations").collect()).length,
    })),
  ).toEqual({ grants: 0, sources: 0, reservations: 0 });
  vi.stubEnv("CONVEX_SITE_URL", "https://different.convex.site");
  expect(
    await client.query(api.setupJourney.status, { organizationId: org }),
  ).toMatchObject({ pairingConfiguration: null });
});
it.each([
  ["off", { WORK_CLOUD_TEXT_ENABLED: "false" }, "unavailable"],
  ["unverified policy", { WORK_CLOUD_TEXT_VERIFIED: "false" }, "unavailable"],
  ["inference disabled", { DISABLE_INFERENCE: "true" }, "unavailable"],
  [
    "personal route disabled",
    { DISABLE_PERSONAL_ANALYSIS: "true" },
    "unavailable",
  ],
  [
    "other subject",
    { PERSONAL_ALPHA_SUBJECTS_JSON: '["someone-else"]' },
    "unavailable",
  ],
  ["invalid subjects", { PERSONAL_ALPHA_SUBJECTS_JSON: "{" }, "unavailable"],
  ["gated text review", {}, "available_unverified"],
] as const)(
  "projects %s independently of managed media without creating readiness or work",
  async (_name, changes, state) => {
    vi.stubEnv("WORK_CLOUD_TEXT_ENABLED", "true");
    vi.stubEnv("WORK_CLOUD_TEXT_VERIFIED", "true");
    vi.stubEnv("DISABLE_INFERENCE", "false");
    vi.stubEnv("DISABLE_PERSONAL_ANALYSIS", "false");
    vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["setup-fixture"]');
    vi.stubEnv("HOSTED_MEDIA_ANALYSIS_VERIFIED", "false");
    vi.stubEnv("HOSTED_MEDIA_ACCEPTANCE_ENABLED", "false");
    vi.stubEnv("HOSTED_MEDIA_PUBLIC_RELEASE_APPROVED", "false");
    for (const [key, value] of Object.entries(changes)) vi.stubEnv(key, value);
    const { t, client, org } = await fixture();
    const result = await client.query(api.setupJourney.status, {
      organizationId: org,
    });
    expect(result?.snapshot).toMatchObject({
      workCloudTextState: state,
      cloudAvailable: false,
      paired: false,
      accountConnected: false,
      workerAvailable: false,
      sampleCited: false,
    });
    expect(result?.snapshot.route).toBeUndefined();
    expect(result?.journey).toBeNull();
    expect(
      await t.run(async (ctx) => ({
        grants: (await ctx.db.query("assistantGrants").collect()).length,
        sources: (await ctx.db.query("sources").collect()).length,
        reservations: (await ctx.db.query("reservations").collect()).length,
        setup: (await ctx.db.query("librarySetup").collect()).length,
      })),
    ).toEqual({ grants: 0, sources: 0, reservations: 0, setup: 0 });
  },
);
it("keeps managed media eligibility separate when experimental text is disabled", async () => {
  vi.stubEnv("WORK_CLOUD_TEXT_ENABLED", "false");
  vi.stubEnv("HOSTED_MEDIA_ANALYSIS_VERIFIED", "true");
  vi.stubEnv("HOSTED_MEDIA_PUBLIC_RELEASE_APPROVED", "true");
  vi.stubEnv("DISABLE_INFERENCE", "false");
  vi.stubEnv("RESTORE_LOCK", "false");
  const { client, org } = await fixture();
  expect(
    (await client.query(api.setupJourney.status, { organizationId: org }))
      ?.snapshot,
  ).toMatchObject({ cloudAvailable: true, workCloudTextState: "unavailable" });
});
