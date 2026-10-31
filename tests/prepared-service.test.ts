import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { makePreparedEvidence } from "../packages/contracts/prepared-evidence";
import { preparedCreditQuote } from "../packages/contracts/prepared-service";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";
import { tools as assistantHttpTools } from "../convex/assistantHttp";
import { createKnowledgeHandler } from "../packages/mcp/server";
import { workCloudMonitorMessage } from "../packages/onboarding/work-cloud-monitor";
const preparationMock = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../packages/providers/prepared-media", () => ({
  prepareHostedEvidence: preparationMock.run,
}));
vi.mock("../packages/providers/storage", () => ({
  signedObject: (key: string) =>
    `https://storage.example.test/${encodeURIComponent(key)}`,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("generates prepared-only setup with first-result authority and no legacy runtime prerequisites", () => {
  const scopes = [
    "analysis:request",
    "analysis:execute",
    "events:subscribe",
    "jobs:read",
    "knowledge:read",
  ];
  const grant = {
    clientId: "synthetic-client",
    version: 12,
    state: "active",
    expiresAt: null,
    libraryScope: "all",
    scopes,
    cloudRequestPolicy: "explicit_per_source_v1",
    cloudSaveDefaults: { version: "link-save-cloud-v2" },
  };
  const prompt = workCloudMonitorMessage(
    "synthetic-profile",
    grant,
    { id: grant.clientId, scopes },
    Date.now(),
    true,
  )!;
  expect(prompt).toContain("generation zero");
  expect(prompt).toContain("work_cloud_retained_frame");
  expect(prompt).toContain("reviewed service credits");
  expect(prompt).not.toContain("caption_cache_readiness.py");
  expect(prompt).not.toContain("runtime bootstrap");
  expect(
    workCloudMonitorMessage(
      "synthetic-profile",
      grant,
      {
        id: grant.clientId,
        scopes: scopes.filter((s) => s !== "knowledge:read"),
      },
      Date.now(),
      true,
    ),
  ).toBeNull();
});
async function fixture(catalog = false) {
  vi.useFakeTimers();
  const s = catalog
    ? await cloudCatalogFixture()
    : await analysisVersionFixture();
  const source = (await s.t.run((c) => c.db.get(s.sourceId)))!;
  const actor = (await s.t.run((c) =>
    c.db.get(source.personalAnalysis!.actor),
  ))!;
  await s.t.run(async (c) => {
    await c.db.patch(actor._id, { profileVerifiedAt: Date.now() });
    if (
      !(await c.db
        .query("storageUsage")
        .withIndex("by_org", (x) => x.eq("organizationId", s.org))
        .unique())
    )
      await c.db.insert("storageUsage", {
        organizationId: s.org,
        bytes: s.bytes.length,
      });
  });
  vi.stubEnv(
    "CLOUD_CATALOG_ALPHA_ACCESS_JSON",
    JSON.stringify({
      version: "catalog-operator-alpha-access-v1",
      subjects: [actor.subject],
      reviewedAt: Date.now() - 1000,
      expiresAt: Date.now() + 86400000,
      reviewReference: "synthetic current operator access",
    }),
  );
  const config = {
    version: "prepared-service-v1",
    id: "prepared-service-fixture",
    enabled: true,
    subjects: [actor.subject],
    maximumDurationMs: 180000,
    maximumApiUsd: 0.03,
    maximumDailyJobs: 100,
    maximumHourlyJobs: 20,
    contributorAllowed: true,
    providerPermissionReference: "synthetic reviewed Gateway/Meta processing",
    catalogPublicationAllowed: catalog,
  };
  vi.stubEnv("PREPARED_ANALYSIS_CONFIGURATION_JSON", JSON.stringify(config));
  vi.stubEnv("VERCEL_AI_GATEWAY_API_KEY", "synthetic-fixture-key");
  const request = {
    sourceId: s.sourceId,
    executor: "gateway" as const,
    reanalyze: true,
  };
  const quote = () => s.owner.query(api.preparedService.quote, request);
  const start = async (key = "prepared-service-start") => {
    const q = await quote();
    return s.owner.mutation(api.preparedService.start, {
      ...request,
      key,
      quoteHash: q.quoteHash,
      maximumCredits: q.maximumCredits,
    });
  };
  return { ...s, source, actor, config, request, quote, start };
}
async function retained(
  s: Awaited<ReturnType<typeof fixture>>,
  runId: any,
  durationMs = 74302,
  analyze = true,
) {
  await s.t.mutation(internal.preparedAnalysis.claim, { runId });
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId,
    stage: "transcribing",
  });
  const prepared = await makePreparedEvidence({
    requestedCanonical: s.source.canonical,
    canonical: s.source.canonical,
    platform: "instagram",
    sourceHash: "a".repeat(64),
    recipeHash: "b".repeat(64),
    downloaderVersion: "2026.10.26",
    title: "Real prepared metadata fixture",
    authorName: "creator",
    durationMs,
    language: "en",
    observedAt: Date.now(),
    transcript: {
      origin: "platform_manual",
      model: null,
      provider: null,
      inputSha256: "c".repeat(64),
    },
    segments: [
      { id: "speech-1", startMs: 0, endMs: 1000, text: "Check the evidence." },
    ],
    frames: [
      {
        id: "frame-1",
        timestampMs: 1000,
        sha256: createHash("sha256").update(s.bytes).digest("hex"),
        bytes: s.bytes.length,
        width: 2,
        height: 2,
      },
    ],
  });
  const f = prepared.evidence.frames[0];
  const evidenceId = await s.t.mutation(internal.preparedAnalysis.retain, {
    runId,
    prepared,
    receipt: { preparation: { stopAcknowledged: true } },
    frames: [
      {
        frameId: f.id,
        key: `${s.org}/prepared-service-fixture`,
        size: f.bytes,
        sha256: f.sha256,
        width: f.width,
        height: f.height,
        timestampMs: f.timestampMs,
      },
    ],
  });
  if (analyze)
    await s.t.mutation(internal.preparedAnalysis.progress, {
      runId,
      stage: "analyzing",
    });
  return { prepared, evidenceId };
}
async function finish(s: Awaited<ReturnType<typeof fixture>>, runId: any) {
  const e = await retained(s, runId);
  const output = {
    schemaVersion: "analysis-version-output-v1",
    sourceId: s.sourceId,
    attemptId: runId,
    evidenceHash: e.prepared.evidence.evidenceHash,
    postRevisionHash: e.prepared.evidence.sourceRevisionHash,
    summary: "Prepared source insights",
    warnings: [],
    insights: s.output.insights,
  };
  const receipt = {
    model: "meta/muse-spark-1.3-contributor",
    provider: "meta",
    requestId: "gen_" + "a".repeat(26),
    startedAt: Date.now() - 1000,
    completedAt: Date.now(),
    rateEstimateUsd: 0.002,
  };
  const versionId = await s.t.mutation(
    internal.preparedAnalysis.finishGateway,
    { runId, output, receipt },
  );
  return { ...e, versionId, output, receipt };
}
async function nativeReady(s: Awaited<ReturnType<typeof fixture>>) {
  vi.stubEnv("WORK_CLOUD_SAVED_LINKS_ENABLED", "true");
  vi.stubEnv("WORK_CLOUD_SAVED_LINKS_VERIFIED", "true");
  vi.stubEnv(
    "WORK_CLOUD_ADMISSION_JSON",
    JSON.stringify({
      id: "native-prepared-policy",
      subject: s.actor.subject,
      maximumJobs: 100,
      maximumHourlyJobs: 20,
      period: "day",
      startsAt: Date.now(),
      expiresAt: null,
    }),
  );
  await s.t.run((c) =>
    c.db.patch(s.grant.id, {
      cloudSaveDefaults: {
        version: "link-save-cloud-v2",
        model: "synthetic-new-model",
        effort: "high",
        retentionMs: 86400000,
      },
    }),
  );
  await s.assistant.mutation(internal.assistantEvents.install, {
    profileId: s.org,
    grantVersion: s.grant.version,
    eventName: "video_link_saved",
    externalId: "sub_" + "b".repeat(64),
    ciphertext: "synthetic-native-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  });
}
async function freshSource(s: Awaited<ReturnType<typeof fixture>>) {
  const sourceId = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    key: "fresh-service-video",
    kind: "url",
    url: "https://www.instagram.com/reel/Fresh000001/",
    title: "Imported video link",
    rightsAttested: true,
  });
  return {
    ...s,
    sourceId,
    source: (await s.t.run((c) => c.db.get(sourceId)))!,
  };
}

it("selects a first prepared result at generation zero and publishes it automatically", async () => {
  const base = await fixture(true),
    s = await freshSource(base);
  if (!("serviceOrg" in base)) throw Error("Expected catalog fixture");
  vi.stubEnv(
    "CLOUD_CATALOG_CONFIGURATION_JSON",
    JSON.stringify({
      version: "cloud-catalog-config-v2",
      serviceOrganizationId: base.serviceOrg,
      maximumStorageBytes: 20000000,
      reviewedAt: Date.now() - 5000,
      expiresAt: Date.now() + 86400000,
      permissions: [],
      defaultPolicy: {
        version: "automatic-neutral-catalog-v1",
        id: "prepared-service-standing",
        disclosureVersion: "synthetic-notice",
        rightsBasis: "user_attested",
        platforms: ["instagram", "tiktok"],
        providerPermissionReference: "synthetic source route",
        contentPermissionReference: "synthetic user attestation",
        privacyReviewReference: "synthetic neutral-only projection",
        reviewedAt: Date.now() - 5000,
        expiresAt: Date.now() + 86400000,
        maximumRetentionMs: 86400000,
      },
    }),
  );
  const request = { sourceId: s.sourceId, executor: "gateway" as const };
  const q = await s.owner.query(api.preparedService.quote, request);
  const run = await s.owner.mutation(api.preparedService.start, {
    ...request,
    key: "fresh-first-result",
    quoteHash: q.quoteHash,
    maximumCredits: q.maximumCredits,
  });
  const secondSubject = "user_08234567890123456789012345";
  await s.t.mutation(internal.accounts.syncUser, {
    subject: secondSubject,
    email: "second@example.test",
    name: "Second account",
    verified: true,
  });
  const second = s.t.withIdentity({ subject: secondSubject }),
    secondOrg = await second.mutation(api.organizations.createPrivate, {});
  vi.stubEnv(
    "CLOUD_CATALOG_ALPHA_ACCESS_JSON",
    JSON.stringify({
      version: "catalog-operator-alpha-access-v1",
      subjects: [s.actor.subject, secondSubject],
      reviewedAt: Date.now() - 1000,
      expiresAt: Date.now() + 86400000,
      reviewReference: "synthetic two-account access",
    }),
  );
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({ ...s.config, subjects: [s.actor.subject, secondSubject] }),
  );
  const secondId = await second.mutation(api.product.capture, {
    organizationId: secondOrg,
    key: "second-same-video",
    kind: "url",
    url: s.source.url!,
    title: "Imported video link",
    rightsAttested: true,
  });
  const secondRequest = { sourceId: secondId, executor: "gateway" as const },
    secondQuote = await second.query(api.preparedService.quote, secondRequest);
  const waiting = await second.mutation(api.preparedService.start, {
    ...secondRequest,
    key: "second-same-analysis",
    quoteHash: secondQuote.quoteHash,
    maximumCredits: secondQuote.maximumCredits,
  });
  expect(waiting).toMatchObject({
    runId: null,
    state: "waiting_for_shared_analysis",
    chargedCredits: 0,
  });
  expect(
    await second.query(api.preparedService.status, { sourceId: secondId }),
  ).toMatchObject({ state: "waiting_for_shared_analysis", maximumCredits: 0 });
  const f = await finish(s, run.runId!);
  expect(s.source.generation).toBe(0);
  expect(
    (await s.t.run((c) => c.db.get(s.sourceId)))?.selectedAnalysisVersionId,
  ).toBe(f.versionId);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(null, { status: 200 })
        : new Response(s.bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const published = await s.t.action(
    internal.cloudCatalogActions.publishCompleted,
    {
      sourceId: s.sourceId,
      actorId: s.actor._id,
      generation: 0,
      versionId: f.versionId,
    },
  );
  expect(published.state).toBe("published");
  expect(
    (await s.t.run((c) => c.db.get(s.sourceId)))?.catalogStatus?.state,
  ).toBe("published");
  const waitSource = (await s.t.run((c) => c.db.get(secondId)))!;
  await s.t.mutation(internal.cloudCatalog.fulfillWaiters, {
    familyId: waitSource.catalogWait!.familyId,
  });
  const secondSource = await s.t.run((c) => c.db.get(secondId));
  expect(secondSource).toMatchObject({ state: "ready" });
  expect(secondSource?.publicImportId).toBeTruthy();
  const secondWallet = await s.t.run((c) =>
    c.db
      .query("wallets")
      .withIndex("by_org", (x) => x.eq("organizationId", secondOrg))
      .unique(),
  );
  expect(secondWallet?.spent ?? 0).toBe(0);
  expect(secondWallet?.reserved ?? 0).toBe(0);
});

it("automatic app Save prepares once and creates a generation-zero retained Assistant event", async () => {
  const s = await fixture();
  await nativeReady(s);
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({ ...s.config, automaticOwnSubscriptionPreparation: true }),
  );
  const args = {
    organizationId: s.org,
    key: "automatic-prepared-save",
    url: "https://www.instagram.com/reel/Fresh000002/",
    title: "Imported video link",
    rightsAttested: true as const,
    grantId: s.grant.id,
    grantVersion: s.grant.version,
  };
  const first = await s.owner.mutation(api.workCloudSaves.capture, args);
  const again = await s.owner.mutation(api.workCloudSaves.capture, args);
  expect(again.sourceId).toBe(first.sourceId);
  expect(first.status).toBe("preparing_evidence");
  const source = (await s.t.run((c) => c.db.get(first.sourceId)))!;
  expect(source.workCloudSaveIntent).toBeUndefined();
  expect(source.personalAnalysis).toBeUndefined();
  expect(source.generation).toBe(0);
  const runs = await s.t.run((c) =>
    c.db
      .query("mediaPreparations")
      .withIndex("by_org_source", (x) =>
        x.eq("organizationId", s.org).eq("sourceId", first.sourceId),
      )
      .take(2),
  );
  expect(runs).toHaveLength(1);
  await retained(
    { ...s, source, sourceId: first.sourceId },
    runs[0]._id,
    74302,
    false,
  );
  const attemptId = await s.t.mutation(
    internal.preparedAnalysis.queueSubscription,
    { runId: runs[0]._id },
  );
  const attempt = await s.t.run((c) => c.db.get(attemptId));
  expect(attempt).toMatchObject({ state: "queued", sourceGeneration: 0 });
  expect(
    await s.owner.query(api.preparedService.status, {
      sourceId: first.sourceId,
    }),
  ).toMatchObject({ state: "waiting_for_assistant", chargedCredits: 1 });
});

