import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { orderedRevisionHash, socialHash } from "../packages/social/contracts";
import { validateSocialAnalysis } from "../packages/social/analysis";
import { sharedTypedCitations } from "../convex/lib/sourceCitations";
import { currentOrderedSource } from "../convex/lib/orderedSource";
import {
  workCloudMediaPreparation,
  validateWorkCloudMediaOutput,
} from "../packages/contracts/work-cloud-text";
const modules = import.meta.glob("../convex/**/*.ts");
const subject = "user_01234567890123456789012345";
const clientId = "client_01234567890123456789012345";
const issuer = "https://cloud-fixture.authkit.app";
const identity = {
  subject,
  issuer,
  client_id: clientId,
  scope: "analysis:execute",
  sid: "app_consent_01234567890123456789012345",
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup(url = "https://www.youtube.com/watch?v=abcdefghijk") {
  for (const key of [
    "MCP_ENABLED",
    "WORK_CLOUD_MEDIA_ENABLED",
    "WORK_CLOUD_MEDIA_VERIFIED",
  ])
    vi.stubEnv(key, "true");
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", JSON.stringify([subject]));
  vi.stubEnv("MCP_AUTH_ISSUER", issuer);
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      {
        id: clientId,
        name: "Synthetic media fixture",
        scopes: ["analysis:execute", "jobs:read"],
      },
    ]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "media@example.test",
    name: "Media owner",
  });
  const owner = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const assistant = t.withIdentity(identity);
  const org = await owner.mutation(api.organizations.createPrivate, {});
  const sourceId = await owner.mutation(api.product.capture, {
    organizationId: org,
    key: "cloud-media-fixture",
    kind: "url",
    url,
    title: "Synthetic permitted video",
    rightsAttested: true,
  });
  const original = (await t.run((ctx) => ctx.db.get(sourceId)))!;
  const grant = await owner.mutation(api.assistantGrants.save, {
    organizationId: org,
    clientId,
    sources: [
      {
        sourceId,
        generation: original.generation,
        revision: original.updatedAt,
      },
    ],
    scopes: ["analysis:execute"],
    expectedVersion: 0,
    expiresAt: Date.now() + 86400000,
    acknowledged: true,
  });
  const retainUntil = Date.now() + 7 * 86400000;
  const selection = {
    sourceId,
    grantId: grant.id,
    inputKind: "media" as const,
    retainUntil,
  };
  const preview = () => owner.query(api.workCloudAnalysis.preview, selection);
  const approve = async () => {
    const p = await preview();
    return owner.mutation(api.workCloudAnalysis.approve, {
      ...selection,
      generation: p.generation,
      grantVersion: p.grantVersion,
      expectedInputHash: p.inputHash,
      model: "synthetic-model",
      effort: "high",
      useOwnPlan: true,
      maxApiUsd: 0,
    });
  };
  const claim = async () => {
    const approved = await approve();
    const c = await assistant.mutation(internal.workCloudAnalysis.dispatch, {
      sourceId,
      generation: approved.generation,
      taskId: "synthetic-real-task",
      operation: "claim",
    });
    if (!("leaseToken" in c) || !c.leaseToken)
      throw Error("Missing claim token");
    return {
      sourceId,
      generation: approved.generation,
      taskId: "synthetic-real-task",
      leaseToken: c.leaseToken,
    };
  };
  return {
    t,
    owner,
    assistant,
    org,
    sourceId,
    original,
    grant,
    retainUntil,
    selection,
    preview,
    approve,
    claim,
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
type Lease = Awaited<ReturnType<Fixture["claim"]>>;
async function receipt(s: Fixture, lease: Lease) {
  const input = await s.assistant.query(
    internal.workCloudAnalysis.input,
    lease,
  );
  if (!("toolchainHash" in input)) throw Error("Expected media input");
  const text = "Check the actual evidence before acting.";
  const post = {
    schemaVersion: "work-cloud-observed-media-v1" as const,
    provenance: "authenticated_host_reported" as const,
    canonical: input.canonicalUrl,
    platform: input.platform,
    publishedAt: null,
    dateReliability: "unknown" as const,
    observedAt: Date.now(),
    caption: "",
    captionHash: await socialHash(""),
    assets: [
      {
        id: "observed-video",
        index: 0,
        kind: "video" as const,
        contentHash: "a".repeat(64),
        bytes: 1000000,
        width: 1280,
        height: 720,
        mime: "video/mp4" as const,
        durationMs: 46000,
        inspected: true,
        audioInspected: true,
      },
    ],
    expectedAssetCount: null,
    coverage: "partial" as const,
    revisionHash: "0".repeat(64),
    inputHash: input.inputHash,
    policyHash: input.policyHash,
    toolchainHash: input.toolchainHash,
    taskId: lease.taskId,
    retainUntil: s.retainUntil,
    rawMediaDeleteBy: Date.now() + 86400000,
    providerRetention: "unknown" as const,
    frames: [
      {
        id: "frame-1",
        timestampMs: 12000,
        sha256: "b".repeat(64),
        bytes: 10000,
        width: 960,
        height: 540,
      },
    ],
    audio: {
      sha256: "c".repeat(64),
      bytes: 100000,
      outcome: "transcribed" as const,
    },
    segments: [
      {
        id: "speech-1",
        startMs: 0,
        endMs: 3000,
        text,
        textHash: await socialHash(text),
      },
    ],
  };
  post.revisionHash = await orderedRevisionHash(post);
  return {
    schemaVersion: "work-cloud-media-preparation-v2" as const,
    post,
    evidence: [
      {
        kind: "video_observation" as const,
        id: "speech-1",
        postRevisionHash: post.revisionHash,
        assetId: "observed-video",
        assetIndex: 0,
        text,
        textHash: await socialHash(text),
        startMs: 0,
        endMs: 3000,
        basis: "transcript" as const,
        uncertainty: "",
      },
    ],
  };
}
type Receipt = Awaited<ReturnType<typeof receipt>>;
function output(lease: Lease, prepared: Receipt) {
  return {
    schemaVersion: "3.0.0",
    sourceId: lease.sourceId,
    processingRunId: `${lease.sourceId}:${lease.generation}`,
    postRevisionHash: prepared.post.revisionHash,
    coverage: "ordered_media",
    summary: "Synthetic cited result",
    warnings: [],
    insights: [
      {
        id: "point-1",
        kind: "lesson",
        title: "Check evidence",
        claim: "Check evidence before acting.",
        interpretation: "Test the claim.",
        categories: ["coding"],
        confidence: "supported",
        verificationNeeds: [],
        evidence: [
          {
            kind: "video_observation",
            id: "speech-1",
            startMs: 0,
            endMs: 3000,
          },
        ],
      },
    ],
  };
}
async function prepare(s: Fixture, lease: Lease, prepared: Receipt) {
  return s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    ...lease,
    operation: "prepare",
    preparation: prepared,
  });
}

