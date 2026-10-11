import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { repositoryContent } from "../convex/lib/repositoryContent";
import { repositoryManifest } from "../convex/lib/repositoryManifest";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";
import { sourceAuthority } from "../convex/lib/sourceAuthority";
import { knowledgeReadContext } from "../convex/lib/knowledgeReadContext";
import { referencesCurrent } from "../convex/knowledge";
import { retainedFrame } from "../convex/recovery";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup(bytesRead?: number) {
  vi.useFakeTimers();
  const t = convexTest({ schema, modules, transactionLimits: { bytesRead } });
  const user = await t.mutation(internal.accounts.syncUser, {
    subject: "synthetic-cost-audit",
    email: "audit@example.test",
    name: "Audit",
    verified: true,
  });
  const a = t.withIdentity({ subject: "synthetic-cost-audit" });
  const org = await a.mutation(api.organizations.create, {
    name: "Synthetic cost audit",
  });
  return { t, a, org, user };
}
type Setup = Awaited<ReturnType<typeof setup>>;
const sha = "a".repeat(40);
async function legacyRepository(s: Setup, providerId = 1, count = 1800) {
  const manifest = Array.from(
    { length: count },
    (_, i) => `src/synthetic-directory-${i}/long-file-name-${i}.ts`,
  );
  const manifestEntries = manifest.map((path) => ({
    path,
    blobSha: "b".repeat(40),
    mode: "100644",
    size: 30,
  }));
  const id = await s.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: s.org,
      installationId: 1,
      providerId,
      fullName: `synthetic/repo-${providerId}`,
      branch: "main",
      sha,
      enabled: true,
      confirmed: true,
      profile: "Synthetic",
      profileVersion: 4,
      selectionVersion: 2,
      manifest,
      manifestEntries,
      context: "",
      status: "connected",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      snapshotAt: Date.now(),
    }),
  );
  return { id, manifest, manifestEntries };
}
it("compacts retained manifests without changing authority, cache reuse or content export", async () => {
  const s = await setup();
  const r = await legacyRepository(s);
  const before = (await s.t.run((ctx) => ctx.db.get(r.id)))!;
  await s.t.mutation(internal.usageMaintenance.compactRepositories, {});
  const after = (await s.t.run((ctx) => ctx.db.get(r.id)))!;
  expect(JSON.stringify(after).length).toBeLessThan(16000);
  expect(after).toMatchObject({
    sha,
    profileVersion: 4,
    selectionVersion: 2,
    updatedAt: before.updatedAt,
    snapshotAt: before.snapshotAt,
  });
  const restored = await s.t.run((ctx) => repositoryContent(ctx, after));
  expect(restored?.manifest).toEqual(r.manifest);
  expect(restored?.manifestEntries).toEqual(r.manifestEntries);
  expect(
    (
      await s.t.query(internal.jobs.previousSnapshot, {
        organizationId: s.org,
        providerId: 1,
      })
    )?.manifestEntries,
  ).toEqual(r.manifestEntries);
  const exported = await s.a.query(api.jobs.exportPage, {
    organizationId: s.org,
    section: "repositories",
    cursor: null,
    asOf: Date.now(),
  });
  expect(exported.page[0]).toMatchObject({
    manifest: r.manifest,
    manifestEntries: r.manifestEntries,
  });
});
it("keeps source detail within 64 KiB when several proposals cite the same large source", async () => {
  const s = await setup(65536);
  const r = await legacyRepository(s, 1, 0);
  const sourceId = await s.t.run(async (ctx) => {
    const id = await ctx.db.insert("sources", {
      organizationId: s.org,
      title: "Synthetic source",
      key: "large",
      canonical: "large",
      kind: "text",
      text: "x".repeat(32000),
      tags: [],
      state: "ready",
      rightsAttested: true,
      coverage: "caption_only",
      generation: 1,
      analysis: { insights: [{ id: "one" }] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    for (let i = 0; i < 6; i++)
      await ctx.db.insert("proposals", {
        organizationId: s.org,
        sourceId: id,
        repositoryId: r.id,
        baseSha: sha,
        profileVersion: 4,
        title: `Synthetic ${i}`,
        detail: {},
        disposition: "useful",
        review: "unreviewed",
        version: 1,
        references: [
          {
            sourceId: id,
            generation: 1,
            revision: Date.now(),
            insightId: "one",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    return id;
  });
  expect(
    (await s.a.query(api.product.detail, { id: sourceId })).proposals,
  ).toHaveLength(6);
  await s.t.run((ctx) => ctx.db.patch(sourceId, { generation: 2 }));
  expect(
    (await s.a.query(api.product.detail, { id: sourceId })).proposals,
  ).toHaveLength(0);
});
it("refreshes moved manifests atomically and keeps them after temporary code expires", async () => {
  const s = await setup();
  const r = await legacyRepository(s, 1, 3);
  await s.t.mutation(internal.usageMaintenance.compactRepositories, {});
  const nextSha = "c".repeat(40);
  const args = {
    organizationId: s.org,
    installationId: 1,
    providerId: 1,
    fullName: "synthetic/refresh",
    branch: "main",
    sha: nextSha,
    manifest: ["new-file.ts"],
    manifestEntries: [
      {
        path: "new-file.ts",
        blobSha: "d".repeat(40),
        mode: "100644",
        size: 10,
      },
    ],
    context: "Temporary code",
    contextExcerpts: [],
  };
  expect(await s.t.mutation(internal.jobs.saveRepository, args)).toBe(r.id);
  expect(await s.t.mutation(internal.jobs.saveRepository, args)).toBe(r.id);
  expect(
    await s.t.run((ctx) => ctx.db.query("repositoryManifests").collect()),
  ).toHaveLength(1);
  await s.t.run((ctx) =>
    ctx.db.patch(r.id, { snapshotAt: Date.now() - 2 * 86400000 }),
  );
  await s.t.mutation(internal.privacy.retentionPage, {
    section: "repositories",
    cursor: null,
  });
  const repo = (await s.t.run((ctx) => ctx.db.get(r.id)))!;
  expect(repo).toMatchObject({
    sha: nextSha,
    profileVersion: 4,
    selectionVersion: 2,
    manifestStored: true,
  });
  expect(await s.t.run((ctx) => repositoryContent(ctx, repo))).toMatchObject({
    manifest: args.manifest,
    manifestEntries: args.manifestEntries,
    context: "",
  });
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "repositories",
    cursor: null,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("repositoryManifests").collect()),
  ).toHaveLength(0);
  expect((await s.t.run((ctx) => ctx.db.get(r.id)))?.enabled).toBe(false);
});
it("rejects missing, foreign or wrong-SHA manifests instead of using false evidence", async () => {
  const s = await setup();
  const r = await legacyRepository(s, 1, 1);
  await s.t.mutation(internal.usageMaintenance.compactRepositories, {});
  const repo = (await s.t.run((ctx) => ctx.db.get(r.id)))!;
  const stored = (await s.t.run((ctx) =>
    ctx.db.query("repositoryManifests").first(),
  ))!;
  await s.t.run((ctx) => ctx.db.patch(stored._id, { sha: "e".repeat(40) }));
  await expect(s.t.run((ctx) => repositoryManifest(ctx, repo))).rejects.toThrow(
    "INVALID_EVIDENCE",
  );
  const other = await s.a.mutation(api.organizations.create, {
    name: "Other synthetic workspace",
  });
  await s.t.run((ctx) =>
    ctx.db.patch(stored._id, { sha, organizationId: other }),
  );
  await expect(s.t.run((ctx) => repositoryManifest(ctx, repo))).rejects.toThrow(
    "INVALID_EVIDENCE",
  );
  await s.t.run((ctx) => ctx.db.delete(stored._id));
  await expect(
    s.t.query(internal.jobs.previousSnapshot, {
      organizationId: s.org,
      providerId: 1,
    }),
  ).rejects.toThrow("INVALID_EVIDENCE");
});
it("resumes one-repository migration pages, remains idempotent and respects the restore lock", async () => {
  const s = await setup();
  const rows = await Promise.all(
    [1, 2, 3].map((n) => legacyRepository(s, n, 2)),
  );
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.usageMaintenance.compactRepositories, {});
  expect(
    await s.t.run((ctx) => ctx.db.query("repositoryManifests").collect()),
  ).toHaveLength(0);
  vi.stubEnv("RESTORE_LOCK", "false");
  await s.t.mutation(internal.usageMaintenance.compactRepositories, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  await s.t.mutation(internal.usageMaintenance.compactRepositories, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await s.t.run((ctx) => ctx.db.query("repositoryManifests").collect()),
  ).toHaveLength(3);
  for (const r of rows)
    expect(
      (
        await s.t.run(async (ctx) =>
          repositoryContent(ctx, await ctx.db.get(r.id)),
        )
      )?.manifest,
    ).toEqual(r.manifest);
  await s.a.mutation(api.jobs.revoke, {
    organizationId: s.org,
    provider: "github",
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("repositoryManifests").collect()),
  ).toHaveLength(0);
});
it("uses versioned atomic source authority for backup and fences each later change", async () => {
  const s = await setup();
  const sourceId = await s.t.run((ctx) =>
    ctx.db.insert("sources", {
      organizationId: s.org,
      key: "authority",
      canonical: "authority",
      title: "Synthetic",
      kind: "text",
      text: "x".repeat(32000),
      state: "ready",
      tags: [],
      rightsAttested: true,
      coverage: "caption_only",
      generation: 1,
      analysis: { insights: [{ id: "one" }] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  const ref = {
    sourceId,
    generation: 1,
    revision: Date.now(),
    insightId: "one",
  };
  const key = `${s.org}/synthetic-frame`;
  await s.t.run((ctx) =>
    ctx.db.insert("assets", {
      organizationId: s.org,
      sourceId,
      key,
      kind: "evidence",
      type: "image/jpeg",
      size: 30,
      state: "complete",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await s.t.mutation(internal.usageMaintenance.projectSourceAuthority, {});
  vi.advanceTimersByTime(1);
  let cardReads = 0;
  const checked = await s.t.query(async (ctx) => {
    const guarded = {
      ...ctx,
      db: new Proxy(ctx.db, {
        get(target, property) {
          if (property === "query")
            return (table: Parameters<typeof target.query>[0]) => {
              if (table === "dashboardCards") cardReads++;
              return target.query(table);
            };
          if (property === "get")
            return (id: unknown) => {
              if (id === sourceId) throw Error("Full source read");
              return target.get(id as typeof sourceId);
            };
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    };
    const snapshot = knowledgeReadContext(guarded);
    const frames = await Promise.all([
      retainedFrame(snapshot, key, Date.now()),
      retainedFrame(snapshot, key, Date.now()),
    ]);
    return frames[0];
  });
  expect(checked?.generation).toBe(1);
  expect(cardReads).toBe(1);
  expect(await s.t.query((ctx) => referencesCurrent(ctx, s.org, [ref]))).toBe(
    true,
  );
  await s.t.run(async (ctx) => {
    await ctx.db.patch(sourceId, { generation: 2, rightsAttested: false });
    await syncDashboardCard(
      ctx,
      "sources",
      sourceId,
      await ctx.db.get(sourceId),
    );
  });
  expect(await s.t.query((ctx) => referencesCurrent(ctx, s.org, [ref]))).toBe(
    false,
  );
  expect(
    (
      await s.t.query(internal.recovery.evidenceCurrent, {
        key,
        asOf: Date.now(),
      })
    )?.generation,
  ).toBe(2);
  await s.t.run((ctx) =>
    ctx.db.insert("tombstones", {
      organizationId: s.org,
      target: sourceId,
      at: Date.now(),
    }),
  );
  expect(
    await s.t.query(internal.recovery.evidenceCurrent, {
      key,
      asOf: Date.now(),
    }),
  ).toBeNull();
  const version = await s.t.run((ctx) => ctx.db.get(sourceId));
  await s.t.mutation(internal.usageMaintenance.projectSourceAuthority, {});
  expect(await s.t.run((ctx) => ctx.db.get(sourceId))).toEqual(version);
});
it("checks restore readiness without reading terminal knowledge history", async () => {
  const s = await setup(65536);
  const r = await legacyRepository(s, 1, 0);
  const topicId = await s.t.run((ctx) =>
    ctx.db.insert("knowledgeTopics", {
      organizationId: s.org,
      key: "history",
      name: "Synthetic",
      version: 1,
      state: "ready",
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 25; i++) {
      await ctx.db.insert("knowledgeJobs", {
        organizationId: s.org,
        actor: s.user,
        topicId,
        version: 1,
        policyVersion: 1,
        cursor: null,
        next: null,
        done: true,
        state: "completed",
        key: `history-${i}`,
        references: [],
        output: "x".repeat(32000),
        processingVersion: "synthetic",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("knowledgeEvaluations", {
        organizationId: s.org,
        actor: s.user,
        topicId,
        repositoryId: r.id,
        topicVersion: 1,
        baseSha: sha,
        profileVersion: 4,
        sourceSetHash: "synthetic",
        state: "ready",
        decision: "unreviewed",
        key: `history-${i}`,
        references: [],
        output: "x".repeat(32000),
        processingVersion: "synthetic",
        covered: 0,
        omitted: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  });
  expect(
    (await s.t.query(internal.recovery.readiness, {})).quarantineComplete,
  ).toBe(true);
  await s.t.run((ctx) =>
    ctx.db.insert("knowledgeJobs", {
      organizationId: s.org,
      actor: s.user,
      topicId,
      version: 1,
      policyVersion: 1,
      cursor: null,
      next: null,
      done: false,
      state: "queued",
      key: "active",
      references: [],
      processingVersion: "synthetic",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  expect(
    (await s.t.query(internal.recovery.readiness, {})).quarantineComplete,
  ).toBe(false);
});
it("skips empty recovery actions but retains cleanup for paused policies", async () => {
  const s = await setup();
  const r = await legacyRepository(s, 1, 0);
  await s.t.mutation(internal.usageMaintenance.recoverImprovements, {});
  await s.t.mutation(internal.usageMaintenance.recoverLibraryScans, {});
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toHaveLength(0);
  await s.t.run((ctx) =>
    ctx.db.insert("improvementPolicies", {
      organizationId: s.org,
      repositoryId: r.id,
      actor: s.user,
      version: 1,
      selectionVersion: 2,
      mode: "individual",
      monthlyCredits: 0,
      perRunCredits: 0,
      categories: [],
      requiredChecks: [],
      merge: false,
      deploy: false,
      period: "synthetic",
      used: 0,
      reserved: 1,
      expiresAt: Date.now() - 1,
      paused: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await s.t.mutation(internal.usageMaintenance.recoverImprovements, {});
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toHaveLength(1);
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.usageMaintenance.recoverImprovements, {});
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toHaveLength(1);
});
it("avoids duplicate V1 billing reconciliation while retaining the existing legacy route", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.insert("billing", {
      organizationId: s.org,
      customerId: "synthetic-customer",
      status: "free",
      periodEnd: 0,
      verifiedAt: Date.now(),
      revision: 1,
    }),
  );
  vi.stubEnv("STRIPE_SECRET_KEY", "synthetic-test-key");
  vi.stubEnv("STRIPE_V1_WEBHOOK_SECRET", "synthetic-v1");
  await s.t.mutation(internal.usageMaintenance.reconcileBilling, {});
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(jobs).toHaveLength(1);
  expect(jobs[0].name).toContain("reconciliation");
  vi.stubEnv("STRIPE_V1_WEBHOOK_SECRET", "");
  await s.t.mutation(internal.usageMaintenance.reconcileBilling, {});
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toHaveLength(3);
});
it("falls back for legacy and missing source projections using the current canonical generation", async () => {
  const s = await setup();
  const id = await s.t.run((ctx) =>
    ctx.db.insert("sources", {
      organizationId: s.org,
      key: "overflow",
      canonical: "overflow",
      title: "Synthetic",
      kind: "text",
      state: "ready",
      tags: [],
      rightsAttested: true,
      generation: 1,
      coverage: "caption_only",
      analysis: {
        insights: Array.from({ length: 129 }, (_, i) => ({ id: `id-${i}` })),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  expect((await s.t.query((ctx) => sourceAuthority(ctx, id)))?.generation).toBe(
    1,
  );
  await s.t.mutation(internal.usageMaintenance.projectSourceAuthority, {});
  await s.t.run(async (ctx) => {
    const card = (await ctx.db
      .query("dashboardCards")
      .withIndex("by_entity", (q) => q.eq("entityId", id))
      .unique())!;
    await ctx.db.patch(card._id, { sourceAuthorityVersion: undefined });
    await ctx.db.patch(id, { generation: 2 });
  });
  expect((await s.t.query((ctx) => sourceAuthority(ctx, id)))?.generation).toBe(
    2,
  );
  await s.t.run(async (ctx) => {
    const card = (await ctx.db
      .query("dashboardCards")
      .withIndex("by_entity", (q) => q.eq("entityId", id))
      .unique())!;
    await ctx.db.delete(card._id);
  });
  expect((await s.t.query((ctx) => sourceAuthority(ctx, id)))?.generation).toBe(
    2,
  );
});