it("an ordinary MCP link Save automatically admits server preparation without a legacy saved intent", async () => {
  const s = await fixture();
  await nativeReady(s);
  const grant = (await s.t.run((c) => c.db.get(s.grant.id)))!,
    scopes = [...grant.scopes, "links:save"];
  await s.t.run((c) => c.db.patch(grant._id, { scopes }));
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      { id: grant.clientId, name: "Synthetic native connection", scopes },
    ]),
  );
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({ ...s.config, automaticOwnSubscriptionPreparation: true }),
  );
  const assistant = s.t.withIdentity({
    subject: s.actor.subject,
    issuer: process.env.MCP_AUTH_ISSUER!,
    client_id: grant.clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  });
  const args = {
    profileId: s.org,
    url: "https://www.instagram.com/reel/Fresh000003/",
    title: "Imported video link",
    rightsAttested: true as const,
    key: "mcp-auto-prepared-link",
  };
  const first = await assistant.mutation(internal.assistant.saveLink, args),
    again = await assistant.mutation(internal.assistant.saveLink, args);
  expect(first).toMatchObject({
    analysis_route: "prepared_own_cloud",
    analysis_requested: true,
    status: "queued",
  });
  if (!("run_id" in first) || !("run_id" in again))
    throw Error("Expected prepared Save receipts");
  expect(again.run_id).toBe(first.run_id);
  const source = await s.t.run((c) => c.db.get(first.source_id));
  expect(source?.workCloudSaveIntent).toBeUndefined();
  expect(source?.personalAnalysis).toBeUndefined();
});

