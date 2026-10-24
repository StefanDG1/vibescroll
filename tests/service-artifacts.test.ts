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
  sweepRetainedServiceArtifactCopies,
} from "../convex/lib/serviceArtifacts";
import { reusableArtifact } from "../convex/lib/publicKnowledge";
import { wallet } from "../convex/product";
import {
  socialHash,
  socialRevisionHash,
  type SocialPost,
  type SocialRights,
} from "../packages/social/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { browseServiceArtifactsCore } from "../convex/serviceArtifacts";
import { serviceCatalogPage } from "../packages/social/catalog";
import {
  serviceCatalogProjection,
  serviceCatalogSearchMaxBytes,
} from "../packages/social/catalog-search";
import {
  googleCostPolicy,
  googleInferenceModel,
} from "../packages/providers/google-inference";

const modules = import.meta.glob("../convex/**/*.ts");
const stripeMocks = vi.hoisted(() => ({
  account: vi.fn(),
  customer: vi.fn(),
  subscriptions: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: stripeMocks.account };
    customers = { retrieve: stripeMocks.customer };
    subscriptions = { list: stripeMocks.subscriptions };
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetAllMocks();
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
  const grant = await s.t.run(async (ctx) => {
    await wallet(ctx, org);
    const now = Date.now();
    const periodEnd = now + 86400000;
    await ctx.db.insert("billing", {
      organizationId: org,
      customerId: `synthetic-${name}`,
      subscriptionId: `subscription-${name}`,
      status: "active",
      periodEnd,
      verifiedAt: now,
      revision: 1,
      appliedRevision: 1,
    });
    return { start: now, end: periodEnd };
  });
  await s.t.mutation(internal.commerce.grantPeriod, {
    organizationId: org,
    subscription: `subscription-${name}`,
    tier: "pro",
    interval: "monthly",
    ...grant,
    verifiedPayment: true,
    billingRevision: 1,
  });
  return { actor, client, org };
}

async function savedCopy(s: Fixture) {
  const artifact = await commit(s);
  const r = await recipient(s);
  const args = {
    organizationId: r.org,
    artifactId: artifact.artifactId,
    expectedCompatibilityKey: s.args.compatibilityKey,
  };
  const saved = await r.client.mutation(api.serviceArtifacts.save, args);
  const source = (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))!;
  const layer = (await s.t.run((ctx) => ctx.db.get(source.publicImportId!)))!;
  if (layer.origin !== "service") throw Error("fixture");
  return { r, args, saved, layer };
}

async function catalogArtifacts(s: Fixture, count: number) {
  const first = await commit(s);
  return s.t.run(async (ctx) => {
    const row = (await ctx.db.get(first.artifactId))!;
    if (row.origin !== "service") throw Error("fixture");
    const { _id, _creationTime, ...copy } = row;
    const ids = [_id];
    for (let i = 1; i < count; i++)
      ids.push(
        await ctx.db.insert("publicArtifacts", {
          ...copy,
          retainUntil: row.retainUntil - i,
        }),
      );
    return ids;
  });
}

it("authorizes catalog browsing before reading global artifacts for anonymous, non-Pro and foreign callers", async () => {
  const s = await setup();
  await commit(s);
  const r = await recipient(s);
  const other = await recipient(s, "foreign-browser");
  const args = { organizationId: r.org, cursor: null };
  const assertDenied = async (client: typeof r.client, message: string) =>
    client.query(async (ctx) => {
      const original = ctx.db.query.bind(ctx.db);
      const globalReads: string[] = [];
      const spy = vi.spyOn(ctx.db, "query").mockImplementation((table) => {
        if (table === "publicArtifacts") globalReads.push(table);
        return original(table);
      });
      try {
        for (const query of [undefined, "label"])
          await expect(
            browseServiceArtifactsCore(ctx, { ...args, query }),
          ).rejects.toThrow(message);
        expect(globalReads).toEqual([]);
      } finally {
        spy.mockRestore();
      }
      return null;
    });
  await assertDenied(s.t, "Sign in");
  await assertDenied(other.client, "Organization unavailable");
  for (const tier of ["free", "starter"]) {
    await s.t.run(async (ctx) => {
      const w = (await ctx.db
        .query("wallets")
        .withIndex("by_org", (q) => q.eq("organizationId", r.org))
        .unique())!;
      await ctx.db.patch(w._id, { tier });
    });
    await assertDenied(r.client, "Pro");
  }
});

