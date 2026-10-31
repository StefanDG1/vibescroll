import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { reserve, wallet } from "../convex/product";
import { repositoryAllowance } from "../convex/lib/repositoryAllowance";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  for (const subject of ["scan-owner", "scan-foreign"])
    await t.mutation(internal.accounts.syncUser, {
      subject,
      email: `${subject}@example.test`,
      name: subject,
    });
  const a = t.withIdentity({
    subject: "scan-owner",
    auth_time: Math.floor(Date.now() / 1000),
  });
  const b = t.withIdentity({
    subject: "scan-foreign",
    auth_time: Math.floor(Date.now() / 1000),
  });
  const org = await a.mutation(api.organizations.create, {
    name: "Synthetic scan",
  });
  const foreign = await b.mutation(api.organizations.create, {
    name: "Synthetic foreign",
  });
  const owner = await t.run(
    async (ctx) =>
      (await ctx.db
        .query("users")
        .withIndex("by_subject", (q) => q.eq("subject", "scan-owner"))
        .unique())!._id,
  );
  const repo = await t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: org,
      installationId: 42,
      providerId: 55,
      fullName: "owned/synthetic",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "Synthetic public product",
      profileVersion: 1,
      selectionVersion: 1,
      snapshotPaths: [],
      manifest: ["README.md"],
      status: "connected",
      context: "Synthetic context",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  async function source(
    n: number,
    ready = false,
    kind = "url",
    organizationId = org,
    createdAt = Date.now() - 1000 + n,
  ) {
    return t.run((ctx) =>
      ctx.db.insert("sources", {
        organizationId,
        key: `synthetic-${n}`,
        canonical: `synthetic-${n}`,
        title: `Synthetic source ${n}`,
        kind,
        ...(kind === "url"
          ? { url: `https://www.instagram.com/reel/Synthetic${n}/` }
          : { text: "Synthetic supplied text" }),
        state: ready ? "ready" : "needs_upload",
        coverage: ready ? "full_sampled" : "metadata_only",
        tags: [],
        rightsAttested: true,
        generation: 1,
        createdAt,
        updatedAt: Date.now(),
        ...(ready
          ? {
              analysis: {
                summary: "Synthetic evidence",
                insights: [
                  {
                    id: `point-${n}`,
                    title: "Synthetic review",
                    claim: "Review an observed interface issue",
                    interpretation: "Synthetic hypothesis",
                    topics: ["Synthetic interface review"],
                    categories: ["engineering"],
                    evidence: [],
                  },
                ],
              },
            }
          : {}),
      }),
    );
  }
  const prepare = () =>
    a.mutation(api.libraryScans.prepare, {
      organizationId: org,
      repositoryIds: [repo],
    });
  async function step(id: Id<"libraryScans">) {
    const lease = await t.mutation(internal.libraryScans.claim, { id });
    expect(lease).not.toBeNull();
    const delay = await t.mutation(internal.libraryScans.step, {
      id,
      lease: lease!,
    });
    await t.mutation(internal.libraryScans.release, {
      id,
      lease: lease!,
      delay: 0,
    });
    return delay;
  }
  async function inventory(id: Id<"libraryScans">) {
    for (let n = 0; n < 10; n++) {
      const j = await t.run((ctx) => ctx.db.get(id));
      if (j!.state === "ready") return;
      await step(id);
    }
    throw Error("Inventory did not finish");
  }
  async function approve(id: Id<"libraryScans">, maximumCredits = 100) {
    const j = await t.run((ctx) => ctx.db.get(id));
    await a.mutation(api.libraryScans.approve, {
      id,
      version: j!.version,
      maximumCredits,
      funding: "managed",
    });
  }
  return {
    t,
    a,
    b,
    org,
    foreign,
    owner,
    repo,
    source,
    prepare,
    step,
    inventory,
    approve,
  };
}
it("counts every saved-link page without inference, excludes test notes, other workspaces and future captures", async () => {
  const s = await setup();
  for (let n = 0; n < 73; n++) await s.source(n, n < 7);
  for (let n = 80; n < 98; n++) await s.source(n, true, "text");
  await s.source(110, false, "url", s.foreign);
  const id = await s.prepare();
  await s.source(111, false, "url", s.org, Date.now() + 1);
  await s.inventory(id);
  const [job] = await s.a.query(api.libraryScans.list, {
    organizationId: s.org,
  });
  expect(job).toMatchObject({
    sourceCount: 73,
    readyCount: 7,
    pendingCount: 66,
    state: "ready",
    committedCredits: 0,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
  await expect(
    s.b.query(api.libraryScans.list, { organizationId: s.org }),
  ).rejects.toThrow();
  await expect(
    s.b.mutation(api.libraryScans.prepare, {
      organizationId: s.foreign,
      repositoryIds: [s.repo],
    }),
  ).rejects.toThrow("CONTEXT_REQUIRED");
});
it("claims durable leases once, rejects stale delivery and keeps cancellation authoritative", async () => {
  const s = await setup();
  await s.source(1);
  const id = await s.prepare();
  const lease = await s.t.mutation(internal.libraryScans.claim, { id });
  expect(await s.t.mutation(internal.libraryScans.claim, { id })).toBeNull();
  expect(
    await s.t.mutation(internal.libraryScans.step, { id, lease: "stale" }),
  ).toBeNull();
  await s.a.mutation(api.libraryScans.pause, { id, cancel: true });
  expect(
    await s.t.mutation(internal.libraryScans.step, { id, lease: lease! }),
  ).toBeNull();
  await s.t.mutation(internal.libraryScans.blocked, {
    id,
    lease: lease!,
    reason: "needs_attention",
  });
  expect((await s.t.run((ctx) => ctx.db.get(id)))!.state).toBe("canceled");
});
it("stops stale repository context before reserving or retrying any source", async () => {
  const s = await setup();
  await s.source(1);
  const id = await s.prepare();
  await s.inventory(id);
  await s.approve(id);
  await s.t.run((ctx) => ctx.db.patch(s.repo, { profileVersion: 2 }));
  await s.step(id);
  expect((await s.t.run((ctx) => ctx.db.get(id)))!.reason).toBe(
    "context_changed",
  );
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
});
it("skips rejected acquisition without erasing a saved link, and visits the next link", async () => {
  const s = await setup();
  const first = await s.source(1),
    second = await s.source(2);
  const id = await s.prepare();
  await s.inventory(id);
  await s.approve(id);
  const lease = (await s.t.mutation(internal.libraryScans.claim, { id }))!;
  await expect(
    s.t.mutation(internal.libraryScans.step, { id, lease }),
  ).rejects.toThrow("MEDIA_UNAVAILABLE");
  expect(
    await s.t.mutation(internal.libraryScans.skipUnavailable, { id, lease }),
  ).toBe(true);
  const j = await s.t.run((ctx) => ctx.db.get(id));
  expect(j!.skippedCount).toBe(1);
  expect((await s.t.run((ctx) => ctx.db.get(first)))!.state).toBe(
    "needs_upload",
  );
  expect((await s.t.run((ctx) => ctx.db.get(second)))!.generation).toBe(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
});
it("preserves an unknown analysis hold and prevents skip or resume from bypassing it", async () => {
  const s = await setup();
  const source = await s.source(1);
  const id = await s.prepare();
  await s.inventory(id);
  await s.approve(id);
  await s.t.run((ctx) => reserve(ctx, s.org, `source:${source}:1`, 10));
  const lease = (await s.t.mutation(internal.libraryScans.claim, { id }))!;
  await expect(
    s.t.mutation(internal.libraryScans.step, { id, lease }),
  ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
  expect(
    await s.t.mutation(internal.libraryScans.skipUnavailable, { id, lease }),
  ).toBe(false);
  await s.t.mutation(internal.libraryScans.blocked, {
    id,
    lease,
    reason: "COST_RECONCILIATION_REQUIRED",
  });
  await expect(s.approve(id)).rejects.toThrow("APPROVAL_STALE");
  expect(
    (await s.t.run((ctx) => ctx.db.query("reservations").first()))!.state,
  ).toBe("active");
});
it("enforces the scan ceiling before creating additional reservations", async () => {
  const s = await setup();
  await s.source(1);
  const id = await s.prepare();
  await s.inventory(id);
  await s.approve(id, 10);
  await s.t.run((ctx) => ctx.db.patch(id, { committedCredits: 10 }));
  const lease = (await s.t.mutation(internal.libraryScans.claim, { id }))!;
  await expect(
    s.t.mutation(internal.libraryScans.step, { id, lease }),
  ).rejects.toThrow("BUDGET_EXCEEDED");
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
});
it("uses only advertised own-account models and requires fresh permission before a durable scan grant", async () => {
  const s = await setup();
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["scan-owner"]');
  const id = await s.prepare();
  await s.inventory(id);
  const device = await s.t.run((ctx) =>
    ctx.db.insert("devices", {
      organizationId: s.org,
      owner: s.owner,
      name: "Synthetic laptop",
      fingerprint: "a".repeat(64),
      codeHash: "b".repeat(64),
      credentialHash: "c".repeat(64),
      state: "paired",
      capabilities: [],
      expiresAt: Date.now() + 600000,
      lastSeenAt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      personalSeenAt: Date.now(),
      personalProfileBinding: "d".repeat(64),
      personalModels: [
        { slug: "synthetic-available", displayName: "Synthetic available" },
      ],
    }),
  );
  const approval = {
    id,
    version: 1,
    maximumCredits: 100,
    funding: "own_plan" as const,
    deviceId: device,
    model: "gpt-6.1-sol",
    effort: "medium" as const,
  };
  await expect(
    s.a.mutation(api.libraryScans.approve, approval),
  ).rejects.toThrow("SETUP_REQUIRED");
  await expect(
    s.t
      .withIdentity({ subject: "scan-owner" })
      .mutation(api.libraryScans.approve, {
        ...approval,
        model: "synthetic-available",
      }),
  ).resolves.toBeDefined();
  const job = await s.t.run((ctx) => ctx.db.get(id));
  expect(job!.personal).toMatchObject({
    model: "synthetic-available",
    effort: "medium",
    profileBinding: "d".repeat(64),
  });
  expect(job!.personal!.expiresAt).toBe(Date.now() + 86400000);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
});
it("gathers surviving saved-link evidence before project comparisons, preserving manual exclusions", async () => {
  const s = await setup();
  const source = await s.source(1, true);
  await s.source(2, true, "text");
  await s.t.mutation(internal.knowledge.backfill, {});
  const members = await s.t.run((ctx) =>
    ctx.db.query("knowledgeMembers").collect(),
  );
  await s.t.run((ctx) =>
    ctx.db.patch(members.find((m) => m.sourceId !== source)!._id, {
      excluded: true,
      manual: true,
    }),
  );
  const id = await s.prepare();
  await s.inventory(id);
  await s.approve(id);
  for (let n = 0; n < 12; n++) {
    await s.step(id);
    const j = await s.t.run((ctx) => ctx.db.get(id));
    if (j!.pendingKnowledge) break;
  }
  const j = await s.t.run((ctx) => ctx.db.get(id));
  expect(j!.phase).toBe("knowledge");
  expect(j!.pendingKnowledge).toBeDefined();
  const k = await s.t.run((ctx) => ctx.db.get(j!.pendingKnowledge!));
  expect(k!.references.map((r) => r.sourceId)).toEqual([source]);
  expect(
    await s.t.run((ctx) => ctx.db.query("knowledgeEvaluations").collect()),
  ).toHaveLength(0);
  expect(
    (await s.t.run((ctx) =>
      ctx.db.get(members.find((m) => m.sourceId !== source)!._id),
    ))!.excluded,
  ).toBe(true);
  await s.t.run((ctx) =>
    ctx.db.patch(k!._id, {
      state: "ready",
      output: {
        explanation: "Synthetic",
        claims: [],
        relations: [],
        uncertainty: "Synthetic",
      },
    }),
  );
  await s.step(id);
  expect((await s.t.run((ctx) => ctx.db.get(id)))!.gatheredCount).toBe(1);
});
it("keeps the expanded repository allowance personal and bounded", () => {
  vi.stubEnv("PERSONAL_REPOSITORY_LIMIT", "20");
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["verified-owner"]');
  expect(repositoryAllowance("trial", "verified-owner")).toBe(20);
  expect(repositoryAllowance("trial", "other-admin")).toBe(3);
  expect(repositoryAllowance("pro", "other-admin")).toBe(15);
  vi.stubEnv("DISABLE_PERSONAL_ANALYSIS", "true");
  expect(repositoryAllowance("trial", "verified-owner")).toBe(20);
  vi.stubEnv("PERSONAL_REPOSITORY_LIMIT", "Infinity");
  expect(repositoryAllowance("trial", "verified-owner")).toBe(3);
  vi.stubEnv("PERSONAL_REPOSITORY_LIMIT", "1001");
  expect(repositoryAllowance("trial", "verified-owner")).toBe(3);
});
it("evaluates late saved-link evidence for every selected repository and retains no-fit results without creating issues", async () => {
  const s = await setup();
  for (let n = 0; n < 28; n++) await s.source(n, true);
  for (let n = 30; n < 44; n++) await s.source(n, true, "text");
  let cursor: string | undefined;
  do {
    const page = await s.t.mutation(internal.knowledge.backfill, { cursor });
    cursor = page!.done ? undefined : page!.cursor;
  } while (cursor);
  const members = await s.t.run((ctx) =>
    ctx.db.query("knowledgeMembers").collect(),
  );
  await s.t.run((ctx) =>
    ctx.db.patch(members[0]._id, { excluded: true, manual: true }),
  );
  const other = await s.t.run(async (ctx) => {
    const {
      _id: _ignored,
      _creationTime: _time,
      ...repo
    } = (await ctx.db.get(s.repo))!;
    return ctx.db.insert("repositories", {
      ...repo,
      providerId: 56,
      fullName: "owned/second",
    });
  });
  await s.t.run(async (ctx) => {
    const w = await wallet(ctx, s.org);
    await ctx.db.patch(w._id, { granted: 100 });
    for (const p of await ctx.db
      .query("creditPools")
      .withIndex("by_org", (q) => q.eq("organizationId", s.org))
      .collect())
      await ctx.db.patch(p._id, { granted: 100 });
  });
  const id = await s.a.mutation(api.libraryScans.prepare, {
    organizationId: s.org,
    repositoryIds: [s.repo, other],
  });
  await s.inventory(id);
  await s.approve(id, 100);
  await s.t.run((ctx) =>
    ctx.db.patch(id, {
      phase: "topics",
      topicCutoff: Date.now(),
      cursor: null,
    }),
  );
  for (let n = 0; n < 60; n++) {
    const j = (await s.t.run((ctx) => ctx.db.get(id)))!;
    if (j.state === "completed") break;
    if (j.pendingEvaluation)
      await s.t.run((ctx) =>
        ctx.db.patch(j.pendingEvaluation!, {
          state: "ready",
          output: { disposition: "no_fit" },
        }),
      );
    await s.step(id);
  }
  const job = (await s.t.run((ctx) => ctx.db.get(id)))!;
  expect(job.state).toBe("completed");
  expect(job.issueCount).toBe(0);
  expect(job.noFitCount).toBeGreaterThanOrEqual(6);
  const rows = await s.t.run((ctx) =>
    ctx.db.query("knowledgeEvaluations").collect(),
  );
  for (const repo of [s.repo, other]) {
    const refs = rows
      .filter((e) => e.repositoryId === repo)
      .flatMap((e) => e.references);
    expect(new Set(refs.map((r) => r.sourceId)).size).toBe(27);
    for (const r of refs) {
      expect((await s.t.run((ctx) => ctx.db.get(r.sourceId)))!.kind).toBe(
        "url",
      );
      expect(r.sourceId).not.toBe(members[0].sourceId);
    }
  }
  expect(
    await s.t.run((ctx) => ctx.db.query("issueDrafts").collect()),
  ).toHaveLength(0);
});

it("renews a settled monthly policy and refuses to erase an active unknown hold", async () => {
  const s = await setup();
  const args = {
    repositoryId: s.repo,
    version: 0,
    mode: "review",
    monthlyCredits: 100,
    perRunCredits: 30,
    categories: ["documentation"],
    requiredChecks: ["verify"],
    merge: false,
  };
  const id = await s.a.mutation(api.improvementPolicies.save, args);
  await s.t.run((ctx) => ctx.db.patch(id, { period: "2000-01", used: 90 }));
  await s.t.run((ctx) => reserve(ctx, s.org, "synthetic-unknown-monthly", 10));
  await expect(
    s.a.mutation(api.improvementPolicies.save, { ...args, version: 1 }),
  ).rejects.toThrow(/COST_RECONCILIATION_REQUIRED/);
  expect((await s.t.run((ctx) => ctx.db.get(id)))!.period).toBe("2000-01");
  await s.t.run(async (ctx) => {
    const hold = (await ctx.db.query("reservations").collect())[0];
    // Synthetic test receipt: production never infers settlement from elapsed time.
    await ctx.db.patch(hold._id, { state: "settled", settled: 0 });
  });
  await s.a.mutation(api.improvementPolicies.save, { ...args, version: 1 });
  const renewed = (await s.t.run((ctx) => ctx.db.get(id)))!;
  expect(renewed.period).toBe(new Date().toISOString().slice(0, 7));
  expect(renewed.used).toBe(0);
  expect(renewed.reserved).toBe(0);
});