it("quotes duration boundaries once, with a separate preparation credit and free subscription reasoning", () => {
  expect(
    [1, 60000, 60001, 120000, 120001].map(
      (n) => preparedCreditQuote(n, "gateway", false).maximum,
    ),
  ).toEqual([2, 2, 3, 3, 4]);
  expect(preparedCreditQuote(74302, "gateway", true)).toEqual({
    preparation: 0,
    analysis: 2,
    maximum: 2,
  });
  expect(preparedCreditQuote(74302, "work_cloud", false)).toEqual({
    preparation: 1,
    analysis: 0,
    maximum: 1,
  });
});
it("starts one reserved run from an exact MCP quote and rejects tampering and foreign access", async () => {
  const s = await fixture(),
    q = await s.assistant.query(
      internal.preparedService.assistantQuote,
      s.request,
    );
  expect(q).toMatchObject({
    maximumCredits: 4,
    preparationCredits: 1,
    analysisCredits: 3,
    model: "meta/muse-spark-1.3-contributor",
  });
  const args = {
    ...s.request,
    key: "mcp-prepared-once",
    quoteHash: q.quoteHash,
    maximumCredits: 4,
  };
  const [a, b] = await Promise.all([
    s.assistant.mutation(internal.preparedService.assistantStart, args),
    s.assistant.mutation(internal.preparedService.assistantStart, args),
  ]);
  expect(a.runId).toBe(b.runId);
  const w = await s.t.run((c) =>
    c.db
      .query("wallets")
      .withIndex("by_org", (x) => x.eq("organizationId", s.org))
      .unique(),
  );
  expect(w!.reserved).toBe(4);
  await expect(
    s.owner.mutation(api.preparedService.start, {
      ...args,
      key: "tampered-operation",
      maximumCredits: 3,
    }),
  ).rejects.toThrow(/QUOTE_CHANGED/);
  await expect(
    s.t
      .withIdentity({ subject: "user_foreign" })
      .query(api.preparedService.quote, s.request),
  ).rejects.toThrow();
});
it("uses only the configured original sole-owner legacy wallet without adoption or another workspace allowance", async () => {
  const s = await fixture();
  await s.t.run((c) => c.db.patch(s.org, { privateOwnerId: undefined }));
  await expect(s.quote()).rejects.toThrow(/PERSONAL_FUNDING_REQUIRED/);
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({ ...s.config, legacyOwnerFundingOrganizationId: s.org }),
  );
  const run = await s.start();
  await finish(s, run.runId!);
  expect(
    await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
  ).toMatchObject({ state: "ready", chargedCredits: 3 });
  const organization = await s.t.run((c) => c.db.get(s.org));
  expect(organization?.privateOwnerId).toBeUndefined();
  const other = await s.owner.mutation(api.organizations.create, {
    name: "Another sole-owner workspace",
  });
  const sourceId = await s.owner.mutation(api.product.capture, {
    organizationId: other,
    key: "other-legacy-save",
    kind: "url",
    url: "https://www.instagram.com/reel/Fresh000004/",
    title: "Imported video link",
    rightsAttested: true,
  });
  await expect(
    s.owner.query(api.preparedService.quote, { sourceId, executor: "gateway" }),
  ).rejects.toThrow(/PERSONAL_FUNDING_REQUIRED/);
});
it("settles actual duration once, preserves old balance/incumbent, and exposes only safe status through MCP", async () => {
  const s = await fixture(),
    a = await s.start(),
    f = await finish(s, a.runId!);
  await s.t.mutation(internal.preparedAnalysis.finishGateway, {
    runId: a.runId!,
    output: f.output,
    receipt: f.receipt,
  });
  const w = await s.t.run((c) =>
    c.db
      .query("wallets")
      .withIndex("by_org", (x) => x.eq("organizationId", s.org))
      .unique(),
  );
  expect(w).toMatchObject({ granted: 30, spent: 3, reserved: 0 });
  const status = await s.assistant.query(
    internal.preparedService.assistantStatus,
    { sourceId: s.sourceId },
  );
  expect(status).toMatchObject({
    state: "ready",
    maximumCredits: 4,
    chargedCredits: 3,
    billingState: "settled",
    versionId: f.versionId,
  });
  expect(JSON.stringify(status)).not.toContain("requestId");
  const history = await s.owner.query(api.analysisVersions.history, {
    sourceId: s.sourceId,
    paginationOpts: { numItems: 5, cursor: null },
  });
  expect(history.selectedVersionId).not.toBe(f.versionId);
  expect(history.page[0].state).toBe("ready");
  const next = await s.quote();
  expect(next).toMatchObject({
    preparationCredits: 0,
    analysisCredits: 2,
    maximumCredits: 2,
    reusedEvidenceId: f.evidenceId,
  });
});
it("leaves uncertain provider work reserved and refuses another paid dispatch", async () => {
  const s = await fixture(),
    a = await s.start();
  await retained(s, a.runId!);
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId: a.runId!,
    code: "PREPARATION_OUTCOME_UNCONFIRMED",
  });
  expect(
    (await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }))
      .billingState,
  ).toBe("reserved");
  await expect(s.start("another-attempt")).rejects.toThrow(/SOURCE_BUSY/);
});
it("releases a confirmed stopped download's reservation without treating an unknown stop as safe", async () => {
  const s = await fixture(),
    run = await s.start();
  await s.t.mutation(internal.preparedAnalysis.claim, { runId: run.runId! });
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId: run.runId!,
    stage: "downloading",
  });
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId: run.runId!,
    kind: "preparation_failure",
    receipt: { stopAcknowledged: true, completedAt: Date.now() },
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId: run.runId!,
    code: "SOURCE_UNAVAILABLE",
  });
  expect(
    await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
  ).toMatchObject({
    state: "failed",
    chargedCredits: 0,
    billingState: "settled",
  });
  const next = await s.start("unknown-stop-next");
  await s.t.mutation(internal.preparedAnalysis.claim, { runId: next.runId! });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId: next.runId!,
    code: "SOURCE_UNAVAILABLE",
  });
  expect(
    await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
  ).toMatchObject({
    state: "unknown",
    chargedCredits: null,
    billingState: "reserved",
  });
});
it("does not reserve or dispatch for ready-cache reads", async () => {
  const s = await fixture(),
    r = { sourceId: s.sourceId, executor: "gateway" as const };
  const q = await s.owner.query(api.preparedService.quote, r);
  expect(q.maximumCredits).toBe(0);
  const x = await s.owner.mutation(api.preparedService.start, {
    ...r,
    key: "cache-only-read",
    quoteHash: q.quoteHash,
    maximumCredits: 0,
  });
  expect(x).toMatchObject({ cacheHit: true, chargedCredits: 0, runId: null });
});
it("supports cached MCP clients through the existing credit command and safe job status", async () => {
  const s = await freshSource(await fixture());
  const args = {
    profileId: s.org,
    sourceId: s.sourceId,
    mode: "credits" as const,
  };
  const quoted = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    args,
  );
  expect(quoted.status).toBe("quote_required");
  if (!("quote" in quoted) || !quoted.quote) throw Error("Expected quote");
  const accepted = {
    ...args,
    generation: s.source.generation,
    maxCredits: quoted.quote.maximumCredits,
  };
  const started = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    accepted,
  );
  expect(started.status).toBe("queued");
  const status = await s.assistant.query(internal.assistant.getJobStatus, {
    profileId: s.org,
    sourceId: s.sourceId,
  });
  expect(status).toMatchObject({
    status: "queued",
    processing: { executor: "credits", maximum_credits: 4 },
  });
  if (!("runId" in started) || !started.runId) throw Error("Expected run");
  await finish(s, started.runId);
  const replay = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    accepted,
  );
  expect(replay).toMatchObject({ runId: started.runId, reused: true });
  const done = await s.assistant.query(internal.assistant.getJobStatus, {
    profileId: s.org,
    sourceId: s.sourceId,
  });
  expect(done).toMatchObject({
    status: "ready",
    processing: { charged_credits: 3 },
  });
});
it("retains metadata without an extractor duration and defers the mandatory bound to decoding", async () => {
  const s = await freshSource(await fixture());
  const request = { sourceId: s.sourceId, executor: "gateway" as const };
  const q = await s.owner.query(api.preparedService.quote, request);
  const run = await s.owner.mutation(api.preparedService.start, {
    ...request,
    key: "missing-duration-test",
    quoteHash: q.quoteHash,
    maximumCredits: q.maximumCredits,
  });
  preparationMock.run.mockImplementationOnce(async (_url, callbacks) => {
    expect(callbacks.maximumDurationMs).toBe(180000);
    await callbacks.stage("metadata");
    await callbacks.metadata({
      title: "Actual platform title",
      authorName: "Creator",
      resolvedCanonical: s.source.canonical,
    });
    await callbacks.failed({ stopAcknowledged: true, completedAt: Date.now() });
    throw new Error("Synthetic later download failure");
  });
  await s.t.action(internal.preparedMedia.run, { runId: run.runId! });
  const source = await s.t.run((c) => c.db.get(s.sourceId));
  expect(source!.linkPreview).toMatchObject({
    title: "Actual platform title",
    state: "ready",
  });
  expect(
    await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
  ).toMatchObject({ state: "failed", chargedCredits: 0 });
});
it("retries a settled prepared failure through cached MCP and replays the retry key without dispatching twice", async () => {
  const s = await freshSource(await fixture());
  const args = {
    profileId: s.org,
    sourceId: s.sourceId,
    mode: "credits" as const,
  };
  const first: any = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    args,
  );
  const initial: any = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    {
      ...args,
      generation: s.source.generation,
      maxCredits: first.quote.maximumCredits,
    },
  );
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId: initial.runId,
    code: "SOURCE_UNAVAILABLE",
  });
  const source = (await s.t.run((c) => c.db.get(s.sourceId)))!;
  const retry = {
    generation: source.generation,
    revision: source.updatedAt,
    key: "explicit-safe-retry",
  };
  const q: any = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    { ...args, retry },
  );
  const accepted = {
    ...args,
    retry,
    generation: source.generation,
    maxCredits: q.quote.maximumCredits,
  };
  const second: any = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    accepted,
  );
  expect(second.runId).not.toBe(initial.runId);
  await s.t.mutation(internal.preparedAnalysis.claim, { runId: second.runId });
  expect(
    await s.assistant.mutation(internal.assistant.requestAnalysis, accepted),
  ).toMatchObject({ runId: second.runId, reused: true });
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      ...args,
      retry: { ...retry, key: "other-retry-key" },
    }),
  ).rejects.toThrow(/SOURCE_BUSY/);
});
it("retries native preparation with current defaults and at most one credit, preserving the failed row", async () => {
  const s = await freshSource(await fixture());
  await nativeReady(s);
  const request = { sourceId: s.sourceId, executor: "work_cloud" as const };
  const q = await s.owner.query(api.preparedService.quote, request);
  const initial = await s.owner.mutation(api.preparedService.start, {
    ...request,
    key: "first-native-prepare",
    quoteHash: q.quoteHash,
    maximumCredits: q.maximumCredits,
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId: initial.runId!,
    code: "SOURCE_UNAVAILABLE",
  });
  const source = (await s.t.run((c) => c.db.get(s.sourceId)))!;
  const args = {
    profileId: s.org,
    sourceId: s.sourceId,
    mode: "work_cloud" as const,
    retry: {
      generation: source.generation,
      revision: source.updatedAt,
      key: "retry-native-prepare",
    },
  };
  const next = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    args,
  );
  expect(next).toMatchObject({
    status: "queued",
    analysis_route: "prepared_own_cloud",
  });
  if (!("runId" in next) || !next.runId) throw Error("Expected prepared retry");
  expect(next.runId).not.toBe(initial.runId);
  expect(
    await s.assistant.mutation(internal.assistant.requestAnalysis, args),
  ).toMatchObject({ runId: next.runId, reused: true });
  const row = await s.t.run((c) => c.db.get(next.runId));
  expect(row!.receipt.admission.quote.maximumCredits).toBe(1);
});
it("rejects a changed tariff configuration or revoked entitlement before dispatch", async () => {
  const s = await fixture(),
    q = await s.quote();
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({ ...s.config, id: "new-tariff-config" }),
  );
  await expect(
    s.owner.mutation(api.preparedService.start, {
      ...s.request,
      key: "stale-quote-once",
      quoteHash: q.quoteHash,
      maximumCredits: q.maximumCredits,
    }),
  ).rejects.toThrow(/QUOTE_CHANGED/);
  vi.stubEnv("CLOUD_CATALOG_ALPHA_ACCESS_JSON", "");
  await expect(s.quote()).rejects.toThrow(/FORBIDDEN/);
});

