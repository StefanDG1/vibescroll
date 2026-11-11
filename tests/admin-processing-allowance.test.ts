import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { requireProCatalogAccess } from "../convex/lib/catalogEntitlement";
import {
  adminProcessingAllowancePeriod,
  parseAdminProcessingAllowanceConfiguration,
  readAdminProcessingAllowance,
  refreshAdminProcessingAllowance,
} from "../convex/lib/adminProcessingAllowance";

const modules = import.meta.glob("../convex/**/*.ts");
const ensureAllowance = makeFunctionReference<
  "mutation",
  { organizationId: Id<"organizations"> },
  boolean
>("adminProcessingAllowance:ensure");
const renewAllowance = makeFunctionReference<
  "mutation",
  { organizationId: Id<"organizations"> },
  boolean
>("adminProcessingAllowance:renew");
const now = Date.UTC(2026, 10, 30, 23, 59, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("RESTORE_LOCK", "false");
  vi.stubEnv("ADMIN_PROCESSING_ALLOWANCE_JSON", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      subject: "allowance-owner",
      email: "allowance-owner@example.test",
      name: "Owner",
      status: "active",
      createdAt: now,
    });
    const otherOwner = await ctx.db.insert("users", {
      subject: "another-owner",
      email: "another-owner@example.test",
      name: "Another owner",
      status: "active",
      createdAt: now,
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Personal",
      createdBy: owner,
      privateOwnerId: owner,
      status: "active",
      createdAt: now,
    });
    const foreignOrganizationId = await ctx.db.insert("organizations", {
      name: "Other",
      createdBy: otherOwner,
      status: "active",
      createdAt: now,
    });
    const membership = await ctx.db.insert("memberships", {
      organizationId,
      userId: owner,
      role: "owner",
    });
    await ctx.db.insert("memberships", {
      organizationId: foreignOrganizationId,
      userId: owner,
      role: "admin",
    });
    const wallet = await ctx.db.insert("wallets", {
      organizationId,
      granted: 1000,
      purchased: 50,
      spent: 70,
      reserved: 80,
      tier: "trial",
      interval: "trial",
      periodEnd: now + 90 * 86400000,
      createdAt: now - 1000,
      updatedAt: now - 1000,
    });
    const legacyPool = await ctx.db.insert("creditPools", {
      organizationId,
      key: "retained-legacy-credits",
      kind: "included",
      granted: 1000,
      spent: 70,
      reserved: 80,
      expiresAt: now + 90 * 86400000,
      createdAt: now - 1000,
      updatedAt: now - 1000,
    });
    const unknownHold = await ctx.db.insert("reservations", {
      organizationId,
      key: "unknown-dispatch-hold",
      state: "active",
      max: 80,
      settled: 0,
      dispatchedAt: now - 1000,
      expiresAt: now - 1,
      allocations: [{ poolId: legacyPool, credits: 80 }],
      createdAt: now - 1000,
      updatedAt: now - 1000,
    });
    const billing = await ctx.db.insert("billing", {
      organizationId,
      customerId: "synthetic-retained-customer",
      status: "free",
      revision: 7,
      periodEnd: now + 123456,
      verifiedAt: now - 1000,
    });
    return {
      owner,
      otherOwner,
      organizationId,
      foreignOrganizationId,
      membership,
      wallet,
      legacyPool,
      unknownHold,
      billing,
    };
  });
  const config = {
    version: "admin-processing-allowance-v1",
    id: "synthetic-admin-allowance",
    enabled: true,
    subject: "allowance-owner",
    organizationId: ids.organizationId,
    monthlyCredits: 300,
    maximumHourlyJobs: 20,
    maximumDailyJobs: 100,
    startsAt: now - 1000,
  };
  vi.stubEnv("ADMIN_PROCESSING_ALLOWANCE_JSON", JSON.stringify(config));
  const snapshot = () =>
    t.run(async (ctx) => ({
      wallet: await ctx.db.get(ids.wallet),
      pools: await ctx.db.query("creditPools").collect(),
      hold: await ctx.db.get(ids.unknownHold),
      billing: await ctx.db.get(ids.billing),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
  return { t, ...ids, config, snapshot };
}

it("reads configured authority without granting or scheduling credits", async () => {
  const s = await setup();
  const before = await s.snapshot();
  expect(
    await s.t.query(async (ctx) =>
      readAdminProcessingAllowance(
        ctx,
        (await ctx.db.get(s.owner))!,
        s.organizationId,
      ),
    ),
  ).toEqual(s.config);
  expect(await s.snapshot()).toEqual(before);
});

it("grants ordinary catalog entitlement to the exact configured admin after trial expiry without alpha or Stripe", async () => {
  const s = await setup();
  vi.stubEnv("CLOUD_CATALOG_ALPHA_ACCESS_JSON", "");
  await s.t.run(async (ctx) => {
    await ctx.db.delete(s.billing);
    await ctx.db.patch(s.wallet, { periodEnd: now - 1 });
    await ctx.db.patch(s.legacyPool, { expiresAt: now - 1 });
    await ctx.db.insert("memberships", {
      organizationId: s.foreignOrganizationId,
      userId: s.otherOwner,
      role: "owner",
    });
  });
  const before = await s.snapshot();
  expect(
    await s.t.query((ctx) => requireProCatalogAccess(ctx, s.organizationId)),
  ).toBeNull();
  await expect(
    s.t.query((ctx) => requireProCatalogAccess(ctx, s.foreignOrganizationId)),
  ).rejects.toThrow("FORBIDDEN");
  expect(await s.snapshot()).toEqual(before);
  // Owning the workspace is insufficient once its explicit admin policy is
  // absent. The catalog read cannot manufacture a paid entitlement or grant.
  vi.stubEnv("ADMIN_PROCESSING_ALLOWANCE_JSON", "");
  await expect(
    s.t.query((ctx) => requireProCatalogAccess(ctx, s.organizationId)),
  ).rejects.toThrow("FORBIDDEN");
  expect(await s.snapshot()).toEqual(before);
});

it("never treats the configured admin allowance as verified paid-only catalog access", async () => {
  const s = await setup();
  vi.stubEnv("CLOUD_CATALOG_ALPHA_ACCESS_JSON", "");
  await s.t.run(async (ctx) => {
    await ctx.db.delete(s.billing);
    await ctx.db.patch(s.wallet, { periodEnd: now - 1 });
  });
  const before = await s.snapshot();
  await expect(
    s.t.query((ctx) => requireProCatalogAccess(ctx, s.organizationId, true)),
  ).rejects.toThrow("FORBIDDEN");
  expect(await s.snapshot()).toEqual(before);
});

it("grants one current monthly pool while preserving legacy credits, holds and billing", async () => {
  const s = await setup();
  const before = await s.snapshot();
  expect(
    await s.t.mutation(ensureAllowance, { organizationId: s.organizationId }),
  ).toBe(true);
  const after = await s.snapshot();
  expect(after.wallet).toEqual({
    ...before.wallet,
    granted: 1300,
    updatedAt: now,
  });
  expect(after.hold).toEqual(before.hold);
  expect(after.billing).toEqual(before.billing);
  expect(after.pools.find((pool) => pool._id === s.legacyPool)).toEqual(
    before.pools[0],
  );
  expect(after.pools.filter((pool) => pool.kind === "admin_monthly")).toEqual([
    expect.objectContaining({
      key: `admin-monthly:${s.organizationId}:2026-11`,
      granted: 300,
      spent: 0,
      reserved: 0,
      expiresAt: Date.UTC(2026, 11, 1),
    }),
  ]);
  expect(after.scheduled).toEqual([
    expect.objectContaining({
      name: "adminProcessingAllowance:renew",
      args: [{ organizationId: s.organizationId }],
      scheduledTime: Date.UTC(2026, 11, 1),
    }),
  ]);
});

it("deduplicates concurrent starts, replay and policy-id changes in the same month", async () => {
  const s = await setup();
  const outcomes = await Promise.all(
    Array.from({ length: 8 }, () =>
      s.t.mutation(ensureAllowance, { organizationId: s.organizationId }),
    ),
  );
  expect(outcomes.filter(Boolean)).toHaveLength(1);
  const before = await s.snapshot();
  vi.stubEnv(
    "ADMIN_PROCESSING_ALLOWANCE_JSON",
    JSON.stringify({ ...s.config, id: "edited-policy-id" }),
  );
  expect(
    await s.t.mutation(renewAllowance, { organizationId: s.organizationId }),
  ).toBe(false);
  expect(await s.snapshot()).toEqual(before);
});

it.each([
  [
    Date.UTC(2026, 10, 30, 23, 59, 59, 999),
    "2026-11",
    Date.UTC(2026, 10, 1),
    Date.UTC(2026, 11, 1),
  ],
  [
    Date.UTC(2026, 11, 1),
    "2026-12",
    Date.UTC(2026, 11, 1),
    Date.UTC(2027, 0, 1),
  ],
  [
    Date.UTC(2028, 1, 29, 23, 59, 59, 999),
    "2028-02",
    Date.UTC(2028, 1, 1),
    Date.UTC(2028, 2, 1),
  ],
  [Date.UTC(2028, 2, 1), "2028-03", Date.UTC(2028, 2, 1), Date.UTC(2028, 3, 1)],
  [
    Date.UTC(2026, 11, 31, 23, 59, 59, 999),
    "2026-12",
    Date.UTC(2026, 11, 1),
    Date.UTC(2027, 0, 1),
  ],
  [Date.UTC(2027, 0, 1), "2027-01", Date.UTC(2027, 0, 1), Date.UTC(2027, 1, 1)],
])("uses exact UTC calendar boundaries at %s", (time, keymonth, start, end) => {
  expect(adminProcessingAllowancePeriod(time as number)).toEqual({
    start,
    end,
    keymonth,
  });
});

it.each([
  [now, "2026-12", Date.UTC(2027, 0, 1)],
  [Date.UTC(2028, 1, 29, 23, 59), "2028-03", Date.UTC(2028, 3, 1)],
  [Date.UTC(2026, 11, 31, 23, 59), "2027-01", Date.UTC(2027, 1, 1)],
])(
  "renews at calendar boundary %s without changing expired pools or holds",
  async (time, nextMonth, nextExpiry) => {
    const s = await setup();
    vi.setSystemTime(time as number);
    await s.t.mutation(ensureAllowance, { organizationId: s.organizationId });
    const incumbent = (await s.snapshot()).pools.find(
      (pool) => pool.kind === "admin_monthly",
    )!;
    await s.t.run(async (ctx) => {
      await ctx.db.patch(incumbent._id, { spent: 40, reserved: 60 });
      await ctx.db.insert("reservations", {
        organizationId: s.organizationId,
        key: "unknown-admin-dispatch",
        state: "active",
        max: 60,
        settled: 0,
        dispatchedAt: Date.now(),
        expiresAt: Date.now() - 1,
        allocations: [{ poolId: incumbent._id, credits: 60 }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(s.wallet, { spent: 110, reserved: 140 });
    });
    const beforePool = await s.t.run((ctx) => ctx.db.get(incumbent._id));
    const beforeHolds = await s.t.run((ctx) =>
      ctx.db.query("reservations").collect(),
    );
    await vi.advanceTimersByTimeAsync(60000);
    await s.t.finishInProgressScheduledFunctions();
    const after = await s.snapshot();
    expect(after.wallet?.granted).toBe(1600);
    expect(after.wallet).toMatchObject({ spent: 110, reserved: 140 });
    expect(after.pools.find((pool) => pool._id === incumbent._id)).toEqual(
      beforePool,
    );
    expect(
      await s.t.run((ctx) => ctx.db.query("reservations").collect()),
    ).toEqual(beforeHolds);
    expect(after.pools.filter((pool) => pool.kind === "admin_monthly")).toEqual(
      [
        beforePool,
        expect.objectContaining({
          organizationId: s.organizationId,
          key: `admin-monthly:${s.organizationId}:${nextMonth}`,
          expiresAt: nextExpiry,
        }),
      ],
    );
    expect(
      after.scheduled.filter((job) => job.state.kind === "pending"),
    ).toEqual([
      expect.objectContaining({
        args: [{ organizationId: s.organizationId }],
        scheduledTime: nextExpiry,
      }),
    ]);
  },
);

it("grants only the current month after missed periods", async () => {
  const s = await setup();
  await s.t.mutation(ensureAllowance, { organizationId: s.organizationId });
  vi.setSystemTime(Date.UTC(2027, 2, 15));
  expect(
    await s.t.mutation(renewAllowance, { organizationId: s.organizationId }),
  ).toBe(true);
  const after = await s.snapshot();
  expect(after.wallet?.granted).toBe(1600);
  expect(
    after.pools
      .filter((pool) => pool.kind === "admin_monthly")
      .map((pool) => pool.key),
  ).toEqual([
    `admin-monthly:${s.organizationId}:2026-11`,
    `admin-monthly:${s.organizationId}:2027-03`,
  ]);
});

it.each(["", "null", "{", "[]"])(
  "fails closed for absent or malformed configuration %s",
  async (raw) => {
    const s = await setup();
    vi.stubEnv("ADMIN_PROCESSING_ALLOWANCE_JSON", raw);
    const before = await s.snapshot();
    expect(
      await s.t.mutation(ensureAllowance, { organizationId: s.organizationId }),
    ).toBe(false);
    expect(await s.snapshot()).toEqual(before);
  },
);

it.each([
  { enabled: false },
  { monthlyCredits: 301 },
  { maximumHourlyJobs: 21 },
  { maximumDailyJobs: 101 },
  { startsAt: -1 },
  { startsAt: 1.5 },
  { id: "" },
  { unexpectedAuthority: true },
])("rejects policy expansion or malformed fields %j", async (patch) => {
  const s = await setup();
  expect(
    parseAdminProcessingAllowanceConfiguration(
      JSON.stringify({ ...s.config, ...patch }),
    ),
  ).toBeNull();
});

it("does not activate before startsAt or without an existing wallet", async () => {
  const s = await setup();
  vi.stubEnv(
    "ADMIN_PROCESSING_ALLOWANCE_JSON",
    JSON.stringify({ ...s.config, startsAt: now + 1 }),
  );
  expect(
    await s.t.mutation(ensureAllowance, { organizationId: s.organizationId }),
  ).toBe(false);
  vi.stubEnv("ADMIN_PROCESSING_ALLOWANCE_JSON", JSON.stringify(s.config));
  await s.t.run((ctx) => ctx.db.delete(s.wallet));
  expect(
    await s.t.mutation(ensureAllowance, { organizationId: s.organizationId }),
  ).toBe(false);
  expect((await s.snapshot()).pools).toHaveLength(1);
});

it("rejects foreign workspace reads and grants despite an admin membership", async () => {
  const s = await setup();
  const before = await s.snapshot();
  expect(
    await s.t.query(async (ctx) =>
      readAdminProcessingAllowance(
        ctx,
        (await ctx.db.get(s.owner))!,
        s.foreignOrganizationId,
      ),
    ),
  ).toBeNull();
  expect(
    await s.t.mutation(ensureAllowance, {
      organizationId: s.foreignOrganizationId,
    }),
  ).toBe(false);
  expect(
    await s.t.query(async (ctx) =>
      readAdminProcessingAllowance(ctx, (await ctx.db.get(s.otherOwner))!),
    ),
  ).toBeNull();
  vi.stubEnv(
    "ADMIN_PROCESSING_ALLOWANCE_JSON",
    JSON.stringify({ ...s.config, organizationId: s.foreignOrganizationId }),
  );
  expect(
    await s.t.mutation(ensureAllowance, {
      organizationId: s.foreignOrganizationId,
    }),
  ).toBe(false);
  expect(await s.snapshot()).toEqual(before);
});

it.each([
  "configuration",
  "owner",
  "deleted-owner",
  "membership",
  "organization",
  "restore-lock",
])(
  "rechecks %s before scheduled renewal and keeps all prior credits and holds",
  async (revoked) => {
    const s = await setup();
    await s.t.mutation(ensureAllowance, { organizationId: s.organizationId });
    if (revoked === "configuration")
      vi.stubEnv("ADMIN_PROCESSING_ALLOWANCE_JSON", "");
    if (revoked === "restore-lock") vi.stubEnv("RESTORE_LOCK", "true");
    await s.t.run(async (ctx) => {
      if (revoked === "owner")
        await ctx.db.patch(s.owner, { status: "deleting" });
      if (revoked === "deleted-owner") await ctx.db.delete(s.owner);
      if (revoked === "membership") await ctx.db.delete(s.membership);
      if (revoked === "organization")
        await ctx.db.patch(s.organizationId, { status: "deleting" });
    });
    const before = await s.snapshot();
    await vi.advanceTimersByTimeAsync(60000);
    await s.t.finishInProgressScheduledFunctions();
    const after = await s.snapshot();
    expect(after.wallet).toEqual(before.wallet);
    expect(after.pools).toEqual(before.pools);
    expect(after.hold).toEqual(before.hold);
    expect(after.billing).toEqual(before.billing);
    expect(after.scheduled).toHaveLength(1);
    expect(after.scheduled[0].state.kind).toBe("success");
  },
);

it("rolls back the grant and wallet update when scheduling fails", async () => {
  const s = await setup();
  const before = await s.snapshot();
  await expect(
    s.t.mutation(async (ctx) =>
      refreshAdminProcessingAllowance(
        {
          ...ctx,
          scheduler: {
            ...ctx.scheduler,
            runAt: async () => {
              throw new Error("synthetic scheduling failure");
            },
          },
        },
        s.organizationId,
      ),
    ),
  ).rejects.toThrow("synthetic scheduling failure");
  expect(await s.snapshot()).toEqual(before);
});
