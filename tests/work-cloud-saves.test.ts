import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { postDisplayTitle } from "../packages/sources/display";
import { tools as assistantHttpTools } from "../convex/assistantHttp";
import { createKnowledgeHandler } from "../packages/mcp/server";

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
  vi.unstubAllGlobals();
});
async function setup(optIn = true, originalWorkspace = false) {
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
  const privateOrg = await owner.mutation(api.organizations.createPrivate, {});
  const org = originalWorkspace
    ? await owner.mutation(api.organizations.create, {
        name: "Original workspace",
      })
    : privateOrg;
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
    privateOrg,
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
it.each([
  [false, "2025-11-25"],
  [true, "2025-11-25"],
  [false, "2026-07-28"],
  [true, "2026-07-28"],
] as const)(
  "carries app-Save intent through MCP, authenticated HTTP and the real job mutation: legacy=%s protocol=%s",
  async (legacy, protocol) => {
    const s = await setup(true, legacy);
    const saved = await s.capture();
    const provider = vi.fn(async () => Response.json({ sub: subject }));
    vi.stubGlobal("fetch", provider);
    const http = (
      assistantHttpTools as unknown as {
        _handler: (ctx: unknown, request: Request) => Promise<Response>;
      }
    )._handler;
    const runMutation = vi.fn((reference, args) =>
      s.assistant.mutation(reference, args),
    );
    const invoke = vi.fn(async (operation, args) => {
      const response = await http(
        { runMutation },
        new Request("https://synthetic.example/assistant-tools", {
          method: "POST",
          headers: {
            authorization: "Bearer synthetic-access-token-0123456789",
          },
          body: JSON.stringify({ operation, args }),
        }),
      );
      return {
        ok: response.ok,
        status: response.status,
        value: await response.json(),
      };
    });
    const mcp = createKnowledgeHandler(invoke, false, false, true);
    const args = {
      sourceId: saved.sourceId,
      profileId: s.org,
      mode: "work_cloud",
      savedIntentId: saved.intentId,
    };
    const request = async (arguments_: Record<string, unknown>) => {
      const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "request_analysis",
          arguments: arguments_,
          ...(protocol === "2026-07-28"
            ? {
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": protocol,
                  "io.modelcontextprotocol/clientInfo": {
                    name: "Synthetic Cloud",
                    version: "1",
                  },
                  "io.modelcontextprotocol/clientCapabilities": {},
                },
              }
            : {}),
        },
      };
      const response = await mcp.fetch(
        new Request("https://scroll.companynerve.com/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": protocol,
            "mcp-method": "tools/call",
            "mcp-name": "request_analysis",
          },
          body: JSON.stringify(body),
        }),
        {
          parsedBody: body,
          authInfo: {
            token: "synthetic-token",
            clientId,
            scopes,
            resource: new URL("https://scroll.companynerve.com/mcp"),
            resourceMetadataUrl:
              "https://scroll.companynerve.com/.well-known/oauth-protected-resource/mcp",
          },
        },
      );
      const raw = await response.text();
      return JSON.parse(
        response.headers.get("content-type")?.includes("text/event-stream")
          ? raw
              .split("\n")
              .find((line) => line.startsWith("data: "))!
              .slice(6)
          : raw,
      );
    };
    const first = await request(args);
    expect(first.result.isError).not.toBe(true);
    expect(first.result.structuredContent).toMatchObject({
      generation: 1,
      status: "waiting_for_cloud",
      reused_request: false,
    });
    expect(invoke).toHaveBeenCalledExactlyOnceWith("request_analysis", args);
    expect(provider).toHaveBeenCalledOnce();
    expect((await request(args)).result.structuredContent).toMatchObject({
      generation: 1,
      reused_request: true,
    });
    const source = await s.t.run((ctx) => ctx.db.get(saved.sourceId));
    expect(source?.workCloudSaveIntent?.analysisGeneration).toBe(1);
    expect(source?.personalAnalysis).toMatchObject({
      executor: "work_cloud",
      model: "synthetic-model",
      effort: "high",
    });
    const reservations = await s.t.run((ctx) =>
      ctx.db.query("reservations").collect(),
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0].max).toBe(0);
    for (const patch of [
      { savedIntentId: "invalid" },
      { unrecognized: true },
      { maxCredits: 10 },
    ]) {
      expect((await request({ ...args, ...patch })).result.isError).toBe(true);
    }
    expect(
      (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))?.generation,
    ).toBe(1);
    for (const savedIntentId of [null, "a".repeat(63), "g".repeat(64)]) {
      runMutation.mockClear();
      provider.mockClear();
      const rejected = await http(
        { runMutation },
        new Request("https://synthetic.example/assistant-tools", {
          method: "POST",
          headers: {
            authorization: "Bearer synthetic-access-token-0123456789",
          },
          body: JSON.stringify({
            operation: "request_analysis",
            args: { ...args, savedIntentId },
          }),
        }),
      );
      expect(rejected.status).toBe(403);
      expect(runMutation).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
    }
  },
);

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

