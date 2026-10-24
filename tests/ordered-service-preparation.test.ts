import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { grantPaidPeriod } from "./allowance-fixture";
import { monthlyAnchor } from "../packages/policy";
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
import {
  serviceArtifactCurrent,
  lookupServiceArtifact,
} from "../convex/lib/serviceArtifacts";
import { sharedTypedCitations } from "../convex/lib/sourceCitations";
import { googleCostPolicy } from "../packages/providers/google-inference";
const provider = vi.hoisted(() => ({ invoke: vi.fn(), decode: vi.fn() }));
vi.mock("../packages/providers/ordered-media", async (original) => ({
  ...(await original<typeof import("../packages/providers/ordered-media")>()),
  prepareOrderedMedia: (...args: unknown[]) => provider.decode(...args),
}));
import { createHash } from "node:crypto";
import { audioTimingWarning } from "../packages/social/diagnostics";
import { OrderedMediaPreparationError } from "../packages/providers/ordered-media";
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
  provider.decode.mockReset();
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
    MEDIA_VERIFIED: "true",
    ORDERED_MEDIA_VERIFIED: "true",
    SANDBOX_CREDITS_PER_SECOND: "0.01",
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
  const jpeg = new Uint8Array([255, 216, 255, 1, 2, 3]);
  const hash = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const asset = {
    id: "slide1",
    index: 0,
    kind: "image" as const,
    key: "private/synthetic-slide",
    bytes: jpeg.length,
    sha256: hash(jpeg),
  };
  const {
    assets: _assets,
    captionHash: _captionHash,
    revisionHash: _revisionHash,
    coverage: _coverage,
    ...metadata
  } = post;
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { orderedMedia: undefined });
    await ctx.db.insert("assets", {
      organizationId: org,
      key: asset.key,
      sourceId: id,
      sourceGeneration: 1,
      size: asset.bytes,
      type: "image/jpeg",
      state: "complete",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 3600000,
    });
  });
  provider.decode.mockImplementation(async (_assets, options) => {
    await options.authorize();
    return {
      computeSeconds: 2,
      files: new Map([["asset-000-image.jpg", jpeg]]),
      manifest: {
        schemaVersion: "ordered-decoder-v1",
        assets: [
          {
            id: asset.id,
            index: 0,
            kind: "image",
            mime: "image/jpeg",
            bytes: asset.bytes,
            contentHash: asset.sha256,
            width: 1000,
            height: 1000,
            representations: [
              {
                kind: "image",
                file: "asset-000-image.jpg",
                bytes: jpeg.length,
                sha256: hash(jpeg),
                width: 960,
                height: 960,
              },
            ],
            audio: null,
          },
        ],
        omitted: [],
        inputBytes: asset.bytes,
        videoDurationMs: 0,
        representationBytes: jpeg.length,
        audioBytes: 0,
      },
    };
  });
  provider.invoke.mockImplementation(async (_ctx, payload, record) => {
    record({
      costMicros: 462,
      inputTokens: 100,
      outputTokens: 100,
      usdEstimate: 0.0001,
      costPolicy: googleCostPolicy,
    });
    if (payload.parts[0]?.inlineData)
      return {
        output: {
          observations: [
            {
              text: "A visible synthetic label",
              basis: "visible",
              uncertainty: "",
            },
          ],
        },
      };
    const input = JSON.parse(
      payload.parts.map((part: { text: string }) => part.text).join(""),
    );
    const result = output(Number(input.processingRunId.split(":").at(-1)));
    result.postRevisionHash = input.prepared.post.revisionHash;
    result.insights[0].evidence[0].id = input.prepared.evidence[0].id;
    return { output: result };
  });
  const request = () =>
    t.mutation(internal.orderedMediaRuntime.request, {
      id,
      expectedGeneration: 1,
      metadata,
      assets: [asset],
      language: "en",
      maxCredits: 10,
    });
  return {
    t,
    actor,
    owner,
    org,
    now,
    rights,
    config,
    id,
    metadata,
    asset,
    hash,
    jpeg,
    request,
  };
}

