import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";
import {
  makePreparedEvidence,
  validatePreparedEvidence,
} from "../packages/contracts/prepared-evidence";
import { preparedCreditQuote } from "../packages/contracts/prepared-service";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";
import { tools as assistantHttpTools } from "../convex/assistantHttp";
import { createKnowledgeHandler } from "../packages/mcp/server";
import { workCloudMonitorMessage } from "../packages/onboarding/work-cloud-monitor";
import {
  currentCloudArtifact,
  associateContributedCloudVersion,
} from "../convex/lib/cloudCatalog";
import { postContextPageOutput } from "../packages/contracts/post-context";
import { knowledgeFetchStructuredOutput } from "../packages/contracts/knowledge-read";
import * as analysisHistory from "../convex/lib/analysisHistory";
import { preparedStatusOutput } from "../packages/contracts/prepared-service";
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
function enableOpenAi(s: Awaited<ReturnType<typeof fixture>>) {
  const policy = {
    version: "openai-promotional-grant-v1",
    id: "openai-fixture-grant",
    enabled: true,
    organizationId: "org-" + "a".repeat(20),
    projectId: "proj_" + "b".repeat(20),
    verifiedAt: Date.now() - 1000,
    expiresAt: Date.now() + 86400000,
    noPaidBillingPlan: true,
    maximumJobs: 1,
    maximumRequestNanoUsd: 25000000,
    maximumTotalNanoUsd: 25000000,
    verifiedGrantBalanceNanoUsd: 24000000000,
    allowedModels: ["gpt-6-luna"],
    subjects: [s.actor.subject],
    contentPolicy: "public_prepared_evidence_only",
    providerPermissionReference:
      "Synthetic reviewed OpenAI public evidence processing",
  };
  vi.stubEnv("OPENAI_PROMOTIONAL_CONFIGURATION_JSON", JSON.stringify(policy));
  vi.stubEnv("OPENAI_PROMOTIONAL_API_KEY", "sk-synthetic-no-authority");
  return policy;
}
async function openAiRetained(s: Awaited<ReturnType<typeof fixture>>) {
  const previous = await s.start("retain-before-openai");
  const incumbent = await finish(s, previous.runId!);
  const policy = enableOpenAi(s);
  vi.stubEnv("VERCEL_AI_GATEWAY_API_KEY", "");
  const request = {
    ...s.request,
    model: "gpt-6-luna" as const,
    effort: "max" as const,
  };
  const quote = await s.owner.query(api.preparedService.quote, request);
  const run = await s.owner.mutation(api.preparedService.start, {
    ...request,
    key: "retained-openai-once",
    quoteHash: quote.quoteHash,
    maximumCredits: quote.maximumCredits,
  });
  return { previous, incumbent, policy, request, quote, run };
}
function mockOpenAi(
  s: Awaited<ReturnType<typeof fixture>>,
  mode: "ready" | "count_failed" | "timeout" = "ready",
) {
  const transport = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://storage.example.test/"))
      return new Response(s.bytes, {
        headers: { "content-type": "image/jpeg" },
      });
    if (url.endsWith("/input_tokens"))
      return mode === "count_failed"
        ? new Response(null, { status: 503 })
        : Response.json({ object: "response.input_tokens", input_tokens: 100 });
    if (url === "https://api.openai.com/v1/responses") {
      if (mode === "timeout")
        throw new DOMException("Timed out", "TimeoutError");
      return Response.json({
        id: "resp_synthetic",
        status: "completed",
        model: "gpt-6-luna",
        service_tier: "default",
        reasoning: { effort: "max" },
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "Retained evidence lesson",
                  warnings: [],
                  insights: s.output.insights,
                }),
              },
            ],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 200,
          input_tokens_details: { cached_tokens: 20 },
        },
      });
    }
    if (init?.method === "PUT") return new Response(null, { status: 200 });
    throw Error("Unexpected network request");
  });
  vi.stubGlobal("fetch", transport);
  return transport;
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

it.each([
  ["https://www.instagram.com/reel/Fresh000003/", false],
  ["https://x.com/creator/status/1234567890123456789", false],
  ["https://twitter.com/creator/status/1234567890123456789/video/1", false],
  ["https://x.com/creator/status/1234567890123456789", true],
] as const)(
  "automatically prepares an MCP link without a legacy intent: %s, paid=%s",
  async (url, paid) => {
    const s = await fixture(true);
    if (!("serviceOrg" in s)) throw Error("Expected catalog fixture");
    vi.stubEnv(
      "CLOUD_CATALOG_CONFIGURATION_JSON",
      JSON.stringify({
        version: "cloud-catalog-config-v2",
        serviceOrganizationId: s.serviceOrg,
        maximumStorageBytes: 20000000,
        reviewedAt: Date.now() - 5000,
        expiresAt: Date.now() + 86400000,
        permissions: [],
        defaultPolicy: {
          version: "automatic-neutral-catalog-v1",
          id: "x-private-standing-test",
          disclosureVersion: "synthetic-notice",
          rightsBasis: "user_attested",
          platforms: ["instagram", "tiktok"],
          providerPermissionReference: "synthetic source route",
          contentPermissionReference: "synthetic user attestation",
          privacyReviewReference: "synthetic neutral projection",
          reviewedAt: Date.now() - 5000,
          expiresAt: Date.now() + 86400000,
          maximumRetentionMs: 86400000,
        },
      }),
    );
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
      JSON.stringify({
        ...s.config,
        ...(paid ? { subjects: ["user_99999999999999999999999999"] } : {}),
        automaticOwnSubscriptionPreparation: true,
      }),
    );
    if (paid) {
      fundedPreparation(s);
      await s.t.mutation(internal.billing.attach, {
        organizationId: s.org,
        customerId: "cus_auto_paid",
      });
      await s.t.mutation(internal.billing.apply, {
        customerId: "cus_auto_paid",
        subscriptionId: "sub_auto_paid",
        status: "active",
        periodEnd: Date.now() + 86400000,
        revision: 1,
      });
      await s.t.mutation(internal.commerce.grantPeriod, {
        organizationId: s.org,
        subscription: "sub_auto_paid",
        tier: "pro",
        interval: "monthly",
        start: Date.now() - 1000,
        end: Date.now() + 86400000,
        verifiedPayment: true,
      });
    }
    if (paid) vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", "[]");
    await nativeReady(s);
    if (paid)
      expect(
        await s.owner.query(api.assistantGrants.setup, {
          organizationId: s.org,
        }),
      ).toMatchObject({
        serverPreparationEnabled: true,
        workCloudMediaEnabled: true,
        workCloudSavedEnabled: true,
      });
    const assistant = s.t.withIdentity({
      subject: s.actor.subject,
      issuer: process.env.MCP_AUTH_ISSUER!,
      client_id: grant.clientId,
      scope: scopes.join(" "),
      sid: "app_consent_01234567890123456789012345",
    });
    const args = {
      profileId: s.org,
      url,
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
    if (paid) {
      await assistant.mutation(internal.assistantEvents.install, {
        profileId: s.org,
        grantVersion: grant.version,
        eventName: "work_cloud_waiting",
        externalId: "sub_" + "c".repeat(64),
        ciphertext: "synthetic-native-waiting",
        keyVersion: "1",
        expiresAt: Date.now() + 600000,
        callbackVerifiedAt: Date.now(),
      });
      const runId = first.run_id!;
      await s.t.mutation(internal.preparedAnalysis.claim, { runId });
      await s.t.mutation(internal.preparedAnalysis.progress, {
        runId,
        stage: "transcribing",
      });
      const canonical = source!.canonical,
        text = "Complete ordinary paid post";
      const { socialHash } = await import("../packages/social/contracts");
      const { canonicalJson } =
        await import("../packages/contracts/canonical-json.mjs");
      const prepared = await makePreparedEvidence({
        requestedCanonical: canonical,
        canonical,
        platform: "x",
        post: {
          version: "x-post-evidence-v1",
          postId: "1234567890123456789",
          provider: "gallery-dl",
          text,
          textHash: await socialHash(text),
          expectedAssetCount: 0,
          coverage: "complete_manifest",
          assets: [],
        },
        sourceHash: await socialHash(
          canonicalJson({ canonical, text, assets: [] }),
        ),
        recipeHash: "b".repeat(64),
        downloaderVersion: "gallery-dl/1.32.19",
        title: "Ordinary paid X post",
        authorName: "Author",
        durationMs: 0,
        language: "und",
        observedAt: Date.now(),
        transcript: {
          origin: "none",
          model: null,
          provider: null,
          inputSha256: null,
        },
        segments: [],
        frames: [],
      });
      await s.t.mutation(internal.preparedAnalysis.retain, {
        runId,
        prepared,
        frames: [],
        receipt: { preparation: { stopAcknowledged: true } },
      });
      const attemptId = await s.t.mutation(
        internal.preparedAnalysis.queueSubscription,
        { runId },
      );
      const deliveries = await s.t.run((c) =>
        c.db.query("assistantDeliveries").take(5),
      );
      expect(
        deliveries.some(
          (d) => "analysisAttemptId" in d && d.analysisAttemptId === attemptId,
        ),
      ).toBe(true);
      const binding = {
        sourceId: first.source_id,
        attemptId,
        taskId: "ordinary-paid-native-task",
      };
      const claim = await assistant.mutation(
        internal.analysisVersions.dispatch,
        { ...binding, operation: "claim" },
      );
      const lease = { ...binding, leaseToken: claim.leaseToken };
      const input = await assistant.query(
        internal.analysisVersions.input,
        lease,
      );
      expect(input).toMatchObject({
        inputKind: "retained_evidence",
        maxApiUsd: 0,
      });
      // Revoking Pro prevents this same already-claimed task from continuing.
      await s.t.mutation(internal.billing.apply, {
        customerId: "cus_auto_paid",
        subscriptionId: "sub_auto_paid",
        status: "canceled",
        periodEnd: Date.now() + 86400000,
        revision: 2,
      });
      await expect(
        assistant.query(internal.analysisVersions.input, lease),
      ).rejects.toThrow("APPROVAL_STALE");
      await s.t.mutation(internal.billing.apply, {
        customerId: "cus_auto_paid",
        subscriptionId: "sub_auto_paid",
        status: "active",
        periodEnd: Date.now() + 86400000,
        revision: 3,
      });
      const done = await assistant.mutation(
        internal.analysisVersions.dispatch,
        {
          ...lease,
          operation: "complete",
          output: {
            schemaVersion: "analysis-version-output-v1",
            sourceId: first.source_id,
            attemptId,
            evidenceHash: input.evidenceHash,
            postRevisionHash: input.postRevisionHash,
            summary: "A complete caption-based result",
            warnings: [],
            insights: s.output.insights.map((i) => ({
              ...i,
              evidence: [
                {
                  kind: "caption",
                  id: "post-caption-1",
                  startMs: null,
                  endMs: null,
                },
              ],
            })),
          },
        },
      );
      expect(done.versionId).toBeTruthy();
      expect(
        await s.owner.query(api.preparedService.status, {
          sourceId: first.source_id,
        }),
      ).toMatchObject({ state: "ready", chargedCredits: 1 });
    }
    if (url.includes("/status/")) {
      expect(source?.catalogPolicy).toBeUndefined();
      expect(source?.catalogWait).toBeUndefined();
      expect(source?.publicImportId).toBeUndefined();
      expect(
        await s.t.run((c) => c.db.query("catalogFamilies").collect()),
      ).toEqual([]);
    }
  },
);

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
    next_action: {
      tool: "analysis_version",
      args: { sourceId: s.sourceId, versionId: f.versionId },
    },
  });
  expect(preparedStatusOutput.safeParse(status).success).toBe(true);
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
  expect(
    (await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }))
      .next_action,
  ).toBeUndefined();
  await expect(s.start("another-attempt")).rejects.toThrow(/SOURCE_BUSY/);
});

