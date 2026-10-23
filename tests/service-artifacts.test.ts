import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  serviceArtifactCurrent,
  serviceCompatibility,
  lookupServiceArtifact,
  sweepExpiredServiceArtifacts,
} from "../convex/lib/serviceArtifacts";
import { reusableArtifact } from "../convex/lib/publicKnowledge";
import { wallet } from "../convex/product";
import {
  socialHash,
  socialRevisionHash,
  type SocialPost,
  type SocialRights,
} from "../packages/social/contracts";
import {
  googleCostPolicy,
  googleInferenceModel,
} from "../packages/providers/google-inference";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers();
  const now = Date.now();
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject: "service-fixture",
    email: "service@example.test",
    name: "Synthetic service owner",
    verified: true,
  });
  const owner = t.withIdentity({
    subject: "service-fixture",
    auth_time: Math.floor(now / 1000),
  });
  const org = await owner.mutation(api.organizations.create, {
    name: "Synthetic service workspace",
  });
  const rights: SocialRights = {
    version: "social-rights-v1",
    evidenceId: "synthetic-provider-review",
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
    expiresAt: now + 200000,
    maxRetentionMs: 100000,
    deletionWithinMs: 3600000,
  };
  const configuration = {
    version: "creator-provider-v1",
    provider: rights.provider,
    rights,
    reviewReference: "synthetic-rights-and-pricing",
    expiresAt: now + 200000,
    budgetKey: "social-discovery-usd-micros:v1:fixture",
    ceilingUsdMicros: 100,
    perCheckUsdMicros: 10,
    maximumChecks: 10,
    includesMinimumRetriesStorageAndLag: true,
    includesDeliveryAndRevocationCleanup: true,
  };
  vi.stubEnv("CREATOR_FOLLOWING_ENABLED", "true");
  vi.stubEnv("CREATOR_SERVICE_REUSE_ENABLED", "true");
  vi.stubEnv("CREATOR_SERVICE_ORGANIZATION_ID", org);
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", JSON.stringify(configuration));
  vi.stubEnv("HOSTED_MEDIA_ACCEPTANCE_ENABLED", "true");
  vi.stubEnv("HOSTED_MEDIA_ANALYSIS_SUBJECTS_JSON", '["service-fixture"]');
  const post: SocialPost = {
    schemaVersion: "social-post-v1",
    platform: "instagram",
    creatorId: "creator1",
    postId: "provider1",
    canonical: "https://www.instagram.com/p/fixture1/",
    publishedAt: null,
    observedAt: now - 1000,
    dateReliability: "unknown",
    caption: "Synthetic neutral caption",
    captionHash: await socialHash("Synthetic neutral caption"),
    assets: [
      {
        id: "slide1",
        index: 0,
        kind: "image",
        mime: "image/jpeg",
        contentHash: await socialHash("synthetic image bytes"),
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
  const compatibility = await serviceCompatibility(prepared, "en", rights, now);
  const sourceId = await t.run((ctx) =>
    ctx.db.insert("sources", {
      organizationId: org,
      createdAt: now - 1000,
      updatedAt: now,
      key: "service-fixture",
      canonical: post.canonical,
      kind: "url",
      title: "Synthetic service post",
      tags: [],
      state: "ready",
      generation: 1,
      coverage: "metadata_only",
      rightsAttested: true,
      managedAnalysisActor: actor,
      orderedMedia: prepared,
      serviceIntent: {
        schemaVersion: "service-social-v1",
        generation: 1,
        ...compatibility,
      },
      processingStartedAt: now - 500,
    }),
  );
  const result = {
    schemaVersion: "3.0.0",
    sourceId,
    processingRunId: `${sourceId}:1`,
    postRevisionHash: post.revisionHash,
    coverage: "ordered_media",
    summary: "A neutral synthetic summary",
    warnings: [],
    insights: [
      {
        id: "idea1",
        kind: "idea",
        title: "Read the label",
        claim: "The inspected image contains a synthetic label.",
        interpretation: "Check the original before applying it.",
        categories: ["general_advice"],
        evidence: [
          {
            kind: "image_observation",
            id: "visible1",
            startMs: null,
            endMs: null,
          },
        ],
        confidence: "supported",
        verificationNeeds: [],
      },
    ],
  };
  // Synthetic receipt and reservation model the existing settled managed route;
  // no provider action, credit reservation or workflow is invoked by these tests.
  const receipt = {
    generation: 1,
    route: "google_metered",
    model: googleInferenceModel,
    costPolicy: googleCostPolicy,
    startedAt: now - 500,
    completedAt: now - 100,
    inputTokens: 100,
    outputTokens: 100,
    inferenceMicros: 462,
    computeCredits: 1,
    chargedCredits: 2,
    reusedMedia: false,
  };
  const reservationId = await t.run(async (ctx) => {
    await ctx.db.patch(sourceId, {
      analysis: result,
      processingReceipt: receipt,
    });
    return ctx.db.insert("reservations", {
      organizationId: org,
      createdAt: now - 600,
      updatedAt: now,
      key: `source:${sourceId}:1`,
      max: 10,
      settled: 2,
      state: "settled",
      expiresAt: now + 100000,
      dispatchedAt: now - 400,
    });
  });
  const args = {
    sourceId,
    generation: 1,
    compatibilityKey: compatibility.compatibilityKey,
    result,
  };
  return {
    t,
    actor,
    owner,
    org,
    now,
    rights,
    configuration,
    prepared,
    compatibility,
    sourceId,
    reservationId,
    result,
    receipt,
    args,
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function commit(s: Fixture) {
  return s.t.mutation(internal.serviceArtifacts.commit, s.args);
}
async function read(
  s: Fixture,
  id: Awaited<ReturnType<typeof commit>>["artifactId"],
) {
  return s.t.run(async (ctx) =>
    serviceArtifactCurrent(ctx, await ctx.db.get(id)),
  );
}

it("commits only validated neutral data, reuses idempotently and stays outside edition reuse", async () => {
  const s = await setup();
  const first = await commit(s);
  expect(first.reused).toBe(false);
  expect(await commit(s)).toEqual({ ...first, reused: true });
  const current = await read(s, first.artifactId);
  expect(current?.analysis).toEqual(s.result);
  expect(current?.artifact.retainUntil).toBe(
    s.prepared.post.observedAt + s.rights.maxRetentionMs,
  );
  expect(
    await s.t.run((ctx) => reusableArtifact(ctx, first.artifactId)),
  ).toBeNull();
  expect(
    (
      await s.t.run((ctx) =>
        lookupServiceArtifact(ctx, s.args.compatibilityKey),
      )
    )?.artifact._id,
  ).toBe(first.artifactId);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
});

it.each([
  "CREATOR_SERVICE_REUSE_ENABLED",
  "CREATOR_FOLLOWING_ENABLED",
  "CREATOR_SERVICE_ORGANIZATION_ID",
  "HOSTED_MEDIA_ACCEPTANCE_ENABLED",
])("requires the current server gate %s at commit and reuse", async (gate) => {
  const s = await setup();
  const a = await commit(s);
  vi.stubEnv(gate, "");
  expect(await read(s, a.artifactId)).toBeNull();
  await expect(commit(s)).rejects.toThrow();
});

it.each([
  "crossCustomerReuse",
  "mediaAcquisition",
  "aiProcessing",
  "collection",
] as const)(
  "revoking %s immediately denies reads before retention and needs explicit old-policy scrubbing",
  async (field) => {
    const s = await setup();
    const a = await commit(s);
    vi.stubEnv(
      "CREATOR_PROVIDER_CONFIGURATION",
      JSON.stringify({
        ...s.configuration,
        rights: { ...s.rights, [field]: false },
      }),
    );
    expect(await read(s, a.artifactId)).toBeNull();
    await expect(commit(s)).rejects.toThrow();
    expect((await s.t.run((ctx) => ctx.db.get(a.artifactId)))?.state).toBe(
      "eligible",
    );
    expect(
      await s.t.mutation(internal.serviceArtifacts.invalidatePolicy, {
        rightsHash: s.compatibility.rightsHash,
      }),
    ).toMatchObject({ scrubbed: 1 });
    const row = await s.t.run((ctx) => ctx.db.get(a.artifactId));
    expect(row).toMatchObject({ state: "blocked" });
    expect(row).not.toHaveProperty("data");
  },
);

it("binds exact current provider identity, route, policy hash and fresh owner authorization", async () => {
  const s = await setup();
  const a = await commit(s);
  for (const rights of [
    { ...s.rights, evidenceId: "different-review" },
    { ...s.rights, routes: ["own_subscription"] },
    { ...s.rights, expiresAt: s.now },
  ]) {
    vi.stubEnv(
      "CREATOR_PROVIDER_CONFIGURATION",
      JSON.stringify({ ...s.configuration, rights }),
    );
    expect(await read(s, a.artifactId)).toBeNull();
  }
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", JSON.stringify(s.configuration));
  await s.t.run((ctx) => ctx.db.patch(s.actor, { status: "deleting" }));
  expect(await read(s, a.artifactId)).toBeNull();
});

it.each([
  "generation",
  "sourceRevision",
  "analysis",
  "intent",
  "local",
  "rights",
  "owner",
])("does not let changed %s reuse an old artifact", async (change) => {
  const s = await setup();
  const a = await commit(s);
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!;
    if (change === "generation")
      await ctx.db.patch(s.sourceId, { generation: 2 });
    if (change === "sourceRevision")
      await ctx.db.patch(s.sourceId, { updatedAt: s.now + 1 });
    if (change === "analysis")
      await ctx.db.patch(s.sourceId, {
        analysis: { ...s.result, summary: "Changed output" },
      });
    if (change === "intent")
      await ctx.db.patch(s.sourceId, {
        serviceIntent: { ...source.serviceIntent!, generation: 2 },
      });
    if (change === "local")
      await ctx.db.patch(s.sourceId, { managedAnalysisActor: undefined });
    if (change === "rights")
      await ctx.db.patch(s.sourceId, { rightsAttested: false });
    if (change === "owner") await ctx.db.patch(s.org, { status: "deleting" });
  });
  expect(await read(s, a.artifactId)).toBeNull();
});

it.each([
  "missing",
  "active",
  "wrongCharge",
  "undispatched",
  "earlyDispatch",
  "wrongStart",
])(
  "requires a confirmed matching managed receipt/reservation: %s",
  async (change) => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      if (change === "missing") await ctx.db.delete(s.reservationId);
      if (change === "active")
        await ctx.db.patch(s.reservationId, { state: "active" });
      if (change === "wrongCharge")
        await ctx.db.patch(s.reservationId, { settled: 0 });
      if (change === "undispatched")
        await ctx.db.patch(s.reservationId, { dispatchedAt: undefined });
      if (change === "earlyDispatch")
        await ctx.db.patch(s.reservationId, { dispatchedAt: s.now - 1000 });
      if (change === "wrongStart")
        await ctx.db.patch(s.sourceId, {
          processingReceipt: { ...s.receipt, startedAt: s.now - 501 },
        });
    });
    await expect(commit(s)).rejects.toThrow("RECEIPT_UNCONFIRMED");
    expect(
      await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect()),
    ).toEqual([]);
  },
);

