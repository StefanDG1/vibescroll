import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { checkTrialBundle } from "../packages/runner/subscription-trial.mjs";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["owner","other"]');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  for (const subject of ["owner", "other"])
    await t.mutation(internal.accounts.syncUser, {
      subject,
      email: `${subject}@example.test`,
      name: subject,
    });
  const a = t.withIdentity({
      subject: "owner",
      auth_time: Math.floor(Date.now() / 1000),
    }),
    b = t.withIdentity({
      subject: "other",
      auth_time: Math.floor(Date.now() / 1000),
    });
  const org = await a.mutation(api.organizations.create, { name: "A" }),
    other = await b.mutation(api.organizations.create, { name: "B" });
  const source = await a.mutation(api.product.capture, {
    organizationId: org,
    key: "trial-synthetic-text",
    kind: "text",
    title: "Owned test text",
    text: "Review supporting evidence before coding.",
    rightsAttested: true,
  });
  const prepare = (extra: any = {}) =>
    a.mutation(api.subscriptionTrials.prepare, {
      organizationId: org,
      sources: [source],
      route: "local",
      effort: "medium",
      useOwnPlan: true,
      ...extra,
    });
  return { t, a, b, org, other, source, prepare };
}
function result(id: string, source: string) {
  return {
    schemaVersion: "1.0.0",
    sourceId: source,
    processingRunId: `${id}:${source}`,
    coverage: "caption_only",
    summary: "Review supporting evidence.",
    warnings: [],
    insights: [
      {
        id: "one",
        title: "Review evidence",
        claim: "Review evidence before coding.",
        interpretation: "Require proof for a proposal.",
        categories: ["coding"],
        confidence: "supported",
        verificationNeeds: [],
        evidence: [
          {
            kind: "user_note",
            id: "supplied_text",
            startMs: null,
            endMs: null,
          },
        ],
      },
    ],
  };
}
it("returns bounded results without modifying original analysis or charging a wallet", async () => {
  const s = await setup(),
    before = await s.t.run((ctx) => ctx.db.get(s.source));
  const id = await s.prepare(),
    bundle = await s.a.query(api.subscriptionTrials.bundle, { id });
  expect(bundle.model).toBe("gpt-6.1-sol");
  expect(bundle.effort).toBe("medium");
  // Exercise the actual transport ordering before either subscription route runs.
  expect(checkTrialBundle(JSON.parse(canonicalJson(bundle)))).toEqual(bundle);
  expect(
    await s.a.mutation(api.subscriptionTrials.finish, {
      id,
      bundleHash: bundle.bundleHash,
      results: [result(id, s.source)],
    }),
  ).toEqual({ accepted: true });
  expect(await s.t.run((ctx) => ctx.db.get(s.source))).toEqual(before);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  const rows = await s.a.query(api.subscriptionTrials.list, {
    organizationId: s.org,
  });
  expect(rows[0].state).toBe("completed");
  expect(rows[0].results[0].warnings).toContain(
    "This trial includes prepared text only. No video frames are supplied.",
  );
  expect(rows[0]).not.toHaveProperty("input");
  // Workspace ownership does not expose another member's personal comparison.
  await s.t.run(async (ctx) => {
    const row = await ctx.db.get(id),
      other = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("subject"), "other"))
        .first();
    const { _id, _creationTime, ...fields } = row!;
    await ctx.db.insert("subscriptionTrials", { ...fields, actor: other!._id });
  });
  expect(
    await s.a.query(api.subscriptionTrials.list, { organizationId: s.org }),
  ).toHaveLength(1);
  const exported = await s.a.query(api.jobs.exportPage, {
    organizationId: s.org,
    section: "subscriptionTrials",
    asOf: Date.now(),
    cursor: null,
  });
  expect(exported.page).toHaveLength(1);
});
it("requires personal access, consent and same-workspace sources using a normal session", async () => {
  const s = await setup();
  await expect(s.prepare({ useOwnPlan: false })).rejects.toThrow("FORBIDDEN");
  await expect(
    s.b.mutation(api.subscriptionTrials.prepare, {
      organizationId: s.other,
      sources: [s.source],
      route: "codex_cloud",
      effort: "low",
      useOwnPlan: true,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.t
      .withIdentity({
        subject: "owner",
        auth_time: Math.floor(Date.now() / 1000) - 3600,
      })
      .mutation(api.subscriptionTrials.prepare, {
        organizationId: s.org,
        sources: [s.source],
        route: "local",
        effort: "low",
        useOwnPlan: true,
      }),
  ).resolves.toBeDefined();
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", "[]");
  await expect(s.prepare()).rejects.toThrow("FORBIDDEN");
});
it("rejects duplicate/empty inputs and an unprepared public link", async () => {
  const s = await setup();
  await expect(s.prepare({ sources: [] })).rejects.toThrow("INVALID_INPUT");
  await expect(s.prepare({ sources: [s.source, s.source] })).rejects.toThrow(
    "INVALID_INPUT",
  );
  const id = await s.a.mutation(api.product.capture, {
    organizationId: s.org,
    key: "unprepared-public-video",
    kind: "url",
    url: "https://instagram.com/reel/Trial12345/",
    title: "Unprepared",
    rightsAttested: true,
  });
  await expect(s.prepare({ sources: [id] })).rejects.toThrow(
    "INVALID_EVIDENCE",
  );
});
it("downgrades a sampled-video trial to the supplied text and excludes frame claims", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.source, {
      coverage: "full_sampled",
      mediaEvidence: [
        { kind: "transcript", id: "segment-0", startMs: 0, endMs: 1000 },
        { kind: "frame", id: "frame-0", startMs: 0, endMs: 0 },
      ],
    }),
  );
  const id = await s.prepare(),
    bundle = await s.a.query(api.subscriptionTrials.bundle, { id });
  expect(bundle.sources[0].coverage).toBe("audio_only");
  expect(bundle.sources[0].evidence.map((e: any) => e.kind)).toEqual([
    "transcript",
  ]);
  const bad: any = result(id, s.source);
  bad.coverage = "audio_only";
  bad.insights[0].evidence = [
    { kind: "frame", id: "frame-0", startMs: 0, endMs: 0 },
  ];
  await expect(
    s.a.mutation(api.subscriptionTrials.finish, {
      id,
      bundleHash: bundle.bundleHash,
      results: [bad],
    }),
  ).rejects.toThrow("INVALID_EVIDENCE");
});
it("rejects output hash, identity, coverage and evidence changes", async () => {
  const s = await setup(),
    id = await s.prepare(),
    bundle = await s.a.query(api.subscriptionTrials.bundle, { id });
  await expect(
    s.a.mutation(api.subscriptionTrials.finish, {
      id,
      bundleHash: "wrong",
      results: [result(id, s.source)],
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  for (const change of [
    { processingRunId: "different" },
    { coverage: "full_sampled" },
    { sourceId: "other-source" },
    {
      insights: [
        {
          ...result(id, s.source).insights[0],
          evidence: [
            { kind: "user_note", id: "fabricated", startMs: null, endMs: null },
          ],
        },
      ],
    },
  ])
    await expect(
      s.a.mutation(api.subscriptionTrials.finish, {
        id,
        bundleHash: bundle.bundleHash,
        results: [{ ...result(id, s.source), ...change }],
      }),
    ).rejects.toThrow("INVALID_EVIDENCE");
});
it("hides changed/deleted evidence immediately, including export before redaction runs", async () => {
  const s = await setup(),
    id = await s.prepare(),
    bundle = await s.a.query(api.subscriptionTrials.bundle, { id });
  await s.a.mutation(api.subscriptionTrials.finish, {
    id,
    bundleHash: bundle.bundleHash,
    results: [result(id, s.source)],
  });
  await s.t.run((ctx) =>
    ctx.db.patch(s.source, {
      text: "The owner's correction takes precedence.",
    }),
  );
  await expect(
    s.a.query(api.subscriptionTrials.bundle, { id }),
  ).rejects.toThrow("APPROVAL_STALE");
  const rows = await s.a.query(api.subscriptionTrials.list, {
    organizationId: s.org,
  });
  expect(rows[0].results).toBeUndefined();
  const exported = await s.a.query(api.jobs.exportPage, {
    organizationId: s.org,
    section: "subscriptionTrials",
    asOf: Date.now(),
    cursor: null,
  });
  expect(JSON.stringify(exported)).not.toContain("Review supporting evidence");
  await s.t.run((ctx) => ctx.db.patch(s.source, { state: "deleted" }));
  expect(
    (await s.a.query(api.subscriptionTrials.list, { organizationId: s.org }))[0]
      .state,
  ).toBe("expired");
});
it("keeps another account out and erases canceled/expired trial content", async () => {
  const s = await setup(),
    id = await s.prepare(),
    bundle = await s.a.query(api.subscriptionTrials.bundle, { id });
  await expect(
    s.b.query(api.subscriptionTrials.bundle, { id }),
  ).rejects.toThrow();
  await expect(
    s.b.mutation(api.subscriptionTrials.cancel, { id }),
  ).rejects.toThrow();
  await s.a.mutation(api.subscriptionTrials.cancel, { id });
  await expect(
    s.a.mutation(api.subscriptionTrials.finish, {
      id,
      bundleHash: bundle.bundleHash,
      results: [result(id, s.source)],
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  expect((await s.t.run((ctx) => ctx.db.get(id)))?.input).toEqual({
    sources: [],
  });
  const fresh = await s.prepare();
  vi.advanceTimersByTime(86400001);
  await s.t.mutation(internal.subscriptionTrials.expire, { id: fresh });
  expect((await s.t.run((ctx) => ctx.db.get(fresh)))?.input).toEqual({
    sources: [],
  });
});