it("returns a canonical cited private media result through the existing source, without assets, supplier proof or a second queue", async () => {
  const s = await setup(),
    lease = await s.claim(),
    prepared = await receipt(s, lease);
  expect(await prepare(s, lease, prepared)).toMatchObject({
    accepted: true,
    observationsVerified: false,
  });
  const bound = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(bound.personalAnalysis?.executor).toBe("work_cloud");
  expect(JSON.stringify(bound.personalAnalysis)).not.toContain(
    "Check the actual evidence",
  );
  expect(JSON.stringify(bound.orderedMedia)).not.toContain(
    "providerEvidenceId",
  );
  const input = await s.assistant.query(
    internal.workCloudAnalysis.input,
    lease,
  );
  expect(input).toMatchObject({
    schemaVersion: "work-cloud-media-v2",
    maxApiUsd: 0,
    mediaSupported: true,
    deadline: expect.any(Number),
    prepared: { post: { provenance: "authenticated_host_reported" } },
  });
  expect(
    new TextEncoder().encode(JSON.stringify(input)).byteLength,
  ).toBeLessThan(262144);
  const completion = {
    ...lease,
    operation: "complete" as const,
    output: output(lease, prepared),
    reportedModel: "synthetic-model",
    reportedEffort: "high",
  };
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, completion),
  ).resolves.toEqual({ accepted: true, cached: false });
  const saved = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(saved).toMatchObject({
    state: "ready",
    analysisPipelineVersion: "official-work-cloud-media-v2",
    coverage: "ordered_media",
    sourceRetentionUntil: s.retainUntil,
  });
  expect(saved.analysis?.warnings.join(" ")).toContain(
    "not independently verified",
  );
  const detail = await s.owner.query(api.product.detail, { id: s.sourceId });
  expect(detail.analysis?.insights).toHaveLength(1);
  const citations = await s.t.run(async (ctx) => {
    const c = await sharedTypedCitations(ctx, (await ctx.db.get(s.sourceId))!);
    return c?.summarize(saved.analysis.insights[0].evidence);
  });
  expect(citations).toMatchObject([
    { id: "speech-1", assetId: "observed-video", startMs: 0 },
  ]);
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, completion),
  ).resolves.toEqual({ accepted: true, cached: true });
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(saved);
  await expect(
    validateSocialAnalysis(output(lease, prepared), saved.orderedMedia, lease),
  ).rejects.toThrow();
  for (const table of [
    "assets",
    "devices",
    "publicArtifacts",
    "sourceAcquisitions",
    "localLibraryRuns",
  ] as const)
    expect(await s.t.run((ctx) => ctx.db.query(table).collect())).toEqual([]);
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").collect())).every(
      (r) => r.max === 0,
    ),
  ).toBe(true);
  vi.stubEnv("WORK_CLOUD_MEDIA_ENABLED", "false");
  await expect(currentOrderedSource(saved)).resolves.toMatchObject({
    analysis: { insights: [expect.any(Object)] },
  });
  await expect(
    s.owner.query(api.product.detail, { id: s.sourceId }),
  ).resolves.toMatchObject({ state: "ready" });
  await expect(
    currentOrderedSource({ ...saved, rightsAttested: false }),
  ).rejects.toThrow();
});