it("rejects forged key, invented timestamps, private extra fields and changed evidence hashes", async () => {
  const s = await setup();
  await expect(
    s.t.mutation(internal.serviceArtifacts.commit, {
      ...s.args,
      compatibilityKey: "a".repeat(64),
    }),
  ).rejects.toThrow("COMPATIBILITY_CHANGED");
  await expect(
    s.t.mutation(internal.serviceArtifacts.commit, {
      ...s.args,
      result: { ...s.result, privateContext: "Customer overlay" },
    }),
  ).rejects.toThrow();
  const altered = {
    ...s.result,
    insights: [
      {
        ...s.result.insights[0],
        evidence: [
          { ...s.result.insights[0].evidence[0], startMs: 0, endMs: 1 },
        ],
      },
    ],
  };
  await expect(
    s.t.mutation(internal.serviceArtifacts.commit, {
      ...s.args,
      result: altered,
    }),
  ).rejects.toThrow("CITATION");
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      orderedMedia: {
        ...s.prepared,
        evidence: [{ ...s.prepared.evidence[0], text: "Changed observation" }],
      },
    }),
  );
  await expect(commit(s)).rejects.toThrow("HASH");
});

it("uses actual acquired media/evidence and prompt settings rather than discovery metadata as compatibility", async () => {
  const s = await setup();
  const french = await serviceCompatibility(s.prepared, "fr", s.rights, s.now);
  expect(french.compatibilityKey).not.toBe(s.compatibility.compatibilityKey);
  const changed = structuredClone(s.prepared);
  changed.post.assets[0].contentHash = await socialHash(
    "different acquired bytes",
  );
  changed.post.revisionHash = await socialRevisionHash(changed.post);
  changed.evidence[0].postRevisionHash = changed.post.revisionHash;
  expect(
    (await serviceCompatibility(changed, "en", s.rights, s.now))
      .compatibilityKey,
  ).not.toBe(s.compatibility.compatibilityKey);
  await expect(
    serviceCompatibility(
      {
        ...s.prepared,
        post: { ...s.prepared.post, revisionHash: "apify-meta-v1:abc" },
      },
      "en",
      s.rights,
      s.now,
    ),
  ).rejects.toThrow();
});