it("carries credit quote, start and status through actual MCP2 and authenticated HTTP schemas", async () => {
  const s = await fixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ sub: s.actor.subject })),
  );
  const http = (
    assistantHttpTools as unknown as {
      _handler: (ctx: unknown, request: Request) => Promise<Response>;
    }
  )._handler;
  const handler = createKnowledgeHandler(async (operation, args) => {
    const response = await http(
      {
        runMutation: (ref: any, value: any) => s.assistant.mutation(ref, value),
        runQuery: (ref: any, value: any) => s.assistant.query(ref, value),
      },
      new Request("https://synthetic.example/assistant-tools", {
        method: "POST",
        headers: { authorization: "Bearer synthetic-access-token-0123456789" },
        body: JSON.stringify({ operation, args }),
      }),
    );
    return {
      ok: response.ok,
      status: response.status,
      value: await response.json(),
    };
  });
  const send = async (name: string, args: unknown) => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": {
            name: "Synthetic",
            version: "1",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    };
    const response = await handler.fetch(
      new Request("https://scroll.companynerve.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": name,
        },
        body: JSON.stringify(body),
      }),
      {
        parsedBody: body,
        authInfo: {
          token: "synthetic",
          clientId: "synthetic",
          scopes: [
            "knowledge:read",
            "jobs:read",
            "analysis:request",
            "analysis:execute",
          ],
          resource: new URL("https://scroll.companynerve.com/mcp"),
          resourceMetadataUrl:
            "https://scroll.companynerve.com/.well-known/oauth-protected-resource/mcp",
        },
      },
    );
    return response.json();
  };
  const q = await send("quote_video_analysis", s.request);
  expect(q.result.isError).not.toBe(true);
  const quoted = q.result.structuredContent;
  const started = await send("start_video_analysis", {
    ...s.request,
    key: "real-mcp-start",
    quoteHash: quoted.quoteHash,
    maximumCredits: quoted.maximumCredits,
  });
  expect(started.result.isError).not.toBe(true);
  expect(started.result.structuredContent.state).toBe("queued");
  const status = await send("video_analysis_status", { sourceId: s.sourceId });
  expect(status.result.structuredContent).toMatchObject({
    maximumCredits: 4,
    billingState: "reserved",
  });
});

