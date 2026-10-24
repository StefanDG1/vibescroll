import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { wallet } from "../convex/product";
import {
  socialHash,
  socialRevisionHash,
  type SocialPost,
} from "../packages/social/contracts";
import { serviceArtifactCurrent } from "../convex/lib/serviceArtifacts";
import {
  neutralSocialPrompt,
  neutralSocialMaxOutput,
} from "../packages/social/prompts";
import {
  googleCostPolicy,
  googleInferenceModel,
} from "../packages/providers/google-inference";
import { neutralServicePayload } from "../convex/serviceArtifactRuntime";
const provider = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../convex/lib/googleInference", async (original) => ({
  ...(await original<typeof import("../convex/lib/googleInference")>()),
  inferGoogle: (...args: unknown[]) => provider.invoke(...args),
}));
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  provider.invoke.mockReset();
});

async function setup() {
  vi.useFakeTimers();
  const now = Date.now();
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject: "producer-owner",
    email: "producer@example.test",
    name: "Synthetic service owner",
    verified: true,
  });
  const owner = t.withIdentity({
    subject: "producer-owner",
    auth_time: Math.floor(now / 1000),
  });
  const org = await owner.mutation(api.organizations.create, {
    name: "Synthetic managed service",
  });
  const rights = {
    version: "social-rights-v1",
    evidenceId: "synthetic-review",
    provider: "fixture-only",
    platforms: ["instagram"],
    creatorScope: "specified",
    creatorIds: ["creator1"],
    collection: true,
    mediaAcquisition: true,
    aiProcessing: true,
    crossCustomerReuse: true,
    routes: ["managed_api"],
    reviewedAt: now - 10000,
    expiresAt: now + 86400000,
    maxRetentionMs: 86400000,
    deletionWithinMs: 3600000,
  };
  const config = {
    version: "creator-provider-v1",
    provider: "fixture-only",
    rights,
    reviewReference: "synthetic-rights-and-pricing",
    expiresAt: rights.expiresAt,
    budgetKey: "social-discovery-usd-micros:v1:fixture",
    ceilingUsdMicros: 100,
    perCheckUsdMicros: 10,
    maximumChecks: 10,
    includesMinimumRetriesStorageAndLag: true,
    includesDeliveryAndRevocationCleanup: true,
  };
  for (const [key, value] of Object.entries({
    CREATOR_FOLLOWING_ENABLED: "true",
    CREATOR_SERVICE_REUSE_ENABLED: "true",
    CREATOR_SERVICE_ORGANIZATION_ID: org,
    CREATOR_PROVIDER_CONFIGURATION: JSON.stringify(config),
    HOSTED_MEDIA_ACCEPTANCE_ENABLED: "true",
    HOSTED_MEDIA_ANALYSIS_SUBJECTS_JSON: '["producer-owner"]',
    MANAGED_INFERENCE_ROUTE: "google_metered",
    GOOGLE_INFERENCE_ENABLED: "true",
    GOOGLE_INFERENCE_COST_POLICY: googleCostPolicy,
    GOOGLE_INFERENCE_REVIEW_EXPIRES_AT: new Date(now + 86400000).toISOString(),
  }))
    vi.stubEnv(key, value);
  const post: SocialPost = {
    schemaVersion: "social-post-v1",
    platform: "instagram",
    creatorId: "creator1",
    postId: "provider1",
    canonical: "https://www.instagram.com/p/producer1/",
    publishedAt: null,
    observedAt: now - 1000,
    dateReliability: "unknown",
    caption: "A synthetic caption",
    captionHash: await socialHash("A synthetic caption"),
    assets: [
      {
        id: "slide1",
        index: 0,
        kind: "image",
        mime: "image/jpeg",
        contentHash: await socialHash("actual fixture image"),
        bytes: 1000,
        width: 1000,
        height: 1000,
        inspected: true,
      },
    ],
    expectedAssetCount: 1,
    coverage: "complete_manifest",
    revisionHash: "a".repeat(64),
    providerEvidenceId: rights.evidenceId,
  };
  post.revisionHash = await socialRevisionHash(post);
  const prepared = {
    schemaVersion: "ordered-media-v1",
    post,
    evidence: [
      {
        id: "visible1",
        kind: "image_observation",
        assetId: "slide1",
        assetIndex: 0,
        text: "A visible synthetic label",
        textHash: await socialHash("A visible synthetic label"),
        postRevisionHash: post.revisionHash,
        basis: "visible",
        uncertainty: "",
      },
    ],
  };
  const id = await t.run(async (ctx) => {
    const w = await wallet(ctx, org);
    await ctx.db.patch(w._id, { granted: 100 });
    return ctx.db.insert("sources", {
      organizationId: org,
      createdAt: now,
      updatedAt: now,
      key: "synthetic-service-source",
      canonical: post.canonical,
      url: post.canonical,
      kind: "url",
      title: "PRIVATE TITLE MUST NOT ENTER PROMPT",
      text: "PRIVATE CUSTOMER NOTE",
      tags: ["PRIVATE VOCABULARY"],
      state: "saved",
      generation: 1,
      coverage: "metadata_only",
      rightsAttested: true,
      managedAnalysisActor: actor,
      orderedMedia: prepared,
    });
  });
  function output(generation = 2) {
    return {
      schemaVersion: "3.0.0",
      sourceId: id,
      processingRunId: `${id}:${generation}`,
      postRevisionHash: post.revisionHash,
      coverage: "ordered_media",
      summary: "A neutral fixture summary",
      warnings: [],
      insights: [
        {
          id: "idea1",
          kind: "idea",
          title: "Inspect original evidence",
          claim: "The image contains a synthetic label.",
          interpretation: "Check the original before applying it.",
          categories: ["general_advice"],
          evidence: [
            {
              id: "visible1",
              kind: "image_observation",
              startMs: null,
              endMs: null,
            },
          ],
          confidence: "supported",
          verificationNeeds: [],
        },
      ],
    };
  }
  // Pure injected metered transport fixture. No broker, provider or network call.
  provider.invoke.mockImplementation(async (_ctx, payload, record) => {
    const input = JSON.parse(
      payload.parts.map((part: { text: string }) => part.text).join(""),
    );
    const generation = Number(input.processingRunId.split(":").at(-1));
    record({
      costMicros: 462,
      inputTokens: 100,
      outputTokens: 100,
      usdEstimate: 0.0001,
      costPolicy: googleCostPolicy,
    });
    return {
      output: output(generation),
      model: googleInferenceModel,
      credits: 1,
    };
  });
  const request = () =>
    t.mutation(internal.serviceArtifactRuntime.request, {
      id,
      expectedGeneration: 1,
      language: "en",
    });
  return {
    t,
    actor,
    owner,
    org,
    now,
    rights,
    config,
    prepared,
    id,
    output,
    request,
  };
}