it("returns bounded validated catalog cards and preserves paging as time advances", async () => {
  const s = await setup();
  s.result.summary = "S".repeat(1250);
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { analysis: s.result }));
  const ids = await catalogArtifacts(s, 7);
  const r = await recipient(s);
  const first = await r.client.query(api.serviceArtifacts.browse, {
    organizationId: r.org,
    cursor: null,
  });
  expect(serviceCatalogPage.parse(first)).toEqual(first);
  expect(first.page).toHaveLength(5);
  expect(first).toMatchObject({
    version: "service-catalog-v2",
    availability: "ready",
    isDone: false,
  });
  expect(first.continueCursor).toBeTypeOf("string");
  expect(first.page[0]).toEqual({
    artifactId: ids[0],
    compatibilityKey: s.compatibility.compatibilityKey,
    title: "Read the label",
    summary: "S".repeat(1200),
    summaryTruncated: true,
    sourceUrl: s.prepared.post.canonical,
    platform: "instagram",
    language: "en",
    insightCount: 1,
    availableUntil: s.prepared.post.observedAt + s.rights.maxRetentionMs,
    categories: ["general_advice"],
    topics: [],
    creatorId: "creator1",
    publishedAt: null,
  });
  vi.setSystemTime(s.now + 1);
  const second = await r.client.query(api.serviceArtifacts.browse, {
    organizationId: r.org,
    cursor: first.continueCursor,
  });
  expect(second).toMatchObject({
    availability: "ready",
    isDone: true,
    continueCursor: null,
  });
  expect(second.page).toHaveLength(2);
  expect(
    [...first.page, ...second.page].map((card) => card.artifactId),
  ).toEqual(ids);
  const serialized = JSON.stringify(first);
  for (const hidden of [
    s.actor,
    s.sourceId,
    "A visible synthetic label",
    "processingRunId",
    "citations",
    "fundingOwner",
  ])
    expect(serialized).not.toContain(hidden);
});

it("filters expired, blocked, stale and malformed records without erasing an empty page continuation", async () => {
  const s = await setup();
  const ids = await catalogArtifacts(s, 8);
  const r = await recipient(s);
  await s.t.run(async (ctx) => {
    await ctx.db.patch(ids[0], { contentHash: "b".repeat(64) });
    await ctx.db.patch(ids[1], { evidenceHash: "c".repeat(64) });
    await ctx.db.patch(ids[2], { data: { malformed: true } });
    await ctx.db.patch(ids[3], { generation: 2 });
    await ctx.db.patch(ids[4], { data: undefined });
    await ctx.db.patch(ids[5], { state: "blocked" });
    await ctx.db.patch(ids[7], { retainUntil: s.now });
  });
  const first = await r.client.query(api.serviceArtifacts.browse, {
    organizationId: r.org,
    cursor: null,
  });
  expect(first).toMatchObject({
    availability: "ready",
    page: [],
    isDone: false,
  });
  expect(first.continueCursor).toBeTypeOf("string");
  const second = await r.client.query(api.serviceArtifacts.browse, {
    organizationId: r.org,
    cursor: first.continueCursor,
  });
  expect(second).toMatchObject({
    availability: "ready",
    isDone: true,
    continueCursor: null,
  });
  expect(second.page.map((card) => card.artifactId)).toEqual([ids[6]]);
});

it("reports unavailable configuration after authorization and rejects empty or overlong catalog cursors", async () => {
  const s = await setup();
  await commit(s);
  const r = await recipient(s);
  for (const cursor of ["", "x".repeat(8193)])
    await expect(
      r.client.query(api.serviceArtifacts.browse, {
        organizationId: r.org,
        cursor,
      }),
    ).rejects.toThrow("valid catalog continuation");
  for (const [name, value] of [
    ["CREATOR_SERVICE_REUSE_ENABLED", "false"],
    ["CREATOR_PROVIDER_CONFIGURATION", "unavailable"],
  ]) {
    vi.stubEnv(name, value);
    expect(
      await r.client.query(api.serviceArtifacts.browse, {
        organizationId: r.org,
        cursor: null,
      }),
    ).toEqual({
      version: "service-catalog-v2",
      availability: "unavailable",
      page: [],
      continueCursor: null,
      isDone: true,
      query: null,
      searchCoverage: "indexed-eligible-generic-analysis",
    });
    await expect(
      s.t.query(api.serviceArtifacts.browse, {
        organizationId: r.org,
        cursor: null,
      }),
    ).rejects.toThrow("Sign in");
    vi.stubEnv("CREATOR_SERVICE_REUSE_ENABLED", "true");
  }
});