it("prepares actual hash-bound private assets and final analysis under one generation, workflow and reservation", async () => {
  const s = await setup();
  expect(await s.request()).toEqual({ generation: 2, queued: true });
  expect(
    await s.t.action(internal.orderedMedia.prepare, {
      id: s.id,
      generation: 2,
    }),
  ).toEqual({ prepared: true });
  let source = (await s.t.run((ctx) => ctx.db.get(s.id)))!;
  expect(source.orderedPreparation).toMatchObject({
    phase: "prepared",
    computeCredits: 1,
    inferenceMicros: 462,
  });
  expect(source.orderedMedia.post.assets[0]).toMatchObject({
    contentHash: s.asset.sha256,
    inspected: true,
  });
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  source = (await s.t.run((ctx) => ctx.db.get(s.id)))!;
  expect(source.state).toBe("ready");
  expect(source.processingReceipt).toMatchObject({
    generation: 2,
    computeCredits: 1,
    inferenceMicros: 924,
    chargedCredits: 2,
    inputTokens: 200,
    outputTokens: 200,
  });
  expect(source.analysisPipelineVersion).toBe("ordered-social-v2");
  const reservations = await s.t.run((ctx) =>
    ctx.db.query("reservations").collect(),
  );
  expect(reservations).toMatchObject([
    { key: `source:${s.id}:2`, max: 10, state: "settled", settled: 2 },
  ]);
  expect(provider.decode).toHaveBeenCalledTimes(1);
  expect(provider.invoke).toHaveBeenCalledTimes(2);
  expect(provider.invoke.mock.calls[1][1].maxMicros).toBe(89538);
  const artifacts = await s.t.run((ctx) =>
    ctx.db.query("publicArtifacts").collect(),
  );
  expect(artifacts).toHaveLength(1);
  expect(
    await s.t.run((ctx) => serviceArtifactCurrent(ctx, artifacts[0])),
  ).not.toBeNull();
  expect(
    await s.t.mutation(internal.orderedMediaRuntime.request, {
      id: s.id,
      expectedGeneration: 2,
      metadata: s.metadata,
      assets: [s.asset],
      language: "en",
      maxCredits: 10,
    }),
  ).toMatchObject({
    cached: true,
    queued: false,
    generation: 2,
    artifactId: artifacts[0]._id,
  });
  expect(provider.decode).toHaveBeenCalledTimes(1);
  expect(provider.invoke).toHaveBeenCalledTimes(2);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
  const privateOrg = await s.owner.mutation(
    api.organizations.createPrivate,
    {},
  );
  await s.t.run(async (ctx) => {
    // Processing above used the service owner's trial wallet. Only importing
    // another catalog result into a private library needs current Pro access.
    const contributor = await wallet(ctx, s.org);
    expect(contributor.tier).toBe("trial");
    const w = await wallet(ctx, privateOrg);
    const periodEnd = monthlyAnchor(Date.now(), 1);
    await ctx.db.patch(w._id, { granted: 100 });
    await ctx.db.insert("billing", {
      organizationId: privateOrg,
      customerId: "synthetic-catalog-recipient",
      subscriptionId: "synthetic-catalog-subscription",
      status: "active",
      periodEnd,
      verifiedAt: Date.now(),
      revision: 1,
      appliedRevision: 1,
    });
  });
  await grantPaidPeriod(s.t, {
    organizationId: privateOrg,
    subscription: "synthetic-catalog-subscription",
    tier: "pro",
    interval: "monthly",
    start: Date.now(),
    end: monthlyAnchor(Date.now(), 1),
    verifiedPayment: true,
    billingRevision: 1,
  });
  const args = {
    organizationId: privateOrg,
    artifactId: artifacts[0]._id,
    expectedCompatibilityKey: source.serviceIntent!.compatibilityKey,
  };
  expect(
    await s.owner.query(api.serviceArtifacts.preview, args),
  ).not.toBeNull();
  const saved = await s.owner.mutation(api.serviceArtifacts.save, args);
  expect(saved.processingStarted).toBe(false);
  await s.t.run((ctx) =>
    ctx.db.insert("publicModerationBlocks", {
      origin: "legacy_removal",
      organizationId: s.org,
      publisher: s.actor,
      sourceId: s.id,
      canonicalHash: s.hash(new TextEncoder().encode(s.metadata.canonical)),
      reason: "abuse",
      state: "active",
      version: 1,
      createdAt: s.now,
      updatedAt: s.now,
    }),
  );
  expect(
    await s.t.run((ctx) =>
      lookupServiceArtifact(ctx, args.expectedCompatibilityKey),
    ),
  ).toBeNull();
  expect(await s.owner.query(api.serviceArtifacts.preview, args)).toBeNull();
  await expect(
    s.owner.mutation(api.serviceArtifacts.save, args),
  ).rejects.toThrow("unavailable");
  const unavailable = await s.owner.query(api.publicKnowledge.savedDetail, {
    sourceId: saved.sourceId,
  });
  expect(unavailable?.available).toBe(false);
});

