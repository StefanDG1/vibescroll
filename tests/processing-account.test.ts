import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { processingAccountSummary } from "../convex/lib/processingAccount";
import { processingAdmission } from "../convex/lib/processingAdmission";
import { refreshAdminProcessingAllowance } from "../convex/lib/adminProcessingAllowance";

const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2026, 10, 5, 12);
const ownerSubject = "user_01234567890123456789012345";
const foreignSubject = "user_99999999999999999999999999";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  for (const [key, value] of Object.entries({
    RESTORE_LOCK: "false",
    DISABLE_INFERENCE: "false",
    ADMIN_PROCESSING_ALLOWANCE_JSON: "",
    VERCEL_AI_GATEWAY_API_KEY: "synthetic-summary-test-key",
    PAID_PROCESSING_CONFIGURATION_JSON: JSON.stringify({
      version: "paid-processing-monetary-v2",
      id: "summary-funding",
      enabled: true,
      verifiedAt: now - 1000,
      expiresAt: now + 86400000,
      maximumJobNanoUsd: 50000000,
      operatingPoolNanoUsd: 900000000,
      verifiedProviderCreditNanoUsd: 1000000000,
      providerKeyBudgetNanoUsd: 1000000000,
      priorExposureNanoUsd: 100000000,
    }),
    PROPOSAL_SERVICE_CONFIGURATION_JSON: JSON.stringify({
      version: "proposal-service-v1",
      enabled: true,
      privateProjectContextAllowed: true,
      permissionReference: "Synthetic account-summary test permission",
    }),
  }))
    vi.stubEnv(key, value);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function setup(kind: "legacy" | "admin" | "paid" = "legacy") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const actorId = await ctx.db.insert("users", {
      subject: ownerSubject,
      email: "summary-owner@example.test",
      name: "Summary owner",
      status: "active",
      createdAt: now,
    });
    const foreignActorId = await ctx.db.insert("users", {
      subject: foreignSubject,
      email: "summary-foreign@example.test",
      name: "Foreign user",
      status: "active",
      createdAt: now,
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Personal funding",
      status: "active",
      createdBy: actorId,
      privateOwnerId: actorId,
      createdAt: now,
    });
    const membershipId = await ctx.db.insert("memberships", {
      organizationId,
      userId: actorId,
      role: "owner",
    });
    const teamId = await ctx.db.insert("organizations", {
      name: "Team with separate member funding",
      status: "active",
      createdBy: actorId,
      memberSubscriptionPolicy: "individual_pro_v1",
      createdAt: now,
    });
    for (const [userId, role] of [
      [actorId, "owner"],
      [foreignActorId, "admin"],
    ] as const)
      await ctx.db.insert("memberships", {
        organizationId: teamId,
        userId,
        role,
      });
    const walletId = await ctx.db.insert("wallets", {
      organizationId,
      granted: 44,
      purchased: 0,
      spent: 2,
      reserved: 10,
      tier: kind === "paid" ? "pro" : "trial",
      interval: kind === "paid" ? "monthly" : "trial",
      periodEnd: now + 86400000,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("creditPools", {
      organizationId,
      key: "retained-active-pool",
      kind: "included",
      granted: 32,
      spent: 0,
      reserved: 0,
      expiresAt: now + 86400000,
      createdAt: now,
      updatedAt: now,
    });
    const expiredPoolId = await ctx.db.insert("creditPools", {
      organizationId,
      key: "retained-expired-pool-with-hold",
      kind: "included",
      granted: 12,
      spent: 2,
      reserved: 10,
      expiresAt: now - 1000,
      createdAt: now - 86400000,
      updatedAt: now - 1000,
    });
    await ctx.db.insert("reservations", {
      organizationId,
      key: "unknown-expired-dispatch",
      max: 10,
      settled: 0,
      state: "active",
      expiresAt: now - 1000,
      dispatchedAt: now - 86400000,
      allocations: [{ poolId: expiredPoolId, credits: 10 }],
      createdAt: now - 86400000,
      updatedAt: now - 86400000,
    });
    if (kind === "paid") {
      await ctx.db.insert("billing", {
        organizationId,
        customerId: "synthetic-summary-customer",
        subscriptionId: "synthetic-summary-subscription",
        status: "active",
        periodEnd: now + 86400000,
        verifiedAt: now - 1000,
        revision: 1,
      });
      await ctx.db.insert("billingPeriods", {
        organizationId,
        key: "synthetic-summary-paid-period",
        start: now - 86400000,
        end: now + 86400000,
        credits: 300,
        subscription: "synthetic-summary-subscription",
        createdAt: now,
        updatedAt: now,
      });
    }
    const sourceId = await ctx.db.insert("sources", {
      organizationId,
      key: "synthetic-summary-source",
      canonical: "https://www.instagram.com/reel/Abcdef12345/",
      url: "https://www.instagram.com/reel/Abcdef12345/",
      kind: "url",
      title: "Synthetic retained source",
      state: "saved",
      coverage: "none",
      tags: [],
      rightsAttested: true,
      generation: 1,
      createdAt: now,
      updatedAt: now,
    });
    return {
      actorId,
      foreignActorId,
      organizationId,
      teamId,
      membershipId,
      walletId,
      sourceId,
    };
  });
  const mediaConfig = {
    version: "prepared-service-v1",
    id: "summary-media-policy",
    enabled: true,
    subjects: [kind === "paid" ? foreignSubject : ownerSubject],
    maximumDurationMs: 600000,
    maximumApiUsd: 0.05,
    maximumDailyJobs: 5,
    maximumHourlyJobs: 2,
    maximumTotalJobs: 10,
    legacyOwnerFundingOrganizationId: ids.organizationId,
    contributorAllowed: true,
    providerPermissionReference: "Synthetic account-summary media permission",
    catalogPublicationAllowed: false,
  };
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify(mediaConfig),
  );
  if (kind === "admin")
    vi.stubEnv(
      "ADMIN_PROCESSING_ALLOWANCE_JSON",
      JSON.stringify({
        version: "admin-processing-allowance-v1",
        id: "summary-admin-policy",
        enabled: true,
        subject: ownerSubject,
        organizationId: ids.organizationId,
        monthlyCredits: 300,
        maximumHourlyJobs: 20,
        maximumDailyJobs: 100,
        startsAt: now - 1000,
      }),
    );
  const actor = (await t.run((ctx) => ctx.db.get(ids.actorId)))!;
  const summary = () => t.query((ctx) => processingAccountSummary(ctx, actor));
  const admission = () =>
    t.query((ctx) => processingAdmission(ctx, actor, ids.organizationId));
  const snapshot = () =>
    t.run(async (ctx) => ({
      wallet: await ctx.db.get(ids.walletId),
      pools: await ctx.db.query("creditPools").collect(),
      holds: await ctx.db.query("reservations").collect(),
      billing: await ctx.db.query("billing").collect(),
      periods: await ctx.db.query("billingPeriods").collect(),
      preparations: await ctx.db.query("mediaPreparations").collect(),
    }));
  async function starts(times: number[]) {
    const policyId =
      kind === "paid" ? "paid-prepared-summary-funding" : mediaConfig.id;
    for (let index = 0; index < times.length; index++) {
      const at = times[index];
      vi.setSystemTime(at);
      await t.run((ctx) =>
        ctx.db.insert("mediaPreparations", {
          organizationId: ids.organizationId,
          sourceId: ids.sourceId,
          actor: ids.actorId,
          key: `retained-failed-start-${index}`,
          policyId,
          generation: 1,
          canonical: "https://www.instagram.com/reel/Abcdef12345/",
          executor: "gateway",
          state: "failed",
          createdAt: at,
          updatedAt: at,
          deadline: at + 600000,
          maximumApiUsd: 0.05,
          stages: [],
        }),
      );
    }
    vi.setSystemTime(now);
  }
  return {
    t,
    ...ids,
    actor,
    mediaConfig,
    summary,
    admission,
    snapshot,
    starts,
  };
}