it("quotes another compatible model from an older supported recipe after processing-policy revision without preparing again", async () => {
  const s = await fixture();
  const started = await s.start();
  const retained = await finish(s, started.runId!);
  expect(await validatePreparedEvidence(retained.prepared)).toEqual(
    retained.prepared,
  );
  enableOpenAi(s);
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({ ...s.config, id: "prepared-policy-revision-two" }),
  );
  const network = vi.fn(() => {
    throw Error(
      "Compatibility quotes must not dispatch preparation or a model.",
    );
  });
  vi.stubGlobal("fetch", network);
  const before = await s.t.run(async (ctx) => ({
    preparations: await ctx.db.query("mediaPreparations").take(5),
    reservations: await ctx.db.query("reservations").take(5),
    evidence: await ctx.db.get(retained.evidenceId),
  }));
  const quote = await s.owner.query(api.preparedService.quote, {
    ...s.request,
    model: "gpt-6-luna",
    effort: "max",
  });
  expect(quote).toMatchObject({
    reusedEvidenceId: retained.evidenceId,
    preparationCredits: 0,
    analysisCredits: 6,
    maximumCredits: 6,
  });
  expect(
    await s.t.run(async (ctx) => ({
      preparations: await ctx.db.query("mediaPreparations").take(5),
      reservations: await ctx.db.query("reservations").take(5),
      evidence: await ctx.db.get(retained.evidenceId),
    })),
  ).toEqual(before);
  expect(network).not.toHaveBeenCalled();
});

it("omits a ready-status read action for stale evidence or missing current knowledge scope without breaking status", async () => {
  const s = await fixture();
  const started = await s.start();
  const done = await finish(s, started.runId!);
  expect(
    (
      await s.assistant.query(internal.preparedService.assistantStatus, {
        sourceId: s.sourceId,
      })
    ).next_action,
  ).toEqual({
    tool: "analysis_version",
    args: { sourceId: s.sourceId, versionId: done.versionId },
  });
  await s.t.run((ctx) => ctx.db.patch(done.versionId, { state: "removed" }));
  expect(
    await s.assistant.query(internal.preparedService.assistantStatus, {
      sourceId: s.sourceId,
    }),
  ).toMatchObject({ state: "ready", versionId: done.versionId });
  expect(
    (
      await s.assistant.query(internal.preparedService.assistantStatus, {
        sourceId: s.sourceId,
      })
    ).next_action,
  ).toBeUndefined();
  await s.t.run(async (ctx) => {
    await ctx.db.patch(done.versionId, { state: "ready" });
    const grant = (await ctx.db.get(s.grant.id))!;
    await ctx.db.patch(grant._id, {
      scopes: grant.scopes.filter((scope) => scope !== "knowledge:read"),
    });
  });
  expect(
    (
      await s.assistant.query(internal.preparedService.assistantStatus, {
        sourceId: s.sourceId,
      })
    ).next_action,
  ).toBeUndefined();
});