it("the existing workflow runs preparation then final inference once without the legacy media route", async () => {
  const s = await setup();
  await s.request();
  for (let i = 0; i < 30; i++) {
    await vi.advanceTimersByTimeAsync(100);
    await s.t.finishInProgressScheduledFunctions();
    if ((await s.t.run((ctx) => ctx.db.get(s.id)))?.state === "ready") break;
  }
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe("ready");
  expect(provider.decode).toHaveBeenCalledTimes(1);
  expect(provider.invoke).toHaveBeenCalledTimes(2);
});

it("a replay cannot decode twice or disturb the first preparation hold", async () => {
  const s = await setup();
  await s.request();
  const first = await s.t.mutation(internal.orderedMediaRuntime.begin, {
    id: s.id,
    generation: 2,
  });
  expect(first.dispatched).toBe(true);
  expect(
    await s.t.action(internal.orderedMedia.prepare, {
      id: s.id,
      generation: 2,
    }),
  ).toEqual({ prepared: false });
  expect(provider.decode).not.toHaveBeenCalled();
  expect(provider.invoke).not.toHaveBeenCalled();
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0].state,
  ).toBe("active");
});

it.each(["foreign", "stale", "pending", "retired", "expired"])(
  "rejects %s private asset bindings before reserve or decode",
  async (kind) => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.query("assets").collect())[0];
      if (kind === "foreign")
        await ctx.db.patch(row._id, { sourceId: undefined });
      if (kind === "stale")
        await ctx.db.patch(row._id, { sourceGeneration: 0 });
      if (kind === "pending") await ctx.db.patch(row._id, { state: "pending" });
      if (kind === "expired")
        await ctx.db.patch(row._id, { expiresAt: s.now - 1 });
      if (kind === "retired")
        await ctx.db.insert("objectDeletions", {
          key: row.key,
          state: "complete",
          attempts: 1,
          createdAt: s.now,
          updatedAt: s.now,
        });
    });
    await expect(s.request()).rejects.toThrow("ORDERED_PRIVATE_ASSET_CHANGED");
    expect(
      await s.t.run((ctx) => ctx.db.query("reservations").collect()),
    ).toHaveLength(0);
    expect(provider.decode).not.toHaveBeenCalled();
  },
);

it("revoked provider policy stops before a model request and retains only measured known compute", async () => {
  const s = await setup();
  await s.request();
  const original = provider.decode.getMockImplementation()!;
  provider.decode.mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    vi.stubEnv("CREATOR_FOLLOWING_ENABLED", "false");
    return result;
  });
  expect(
    await s.t.action(internal.orderedMedia.prepare, {
      id: s.id,
      generation: 2,
    }),
  ).toEqual({ prepared: false });
  expect(provider.invoke).not.toHaveBeenCalled();
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0],
  ).toMatchObject({ state: "settled", settled: 1 });
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.analysis).toBeUndefined();
});

it("lost model acknowledgement retains the full hold and never runs final inference", async () => {
  const s = await setup();
  await s.request();
  provider.invoke.mockImplementationOnce(async () => {
    throw Error("synthetic response loss");
  });
  expect(
    await s.t.action(internal.orderedMedia.prepare, {
      id: s.id,
      generation: 2,
    }),
  ).toEqual({ prepared: false });
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0],
  ).toMatchObject({ state: "active", max: 10 });
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  expect(provider.invoke).toHaveBeenCalledTimes(1);
});