it("denies at the exact deadline and catches locked consumed callbacks without touching fresh generation data", async () => {
  const s = await setup();
  const old = await commit(s);
  const row = (await s.t.run((ctx) => ctx.db.get(old.artifactId)))!;
  if (row.origin !== "service") throw Error("fixture");
  vi.setSystemTime(row.retainUntil);
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    await s.t.mutation(internal.serviceArtifacts.expire, {
      id: old.artifactId,
      retainUntil: row.retainUntil,
    }),
  ).toEqual({ paused: true });
  expect(await read(s, old.artifactId)).toBeNull();
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      generation: 2,
      text: "Fresh private source",
      analysis: { fresh: true },
    }),
  );
  vi.stubEnv("RESTORE_LOCK", "false");
  expect(await s.t.run((ctx) => sweepExpiredServiceArtifacts(ctx))).toEqual({
    scrubbed: 1,
  });
  const scrubbed = await s.t.run((ctx) => ctx.db.get(old.artifactId));
  expect(scrubbed).toMatchObject({ state: "blocked" });
  expect(scrubbed).not.toHaveProperty("data");
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toMatchObject({
    generation: 2,
    text: "Fresh private source",
    analysis: { fresh: true },
  });
  expect(
    await s.t.mutation(internal.serviceArtifacts.expire, {
      id: old.artifactId,
      retainUntil: row.retainUntil,
    }),
  ).toEqual({ scrubbed: false });
});