it("uses reviewed automatic app saves in the original sole-owner workspace without converting or copying libraries", async () => {
  const s = await setup(true, true);
  const before = await s.t.run(async (ctx) => ({
    original: await ctx.db.get(s.org),
    personal: await ctx.db.get(s.privateOrg),
  }));
  expect(
    await s.owner.query(api.organizations.previewPrivateAdoption, {
      organizationId: s.org,
    }),
  ).toMatchObject({ eligible: false, reason: "other_private_workspace" });
  expect(
    await s.owner.query(api.assistantGrants.setup, { organizationId: s.org }),
  ).toMatchObject({ privateLibrary: false, workCloudSavedEnabled: true });
  expect(
    (await s.owner.query(api.aiPreferences.read, { organizationId: s.org }))
      .workCloud,
  ).toMatchObject({ available: true, configured: true, grantVersion: 1 });
  const saved = await s.capture();
  expect(saved.intentId).toMatch(/^[a-f0-9]{64}$/);
  expect(await s.start(saved.sourceId, saved.intentId!)).toMatchObject({
    generation: 1,
    reused_request: false,
  });
  expect(
    await s.t.run(async (ctx) => ({
      original: await ctx.db.get(s.org),
      personal: await ctx.db.get(s.privateOrg),
    })),
  ).toEqual(before);
  expect(
    (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))?.organizationId,
  ).toBe(s.org);
  expect(
    await s.t.run((ctx) => ctx.db.query("sources").collect()),
  ).toHaveLength(1);
});
async function disqualifySavedWorkspace(
  s: Awaited<ReturnType<typeof setup>>,
  change: "member" | "invitation" | "saturated" | "creator" | "role",
) {
  await s.t.run(async (ctx) => {
    if (change === "member" || change === "creator") {
      const other = await ctx.db.insert("users", {
        subject: "another-save-owner",
        email: "other@example.test",
        name: "Other",
        status: "active",
        createdAt: Date.now(),
      });
      if (change === "member")
        await ctx.db.insert("memberships", {
          organizationId: s.org,
          userId: other,
          role: "viewer",
        });
      else await ctx.db.patch(s.org, { createdBy: other });
    } else if (change === "role") {
      const m = await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q.eq("organizationId", s.org).eq("userId", s.actor),
        )
        .unique();
      await ctx.db.patch(m!._id, { role: "admin" });
    } else
      for (let i = 0; i < (change === "saturated" ? 51 : 1); i++)
        await ctx.db.insert("invitations", {
          organizationId: s.org,
          email: `saved${i}@example.test`,
          role: "viewer",
          tokenHash: String(i).padStart(64, "0"),
          createdBy: s.actor,
          expiresAt: Date.now() + (change === "saturated" ? -1 : 60000),
        });
  });
}
it.each(["member", "invitation", "saturated", "creator", "role"] as const)(
  "stops original-workspace automatic Save authority after %s changes",
  async (change) => {
    const s = await setup(true, true),
      saved = await s.capture();
    await disqualifySavedWorkspace(s, change);
    expect(
      await s.owner.query(api.assistantGrants.setup, { organizationId: s.org }),
    ).toMatchObject({ workCloudSavedEnabled: false });
    expect(
      (await s.owner.query(api.aiPreferences.read, { organizationId: s.org }))
        .workCloud,
    ).toBeNull();
    await expect(
      s.owner.mutation(api.assistantGrants.save, {
        ...s.grantArgs,
        expectedVersion: 1,
      }),
    ).rejects.toThrow(/SETUP_REQUIRED/);
    await expect(s.capture()).rejects.toThrow();
    expect(
      (
        await s.assistant.query(internal.assistant.getJobStatus, {
          profileId: s.org,
          sourceId: saved.sourceId,
        })
      ).saved_cloud_intent,
    ).toBeNull();
    await expect(s.start(saved.sourceId, saved.intentId!)).rejects.toThrow(
      /SETUP_REQUIRED|FORBIDDEN|APPROVAL_STALE/,
    );
    expect(
      (await s.t.run((ctx) => ctx.db.get(saved.sourceId)))?.generation,
    ).toBe(0);
    expect(
      await s.t.run((ctx) => ctx.db.query("reservations").collect()),
    ).toHaveLength(0);
  },
);
it("an older sole-owner connection gains no automatic defaults or intent", async () => {
  const s = await setup(false, true);
  expect(
    await s.owner.query(api.assistantGrants.setup, { organizationId: s.org }),
  ).toMatchObject({ workCloudSavedEnabled: true });
  expect(
    (await s.owner.query(api.aiPreferences.read, { organizationId: s.org }))
      .workCloud,
  ).toMatchObject({ available: false, configured: false });
  await expect(s.capture()).rejects.toThrow(/SETUP_REQUIRED/);
  expect(
    await s.t.run((ctx) => ctx.db.query("sources").collect()),
  ).toHaveLength(0);
});