it.each([
  "https://www.instagram.com/reel/Abcdef12345/",
  "https://www.tiktok.com/@fixture/video/1234567890123456789",
  "https://vimeo.com/123456789",
])(
  "uses existing single-video identity policy for %s without supplier authorization claims",
  async (url) => {
    const s = await setup(url),
      lease = await s.claim();
    await expect(
      prepare(s, lease, await receipt(s, lease)),
    ).resolves.toMatchObject({ accepted: true });
  },
);

it.each([
  "WORK_CLOUD_MEDIA_ENABLED",
  "WORK_CLOUD_MEDIA_VERIFIED",
  "DISABLE_INFERENCE",
  "DISABLE_PERSONAL_ANALYSIS",
  "RESTORE_LOCK",
])("rechecks the %s gate without changing a valid source", async (key) => {
  const s = await setup(),
    lease = await s.claim(),
    prepared = await receipt(s, lease);
  vi.stubEnv(
    key,
    key.startsWith("DISABLE") || key === "RESTORE_LOCK" ? "true" : "false",
  );
  await expect(s.preview()).rejects.toThrow();
  await expect(
    s.assistant.query(internal.workCloudAnalysis.input, lease),
  ).rejects.toThrow();
  for (const operation of ["prepare", "heartbeat", "complete"] as const)
    await expect(
      s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
        ...lease,
        operation,
        ...(operation === "prepare"
          ? { preparation: prepared }
          : operation === "complete"
            ? { output: output(lease, prepared) }
            : {}),
      }),
    ).rejects.toThrow();
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.analysis,
  ).toBeUndefined();
});

it("requires the exact consent, task, token, current grant and owner scope on preparation", async () => {
  const s = await setup(),
    lease = await s.claim(),
    prepared = await receipt(s, lease);
  for (const patch of [
    { taskId: "foreign-task" },
    { leaseToken: crypto.randomUUID() },
    { generation: lease.generation + 1 },
  ])
    await expect(prepare(s, { ...lease, ...patch }, prepared)).rejects.toThrow(
      "APPROVAL_STALE",
    );
  await expect(
    s.t
      .withIdentity({
        ...identity,
        sid: "app_consent_99999999999999999999999999",
      })
      .mutation(internal.workCloudAnalysis.dispatch, {
        ...lease,
        operation: "prepare",
        preparation: prepared,
      }),
  ).rejects.toThrow();
  await expect(
    s.t
      .withIdentity({ ...identity, scope: "analysis:request" })
      .mutation(internal.workCloudAnalysis.dispatch, {
        ...lease,
        operation: "prepare",
        preparation: prepared,
      }),
  ).rejects.toThrow();
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: s.grant.id,
    expectedVersion: 1,
  });
  await expect(prepare(s, lease, prepared)).rejects.toThrow("FORBIDDEN");
});

it("rejects missing preparation, changed observations and unregistered citations atomically", async () => {
  const s = await setup(),
    lease = await s.claim(),
    prepared = await receipt(s, lease);
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output: output(lease, prepared),
    }),
  ).rejects.toThrow("INVALID_EVIDENCE");
  await prepare(s, lease, prepared);
  await expect(prepare(s, lease, prepared)).resolves.toMatchObject({
    accepted: true,
  });
  const changed = structuredClone(prepared);
  changed.post.frames[0].sha256 = "d".repeat(64);
  changed.post.revisionHash = await orderedRevisionHash(changed.post);
  changed.evidence[0].postRevisionHash = changed.post.revisionHash;
  await expect(prepare(s, lease, changed)).rejects.toThrow("APPROVAL_STALE");
  const bad = output(lease, prepared);
  bad.insights[0].evidence[0].id = "invented-frame";
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output: bad,
    }),
  ).rejects.toThrow();
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output: output(lease, prepared),
      reportedModel: "different",
    }),
  ).rejects.toThrow();
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.state).toBe(
    "processing",
  );
});

