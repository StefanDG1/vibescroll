import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function deletion(t: TestConvex<typeof schema>, key: string) {
  return t.run((ctx) =>
    ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
  );
}
async function scheduledDeletes(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      (job) => job.name === "integrations:deleteObject",
    ),
  );
}
async function lastDispatch(t: TestConvex<typeof schema>, key: string) {
  const jobs = (await scheduledDeletes(t)).filter(
    (job) => (job.args[0] as { key: string }).key === key,
  );
  return jobs.at(-1)!.args[0] as {
    key: string;
    attempt: number;
    reservedAt: number;
    recheck: boolean;
  };
}
it("only explicit late-PUT rechecks reopen a completed physical deletion", async () => {
  const t = convexTest(schema, modules),
    key = "synthetic-org/retired-object";
  await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  await t.mutation(internal.assets.deleteReceipt, await lastDispatch(t, key));
  await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  await t.run(async (ctx) => {
    const job = await ctx.db.query("objectDeletions").first();
    expect(job).toMatchObject({ state: "deleted", attempts: 1 });
    const scheduled = await ctx.db.system
      .query("_scheduled_functions")
      .collect();
    expect(
      scheduled.some(
        (j) =>
          j.name === "assets:recheckDeletion" &&
          j.scheduledTime >= Date.now() + 19 * 60000,
      ),
    ).toBe(true);
  });
  expect(await scheduledDeletes(t)).toHaveLength(1);
  await t.mutation(internal.assets.recheckDeletion, { key });
  expect(await deletion(t, key)).toMatchObject({
    state: "pending",
    attempts: 2,
  });
  expect(await scheduledDeletes(t)).toHaveLength(2);
});
it("repeated hourly sweeps exhaust normal attempts without resetting delayed rechecks", async () => {
  const t = convexTest(schema, modules),
    key = "synthetic-org/failed-deletion";
  await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  const original = await deletion(t, key);
  for (let i = 0; i < 12; i++) await t.mutation(internal.privacy.sweep, {});
  expect(await deletion(t, key)).toMatchObject({
    state: "failed",
    attempts: 3,
    rechecksScheduledAt: original?.rechecksScheduledAt,
  });
  expect(await scheduledDeletes(t)).toHaveLength(3);
  await t.run(async (ctx) => {
    expect(
      await ctx.db
        .query("objectDeletions")
        .withIndex("by_state", (q) => q.eq("state", "pending"))
        .collect(),
    ).toEqual([]);
    const rechecks = (
      await ctx.db.system.query("_scheduled_functions").collect()
    ).filter((job) => job.name === "assets:recheckDeletion");
    expect(rechecks).toHaveLength(2);
    expect(rechecks.map((job) => job.scheduledTime).sort()).toEqual([
      original!.rechecksScheduledAt! + 20 * 60000,
      original!.rechecksScheduledAt! + 86400000,
    ]);
  });
});
it("reserves two final dispatches after normal exhaustion and caps duplicate rechecks at five", async () => {
  const t = convexTest(schema, modules),
    key = "synthetic-org/delayed-rechecks";
  for (let i = 0; i < 10; i++)
    await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  expect(await scheduledDeletes(t)).toHaveLength(3);
  for (let i = 0; i < 10; i++) {
    await t.mutation(internal.assets.recheckDeletion, { key });
    await t.mutation(internal.assets.queueEvidenceDeletion, { key });
    await t.mutation(internal.privacy.sweep, {});
  }
  expect(await deletion(t, key)).toMatchObject({
    state: "failed",
    attempts: 5,
  });
  expect(await scheduledDeletes(t)).toHaveLength(5);
});
it("counts the usual initial, twenty-minute, hourly and final recheck ordering", async () => {
  const t = convexTest(schema, modules),
    key = "synthetic-org/ordered-rechecks";
  await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  await t.mutation(internal.assets.recheckDeletion, { key });
  await t.mutation(internal.privacy.sweep, {});
  expect(await deletion(t, key)).toMatchObject({
    state: "failed",
    attempts: 3,
  });
  await t.mutation(internal.assets.recheckDeletion, { key });
  expect(await deletion(t, key)).toMatchObject({
    state: "failed",
    attempts: 4,
  });
  expect(await scheduledDeletes(t)).toHaveLength(4);
});
it.each([-1, 5, 9])(
  "does not reset a legacy deletion counter of %s to gain more attempts",
  async (attempts) => {
    const t = convexTest(schema, modules),
      key = "synthetic-org/legacy-attempts";
    await t.run((ctx) =>
      ctx.db.insert("objectDeletions", {
        key,
        state: "pending",
        attempts,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.mutation(internal.privacy.sweep, {});
    await t.mutation(internal.assets.recheckDeletion, { key });
    expect(await deletion(t, key)).toMatchObject({ state: "failed", attempts });
    expect(await scheduledDeletes(t)).toHaveLength(0);
  },
);
it("records physical deletion only after the storage DELETE succeeds", async () => {
  const t = convexTest(schema, modules),
    key = "synthetic-org/storage-receipt";
  vi.stubEnv("R2_ENDPOINT", "https://synthetic.eu.r2.cloudflarestorage.com");
  vi.stubEnv("R2_BUCKET", "synthetic-retirement");
  vi.stubEnv("R2_ACCESS_KEY_ID", "synthetic-retirement-key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "synthetic-retirement-secret");
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  await expect(
    t.action(internal.integrations.deleteObject, await lastDispatch(t, key)),
  ).rejects.toThrow("STORAGE_UNAVAILABLE");
  expect(await deletion(t, key)).toMatchObject({
    state: "pending",
    attempts: 1,
  });
  expect(
    await t.run((ctx) => ctx.db.query("webhookReceipts").collect()),
  ).toEqual([]);
  await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  await t.action(
    internal.integrations.deleteObject,
    await lastDispatch(t, key),
  );
  expect(await deletion(t, key)).toMatchObject({
    state: "deleted",
    attempts: 2,
  });
  expect(
    await t.run((ctx) => ctx.db.query("webhookReceipts").collect()),
  ).toEqual([
    expect.objectContaining({
      provider: "object_deletion",
      key,
      state: "deleted",
    }),
  ]);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [, init] of fetch.mock.calls) expect(init?.method).toBe("DELETE");
});
it.each(["pending", "failed", "deleted", "deferred", "deferred_recheck"])(
  "never reuses a %s retired upload or evidence key for a new source",
  async (state) => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    await t.mutation(internal.accounts.syncUser, {
      subject: "synthetic-retirement",
      email: "retirement@example.test",
      name: "Synthetic",
    });
    const user = t.withIdentity({ subject: "synthetic-retirement" }),
      organizationId = await user.mutation(api.organizations.create, {
        name: "Synthetic retirement",
      });
    const key = organizationId + "/retired-frame";
    if (state.startsWith("deferred")) vi.stubEnv("RESTORE_LOCK", "true");
    await t.mutation(internal.assets.queueEvidenceDeletion, { key });
    if (state === "failed") {
      await t.mutation(internal.assets.queueEvidenceDeletion, { key });
      await t.mutation(internal.assets.queueEvidenceDeletion, { key });
    } else if (state === "deleted")
      await t.mutation(
        internal.assets.deleteReceipt,
        await lastDispatch(t, key),
      );
    else if (state === "deferred_recheck")
      await t.mutation(internal.assets.recheckDeletion, { key });
    vi.stubEnv("RESTORE_LOCK", "false");
    await expect(
      user.mutation(api.assets.grant, {
        organizationId,
        key,
        size: 32,
        type: "video/mp4",
      }),
    ).rejects.toThrow("Retired upload keys");
    const sourceId = await user.mutation(api.product.capture, {
      organizationId,
      key: "synthetic-capture-retirement",
      kind: "text",
      title: "Synthetic new source",
      text: "Synthetic test content",
      rightsAttested: true,
    });
    expect(
      await t.mutation(internal.assets.registerEvidence, {
        sourceId,
        generation: 0,
        key,
        size: 32,
        etag: "synthetic",
      }),
    ).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("assets").collect())).toEqual([]);
    expect(
      await t.run(
        async (ctx) => (await ctx.db.query("objectDeletions").first())?.state,
      ),
    ).toBe(state.startsWith("deferred") ? "pending" : state);
  },
);