it("reports the retained 32 credits and expired 10-credit hold without mutating either", async () => {
  const s = await setup();
  const before = await s.snapshot();
  expect(await s.summary()).toMatchObject({
    version: "processing-account-v1",
    availableCredits: 32,
    reservedCredits: 10,
    expiredReservedCredits: 10,
    observedAt: now,
    nextExpiry: now + 86400000,
    allowanceKind: "legacy",
    monthlyAllowance: null,
    nextRenewal: null,
    processing: { allowed: true, reason: null },
    reviewUrl: `https://scroll.companynerve.com/app/${s.organizationId}/usage`,
  });
  expect(await s.snapshot()).toEqual(before);
});

it("shows configured monthly allowance separately from credits actually granted", async () => {
  const s = await setup("admin");
  const before = await s.snapshot();
  expect(await s.summary()).toMatchObject({
    availableCredits: 32,
    reservedCredits: 10,
    expiredReservedCredits: 10,
    allowanceKind: "admin",
    monthlyAllowance: 300,
    nextRenewal: Date.UTC(2026, 11, 1),
  });
  expect(await s.snapshot()).toEqual(before);
  await s.t.mutation((ctx) =>
    refreshAdminProcessingAllowance(ctx, s.organizationId),
  );
  expect(await s.summary()).toMatchObject({
    availableCredits: 332,
    reservedCredits: 10,
    expiredReservedCredits: 10,
  });
});

it("uses the exact admin binding for a legacy owned workspace without a second media-policy binding", async () => {
  const s = await setup("admin");
  await s.t.run((ctx) =>
    ctx.db.patch(s.organizationId, { privateOwnerId: undefined }),
  );
  const { legacyOwnerFundingOrganizationId: _legacyBinding, ...mediaConfig } =
    s.mediaConfig;
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify(mediaConfig),
  );
  const before = await s.snapshot();
  expect(await s.summary()).toMatchObject({
    availableCredits: 32,
    allowanceKind: "admin",
    monthlyAllowance: 300,
  });
  expect(await s.snapshot()).toEqual(before);
});

