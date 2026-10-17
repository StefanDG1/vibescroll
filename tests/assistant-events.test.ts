import { afterEach, expect, it, vi } from "vitest";

import { api, internal } from "../convex/_generated/api";
import {
  queueSourceCompletion,
  eventSubscriptionCurrent,
} from "../convex/lib/assistantEvents";
import fixture from "../fixtures/insight.json";

const issuer = "https://synthetic-test.authkit.app",
  clientId = "client_01234567890123456789012345",
  subject = "user_01234567890123456789012345";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
import { setup } from "./assistant-event-fixture";

async function selected(untilRevoked = false) {
  const s = await setup();
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    expiresAt: untilRevoked ? null : s.args.expiresAt,
    scopes: ["events:subscribe"],
  });
  const input = {
    profileId: s.organizationId,
    sourceId: s.sourceId,
    generation: s.args.sources[0].generation,
    grantVersion: grant.version,
    externalId: "sub_" + "a".repeat(64),
    ciphertext: "synthetic-encrypted-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  };
  const result = await s.assistant.mutation(
    internal.assistantEvents.install,
    input,
  );
  const subscription = (await s.t.run((ctx) =>
    ctx.db.query("assistantSubscriptions").first(),
  ))!;
  return { ...s, grant, input, result, subscription };
}
it("keeps completion subscriptions finite and revocable under a grant until revoked", async () => {
  const s = await selected(true);
  expect(
    await s.t.run((ctx) => eventSubscriptionCurrent(ctx, s.subscription)),
  ).toBe(true);
  await expect(
    s.assistant.mutation(internal.assistantEvents.install, {
      ...s.input,
      expiresAt: Date.now() + 1900000,
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: s.grant.id,
    expectedVersion: 1,
  });
  expect(
    await s.t.run((ctx) => eventSubscriptionCurrent(ctx, s.subscription)),
  ).toBe(false);
});
async function ready(s: Awaited<ReturnType<typeof selected>>) {
  return s.t.run(async (ctx) => {
    const before = (await ctx.db.get(s.sourceId))!;
    await ctx.db.patch(s.sourceId, {
      state: "ready",
      updatedAt: before.updatedAt + 1,
    });
    const after = (await ctx.db.get(s.sourceId))!;
    const ids = await queueSourceCompletion(ctx, after, before);
    return { before, after, ids };
  });
}
it("rechecks live Personal scope before subscription and delivery, including filing removal", async () => {
  const s = await setup();
  await s.owner.mutation(api.librarySpaces.fileSource, {
    organizationId: s.organizationId,
    sourceId: s.sourceId,
    spaces: ["personal"],
  });
  const grant = await s.owner.mutation(api.assistantGrants.save, {
    ...s.args,
    sources: [],
    libraryScope: "personal",
    scopes: ["events:subscribe"],
  });
  const input = {
    profileId: s.organizationId,
    sourceId: s.sourceId,
    generation: s.args.sources[0].generation,
    grantVersion: grant.version,
    externalId: "sub_" + "b".repeat(64),
    ciphertext: "synthetic-encrypted-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  };
  await s.assistant.mutation(internal.assistantEvents.install, input);
  const subscription = (await s.t.run((ctx) =>
    ctx.db.query("assistantSubscriptions").first(),
  ))!;
  expect(
    await s.t.run((ctx) => eventSubscriptionCurrent(ctx, subscription)),
  ).toBe(true);
  await s.owner.mutation(api.librarySpaces.fileSource, {
    organizationId: s.organizationId,
    sourceId: s.sourceId,
    spaces: ["business"],
  });
  expect(
    await s.t.run((ctx) => eventSubscriptionCurrent(ctx, subscription)),
  ).toBe(false);
  await expect(
    s.assistant.mutation(internal.assistantEvents.install, input),
  ).rejects.toThrow("FORBIDDEN");
});
it("bounds renewable ownership and source authority, updates one subscription, and never replays a ready source", async () => {
  const s = await selected();
  expect(s.result).toMatchObject({
    id: s.input.externalId,
    cursor: null,
    truncated: false,
  });
  expect(s.result.refreshBefore).toBe(
    new Date(s.input.expiresAt).toISOString(),
  );
  await s.assistant.mutation(internal.assistantEvents.install, s.input);
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantSubscriptions").collect()),
  ).toHaveLength(1);
  const { before, after, ids } = await ready(s);
  expect(ids).toHaveLength(1);
  expect(
    await s.t.run((ctx) => queueSourceCompletion(ctx, after, before)),
  ).toEqual([]);
  expect(
    await s.t.run((ctx) => queueSourceCompletion(ctx, after, after)),
  ).toEqual([]);
  const claimed = await s.t.mutation(internal.assistantEvents.claim, {
    id: ids[0],
  });
  expect(claimed?.delivery.attempts).toBe(1);
  expect(
    await s.t.mutation(internal.assistantEvents.claim, { id: ids[0] }),
  ).toBeNull();
  await expect(
    s.assistant.mutation(internal.assistantEvents.install, {
      ...s.input,
      grantVersion: 2,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.assistant.mutation(internal.assistantEvents.install, {
      ...s.input,
      expiresAt: Date.now() + 1900000,
    }),
  ).rejects.toThrow("INVALID_INPUT");
  const foreign = s.t.withIdentity({
    subject,
    issuer,
    client_id: clientId,
    scope: "events:subscribe",
    sid: "app_consent_99999999999999999999999999",
  });
  await expect(
    foreign.mutation(internal.assistantEvents.unsubscribe, {
      subscriptionId: s.input.externalId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.assistant.mutation(internal.assistantEvents.unsubscribe, {
    subscriptionId: s.input.externalId,
  });
  expect(
    await s.t.query(internal.assistantEvents.deliveryCurrent, {
      id: ids[0],
      lease: claimed!.delivery.lease,
    }),
  ).toBe(false);
  const cancelled = (await s.t.run((ctx) => ctx.db.get(s.subscription._id)))!;
  expect(cancelled.ciphertext).toBe("");
  await s.assistant.mutation(internal.assistantEvents.unsubscribe, {
    subscriptionId: s.input.externalId,
  });
});
it("queues completion atomically through the existing analysis mutation, with no extra inference or duplicate delivery", async () => {
  const s = await selected();
  const output = {
    ...fixture,
    sourceId: s.sourceId,
    processingRunId: `${s.sourceId}:${s.input.generation}`,
    coverage: "caption_only",
    insights: fixture.insights.map((i) => ({
      ...i,
      evidence: [
        { kind: "user_note", id: "supplied_text", startMs: null, endMs: null },
      ],
    })),
  };
  await s.t.mutation(internal.product.commitAnalysis, {
    id: s.sourceId,
    generation: s.input.generation,
    output,
    credits: 0,
  });
  await s.t.mutation(internal.product.commitAnalysis, {
    id: s.sourceId,
    generation: s.input.generation,
    output,
    credits: 0,
  });
  const deliveries = await s.t.run((ctx) =>
    ctx.db.query("assistantDeliveries").collect(),
  );
  expect(deliveries).toHaveLength(1);
  expect(JSON.stringify(deliveries)).not.toContain("PRIVATE transcript");
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    jobs.some((j) => j.name.includes("assistantEventRuntime:deliver")),
  ).toBe(true);
});
it("preserves one logical event across bounded retries and interrupted leases, and distinguishes received from processed", async () => {
  const s = await selected();
  const { ids } = await ready(s);
  const id = ids[0];
  let c = (await s.t.mutation(internal.assistantEvents.claim, { id }))!;
  await expect(
    s.t.mutation(internal.assistantEvents.finish, {
      id,
      lease: c.delivery.lease,
      outcome: "received",
      status: 503,
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await s.t.mutation(internal.assistantEvents.finish, {
    id,
    lease: c.delivery.lease,
    outcome: "retry",
    status: 503,
  });
  let d = (await s.t.run((ctx) => ctx.db.get(id)))!;
  expect(d).toMatchObject({ state: "pending", attempts: 1, httpStatus: 503 });
  expect(d.dueAt - d.updatedAt).toBe(5000);
  expect(await s.t.mutation(internal.assistantEvents.claim, { id })).toBeNull();
  await s.t.run((ctx) => ctx.db.patch(id, { dueAt: Date.now() - 1 }));
  c = (await s.t.mutation(internal.assistantEvents.claim, { id }))!;
  await s.t.run((ctx) =>
    ctx.db.patch(id, { dueAt: Date.now() - 1, leaseUntil: Date.now() - 1 }),
  );
  await s.t.mutation(internal.assistantEvents.recover, {});
  d = (await s.t.run((ctx) => ctx.db.get(id)))!;
  expect(d.state).toBe("pending");
  const stale = c.delivery.lease;
  c = (await s.t.mutation(internal.assistantEvents.claim, { id }))!;
  expect(c.delivery.lease).not.toBe(stale);
  await s.t.mutation(internal.assistantEvents.finish, {
    id,
    lease: stale,
    outcome: "received",
    status: 204,
  });
  expect((await s.t.run((ctx) => ctx.db.get(id)))?.state).toBe("delivering");
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: s.grant.id,
    expectedVersion: 1,
  });
  expect(
    await s.t.query(internal.assistantEvents.deliveryCurrent, {
      id,
      lease: c.delivery.lease,
    }),
  ).toBe(false);
  // A transmission already observed as accepted remains a receipt even if access was revoked afterwards.
  await s.t.mutation(internal.assistantEvents.finish, {
    id,
    lease: c.delivery.lease,
    outcome: "received",
    status: 204,
  });
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "delivered",
    httpStatus: 204,
  });
});
it("denies revoked grants, missing membership, generation/rights changes, expiry, disabled access and restore authority", async () => {
  const s = await selected();
  const current = () =>
    s.t.run(async (ctx) =>
      eventSubscriptionCurrent(ctx, (await ctx.db.get(s.subscription._id))!),
    );
  expect(await current()).toBe(true);
  for (const flag of ["RESTORE_LOCK", "MCP_ENABLED", "MCP_EVENTS_ENABLED"]) {
    vi.stubEnv(flag, flag === "RESTORE_LOCK" ? "true" : "false");
    expect(await current()).toBe(false);
    vi.stubEnv(flag, flag === "RESTORE_LOCK" ? "false" : "true");
  }
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  expect(await current()).toBe(false);
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      rightsAttested: true,
      generation: s.input.generation + 1,
    }),
  );
  expect(await current()).toBe(false);
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { generation: s.input.generation }),
  );
  await s.t.run(async (ctx) => {
    const m = (await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", s.organizationId)
          .eq("userId", s.subscription.actor),
      )
      .unique())!;
    await ctx.db.delete(m._id);
  });
  expect(await current()).toBe(false);
  await s.t.mutation(internal.assistantEvents.expire, {
    id: s.subscription._id,
  });
  expect(await s.t.run((ctx) => ctx.db.get(s.subscription._id))).toBeNull();
});
it("rejects forged HTTP provider identity before catalog access and never accepts plaintext credentials", async () => {
  const s = await selected();
  const provider = vi.fn(async () => Response.json({ sub: subject }));
  vi.stubGlobal("fetch", provider);
  const request = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer synthetic-header-only-bearer",
    },
    body: JSON.stringify({ operation: "events/list", args: {} }),
  };
  expect((await s.assistant.fetch("/assistant-events", request)).status).toBe(
    200,
  );
  provider.mockResolvedValueOnce(
    Response.json({ sub: "user_99999999999999999999999999" }),
  );
  expect((await s.assistant.fetch("/assistant-events", request)).status).toBe(
    401,
  );
  const invalid = {
    ...request,
    body: JSON.stringify({
      operation: "events/subscribe",
      args: {
        ...s.input,
        token: "plaintext",
        secret: "plaintext",
        callback: "https://receiver.example",
      },
    }),
  };
  expect((await s.assistant.fetch("/assistant-events", invalid)).status).toBe(
    403,
  );
  expect(provider).toHaveBeenCalledTimes(2);
});