it("preserves both late-PUT rechecks through a restore lock without consuming DELETE attempts", async () => {
  const t = convexTest(schema, modules),
    key = "synthetic-org/locked-retirement";
  vi.stubEnv("RESTORE_LOCK", "true");
  await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  const original = await deletion(t, key);
  expect(original).toMatchObject({ state: "deferred", attempts: 0 });
  vi.setSystemTime(Date.now() + 20 * 60000);
  await t.mutation(internal.assets.recheckDeletion, { key });
  vi.setSystemTime(Date.now() + 86400000);
  await t.mutation(internal.assets.recheckDeletion, { key });
  await t.mutation(internal.privacy.sweep, {});
  expect(await scheduledDeletes(t)).toHaveLength(0);
  expect(await deletion(t, key)).toMatchObject({
    state: "deferred_recheck",
    attempts: 0,
    rechecksScheduledAt: original!.rechecksScheduledAt,
  });
  vi.stubEnv("RESTORE_LOCK", "false");
  await t.mutation(internal.privacy.sweep, {});
  expect(await scheduledDeletes(t)).toHaveLength(1);
  expect(await deletion(t, key)).toMatchObject({
    state: "pending",
    attempts: 1,
  });
});

it("counts a locked dispatch and resumes only its remaining late-PUT slot after unlock", async () => {
  const t = convexTest(schema, modules),
    key = "synthetic-org/lock-after-reservation";
  vi.stubEnv("R2_ENDPOINT", "https://synthetic.eu.r2.cloudflarestorage.com");
  vi.stubEnv("R2_BUCKET", "synthetic-retirement");
  vi.stubEnv("R2_ACCESS_KEY_ID", "synthetic-retirement-key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "synthetic-retirement-secret");
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 204 }));
  for (let i = 0; i < 3; i++)
    await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  const earlier = await lastDispatch(t, key);
  await t.mutation(internal.assets.recheckDeletion, { key });
  const skipped = await lastDispatch(t, key);
  expect(await deletion(t, key)).toMatchObject({
    state: "failed",
    attempts: 4,
  });
  vi.stubEnv("RESTORE_LOCK", "true");
  await t.action(internal.integrations.deleteObject, skipped);
  expect(fetch).not.toHaveBeenCalled();
  expect(await deletion(t, key)).toMatchObject({
    state: "deferred_recheck",
    attempts: 4,
  });
  vi.stubEnv("RESTORE_LOCK", "false");
  await t.mutation(internal.privacy.sweep, {});
  const resumed = await lastDispatch(t, key);
  expect(resumed.attempt).toBe(5);
  expect(resumed.reservedAt).toBeGreaterThan(skipped.reservedAt);
  await t.mutation(internal.assets.deferDeletion, skipped);
  await t.mutation(internal.assets.deleteReceipt, earlier);
  expect(await deletion(t, key)).toMatchObject({
    state: "failed",
    attempts: 5,
    updatedAt: resumed.reservedAt,
  });
  await t.action(internal.integrations.deleteObject, resumed);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await deletion(t, key)).toMatchObject({
    state: "deleted",
    attempts: 5,
  });
  await t.mutation(internal.privacy.sweep, {});
  expect(await scheduledDeletes(t)).toHaveLength(5);
});