it("returns a paid self-account summary without disclosing billing history", async () => {
  const s = await setup("paid");
  expect(await s.summary()).toMatchObject({
    availableCredits: 32,
    allowanceKind: "paid",
    monthlyAllowance: null,
    processing: { allowed: true },
  });
  expect(Object.keys(await s.summary()).sort()).toEqual(
    [
      "version",
      "availableCredits",
      "reservedCredits",
      "expiredReservedCredits",
      "observedAt",
      "nextExpiry",
      "allowanceKind",
      "monthlyAllowance",
      "nextRenewal",
      "processing",
      "reviewUrl",
    ].sort(),
  );
});

it("does not lend personal or team-owner credits to another member", async () => {
  const s = await setup("paid");
  const foreignActor = (await s.t.run((ctx) => ctx.db.get(s.foreignActorId)))!;
  await expect(
    s.t.query((ctx) => processingAccountSummary(ctx, foreignActor)),
  ).rejects.toThrow();
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({
      ...s.mediaConfig,
      subjects: [ownerSubject],
      legacyOwnerFundingOrganizationId: s.teamId,
    }),
  );
  await expect(s.summary()).rejects.toThrow("Use your own processing account");
});

it("rechecks membership before exposing a legacy personal wallet", async () => {
  const s = await setup();
  await s.t.run((ctx) => ctx.db.delete(s.membershipId));
  await expect(s.summary()).rejects.toThrow();
});

it("reports zero spendable credits as a credit blocker while keeping an expired hold", async () => {
  const s = await setup("admin");
  await s.t.run(async (ctx) => {
    const pool = await ctx.db
      .query("creditPools")
      .withIndex("by_key", (q) => q.eq("key", "retained-active-pool"))
      .unique();
    await ctx.db.patch(pool!._id, { spent: 32 });
    await ctx.db.patch(s.walletId, { spent: 34 });
  });
  const before = await s.snapshot();
  expect(await s.summary()).toMatchObject({
    availableCredits: 0,
    reservedCredits: 10,
    expiredReservedCredits: 10,
    processing: {
      allowed: false,
      reason: "INSUFFICIENT_CREDITS",
      dimension: "credits",
    },
  });
  expect(await s.snapshot()).toEqual(before);
});

it("reports provider exhaustion even when one nanoUSD and personal credits remain", async () => {
  const s = await setup("admin");
  await s.t.run((ctx) =>
    ctx.db.insert("providerFundingPools", {
      pool: "paid-vercel-gateway-v1",
      limitNanoUsd: 1000000000,
      legacyExposureNanoUsd: 100000000,
      heldNanoUsd: 899999999,
      spentNanoUsd: 0,
      blocked: false,
      updatedAt: now,
    }),
  );
  const before = await s.snapshot();
  expect(await s.summary()).toMatchObject({
    availableCredits: 32,
    processing: {
      allowed: false,
      reason: "BUDGET_EXCEEDED",
      dimension: "provider",
    },
  });
  expect(await s.snapshot()).toEqual(before);
});

it.each(["admin", "paid", "legacy"] as const)(
  "preserves historical attempts and applies the correct %s lifetime policy",
  async (kind) => {
    const s = await setup(kind);
    const count = kind === "paid" ? 1001 : 12;
    await s.starts(
      Array.from({ length: count }, (_, index) => now - 3 * 86400000 + index),
    );
    const before = await s.snapshot();
    if (kind === "legacy")
      expect(await s.admission()).toMatchObject({
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        dimension: "pilot",
        limit: 10,
        used: 12,
        retryAt: null,
      });
    else
      expect(await s.admission()).toMatchObject({
        allowed: true,
        reason: null,
      });
    expect(await s.snapshot()).toEqual(before);
  },
);

it("returns the precise hourly retry when enough retained starts leave the rolling window", async () => {
  const s = await setup("admin");
  await s.starts(
    Array.from({ length: 21 }, (_, index) => now - 55 * 60000 + index * 60000),
  );
  const retryAt = now + 6 * 60000;
  expect(await s.admission()).toMatchObject({
    allowed: false,
    dimension: "hour",
    reason: "QUOTA_EXCEEDED",
    limit: 20,
    used: 21,
    retryAt,
  });
  vi.setSystemTime(retryAt - 1);
  expect((await s.admission()).allowed).toBe(false);
  vi.setSystemTime(retryAt);
  expect((await s.admission()).allowed).toBe(true);
});

it("returns the precise daily retry after old starts exceed the generous admin rate", async () => {
  const s = await setup("admin");
  await s.starts(
    Array.from(
      { length: 101 },
      (_, index) => now - 23 * 3600000 + index * 60000,
    ),
  );
  const retryAt = now + 61 * 60000;
  expect(await s.admission()).toMatchObject({
    allowed: false,
    dimension: "day",
    reason: "QUOTA_EXCEEDED",
    limit: 100,
    used: 101,
    retryAt,
  });
  vi.setSystemTime(retryAt - 1);
  expect((await s.admission()).allowed).toBe(false);
  vi.setSystemTime(retryAt);
  expect((await s.admission()).allowed).toBe(true);
});
