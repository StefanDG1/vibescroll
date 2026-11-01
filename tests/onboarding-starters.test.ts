import { afterEach, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
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
