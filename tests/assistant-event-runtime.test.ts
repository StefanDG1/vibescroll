import { afterEach, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import type { JSONWebKeySet } from "jose";
let jwks: JSONWebKeySet;
let signingKeys: Awaited<ReturnType<typeof generateKeyPair>>;
const callback = vi.hoisted(() => vi.fn());
vi.mock("jose", async (original) => {
  const actual = await original<typeof import("jose")>();
  return {
    ...actual,
    createRemoteJWKSet: () => actual.createLocalJWKSet(jwks),
  };
});
vi.mock("../packages/mcp/webhook", async (original) => ({
  ...(await original<typeof import("../packages/mcp/webhook")>()),
  sendWebhook: callback,
}));
import { setup } from "./assistant-event-fixture";
import { sealEventCredentials } from "../packages/mcp/credentials";
import { eventSubscriptionId } from "../packages/mcp/events";
import { internal, api } from "../convex/_generated/api";
import { queueSourceCompletion } from "../convex/lib/assistantEvents";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});
const principal = {
  subject: "user_01234567890123456789012345",
  clientId: "client_01234567890123456789012345",
  consentId: "app_consent_01234567890123456789012345",
};
async function runtimeSetup(untilRevoked = false) {
  const s = await setup();
  vi.stubEnv("MCP_EVENT_SECRET_KEY_1", Buffer.alloc(32, 9).toString("base64"));
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    expiresAt: untilRevoked ? null : s.args.expiresAt,
    scopes: ["events:subscribe"],
  });
  if (!signingKeys) {
    signingKeys = await generateKeyPair("RS256");
    jwks = {
      keys: [
        {
          ...(await exportJWK(signingKeys.publicKey)),
          kid: "synthetic",
          alg: "RS256",
        },
      ],
    };
  }
  const keys = signingKeys;
  const now = Math.floor(Date.now() / 1000);
  const sign = (changes: Record<string, unknown> = {}) =>
    new SignJWT({
      sub: principal.subject,
      client_id: principal.clientId,
      sid: principal.consentId,
      scope: "events:subscribe",
      iss: "https://synthetic-test.authkit.app",
      aud: "https://scroll.companynerve.com/mcp",
      iat: now,
      exp: now + 600,
      ...changes,
    })
      .setProtectedHeader({ alg: "RS256", kid: "synthetic" })
      .sign(keys.privateKey);
  const token = await sign();
  const provider = vi.fn(async () => Response.json({ sub: principal.subject }));
  vi.stubGlobal("fetch", provider);
  const credentials = {
    token,
    callback: "https://receiver.example/callback",
    secret: "whsec_" + Buffer.alloc(32, 8).toString("base64"),
  };
  const selected = {
    profileId: s.organizationId,
    sourceId: s.sourceId,
    generation: s.args.sources[0].generation,
    grantVersion: grant.version,
  };
  const input = {
    ...selected,
    ...sealEventCredentials(credentials, principal),
  };
  callback.mockImplementation(async (_url: string, body: string) => ({
    status: 204,
    body: Buffer.from(
      JSON.stringify({ challenge: JSON.parse(body).challenge }),
    ),
  }));
  return { ...s, grant, selected, input, sign, provider, credentials };
}
it("caps completion credentials at OAuth expiry even when the app grant lasts until revoked", async () => {
  const s = await runtimeSetup(true);
  const result = await s.assistant.action(
    internal.assistantEventRuntime.subscribe,
    s.input,
  );
  expect(result.verified).toBe(true);
  const stored = (await s.t.run((ctx) =>
    ctx.db.query("assistantSubscriptions").first(),
  ))!;
  expect(stored.expiresAt).toBeGreaterThan(Date.now());
  expect(stored.expiresAt).toBeLessThanOrEqual(Date.now() + 600000);
});
it("verifies signed callback ownership and current RSA/provider authority before storing finite encrypted credentials", async () => {
  const s = await runtimeSetup();
  for (const changes of [
    { exp: 1 },
    { aud: "https://evil.example" },
    { sid: "app_consent_99999999999999999999999999" },
    { scope: "knowledge:read" },
  ]) {
    const input = {
      ...s.selected,
      ...sealEventCredentials(
        { ...s.credentials, token: await s.sign(changes) },
        principal,
      ),
    };
    await expect(
      s.assistant.action(internal.assistantEventRuntime.subscribe, input),
    ).rejects.toThrow("EVENT_AUTHORIZATION_UNAVAILABLE");
  }
  expect(callback).not.toHaveBeenCalled();
  callback.mockResolvedValueOnce({
    status: 200,
    body: Buffer.from('{"challenge":"wrong"}'),
  });
  const invalid = await s.assistant.action(
    internal.assistantEventRuntime.subscribe,
    s.input,
  );
  expect(invalid.verified).toBe(false);
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantSubscriptions").collect()),
  ).toHaveLength(0);
  const result = await s.assistant.action(
    internal.assistantEventRuntime.subscribe,
    s.input,
  );
  expect(result.verified).toBe(true);
  const stored = (await s.t.run((ctx) =>
    ctx.db.query("assistantSubscriptions").first(),
  ))!;
  expect(JSON.stringify(stored)).not.toContain(s.credentials.token);
  expect(JSON.stringify(stored)).not.toContain(s.credentials.secret);
  expect(stored.expiresAt).toBeLessThanOrEqual(Date.now() + 600000);
  expect(stored.externalId).toBe(
    eventSubscriptionId(principal, s.credentials.callback, s.selected),
  );
  const verify = callback.mock.calls.at(-1)!;
  expect(verify[2]["X-MCP-Subscription-Id"]).toBe(stored.externalId);
  const count = callback.mock.calls.length;
  await s.assistant.action(internal.assistantEventRuntime.subscribe, s.input);
  expect(callback).toHaveBeenCalledTimes(count);
  const rotated = {
    ...s.credentials,
    secret: "whsec_" + Buffer.alloc(32, 7).toString("base64"),
  };
  await s.assistant.action(internal.assistantEventRuntime.subscribe, {
    ...s.selected,
    ...sealEventCredentials(rotated, principal),
  });
  expect(callback).toHaveBeenCalledTimes(count + 1);
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantSubscriptions").collect()),
  ).toHaveLength(1);
});
async function complete(s: Awaited<ReturnType<typeof runtimeSetup>>) {
  await s.assistant.action(internal.assistantEventRuntime.subscribe, s.input);
  return s.t.run(async (ctx) => {
    const before = (await ctx.db.get(s.sourceId))!;
    await ctx.db.patch(s.sourceId, {
      state: "ready",
      updatedAt: before.updatedAt + 1,
    });
    return (
      await queueSourceCompletion(ctx, (await ctx.db.get(s.sourceId))!, before)
    )[0];
  });
}
it("delivers minimal status with stable signed identity across retries, stops permanent callback failure and does not expose content", async () => {
  const s = await runtimeSetup();
  const id = await complete(s);
  callback.mockResolvedValueOnce({ status: 503, body: Buffer.from("") });
  await s.t.action(internal.assistantEventRuntime.deliver, { id });
  const first = callback.mock.calls.at(-1)!;
  expect(first[4]).toBe(true);
  const event = JSON.parse(first[1]);
  expect(event).toMatchObject({
    eventId: "evt_" + id,
    name: "analysis_completed",
    cursor: null,
    data: {
      sourceId: s.sourceId,
      profileId: s.organizationId,
      status: "ready",
      evidenceChanged: true,
    },
  });
  expect(Object.keys(event.data).sort()).toEqual([
    "evidenceChanged",
    "profileId",
    "reviewUrl",
    "sourceId",
    "status",
  ]);
  expect(JSON.stringify(event)).not.toContain("PRIVATE");
  expect(first[2]["webhook-id"]).toBe(event.eventId);
  await s.t.run((ctx) => ctx.db.patch(id, { dueAt: Date.now() - 1 }));
  callback.mockResolvedValueOnce({ status: 410, body: Buffer.from("") });
  await s.t.action(internal.assistantEventRuntime.deliver, { id });
  const last = callback.mock.calls.at(-1)!;
  expect(last[1]).toBe(first[1]);
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "failed",
    attempts: 2,
    httpStatus: 410,
  });
  const count = callback.mock.calls.length;
  await s.t.action(internal.assistantEventRuntime.deliver, { id });
  expect(callback).toHaveBeenCalledTimes(count);
});
it("rejects a disconnected provider and concurrent app revocation before transmitting application data", async () => {
  const s = await runtimeSetup();
  const id = await complete(s);
  callback.mockClear();
  s.provider.mockResolvedValueOnce(
    Response.json({ error: "revoked" }, { status: 401 }),
  );
  await s.t.action(internal.assistantEventRuntime.deliver, { id });
  expect(callback).not.toHaveBeenCalled();
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "failed",
  });
  const second = await runtimeSetup();
  const next = await complete(second);
  callback.mockClear();
  second.provider.mockImplementationOnce(async () => {
    await second.owner.mutation(api.assistantGrants.revoke, {
      id: second.grant.id,
      expectedVersion: 1,
    });
    return Response.json({ sub: principal.subject });
  });
  await second.t.action(internal.assistantEventRuntime.deliver, { id: next });
  expect(callback).not.toHaveBeenCalled();
  expect(await second.t.run((ctx) => ctx.db.get(next))).toMatchObject({
    state: "cancelled",
  });
});

it("retries transient provider outages without invoking the callback", async () => {
  const s = await runtimeSetup();
  const id = await complete(s);
  callback.mockClear();
  s.provider.mockResolvedValueOnce(
    Response.json({ error: "unavailable" }, { status: 503 }),
  );
  await s.t.action(internal.assistantEventRuntime.deliver, { id });
  expect(callback).not.toHaveBeenCalled();
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "pending",
    attempts: 1,
  });
});