it.each([false, true])(
  "reports the current waiting Cloud intent ahead of a historical local intake: legacy=%s",
  async (legacy) => {
    const s = await setup(true, legacy);
    const saved = await s.capture();
    const intakeId = await s.t.run(async (ctx) => {
      const source = (await ctx.db.get(saved.sourceId))!;
      return ctx.db.insert("assistantIntakes", {
        organizationId: s.org,
        actor: s.actor,
        clientId,
        grantId: s.grant.id,
        grantVersion: s.grant.version,
        sourceId: saved.sourceId,
        generation: source.generation,
        revision: source.updatedAt,
        queueState: "waiting",
        createdAt: Date.now(),
      });
    });
    const before = await s.t.run((ctx) => ctx.db.get(intakeId));
    const args = { profileId: s.org, sourceId: saved.sourceId };
    const current = await s.assistant.query(
      internal.assistant.getJobStatus,
      args,
    );
    expect(current.status).toBe("waiting_for_cloud");
    expect(current.receipt).toBeNull();
    expect(current.processing).toBeNull();
    expect(current.saved_cloud_intent?.state).toBe("waiting_for_runtime");
    expect(
      await s.owner.query(api.assistantIntakeUi.status, {
        sourceId: saved.sourceId,
      }),
    ).toBeNull();
    for (const mode of ["credits", "cancel"] as const)
      await expect(
        s.owner.mutation(api.assistantIntakeUi.act, {
          sourceId: saved.sourceId,
          generation: 0,
          mode,
          ...(mode === "credits" ? { maxCredits: 10 } : {}),
        }),
      ).rejects.toThrow("APPROVAL_STALE");
    expect(await s.t.run((ctx) => ctx.db.get(intakeId))).toEqual(before);
    vi.setSystemTime(saved.expiresAt! + 1);
    const expired = await s.assistant.query(
      internal.assistant.getJobStatus,
      args,
    );
    expect(expired.saved_cloud_intent).toBeNull();
    expect(expired.status).toBe(expired.receipt?.status);
    expect(expired.receipt).not.toBeNull();
    expect(
      await s.owner.query(api.assistantIntakeUi.status, {
        sourceId: saved.sourceId,
      }),
    ).not.toBeNull();
    expect(await s.t.run((ctx) => ctx.db.get(intakeId))).toEqual(before);
  },
);
