import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { prerequisiteIds } from "../packages/onboarding/preflight-report";
const modules = import.meta.glob("../convex/**/*.ts");
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