it("expires authority and rotation ciphertext, caps five attempts, and quarantines restored assistant records", async () => {
  const s = await selected();
  await s.assistant.mutation(internal.assistantEvents.install, s.input);
  await s.t.run((ctx) =>
    ctx.db.patch(s.subscription._id, {
      previousSecretExpiresAt: Date.now() - 1,
    }),
  );
  await s.t.mutation(internal.assistantEvents.expirePrevious, {
    id: s.subscription._id,
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.subscription._id)))
      ?.previousCiphertext,
  ).toBeUndefined();
  const { ids } = await ready(s),
    id = ids[0];
  for (let n = 1; n <= 5; n++) {
    await s.t.run((ctx) => ctx.db.patch(id, { dueAt: Date.now() - 1 }));
    const c = (await s.t.mutation(internal.assistantEvents.claim, { id }))!;
    await s.t.mutation(internal.assistantEvents.finish, {
      id,
      lease: c.delivery.lease,
      outcome: "retry",
      status: 503,
    });
  }
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "failed",
    attempts: 5,
  });
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    (await s.t.query(internal.recovery.readiness, {})).quarantineComplete,
  ).toBe(false);
  for (const section of [
    "assistantSubscriptions",
    "assistantDeliveries",
    "assistantGrants",
    "assistantIntakes",
  ] as const)
    await s.t.mutation(internal.recovery.quarantinePage, {
      section,
      cursor: null,
    });
  expect(
    (await s.t.query(internal.recovery.readiness, {})).quarantineComplete,
  ).toBe(true);
  expect(
    await s.t.run((ctx) => ctx.db.query("assistantSubscriptions").collect()),
  ).toEqual([]);
});