it("settles preparation only for native reasoning and saves its version without legacy extraction", async () => {
  const s = await fixture();
  vi.stubEnv("WORK_CLOUD_SAVED_LINKS_ENABLED", "true");
  vi.stubEnv("WORK_CLOUD_SAVED_LINKS_VERIFIED", "true");
  vi.stubEnv(
    "WORK_CLOUD_ADMISSION_JSON",
    JSON.stringify({
      id: "native-prepared-policy",
      subject: s.actor.subject,
      maximumJobs: 100,
      maximumHourlyJobs: 20,
      period: "day",
      startsAt: Date.now(),
      expiresAt: null,
    }),
  );
  await s.t.run((c) =>
    c.db.patch(s.grant.id, {
      cloudSaveDefaults: {
        version: "link-save-cloud-v2",
        model: "synthetic-new-model",
        effort: "high",
        retentionMs: 86400000,
      },
    }),
  );
  await s.assistant.mutation(internal.assistantEvents.install, {
    profileId: s.org,
    grantVersion: s.grant.version,
    eventName: "video_link_saved",
    externalId: "sub_" + "b".repeat(64),
    ciphertext: "synthetic-native-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  });
  const request = { ...s.request, executor: "work_cloud" as const },
    q = await s.owner.query(api.preparedService.quote, request);
  expect(q).toMatchObject({
    maximumCredits: 1,
    preparationCredits: 1,
    analysisCredits: 0,
  });
  const run = await s.owner.mutation(api.preparedService.start, {
    ...request,
    key: "native-prepared-start",
    quoteHash: q.quoteHash,
    maximumCredits: 1,
  });
  const e = await retained(s, run.runId!, 74302, false);
  const attemptId = await s.t.mutation(
    internal.preparedAnalysis.queueSubscription,
    { runId: run.runId! },
  );
  const claim = await s.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: s.sourceId,
    attemptId,
    taskId: "native-prepared-fixture",
    operation: "claim",
  });
  const lease = {
    sourceId: s.sourceId,
    attemptId,
    taskId: "native-prepared-fixture",
    leaseToken: claim.leaseToken,
  };
  await s.assistant.mutation(internal.analysisVersions.acknowledgeFrame, {
    ...lease,
    frameId: "frame-1",
  });
  const output = {
    schemaVersion: "analysis-version-output-v1",
    sourceId: s.sourceId,
    attemptId,
    evidenceHash: e.prepared.evidence.evidenceHash,
    postRevisionHash: e.prepared.evidence.sourceRevisionHash,
    summary: "Native prepared insights",
    warnings: [],
    insights: s.output.insights,
  };
  const done = await s.assistant.mutation(internal.analysisVersions.dispatch, {
    ...lease,
    operation: "complete",
    output,
  });
  expect(done.accepted).toBe(true);
  expect(
    await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
  ).toMatchObject({
    state: "ready",
    chargedCredits: 1,
    billingState: "settled",
  });
  vi.stubEnv("VERCEL_AI_GATEWAY_API_KEY", "");
  const again = await s.owner.query(api.preparedService.quote, request);
  expect(again).toMatchObject({
    maximumCredits: 0,
    reusedEvidenceId: e.evidenceId,
  });
});

