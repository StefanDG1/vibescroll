import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { paidProcessingConfiguration } from "../packages/contracts/paid-processing";
import {
  paidProcessingCapacity,
  reservePaidProcessing,
} from "../convex/lib/paidProcessing";
import {
  reserveProviderExposure,
  markProviderDispatch,
  settleProviderExposure,
} from "../convex/lib/providerFunding";
import {
  proposalProviderNanoUsd,
  proposalPlanSettlement,
} from "../packages/contracts/proposal-loop";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { settlePreparedProvider } from "../convex/lib/preparedCredits";
import { transcribePreparedAudio } from "../packages/providers/vercel-transcription";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
export function monetaryPolicy(overrides = {}) {
  return {
    version: "paid-processing-monetary-v2" as const,
    id: "monetary-policy-first",
    enabled: true as const,
    verifiedAt: Date.now() - 1000,
    expiresAt: Date.now() + 86400000,
    maximumJobNanoUsd: 50000000,
    operatingPoolNanoUsd: 900000000,
    verifiedProviderCreditNanoUsd: 1000000000,
    providerKeyBudgetNanoUsd: 1000000000,
    priorExposureNanoUsd: 100000000,
    ...overrides,
  };
}
function fixture(overrides = {}) {
  const policy = monetaryPolicy(overrides);
  vi.stubEnv("PAID_PROCESSING_CONFIGURATION_JSON", JSON.stringify(policy));
  vi.stubEnv("VERCEL_AI_GATEWAY_API_KEY", "synthetic-provider-key");
  vi.stubEnv(
    "PREPARED_ANALYSIS_CONFIGURATION_JSON",
    JSON.stringify({
      version: "prepared-service-v1",
      enabled: true,
      contributorAllowed: true,
      providerPermissionReference: "Synthetic permission",
    }),
  );
  vi.stubEnv(
    "PROPOSAL_SERVICE_CONFIGURATION_JSON",
    JSON.stringify({
      version: "proposal-service-v1",
      enabled: true,
      privateProjectContextAllowed: true,
      permissionReference: "Synthetic permission",
    }),
  );
  const t = convexTest(schema, import.meta.glob("../convex/**/*.ts"));
  const reserve = (
    operationKey: string,
    maximumNanoUsd = 50000000,
    requestHash = "a".repeat(64),
  ) =>
    t.run((ctx) =>
      reservePaidProcessing(ctx, { operationKey, requestHash, maximumNanoUsd }),
    );
  const pool = () =>
    t.run((ctx) =>
      ctx.db
        .query("providerFundingPools")
        .withIndex("by_pool", (q) => q.eq("pool", "paid-vercel-gateway-v1"))
        .unique(),
    );
  return { t, policy, reserve, pool };
}
it("keeps v2 opt-in, verifies finite bounds, and keeps exact provider units separate from rounded credits", () => {
  const policy = monetaryPolicy();
  expect(paidProcessingConfiguration({})).toBeNull();
  expect(
    paidProcessingConfiguration({
      PAID_PROCESSING_CONFIGURATION_JSON: JSON.stringify(policy),
    })?.version,
  ).toBe("paid-processing-monetary-v2");
  for (const patch of [
    { maximumJobNanoUsd: 1.5 },
    { maximumJobNanoUsd: 100000001 },
    { maximumJobs: 100 },
    { priorExposureNanoUsd: Number.MAX_SAFE_INTEGER },
    { expiresAt: Date.now() - 1 },
    { operatingPoolNanoUsd: undefined },
    { operatingPoolNanoUsd: 0 },
    { operatingPoolNanoUsd: 49999999 },
    { operatingPoolNanoUsd: 50000000.5 },
  ])
    expect(
      paidProcessingConfiguration({
        PAID_PROCESSING_CONFIGURATION_JSON: JSON.stringify({
          ...policy,
          ...patch,
        }),
      }),
    ).toBeNull();
  expect(proposalProviderNanoUsd(1, 1)).toBe(325);
  expect(proposalPlanSettlement(1, 1)).toEqual({
    providerNanoUsd: 325,
    estimatedUsd: 0.001000325,
    credits: 1,
  });
  expect(() => proposalProviderNanoUsd(Number.MAX_SAFE_INTEGER, 0)).toThrow(
    "OVERFLOW",
  );
});