it("uses the existing reservation and workflow and produces a current artifact through the real analysis commit", async () => {
  const s = await setup();
  const requested = await s.request();
  expect(requested).toMatchObject({
    generation: 2,
    queued: true,
    cached: false,
  });
  const pending = await s.t.run((ctx) =>
    ctx.db.query("reservations").collect(),
  );
  expect(pending).toMatchObject([
    { key: `source:${s.id}:2`, state: "active", max: 10 },
  ]);
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  const source = (await s.t.run((ctx) => ctx.db.get(s.id)))!;
  expect(source.state).toBe("ready");
  expect(source.analysis).toEqual(s.output());
  expect(source.processingReceipt).toMatchObject({
    generation: 2,
    route: "google_metered",
    computeCredits: 0,
    chargedCredits: 1,
    inferenceMicros: 462,
  });
  const reservation = (
    await s.t.run((ctx) => ctx.db.query("reservations").collect())
  )[0];
  expect(reservation).toMatchObject({ state: "settled", settled: 1 });
  expect(reservation.dispatchedAt).toBe(s.now);
  const artifact = (
    await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect())
  )[0];
  expect(
    await s.t.run((ctx) => serviceArtifactCurrent(ctx, artifact)),
  ).not.toBeNull();
  const payload = provider.invoke.mock.calls[0][1];
  expect(payload.prompt).toBe(neutralSocialPrompt);
  expect(payload.maxOutput).toBe(neutralSocialMaxOutput);
  const body = payload.parts
    .map((part: { text: string }) => part.text)
    .join("");
  expect(body).not.toMatch(/PRIVATE|categoryVocabulary|repositoryContext/);
  expect(body).toContain("A visible synthetic label");
});

it("deduplicates queued requests and physical action replays without overwriting a ready result", async () => {
  const s = await setup();
  await s.request();
  expect(
    await s.t.mutation(internal.serviceArtifactRuntime.request, {
      id: s.id,
      expectedGeneration: 2,
      language: "en",
    }),
  ).toMatchObject({ queued: true, generation: 2 });
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  expect(provider.invoke).toHaveBeenCalledTimes(1);
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe("ready");
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
});

it("the existing source workflow dispatches the ordered route once with no legacy media action", async () => {
  const s = await setup();
  await s.request();
  for (let i = 0; i < 20; i++) {
    await vi.advanceTimersByTimeAsync(100);
    await s.t.finishInProgressScheduledFunctions();
    if ((await s.t.run((ctx) => ctx.db.get(s.id)))?.state === "ready") break;
  }
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe("ready");
  expect(provider.invoke).toHaveBeenCalledTimes(1);
  const artifacts = await s.t.run((ctx) =>
    ctx.db.query("publicArtifacts").collect(),
  );
  expect(artifacts).toHaveLength(1);
  expect(
    await s.t.run((ctx) => serviceArtifactCurrent(ctx, artifacts[0])),
  ).not.toBeNull();
});

