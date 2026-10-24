import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { instagramGuideSteps } from "../packages/onboarding/project-builder-journey";
const modules = import.meta.glob("../convex/**/*.ts");
it("selects only reviewed skills from the owner's confirmed context without claiming installation or creating a journey", async () => {
  const { client, org } = await fixture();
  expect(
    (await client.query(api.setupJourney.status, { organizationId: org }))
      ?.skillRecommendations.recommendations,
  ).toEqual([]);
  await client.mutation(api.librarySpaces.saveSetup, {
    organizationId: org,
    expectedVersion: 1,
    focus: ["business"],
    goal: "Review my React web application",
    interests: ["browser testing"],
    role: "Project owner",
    connectSpaces: false,
    confirmed: true,
    stage: 2,
  });
  const status = await client.query(api.setupJourney.status, {
    organizationId: org,
  });
  expect(status?.journey).toBeNull();
  expect(status?.skillRecommendations).toMatchObject({ status: "ready" });
  expect(status?.skillRecommendations.recommendations).toHaveLength(3);
  for (const skill of status!.skillRecommendations.recommendations) {
    expect(skill.installed).toBe("unknown");
    expect(skill.sourceUrl).toMatch(
      /^https:\/\/github\.com\/.*\/blob\/[a-f0-9]{40}\//,
    );
    expect(skill).not.toHaveProperty("installCommand");
  }
});
async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject: "chapter-fixture",
    email: "chapter@example.test",
    name: "Synthetic chapters",
  });
  const client = t.withIdentity({ subject: "chapter-fixture" });
  const org = await client.mutation(api.organizations.createPrivate, {});
  await client.mutation(api.librarySpaces.saveSetup, {
    organizationId: org,
    expectedVersion: 0,
    focus: ["personal"],
    goal: "Retain permitted ideas",
    interests: [],
    role: "",
    connectSpaces: false,
    confirmed: true,
    stage: 2,
  });
  return { t, client, org };
}
it("extends only explicit owner setup; stale progress, another workspace and client timestamps cannot alter it", async () => {
  const { t, client, org } = await fixture();
  const initial = await client.query(api.setupJourney.status, {
    organizationId: org,
  });
  expect(initial?.journey).toBeNull();
  await client.mutation(api.setupJourney.save, {
    organizationId: org,
    expectedVersion: 1,
    journeyAction: { type: "start" },
  });
  const resumed = await client.query(api.setupJourney.status, {
    organizationId: org,
  });
  expect(resumed?.journey).toMatchObject({
    version: "project-builder-v1",
    chapter: 0,
    substep: 0,
    instagramGuide: { step: 0 },
  });
  expect(resumed?.snapshot).toEqual(initial?.snapshot);
  await expect(
    client.mutation(api.setupJourney.save, {
      organizationId: org,
      expectedVersion: 1,
      journeyAction: { type: "next" },
    }),
  ).rejects.toThrow();
  await expect(
    client.mutation(api.setupJourney.save, {
      organizationId: org,
      expectedVersion: 2,
      journeyAction: { type: "next", finishedAt: 1 },
    }),
  ).rejects.toThrow();
  const otherOrg = await client.mutation(api.organizations.create, {
    name: "Separate synthetic team",
  });
  expect(
    await client.query(api.setupJourney.status, { organizationId: otherOrg }),
  ).toBeNull();
  await expect(
    client.mutation(api.setupJourney.save, {
      organizationId: otherOrg,
      expectedVersion: 2,
      journeyAction: { type: "next" },
    }),
  ).rejects.toThrow();
  await t.mutation(internal.accounts.syncUser, {
    subject: "chapter-other",
    email: "other-chapter@example.test",
    name: "Other synthetic owner",
  });
  await expect(
    t
      .withIdentity({ subject: "chapter-other" })
      .query(api.setupJourney.status, { organizationId: org }),
  ).rejects.toThrow();
  expect(
    (await client.query(api.setupJourney.status, { organizationId: org }))
      ?.journey,
  ).toEqual(resumed?.journey);
});
it("acknowledges education and finishes without any import, funding, grant, device or result side effect", async () => {
  const { t, client, org } = await fixture();
  let version = 1;
  const act = async (type: string) => {
    await client.mutation(api.setupJourney.save, {
      organizationId: org,
      expectedVersion: version++,
      journeyAction: { type },
    });
  };
  await act("start");
  await act("next");
  await act("next");
  await act("defer");
  await act("defer");
  await act("next");
  await act("defer");
  const blockedVersion = version;
  await expect(
    client.mutation(api.setupJourney.save, {
      organizationId: org,
      expectedVersion: version,
      journeyAction: { type: "finish" },
    }),
  ).rejects.toThrow();
  expect(version).toBe(blockedVersion);
  for (let step = 1; step < instagramGuideSteps.length; step++)
    await act("guide_next");
  await act("guide_ack");
  await act("next");
  await act("defer");
  await act("finish");
  const status = await client.query(api.setupJourney.status, {
    organizationId: org,
  });
  expect(status?.journey?.finishedAt).toBeDefined();
  expect(status?.journey?.exportIntent).toBeUndefined();
  expect(status?.snapshot).toMatchObject({
    importReviewed: false,
    accountConnected: false,
    paired: false,
    sampleCited: false,
    workerAvailable: false,
  });
  const records = await t.run(async (ctx) => ({
    sources: (await ctx.db.query("sources").collect()).length,
    devices: (await ctx.db.query("devices").collect()).length,
    grants: (await ctx.db.query("assistantGrants").collect()).length,
    reservations: (await ctx.db.query("reservations").collect()).length,
  }));
  expect(records).toEqual({
    sources: 0,
    devices: 0,
    grants: 0,
    reservations: 0,
  });
});