it("the actually scheduled expiry can be consumed under restore lock and the existing privacy sweep catches it after unlock", async () => {
  const s = await setup();
  const a = await commit(s);
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    jobs.filter((job) => job.name.endsWith("serviceArtifacts:expire")),
  ).toHaveLength(1);
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 12);
  expect((await s.t.run((ctx) => ctx.db.get(a.artifactId)))?.state).toBe(
    "eligible",
  );
  expect(await read(s, a.artifactId)).toBeNull();
  vi.stubEnv("RESTORE_LOCK", "false");
  await s.t.mutation(internal.privacy.sweep, {});
  const row = await s.t.run((ctx) => ctx.db.get(a.artifactId));
  expect(row).toMatchObject({ state: "blocked" });
  expect(row).not.toHaveProperty("data");
});

it("expiry callbacks fence exact artifact/deadline and cannot target editions or early data", async () => {
  const s = await setup();
  const a = await commit(s);
  const row = (await s.t.run((ctx) => ctx.db.get(a.artifactId)))!;
  if (row.origin !== "service") throw Error("fixture");
  expect(
    await s.t.mutation(internal.serviceArtifacts.expire, {
      id: a.artifactId,
      retainUntil: row.retainUntil,
    }),
  ).toEqual({ scrubbed: false });
  vi.setSystemTime(row.retainUntil);
  expect(
    await s.t.mutation(internal.serviceArtifacts.expire, {
      id: a.artifactId,
      retainUntil: row.retainUntil + 1,
    }),
  ).toEqual({ scrubbed: false });
  expect((await s.t.run((ctx) => ctx.db.get(a.artifactId)))?.state).toBe(
    "eligible",
  );
});

it("scrubs at most five due/policy rows per call, preserves fresh-policy rows and pauses while locked", async () => {
  const s = await setup();
  const a = await commit(s);
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.get(a.artifactId))!;
    if (row.origin !== "service") throw Error("fixture");
    const { _id, _creationTime, ...copy } = row;
    for (let i = 0; i < 7; i++)
      await ctx.db.insert("publicArtifacts", {
        ...copy,
        compatibilityKey: `${i}`.padStart(64, "a"),
      });
    await ctx.db.insert("publicArtifacts", {
      ...copy,
      rightsHash: "b".repeat(64),
    });
  });
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    await s.t.mutation(internal.serviceArtifacts.invalidatePolicy, {
      rightsHash: s.compatibility.rightsHash,
    }),
  ).toMatchObject({ paused: true, scrubbed: 0 });
  vi.stubEnv("RESTORE_LOCK", "false");
  expect(
    await s.t.mutation(internal.serviceArtifacts.invalidatePolicy, {
      rightsHash: s.compatibility.rightsHash,
    }),
  ).toEqual({ scrubbed: 5, morePossible: true });
  expect(
    await s.t.mutation(internal.serviceArtifacts.invalidatePolicy, {
      rightsHash: s.compatibility.rightsHash,
    }),
  ).toEqual({ scrubbed: 3, morePossible: false });
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("publicArtifacts")
        .filter((q) => q.eq(q.field("state"), "eligible"))
        .collect(),
    ),
  ).toHaveLength(1);
});