it("unconfirmed decoder termination retains the full hold; known failed decode settles known compute", async () => {
  const s = await setup();
  await s.request();
  provider.decode.mockRejectedValueOnce(
    new OrderedMediaPreparationError(undefined),
  );
  await s.t.action(internal.orderedMedia.prepare, { id: s.id, generation: 2 });
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0].state,
  ).toBe("active");
  expect(provider.invoke).not.toHaveBeenCalled();
  const known = await setup();
  await known.request();
  provider.decode.mockRejectedValueOnce(new OrderedMediaPreparationError(2));
  await known.t.action(internal.orderedMedia.prepare, {
    id: known.id,
    generation: 2,
  });
  expect(
    (await known.t.run((ctx) => ctx.db.query("reservations").collect()))[0],
  ).toMatchObject({ state: "settled", settled: 1 });
});

it("a changed generation after observation settles known usage without restoring prior content", async () => {
  const s = await setup();
  await s.request();
  const original = provider.invoke.getMockImplementation()!;
  provider.invoke.mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    await s.t.run((ctx) =>
      ctx.db.patch(s.id, {
        generation: 3,
        state: "saved",
        orderedPreparation: undefined,
      }),
    );
    return result;
  });
  await s.t.action(internal.orderedMedia.prepare, { id: s.id, generation: 2 });
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))!).toMatchObject({
    generation: 3,
    state: "saved",
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.id)))?.orderedMedia,
  ).toBeUndefined();
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0],
  ).toMatchObject({ state: "settled", settled: 2 });
});

it("preserves bounded decoder omissions and fixed warnings in prompt, cache binding and final analysis", async () => {
  const s = await setup();
  const second = {
    ...s.asset,
    id: "slide2",
    index: 1,
    key: "private/omitted-slide",
  };
  await s.t.run((ctx) =>
    ctx.db.insert("assets", {
      organizationId: s.org,
      key: second.key,
      sourceId: s.id,
      sourceGeneration: 1,
      size: second.bytes,
      type: "image/jpeg",
      state: "complete",
      createdAt: s.now,
      updatedAt: s.now,
    }),
  );
  const original = provider.decode.getMockImplementation()!;
  provider.decode.mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    result.manifest.omitted = [
      { id: second.id, index: 1, reason: "decode_unavailable" },
    ];
    result.manifest.inputBytes += second.bytes;
    return result;
  });
  await s.t.mutation(internal.orderedMediaRuntime.request, {
    id: s.id,
    expectedGeneration: 1,
    metadata: { ...s.metadata, expectedAssetCount: 2 },
    assets: [s.asset, second],
    language: "en",
    maxCredits: 10,
  });
  await s.t.action(internal.orderedMedia.prepare, { id: s.id, generation: 2 });
  const pending = (await s.t.run((ctx) => ctx.db.get(s.id)))!;
  expect(pending.orderedPreparation?.omissions).toEqual([
    { id: "slide2", index: 1, reason: "decode_unavailable" },
  ]);
  expect(pending.orderedMedia.post.coverage).toBe("partial");
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  const input = JSON.parse(
    provider.invoke.mock.calls[1][1].parts
      .map((p: { text: string }) => p.text)
      .join(""),
  );
  expect(input.diagnostics.omissions).toHaveLength(1);
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.analysis.warnings).toEqual(
    pending.orderedPreparation!.warnings,
  );
  const artifacts = await s.t.run((ctx) =>
    ctx.db.query("publicArtifacts").collect(),
  );
  const coverage = await s.t.run(
    async (ctx) =>
      (await sharedTypedCitations(ctx, (await ctx.db.get(s.id))!))?.coverage,
  );
  expect(coverage).toMatchObject({
    method: "ordered_media",
    retrieved: 1,
    omitted: 1,
    omissions: [
      "Child 2 was unavailable or not inspected.",
      "The provider's child manifest is incomplete or unknown.",
    ],
  });
  expect(JSON.stringify(coverage)).not.toMatch(/startMs|endMs|timestamp/);
  expect(
    await s.t.run((ctx) => serviceArtifactCurrent(ctx, artifacts[0])),
  ).not.toBeNull();
  await s.t.run((ctx) =>
    ctx.db.patch(s.id, {
      orderedPreparation: { ...pending.orderedPreparation!, warnings: [] },
    }),
  );
  expect(
    await s.t.run((ctx) => serviceArtifactCurrent(ctx, artifacts[0])),
  ).toBeNull();
});