it("keeps the approved five-dollar operating envelope independent of larger provider balances or key ceilings", async () => {
  const legacyMaximumJobs = 100;
  const legacyMaximumJobNanoUsd = 50000000;
  const f = fixture({
    verifiedProviderCreditNanoUsd: 8000000000,
    providerKeyBudgetNanoUsd: 8000000000,
    priorExposureNanoUsd: 1000000000,
    operatingPoolNanoUsd: legacyMaximumJobs * legacyMaximumJobNanoUsd,
  });
  await f.t.run((ctx) =>
    ctx.db.insert("proposalServiceCounters", {
      policyId: "paid-funding:preserved-legacy",
      jobs: 3,
    }),
  );
  await f.reserve("first-with-operating-cap");
  expect(await f.pool()).toMatchObject({
    limitNanoUsd: 6000000000,
    legacyExposureNanoUsd: 1150000000,
    heldNanoUsd: 50000000,
  });
  const capacity = await f.t.run((ctx) => paidProcessingCapacity(ctx));
  expect(
    capacity && "availableNanoUsd" in capacity
      ? capacity.availableNanoUsd
      : null,
  ).toBe(4800000000);
  vi.stubEnv(
    "PAID_PROCESSING_CONFIGURATION_JSON",
    JSON.stringify({
      ...f.policy,
      id: "policy-rollover-larger",
      operatingPoolNanoUsd: 10000000000,
    }),
  );
  await f.reserve("rollover-keeps-lifetime-cap");
  expect(await f.pool()).toMatchObject({
    limitNanoUsd: 6000000000,
    heldNanoUsd: 100000000,
  });
});
it("atomically admits only funded competing operations and returns the same reservation on replay", async () => {
  const f = fixture({
    verifiedProviderCreditNanoUsd: 150000000,
    providerKeyBudgetNanoUsd: 150000000,
  });
  const results = await Promise.allSettled([
    f.reserve("operation-a"),
    f.reserve("operation-b"),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const winner =
    results[0].status === "fulfilled" ? "operation-a" : "operation-b";
  const first = (
    results.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof f.reserve>>
    >
  ).value;
  expect(await f.reserve(winner)).toBe(first);
  expect((await f.pool())?.heldNanoUsd).toBe(50000000);
  expect((await f.t.run((ctx) => paidProcessingCapacity(ctx)))?.available).toBe(
    false,
  );
  await expect(f.reserve(winner, 20000000)).rejects.toThrow(
    "IDEMPOTENCY_CONFLICT",
  );
  await expect(f.reserve(winner, 50000000, "b".repeat(64))).rejects.toThrow(
    "IDEMPOTENCY_CONFLICT",
  );
});
it("carries every bounded legacy paid counter and never alters owner counters or resets exposure on policy rollover", async () => {
  const f = fixture();
  await f.t.run(async (ctx) => {
    for (const [policyId, jobs] of [
      ["paid-funding:old-policy-one", 2],
      ["paid-funding:old-policy-two", 3],
      ["owner-original", 11],
    ] as const)
      await ctx.db.insert("proposalServiceCounters", { policyId, jobs });
  });
  const reservation = await f.reserve("old-operation");
  expect((await f.pool())?.legacyExposureNanoUsd).toBe(350000000);
  vi.stubEnv(
    "PAID_PROCESSING_CONFIGURATION_JSON",
    JSON.stringify({
      ...f.policy,
      id: "monetary-policy-second",
      priorExposureNanoUsd: 0,
      verifiedProviderCreditNanoUsd: 2000000000,
      providerKeyBudgetNanoUsd: 2000000000,
    }),
  );
  expect(await f.reserve("old-operation")).toBe(reservation);
  await f.reserve("new-operation");
  expect(await f.pool()).toMatchObject({
    limitNanoUsd: 900000000,
    legacyExposureNanoUsd: 350000000,
    heldNanoUsd: 100000000,
  });
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("proposalServiceCounters")
        .withIndex("by_policy", (q) => q.eq("policyId", "owner-original"))
        .unique(),
    ),
  ).toMatchObject({ jobs: 11 });
});
it("retains unknown dispatches and releases only never-dispatched work with a stable proof", async () => {
  const f = fixture();
  const active = (await f.reserve("unknown-operation"))!;
  await f.t.run((ctx) => markProviderDispatch(ctx, active, "analysis"));
  await expect(
    f.t.run((ctx) => markProviderDispatch(ctx, active, "analysis")),
  ).rejects.toThrow("SOURCE_BUSY");
  await f.t.run((ctx) =>
    settleProviderExposure(ctx, active, {
      state: "unused",
      receiptHash: "a".repeat(64),
    }),
  );
  expect(await f.t.run((ctx) => ctx.db.get(active))).toMatchObject({
    state: "unknown",
    basis: "unknown",
  });
  expect((await f.pool())?.heldNanoUsd).toBe(50000000);
  const unused = (await f.reserve("undispatched-operation"))!;
  await f.t.run((ctx) =>
    settleProviderExposure(ctx, unused, {
      state: "unused",
      receiptHash: "b".repeat(64),
    }),
  );
  await f.t.run((ctx) =>
    settleProviderExposure(ctx, unused, {
      state: "unused",
      receiptHash: "b".repeat(64),
    }),
  );
  await expect(
    f.t.run((ctx) => markProviderDispatch(ctx, unused, "analysis")),
  ).rejects.toThrow("SOURCE_BUSY");
  expect(await f.pool()).toMatchObject({
    heldNanoUsd: 50000000,
    spentNanoUsd: 0,
  });
});
it("settles exact reported tariff usage once, retains its explicit basis and permits later reconciliation of unknown work", async () => {
  const f = fixture();
  const id = (await f.reserve("known-operation"))!;
  await f.t.run((ctx) => markProviderDispatch(ctx, id, "proposal"));
  await f.t.run((ctx) => settleProviderExposure(ctx, id, { state: "unknown" }));
  const outcome = {
    state: "known" as const,
    actualNanoUsd: 325,
    receiptHash: "c".repeat(64),
    basis: "reported_tariff_usage" as const,
  };
  await Promise.all([
    f.t.run((ctx) => settleProviderExposure(ctx, id, outcome)),
    f.t.run((ctx) => settleProviderExposure(ctx, id, outcome)),
  ]);
  expect(await f.pool()).toMatchObject({
    heldNanoUsd: 0,
    spentNanoUsd: 325,
    blocked: false,
  });
  expect(await f.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "settled",
    actualNanoUsd: 325,
    basis: "reported_tariff_usage",
  });
  await expect(
    f.t.run((ctx) =>
      settleProviderExposure(ctx, id, { ...outcome, actualNanoUsd: 326 }),
    ),
  ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
});
it("records an overrun in full and blocks further admission without rolling the block back", async () => {
  const f = fixture();
  const id = (await f.reserve("overrun-operation", 20000000))!;
  await f.t.run((ctx) => markProviderDispatch(ctx, id, "proposal"));
  await f.t.run((ctx) =>
    settleProviderExposure(ctx, id, {
      state: "known",
      actualNanoUsd: 60000000,
      receiptHash: "d".repeat(64),
      basis: "reported_tariff_usage",
    }),
  );
  expect(await f.pool()).toMatchObject({
    spentNanoUsd: 60000000,
    heldNanoUsd: 0,
    blocked: true,
  });
  await expect(f.reserve("after-overrun")).rejects.toThrow("BUDGET_EXCEEDED");
});
it("stops dispatch after expiry, preserves holds, and still accepts a later known settlement", async () => {
  const f = fixture();
  const id = (await f.reserve("expired-operation"))!;
  await f.t.run((ctx) => markProviderDispatch(ctx, id, "analysis"));
  vi.stubEnv(
    "PAID_PROCESSING_CONFIGURATION_JSON",
    JSON.stringify({ ...f.policy, expiresAt: Date.now() - 1 }),
  );
  await expect(f.reserve("after-expiry")).rejects.toThrow("BUDGET_EXCEEDED");
  await expect(
    f.t.run((ctx) => markProviderDispatch(ctx, id, "transcription")),
  ).rejects.toThrow("SETUP_REQUIRED");
  await f.t.run((ctx) =>
    settleProviderExposure(ctx, id, {
      state: "known",
      actualNanoUsd: 100,
      receiptHash: "e".repeat(64),
      basis: "reported_tariff_usage",
    }),
  );
  expect(await f.pool()).toMatchObject({ spentNanoUsd: 100, heldNanoUsd: 0 });
});
it("refuses overflow and excessive legacy policy enumeration instead of scanning or weakening exposure", async () => {
  const f = fixture();
  await expect(
    f.t.run((ctx) =>
      reserveProviderExposure(ctx, f.policy, {
        operationKey: "unsafe",
        requestHash: "a".repeat(64),
        maximumNanoUsd: Number.MAX_SAFE_INTEGER + 1,
      }),
    ),
  ).rejects.toThrow("BUDGET_EXCEEDED");
  await f.t.run(async (ctx) => {
    for (let n = 0; n < 65; n++)
      await ctx.db.insert("proposalServiceCounters", {
        policyId: `paid-funding:legacy-${n}`,
        jobs: 0,
      });
  });
  await expect(f.reserve("too-many-policies")).rejects.toThrow(
    "COST_RECONCILIATION_REQUIRED",
  );
  expect(await f.pool()).toBeNull();
});