it("keeps contribution available on trial and rechecks Pro on each browse continuation without losing a saved copy", async () => {
  const s = await setup();
  expect(await s.t.run(async (ctx) => (await wallet(ctx, s.org)).tier)).toBe(
    "trial",
  );
  const ids = await catalogArtifacts(s, 7);
  const r = await recipient(s);
  const saved = await r.client.mutation(api.serviceArtifacts.save, {
    organizationId: r.org,
    artifactId: ids[0],
    expectedCompatibilityKey: s.compatibility.compatibilityKey,
  });
  const detail = await r.client.query(api.publicKnowledge.savedDetail, {
    sourceId: saved.sourceId,
  });
  const first = await r.client.query(api.serviceArtifacts.browse, {
    organizationId: r.org,
    cursor: null,
  });
  await s.t.run(async (ctx) => {
    const billing = (await ctx.db
      .query("billing")
      .withIndex("by_org", (q) => q.eq("organizationId", r.org))
      .unique())!;
    await ctx.db.patch(billing._id, { status: "canceled" });
  });
  await expect(
    r.client.query(api.serviceArtifacts.browse, {
      organizationId: r.org,
      cursor: first.continueCursor,
    }),
  ).rejects.toThrow("Pro");
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toEqual(detail);
});

it("builds a deterministic UTF8-bounded projection from generic analysis and binds its exact text to content", async () => {
  const s = await setup();
  const analysis = {
    ...s.result,
    insights: Array.from({ length: 5 }, (_, index) => ({
      ...s.result.insights[0],
      id: `idea${index}`,
      claim: "🐢".repeat(400),
      interpretation: "bounded generic interpretation ".repeat(50),
      topics: ["Generic topic"],
    })),
  };
  const projection = await serviceCatalogProjection(analysis, "a".repeat(64));
  expect(await serviceCatalogProjection(analysis, "a".repeat(64))).toEqual(
    projection,
  );
  expect(
    new TextEncoder().encode(projection.catalogSearchText).length,
  ).toBeLessThanOrEqual(serviceCatalogSearchMaxBytes);
  expect(
    new TextDecoder().decode(
      new TextEncoder().encode(projection.catalogSearchText),
    ),
  ).toBe(projection.catalogSearchText);
  expect(projection.catalogSearchText).not.toContain(
    "A visible synthetic label",
  );
  expect(projection.catalogSearchText).not.toContain(s.sourceId);
  expect(
    (await serviceCatalogProjection(analysis, "b".repeat(64)))
      .catalogSearchHash,
  ).not.toBe(projection.catalogSearchHash);
});

it("searches the actual mocked Convex index with five-card pagination and validated public discovery metadata", async () => {
  const s = await setup();
  s.result.insights[0] = {
    ...s.result.insights[0],
    categories: ["coding", "general_advice"],
  };
  const analysis = {
    ...s.result,
    insights: [
      { ...s.result.insights[0], topics: ["Testing", "Accessibility"] },
    ],
  };
  s.args.result = analysis;
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { analysis }));
  await catalogArtifacts(s, 7);
  const r = await recipient(s);
  const first = await r.client.query(api.serviceArtifacts.browse, {
    organizationId: r.org,
    cursor: null,
    query: "  label  ",
  });
  expect(first).toMatchObject({
    version: "service-catalog-v2",
    query: "label",
    searchCoverage: "indexed-eligible-generic-analysis",
    isDone: false,
  });
  expect(first.page).toHaveLength(5);
  expect(first.page[0]).toMatchObject({
    categories: ["coding", "general_advice"],
    topics: ["Accessibility", "Testing"],
    creatorId: "creator1",
    publishedAt: null,
  });
  const second = await r.client.query(api.serviceArtifacts.browse, {
    organizationId: r.org,
    cursor: first.continueCursor,
    query: "label",
  });
  expect(second.page).toHaveLength(2);
  expect(
    new Set([...first.page, ...second.page].map((card) => card.artifactId))
      .size,
  ).toBe(7);
  expect(second).toMatchObject({ isDone: true, continueCursor: null });
  for (const field of [
    "catalogSearchText",
    "catalogSearchHash",
    "fundingOwner",
    "processingRunId",
    "A visible synthetic label",
  ])
    expect(JSON.stringify(first)).not.toContain(field);
  for (const query of [" ", "x".repeat(201)])
    await expect(
      r.client.query(api.serviceArtifacts.browse, {
        organizationId: r.org,
        cursor: null,
        query,
      }),
    ).rejects.toThrow("valid catalog search");
});