it.each([
  "future",
  "retention",
  "canonical",
  "toolchain",
  "policy",
  "input",
  "unobserved",
  "segment",
  "hash",
])(
  "rejects %s preparation even when the host recomputes its revision hash",
  async (change) => {
    const s = await setup(),
      lease = await s.claim(),
      p = await receipt(s, lease);
    if (change === "future") p.post.observedAt += 1;
    if (change === "retention") p.post.retainUntil += 1;
    if (change === "canonical")
      p.post.canonical = "https://www.youtube.com/watch?v=otherabcdef";
    if (change === "toolchain") p.post.toolchainHash = "f".repeat(64);
    if (change === "policy") p.post.policyHash = "f".repeat(64);
    if (change === "input") p.post.inputHash = "f".repeat(64);
    if (change === "unobserved") {
      p.evidence[0].basis = "visible" as (typeof p.evidence)[0]["basis"];
      p.evidence[0].startMs = 123;
      p.evidence[0].endMs = 124;
    }
    if (change === "segment") p.evidence[0].text = "Not the registered segment";
    if (change === "hash") p.post.segments[0].textHash = "f".repeat(64);
    p.post.revisionHash = await orderedRevisionHash(p.post);
    p.evidence[0].postRevisionHash = p.post.revisionHash;
    await expect(prepare(s, lease, p)).rejects.toThrow();
    expect(
      (await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.orderedMedia,
    ).toBeUndefined();
  },
);

it("preserves unknown provider usage after cancellation or fixed deadline without retrying another executor", async () => {
  const s = await setup(),
    lease = await s.claim(),
    prepared = await receipt(s, lease);
  const before = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(before.personalAnalysis?.deadline).toBe(Date.now() + 900000);
  await prepare(s, lease, prepared);
  await s.owner.mutation(api.personalAnalysis.cancel, { id: s.sourceId });
  const canceled = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(canceled.generation).toBe(lease.generation + 1);
  await expect(prepare(s, lease, prepared)).rejects.toThrow();
  await expect(s.preview()).rejects.toThrow("APPROVAL_STALE");
  const fresh = await setup("https://vimeo.com/987654321"),
    second = await fresh.claim();
  vi.advanceTimersByTime(39000);
  await fresh.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    ...second,
    operation: "heartbeat",
  });
  vi.advanceTimersByTime(900000);
  await expect(
    fresh.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...second,
      operation: "heartbeat",
    }),
  ).resolves.toEqual({ accepted: false, state: "unknown", hostStopped: false });
  expect(
    (await fresh.t.run((ctx) => ctx.db.get(fresh.sourceId)))?.personalAnalysis
      ?.state,
  ).toBe("unknown");
});