it.each([
  "native_caption_analysis",
  "asr_ceiling_only",
  "never_gateway_dispatched",
] as const)("settles media conservatively for %s", async (scenario) => {
  fixture();
  const f = await analysisVersionFixture(false);
  const source = (await f.t.run((ctx) => ctx.db.get(f.sourceId)))!;
  const reservationId = (await f.t.run((ctx) =>
    reservePaidProcessing(ctx, {
      operationKey: `media-${scenario}`,
      requestHash: "a".repeat(64),
      maximumNanoUsd: 50000000,
    }),
  ))!;
  if (scenario !== "never_gateway_dispatched")
    await f.t.run((ctx) =>
      markProviderDispatch(ctx, reservationId, "analysis"),
    );
  if (scenario === "asr_ceiling_only")
    await f.t.run((ctx) =>
      markProviderDispatch(ctx, reservationId, "transcription"),
    );
  const runId = await f.t.run((ctx) =>
    ctx.db.insert("mediaPreparations", {
      organizationId: f.org,
      sourceId: f.sourceId,
      actor: source.personalAnalysis!.actor,
      key: `media-${scenario}`,
      policyId: "media-test-policy",
      generation: source.generation,
      canonical: source.canonical,
      executor: "gateway",
      state: "ready",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deadline: Date.now() + 60000,
      maximumApiUsd: 0.05,
      stages: [],
      receipt: {
        admission: {
          providerReservationId: reservationId,
          reservationKey: `media-${scenario}`,
          quoteHash: "a".repeat(64),
        },
        analysis: {
          model: "meta/muse-spark-1.3-contributor",
          provider: "meta",
          inputTokens: 3,
          outputTokens: 7,
        },
        analysis_output: { responseSha256: "c".repeat(64) },
        ...(scenario === "asr_ceiling_only"
          ? { asr: { costCeilingUsd: 0.01, providerSettledUsd: null } }
          : {}),
      },
    }),
  );
  await f.t.run(async (ctx) =>
    settlePreparedProvider(ctx, (await ctx.db.get(runId))!),
  );
  await f.t.run(async (ctx) =>
    settlePreparedProvider(ctx, (await ctx.db.get(runId))!),
  );
  expect(await f.t.run((ctx) => ctx.db.get(reservationId))).toMatchObject(
    scenario === "asr_ceiling_only"
      ? { state: "unknown", basis: "unknown" }
      : scenario === "never_gateway_dispatched"
        ? { state: "released", actualNanoUsd: 0, basis: "confirmed_zero" }
        : {
            state: "settled",
            actualNanoUsd: 1700,
            basis: "reported_tariff_usage",
          },
  );
  expect(
    await f.t.run((ctx) => ctx.db.query("providerFundingPools").unique()),
  ).toMatchObject({
    heldNanoUsd: scenario === "asr_ceiling_only" ? 50000000 : 0,
    spentNanoUsd: scenario === "native_caption_analysis" ? 1700 : 0,
  });
});