it("rejects forged projection text or hashes, reindexes only current generic content and leaves saved copies unchanged", async () => {
  const s = await setup();
  const { r, args, layer } = await savedCopy(s);
  const search = (query = "label") =>
    r.client.query(api.serviceArtifacts.browse, {
      organizationId: r.org,
      cursor: null,
      query,
    });
  expect((await search()).page).toHaveLength(1);
  const artifact = (await s.t.run((ctx) => ctx.db.get(args.artifactId)))!;
  if (artifact.origin !== "service") throw Error("fixture");
  const text = artifact.catalogSearchText + "\npoisonedprivateword";
  const hash = await socialHash(
    canonicalJson({
      version: "service-catalog-search-v1",
      contentHash: artifact.contentHash,
      text,
    }),
  );
  await s.t.run((ctx) =>
    ctx.db.patch(artifact._id, {
      catalogSearchText: text,
      catalogSearchHash: hash,
    }),
  );
  expect((await search("poisonedprivateword")).page).toEqual([]);
  await s.t.run((ctx) =>
    ctx.db.patch(artifact._id, {
      catalogSearchText: artifact.catalogSearchText,
      catalogSearchHash: "b".repeat(64),
    }),
  );
  expect((await search()).page).toEqual([]);
  await s.t.mutation(internal.serviceArtifacts.reindexCatalog, {
    cursor: null,
  });
  expect((await search()).page).toHaveLength(1);
  expect(await s.t.run((ctx) => ctx.db.get(layer._id))).toEqual(layer);
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { generation: 2 }));
  expect((await search()).page).toEqual([]);
  await s.t.mutation(internal.serviceArtifacts.reindexCatalog, {
    cursor: null,
  });
  expect(await s.t.run((ctx) => ctx.db.get(artifact._id))).not.toHaveProperty(
    "catalogSearchText",
  );
  expect(await s.t.run((ctx) => ctx.db.get(layer._id))).toEqual(layer);
});

it("keeps unindexed legacy artifacts browsable and projects them only on explicit reuse or bounded manual reindex", async () => {
  const s = await setup();
  const ids = await catalogArtifacts(s, 7);
  await s.t.run(async (ctx) => {
    for (const id of ids)
      await ctx.db.patch(id, {
        catalogSearchVersion: undefined,
        catalogSearchHash: undefined,
        catalogSearchText: undefined,
      });
    await ctx.db.patch(ids[0], {
      state: "blocked",
      catalogSearchText: "stale projection",
    });
  });
  const r = await recipient(s);
  expect(
    (
      await r.client.query(api.serviceArtifacts.browse, {
        organizationId: r.org,
        cursor: null,
      })
    ).page,
  ).toHaveLength(5);
  // convex-test's search evaluator calls .split on missing optional fields.
  // Verify legacy exclusion through persisted projection state here; actual
  // search/pagination is exercised above with indexed fixture records.
  expect(await s.t.run((ctx) => ctx.db.get(ids[1]))).not.toHaveProperty(
    "catalogSearchText",
  );
  const before = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    await s.t.mutation(internal.serviceArtifacts.reindexCatalog, {
      cursor: null,
    }),
  ).toMatchObject({
    availability: "unavailable",
    paused: true,
    indexed: 0,
    cleared: 0,
  });
  vi.stubEnv("RESTORE_LOCK", "false");
  vi.stubEnv("CREATOR_SERVICE_REUSE_ENABLED", "false");
  expect(
    await s.t.mutation(internal.serviceArtifacts.reindexCatalog, {
      cursor: null,
    }),
  ).toMatchObject({ availability: "unavailable", indexed: 0, cleared: 0 });
  vi.stubEnv("CREATOR_SERVICE_REUSE_ENABLED", "true");
  const first = await s.t.mutation(internal.serviceArtifacts.reindexCatalog, {
    cursor: null,
  });
  expect(first.indexed + first.cleared).toBe(5);
  expect(first.isDone).toBe(false);
  const second = await s.t.mutation(internal.serviceArtifacts.reindexCatalog, {
    cursor: first.continueCursor,
  });
  expect(second.indexed + second.cleared).toBe(2);
  expect(second).toMatchObject({ isDone: true, continueCursor: null });
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toEqual(before);
  expect(await s.t.run((ctx) => ctx.db.get(ids[0]))).not.toHaveProperty(
    "catalogSearchText",
  );
  await s.t.run(async (ctx) => {
    for (const id of ids.slice(1))
      await ctx.db.patch(id, {
        catalogSearchVersion: undefined,
        catalogSearchHash: undefined,
        catalogSearchText: undefined,
      });
  });
  const reused = await commit(s);
  expect(reused.reused).toBe(true);
  expect(await s.t.run((ctx) => ctx.db.get(reused.artifactId))).toHaveProperty(
    "catalogSearchVersion",
    "service-catalog-search-v1",
  );
});

