import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setup } from "./assistant-event-fixture";
import { api, internal } from "../convex/_generated/api";
import {
  eventSubscriptionCurrent,
  notifyCloudWaiting,
} from "../convex/lib/assistantEvents";
import {
  eventArguments,
  profileEventArguments,
  eventSubscriptionId,
} from "../packages/mcp/events";

const subject = "user_01234567890123456789012345";
const clientId = "client_01234567890123456789012345";
const scopes = [
  "analysis:execute",
  "analysis:request",
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
async function profileSetup(
  eventName:
    | "work_cloud_waiting"
    | "work_cloud_connection_verified" = "work_cloud_waiting",
) {
  const s = await setup();
  for (const key of ["WORK_CLOUD_MEDIA_ENABLED", "WORK_CLOUD_MEDIA_VERIFIED"])
    vi.stubEnv(key, "true");
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", JSON.stringify([subject]));
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Synthetic", scopes }]),
  );
  const identity = {
    subject,
    issuer: "https://synthetic-test.authkit.app",
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  };
  const assistant = s.t.withIdentity(identity);
  const grantArgs = {
    ...s.args,
    sources: [],
    libraryScope: "all" as const,
    scopes,
    cloudRequestPolicy: "explicit_per_source_v1" as const,
  };
  const grant = await s.owner.mutation(api.assistantGrants.save, grantArgs);
  const input = {
    eventName,
    profileId: s.organizationId,
    grantVersion: grant.version,
    externalId: "sub_" + "c".repeat(64),
    ciphertext: "synthetic-encrypted-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  };
  const install = () =>
    assistant.mutation(internal.assistantEvents.install, input);
  await install();
  const subscription = (await s.t.run((ctx) =>
    ctx.db.query("assistantSubscriptions").first(),
  ))!;
  const capture = async (key: string) => {
    const id = await s.owner.mutation(api.product.capture, {
      organizationId: s.organizationId,
      kind: "url",
      url: `https://www.youtube.com/watch?v=${key}`,
      key,
      title: "Synthetic waiting source",
      rightsAttested: true,
    });
    return (await s.t.run((ctx) => ctx.db.get(id)))!;
  };
  const request = (source: Awaited<ReturnType<typeof capture>>) => ({
    profileId: s.organizationId,
    sourceId: source._id,
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
  });
  const deliveries = () =>
    s.t.run((ctx) => ctx.db.query("assistantDeliveries").collect());
  return {
    ...s,
    assistant,
    identity,
    grantArgs,
    grant,
    input,
    install,
    subscription,
    capture,
    request,
    deliveries,
  };
}
it("keeps strict source/profile arguments and event-specific subscription IDs", () => {
  const p = {
    subject,
    clientId,
    consentId: "app_consent_01234567890123456789012345",
  };
  const profile = { profileId: "profile", grantVersion: 1 };
  expect(() => eventArguments.parse(profile)).toThrow();
  expect(() =>
    profileEventArguments.parse({
      ...profile,
      sourceId: "source",
      generation: 1,
    }),
  ).toThrow();
  const a = eventSubscriptionId(
    p,
    "https://receiver.example/callback",
    profile,
    "work_cloud_waiting",
  );
  expect(a).not.toBe(
    eventSubscriptionId(
      p,
      "https://receiver.example/callback",
      profile,
      "work_cloud_connection_verified",
    ),
  );
  expect(a).not.toBe(
    eventSubscriptionId(
      p,
      "https://receiver.example/callback",
      { ...profile, profileId: "other" },
      "work_cloud_waiting",
    ),
  );
});
it("notifies sibling sources independently at the same generation/approval time and deduplicates exact reuse", async () => {
  const s = await profileSetup();
  const a = await s.capture("abcdefghijk"),
    b = await s.capture("bcdefghijkl");
  const ra = s.request(a),
    rb = s.request(b);
  await s.assistant.mutation(internal.assistant.requestAnalysis, ra);
  await s.assistant.mutation(internal.assistant.requestAnalysis, rb);
  await s.assistant.mutation(internal.assistant.requestAnalysis, ra);
  const rows = await s.deliveries();
  expect(rows).toHaveLength(2);
  expect(rows.map((d) => "sourceId" in d && d.sourceId).sort()).toEqual(
    [a._id, b._id].sort(),
  );
  expect(rows[0].completedRevision).toBe(rows[1].completedRevision);
  expect(JSON.stringify(rows)).not.toContain("PRIVATE");
  const source = (await s.t.run((ctx) => ctx.db.get(a._id)))!;
  expect(source.personalAnalysis).toMatchObject({
    state: "queued",
    cloud: { maxApiUsd: 0, funding: "own_subscription" },
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(2);
});
it("connection creation queues one honest readiness notice; renewal creates no job or second notice", async () => {
  const s = await profileSetup("work_cloud_connection_verified");
  await s.install();
  const rows = await s.deliveries();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    eventName: "work_cloud_connection_verified",
    state: "pending",
  });
  expect(rows[0]).not.toHaveProperty("sourceId");
  expect(rows[0]).not.toHaveProperty("generation");
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.personalAnalysis,
  ).toBeUndefined();
});
it("bounds lookup by the exact job actor/client despite many older foreign-client subscriptions", async () => {
  const s = await profileSetup();
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.get(s.subscription._id))!;
    const { _id, _creationTime, ...record } = row;
    await ctx.db.delete(_id);
    for (let i = 1; i <= 40; i++)
      await ctx.db.insert("assistantSubscriptions", {
        ...record,
        eventName: "analysis_completed",
        sourceId: s.sourceId,
        generation: 0,
        revision: 1,
        clientId: `foreign_${i}`,
        externalId: "sub_" + i.toString(16).padStart(64, "0"),
      });
    await ctx.db.insert("assistantSubscriptions", record);
  });
  const source = await s.capture("abcdefghijk");
  await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    s.request(source),
  );
  expect(await s.deliveries()).toHaveLength(1);
});
it("exact unclaimed reuse can notify after setup without scanning or restarting prior jobs", async () => {
  const s = await profileSetup();
  await s.assistant.mutation(internal.assistantEvents.unsubscribe, {
    subscriptionId: s.input.externalId,
  });
  const source = await s.capture("abcdefghijk"),
    request = s.request(source);
  const first = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    request,
  );
  expect(first).toMatchObject({ generation: 1, reused_request: false });
  await s.install();
  expect(await s.deliveries()).toEqual([]);
  const reused = await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    request,
  );
  expect(reused).toMatchObject({
    generation: 1,
    reused_request: true,
  });
  await s.assistant.mutation(internal.assistant.requestAnalysis, request);
  expect(await s.deliveries()).toHaveLength(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
});
it("does no retrospective catchup and never notifies a claimed/unknown job", async () => {
  const s = await profileSetup();
  await s.assistant.mutation(internal.assistantEvents.unsubscribe, {
    subscriptionId: s.input.externalId,
  });
  const source = await s.capture("abcdefghijk"),
    request = s.request(source);
  await s.assistant.mutation(internal.assistant.requestAnalysis, request);
  expect(await s.deliveries()).toEqual([]);
  await s.install();
  expect(await s.deliveries()).toEqual([]);
  await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    sourceId: source._id,
    generation: 1,
    taskId: "synthetic-cloud-task",
    operation: "claim",
  });
  await s.t.run(async (ctx) =>
    notifyCloudWaiting(ctx, (await ctx.db.get(source._id))!),
  );
  expect(await s.deliveries()).toEqual([]);
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, request),
  ).rejects.toThrow();
});
it.each([
  "grant",
  "expiry",
  "rights",
  "claim",
  "profile",
  "policy",
  "scope",
  "restore",
])("rechecks %s after queueing and before delivery", async (change) => {
  const s = await profileSetup();
  const source = await s.capture("abcdefghijk");
  await s.assistant.mutation(
    internal.assistant.requestAnalysis,
    s.request(source),
  );
  const d = (await s.deliveries())[0];
  const claimed = (await s.t.mutation(internal.assistantEvents.claim, {
    id: d._id,
  }))!;
  expect(claimed.delivery.eventName).toBe("work_cloud_waiting");
  if (change === "grant")
    await s.owner.mutation(api.assistantGrants.revoke, {
      id: s.grant.id,
      expectedVersion: 1,
    });
  if (change === "expiry")
    await s.t.run((ctx) =>
      ctx.db.patch(s.subscription._id, { expiresAt: Date.now() - 1 }),
    );
  if (change === "rights")
    await s.t.run((ctx) => ctx.db.patch(source._id, { rightsAttested: false }));
  if (change === "claim")
    await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
      sourceId: source._id,
      generation: 1,
      taskId: "synthetic-cloud-task",
      operation: "claim",
    });
  if (change === "profile") {
    const other = await s.owner.mutation(api.organizations.create, {
      name: "Other profile",
    });
    await s.t.run((ctx) => ctx.db.patch(source._id, { organizationId: other }));
  }
  if (change === "policy")
    await s.t.run((ctx) =>
      ctx.db.patch(s.grant.id, { cloudRequestPolicyHash: "stale" }),
    );
  if (change === "scope")
    await s.t.run((ctx) =>
      ctx.db.patch(s.grant.id, { scopes: ["events:subscribe"] }),
    );
  if (change === "restore") vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    await s.t.query(internal.assistantEvents.deliveryCurrent, {
      id: d._id,
      lease: claimed.delivery.lease,
    }),
  ).toBe(false);
});
it("rejects mixed persisted delivery modes and keeps missing legacy source fields invalid", async () => {
  const s = await profileSetup();
  const base = {
    organizationId: s.organizationId,
    subscriptionId: s.subscription._id,
    completedRevision: Date.now(),
    state: "pending" as const,
    attempts: 0,
    dueAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await expect(
    s.t.run((ctx) =>
      ctx.db.insert("assistantDeliveries", {
        ...base,
        eventName: "work_cloud_connection_verified",
        sourceId: s.sourceId,
        generation: 1,
      } as never),
    ),
  ).rejects.toThrow();
  await expect(
    s.t.run((ctx) => ctx.db.insert("assistantDeliveries", base as never)),
  ).rejects.toThrow();
  await expect(
    s.assistant.mutation(internal.assistantEvents.install, {
      ...s.input,
      eventName: "analysis_completed",
      sourceId: undefined,
      generation: undefined,
    }),
  ).rejects.toThrow("INVALID_INPUT");
});
it("requires all-library scope, both token scopes, and the current eligible owner", async () => {
  const s = await profileSetup();
  for (const scope of ["analysis:request", "analysis:execute"]) {
    const limited = s.t.withIdentity({
      ...s.identity,
      scope: scopes.filter((x) => x !== scope).join(" "),
    });
    await expect(
      limited.mutation(internal.assistantEvents.install, s.input),
    ).rejects.toThrow("FORBIDDEN");
  }
  await s.t.run((ctx) =>
    ctx.db.patch(s.grant.id, { libraryScope: "personal" }),
  );
  expect(
    await s.t.run((ctx) => eventSubscriptionCurrent(ctx, s.subscription)),
  ).toBe(false);
  await expect(s.install()).rejects.toThrow("FORBIDDEN");
});
it("bounds profile subscription quota without adding an index or scanning source jobs", async () => {
  const s = await profileSetup();
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.get(s.subscription._id))!;
    const { _id, _creationTime, ...record } = row;
    for (let i = 1; i < 20; i++)
      await ctx.db.insert("assistantSubscriptions", {
        ...record,
        externalId: "sub_" + i.toString(16).padStart(64, "0"),
      });
  });
  await expect(
    s.assistant.mutation(internal.assistantEvents.install, {
      ...s.input,
      externalId: "sub_" + "d".repeat(64),
    }),
  ).rejects.toThrow("QUOTA_EXCEEDED");
});