it("projects service-prepared managed results with truthful provenance into the existing catalog family", async () => {
  const s = await fixture(true),
    run = await s.start(),
    f = await finish(s, run.runId!);
  const preview = await s.owner.query(api.cloudCatalog.preview, {
    sourceId: s.sourceId,
    versionId: f.versionId,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(null, { status: 200 })
        : new Response(s.bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const contribution = await s.owner.action(
    api.cloudCatalogActions.contribute,
    {
      sourceId: s.sourceId,
      versionId: f.versionId,
      key: "managed-catalog-copy",
      consent: preview.consent,
    },
  );
  expect(contribution.state).toBe("published");
  const row = await s.t.run((c) => c.db.get(contribution.contributionId));
  const artifact = await s.t.run((c) => c.db.get(row!.artifactId));
  expect(artifact).toMatchObject({
    origin: "cloud",
    authority: {
      version: "prepared-catalog-authority-v2",
      funding: "credits",
      provenance: "managed_api_reported",
      preparationFunding: "service_credits",
    },
  });
  if (!artifact || !("origin" in artifact) || artifact.origin !== "cloud")
    throw Error("Expected shared cloud artifact");
  const version = await s.t.run((c) => c.db.get(artifact.versionId));
  expect(version!.provenance).toBe("managed_api_reported");
  expect(JSON.stringify(version!.output)).not.toContain(s.sourceId);
});

it("refunds unused analysis credits after a confirmed rejected answer and refunds an undispatched expired run", async () => {
  const s = await fixture(),
    run = await s.start();
  await retained(s, run.runId!);
  await s.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId: run.runId!,
    kind: "analysis_output",
    receipt: {
      content: "returned invalid fixture answer",
      responseSha256: "d".repeat(64),
    },
  });
  await s.t.mutation(internal.preparedAnalysis.fail, {
    runId: run.runId!,
    code: "INVALID_EVIDENCE",
  });
  expect(
    await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
  ).toMatchObject({ state: "failed", chargedCredits: 1 });
  const next = await s.start("never-dispatched-expiry");
  vi.setSystemTime(Date.now() + 900001);
  await s.t.mutation(internal.preparedAnalysis.expire, { runId: next.runId! });
  expect(
    await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
  ).toMatchObject({ state: "failed", chargedCredits: 0 });
});