it("clears search projection on source invalidation and deletes it during actual restore quarantine", async () => {
  const s = await setup();
  const artifact = await commit(s);
  await s.t.mutation(internal.serviceArtifacts.invalidateSource, {
    sourceId: s.sourceId,
    maxGeneration: 1,
  });
  const scrubbed = await s.t.run((ctx) => ctx.db.get(artifact.artifactId));
  for (const field of [
    "data",
    "catalogSearchVersion",
    "catalogSearchText",
    "catalogSearchHash",
  ])
    expect(scrubbed).not.toHaveProperty(field);
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "publicArtifacts",
    cursor: null,
  });
  expect(await s.t.run((ctx) => ctx.db.get(artifact.artifactId))).toBeNull();
});

it("keeps a valid near-limit artifact reusable when its optional search projection has no byte budget", async () => {
  const s = await setup();
  const first = await commit(s);
  const original = (await s.t.run((ctx) => ctx.db.get(first.artifactId)))!;
  if (original.origin !== "service") throw Error("fixture");
  const {
    _id,
    _creationTime,
    catalogSearchText: _catalogSearchText,
    catalogSearchHash: _catalogSearchHash,
    catalogSearchVersion: _catalogSearchVersion,
    ...base
  } = original;
  const result = {
    ...s.result,
    summary: "s".repeat(1500),
    insights: [
      {
        ...s.result.insights[0],
        claim: "c".repeat(2000),
        interpretation: "i".repeat(2000),
      },
    ],
  };
  const textHash = await socialHash("e".repeat(6000));
  const prepared = {
    ...s.prepared,
    evidence: Array.from({ length: 82 }, (_, i) => ({
      ...s.prepared.evidence[0],
      id: i === 0 ? "visible1" : `extra${i}`,
      text: "e".repeat(6000),
      textHash,
    })),
  };
  const size = new TextEncoder().encode(
    canonicalJson({ ...base, data: { analysis: result, prepared } }),
  ).length;
  const excess = size - (512 * 1024 - 256 - 1000);
  expect(excess).toBeGreaterThanOrEqual(0);
  expect(excess).toBeLessThan(6000);
  const last = prepared.evidence[prepared.evidence.length - 1];
  last.text = last.text.slice(0, last.text.length - excess);
  last.textHash = await socialHash(last.text);
  const compatibility = await serviceCompatibility(
    prepared,
    "en",
    s.rights,
    s.now,
  );
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      orderedMedia: prepared,
      analysis: result,
      serviceIntent: {
        schemaVersion: "service-social-v1",
        generation: 1,
        ...compatibility,
      },
    }),
  );
  const args = {
    ...s.args,
    result,
    compatibilityKey: compatibility.compatibilityKey,
  };
  const committed = await s.t.mutation(internal.serviceArtifacts.commit, args);
  const artifact = await s.t.run((ctx) => ctx.db.get(committed.artifactId));
  expect(artifact).not.toHaveProperty("catalogSearchText");
  expect(await read(s, committed.artifactId)).not.toBeNull();
  expect(await s.t.mutation(internal.serviceArtifacts.commit, args)).toEqual({
    ...committed,
    reused: true,
  });
});

it.each([
  "free",
  "starter",
  "stale verification",
  "future verification",
  "canceled",
  "provider deletion",
  "expired billing",
  "expired wallet",
  "mismatched period",
  "different subscription",
])(
  "denies fresh catalog preview and save with %s entitlement",
  async (condition) => {
    const s = await setup();
    const artifact = await commit(s);
    const r = await recipient(s);
    await s.t.run(async (ctx) => {
      const billing = (await ctx.db
        .query("billing")
        .withIndex("by_org", (q) => q.eq("organizationId", r.org))
        .unique())!;
      const w = (await ctx.db
        .query("wallets")
        .withIndex("by_org", (q) => q.eq("organizationId", r.org))
        .unique())!;
      if (condition === "free" || condition === "starter")
        await ctx.db.patch(w._id, { tier: condition });
      if (condition === "stale verification")
        await ctx.db.patch(billing._id, { verifiedAt: s.now - 86400000 });
      if (condition === "future verification")
        await ctx.db.patch(billing._id, { verifiedAt: s.now + 1 });
      if (condition === "canceled")
        await ctx.db.patch(billing._id, { status: "canceled" });
      if (condition === "provider deletion")
        await ctx.db.patch(billing._id, { providerDeletedAt: s.now });
      if (condition === "expired billing")
        await ctx.db.patch(billing._id, { periodEnd: s.now });
      if (condition === "expired wallet")
        await ctx.db.patch(w._id, { periodEnd: s.now });
      if (condition === "mismatched period")
        await ctx.db.patch(w._id, { periodEnd: billing.periodEnd + 1 });
      if (condition === "different subscription")
        await ctx.db.patch(billing._id, {
          subscriptionId: "different-paid-subscription",
        });
    });
    const args = {
      organizationId: r.org,
      artifactId: artifact.artifactId,
      expectedCompatibilityKey: s.args.compatibilityKey,
    };
    await expect(
      r.client.query(api.serviceArtifacts.preview, args),
    ).rejects.toThrow("Pro");
    await expect(
      r.client.mutation(api.serviceArtifacts.save, args),
    ).rejects.toThrow("Pro");
    expect(
      await s.t.run((ctx) => ctx.db.query("publicImports").collect()),
    ).toHaveLength(0);
    await expect(s.t.query(api.serviceArtifacts.preview, args)).rejects.toThrow(
      "Sign in",
    );
  },
);