it("expires app evidence and schedules generation-bounded derivative scrub without claiming provider cleanup", async () => {
  const s = await setup(),
    lease = await s.claim(),
    prepared = await receipt(s, lease);
  await prepare(s, lease, prepared);
  await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    ...lease,
    operation: "complete",
    output: output(lease, prepared),
  });
  await s.owner.mutation(api.categories.assign, {
    id: s.sourceId,
    names: ["My authored filing"],
  });
  await s.owner.mutation(api.librarySpaces.fileSource, {
    organizationId: s.org,
    sourceId: s.sourceId,
    spaces: ["personal"],
  });
  const detail = await s.owner.query(api.product.detail, { id: s.sourceId });
  await s.owner.mutation(api.product.reviewAnalysis, {
    id: s.sourceId,
    generation: lease.generation,
    analysisHash: detail.analysisHash!,
    verdict: "unsure",
    note: "My authored follow-up note",
  });
  const manualId = await s.t.run(async (ctx) => {
    const member = (
      await ctx.db
        .query("knowledgeMembers")
        .withIndex("by_source", (q) => q.eq("sourceId", s.sourceId))
        .collect()
    )[0];
    if (!member) throw Error("Expected actual generated membership");
    await ctx.db.patch(member._id, { manual: true });
    return member._id;
  });
  const authoredSpaces = await s.t.run((ctx) =>
    ctx.db.query("sourceSpaces").collect(),
  );
  const authoredNotes = await s.t.run((ctx) =>
    ctx.db.query("feedback").collect(),
  );
  expect(
    (
      await s.t.run((ctx) =>
        ctx.db
          .query("sourceCategories")
          .withIndex("by_source", (q) => q.eq("sourceId", s.sourceId))
          .collect(),
      )
    ).some((row) => row.searchable?.includes("Synthetic cited result")),
  ).toBe(true);
  const original = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  vi.setSystemTime(s.retainUntil + 1);
  await expect(currentOrderedSource(original)).rejects.toThrow();
  await expect(
    s.owner.query(api.product.detail, { id: s.sourceId }),
  ).rejects.toThrow("SOURCE_UNAVAILABLE");
  await s.t.mutation(internal.workCloudAnalysis.expire, {
    sourceId: s.sourceId,
    organizationId: s.org,
    generation: lease.generation,
    retainUntil: s.retainUntil,
  });
  const expired = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(expired.analysis).toBeUndefined();
  expect(expired.orderedMedia).toBeUndefined();
  expect(expired.personalAnalysis?.state).toBe("completed");
  expect(expired.categoryOverride).toEqual(["My authored filing"]);
  expect(
    (
      await s.t.run((ctx) =>
        ctx.db
          .query("sourceCategories")
          .withIndex("by_source", (q) => q.eq("sourceId", s.sourceId))
          .collect(),
      )
    ).some((row) => row.searchable?.includes("Synthetic cited result")),
  ).toBe(false);
  const members = await s.t.run((ctx) =>
    ctx.db
      .query("knowledgeMembers")
      .withIndex("by_source", (q) => q.eq("sourceId", s.sourceId))
      .collect(),
  );
  expect(
    members.every((m) => m.retainedHistory && m.sourceTitle === undefined),
  ).toBe(true);
  expect(members.find((m) => m._id === manualId)).toMatchObject({
    manual: true,
    retainedHistory: true,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("sourceSpaces").collect()),
  ).toEqual(authoredSpaces);
  expect(await s.t.run((ctx) => ctx.db.query("feedback").collect())).toEqual(
    authoredNotes,
  );
  expect(expired.error).toContain(
    "Provider files, history and usage remain unverified",
  );
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "knowledge:redactDerived",
        args: [expect.objectContaining({ maxGeneration: lease.generation })],
      }),
    ]),
  );
});

it("bounds strict preparation before hashing and rejects fabricated supplier fields, images, oversize inputs and deep output", async () => {
  const s = await setup(),
    lease = await s.claim(),
    prepared = await receipt(s, lease);
  expect(
    workCloudMediaPreparation.safeParse({
      ...prepared,
      post: { ...prepared.post, providerEvidenceId: "not-a-receipt" },
    }).success,
  ).toBe(false);
  expect(
    workCloudMediaPreparation.safeParse({
      ...prepared,
      post: {
        ...prepared.post,
        frames: Array(49).fill(prepared.post.frames[0]),
      },
    }).success,
  ).toBe(false);
  expect(
    workCloudMediaPreparation.safeParse({
      ...prepared,
      post: {
        ...prepared.post,
        assets: [{ ...prepared.post.assets[0], bytes: 50 * 1024 * 1024 + 1 }],
      },
    }).success,
  ).toBe(false);
  expect(
    workCloudMediaPreparation.safeParse({
      ...prepared,
      post: {
        ...prepared.post,
        assets: [{ ...prepared.post.assets[0], durationMs: 600001 }],
      },
    }).success,
  ).toBe(false);
  let extra: unknown = null;
  for (let i = 0; i < 20000; i++) extra = { nested: extra };
  expect(() =>
    validateWorkCloudMediaOutput({ ...output(lease, prepared), extra }),
  ).toThrow(/unrecognized_keys/);
  await expect(
    s.owner.query(api.workCloudAnalysis.preview, {
      ...s.selection,
      retainUntil: Date.now() + 31 * 86400000,
    }),
  ).rejects.toThrow();
});

it("accepts an inspected no-speech result with no invented insights or full-media coverage", async () => {
  const s = await setup(),
    lease = await s.claim(),
    p = await receipt(s, lease);
  p.post.audio.outcome = "no_speech" as typeof p.post.audio.outcome;
  p.post.segments = [];
  p.evidence = [];
  p.post.revisionHash = await orderedRevisionHash(p.post);
  await prepare(s, lease, p);
  const result = {
    ...output(lease, p),
    summary: "No supported insight found in the sampled evidence.",
    insights: [],
  };
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output: result,
    }),
  ).resolves.toMatchObject({ accepted: true });
  const saved = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(saved.analysis.insights).toEqual([]);
  expect(saved.orderedMedia.post.coverage).toBe("partial");
  expect(saved.orderedMedia.post.expectedAssetCount).toBeNull();
});