it("does not hide infrastructure failures while checking a ready-status exact read action", async () => {
  const s = await fixture();
  const started = await s.start();
  await finish(s, started.runId!);
  const failure = Error("Synthetic retained-version storage outage");
  const read = vi
    .spyOn(analysisHistory, "retainedVersion")
    .mockRejectedValueOnce(failure);
  try {
    await expect(
      s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
    ).rejects.toThrow(failure.message);
  } finally {
    read.mockRestore();
  }
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
it("reuses prepared JPEGs for a once-funded OpenAI version and publishes truthful max-effort provenance", async () => {
  const s = await fixture(true);
  const catalog = JSON.parse(process.env.CLOUD_CATALOG_CONFIGURATION_JSON!);
  vi.stubEnv(
    "CLOUD_CATALOG_CONFIGURATION_JSON",
    JSON.stringify({
      ...catalog,
      version: "cloud-catalog-config-v2",
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
  const a = await openAiRetained(s);
  expect(a.quote).toMatchObject({
    preparationCredits: 0,
    analysisCredits: 6,
    maximumCredits: 6,
    model: "gpt-6-luna",
    effort: "max",
    reusedEvidenceId: a.incumbent.evidenceId,
  });
  expect(
    await s.owner.query(api.preparedService.options, { sourceId: s.sourceId }),
  ).toMatchObject({
    available: true,
    models: [{ id: "gpt-6-luna", defaultEffort: "max", creditMultiplier: 3 }],
  });
  const calls = mockOpenAi(s);
  await s.t.action(internal.preparedMedia.runRetainedGateway, {
    runId: a.run.runId!,
  });
  const status = await s.owner.query(api.preparedService.status, {
    sourceId: s.sourceId,
  });
  expect(status).toMatchObject({
    state: "ready",
    chargedCredits: 6,
    billingState: "settled",
  });
  const row = (await s.t.run((c) => c.db.get(a.run.runId!)))!;
  expect(row.evidenceId).toBe(a.incumbent.evidenceId);
  expect(row.receipt.analysisDispatch).toMatchObject({
    model: "gpt-6-luna",
    effort: "max",
    inputTokens: 100,
  });
  expect(row.receipt.analysis).toMatchObject({
    provider: "openai",
    model: "gpt-6-luna",
    reportedEffort: "max",
    funding: { route: "openai_promotional_grant", cashFallbackAllowed: false },
  });
  const version = (await s.t.run((c) => c.db.get(row.versionId!)))!;
  expect(version).toMatchObject({
    provenance: "managed_api_reported",
    requestedModel: "gpt-6-luna",
    requestedEffort: "max",
  });
  expect(
    (await s.t.run((c) => c.db.get(s.sourceId)))!.selectedAnalysisVersionId,
  ).toBe(s.source.selectedAnalysisVersionId);
  await s.t.action(internal.preparedMedia.runRetainedGateway, {
    runId: a.run.runId!,
  });
  expect(
    calls.mock.calls.filter(
      ([url]) => url === "https://api.openai.com/v1/responses",
    ),
  ).toHaveLength(1);
  expect(calls.mock.calls.every(([url]) => !url.includes("gateway"))).toBe(
    true,
  );
  expect(
    await s.t.run((c) =>
      c.db
        .query("proposalServiceCounters")
        .withIndex("by_policy", (q) =>
          q.eq("policyId", "openai-grant:" + a.policy.id),
        )
        .unique(),
    ),
  ).toMatchObject({ jobs: 1 });
  await expect(
    s.owner.query(api.preparedService.quote, a.request),
  ).rejects.toThrow(/BUDGET_EXCEEDED/);
  const preview = await s.owner.query(api.cloudCatalog.preview, {
    sourceId: s.sourceId,
    versionId: row.versionId!,
  });
  expect(preview.provenance).toBe("managed_api_reported");
  const contribution = await s.owner.action(
    api.cloudCatalogActions.contribute,
    {
      sourceId: s.sourceId,
      versionId: row.versionId!,
      key: "openai-catalog-copy",
      consent: preview.consent,
    },
  );
  expect(contribution.state).toBe("published");
  const shared = (await s.t.run((c) => c.db.get(contribution.contributionId)))!;
  const artifact = await s.t.run((c) => c.db.get(shared.artifactId));
  expect(artifact).toMatchObject({
    authority: {
      requestedModel: "gpt-6-luna",
      requestedEffort: "max",
      version: "prepared-catalog-authority-v2",
      provenance: "managed_api_reported",
    },
  });
  await s.t.run((ctx) => currentCloudArtifact(ctx, shared.artifactId));
  const automatic = await s.t.action(
    internal.cloudCatalogActions.publishCompleted,
    {
      sourceId: s.sourceId,
      actorId: s.actor._id,
      generation: s.source.generation,
      versionId: row.versionId!,
    },
  );
  expect(automatic.state).toBe("published");
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.catalogStatus?.state,
  ).toBe("published");
  vi.stubEnv(
    "OPENAI_PROMOTIONAL_CONFIGURATION_JSON",
    JSON.stringify({
      ...a.policy,
      enabled: false,
      expiresAt: Date.now() - 1,
      verifiedAt: Date.now() - 10000,
    }),
  );
  await s.t.run((ctx) => currentCloudArtifact(ctx, shared.artifactId));
  await expect(
    s.owner.query(api.preparedService.quote, a.request),
  ).rejects.toThrow(/MODEL_UNAVAILABLE/);
  vi.stubEnv(
    "OPENAI_PROMOTIONAL_CONFIGURATION_JSON",
    JSON.stringify({
      ...a.policy,
      providerPermissionReference: "Different processing permission",
    }),
  );
  await expect(
    s.t.run((ctx) => currentCloudArtifact(ctx, shared.artifactId)),
  ).rejects.toThrow(/publication authority changed/);
});
it("returns retained OpenAI credits after a failed count without consuming a generation slot", async () => {
  const s = await fixture(),
    a = await openAiRetained(s),
    calls = mockOpenAi(s, "count_failed");
  await s.t.action(internal.preparedMedia.runRetainedGateway, {
    runId: a.run.runId!,
  });
  expect(
    await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
  ).toMatchObject({
    state: "failed",
    chargedCredits: 0,
    billingState: "settled",
  });
  expect(
    calls.mock.calls.some(
      ([url]) => url === "https://api.openai.com/v1/responses",
    ),
  ).toBe(false);
  expect(
    await s.t.run((c) =>
      c.db
        .query("proposalServiceCounters")
        .withIndex("by_policy", (q) =>
          q.eq("policyId", "openai-grant:" + a.policy.id),
        )
        .unique(),
    ),
  ).toBeNull();
  expect(
    await s.owner.query(api.preparedService.quote, a.request),
  ).toMatchObject({ maximumCredits: 6 });
});
it("holds unknown OpenAI generations and cannot spend the same finite grant slot twice", async () => {
  const s = await fixture(),
    a = await openAiRetained(s),
    calls = mockOpenAi(s, "timeout");
  await s.t.action(internal.preparedMedia.runRetainedGateway, {
    runId: a.run.runId!,
  });
  expect(
    await s.owner.query(api.preparedService.status, { sourceId: s.sourceId }),
  ).toMatchObject({
    state: "unknown",
    chargedCredits: null,
    billingState: "reserved",
  });
  expect(
    calls.mock.calls.filter(
      ([url]) => url === "https://api.openai.com/v1/responses",
    ),
  ).toHaveLength(1);
  await expect(
    s.owner.query(api.preparedService.quote, a.request),
  ).rejects.toThrow(/BUDGET_EXCEEDED/);
});
it("invalidates an OpenAI quote when the verified funding policy changes and keeps cache reuse free", async () => {
  const s = await fixture();
  const previous = await s.start("retain-before-policy-change");
  await finish(s, previous.runId!);
  enableOpenAi(s);
  const request = {
    ...s.request,
    model: "gpt-6-luna" as const,
    effort: "max" as const,
  };
  const q = await s.owner.query(api.preparedService.quote, request);
  const policy = JSON.parse(process.env.OPENAI_PROMOTIONAL_CONFIGURATION_JSON!);
  vi.stubEnv(
    "OPENAI_PROMOTIONAL_CONFIGURATION_JSON",
    JSON.stringify({ ...policy, expiresAt: policy.expiresAt - 1000 }),
  );
  await expect(
    s.owner.mutation(api.preparedService.start, {
      ...request,
      key: "changed-openai-policy",
      quoteHash: q.quoteHash,
      maximumCredits: q.maximumCredits,
    }),
  ).rejects.toThrow(/QUOTE_CHANGED/);
  vi.stubEnv("OPENAI_PROMOTIONAL_CONFIGURATION_JSON", "");
  await expect(
    s.owner.query(api.preparedService.quote, request),
  ).rejects.toThrow(/MODEL_UNAVAILABLE/);
  expect(
    await s.owner.query(api.preparedService.quote, {
      ...request,
      reanalyze: false,
    }),
  ).toMatchObject({ cacheHit: true, maximumCredits: 0 });
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

it.each(["synthetic-new-model", "gpt-6.1-sol", "gpt-6-luna"])(
  "retains subscription analysis independently of API model names: %s",
  async (model) => {
    const s = await fixture(true);
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
          model,
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
    const claim = await s.assistant.mutation(
      internal.analysisVersions.dispatch,
      {
        sourceId: s.sourceId,
        attemptId,
        taskId: "native-prepared-fixture",
        operation: "claim",
      },
    );
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
    const done = await s.assistant.mutation(
      internal.analysisVersions.dispatch,
      {
        ...lease,
        operation: "complete",
        output,
      },
    );
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
    const preview = await s.owner.query(api.cloudCatalog.preview, {
      sourceId: s.sourceId,
      versionId: done.versionId!,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "PUT"
          ? new Response(null, { status: 200 })
          : new Response(s.bytes, {
              headers: { "content-type": "image/jpeg" },
            }),
      ),
    );
    const contribution = await s.owner.action(
      api.cloudCatalogActions.contribute,
      {
        sourceId: s.sourceId,
        versionId: done.versionId!,
        key: "subscription-catalog-copy",
        consent: preview.consent,
      },
    );
    const row = (await s.t.run((ctx) =>
      ctx.db.get(contribution.contributionId),
    ))!;
    const shared = await s.t.run((ctx) =>
      currentCloudArtifact(ctx, row.artifactId),
    );
    expect(shared.authority).toMatchObject({
      funding: "own_subscription",
      provenance: "authenticated_host_reported",
      requestedModel: model,
    });
    const operator = s.t.withIdentity({
      subject: "user_02234567890123456789012345",
      auth_time: Math.floor(Date.now() / 1000),
    });
    const assessment = {
      rubric: "evidence-review-v1" as const,
      fidelity: 4,
      completeness: 4,
      citationAccuracy: 4,
      uncertainty: 4,
      usefulness: 4,
      reason: "Synthetic subscription shared-reader regression",
    };
    const review = await operator.query(api.cloudCatalog.reviewRecommendation, {
      artifactId: shared.artifact._id,
      assessment,
    });
    await operator.mutation(api.cloudCatalog.selectRecommendation, {
      artifactId: shared.artifact._id,
      assessment,
      reviewHash: review.reviewHash,
      expectedSelectionRevision: review.selectionRevision,
    });
    await s.owner.run(async (ctx) => {
      expect(
        await associateContributedCloudVersion(
          ctx,
          (await ctx.db.get(s.sourceId))!,
          s.actor._id,
          shared.artifact._id,
        ),
      ).toBe(true);
    });
    const detail = await s.owner.query(api.product.detail, {
      id: s.sourceId,
      organizationId: s.org,
    });
    expect(detail.analysis.insights).toEqual(shared.version.output.insights);
    const structured = knowledgeFetchStructuredOutput.parse(
      await s.assistant.query(internal.assistant.fetch, {
        id: s.sourceId,
        format: "structured_v1",
      }),
    );
    expect(structured.analysis.insights).toHaveLength(
      shared.version.output.insights.length,
    );
    knowledgeFetchStructuredOutput.parse(
      await s.assistant.query(internal.assistant.fetch, {
        id: `${s.sourceId}@${shared.version._id}`,
        format: "structured_v1",
      }),
    );
    const context = postContextPageOutput.parse(
      await s.assistant.query(internal.assistant.fetch, {
        id: s.sourceId,
        format: "post_context_v1",
      }),
    );
    expect(context.context.analysisVersionId).toBe(shared.version._id);
    expect(context.context.totals.transcript).toBe(1);
    const frame = await s.assistant.action(internal.postContextFrames.read, {
      sourceId: s.sourceId,
      analysisVersionId: shared.version._id,
      frameId: "frame-1",
      expectedEvidenceHash: context.context.evidenceHash,
    });
    expect(Buffer.from(frame.data, "base64")).toEqual(Buffer.from(s.bytes));
    // A separate API policy, including its later revocation, does not authorize
    // or invalidate reasoning performed in the user's own host subscription.
    const apiPolicy = enableOpenAi(s);
    vi.stubEnv(
      "OPENAI_PROMOTIONAL_CONFIGURATION_JSON",
      JSON.stringify({
        ...apiPolicy,
        enabled: false,
        providerPermissionReference: "Unrelated changed API processing review",
      }),
    );
    await s.t.run((ctx) => currentCloudArtifact(ctx, row.artifactId));
    vi.stubEnv(
      "PREPARED_ANALYSIS_CONFIGURATION_JSON",
      JSON.stringify({
        ...s.config,
        providerPermissionReference: "Different preparation permission",
      }),
    );
    await expect(
      s.t.run((ctx) => currentCloudArtifact(ctx, row.artifactId)),
    ).rejects.toThrow(/publication authority changed/);
    vi.stubEnv(
      "PREPARED_ANALYSIS_CONFIGURATION_JSON",
      JSON.stringify(s.config),
    );
    await s.t.run((ctx) =>
      ctx.db.patch(shared.artifact._id, { state: "blocked" }),
    );
    await expect(
      s.owner.query(api.product.detail, {
        id: s.sourceId,
        organizationId: s.org,
      }),
    ).rejects.toThrow(/SOURCE_UNAVAILABLE/);
    await expect(
      s.assistant.query(internal.assistant.fetch, {
        id: s.sourceId,
        format: "post_context_v1",
      }),
    ).rejects.toThrow(/SOURCE_UNAVAILABLE/);
  },
);

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

it.each(["paid-processing-prefunded-v1", "paid-processing-monetary-v2"])(
  "admits paid non-pilot users under %s, reserves once and rejects refund risk before a second job",
  async (fundingVersion) => {
    const f = await fixture();
    vi.stubEnv(
      "PREPARED_ANALYSIS_CONFIGURATION_JSON",
      JSON.stringify({
        ...f.config,
        subjects: ["user_99999999999999999999999999"],
      }),
    );
    vi.stubEnv(
      "PAID_PROCESSING_CONFIGURATION_JSON",
      JSON.stringify({
        version: fundingVersion,
        id: "paid-fixture-funding",
        enabled: true,
        verifiedAt: Date.now() - 1000,
        expiresAt: Date.now() + 86400000,
        ...(fundingVersion === "paid-processing-prefunded-v1"
          ? { maximumJobs: 10 }
          : { operatingPoolNanoUsd: 900000000 }),
        maximumJobNanoUsd: 50000000,
        verifiedProviderCreditNanoUsd: 1000000000,
        providerKeyBudgetNanoUsd: 1000000000,
        priorExposureNanoUsd: 100000000,
      }),
    );
    vi.stubEnv(
      "PROPOSAL_SERVICE_CONFIGURATION_JSON",
      JSON.stringify({
        version: "proposal-service-v1",
        enabled: true,
        privateProjectContextAllowed: true,
        permissionReference: "test plan provider permission",
      }),
    );
    // An operator's catalogue concession is insufficient for paid processing.
    await expect(f.quote()).rejects.toThrow("active Pro");
    await f.t.mutation(internal.billing.attach, {
      organizationId: f.org,
      customerId: "cus_paid_fixture",
    });
    await f.t.mutation(internal.billing.apply, {
      customerId: "cus_paid_fixture",
      subscriptionId: "sub_paid_fixture",
      status: "active",
      periodEnd: Date.now() + 86400000,
      revision: 1,
    });
    await f.t.mutation(internal.commerce.grantPeriod, {
      organizationId: f.org,
      subscription: "sub_paid_fixture",
      tier: "pro",
      interval: "monthly",
      start: Date.now() - 1000,
      end: Date.now() + 86400000,
      verifiedPayment: true,
    });
    expect(
      (await f.owner.query(api.aiPreferences.read, { organizationId: f.org }))
        .preparedAnalysisEnabled,
    ).toBe(true);
    const q = await f.quote();
    const args = {
      ...f.request,
      key: "paid-first-operation",
      quoteHash: q.quoteHash,
      maximumCredits: q.maximumCredits,
    };
    const a = await f.owner.mutation(api.preparedService.start, args);
    const b = await f.owner.mutation(api.preparedService.start, args);
    expect(a.runId).toBe(b.runId);
    const counter = await f.t.run((c) =>
      c.db
        .query("proposalServiceCounters")
        .withIndex("by_policy", (x) =>
          x.eq("policyId", "paid-funding:paid-fixture-funding"),
        )
        .unique(),
    );
    if (fundingVersion === "paid-processing-prefunded-v1")
      expect(counter?.jobs).toBe(1);
    else {
      expect(counter).toBeNull();
      const run = (await f.t.run((c) => c.db.get(a.runId!)))!;
      expect(
        await f.t.run((c) =>
          c.db.get(run.receipt.admission.providerReservationId),
        ),
      ).toMatchObject({
        state: "reserved",
        maximumNanoUsd: 50000000,
        requestHash: q.quoteHash,
        operationKey: run.receipt.admission.reservationKey,
      });
      await retained(f, a.runId!, 74302);
      await f.t.mutation(internal.preparedAnalysis.providerDispatch, {
        runId: a.runId!,
        component: "analysis",
      });
      await expect(
        f.t.mutation(internal.preparedAnalysis.providerDispatch, {
          runId: a.runId!,
          component: "analysis",
        }),
      ).rejects.toThrow("SOURCE_BUSY");
    }
    expect((await f.t.run((c) => c.db.get(a.runId!)))?.policyId).toBe(
      "paid-prepared-paid-fixture-funding",
    );
    if (counter) await f.t.run((c) => c.db.patch(counter._id, { jobs: 10 }));
    else
      await f.t.run(async (c) => {
        const pool = (await c.db.query("providerFundingPools").unique())!;
        await c.db.patch(pool._id, { blocked: true });
      });
    const cached = await f.owner.query(api.preparedService.quote, {
      sourceId: f.sourceId,
      executor: "gateway",
    });
    expect(cached.cacheHit).toBe(true);
    expect(cached.maximumCredits).toBe(0);
    if (fundingVersion === "paid-processing-monetary-v2") {
      const funding = JSON.parse(
        process.env.PAID_PROCESSING_CONFIGURATION_JSON!,
      );
      const service = JSON.parse(
        process.env.PREPARED_ANALYSIS_CONFIGURATION_JSON!,
      );
      const snapshot = () =>
        f.t.run(async (c) => ({
          wallet: await c.db
            .query("wallets")
            .withIndex("by_org", (q) => q.eq("organizationId", f.org))
            .unique(),
          funding: await c.db.query("providerFundingPools").unique(),
          run: await c.db.get(a.runId!),
        }));
      const preserved = await snapshot();
      const uncachedId = await f.owner.mutation(api.product.capture, {
        organizationId: f.org,
        key: "uncached-unfunded-fixture",
        kind: "url",
        url: "https://www.instagram.com/reel/UNCACHED_FUNDING_FIXTURE/",
        title: "Uncached fixture",
        rightsAttested: true,
      });
      for (const state of ["expired_funding", "disabled_service"] as const) {
        vi.stubEnv(
          "PAID_PROCESSING_CONFIGURATION_JSON",
          JSON.stringify({
            ...funding,
            ...(state === "expired_funding"
              ? { expiresAt: Date.now() - 1 }
              : {}),
          }),
        );
        vi.stubEnv(
          "PREPARED_ANALYSIS_CONFIGURATION_JSON",
          JSON.stringify({
            ...service,
            ...(state === "disabled_service" ? { enabled: false } : {}),
          }),
        );
        const request = { sourceId: f.sourceId, executor: "gateway" as const };
        const quote = await f.owner.query(api.preparedService.quote, request);
        expect(quote).toMatchObject({
          cacheHit: true,
          maximumCredits: 0,
          maximumApiUsd: 0,
          configurationId: "retained-ready-cache-v1",
        });
        expect(
          await f.owner.mutation(api.preparedService.start, {
            ...request,
            key: `cached-${state}-fixture`,
            quoteHash: quote.quoteHash,
            maximumCredits: 0,
          }),
        ).toMatchObject({ cacheHit: true, chargedCredits: 0, runId: null });
        await expect(
          f.owner.query(api.preparedService.quote, {
            ...request,
            reanalyze: true,
            model: "gpt-6-luna",
            effort: "max",
          }),
        ).rejects.toThrow("SETUP_REQUIRED");
        await expect(
          f.owner.query(api.preparedService.quote, {
            ...request,
            sourceId: uncachedId,
          }),
        ).rejects.toThrow("SETUP_REQUIRED");
        expect(await snapshot()).toEqual(preserved);
      }
      vi.stubEnv("PAID_PROCESSING_CONFIGURATION_JSON", JSON.stringify(funding));
      vi.stubEnv(
        "PREPARED_ANALYSIS_CONFIGURATION_JSON",
        JSON.stringify(service),
      );
    }
    await f.t.run((c) =>
      c.db.insert("billingRiskHolds", {
        organizationId: f.org,
        key: "risk-fixture",
        accountId: "acct_fixture",
        mode: "test",
        chargeId: "ch_fixture",
        eventId: "evt_fixture",
        kind: "dispute",
        providerId: "dp_fixture",
        state: "held",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await expect(f.quote()).rejects.toThrow();
  },
);

it.each(["pilot", "credits", "operator"] as const)(
  "keeps an automatic app/MCP Save and rolls back admission holds after a known %s refusal",
  async (blocker) => {
    const s = await fixture();
    await nativeReady(s);
    const config = {
      ...s.config,
      maximumTotalJobs: blocker === "pilot" ? 1 : 100,
      automaticOwnSubscriptionPreparation: true,
    };
    vi.stubEnv("PREPARED_ANALYSIS_CONFIGURATION_JSON", JSON.stringify(config));
    if (blocker === "pilot") {
      const old = await s.start("used-legacy-pilot");
      await s.t.run((c) => c.db.patch(old.runId!, { state: "failed" }));
    }
    if (blocker === "credits")
      await s.t.run(async (c) => {
        const wallet = await c.db
          .query("wallets")
          .withIndex("by_org", (q) => q.eq("organizationId", s.org))
          .unique();
        if (wallet) await c.db.patch(wallet._id, { granted: 0 });
        for (const pool of await c.db
          .query("creditPools")
          .withIndex("by_org", (q) => q.eq("organizationId", s.org))
          .take(20))
          await c.db.patch(pool._id, { granted: pool.spent + pool.reserved });
      });
    if (blocker === "operator")
      await s.t.run(async (c) => {
        const key = `all:${new Date().toISOString().slice(0, 7)}`;
        const row = await c.db
          .query("operatorBudgets")
          .withIndex("by_key", (q) => q.eq("key", key))
          .unique();
        if (row) await c.db.patch(row._id, { ceiling: 0 });
        else
          await c.db.insert("operatorBudgets", {
            key,
            ceiling: 0,
            spent: 0,
            reserved: 0,
            updatedAt: Date.now(),
          });
      });
    const before = await s.t.run(async (c) => ({
      pools: await c.db
        .query("creditPools")
        .withIndex("by_org", (q) => q.eq("organizationId", s.org))
        .take(20),
      reservations: await c.db
        .query("reservations")
        .withIndex("by_org", (q) => q.eq("organizationId", s.org))
        .take(20),
      wallet: await c.db
        .query("wallets")
        .withIndex("by_org", (q) => q.eq("organizationId", s.org))
        .unique(),
    }));
    const expected =
      blocker === "pilot"
        ? "QUOTA_EXCEEDED"
        : blocker === "credits"
          ? "INSUFFICIENT_CREDITS"
          : "OPERATOR_BUDGET_REACHED";
    const app = await s.owner.mutation(api.workCloudSaves.capture, {
      organizationId: s.org,
      key: `preserve-app-${blocker}`,
      url: "https://www.instagram.com/reel/KeepApp0001/",
      title: "Keep this link",
      rightsAttested: true,
      grantId: s.grant.id,
      grantVersion: s.grant.version,
    });
    expect(app).toMatchObject({
      status: "processing_blocked",
      blockedReason: expected,
    });
    const saved = await s.t.run((c) => c.db.get(app.sourceId));
    expect(saved).toMatchObject({
      personalMedia: { admissionBlock: { code: expected } },
    });
    expect(["saved", "needs_upload"]).toContain(saved!.state);
    const storedGrant = (await s.t.run((c) => c.db.get(s.grant.id)))!;
    const scopes = [...storedGrant.scopes, "links:save"];
    await s.t.run((c) => c.db.patch(storedGrant._id, { scopes }));
    vi.stubEnv(
      "MCP_CLIENTS",
      JSON.stringify([
        { id: storedGrant.clientId, name: "Native test", scopes },
      ]),
    );
    const assistant = s.t.withIdentity({
      subject: s.actor.subject,
      issuer: process.env.MCP_AUTH_ISSUER!,
      client_id: storedGrant.clientId,
      scope: scopes.join(" "),
      sid: "app_consent_01234567890123456789012345",
    });
    const args = {
      profileId: s.org,
      key: `preserve-mcp-${blocker}`,
      url: "https://www.instagram.com/reel/KeepMcp0001/",
      title: "Keep this too",
      rightsAttested: true as const,
    };
    const mcp = await assistant.mutation(internal.assistant.saveLink, args);
    expect(mcp).toMatchObject({
      saved: true,
      status: "processing_blocked",
      analysis_started: false,
      analysis_requested: false,
      blocked_reason: expected,
    });
    const replay = await assistant.mutation(internal.assistant.saveLink, args);
    expect(replay.source_id).toBe(mcp.source_id);
    expect(
      await assistant.query(internal.assistant.getJobStatus, {
        profileId: s.org,
        sourceId: mcp.source_id,
      }),
    ).toMatchObject({
      status: "processing_blocked",
      processing: { failure_code: expected, charged_credits: 0 },
    });
    const after = await s.t.run(async (c) => ({
      pools: await c.db
        .query("creditPools")
        .withIndex("by_org", (q) => q.eq("organizationId", s.org))
        .take(20),
      reservations: await c.db
        .query("reservations")
        .withIndex("by_org", (q) => q.eq("organizationId", s.org))
        .take(20),
      wallet: await c.db
        .query("wallets")
        .withIndex("by_org", (q) => q.eq("organizationId", s.org))
        .unique(),
    }));
    expect(after).toEqual(before);
    if (blocker === "operator") {
      const budgetKey = `all:${new Date().toISOString().slice(0, 7)}`;
      await s.t.run(async (c) => {
        const budget = await c.db
          .query("operatorBudgets")
          .withIndex("by_key", (q) => q.eq("key", budgetKey))
          .unique();
        await c.db.patch(budget!._id, { ceiling: 100000 });
      });
      const request = { sourceId: mcp.source_id, executor: "gateway" as const };
      const quote = await s.owner.query(api.preparedService.quote, request);
      const admitted = await s.owner.mutation(api.preparedService.start, {
        ...request,
        key: "after-known-refusal",
        quoteHash: quote.quoteHash,
        maximumCredits: quote.maximumCredits,
      });
      const source = (await s.t.run((c) => c.db.get(mcp.source_id)))!;
      expect(source.generation).toBe(saved!.generation);
      expect(source.personalMedia?.admissionBlock).toBeUndefined();
      await finish({ ...s, sourceId: source._id, source }, admitted.runId!);
      const ready = await assistant.query(internal.assistant.getJobStatus, {
        profileId: s.org,
        sourceId: source._id,
      });
      expect(ready.status).toBe("ready");
      expect(ready.processing?.charged_credits).toBeGreaterThan(0);
    }
  },
);

it("uses current exact admin authority for both funded dispatches without a fabricated Stripe subscription", async () => {
  const f = await fixture();
  const policy = {
    version: "admin-processing-allowance-v1",
    id: "dispatch-admin-fixture",
    enabled: true,
    subject: f.actor.subject,
    organizationId: f.org,
    monthlyCredits: 300,
    maximumHourlyJobs: 20,
    maximumDailyJobs: 100,
    startsAt: Date.now() - 1000,
  };
  vi.stubEnv("ADMIN_PROCESSING_ALLOWANCE_JSON", JSON.stringify(policy));
  vi.stubEnv(
    "PAID_PROCESSING_CONFIGURATION_JSON",
    JSON.stringify({
      version: "paid-processing-monetary-v2",
      id: "admin-dispatch-funding",
      enabled: true,
      verifiedAt: Date.now() - 1000,
      expiresAt: Date.now() + 86400000,
      operatingPoolNanoUsd: 900000000,
      maximumJobNanoUsd: 50000000,
      verifiedProviderCreditNanoUsd: 1000000000,
      providerKeyBudgetNanoUsd: 1000000000,
      priorExposureNanoUsd: 100000000,
    }),
  );
  vi.stubEnv(
    "PROPOSAL_SERVICE_CONFIGURATION_JSON",
    JSON.stringify({
      version: "proposal-service-v1",
      enabled: true,
      privateProjectContextAllowed: true,
      permissionReference: "synthetic admin dispatch authority",
    }),
  );
  const run = await f.start("admin-funded-dispatch");
  const row = (await f.t.run((c) => c.db.get(run.runId!)))!;
  expect(row.receipt.admission.providerReservationId).toBeTruthy();
  expect(
    await f.t.run((c) =>
      c.db
        .query("billing")
        .withIndex("by_org", (q) => q.eq("organizationId", f.org))
        .unique(),
    ),
  ).toBeNull();
  // Reconciliation needs the committed pre-dispatch proof, not an error label.
  await f.t.mutation(internal.preparedAnalysis.progress, {
    runId: run.runId!,
    stage: "transcribing",
  });
  await f.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId: run.runId!,
    kind: "preparation",
    receipt: { stopAcknowledged: true },
  });
  await f.t.mutation(internal.preparedAnalysis.fail, {
    runId: run.runId!,
    code: "PREPARATION_OUTCOME_UNCONFIRMED",
  });
  expect((await f.t.run((c) => c.db.get(run.runId!)))?.state).toBe("unknown");
  await f.t.mutation(internal.preparedAnalysis.reconcileReturnedFailure, {
    runId: run.runId!,
  });
  const reconciled = (await f.t.run((c) => c.db.get(run.runId!)))!;
  expect(reconciled).toMatchObject({
    state: "failed",
    receipt: {
      failure: { code: "PREPARATION_OUTCOME_UNCONFIRMED" },
      billing: { chargedCredits: 0 },
      reconciliation: { proof: "stopped_before_gateway_dispatch" },
    },
  });
  expect(
    await f.t.run((c) => c.db.get(row.receipt.admission.providerReservationId)),
  ).toMatchObject({ state: "released", actualNanoUsd: 0 });
  expect(
    await f.t.mutation(internal.preparedAnalysis.reconcileReturnedFailure, {
      runId: run.runId!,
    }),
  ).toBe(true);
  const next = await f.start("admin-next-dispatch");
  const nextRow = (await f.t.run((c) => c.db.get(next.runId!)))!;
  await f.t.mutation(internal.preparedAnalysis.claim, { runId: next.runId! });
  await f.t.mutation(internal.preparedAnalysis.providerDispatch, {
    runId: next.runId!,
    component: "transcription",
  });
  const funded = await f.t.run((c) =>
    c.db.get(nextRow.receipt.admission.providerReservationId),
  );
  expect(funded).toMatchObject({
    state: "dispatched",
    dispatches: ["transcription"],
  });
  await expect(
    f.t.mutation(internal.preparedAnalysis.providerDispatch, {
      runId: next.runId!,
      component: "transcription",
    }),
  ).rejects.toThrow("SOURCE_BUSY");
  const beforeDispatched = (await f.t.run((c) => c.db.get(next.runId!)))!;
  await f.t.run((c) =>
    c.db.patch(next.runId!, {
      state: "unknown",
      receipt: {
        ...beforeDispatched.receipt,
        preparation: { stopAcknowledged: true },
        failure: {
          stage: "transcribing",
          code: "PREPARATION_OUTCOME_UNCONFIRMED",
        },
      },
    }),
  );
  await expect(
    f.t.mutation(internal.preparedAnalysis.reconcileReturnedFailure, {
      runId: next.runId!,
    }),
  ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
  expect(
    await f.t.run((c) =>
      c.db.get(nextRow.receipt.admission.providerReservationId),
    ),
  ).toEqual(funded);
  await f.t.run((c) =>
    c.db.patch(next.runId!, {
      state: beforeDispatched.state,
      receipt: beforeDispatched.receipt,
    }),
  );
  await retained(f, next.runId!);
  vi.stubEnv(
    "ADMIN_PROCESSING_ALLOWANCE_JSON",
    JSON.stringify({ ...policy, enabled: false }),
  );
  await expect(
    f.t.mutation(internal.preparedAnalysis.providerDispatch, {
      runId: next.runId!,
      component: "analysis",
    }),
  ).rejects.toThrow(/active Pro/);
  expect(
    await f.t.run((c) =>
      c.db.get(nextRow.receipt.admission.providerReservationId),
    ),
  ).toEqual(funded);
  vi.stubEnv("ADMIN_PROCESSING_ALLOWANCE_JSON", JSON.stringify(policy));
  await f.t.mutation(internal.preparedAnalysis.providerDispatch, {
    runId: next.runId!,
    component: "analysis",
  });
  expect(
    await f.t.run((c) =>
      c.db.get(nextRow.receipt.admission.providerReservationId),
    ),
  ).toMatchObject({ dispatches: ["transcription", "analysis"] });
});

it("reports only the current actor/generation shared wait through MCP until cache association is ready", async () => {
  const f = await fixture();
  const familyId = await f.t.run((c) =>
    c.db.insert("catalogFamilies", {
      organizationId: f.org,
      key: "synthetic-wait-status",
      canonical: f.source.canonical,
      language: "en",
      permissionId: "synthetic",
      permissionHash: "a".repeat(64),
      state: "active",
      selectionRevision: 0,
      nextVersionNumber: 1,
      members: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retainUntil: Date.now() + 86400000,
    }),
  );
  const source = (await f.t.run((c) => c.db.get(f.sourceId)))!;
  const wait = {
    familyId,
    actor: f.actor._id,
    generation: source.generation,
    expiresAt: Date.now() + 60000,
  };
  await f.t.run((c) =>
    c.db.patch(source._id, {
      catalogWait: wait,
      personalMedia: {
        admissionBlock: {
          generation: source.generation,
          code: "QUOTA_EXCEEDED",
          observedAt: Date.now() - 1000,
        },
      },
    }),
  );
  const read = () =>
    f.assistant.query(internal.assistant.getJobStatus, {
      profileId: f.org,
      sourceId: source._id,
    });
  expect(await read()).toMatchObject({
    status: "waiting_for_shared_analysis",
    processing: {
      state: "waiting_for_shared_analysis",
      maximum_credits: 0,
      charged_credits: 0,
    },
  });
  expect(
    await f.owner.query(api.preparedService.status, { sourceId: source._id }),
  ).toMatchObject({
    state: "waiting_for_shared_analysis",
    runId: null,
    maximumCredits: 0,
    chargedCredits: 0,
  });
  const foreign = await f.t.run((c) =>
    c.db.insert("users", {
      subject: "user_22222222222222222222222222",
      email: "wait-other@example.test",
      name: "Other",
      status: "active",
      createdAt: Date.now(),
    }),
  );
  for (const stale of [
    { ...wait, generation: wait.generation + 1 },
    { ...wait, expiresAt: Date.now() - 1 },
    { ...wait, actor: foreign },
  ]) {
    await f.t.run((c) =>
      c.db.patch(source._id, { catalogWait: stale, personalMedia: {} }),
    );
    expect((await read()).status).not.toBe("waiting_for_shared_analysis");
    expect(
      (
        await f.owner.query(api.preparedService.status, {
          sourceId: source._id,
        })
      ).state,
    ).not.toBe("waiting_for_shared_analysis");
  }
  await f.t.run((c) =>
    c.db.patch(source._id, { catalogWait: undefined, state: "ready" }),
  );
  expect((await read()).status).toBe("ready");
});

it("saves complete text-only X evidence, finishes cited analysis and reuses it without a media duration", async () => {
  const s = await fixture();
  const canonical = "https://x.com/i/web/status/1234567890123456789";
  await s.t.run((c) =>
    c.db.patch(s.sourceId, {
      canonical,
      url: canonical,
      title: "X post",
      state: "queued",
      analysis: undefined,
      orderedMedia: undefined,
      personalAnalysis: undefined,
    }),
  );
  const run = await s.start("x-text-only-once");
  await s.t.mutation(internal.preparedAnalysis.claim, { runId: run.runId! });
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId: run.runId!,
    stage: "transcribing",
  });
  const text = "A complete post caption with no attachments.";
  const { socialHash } = await import("../packages/social/contracts");
  const { canonicalJson } =
    await import("../packages/contracts/canonical-json.mjs");
  const prepared = await makePreparedEvidence({
    requestedCanonical: canonical,
    canonical,
    platform: "x",
    post: {
      version: "x-post-evidence-v1",
      postId: "1234567890123456789",
      provider: "gallery-dl",
      text,
      textHash: await socialHash(text),
      expectedAssetCount: 0,
      coverage: "complete_manifest",
      assets: [],
    },
    sourceHash: await socialHash(
      canonicalJson({ canonical, text, assets: [] }),
    ),
    recipeHash: "b".repeat(64),
    downloaderVersion: "gallery-dl/1.32.19",
    title: "X post",
    authorName: "Author",
    durationMs: 0,
    language: "und",
    observedAt: Date.now(),
    transcript: {
      origin: "none",
      model: null,
      provider: null,
      inputSha256: null,
    },
    segments: [],
    frames: [],
  });
  await s.t.mutation(internal.preparedAnalysis.retain, {
    runId: run.runId!,
    prepared,
    frames: [],
    receipt: {},
  });
  await s.t.mutation(internal.preparedAnalysis.progress, {
    runId: run.runId!,
    stage: "analyzing",
  });
  const output = {
    schemaVersion: "analysis-version-output-v1",
    sourceId: s.sourceId,
    attemptId: run.runId!,
    evidenceHash: prepared.evidence.evidenceHash,
    postRevisionHash: prepared.evidence.sourceRevisionHash,
    summary: "Caption analysis",
    warnings: [],
    insights: s.output.insights.map((i) => ({
      ...i,
      evidence: [
        { kind: "caption", id: "post-caption-1", startMs: null, endMs: null },
      ],
    })),
  };
  const versionId = await s.t.mutation(
    internal.preparedAnalysis.finishGateway,
    {
      runId: run.runId!,
      output,
      receipt: {
        model: "meta/muse-spark-1.3-contributor",
        provider: "meta",
        requestId: "gen_" + "a".repeat(26),
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
        rateEstimateUsd: 0.002,
      },
    },
  );
  const source = (await s.t.run((c) => c.db.get(s.sourceId)))!;
  expect(source.selectedAnalysisVersionId).toBe(versionId);
  expect(source.linkPreview?.title).toBe("X post");
  const quote = await s.quote();
  expect(quote.durationMaximumMs).toBe(0);
  expect(quote.preparationCredits).toBe(0);
  expect(quote.analysisCredits).toBeGreaterThan(0);
  const context = postContextPageOutput.parse(
    await s.assistant.query(internal.assistant.fetch, {
      id: s.sourceId,
      profileId: s.org,
      format: "post_context_v1",
    }),
  );
  expect(context.context.complete).toBe(true);
  expect(context.context.frames).toEqual([]);
  expect(
    context.context.items.some(
      (item) =>
        item.kind === "observation" &&
        item.value.kind === "caption" &&
        item.value.text === text,
    ),
  ).toBe(true);
});

function fundedPreparation(
  f: Awaited<ReturnType<typeof fixture>>,
  admin = false,
) {
  if (admin)
    vi.stubEnv(
      "ADMIN_PROCESSING_ALLOWANCE_JSON",
      JSON.stringify({
        version: "admin-processing-allowance-v1",
        id: "x-recovery-admin",
        enabled: true,
        subject: f.actor.subject,
        organizationId: f.org,
        monthlyCredits: 300,
        maximumHourlyJobs: 20,
        maximumDailyJobs: 100,
        startsAt: Date.now() - 1000,
      }),
    );
  vi.stubEnv(
    "PAID_PROCESSING_CONFIGURATION_JSON",
    JSON.stringify({
      version: "paid-processing-monetary-v2",
      id: "x-recovery-funding",
      enabled: true,
      verifiedAt: Date.now() - 1000,
      expiresAt: Date.now() + 86400000,
      operatingPoolNanoUsd: 900000000,
      maximumJobNanoUsd: 50000000,
      verifiedProviderCreditNanoUsd: 1000000000,
      providerKeyBudgetNanoUsd: 1000000000,
      priorExposureNanoUsd: 100000000,
    }),
  );
  vi.stubEnv(
    "PROPOSAL_SERVICE_CONFIGURATION_JSON",
    JSON.stringify({
      version: "proposal-service-v1",
      enabled: true,
      privateProjectContextAllowed: true,
      permissionReference: "synthetic exact X preparation permission",
    }),
  );
}
async function xSetupFixture() {
  const f = await fixture();
  await f.t.run((c) =>
    c.db.patch(f.sourceId, {
      canonical: "https://x.com/i/web/status/1234567890123456789",
      url: "https://x.com/i/web/status/1234567890123456789",
      state: "queued",
      analysis: undefined,
      orderedMedia: undefined,
      personalAnalysis: undefined,
    }),
  );
  fundedPreparation(f, true);
  const { runId } = await f.start("x-setup-failure-proof");
  await f.t.mutation(internal.preparedAnalysis.claim, { runId: runId! });
  return { ...f, runId: runId! };
}
it("retains immutable independent X attachment transcription receipts", async () => {
  const f = await xSetupFixture();
  await f.t.mutation(internal.preparedAnalysis.progress, {
    runId: f.runId,
    stage: "transcribing",
  });
  for (const assetId of ["asset-1", "asset-2"]) {
    await f.t.mutation(internal.preparedAnalysis.recordReceipt, {
      runId: f.runId,
      assetId,
      kind: "asr",
      receipt: { model: "synthetic", assetId },
    });
    await f.t.mutation(internal.preparedAnalysis.recordReceipt, {
      runId: f.runId,
      assetId,
      kind: "asr_output",
      receipt: {
        text: assetId,
        segments: [{ text: assetId, startSecond: 0, endSecond: 1 }],
      },
    });
  }
  const row = (await f.t.run((c) => c.db.get(f.runId)))!;
  expect(row.receipt["asr_output_asset-1"].text).toBe("asset-1");
  expect(row.receipt["asr_output_asset-2"].text).toBe("asset-2");
  await expect(
    f.t.mutation(internal.preparedAnalysis.recordReceipt, {
      runId: f.runId,
      assetId: "asset-1",
      kind: "asr_output",
      receipt: { text: "changed", segments: [] },
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    f.t.mutation(internal.preparedAnalysis.recordReceipt, {
      runId: f.runId,
      assetId: "asset-36",
      kind: "asr",
      receipt: { model: "synthetic" },
    }),
  ).rejects.toThrow("INVALID_INPUT");
});
it.each([false, true])(
  "reconciles only an exact deleted X setup with zero provider dispatches: dispatched=%s",
  async (dispatched) => {
    const f = await xSetupFixture();
    if (dispatched)
      await f.t.mutation(internal.preparedAnalysis.providerDispatch, {
        runId: f.runId,
        component: "transcription",
      });
    await f.t.mutation(internal.preparedAnalysis.recordReceipt, {
      runId: f.runId,
      kind: "preparation_failure",
      receipt: { phase: "setup", sandboxId: "vercel:synthetic-original" },
    });
    await f.t.mutation(internal.preparedAnalysis.fail, {
      runId: f.runId,
      code: "SOURCE_UNAVAILABLE",
    });
    const row = (await f.t.run((c) => c.db.get(f.runId)))!;
    expect(row.state).toBe("unknown");
    const providerId = row.receipt.admission.providerReservationId;
    const held = await f.t.run((c) => c.db.get(providerId));
    const proof = {
      providerMissing: true as const,
      observedAt: Date.now(),
      sandboxId: "vercel:synthetic-original",
    };
    await expect(
      f.t.mutation(internal.preparedAnalysis.reconcileReturnedFailure, {
        runId: f.runId,
        setupStopProof: { ...proof, sandboxId: "vercel:another-job" },
      }),
    ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
    if (dispatched) {
      await expect(
        f.t.mutation(internal.preparedAnalysis.reconcileReturnedFailure, {
          runId: f.runId,
          setupStopProof: proof,
        }),
      ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
      expect(await f.t.run((c) => c.db.get(providerId))).toEqual(held);
    } else {
      await f.t.mutation(internal.preparedAnalysis.reconcileReturnedFailure, {
        runId: f.runId,
        setupStopProof: proof,
      });
      expect(await f.t.run((c) => c.db.get(f.runId))).toMatchObject({
        state: "failed",
        receipt: { billing: { chargedCredits: 0 } },
      });
      expect(await f.t.run((c) => c.db.get(providerId))).toMatchObject({
        state: "released",
        actualNanoUsd: 0,
      });
    }
  },
);

it("reconciles returned X attachment ASR without releasing its unknown provider cost", async () => {
  const f = await xSetupFixture();
  await f.t.mutation(internal.preparedAnalysis.progress, {
    runId: f.runId,
    stage: "transcribing",
  });
  await f.t.mutation(internal.preparedAnalysis.providerDispatch, {
    runId: f.runId,
    component: "transcription",
  });
  await f.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId: f.runId,
    kind: "preparation",
    receipt: { stopAcknowledged: true },
  });
  await f.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId: f.runId,
    kind: "asr",
    assetId: "asset-1",
    receipt: {
      model: "microsoft/mai-transcribe-2",
      provider: "azure",
      startedAt: Date.now(),
      completedAt: Date.now(),
      costCeilingUsd: 0.001,
    },
  });
  await f.t.mutation(internal.preparedAnalysis.recordReceipt, {
    runId: f.runId,
    kind: "asr_output",
    assetId: "asset-1",
    receipt: {
      text: "",
      segments: [{ text: "", startSecond: 0, endSecond: 1 }],
    },
  });
  const row = (await f.t.run((c) => c.db.get(f.runId)))!;
  await f.t.run((c) =>
    c.db.patch(f.runId, {
      state: "unknown",
      receipt: {
        ...row.receipt,
        failure: {
          stage: "transcribing",
          code: "INVALID_EVIDENCE",
          at: Date.now(),
        },
      },
    }),
  );
  await f.t.mutation(internal.preparedAnalysis.reconcileReturnedFailure, {
    runId: f.runId,
  });
  const recovered = (await f.t.run((c) => c.db.get(f.runId)))!;
  expect(recovered).toMatchObject({
    state: "failed",
    receipt: {
      billing: { chargedCredits: 0 },
      "asr_output_asset-1": { text: "" },
    },
  });
  expect(
    await f.t.run((c) => c.db.get(row.receipt.admission.providerReservationId)),
  ).toMatchObject({ state: "unknown", dispatches: ["transcription"] });
});