it("service producer and cache access obey durable source/canonical moderation blocks", async () => {
  const s = await setup();
  await s.t.run(async (ctx) =>
    ctx.db.insert("publicModerationBlocks", {
      origin: "legacy_removal",
      organizationId: s.org,
      publisher: s.actor,
      sourceId: s.id,
      canonicalHash: s.hash(new TextEncoder().encode(s.metadata.canonical)),
      reason: "abuse",
      state: "active",
      version: 1,
      createdAt: s.now,
      updatedAt: s.now,
    }),
  );
  await expect(s.request()).rejects.toThrow("SERVICE_SOURCE_MODERATED");
  expect(provider.decode).not.toHaveBeenCalled();
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
});

async function videoSetup() {
  const s = await setup();
  const asset = { ...s.asset, kind: "video" as const };
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.query("assets").collect())[0];
    await ctx.db.patch(row._id, { type: "video/mp4" });
  });
  const wav = new Uint8Array(44 + 61000 * 32),
    view = new DataView(wav.buffer);
  const tag = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i);
  };
  tag(0, "RIFF");
  view.setUint32(4, wav.length - 8, true);
  tag(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, wav.length - 44, true);
  provider.decode.mockImplementation(async (_assets, options) => {
    await options.authorize();
    return {
      computeSeconds: 2,
      files: new Map([
        ["asset-000-frame-000.jpg", s.jpeg],
        ["asset-000-audio.wav", wav],
      ]),
      manifest: {
        schemaVersion: "ordered-decoder-v1",
        assets: [
          {
            id: asset.id,
            index: 0,
            kind: "video",
            mime: "video/mp4",
            bytes: asset.bytes,
            contentHash: asset.sha256,
            width: 1000,
            height: 1000,
            durationMs: 61000,
            representations: [
              {
                kind: "video_frame",
                file: "asset-000-frame-000.jpg",
                timestampMs: 0,
                bytes: s.jpeg.length,
                sha256: s.hash(s.jpeg),
                width: 960,
                height: 960,
              },
            ],
            audio: {
              file: "asset-000-audio.wav",
              bytes: wav.length,
              sha256: s.hash(wav),
            },
          },
        ],
        omitted: [],
        inputBytes: asset.bytes,
        videoDurationMs: 61000,
        representationBytes: s.jpeg.length,
        audioBytes: wav.length,
      },
    };
  });
  provider.invoke.mockImplementation(async (_ctx, payload, record) => {
    record({
      costMicros: 462,
      inputTokens: 100,
      outputTokens: 100,
      usdEstimate: 0.0001,
      costPolicy: googleCostPolicy,
    });
    if (payload.parts[0]?.inlineData)
      return {
        output:
          payload.parts[0].inlineData.mimeType === "audio/wav"
            ? {
                segments: [
                  {
                    text: "Synthetic speech",
                    startMs: 0,
                    endMs: 500,
                    uncertainty: "",
                  },
                ],
              }
            : {
                observations: [
                  {
                    text: "A synthetic frame",
                    basis: "visible",
                    uncertainty: "",
                  },
                ],
              },
      };
    const input = JSON.parse(
      payload.parts.map((part: { text: string }) => part.text).join(""),
    );
    return {
      output: {
        schemaVersion: "3.0.0",
        sourceId: s.id,
        processingRunId: input.processingRunId,
        postRevisionHash: input.prepared.post.revisionHash,
        coverage: "ordered_media",
        summary: "Synthetic video",
        warnings: [],
        insights: [],
      },
    };
  });
  const request = () =>
    s.t.mutation(internal.orderedMediaRuntime.request, {
      id: s.id,
      expectedGeneration: 1,
      metadata: s.metadata,
      assets: [asset],
      language: "en",
      maxCredits: 10,
    });
  return { ...s, asset, request };
}
it("transcribes every actual PCM chunk as WAV and preserves original sample offsets and timing uncertainty", async () => {
  const s = await videoSetup();
  await s.request();
  await s.t.action(internal.orderedMedia.prepare, { id: s.id, generation: 2 });
  const source = (await s.t.run((ctx) => ctx.db.get(s.id)))!;
  expect(source.orderedMedia.post.assets[0]).toMatchObject({
    inspected: true,
    audioInspected: true,
  });
  const transcript = source.orderedMedia.evidence.filter(
    (e: { basis: string }) => e.basis === "transcript",
  );
  expect(
    transcript.map((e: { startMs: number; endMs: number }) => [
      e.startMs,
      e.endMs,
    ]),
  ).toEqual([
    [0, 500],
    [60000, 60500],
  ]);
  expect(
    transcript.every((e: { uncertainty: string }) =>
      e.uncertainty.includes("Approximate"),
    ),
  ).toBe(true);
  expect(
    provider.invoke.mock.calls
      .slice(1)
      .map((call) => call[1].parts[0].inlineData.mimeType),
  ).toEqual(["audio/wav", "audio/wav"]);
  expect(provider.invoke.mock.calls.map((call) => call[1].maxMicros)).toEqual([
    90000, 89538, 89076,
  ]);
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  const ready = (await s.t.run((ctx) => ctx.db.get(s.id)))!;
  expect(ready.state).toBe("ready");
  expect(ready.analysis.warnings).toContain(audioTimingWarning);
  expect(ready.processingReceipt).toMatchObject({
    computeCredits: 1,
    inferenceMicros: 1848,
    chargedCredits: 2,
    inputTokens: 400,
    outputTokens: 400,
  });
});
it("a lost later audio response preserves prior measured usage and the full unresolved hold without a final request", async () => {
  const s = await videoSetup();
  await s.request();
  const original = provider.invoke.getMockImplementation()!;
  let calls = 0;
  provider.invoke.mockImplementation(async (...args) => {
    if (++calls === 3) throw Error("lost second audio chunk");
    return original(...args);
  });
  expect(
    await s.t.action(internal.orderedMedia.prepare, {
      id: s.id,
      generation: 2,
    }),
  ).toEqual({ prepared: false });
  expect(provider.invoke).toHaveBeenCalledTimes(3);
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0],
  ).toMatchObject({ state: "active", max: 10 });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.id)))?.orderedMedia,
  ).toBeUndefined();
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.id)))?.orderedPreparation,
  ).toMatchObject({
    computeCredits: 1,
    inferenceMicros: 924,
    inputTokens: 200,
    outputTokens: 200,
    usageUnconfirmed: true,
  });
});
it("does not issue another observation/transcription after the common budget is exhausted", async () => {
  const s = await videoSetup();
  await s.request();
  provider.invoke.mockImplementationOnce(async (_ctx, _payload, record) => {
    record({
      costMicros: 90000,
      inputTokens: 1,
      outputTokens: 1,
      usdEstimate: 0.01,
      costPolicy: googleCostPolicy,
    });
    return { output: { observations: [] } };
  });
  await s.t.action(internal.orderedMedia.prepare, { id: s.id, generation: 2 });
  expect(provider.invoke).toHaveBeenCalledTimes(1);
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect()))[0],
  ).toMatchObject({ state: "settled", settled: 10 });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.id)))?.orderedMedia,
  ).toBeUndefined();
});

it("a failed final staged analysis cannot carry settled preparation counters into a new pure-inference generation", async () => {
  const s = await setup();
  await s.request();
  await s.t.action(internal.orderedMedia.prepare, { id: s.id, generation: 2 });
  provider.invoke.mockImplementationOnce(async (_ctx, _payload, record) => {
    record({
      costMicros: 462,
      inputTokens: 1,
      outputTokens: 1,
      usdEstimate: 0.0001,
      costPolicy: googleCostPolicy,
    });
    return { output: { invalid: true } };
  });
  await s.t.action(internal.serviceArtifactInference.analyze, {
    id: s.id,
    generation: 2,
  });
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe("failed");
  await expect(
    s.t.mutation(internal.serviceArtifactRuntime.request, {
      id: s.id,
      expectedGeneration: 2,
      language: "en",
    }),
  ).rejects.toThrow("ORDERED_PREPARATION_REVIEW_REQUIRED");
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.generation).toBe(2);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([{ state: "settled", settled: 2, max: 10 }]);
  expect(provider.decode).toHaveBeenCalledTimes(1);
  expect(provider.invoke).toHaveBeenCalledTimes(2);
});