it("preserves the replacement source while old media retention still schedules old derivative cleanup", async () => {
  const s = await setup(),
    lease = await s.claim(),
    p = await receipt(s, lease);
  await prepare(s, lease, p);
  await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    ...lease,
    operation: "complete",
    output: output(lease, p),
  });
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.sourceId, {
      generation: lease.generation + 1,
      orderedMedia: undefined,
      personalAnalysis: undefined,
      analysis: undefined,
      summary: undefined,
      state: "saved",
      kind: "text",
      canonical: `text:${"d".repeat(64)}`,
      text: "Replacement private source",
      sourceRetentionUntil: undefined,
    });
  });
  const replacement = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  vi.setSystemTime(s.retainUntil + 1);
  await s.t.mutation(internal.workCloudAnalysis.expire, {
    sourceId: s.sourceId,
    organizationId: s.org,
    generation: lease.generation,
    retainUntil: s.retainUntil,
  });
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(replacement);
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "knowledge:redactDerived",
        args: [expect.objectContaining({ maxGeneration: lease.generation })],
      }),
    ]),
  );
});

it("retains an explicitly unknown failed host attempt and never issues another claim", async () => {
  const s = await setup(),
    lease = await s.claim();
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "fail",
    }),
  ).resolves.toEqual({ accepted: true, state: "unknown", hostStopped: false });
  const held = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(held.personalAnalysis?.state).toBe("unknown");
  expect(held.personalAnalysis?.deadline).toBeGreaterThan(Date.now());
  await expect(s.preview()).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "claim",
      leaseToken: undefined,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(held);
});

it("claims an exact 180-second media lease, renews after a bounded step and completes after a 47-second model turn", async () => {
  const s = await setup(),
    approved = await s.approve(),
    now = Date.now();
  const claimed = await s.assistant.mutation(
    internal.workCloudAnalysis.dispatch,
    {
      sourceId: s.sourceId,
      generation: approved.generation,
      taskId: "caller-correlation-id",
      operation: "claim",
    },
  );
  expect(claimed).toEqual({
    sourceId: s.sourceId,
    generation: approved.generation,
    leaseToken: expect.any(String),
    leaseUntil: now + 180000,
    deadline: now + 900000,
    inputHash: approved.inputHash,
    requestedModel: "synthetic-model",
    requestedEffort: "high",
    hostVerified: false,
  });
  if (!("leaseToken" in claimed) || !claimed.leaseToken)
    throw Error("Missing lease");
  const lease = {
    sourceId: s.sourceId,
    generation: approved.generation,
    taskId: "caller-correlation-id",
    leaseToken: claimed.leaseToken,
  };
  const p = await receipt(s, lease);
  await prepare(s, lease, p);
  vi.advanceTimersByTime(60000);
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "heartbeat",
    }),
  ).resolves.toEqual({
    valid: true,
    leaseUntil: now + 240000,
    deadline: now + 900000,
  });
  vi.advanceTimersByTime(47000);
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output: output(lease, p),
    }),
  ).resolves.toEqual({ accepted: true, cached: false });
  const saved = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  vi.advanceTimersByTime(180001);
  await expect(
    s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "heartbeat",
    }),
  ).rejects.toThrow();
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(saved);
});

it.each(["heartbeat", "complete"] as const)(
  "marks an authenticated expired-media %s unknown without accepting output or enabling reclaim",
  async (operation) => {
    const s = await setup(),
      lease = await s.claim(),
      p = await receipt(s, lease);
    await prepare(s, lease, p);
    const deadline = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!
      .personalAnalysis!.deadline;
    vi.advanceTimersByTime(180001);
    await expect(
      s.assistant.query(internal.workCloudAnalysis.input, lease),
    ).rejects.toThrow("APPROVAL_STALE");
    await expect(
      s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
        ...lease,
        operation,
        ...(operation === "complete" ? { output: output(lease, p) } : {}),
      }),
    ).resolves.toEqual({
      accepted: false,
      state: "unknown",
      hostStopped: false,
    });
    const unknown = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    expect(unknown).toMatchObject({
      state: "failed",
      personalAnalysis: { state: "unknown", deadline, leaseUntil: 0 },
    });
    expect(unknown.analysis).toBeUndefined();
    await expect(s.preview()).rejects.toThrow("APPROVAL_STALE");
    await expect(s.approve()).rejects.toThrow("APPROVAL_STALE");
    await expect(
      s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
        ...lease,
        operation: "claim",
        leaseToken: undefined,
      }),
    ).rejects.toThrow("APPROVAL_STALE");
    await s.owner.mutation(api.personalAnalysis.cancel, { id: s.sourceId });
    expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(unknown);
  },
);