it("exhausts at five scheduled actions even when every dispatch races a restore lock", async () => {
  const t = convexTest(schema, modules),
    key = "synthetic-org/repeated-lock-races";
  const fetch = vi.spyOn(globalThis, "fetch");
  await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  for (let attempt = 1; attempt <= 5; attempt++) {
    const dispatched = await lastDispatch(t, key);
    expect(dispatched.attempt).toBe(attempt);
    vi.stubEnv("RESTORE_LOCK", "true");
    await t.action(internal.integrations.deleteObject, dispatched);
    expect((await deletion(t, key))!.attempts).toBe(attempt);
    vi.stubEnv("RESTORE_LOCK", "false");
    await t.mutation(internal.privacy.sweep, {});
    if (attempt === 3) {
      expect(await scheduledDeletes(t)).toHaveLength(3);
      await t.mutation(internal.assets.recheckDeletion, { key });
    }
  }
  for (let i = 0; i < 10; i++) {
    await t.mutation(internal.privacy.sweep, {});
    await t.mutation(internal.assets.recheckDeletion, { key });
    await t.mutation(internal.assets.queueEvidenceDeletion, { key });
  }
  expect(await deletion(t, key)).toMatchObject({
    state: "failed",
    attempts: 5,
  });
  expect(await scheduledDeletes(t)).toHaveLength(5);
  expect(fetch).not.toHaveBeenCalled();
  expect(
    await t.run((ctx) => ctx.db.query("webhookReceipts").collect()),
  ).toEqual([]);
});