it("accepts annual Pro reconciled into a monthly allowance and binds that grant to the verified subscription", async () => {
  const s = await setup();
  const a = await commit(s);
  const r = await recipient(s);
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_synthetic_only");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "account-synthetic");
  vi.stubEnv("STRIPE_PRO_ANNUAL_PRICE_ID", "price-pro-annual");
  stripeMocks.account.mockResolvedValue({ id: "account-synthetic" });
  stripeMocks.customer.mockResolvedValue({ id: "synthetic-recipient" });
  const start = Math.floor(s.now / 1000);
  const annualEnd = start + 365 * 86400;
  stripeMocks.subscriptions.mockResolvedValue({
    data: [
      {
        id: "subscription-annual",
        status: "active",
        created: start,
        metadata: { product: "vibescroller" },
        latest_invoice: {
          id: "invoice-annual",
          status: "paid",
          created: start,
        },
        items: {
          data: [
            {
              current_period_start: start,
              current_period_end: annualEnd,
              price: {
                id: "price-pro-annual",
                metadata: { tier: "pro", interval: "annual" },
              },
            },
          ],
        },
      },
    ],
  });
  await s.t.action(internal.reconciliation.customer, {
    customerId: "synthetic-recipient",
  });
  const entitlement = await s.t.run(async (ctx) => ({
    billing: await ctx.db
      .query("billing")
      .withIndex("by_org", (q) => q.eq("organizationId", r.org))
      .unique(),
    wallet: await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", r.org))
      .unique(),
  }));
  expect(entitlement.billing!.periodEnd).toBe(annualEnd * 1000);
  expect(entitlement.wallet!.tier).toBe("pro");
  expect(entitlement.wallet!.periodEnd).toBeLessThan(
    entitlement.billing!.periodEnd,
  );
  const args = {
    organizationId: r.org,
    artifactId: a.artifactId,
    expectedCompatibilityKey: s.args.compatibilityKey,
  };
  expect(
    await r.client.query(api.serviceArtifacts.preview, args),
  ).not.toBeNull();
  await expect(
    r.client.mutation(api.serviceArtifacts.save, args),
  ).resolves.toMatchObject({ processingStarted: false });
  await s.t.run((ctx) =>
    ctx.db.patch(entitlement.billing!._id, {
      subscriptionId: "forged-replacement",
    }),
  );
  await expect(
    r.client.query(api.serviceArtifacts.preview, args),
  ).rejects.toThrow("Pro");
});

it("retains the original copy through operational pauses and missing provider configuration, including a privacy sweep", async () => {
  const s = await setup();
  const { r, saved, layer } = await savedCopy(s);
  const original = await r.client.query(api.publicKnowledge.savedDetail, {
    sourceId: saved.sourceId,
  });
  for (const flag of ["DISABLE_INFERENCE", "DISABLE_CAPTURE"])
    vi.stubEnv(flag, "true");
  for (const flag of [
    "CREATOR_FOLLOWING_ENABLED",
    "CREATOR_SERVICE_REUSE_ENABLED",
    "HOSTED_MEDIA_ACCEPTANCE_ENABLED",
  ])
    vi.stubEnv(flag, "false");
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", "temporarily invalid");
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toEqual(original);
  await s.t.mutation(internal.privacy.sweep, {});
  await s.t.mutation(internal.serviceArtifacts.sweepCopies, { cursor: null });
  expect((await s.t.run((ctx) => ctx.db.get(layer._id)))?.origin).toBe(
    "service",
  );
  expect(await s.t.run((ctx) => ctx.db.get(layer._id))).toEqual(layer);
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", "");
  await s.t.mutation(internal.serviceArtifacts.sweepCopies, { cursor: null });
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toEqual(original);
  for (const flag of ["DISABLE_INFERENCE", "DISABLE_CAPTURE"])
    vi.stubEnv(flag, "false");
  for (const flag of [
    "CREATOR_FOLLOWING_ENABLED",
    "CREATOR_SERVICE_REUSE_ENABLED",
    "HOSTED_MEDIA_ACCEPTANCE_ENABLED",
  ])
    vi.stubEnv(flag, "true");
  vi.stubEnv("CREATOR_PROVIDER_CONFIGURATION", JSON.stringify(s.configuration));
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toEqual(original);
});

