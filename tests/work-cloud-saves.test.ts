import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { postDisplayTitle } from "../packages/sources/display";
import { projectPostSource } from "../convex/lib/postSummary";

const modules = import.meta.glob("../convex/**/*.ts");
const subject = "user_01234567890123456789012345";
const clientId = "client_01234567890123456789012345";
const issuer = "https://cloud-save-fixture.authkit.app";
const scopes = [
  "analysis:request",
  "analysis:execute",
  "events:subscribe",
  "jobs:read",
];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup(optIn = true) {
  for (const key of [
    "MCP_ENABLED",
    "MCP_EVENTS_ENABLED",
    "WORK_CLOUD_MEDIA_ENABLED",
    "WORK_CLOUD_MEDIA_VERIFIED",
    "WORK_CLOUD_SAVED_LINKS_ENABLED",
    "WORK_CLOUD_SAVED_LINKS_VERIFIED",
  ])
    vi.stubEnv(key, "true");
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", JSON.stringify([subject]));
  vi.stubEnv("MCP_AUTH_ISSUER", issuer);
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Fixture", scopes }]),
  );
  vi.stubEnv("LINK_PREVIEWS_ENABLED", "false");
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "fixture@example.test",
    name: "Fixture",
  });
  const owner = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const org = await owner.mutation(api.organizations.createPrivate, {});
  const identity = {
    subject,
    issuer,
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  };
  const assistant = t.withIdentity(identity);
  const grantArgs = {
    organizationId: org,
    clientId,
    sources: [],
    libraryScope: "all" as const,
    scopes,
    cloudRequestPolicy: "explicit_per_source_v1" as const,
    expectedVersion: 0,
    expiresAt: null,
    acknowledged: true as const,
    ...(optIn
      ? {
          cloudSaveDefaults: {
            version: "app-save-cloud-v1" as const,
            model: "synthetic-model",
            effort: "high" as const,
            retentionMs: 86400000,
          },
        }
      : {}),
  };
  const grant = await owner.mutation(api.assistantGrants.save, grantArgs);
  await assistant.mutation(internal.assistantEvents.install, {
    profileId: org,
    grantVersion: grant.version,
    eventName: "video_link_saved",
    externalId: "sub_" + "a".repeat(64),
    ciphertext: "synthetic-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  });
  const captureArgs = {
    organizationId: org,
    key: "cloud-save-fixture",
    title: "Synthetic saved Reel",
    url: "https://www.instagram.com/reel/DeTest000001/",
    rightsAttested: true as const,
    grantId: grant.id,
    grantVersion: grant.version,
  };
  const capture = () => owner.mutation(api.workCloudSaves.capture, captureArgs);
  const start = (sourceId: any, savedIntentId: string) =>
    assistant.mutation(internal.assistant.requestAnalysis, {
      profileId: org,
      sourceId,
      mode: "work_cloud",
      savedIntentId,
    });
  return {
    t,
    actor,
    owner,
    org,
    identity,
    assistant,
    grantArgs,
    grant,
    captureArgs,
    capture,
    start,
  };
}
it("records a finite exact app-Save intent without creating a job, lease or reservation", async () => {
  const s = await setup();
  const result = await s.capture();
  expect(result).toMatchObject({
    status: "waiting_for_cloud_setup",
    intentId: expect.stringMatching(/^[a-f0-9]{64}$/),
    expiresAt: Date.now() + 86400000,
  });
  const source = (await s.t.run((ctx) => ctx.db.get(result.sourceId)))!;
  expect(source).toMatchObject({
    generation: 0,
    state: "needs_upload",
    workCloudSaveIntent: {
      actor: s.actor,
      grantId: s.grant.id,
      grantVersion: 1,
    },
  });
  expect(source.personalAnalysis).toBeUndefined();
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
  const status = await s.assistant.query(internal.assistant.getJobStatus, {
    profileId: s.org,
    sourceId: result.sourceId,
  });
  expect(status.saved_cloud_intent).toMatchObject({
    id: result.intentId,
    state: "waiting_for_runtime",
  });
  vi.advanceTimersByTime(1000);
  expect(await s.capture()).toEqual(result);
});
it.each(
  ["Imported video link", "Saved video", "My saved source"].flatMap((title) =>
    [false, true].map((thumbnail) => ({ title, thumbnail })),
  ),
)(
  "keeps an app-Save intent and display current when native preview metadata arrives: %j",
  async ({ title, thumbnail }) => {
    const s = await setup();
    const saved = await s.owner.mutation(api.workCloudSaves.capture, {
      ...s.captureArgs,
      title,
    });
    const before = (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))!;
    vi.advanceTimersByTime(1000);
    vi.stubEnv("LINK_PREVIEWS_ENABLED", "true");
    await s.t.run((ctx) =>
      ctx.db.patch(saved.sourceId, {
        linkPreview: { state: "queued", updatedAt: Date.now() },
      }),
    );
    await s.t.mutation(internal.sourcePreviewState.begin, {
      id: saved.sourceId,
    });
    await s.t.mutation(internal.sourcePreviewState.finish, {
      id: saved.sourceId,
      canonical: before.canonical,
      generation: before.generation,
      title: "Synthetic native preview title",
      authorName: "Synthetic creator",
      durationSeconds: 15,
      ...(thumbnail
        ? { key: `${s.org}/synthetic-preview`, size: 200, etag: "synthetic" }
        : {}),
    });
    const after = (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))!;
    expect(after.linkPreview).toMatchObject({
      state: "ready",
      title: "Synthetic native preview title",
      authorName: "Synthetic creator",
    });
    const status = await s.assistant.query(internal.assistant.getJobStatus, {
      profileId: s.org,
      sourceId: saved.sourceId,
    });
    const displayTitle =
      title === "My saved source" ? title : "Synthetic native preview title";
    expect(postDisplayTitle(after)).toBe(displayTitle);
    expect(status.title).toBe(displayTitle);
    expect(status.saved_cloud_intent).toMatchObject({
      id: saved.intentId,
      state: "waiting_for_runtime",
    });
    expect(await s.start(saved.sourceId, saved.intentId!)).toMatchObject({
      generation: 1,
      reused_request: false,
    });
    expect(after.title).toBe(before.title);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.workCloudSaveIntent).toEqual(before.workCloudSaveIntent);
  },
);
it("consumes once through the existing Cloud job and replays an unclaimed acknowledgement safely", async () => {
  const s = await setup();
  const saved = await s.capture();
  const first = await s.start(saved.sourceId, saved.intentId!);
  expect(first).toMatchObject({
    generation: 1,
    status: "waiting_for_cloud",
    reused_request: false,
  });
  expect(await s.start(saved.sourceId, saved.intentId!)).toMatchObject({
    ...first,
    reused_request: true,
  });
  const rows = await s.t.run((ctx) => ctx.db.query("reservations").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].max).toBe(0);
  const source = (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))!;
  expect(source.personalAnalysis).toMatchObject({
    model: "synthetic-model",
    effort: "high",
    cloud: { grantVersion: 1, media: { retainUntil: saved.expiresAt } },
  });
  expect(source.workCloudSaveIntent?.analysisGeneration).toBe(1);
  expect(await s.capture()).toMatchObject({
    status: "existing_work_preserved",
    intentId: null,
  });
});
it("does not inherit automatic authority from the existing explicit request grant", async () => {
  const s = await setup(false);
  await expect(s.capture()).rejects.toThrow(/SETUP_REQUIRED/);
  expect(
    await s.t.run((ctx) => ctx.db.query("sources").collect()),
  ).toHaveLength(0);
});
it.each(["WORK_CLOUD_SAVED_LINKS_ENABLED", "WORK_CLOUD_SAVED_LINKS_VERIFIED"])(
  "requires the separate %s gate before any capture",
  async (key) => {
    const s = await setup();
    vi.stubEnv(key, "false");
    await expect(s.capture()).rejects.toThrow(/SETUP_REQUIRED/);
    expect(
      await s.t.run((ctx) => ctx.db.query("sources").collect()),
    ).toHaveLength(0);
  },
);
it("ordinary save-only and direct MCP calls to app capture cannot stage an intent", async () => {
  const s = await setup();
  const sourceId = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    key: "ordinary-fixture",
    title: "Ordinary saved Reel",
    kind: "url",
    url: "https://www.instagram.com/reel/DeOther00001/",
    rightsAttested: true,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(sourceId)))?.workCloudSaveIntent,
  ).toBeUndefined();
  await expect(
    s.assistant.mutation(api.workCloudSaves.capture, s.captureArgs),
  ).rejects.toThrow(/Sign in/);
  await expect(s.start(sourceId, "0".repeat(64))).rejects.toThrow(
    /APPROVAL_STALE/,
  );
});
it.each(["title", "rights", "generation", "expiry", "grant", "defaults"])(
  "rejects a changed %s before starting work",
  async (kind) => {
    const s = await setup();
    const saved = await s.capture();
    await s.t.run(async (ctx) => {
      const source = (await ctx.db.get(saved.sourceId))!;
      if (kind === "title")
        await ctx.db.patch(source._id, { title: "Changed" });
      if (kind === "rights")
        await ctx.db.patch(source._id, { rightsAttested: false });
      if (kind === "generation")
        await ctx.db.patch(source._id, { generation: 1 });
      if (kind === "expiry")
        await ctx.db.patch(source._id, {
          workCloudSaveIntent: {
            ...source.workCloudSaveIntent!,
            expiresAt: Date.now(),
          },
        });
      if (kind === "grant") await ctx.db.patch(s.grant.id, { version: 2 });
      if (kind === "defaults")
        await ctx.db.patch(s.grant.id, {
          cloudSaveDefaults: {
            ...s.grantArgs.cloudSaveDefaults!,
            model: "changed-model",
          },
        });
    });
    await expect(s.start(saved.sourceId, saved.intentId!)).rejects.toThrow();
    expect(
      await s.t.run((ctx) => ctx.db.query("reservations").collect()),
    ).toHaveLength(0);
  },
);
it("does not permit executor/model/credit options to override an intent", async () => {
  const s = await setup();
  const saved = await s.capture();
  for (const override of [
    { maxCredits: 0 },
    { mode: "local" },
    {
      cloud: {
        model: "other",
        effort: "low",
        useOwnPlan: true,
        maxApiUsd: 0,
        retainUntil: Date.now() + 3600000,
      },
    },
  ]) {
    await expect(
      s.assistant.mutation(internal.assistant.requestAnalysis, {
        profileId: s.org,
        sourceId: saved.sourceId,
        mode: "work_cloud",
        savedIntentId: saved.intentId!,
        ...override,
      } as any),
    ).rejects.toThrow(/INVALID_INPUT/);
  }
});
it("preserves a claimed or unknown generation and creates no replacement reservation", async () => {
  const s = await setup();
  const saved = await s.capture();
  await s.start(saved.sourceId, saved.intentId!);
  const claimed = await s.assistant.mutation(
    internal.workCloudAnalysis.dispatch,
    {
      sourceId: saved.sourceId,
      generation: 1,
      taskId: "synthetic-save-task",
      operation: "claim",
    },
  );
  expect(claimed.leaseToken).toEqual(expect.any(String));
  expect(await s.start(saved.sourceId, saved.intentId!)).toMatchObject({
    generation: 1,
    reused_request: true,
    analysis_started: false,
  });
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(saved.sourceId))!;
    const job = source.personalAnalysis!;
    await ctx.db.patch(source._id, {
      personalAnalysis: { ...job, state: "unknown" },
    });
  });
  expect(await s.start(saved.sourceId, saved.intentId!)).toMatchObject({
    generation: 1,
    status: "unknown",
    analysis_started: false,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
});
it("refuses a reused capture key for another URL without staging either source", async () => {
  const s = await setup();
  const id = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    key: s.captureArgs.key,
    kind: "url",
    url: "https://www.instagram.com/reel/DeOther00001/",
    title: "Original",
    rightsAttested: true,
  });
  await expect(s.capture()).rejects.toThrow(/APPROVAL_STALE/);
  expect(
    (await s.t.run((ctx) => ctx.db.get(id)))?.workCloudSaveIntent,
  ).toBeUndefined();
  expect(
    await s.t.run((ctx) => ctx.db.query("sources").collect()),
  ).toHaveLength(1);
});
it("does not extend an expired intent when the same link is saved again", async () => {
  const s = await setup();
  const saved = await s.capture();
  vi.advanceTimersByTime(86400001);
  await s.assistant.mutation(internal.assistantEvents.install, {
    profileId: s.org,
    grantVersion: s.grant.version,
    eventName: "video_link_saved",
    externalId: "sub_" + "a".repeat(64),
    ciphertext: "synthetic-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  });
  expect(await s.capture()).toMatchObject({
    status: "existing_work_preserved",
    intentId: null,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))?.workCloudSaveIntent
      ?.expiresAt,
  ).toBe(saved.expiresAt);
  await expect(s.start(saved.sourceId, saved.intentId!)).rejects.toThrow(
    /APPROVAL_STALE/,
  );
});
it("reports a handoff only with one current grant and an active saved-link monitor", async () => {
  const s = await setup();
  expect(
    (await s.owner.query(api.aiPreferences.read, { organizationId: s.org }))
      .workCloud,
  ).toMatchObject({ available: true, configured: true, grantId: s.grant.id });
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.query("assistantSubscriptions").collect())[0];
    await ctx.db.patch(row._id, { state: "cancelled" });
  });
  expect(
    (await s.owner.query(api.aiPreferences.read, { organizationId: s.org }))
      .workCloud,
  ).toMatchObject({ available: false, configured: true });
  await expect(s.capture()).rejects.toThrow(/SETUP_REQUIRED/);
  expect(
    await s.t.run((ctx) => ctx.db.query("sources").collect()),
  ).toHaveLength(0);
});
it("projects pending setup as light progress without invalidating heavy content or claiming a running job", async () => {
  const s = await setup();
  const id = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    key: s.captureArgs.key,
    kind: "url",
    url: s.captureArgs.url,
    title: s.captureArgs.title,
    rightsAttested: true,
  });
  const before = await s.t.run(async (ctx) =>
    projectPostSource((await ctx.db.get(id))!),
  );
  const saved = await s.capture();
  const after = await s.t.run(async (ctx) =>
    projectPostSource((await ctx.db.get(id))!),
  );
  expect(after.contentRevision).toBe(before.contentRevision);
  expect(after.progress.progressRevision).not.toBe(
    before.progress.progressRevision,
  );
  expect(after.progress).toMatchObject({
    executor: "work_cloud",
    executionState: null,
    stage: "preflight",
    active: true,
    activeUntil: saved.expiresAt,
  });
  expect(JSON.stringify(after)).not.toContain(saved.intentId!);
  expect(JSON.stringify(after)).not.toContain(s.grant.id);
});
it("removes the intent with the source and refuses later consumption", async () => {
  const s = await setup();
  const saved = await s.capture();
  await s.owner.mutation(api.product.deleteSource, { id: saved.sourceId });
  expect(
    (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))?.workCloudSaveIntent,
  ).toBeUndefined();
  await expect(s.start(saved.sourceId, saved.intentId!)).rejects.toThrow(
    /FORBIDDEN/,
  );
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
});
it("emits one saved-link occurrence while leaving job creation to the prepared host", async () => {
  const s = await setup();
  await s.assistant.mutation(internal.assistantEvents.install, {
    profileId: s.org,
    grantVersion: s.grant.version,
    eventName: "video_link_saved",
    externalId: "sub_" + "a".repeat(64),
    ciphertext: "synthetic-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  });
  const saved = await s.capture();
  await s.capture();
  const deliveries = await s.t.run((ctx) =>
    ctx.db.query("assistantDeliveries").collect(),
  );
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0]).toMatchObject({
    eventName: "video_link_saved",
    sourceId: saved.sourceId,
    generation: 0,
    state: "pending",
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))?.personalAnalysis,
  ).toBeUndefined();
});
it("refuses another admitted OAuth client even if it has its own valid all-library grant", async () => {
  const s = await setup();
  const saved = await s.capture();
  const second = "client_11234567890123456789012345";
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      { id: clientId, name: "First", scopes },
      { id: second, name: "Second", scopes },
    ]),
  );
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.grantArgs,
    clientId: second,
  });
  const other = s.t.withIdentity({ ...s.identity, client_id: second });
  await expect(
    other.mutation(internal.assistant.requestAnalysis, {
      profileId: s.org,
      sourceId: saved.sourceId,
      mode: "work_cloud",
      savedIntentId: saved.intentId!,
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
});
