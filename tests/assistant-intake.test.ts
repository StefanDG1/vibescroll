import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { createHash } from "node:crypto";
const modules = import.meta.glob("../convex/**/*.ts");
const subject = "user_01234567890123456789012345",
  clientId = "client_01234567890123456789012345",
  issuer = "https://synthetic-test.authkit.app";
const scopes = [
  "links:save",
  "knowledge:read",
  "jobs:read",
  "analysis:request",
];
afterEach(() => {
  vi.unstubAllEnvs();
});
async function fixture(configured = true) {
  vi.stubEnv("ACQUISITION_VERIFIED", "true");
  vi.stubEnv("MEDIA_VERIFIED", "true");
  vi.stubEnv("MANAGED_INFERENCE_ROUTE", "cloudflare_free");
  vi.stubEnv("HOSTED_MEDIA_ANALYSIS_VERIFIED", "true");
  vi.stubEnv("HOSTED_MEDIA_PUBLIC_RELEASE_APPROVED", "true");
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("MCP_AUTH_ISSUER", issuer);
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Synthetic assistant", scopes }]),
  );
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", JSON.stringify([subject]));
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "intake@example.test",
    name: "Synthetic owner",
  });
  const owner = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const assistant = t.withIdentity({
    subject,
    issuer,
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  });
  const org = await owner.mutation(api.organizations.createPrivate, {});
  const credentialHash = "c".repeat(64),
    profileBinding = "a".repeat(64);
  const device = await t.run(async (ctx) => {
    const actor = (await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique())!;
    return ctx.db.insert("devices", {
      organizationId: org,
      owner: actor._id,
      name: "Paired computer",
      fingerprint: "b".repeat(64),
      codeHash: "",
      credentialHash,
      state: "paired",
      expiresAt: 0,
      lastSeenAt: 0,
      capabilities: [],
      assistantProfileBinding: profileBinding,
      assistantSeenAt: Date.now() - 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  const grant = await owner.mutation(api.assistantGrants.save, {
    organizationId: org,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes,
    expectedVersion: 0,
    expiresAt: null,
    acknowledged: true,
    ...(configured
      ? {
          intakePolicy: "explicit_links" as const,
          analysisDefaults: { enabled: true, deviceId: device, profileBinding },
        }
      : {}),
  });
  const input = {
    profileId: org,
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    title: "Synthetic source",
    key: "synthetic-intake-key",
  };
  const save = (extra: any = {}) =>
    assistant.mutation(internal.assistant.saveLink, { ...input, ...extra });
  const dispatch = (operation: string, args: any = {}) =>
    t.mutation(internal.assistantLocal.operation, {
      credentialHash,
      operation,
      args,
    });
  const status = (sourceId: any) =>
    assistant.query(internal.assistant.getJobStatus, {
      profileId: org,
      sourceId,
    });
  return {
    t,
    owner,
    assistant,
    org,
    device,
    grant,
    save,
    dispatch,
    status,
    input,
    credentialHash,
    profileBinding,
  };
}
it("queues explicit links without per-link confirmation, preserves replay and waits without spending", async () => {
  const s = await fixture();
  const saved = await s.save();
  const replay = await s.save();
  expect(replay.source_id).toBe(saved.source_id);
  expect(saved.receipt.status).toBe("waiting_for_computer");
  expect(saved.receipt.balance).toMatchObject({ available: 30, total: 30 });
  expect(saved.receipt.credit_offer).toMatchObject({
    max_credits: 10,
    generation: 0,
  });
  const rows = await s.t.run(async (ctx) => ({
    intakes: await ctx.db.query("assistantIntakes").collect(),
    reservations: await ctx.db.query("reservations").collect(),
    runs: await ctx.db.query("localLibraryRuns").collect(),
  }));
  expect(rows.intakes).toHaveLength(1);
  expect(rows.reservations).toHaveLength(0);
  expect(rows.runs).toHaveLength(0);
  expect(rows.intakes[0].permissionBasis).toBe("connection_explicit_links");
  await expect(s.dispatch("claim")).rejects.toThrow("SETUP_REQUIRED");
});
it("requires review once for legacy grants and honors save-only override", async () => {
  const legacy = await fixture(false);
  await expect(legacy.save()).rejects.toThrow("SETUP_REQUIRED");
  const s = await fixture();
  const saved = await s.save({ analyze: false });
  expect(saved.receipt.credit_offer).toBeNull();
  await s.dispatch("hello", {
    profileBinding: s.profileBinding,
    model: "gpt-6.1-sol",
    expiresAt: Date.now() + 4 * 3600000,
  });
  expect(await s.dispatch("claim")).toMatchObject({ job: null });
});
it("claims one finite local run on reconnect and rejects credit races, changed accounts and revoked grants", async () => {
  const s = await fixture();
  const saved = await s.save();
  await s.dispatch("hello", {
    profileBinding: s.profileBinding,
    model: "gpt-6.1-sol",
    expiresAt: Date.now() + 4 * 3600000,
  });
  const { job } = await s.dispatch("claim");
  expect(job).toMatchObject({
    sourceId: saved.source_id,
    extract: true,
    repositories: [],
  });
  expect(job.expiresAt).toBeLessThanOrEqual(Date.now() + 4 * 3600000);
  expect(await s.dispatch("claim")).toMatchObject({ job: null, busy: true });
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      profileId: s.org,
      sourceId: saved.source_id,
      mode: "credits",
      generation: 0,
      maxCredits: 10,
    }),
  ).rejects.toThrow("QUOTE_CHANGED");
  await s.dispatch("hello", {
    profileBinding: "d".repeat(64),
    model: "gpt-6.1-sol",
    expiresAt: Date.now() + 4 * 3600000,
  });
  await expect(
    s.dispatch("project_work", { runId: job.runId }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: s.grant.id,
    expectedVersion: 1,
  });
  await expect(
    s.dispatch("project_work", { runId: job.runId }),
  ).rejects.toThrow("APPROVAL_STALE");
});
it("completes local cited extraction and organization with zero credits and offers project evaluation", async () => {
  const s = await fixture();
  const saved = await s.save();
  await s.dispatch("hello", {
    profileBinding: s.profileBinding,
    model: "gpt-6.1-sol",
    expiresAt: Date.now() + 4 * 3600000,
  });
  const { job } = await s.dispatch("claim");
  const id = await s.dispatch("source_prepare", {
    runId: job.runId,
    sourceId: job.sourceId,
    generation: job.generation,
    revision: job.revision,
    inputHash: job.inputHash,
    transcript: {
      durationMs: 1000,
      segments: [
        {
          index: 0,
          startMs: 0,
          endMs: 1000,
          text: "Review evidence before coding.",
        },
      ],
    },
    frames: [],
  });
  const output = {
    schemaVersion: "1.0.0",
    sourceId: job.sourceId,
    processingRunId: `${job.sourceId}:0`,
    coverage: "audio_only",
    summary: "Review evidence.",
    warnings: ["Automatic transcript."],
    insights: [
      {
        id: "one",
        title: "Review source evidence",
        claim: "Review evidence before coding.",
        interpretation: "Keep human review.",
        categories: ["coding"],
        topics: ["Evidence"],
        evidence: [
          { kind: "transcript", id: "segment-0", startMs: 0, endMs: 1000 },
        ],
        confidence: "supported",
        verificationNeeds: [],
      },
    ],
  };
  await s.dispatch("source_finish", {
    id,
    output,
    receipt: {
      state: "completed",
      model: "gpt-6.1-sol",
      expiresAt: Date.now() + 4 * 3600000,
      effort: "medium",
      appCredits: 0,
      separateApiCall: false,
      inputHash: "e".repeat(64),
      outputHash: createHash("sha256")
        .update(canonicalJson(output))
        .digest("hex"),
    },
  });
  await s.dispatch("done", { runId: job.runId, evaluations: [] });
  const status = await s.status(saved.source_id);
  expect(status.receipt).toMatchObject({
    processing_succeeded: true,
    credits: { state: "settled", actual_used: 0 },
    project_evaluation_requested: false,
  });
  expect(status.receipt!.follow_up).toContain("find the best project matches");
  const organized = await s.t.run(async (ctx) => ({
    members: await ctx.db.query("knowledgeMembers").collect(),
    jobs: await ctx.db.query("knowledgeJobs").collect(),
    reservations: await ctx.db.query("reservations").collect(),
  }));
  expect(organized.members.length).toBeGreaterThan(0);
  expect(organized.jobs).toHaveLength(0);
  expect(organized.reservations).toHaveLength(0);
});
it("uses an explicit credit quote atomically, excludes expired credits and does not claim unresolved charges are final", async () => {
  const s = await fixture();
  const saved = await s.save();
  vi.stubEnv("ACQUISITION_VERIFIED", "true");
  vi.stubEnv("MEDIA_VERIFIED", "true");
  vi.stubEnv("MANAGED_INFERENCE_ROUTE", "cloudflare_free");
  vi.stubEnv("HOSTED_MEDIA_ANALYSIS_VERIFIED", "true");
  vi.stubEnv("HOSTED_MEDIA_PUBLIC_RELEASE_APPROVED", "true");
  await s.t.run(async (ctx) => {
    for (const [key, expiresAt, granted] of [
      ["valid", Date.now() + 86400000, 30],
      ["expired", Date.now() - 1000, 999],
    ] as const)
      await ctx.db.insert("creditPools", {
        organizationId: s.org,
        key,
        kind: "included",
        granted,
        spent: 0,
        reserved: 0,
        expiresAt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      profileId: s.org,
      sourceId: saved.source_id,
      mode: "credits",
      generation: 0,
      maxCredits: 9,
    }),
  ).rejects.toThrow("QUOTE_CHANGED");
  const receipt = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    {
      profileId: s.org,
      sourceId: saved.source_id,
      mode: "credits",
      generation: 0,
      maxCredits: 10,
    },
  );
  expect(receipt).toMatchObject({
    balance: { available: 20, total: 30 },
    credits: {
      state: "reserved_or_reconciling",
      actual_used: null,
      reserved: 10,
    },
  });
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      profileId: s.org,
      sourceId: saved.source_id,
      mode: "credits",
      generation: 0,
      maxCredits: 10,
    }),
  ).rejects.toThrow("QUOTE_CHANGED");
  await s.dispatch("hello", {
    profileBinding: s.profileBinding,
    model: "gpt-6.1-sol",
    expiresAt: Date.now() + 4 * 3600000,
  });
  expect(await s.dispatch("claim")).toMatchObject({ job: null });
  // Simulate the existing provider settlement transaction, without external work.
  await s.t.run(async (ctx) => {
    const reservation = (await ctx.db
      .query("reservations")
      .withIndex("by_key", (q) =>
        q.eq("organizationId", s.org).eq("key", `source:${saved.source_id}:1`),
      )
      .unique())!;
    await ctx.db.patch(reservation._id, { state: "settled", settled: 3 });
    const pool = (await ctx.db
      .query("creditPools")
      .withIndex("by_key", (q) => q.eq("key", "valid"))
      .unique())!;
    await ctx.db.patch(pool._id, { reserved: 0, spent: 3 });
    await ctx.db.patch(saved.source_id, { state: "ready" });
  });
  expect((await s.status(saved.source_id)).receipt).toMatchObject({
    processing_succeeded: true,
    balance: { available: 27, total: 30 },
    credits: { state: "settled", actual_used: 3 },
  });
});
it("keeps project evaluation opt-in and rejects unknown project requests", async () => {
  const s = await fixture();
  await expect(s.save({ project: "Unapproved" })).rejects.toThrow(
    "CONTEXT_REQUIRED",
  );
  await expect(s.save({ bestProjects: true })).rejects.toThrow(
    "CONTEXT_REQUIRED",
  );
  const saved = await s.save();
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      profileId: s.org,
      sourceId: saved.source_id,
      mode: "projects",
    }),
  ).rejects.toThrow("CONTEXT_REQUIRED");
});
it("records project opt-in while extraction waits and fences project context changed before claim", async () => {
  const s = await fixture();
  const projectScopes = [...scopes, "context:read"];
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      { id: clientId, name: "Synthetic assistant", scopes: projectScopes },
    ]),
  );
  const repo = await s.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: s.org,
      installationId: 1,
      providerId: 2,
      fullName: "owned/project",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "Review evidence",
      profileVersion: 1,
      manifest: ["README.md"],
      status: "connected",
      context: "Pinned evidence",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await s.owner.mutation(api.assistantGrants.save, {
    organizationId: s.org,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes: projectScopes,
    expectedVersion: 1,
    expiresAt: null,
    acknowledged: true,
    intakePolicy: "explicit_links",
    analysisDefaults: {
      enabled: true,
      deviceId: s.device,
      profileBinding: s.profileBinding,
    },
    repositories: [
      {
        repositoryId: repo,
        baseSha: "a".repeat(40),
        profileVersion: 1,
        selectionVersion: 0,
      },
    ],
  });
  const assistant = s.t.withIdentity({
    subject,
    issuer,
    client_id: clientId,
    scope: projectScopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  });
  const saved = await assistant.mutation(internal.assistant.saveLink, s.input);
  const updated = await assistant.mutation(internal.assistant.requestAnalysis, {
    profileId: s.org,
    sourceId: saved.source_id,
    mode: "projects",
    project: "project",
  });
  expect(updated).toMatchObject({ project_evaluation_requested: true });
  await s.t.run((ctx) => ctx.db.patch(repo, { profileVersion: 2 }));
  await s.dispatch("hello", {
    profileBinding: s.profileBinding,
    model: "gpt-6.1-sol",
    expiresAt: Date.now() + 4 * 3600000,
  });
  await expect(s.dispatch("claim")).rejects.toThrow("CONTEXT_REQUIRED");
});
it("revoked source rights stop work before its URL is dispatched", async () => {
  const s = await fixture();
  const saved = await s.save();
  await s.t.run((ctx) =>
    ctx.db.patch(saved.source_id, { rightsAttested: false }),
  );
  await s.dispatch("hello", {
    profileBinding: s.profileBinding,
    model: "gpt-6.1-sol",
    expiresAt: Date.now() + 4 * 3600000,
  });
  expect(await s.dispatch("claim")).toMatchObject({ job: null });
  expect(
    await s.t.run((ctx) => ctx.db.query("localLibraryRuns").collect()),
  ).toHaveLength(0);
});
it("uses newly reviewed preferences when a user resubmits an existing saved link without reviving dispatched work", async () => {
  const s = await fixture(false);
  const saved = await s.save({ rightsAttested: true });
  await s.owner.mutation(api.assistantGrants.save, {
    organizationId: s.org,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes,
    expectedVersion: 1,
    expiresAt: null,
    acknowledged: true,
    intakePolicy: "explicit_links",
    analysisDefaults: {
      enabled: true,
      deviceId: s.device,
      profileBinding: s.profileBinding,
    },
  });
  const submitted = await s.save();
  expect(submitted.source_id).toBe(saved.source_id);
  expect(submitted.receipt.status).toBe("waiting_for_computer");
  await s.dispatch("hello", {
    profileBinding: s.profileBinding,
    model: "gpt-6.1-sol",
    expiresAt: Date.now() + 4 * 3600000,
  });
  expect((await s.dispatch("claim")).job).toMatchObject({
    sourceId: saved.source_id,
  });
});