async function completedForCleanup() {
  const s = await setup(),
    lease = await s.claim(),
    p = await receipt(s, lease);
  await prepare(s, lease, p);
  await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    ...lease,
    operation: "complete",
    output: output(lease, p),
  });
  await s.t.run(async (ctx) => {
    for (const job of await ctx.db.system
      .query("_scheduled_functions")
      .collect())
      if (job.name.endsWith("workCloudAnalysis:expire"))
        await ctx.scheduler.cancel(job._id);
  });
  return { ...s, lease };
}
it("limits restore deferrals in both Cloud cleanup chains and hands exhausted work to operator audit", async () => {
  const s = await completedForCleanup();
  vi.setSystemTime(s.retainUntil + 1);
  vi.stubEnv("RESTORE_LOCK", "true");
  const args = {
    sourceId: s.sourceId,
    organizationId: s.org,
    generation: s.lease.generation,
    retainUntil: s.retainUntil,
  };
  await s.t.mutation(internal.workCloudAnalysis.expire, args);
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 12);
  const result = await s.t.run(async (ctx) => ({
    source: await ctx.db.get(s.sourceId),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    audit: await ctx.db.query("audit").collect(),
  }));
  expect(result.source?.personalAnalysis).toMatchObject({
    state: "completed",
    stage: "retention_cleanup_deferred",
  });
  expect(result.source?.analysis).toBeDefined();
  expect(result.jobs.filter((job) => job.state.kind === "pending")).toEqual([]);
  expect(
    result.jobs.filter((job) => job.name.endsWith("workCloudAnalysis:expire")),
  ).toHaveLength(3); // cancelled original + two finite retries
  expect(
    result.jobs.filter((job) => job.name.endsWith("knowledge:redactDerived")),
  ).toHaveLength(3);
  expect(
    result.audit.filter(
      (row) => row.action === "source_retention.manual_cleanup_required",
    ),
  ).toHaveLength(2);
  vi.stubEnv("RESTORE_LOCK", "false");
  await expect(
    s.owner.query(api.product.detail, { id: s.sourceId }),
  ).rejects.toThrow("SOURCE_UNAVAILABLE");
  // Explicit operator recovery starts a new finite pass; unlocking alone starts nothing.
  await s.t.mutation(internal.workCloudAnalysis.expire, args);
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 12);
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.analysis,
  ).toBeUndefined();
});
it("starts superseded-generation derivative cleanup once without retrying an unrelated source under restore", async () => {
  const s = await completedForCleanup();
  await s.owner.mutation(api.product.attachSource, {
    id: s.sourceId,
    text: "Fresh separately supplied source",
    rightsAttested: true,
  });
  const fresh = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  vi.setSystemTime(s.retainUntil + 1);
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.workCloudAnalysis.expire, {
    sourceId: s.sourceId,
    organizationId: s.org,
    generation: s.lease.generation,
    retainUntil: s.retainUntil,
  });
  const initial = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    initial.filter((job) => job.name.endsWith("knowledge:redactDerived")),
  ).toHaveLength(1);
  expect(
    initial.find((job) => job.name.endsWith("knowledge:redactDerived"))
      ?.args[0],
  ).toMatchObject({
    maxGeneration: s.lease.generation,
    pagesRemaining: 32,
    deferredAttempt: 0,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 10);
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    jobs.filter((job) => job.name.endsWith("workCloudAnalysis:expire")),
  ).toHaveLength(1); // cancelled original only
  expect(
    jobs.filter((job) => job.name.endsWith("knowledge:redactDerived")),
  ).toHaveLength(3);
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(fresh);
});
it("caps Cloud derivative cleanup at exactly 32 pages without implicit continuation", async () => {
  const s = await completedForCleanup();
  await s.t.run(async (ctx) => {
    const actor = (await ctx.db.query("users").first())!._id;
    const topic = await ctx.db.insert("knowledgeTopics", {
      organizationId: s.org,
      name: "Bounded fixture",
      key: "bounded-fixture",
      state: "ready",
      version: 1,
      pinned: true,
      insightCount: 0,
      sourceCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    for (let i = 0; i < 961; i++)
      await ctx.db.insert("knowledgeJobs", {
        organizationId: s.org,
        topicId: topic,
        actor,
        version: 1,
        policyVersion: 1,
        cursor: null,
        next: null,
        done: true,
        processingVersion: "fixture",
        references: [
          {
            sourceId: s.sourceId,
            generation: s.lease.generation,
            revision: Date.now(),
            insightId: "point",
          },
        ],
        key: `bounded-${i}`,
        state: "ready",
        output: { summary: "Old derived private text" },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  await s.t.mutation(internal.knowledge.redactDerived, {
    organizationId: s.org,
    sourceId: s.sourceId,
    maxGeneration: s.lease.generation,
    section: "knowledgeJobs",
    cursor: null,
    pagesRemaining: 32,
    deferredAttempt: 2,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 40);
  const result = await s.t.run(async (ctx) => ({
    rows: await ctx.db.query("knowledgeJobs").collect(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    audit: await ctx.db.query("audit").collect(),
  }));
  expect(result.rows.filter((row) => row.output)).toHaveLength(1);
  expect(
    result.jobs.filter((job) => job.name.endsWith("knowledge:redactDerived")),
  ).toHaveLength(31);
  expect(result.jobs.filter((job) => job.state.kind === "pending")).toEqual([]);
  expect(
    result.audit.some((row) =>
      row.target.endsWith("knowledgeJobs:page_budget_exhausted"),
    ),
  ).toBe(true);
});
it("carries one global restore/page budget across derivative cleanup sections", async () => {
  const s = await completedForCleanup();
  await s.t.mutation(internal.knowledge.redactDerived, {
    organizationId: s.org,
    sourceId: s.sourceId,
    maxGeneration: s.lease.generation,
    section: "knowledgeJobs",
    cursor: null,
    pagesRemaining: 2,
    deferredAttempt: 2,
  });
  const scheduled = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    scheduled.find((job) => job.name.endsWith("knowledge:redactDerived"))
      ?.args[0],
  ).toMatchObject({
    section: "knowledgeEvaluations",
    pagesRemaining: 1,
    deferredAttempt: 2,
  });
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 5);
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    jobs.filter((job) => job.name.endsWith("knowledge:redactDerived")),
  ).toHaveLength(1);
  expect(jobs.filter((job) => job.state.kind === "pending")).toEqual([]);
});

it("keeps bounded old-generation derivative cleanup even after the original source row was removed", async () => {
  const s = await completedForCleanup();
  await s.t.run((ctx) => ctx.db.delete(s.sourceId));
  vi.setSystemTime(s.retainUntil + 1);
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.workCloudAnalysis.expire, {
    sourceId: s.sourceId,
    organizationId: s.org,
    generation: s.lease.generation,
    retainUntil: s.retainUntil,
  });
  const initial = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    initial.find((job) => job.name.endsWith("knowledge:redactDerived"))
      ?.args[0],
  ).toMatchObject({
    sourceId: s.sourceId,
    maxGeneration: s.lease.generation,
    pagesRemaining: 32,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 10);
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    jobs.filter((job) => job.name.endsWith("workCloudAnalysis:expire")),
  ).toHaveLength(1);
  expect(jobs.filter((job) => job.state.kind === "pending")).toEqual([]);
});

it.each(["reel", "reels"])(
  "accepts the stored legacy Instagram %s alias without rewriting its canonical key",
  async (alias) => {
    const url = `https://www.instagram.com/${alias}/Abcdef12345/`;
    const s = await setup(url);
    await s.t.run((ctx) => ctx.db.patch(s.sourceId, { canonical: url }));
    const lease = await s.claim(),
      p = await receipt(s, lease);
    expect(p.post.canonical).toBe("https://www.instagram.com/p/Abcdef12345/");
    await prepare(s, lease, p);
    await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      ...lease,
      operation: "complete",
      output: output(lease, p),
    });
    const saved = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    expect(saved.canonical).toBe(url);
    await expect(currentOrderedSource(saved)).resolves.toMatchObject({
      prepared: { post: { canonical: p.post.canonical } },
    });
  },
);
it("rejects a different stored Instagram identity before approval even when both URLs are supported", async () => {
  const s = await setup("https://www.instagram.com/reel/Abcdef12345/");
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      canonical: "https://www.instagram.com/reel/Different12345/",
    }),
  );
  await expect(s.preview()).rejects.toThrow("APPROVAL_STALE");
});
