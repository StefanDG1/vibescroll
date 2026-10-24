import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const subject = "user_01234567890123456789012345";
const clientId = "client_01234567890123456789012345";
const issuer = "https://cloud-request-fixture.authkit.app";
const scopes = ["analysis:execute", "analysis:request", "jobs:read"];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup(policy = true, library = false) {
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
    JSON.stringify([{ id: clientId, name: "Fixture", scopes }]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "fixture@example.test",
    name: "Fixture",
  });
  const owner = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const identity = {
    subject,
    issuer,
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  };
  const assistant = t.withIdentity(identity);
  const org = await owner.mutation(api.organizations.createPrivate, {});
  const sourceId = await owner.mutation(api.product.capture, {
    organizationId: org,
    kind: "url",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    title: "Synthetic permission fixture",
    key: "cloud-request-fixture",
    rightsAttested: true,
  });
  const source = (await t.run((ctx) => ctx.db.get(sourceId)))!;
  const grantArgs = {
    organizationId: org,
    clientId,
    sources: library
      ? []
      : [
          {
            sourceId,
            generation: source.generation,
            revision: source.updatedAt,
          },
        ],
    ...(library ? { libraryScope: "all" as const } : {}),
    scopes,
    ...(policy
      ? { cloudRequestPolicy: "explicit_per_source_v1" as const }
      : {}),
    expectedVersion: 0,
    expiresAt: Date.now() + 86400000,
    acknowledged: true as const,
  };
  const grant = await owner.mutation(api.assistantGrants.save, grantArgs);
  const request = {
    profileId: org,
    sourceId,
    mode: "work_cloud" as const,
    generation: source.generation,
    revision: source.updatedAt,
    grantVersion: grant.version,
    cloud: {
      model: "synthetic-model",
      effort: "high" as const,
      useOwnPlan: true as const,
      maxApiUsd: 0 as const,
      retainUntil: Date.now() + 86400000,
    },
  };
  const call = (args = request) =>
    assistant.mutation(internal.assistant.requestAnalysis, args);
  return {
    t,
    owner,
    assistant,
    identity,
    org,
    sourceId,
    source,
    grant,
    grantArgs,
    request,
    call,
  };
}
it("creates one exact private Cloud job through MCP without repository or per-post app authentication", async () => {
  const s = await setup();
  const queued = await s.call();
  expect(queued).toMatchObject({
    source_id: s.sourceId,
    generation: 1,
    status: "waiting_for_cloud",
    analysis_started: false,
    reused_request: false,
    cloud: {
      funding: "own_subscription",
      max_api_usd: 0,
      publication: "private_only",
    },
  });
  expect(JSON.stringify(queued)).not.toContain("leaseToken");
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(source.personalAnalysis).toMatchObject({
    executor: "work_cloud",
    generation: 1,
    state: "queued",
    cloud: {
      selectedGeneration: 0,
      selectedRevision: s.source.updatedAt,
      grantVersion: 1,
    },
  });
  const claimed = await s.assistant.mutation(
    internal.workCloudAnalysis.dispatch,
    {
      sourceId: s.sourceId,
      generation: 1,
      taskId: "synthetic-cloud-task",
      operation: "claim",
    },
  );
  expect(claimed).toMatchObject({ leaseToken: expect.any(String) });
  const input = await s.assistant.query(internal.workCloudAnalysis.input, {
    sourceId: s.sourceId,
    generation: 1,
    taskId: "synthetic-cloud-task",
    leaseToken: claimed.leaseToken!,
  });
  expect(input).toMatchObject({
    schemaVersion: "work-cloud-media-v2",
    maxApiUsd: 0,
    requestedModel: "synthetic-model",
  });
  expect(input).not.toHaveProperty("repository");
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
});
it("does not widen old two-scope execution grants", async () => {
  const s = await setup(false);
  await expect(s.call()).rejects.toThrow(/SETUP_REQUIRED/);
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.generation).toBe(0);
});
it.each(["analysis:request", "analysis:execute"])(
  "requires the current OAuth %s scope",
  async (missing) => {
    const s = await setup();
    const caller = s.t.withIdentity({
      ...s.identity,
      scope: scopes.filter((x) => x !== missing).join(" "),
    });
    await expect(
      caller.mutation(internal.assistant.requestAnalysis, s.request),
    ).rejects.toThrow(/FORBIDDEN|scope/);
  },
);
it.each(["generation", "revision", "grantVersion"] as const)(
  "rejects stale %s even without a preview handshake",
  async (key) => {
    const s = await setup();
    await expect(
      s.call({ ...s.request, [key]: s.request[key] + 1 }),
    ).rejects.toThrow(/STALE|SETUP_REQUIRED/);
  },
);
it("replays an identical unclaimed request without another reservation, generation or quota debit", async () => {
  const s = await setup();
  const first = await s.call(),
    second = await s.call();
  expect(second).toMatchObject({ ...first, reused_request: true });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
  expect(
    (await s.t.run((ctx) => ctx.db.query("limits").collect())).find((x) =>
      x.key.startsWith("work-cloud-mcp-hour:"),
    )?.count,
  ).toBe(1);
});
it("recovers an unclaimed request using the current status receipt after a lost reply", async () => {
  const s = await setup();
  await s.call();
  const status = await s.assistant.query(internal.assistant.getJobStatus, {
    profileId: s.org,
    sourceId: s.sourceId,
  });
  expect(status).toMatchObject({
    generation: 1,
    grant_version: 1,
    cloud_request_policy: "explicit_per_source_v1",
    processing: { executor: "work_cloud", state: "queued", stage: "acquiring" },
  });
  expect(
    await s.call({
      ...s.request,
      generation: status.generation,
      revision: status.revision,
    }),
  ).toMatchObject({ generation: 1, reused_request: true });
});
it.each(["client", "app"])(
  "requires the %s execution scope after setup",
  async (where) => {
    const s = await setup();
    if (where === "client")
      vi.stubEnv(
        "MCP_CLIENTS",
        JSON.stringify([
          {
            id: clientId,
            name: "Fixture",
            scopes: scopes.filter((x) => x !== "analysis:execute"),
          },
        ]),
      );
    else
      await s.t.run((ctx) =>
        ctx.db.patch(s.grant.id, {
          scopes: scopes.filter((x) => x !== "analysis:execute"),
        }),
      );
    await expect(s.call()).rejects.toThrow(/FORBIDDEN/);
  },
);
it("does not use the private protocol after private ownership or source rights are lost", async () => {
  const s = await setup();
  await s.t.run((ctx) => ctx.db.patch(s.org, { privateOwnerId: undefined }));
  await expect(s.call()).rejects.toThrow(/SETUP_REQUIRED/);
  const other = await setup();
  await other.t.run((ctx) =>
    ctx.db.patch(other.sourceId, { rightsAttested: false }),
  );
  await expect(other.call()).rejects.toThrow(/FORBIDDEN/);
});
it("does not replace an unknown attempt, even using its new current revision", async () => {
  const s = await setup(true, true);
  await s.call();
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!;
    if (source.personalAnalysis?.executor !== "work_cloud")
      throw Error("Expected Cloud job");
    await ctx.db.patch(s.sourceId, {
      state: "failed",
      personalAnalysis: { ...source.personalAnalysis, state: "unknown" },
    });
  });
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  await expect(
    s.call({
      ...s.request,
      generation: source.generation,
      revision: source.updatedAt,
    }),
  ).rejects.toThrow(/STALE/);
});
it.each(["model", "effort", "retainUntil"] as const)(
  "does not overwrite queued work with changed %s",
  async (key) => {
    const s = await setup();
    await s.call();
    const changes = {
      model: "different-model",
      effort: "medium" as const,
      retainUntil: s.request.cloud.retainUntil + 1000,
    };
    await expect(
      s.call({
        ...s.request,
        cloud: { ...s.request.cloud, [key]: changes[key] },
      }),
    ).rejects.toThrow(/STALE/);
  },
);
it("rejects a claimed job rather than creating a replacement", async () => {
  const s = await setup();
  await s.call();
  await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    sourceId: s.sourceId,
    generation: 1,
    taskId: "claimed-task",
    operation: "claim",
  });
  await expect(s.call()).rejects.toThrow(/STALE/);
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.generation).toBe(1);
});
it("checks exact current evidence, not the intake-only fallback", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { updatedAt: s.source.updatedAt + 1 }),
  );
  await expect(
    s.call({ ...s.request, revision: s.source.updatedAt + 1 }),
  ).rejects.toThrow(/STALE/);
});
it.each([
  "WORK_CLOUD_MEDIA_ENABLED",
  "WORK_CLOUD_MEDIA_VERIFIED",
  "RESTORE_LOCK",
  "DISABLE_INFERENCE",
])("fails closed on %s", async (key) => {
  const s = await setup();
  vi.stubEnv(key, key.startsWith("WORK_") ? "false" : "true");
  await expect(s.call()).rejects.toThrow();
});
it("requires fresh app authentication to install the new policy", async () => {
  const s = await setup(false);
  const stale = s.t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000) - 1000,
  });
  await expect(
    stale.mutation(api.assistantGrants.save, {
      ...s.grantArgs,
      cloudRequestPolicy: "explicit_per_source_v1",
      expectedVersion: 1,
    }),
  ).rejects.toThrow(/Sign in again/);
});
it("binds the reviewed media policy and respects revocation", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.grant.id, { cloudRequestPolicyHash: "a".repeat(64) }),
  );
  await expect(s.call()).rejects.toThrow(/SETUP_REQUIRED/);
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: s.grant.id,
    expectedVersion: 1,
  });
  await expect(s.call()).rejects.toThrow(/FORBIDDEN/);
});
it("rejects expired retention, project or credit options and cross-mode Cloud options", async () => {
  const s = await setup();
  await expect(
    s.call({
      ...s.request,
      cloud: { ...s.request.cloud, retainUntil: Date.now() - 1 },
    }),
  ).rejects.toThrow();
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      ...s.request,
      maxCredits: 0,
    }),
  ).rejects.toThrow(/INVALID_INPUT/);
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      ...s.request,
      project: "anything",
    }),
  ).rejects.toThrow(/INVALID_INPUT/);
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      ...s.request,
      mode: "local",
    }),
  ).rejects.toThrow(/INVALID_INPUT/);
});
it("bounds new requests per actor/hour, while retrying queued work is free", async () => {
  const s = await setup(true, true);
  await s.call();
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.query("limits").collect()).find((x) =>
      x.key.startsWith("work-cloud-mcp-hour:"),
    )!;
    await ctx.db.patch(row._id, { count: 6 });
  });
  expect(await s.call()).toMatchObject({ reused_request: true });
  const other = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    kind: "url",
    url: "https://www.youtube.com/watch?v=abcdefghijl",
    title: "Second synthetic source",
    key: "cloud-second-fixture",
    rightsAttested: true,
  });
  const source = (await s.t.run((ctx) => ctx.db.get(other)))!;
  const request = {
    ...s.request,
    sourceId: other,
    generation: source.generation,
    revision: source.updatedAt,
  };
  await expect(s.call(request)).rejects.toThrow(/QUOTA_EXCEEDED/);
  vi.advanceTimersByTime(3600000);
  expect(await s.call(request)).toMatchObject({ reused_request: false });
});