it("preserves the original saved DTO through benign upstream edits and newer analysis without automatic updates", async () => {
  const s = await setup();
  const { r, saved, layer } = await savedCopy(s);
  const original = await r.client.query(api.publicKnowledge.savedDetail, {
    sourceId: saved.sourceId,
  });
  vi.setSystemTime(s.now + 1);
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      title: "Updated upstream metadata",
      updatedAt: Date.now(),
      generation: 2,
      analysis: {
        ...s.result,
        summary: "New upstream analysis must not replace the saved copy",
      },
    }),
  );
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toEqual(original);
  await s.t.mutation(internal.serviceArtifacts.sweepCopies, { cursor: null });
  expect(await s.t.run((ctx) => ctx.db.get(layer._id))).toEqual(layer);
});

it("keeps an immutable saved copy and private edits after cancellation while refusing new catalog access", async () => {
  const s = await setup();
  const { r, args, saved, layer } = await savedCopy(s);
  const before = await r.client.query(api.publicKnowledge.savedDetail, {
    sourceId: saved.sourceId,
  });
  vi.setSystemTime(s.now + 1);
  await r.client.mutation(api.serviceArtifacts.save, args);
  expect(await s.t.run((ctx) => ctx.db.get(layer._id))).toEqual(layer);
  await s.t.run(async (ctx) => {
    const billing = (await ctx.db
      .query("billing")
      .withIndex("by_org", (q) => q.eq("organizationId", r.org))
      .unique())!;
    await ctx.db.patch(billing._id, { status: "canceled" });
    const w = (await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", r.org))
      .unique())!;
    await ctx.db.patch(w._id, { tier: "free" });
  });
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toEqual(before);
  await expect(
    r.client.query(api.serviceArtifacts.preview, args),
  ).rejects.toThrow("Pro");
  await expect(
    r.client.mutation(api.serviceArtifacts.save, args),
  ).rejects.toThrow("Pro");
  await r.client.mutation(api.publicKnowledge.savePersonalLayer, {
    sourceId: saved.sourceId,
    expectedUpdatedAt: before!.updatedAt,
    note: "Private note after cancellation",
    corrections: [{ insightId: "idea1", text: "Private clarification" }],
  });
  const exported = await r.client.query(api.jobs.exportPage, {
    organizationId: r.org,
    section: "publicImports",
    cursor: null,
    asOf: Date.now(),
  });
  expect(exported.page[0]).toMatchObject({
    savedAnalysis: before!.service,
    privateNote: "Private note after cancellation",
  });
  expect(exported.page[0]).not.toHaveProperty("snapshot");
  expect(JSON.stringify(exported)).not.toContain("A visible synthetic label");
});

it("does not read or backfill legacy references without an explicit current-Pro save", async () => {
  const s = await setup();
  const { r, args, saved, layer } = await savedCopy(s);
  await s.t.run(async (ctx) => {
    await ctx.db.patch(layer._id, { snapshot: undefined });
    const w = (await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", r.org))
      .unique())!;
    await ctx.db.patch(w._id, { tier: "free" });
  });
  const detail = await r.client.query(api.publicKnowledge.savedDetail, {
    sourceId: saved.sourceId,
  });
  expect(detail).toMatchObject({ available: false, service: null });
  await expect(
    r.client.mutation(api.serviceArtifacts.save, args),
  ).rejects.toThrow("Pro");
  await r.client.mutation(api.publicKnowledge.savePersonalLayer, {
    sourceId: saved.sourceId,
    expectedUpdatedAt: detail!.updatedAt,
    note: "Legacy private note",
    corrections: [],
  });
  expect(await s.t.run((ctx) => ctx.db.get(layer._id))).not.toHaveProperty(
    "snapshot",
  );
  await s.t.run(async (ctx) => {
    const w = (await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", r.org))
      .unique())!;
    await ctx.db.patch(w._id, { tier: "pro" });
  });
  await r.client.mutation(api.serviceArtifacts.save, args);
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toMatchObject({ available: true, privateNote: "Legacy private note" });
});