it("has no public mutation for minting service artifacts", async () => {
  const s = await setup();
  await expect(
    s.owner.mutation(internal.serviceArtifacts.commit, s.args),
  ).resolves.toHaveProperty("artifactId");
  // Visibility is a serialized Convex contract, not inferred from caller identity.
  const artifactModule = await import("../convex/serviceArtifacts");
  expect(artifactModule.commit.isInternal).toBe(true);
});

async function recipient(s: Fixture, name = "recipient") {
  const actor = await s.t.mutation(internal.accounts.syncUser, {
    subject: name,
    email: `${name}@example.test`,
    name: "Synthetic recipient",
    verified: true,
  });
  const client = s.t.withIdentity({
    subject: name,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const org = await client.mutation(api.organizations.createPrivate, {});
  await s.t.run(async (ctx) => {
    const w = await wallet(ctx, org);
    await ctx.db.patch(w._id, { granted: 100 });
  });
  return { actor, client, org };
}
it("saves one opaque reference in a private library without reserving/analysing and retains authored overlays on withdrawal", async () => {
  const s = await setup();
  const a = await commit(s);
  const r = await recipient(s);
  const args = {
    organizationId: r.org,
    artifactId: a.artifactId,
    expectedCompatibilityKey: s.args.compatibilityKey,
  };
  const preview = await r.client.query(api.serviceArtifacts.preview, args);
  expect(preview?.insights[0].citations[0]).toMatchObject({
    kind: "image_observation",
    startMs: null,
    endMs: null,
    assetIndex: 0,
  });
  expect(JSON.stringify(preview)).not.toContain("A visible synthetic label");
  expect(JSON.stringify(preview)).not.toContain("processingRunId");
  const saved = await r.client.mutation(api.serviceArtifacts.save, args);
  expect(saved).toMatchObject({
    chargedCredits: 0,
    processingStarted: false,
    reused: true,
  });
  expect(await r.client.mutation(api.serviceArtifacts.save, args)).toEqual(
    saved,
  );
  const source = await s.t.run((ctx) => ctx.db.get(saved.sourceId));
  expect(source).not.toHaveProperty("analysis");
  expect(source?.text).not.toContain(s.prepared.post.caption);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("localLibraryRuns").collect()),
  ).toHaveLength(0);
  const detail = await r.client.query(api.publicKnowledge.savedDetail, {
    sourceId: saved.sourceId,
  });
  expect(detail).toMatchObject({
    origin: "service",
    available: true,
    edition: null,
    canEdit: true,
  });
  await r.client.mutation(api.publicKnowledge.savePersonalLayer, {
    sourceId: saved.sourceId,
    expectedUpdatedAt: detail!.updatedAt,
    note: "Authored private note",
    corrections: [{ insightId: "idea1", text: "Authored correction" }],
  });
  vi.stubEnv("CREATOR_SERVICE_REUSE_ENABLED", "false");
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toMatchObject({
    available: false,
    service: null,
    privateNote: "Authored private note",
    corrections: [{ insightId: "idea1", text: "Authored correction" }],
  });
});

it("denies shared-workspace/viewer/foreign-tenant imports and refuses stale compatibility or invented corrections", async () => {
  const s = await setup();
  const a = await commit(s);
  const r = await recipient(s);
  const args = {
    organizationId: r.org,
    artifactId: a.artifactId,
    expectedCompatibilityKey: s.args.compatibilityKey,
  };
  await expect(
    s.owner.mutation(api.serviceArtifacts.save, args),
  ).rejects.toThrow();
  await expect(
    s.owner.mutation(api.serviceArtifacts.save, {
      ...args,
      organizationId: s.org,
    }),
  ).rejects.toThrow("private library");
  await expect(
    r.client.mutation(api.serviceArtifacts.save, {
      ...args,
      expectedCompatibilityKey: "b".repeat(64),
    }),
  ).rejects.toThrow("unavailable");
  const saved = await r.client.mutation(api.serviceArtifacts.save, args);
  const detail = await r.client.query(api.publicKnowledge.savedDetail, {
    sourceId: saved.sourceId,
  });
  await expect(
    r.client.mutation(api.publicKnowledge.savePersonalLayer, {
      sourceId: saved.sourceId,
      expectedUpdatedAt: detail!.updatedAt,
      note: "",
      corrections: [{ insightId: "invented", text: "Changed claim" }],
    }),
  ).rejects.toThrow("current published insights");
  await expect(
    s.owner.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).rejects.toThrow();
  const member = await s.t.run((ctx) =>
    ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", r.org).eq("userId", r.actor),
      )
      .unique(),
  );
  await s.t.run((ctx) => ctx.db.patch(member!._id, { role: "viewer" }));
  await expect(
    r.client.query(api.serviceArtifacts.preview, args),
  ).rejects.toThrow();
});