it("a simultaneous replay cannot fail or settle the first still-running dispatch", async () => {
  const s = await setup();
  await s.request();
  let signalStarted!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const original = provider.invoke.getMockImplementation()!;
  provider.invoke.mockImplementationOnce(async (...args) => {
    signalStarted();
    await paused;
    return original(...args);
  });
  const first = s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  await started;
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe("processing");
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0].state,
  ).toBe("active");
  finish();
  await first;
  expect(provider.invoke).toHaveBeenCalledTimes(1);
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe("ready");
});

it("looks up a compatible completed artifact before any new reservation or inference", async () => {
  const s = await setup();
  await s.request();
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  const before = await s.t.run((ctx) => ctx.db.query("reservations").collect());
  expect(
    await s.t.mutation(internal.serviceArtifactRuntime.request, {
      id: s.id,
      expectedGeneration: 2,
      language: "en",
    }),
  ).toMatchObject({ queued: false, cached: true });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual(before);
  expect(provider.invoke).toHaveBeenCalledTimes(1);
});

it.each([
  "CREATOR_SERVICE_REUSE_ENABLED",
  "CREATOR_SERVICE_ORGANIZATION_ID",
  "HOSTED_MEDIA_ACCEPTANCE_ENABLED",
  "GOOGLE_INFERENCE_ENABLED",
])("refuses producer funding with closed %s", async (flag) => {
  const s = await setup();
  vi.stubEnv(flag, "");
  await expect(s.request()).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  expect(provider.invoke).not.toHaveBeenCalled();
});

it("revoked rights or source changes between request and dispatch prevent inference", async () => {
  const s = await setup();
  await s.request();
  vi.stubEnv(
    "CREATOR_PROVIDER_CONFIGURATION",
    JSON.stringify({
      ...s.config,
      rights: { ...s.rights, crossCustomerReuse: false },
    }),
  );
  await expect(
    s.t.action(internal.serviceArtifactInference.analyze, {
      id: s.id,
      generation: 2,
    }),
  ).rejects.toThrow();
  expect(provider.invoke).not.toHaveBeenCalled();
  const reservation = (
    await s.t.run((ctx) => ctx.db.query("reservations").collect())
  )[0];
  expect(reservation.dispatchedAt).toBeUndefined();
  expect(reservation.state).toBe("active");
});

it("an unknown provider response retains the existing hold and blocks a new generation", async () => {
  const s = await setup();
  await s.request();
  provider.invoke.mockRejectedValueOnce(Error("Synthetic response lost"));
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe("failed");
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0],
  ).toMatchObject({ state: "active", settled: 0 });
  await expect(
    s.t.mutation(internal.serviceArtifactRuntime.request, {
      id: s.id,
      expectedGeneration: 2,
      language: "en",
    }),
  ).rejects.toThrow("RECONCILIATION_REQUIRED");
  expect(
    await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect()),
  ).toEqual([]);
});

it("invalid output settles measured usage without minting an artifact", async () => {
  const s = await setup();
  await s.request();
  provider.invoke.mockImplementationOnce(async (_ctx, _payload, record) => {
    record({
      costMicros: 462,
      inputTokens: 100,
      outputTokens: 100,
      usdEstimate: 0.0001,
      costPolicy: googleCostPolicy,
    });
    return { output: { ...s.output(), processingRunId: "forged" } };
  });
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0],
  ).toMatchObject({ state: "settled", settled: 1 });
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe("failed");
  expect(
    await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect()),
  ).toEqual([]);
});

it("late changed-generation responses settle only their confirmed reservation and never restore old content", async () => {
  const s = await setup();
  await s.request();
  const original = provider.invoke.getMockImplementation()!;
  provider.invoke.mockImplementationOnce(async (...args) => {
    await s.t.run((ctx) =>
      ctx.db.patch(s.id, {
        generation: 3,
        state: "saved",
        analysis: undefined,
      }),
    );
    return original(...args);
  });
  await expect(
    s.t.action(internal.serviceArtifactInference.analyze, {
      id: s.id,
      generation: 2,
    }),
  ).rejects.toThrow();
  expect(await s.t.run((ctx) => ctx.db.get(s.id))).toMatchObject({
    generation: 3,
    state: "saved",
  });
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0],
  ).toMatchObject({ state: "settled", settled: 1 });
  expect(
    await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect()),
  ).toEqual([]);
});

it("splits large neutral input losslessly while preserving non-BMP text and exact payload bounds", () => {
  const prepared = { text: `${"a".repeat(199800)}${"😀".repeat(500)}` };
  const payload = neutralServicePayload("fixture", 2, "en", prepared);
  expect(payload.parts.length).toBeGreaterThan(1);
  const reconstructed = payload.parts
    .map((part) => ("text" in part ? part.text : ""))
    .join("");
  expect(JSON.parse(reconstructed).prepared).toEqual(prepared);
  expect(
    payload.parts.every((part) => "text" in part && part.text.length <= 200000),
  ).toBe(true);
});