it("fences altered retained DTOs even with a recomputed DTO hash, scrubs them and exports only authored data", async () => {
  const s = await setup();
  const { r, saved, layer } = await savedCopy(s);
  const dto = { ...layer.snapshot!.dto, summary: "Unbound replacement" };
  const dtoHash = await socialHash(canonicalJson(dto));
  await s.t.run((ctx) =>
    ctx.db.patch(layer._id, {
      privateNote: "Keep authored note",
      snapshot: { ...layer.snapshot!, dto, dtoHash },
    }),
  );
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toMatchObject({
    available: false,
    service: null,
    privateNote: "Keep authored note",
  });
  const exported = await r.client.query(api.jobs.exportPage, {
    organizationId: r.org,
    section: "publicImports",
    cursor: null,
    asOf: s.now,
  });
  expect(exported.page[0]).not.toHaveProperty("savedAnalysis");
  expect(JSON.stringify(exported)).not.toContain("Unbound replacement");
  await s.t.run((ctx) => sweepRetainedServiceArtifactCopies(ctx));
  expect(await s.t.run((ctx) => ctx.db.get(layer._id))).not.toHaveProperty(
    "snapshot",
  );
});

it("quarantines restored copies and preserves authored overlays without regranting catalog access", async () => {
  const s = await setup();
  const { r, saved, layer } = await savedCopy(s);
  await s.t.run((ctx) =>
    ctx.db.patch(layer._id, {
      privateNote: "Restored private note",
      corrections: [{ insightId: "idea1", text: "Restored correction" }],
    }),
  );
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "publicImports",
    cursor: null,
  });
  vi.stubEnv("RESTORE_LOCK", "false");
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toMatchObject({
    available: false,
    service: null,
    privateNote: "Restored private note",
    corrections: [{ insightId: "idea1", text: "Restored correction" }],
  });
  expect(await s.t.run((ctx) => ctx.db.get(layer._id))).not.toHaveProperty(
    "snapshot",
  );
});

it("fences removed copies immediately and resumes bounded physical cleanup after an interrupted callback", async () => {
  const s = await setup();
  const { r, args, saved, layer } = await savedCopy(s);
  for (let i = 0; i < 6; i++) {
    const extra = await recipient(s, `extra${i}`);
    await extra.client.mutation(api.serviceArtifacts.save, {
      ...args,
      organizationId: extra.org,
    });
  }
  await s.t.run((ctx) =>
    ctx.db.patch(layer._id, { privateNote: "Keep after removal" }),
  );
  await s.t.mutation(internal.serviceArtifacts.invalidateSource, {
    sourceId: s.sourceId,
    maxGeneration: 1,
  });
  expect(
    await r.client.query(api.publicKnowledge.savedDetail, {
      sourceId: saved.sourceId,
    }),
  ).toMatchObject({
    available: false,
    service: null,
    privateNote: "Keep after removal",
  });
  await expect(
    r.client.mutation(api.publicKnowledge.savePersonalLayer, {
      sourceId: saved.sourceId,
      expectedUpdatedAt: layer.updatedAt,
      note: "Keep after removal",
      corrections: [],
    }),
  ).resolves.toEqual({ saved: true });
  await s.t.mutation(internal.serviceArtifacts.scrubCopies, {
    artifactId: args.artifactId,
    cursor: null,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.query("publicImports").collect())).filter(
      (row) => row.origin === "service" && row.snapshot,
    ),
  ).toHaveLength(2);
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 20);
  vi.stubEnv("RESTORE_LOCK", "false");
  await s.t.mutation(internal.privacy.sweep, {});
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 30);
  expect(
    (await s.t.run((ctx) => ctx.db.query("publicImports").collect())).filter(
      (row) => row.origin === "service" && row.snapshot,
    ),
  ).toHaveLength(0);
  const exported = await r.client.query(api.jobs.exportPage, {
    organizationId: r.org,
    section: "publicImports",
    cursor: null,
    asOf: Date.now(),
  });
  expect(exported.page[0]).toMatchObject({ privateNote: "Keep after removal" });
  expect(exported.page[0]).not.toHaveProperty("savedAnalysis");
});
it("saves one sanitized private copy without processing and retains authored overlays on withdrawal", async () => {
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
  vi.stubEnv(
    "CREATOR_PROVIDER_CONFIGURATION",
    JSON.stringify({
      ...s.configuration,
      rights: { ...s.rights, crossCustomerReuse: false },
    }),
  );
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
