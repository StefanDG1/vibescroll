import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";
import { signOnboardingValue } from "../packages/onboarding/journey";
vi.mock("../packages/providers/storage", () => ({
  signedObject: (key: string) =>
    `https://storage.example.test/${encodeURIComponent(key)}`,
  deleteObject: async () => {},
}));
const secret = "synthetic-preview-signing-key-not-a-live-credential";
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function ready() {
  vi.useFakeTimers();
  const f = await cloudCatalogFixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(null, { status: 200 })
        : new Response(f.bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const result = await f.contribute();
  const contribution = (await f.t.run((ctx) =>
    ctx.db.get(result.contributionId),
  ))!;
  const artifact = (await f.t.run((ctx) =>
    ctx.db.get(contribution.artifactId),
  ))!;
  if (!("familyId" in artifact)) throw Error("Missing fixture family");
  const assessment = {
    rubric: "evidence-review-v1" as const,
    fidelity: 4,
    completeness: 4,
    citationAccuracy: 4,
    uncertainty: 4,
    usefulness: 4,
    reason: "Synthetic starter publication review",
  };
  const review = await f.operator.query(api.cloudCatalog.reviewRecommendation, {
    artifactId: artifact._id,
    assessment,
  });
  await f.operator.mutation(api.cloudCatalog.selectRecommendation, {
    artifactId: artifact._id,
    assessment,
    expectedSelectionRevision: 0,
    reviewHash: review.reviewHash,
  });
  vi.stubEnv("ONBOARDING_ENABLED", "true");
  vi.stubEnv("ONBOARDING_PREVIEW_SECRET", secret);
  vi.stubEnv(
    "ONBOARDING_STARTERS_JSON",
    JSON.stringify([
      {
        familyId: artifact.familyId,
        interests: ["coding"],
        reviewReference: "Synthetic public-starter authority",
      },
    ]),
  );
  const token = (
    kind: "thumbnail" | "detail" = "detail",
    expiresAt = Date.now() + 60000,
  ) =>
    signOnboardingValue(
      {
        version: 1,
        kind,
        familyId: artifact.familyId,
        session: crypto.randomUUID(),
        expiresAt,
      },
      secret,
    );
  return { ...f, artifact, familyId: artifact.familyId, token };
}
it("returns only reviewed metadata without creating personal associations, jobs or credit operations", async () => {
  const f = await ready();
  const before = await f.t.run(async (ctx) => ({
    sources: (await ctx.db.query("sources").take(100)).length,
    jobs: (await ctx.db.query("analysisAttempts").take(100)).length,
    reservations: (await ctx.db.query("reservations").take(100)).length,
  }));
  const rows = await f.t.query(api.onboardingStarter.list, {
    interests: ["coding"],
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].matched).toBe(1);
  expect(rows[0]).not.toHaveProperty("analysis");
  expect(rows[0]).not.toHaveProperty("key");
  const detail = await f.t.mutation(api.onboardingStarter.detail, {
    token: await f.token(),
  });
  expect(detail.analysis.insights.length).toBeGreaterThan(0);
  expect(detail.frames.length).toBeGreaterThan(0);
  const after = await f.t.run(async (ctx) => ({
    sources: (await ctx.db.query("sources").take(100)).length,
    jobs: (await ctx.db.query("analysisAttempts").take(100)).length,
    reservations: (await ctx.db.query("reservations").take(100)).length,
  }));
  expect(after).toEqual(before);
});
it("rejects unsigned, expired and thumbnail-only claims for complete insights", async () => {
  const f = await ready();
  await expect(
    f.t.mutation(api.onboardingStarter.detail, { token: "not-signed" }),
  ).rejects.toThrow(/FORBIDDEN/);
  await expect(
    f.t.mutation(api.onboardingStarter.detail, {
      token: await f.token("detail", Date.now() - 1),
    }),
  ).rejects.toThrow(/FORBIDDEN/);
  await expect(
    f.t.mutation(api.onboardingStarter.detail, {
      token: await f.token("thumbnail"),
    }),
  ).rejects.toThrow(/FORBIDDEN/);
});
it("does not reveal a family omitted from the explicit starter selection", async () => {
  const f = await ready(),
    token = await f.token();
  vi.stubEnv("ONBOARDING_STARTERS_JSON", "[]");
  expect(
    await f.t.query(api.onboardingStarter.list, { interests: [] }),
  ).toEqual([]);
  await expect(
    f.t.mutation(api.onboardingStarter.detail, { token }),
  ).rejects.toThrow(/SOURCE_UNAVAILABLE/);
});
it("rechecks source withdrawal before both detail and byte disclosure", async () => {
  const f = await ready(),
    token = await f.token();
  const detail = await f.t.mutation(api.onboardingStarter.detail, { token });
  await f.t.run((ctx) => ctx.db.patch(f.familyId, { state: "blocked" }));
  await expect(
    f.t.mutation(api.onboardingStarter.detail, { token }),
  ).rejects.toThrow(/SOURCE_UNAVAILABLE/);
  await expect(
    f.t.mutation(api.onboardingStarter.frame, {
      token,
      frameId: detail.frames[0].id,
    }),
  ).rejects.toThrow(/SOURCE_UNAVAILABLE/);
});
it("fails closed on malformed configuration and out-of-bounds topic requests", async () => {
  const f = await ready();
  vi.stubEnv("ONBOARDING_STARTERS_JSON", "not-json");
  expect(
    await f.t.query(api.onboardingStarter.list, { interests: [] }),
  ).toEqual([]);
  await expect(
    f.t.query(api.onboardingStarter.list, { interests: ["a", "b", "c", "d"] }),
  ).rejects.toThrow(/INVALID_INPUT/);
});

it("binds only the selected starter after verified payment, with idempotent zero-credit reuse", async () => {
  const f = await ready();
  const subject = "user_03334567890123456789012345";
  const userId = await f.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "new-starter@example.test",
    name: "New starter",
    verified: true,
  });
  const actor = f.t.withIdentity({ subject });
  const organizationId = await actor.mutation(
    api.organizations.createPrivate,
    {},
  );
  await actor.mutation(api.onboarding.save, {
    draft: {
      version: 1,
      interests: ["coding"],
      goal: "build_faster",
      selectedFamilyId: f.familyId,
    },
  });
  await actor.mutation(api.onboarding.chooseProject, { organizationId });
  const input = {
    organizationId,
    key: `onboarding-v1:${f.familyId}`,
    kind: "url",
    url: f.prepared.post.canonical,
    title: "Chosen starter",
    rightsAttested: true,
  };
  await expect(actor.mutation(api.product.capture, input)).rejects.toThrow(
    /Pro/,
  );
  const now = Date.now(),
    end = now + 86400000;
  await f.t.run(async (ctx) => {
    await ctx.db.insert("wallets", {
      organizationId,
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
      organizationId,
      customerId: "fixture-starter-customer",
      subscriptionId: "fixture-starter-sub",
      status: "active",
      periodEnd: end,
      verifiedAt: now,
      revision: 1,
    });
    await ctx.db.insert("billingPeriods", {
      organizationId,
      createdAt: now,
      updatedAt: now,
      key: "fixture-starter-period",
      start: now - 1,
      end,
      credits: 300,
      subscription: "fixture-starter-sub",
    });
  });
  const attemptsBefore = await f.t.run((ctx) =>
    ctx.db.query("analysisAttempts").take(100),
  );
  const sourceId = await actor.mutation(api.product.capture, input);
  expect(await actor.mutation(api.product.capture, input)).toBe(sourceId);
  await actor.mutation(api.onboarding.complete, { sourceId });
  await actor.mutation(api.onboarding.complete, { sourceId });
  const result = await f.t.run(async (ctx) => ({
    user: await ctx.db.get(userId),
    source: await ctx.db.get(sourceId),
    sources: await ctx.db
      .query("sources")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .take(10),
    wallet: await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .unique(),
    attempts: await ctx.db.query("analysisAttempts").take(100),
  }));
  expect(result.sources).toHaveLength(1);
  expect(result.source?.state).toBe("ready");
  expect(result.user?.onboarding).toMatchObject({
    stage: "complete",
    sourceId,
    selectedFamilyId: f.familyId,
  });
  expect(result.wallet).toMatchObject({ granted: 300, spent: 0, reserved: 0 });
  expect(result.attempts).toHaveLength(attemptsBefore.length);
});

it("keeps signup progress recoverable when a previously selected starter is withdrawn", async () => {
  const f = await ready();
  const subject = "user_04434567890123456789012345";
  await f.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "withdrawn-starter@example.test",
    name: "New account",
    verified: true,
  });
  const actor = f.t.withIdentity({ subject });
  await f.t.run((ctx) => ctx.db.patch(f.familyId, { state: "blocked" }));
  const preferences = {
    version: 1,
    interests: ["coding"],
    goal: "build_faster",
  };
  await expect(
    actor.mutation(api.onboarding.save, {
      draft: { ...preferences, selectedFamilyId: f.familyId },
    }),
  ).rejects.toThrow(/SOURCE_UNAVAILABLE/);
  expect((await actor.query(api.onboarding.status, {})).progress?.stage).toBe(
    "quiz",
  );
  await actor.mutation(api.onboarding.save, { draft: preferences });
  expect((await actor.query(api.onboarding.status, {})).progress).toMatchObject(
    { stage: "github", interests: ["coding"], goal: "build_faster" },
  );
});