it("awaits the ASR funding barrier after the free catalog read and before the paid transcription POST", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      data: [
        {
          id: "microsoft/mai-transcribe-2",
          type: "transcription",
          pricing: { transcription_duration_cost_per_second: "0.00002778" },
        },
      ],
    }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const onDispatch = vi.fn(async () => {
    await gate;
    throw Error("FUNDING_BARRIER_DENIED");
  });
  const pending = transcribePreparedAudio(new Uint8Array(80), 1000, 0.02, {
    apiKey: "synthetic-provider-key",
    fetch: fetchMock as typeof fetch,
    onDispatch,
  });
  const rejected = expect(pending).rejects.toThrow("FUNDING_BARRIER_DENIED");
  await vi.waitFor(() => expect(onDispatch).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledOnce();
  release();
  await rejected;
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("does not draw Gateway money for a separately authorized retained OpenAI/host route", async () => {
  const f = fixture();
  vi.stubEnv("VERCEL_AI_GATEWAY_API_KEY", "");
  expect(await f.reserve("no-gateway-operation", 0)).toBeNull();
  expect(await f.pool()).toBeNull();
});

it("blocks v1 downgrade admission after monetary activation instead of forgetting new holds", async () => {
  const f = fixture();
  await f.reserve("held-before-downgrade");
  const { operatingPoolNanoUsd: _operatingPool, ...legacyFields } = f.policy;
  vi.stubEnv(
    "PAID_PROCESSING_CONFIGURATION_JSON",
    JSON.stringify({
      ...legacyFields,
      version: "paid-processing-prefunded-v1",
      maximumJobs: 10,
    }),
  );
  expect((await f.t.run((ctx) => paidProcessingCapacity(ctx)))?.available).toBe(
    false,
  );
  await expect(f.reserve("after-downgrade")).rejects.toThrow("BUDGET_EXCEEDED");
  expect(await f.pool()).toMatchObject({ heldNanoUsd: 50000000 });
});

it("keeps fractional or unsafe stored counters from entering monetary arithmetic", async () => {
  const f = fixture();
  await f.reserve("before-corruption");
  await f.t.run(async (ctx) => {
    const pool = (await ctx.db.query("providerFundingPools").unique())!;
    await ctx.db.patch(pool._id, { heldNanoUsd: 0.5, spentNanoUsd: 0.5 });
  });
  await expect(f.reserve("fractional-accounts")).rejects.toThrow(
    "BUDGET_EXCEEDED",
  );
});