it("source invalidation scrubs only bounded old generations and delayed cleanup preserves a recovered artifact", async () => {
  const s = await setup();
  const a = await commit(s);
  const freshResult = { ...s.result, processingRunId: `${s.sourceId}:2` };
  vi.setSystemTime(s.now + 10);
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.get(a.artifactId))!;
    if (row.origin !== "service") throw Error("fixture");
    const { _id, _creationTime, ...copy } = row;
    for (let i = 0; i < 6; i++)
      await ctx.db.insert("publicArtifacts", { ...copy });
    await ctx.db.patch(s.sourceId, {
      generation: 2,
      updatedAt: s.now + 10,
      analysis: freshResult,
      serviceIntent: {
        schemaVersion: "service-social-v1",
        generation: 2,
        ...s.compatibility,
      },
      processingStartedAt: s.now + 1,
      processingReceipt: {
        ...s.receipt,
        generation: 2,
        startedAt: s.now + 1,
        completedAt: s.now + 9,
      },
    });
    await ctx.db.insert("reservations", {
      organizationId: s.org,
      key: `source:${s.sourceId}:2`,
      createdAt: s.now,
      updatedAt: s.now + 10,
      max: 10,
      settled: 2,
      state: "settled",
      expiresAt: s.now + 100000,
      dispatchedAt: s.now + 2,
    });
  });
  const fresh = await s.t.mutation(internal.serviceArtifacts.commit, {
    ...s.args,
    generation: 2,
    result: freshResult,
  });
  expect((await read(s, fresh.artifactId))?.analysis.processingRunId).toBe(
    `${s.sourceId}:2`,
  );
  expect(
    await s.t.mutation(internal.serviceArtifacts.invalidateSource, {
      sourceId: s.sourceId,
      maxGeneration: 1,
    }),
  ).toEqual({ scrubbed: 5 });
  expect(
    await s.t.mutation(internal.serviceArtifacts.invalidateSource, {
      sourceId: s.sourceId,
      maxGeneration: 1,
    }),
  ).toEqual({ scrubbed: 2 });
  expect((await read(s, fresh.artifactId))?.artifact.state).toBe("eligible");
});

it("full source removal scrubs the service payload through the existing source invalidation hook", async () => {
  const s = await setup();
  const a = await commit(s);
  await s.t.mutation(internal.publicKnowledge.invalidateSource, {
    sourceId: s.sourceId,
  });
  const row = await s.t.run((ctx) => ctx.db.get(a.artifactId));
  expect(row).toMatchObject({ state: "blocked" });
  expect(row).not.toHaveProperty("data");
});

it("rejects an oversized neutral artifact before inserting or scheduling it", async () => {
  const s = await setup();
  const huge = {
    ...s.result,
    insights: Array.from({ length: 20 }, (_, i) => ({
      ...s.result.insights[0],
      id: `idea${i}`,
      claim: "x".repeat(2000),
      interpretation: "y".repeat(2000),
      verificationNeeds: Array.from({ length: 10 }, () => "z".repeat(500)),
    })),
  };
  const prepared = {
    ...s.prepared,
    evidence: Array.from({ length: 100 }, (_, i) => ({
      ...s.prepared.evidence[0],
      id: `e${i}`,
      text: "x".repeat(6000),
      textHash: "a".repeat(64),
    })),
  };
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { analysis: huge, orderedMedia: prepared }),
  );
  await expect(
    s.t.mutation(internal.serviceArtifacts.commit, { ...s.args, result: huge }),
  ).rejects.toThrow("SIZE_OR_SECRET");
  expect(
    await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect()),
  ).toEqual([]);
});
