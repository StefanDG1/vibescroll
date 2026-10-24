import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { reserve, settle } from "../convex/product";
import { failedInferenceSettlement } from "../convex/lib/googleInference";
import { RETRIEVAL_VERSION } from "../packages/repositories/retrieval";
import insight from "../fixtures/insight.json";
import proposal from "../fixtures/proposal.json";
import { buildProjectSourceContent } from "../convex/lib/projectSourceContent";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function legacyFixture(completed = false) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject: "matching-rollout-owner",
    email: "rollout@example.test",
    name: "Synthetic rollout owner",
  });
  const owner = t.withIdentity({ subject: "matching-rollout-owner" });
  const organizationId = await owner.mutation(api.organizations.create, {
    name: "Matching rollout fixture",
  });
  const now = Date.now();
  const saved = await t.run(async (ctx) => {
    const sourceId = await ctx.db.insert("sources", {
      organizationId,
      key: "rollout-legacy-source",
      canonical: "text:rollout-legacy-source",
      kind: "text",
      title: "Synthetic retained legacy source",
      text: "Permitted synthetic note.",
      state: "ready",
      coverage: "caption_only",
      tags: [],
      rightsAttested: true,
      generation: 1,
      analysis: insight,
      createdAt: now,
      updatedAt: now,
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      installationId: 1,
      providerId: 1,
      fullName: "fixture/rollout",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      status: "ready",
      profile: "Synthetic current project",
      profileVersion: 1,
      manifest: proposal.repositoryEvidence.map((e) => e.path),
      context: "Synthetic inspected context",
      contextExcerpts: proposal.repositoryEvidence.map((e) => ({
        path: e.path,
        startLine: 1,
        endLine: 25,
        blobSha: "b".repeat(40),
        content: Array(25)
          .fill("Synthetic observed repository line")
          .join("\n"),
      })),
      createdAt: now,
      updatedAt: now,
    });
    const detail = {
      ...proposal,
      repositoryId,
      insightIds: insight.insights.map((i) => i.id),
      sourceEvidence: insight.insights.flatMap((i) => i.evidence),
    };
    // Exact pre-upgrade key shape: there was no source.updatedAt component.
    const semanticKey = `match:${RETRIEVAL_VERSION}:${sourceId}:1:${repositoryId}:${"a".repeat(40)}:1`;
    const key = `${semanticKey}:attempt:1`;
    await reserve(ctx, organizationId, key, 10);
    const proposalId = completed
      ? await ctx.db.insert("proposals", {
          organizationId,
          sourceId,
          repositoryId,
          baseSha: "a".repeat(40),
          profileVersion: 1,
          disposition: detail.disposition,
          title: detail.title,
          detail,
          review: "unreviewed",
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
      : undefined;
    const jobId = await ctx.db.insert("matchingJobs", {
      organizationId,
      sourceId,
      repositoryId,
      key: semanticKey,
      reservationKey: key,
      attempt: 1,
      state: completed ? "completed" : "pending",
      ...(proposalId ? { proposalId } : {}),
      insightIds: detail.insightIds,
      createdAt: now,
      updatedAt: now,
      // Deliberately no actor/sourceGeneration/sourceRevision or typed bindings.
    });
    if (completed) await settle(ctx, organizationId, key, 2);
    return {
      sourceId,
      repositoryId,
      detail,
      semanticKey,
      key,
      jobId,
      proposalId,
    };
  });
  const commit = () =>
    t.mutation(internal.product.addProposal, {
      sourceId: saved.sourceId,
      repositoryId: saved.repositoryId,
      detail: saved.detail,
      matchKey: saved.semanticKey,
      sourceGeneration: 1,
    });
  return { t, owner, actor, organizationId, ...saved, commit };
}

it("applies a whole post as distinct atomic proposals, reuses only the exact content mode and keeps each review independent", async () => {
  const s = await legacyFixture();
  const args = {
    id: s.sourceId,
    repositoryId: s.repositoryId,
    maxCredits: 10,
    multipleProposals: true,
    includeSourceContent: true,
  };
  const quoted = await s.owner.mutation(api.jobs.reserveMatch, args);
  expect(quoted.sourceContent?.transcript).toBe("Permitted synthetic note.");
  const repo = await s.t.run((ctx) => ctx.db.get(s.repositoryId));
  const details = [
    {
      ...s.detail,
      title: "First independent synthetic change",
      proposedChange: "Implement the first observed improvement.",
    },
    {
      ...s.detail,
      title: "Second independent synthetic change",
      proposedChange: "Implement a separate observed improvement.",
    },
  ];
  const commit = {
    sourceId: s.sourceId,
    repositoryId: s.repositoryId,
    output: { schemaVersion: "post-project-proposals-v1", proposals: details },
    matchKey: quoted.semanticKey,
    sourceGeneration: 1,
    inspectedContext: repo!.contextExcerpts!,
    inspectionManifest: repo!.contextExcerpts!.map((row) => ({
      path: row.path,
      blobSha: row.blobSha,
      mode: "100644",
      size: row.content.length,
    })),
  };
  const ids = await s.t.mutation(internal.product.addProposalGroup, commit);
  expect(ids).toHaveLength(2);
  expect(await s.t.mutation(internal.product.addProposalGroup, commit)).toEqual(
    ids,
  );
  expect((await s.owner.mutation(api.jobs.reserveMatch, args)).cached).toBe(
    true,
  );
  const lean = await s.owner.mutation(api.jobs.reserveMatch, {
    ...args,
    includeSourceContent: false,
  });
  expect(lean.cached).toBe(false);
  expect(lean.sourceContent).toBeUndefined();
  expect(lean.semanticKey).not.toBe(quoted.semanticKey);
  await s.t.run(async (ctx) => {
    const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
    expect(rows.map((p) => p?.review)).toEqual(["unreviewed", "unreviewed"]);
    expect(rows.every((p) => !p?.planHash)).toBe(true);
    await ctx.db.patch(ids[0], { review: "rejected" });
    expect((await ctx.db.get(ids[1]))?.review).toBe("unreviewed");
    expect(await ctx.db.query("runs").collect()).toEqual([]);
  });
});

it("rolls the whole proposal group back on invalid evidence, duplicated ideas or changed source content", async () => {
  const s = await legacyFixture();
  const quoted = await s.owner.mutation(api.jobs.reserveMatch, {
    id: s.sourceId,
    repositoryId: s.repositoryId,
    maxCredits: 10,
    multipleProposals: true,
    includeSourceContent: true,
  });
  const repo = await s.t.run((ctx) => ctx.db.get(s.repositoryId));
  const first = {
    ...s.detail,
    proposedChange: "First supported synthetic change",
  };
  const commit = {
    sourceId: s.sourceId,
    repositoryId: s.repositoryId,
    matchKey: quoted.semanticKey,
    sourceGeneration: 1,
    inspectedContext: repo!.contextExcerpts!,
    inspectionManifest: repo!.contextExcerpts!.map((row) => ({
      path: row.path,
      blobSha: row.blobSha,
      mode: "100644",
      size: row.content.length,
    })),
  };
  await expect(
    s.t.mutation(internal.product.addProposalGroup, {
      ...commit,
      output: {
        schemaVersion: "post-project-proposals-v1",
        proposals: [
          first,
          {
            ...first,
            proposedChange: "Second change",
            insightIds: ["invented"],
          },
        ],
      },
    }),
  ).rejects.toThrow(/insight/i);
  expect(
    await s.t.run((ctx) => ctx.db.query("proposals").collect()),
  ).toHaveLength(0);
  await expect(
    s.t.mutation(internal.product.addProposalGroup, {
      ...commit,
      output: {
        schemaVersion: "post-project-proposals-v1",
        proposals: [first, first],
      },
    }),
  ).rejects.toThrow(/distinct/);
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { text: "Changed retained source text" }),
  );
  await expect(
    s.t.mutation(internal.product.addProposalGroup, {
      ...commit,
      output: {
        schemaVersion: "post-project-proposals-v1",
        proposals: [first],
      },
    }),
  ).rejects.toThrow(/transcript|images/i);
  expect(
    await s.t.run((ctx) => ctx.db.query("proposals").collect()),
  ).toHaveLength(0);
});

it("includes only current retained image pixels, binds their versions and reports unavailable images without reacquiring", async () => {
  const s = await legacyFixture();
  const retained = await s.t.run(async (ctx) => {
    const base = {
      organizationId: s.organizationId,
      sourceId: s.sourceId,
      sourceGeneration: 1,
      kind: "evidence",
      type: "image/jpeg",
      state: "complete",
      size: 100,
      etag: "a".repeat(32),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const id = await ctx.db.insert("assets", {
      ...base,
      key: "synthetic/current",
    });
    await ctx.db.insert("assets", {
      ...base,
      key: "synthetic/expired",
      expiresAt: Date.now() - 1,
    });
    await ctx.db.insert("assets", {
      ...base,
      key: "old",
      sourceGeneration: 0,
    });
    await ctx.db.insert("assets", {
      ...base,
      key: "thumbnail",
      kind: "preview",
    });
    return id;
  });
  const before = await s.t.run(async (ctx) =>
    buildProjectSourceContent(ctx, (await ctx.db.get(s.sourceId))!),
  );
  expect(before.images.map((image) => image.id)).toEqual([retained]);
  await s.t.run((ctx) => ctx.db.patch(retained, { etag: "b".repeat(32) }));
  const changed = await s.t.run(async (ctx) =>
    buildProjectSourceContent(ctx, (await ctx.db.get(s.sourceId))!),
  );
  expect(changed.binding.contentHash).not.toBe(before.binding.contentHash);
  await s.t.run((ctx) => ctx.db.patch(retained, { state: "deleted" }));
  const missing = await s.t.run(async (ctx) =>
    buildProjectSourceContent(ctx, (await ctx.db.get(s.sourceId))!),
  );
  expect(missing.images).toEqual([]);
  expect(missing.warnings.join(" ")).toMatch(/not been fetched again/);
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  await expect(
    s.t.run(async (ctx) =>
      buildProjectSourceContent(ctx, (await ctx.db.get(s.sourceId))!),
    ),
  ).rejects.toThrow(/retained source/);
});

it("rechecks withdrawal and retirement before issuing image access or dispatching captured source content", async () => {
  vi.stubEnv("DISABLE_INFERENCE", "false");
  vi.stubEnv("RESTORE_LOCK", "false");
  const s = await legacyFixture();
  const assetId = await s.t.run((ctx) =>
    ctx.db.insert("assets", {
      organizationId: s.organizationId,
      sourceId: s.sourceId,
      sourceGeneration: 1,
      key: "synthetic/pending-image",
      size: 100,
      etag: "a".repeat(32),
      type: "image/jpeg",
      kind: "evidence",
      state: "complete",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  const quoted = await s.owner.mutation(api.jobs.reserveMatch, {
    id: s.sourceId,
    repositoryId: s.repositoryId,
    maxCredits: 10,
    multipleProposals: true,
    includeSourceContent: true,
  });
  const args = {
    key: quoted.semanticKey,
    reservationKey: quoted.key,
    baseSha: s.detail.baseSha,
    profileVersion: s.detail.profileVersion,
  };
  expect(
    (
      await s.t.query(internal.jobs.matchingContext, {
        ...args,
        imageId: assetId,
      })
    ).image?.id,
  ).toBe(assetId);
  await s.t.run((ctx) =>
    ctx.db.insert("objectDeletions", {
      key: "synthetic/pending-image",
      attempts: 1,
      state: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await expect(
    s.t.query(internal.jobs.matchingContext, { ...args, imageId: assetId }),
  ).rejects.toThrow(/retired/);
  await expect(s.t.query(internal.jobs.matchingContext, args)).rejects.toThrow(
    /changed/,
  );
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  await expect(s.t.query(internal.jobs.matchingContext, args)).rejects.toThrow(
    /permissions/,
  );
});

it("rejects a pre-upgrade pending completion and settles only measured work once without inventing authority or fallback", async () => {
  const s = await legacyFixture(),
    network = vi.spyOn(globalThis, "fetch");
  const sourceBefore = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  let rejection: unknown;
  try {
    await s.commit();
  } catch (error) {
    rejection = error;
  }
  expect(rejection).toBeInstanceOf(Error);
  expect(String(rejection)).toContain("APPROVAL_STALE");
  const finish = {
    organizationId: s.organizationId,
    key: s.key,
    semanticKey: s.semanticKey,
    ...failedInferenceSettlement(rejection, true, 3),
  };
  await s.t.mutation(internal.jobs.finishMatch, finish);
  await s.t.mutation(internal.jobs.finishMatch, finish);
  await expect(s.commit()).rejects.toThrow("APPROVAL_STALE");
  await s.t.run(async (ctx) => {
    const job = (await ctx.db.get(s.jobId))!;
    expect(job).toMatchObject({
      state: "failed",
      reservationKey: s.key,
      attempt: 1,
    });
    expect(job.actor).toBeUndefined();
    expect(job.sourceGeneration).toBeUndefined();
    expect(job.sourceRevision).toBeUndefined();
    expect(job.proposalId).toBeUndefined();
    expect(await ctx.db.get(s.sourceId)).toEqual(sourceBefore);
    const reservations = await ctx.db.query("reservations").collect();
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      key: s.key,
      max: 10,
      settled: 3,
      state: "settled",
    });
    expect(await ctx.db.query("costEntries").collect()).toMatchObject([
      { key: s.key, credits: 3, units: 3, costStatus: "ceiling_only" },
    ]);
    expect(await ctx.db.query("wallets").collect()).toMatchObject([
      { spent: 3, reserved: 0 },
    ]);
    expect(await ctx.db.query("creditPools").collect()).toMatchObject([
      { spent: 3, reserved: 0 },
    ]);
    for (const budget of await ctx.db.query("operatorBudgets").collect())
      expect(budget).toMatchObject({ spent: 3, reserved: 0 });
    for (const table of [
      "proposals",
      "runs",
      "outbox",
      "localLibraryRuns",
      "inferenceReservations",
    ] as const)
      expect(await ctx.db.query(table).collect()).toEqual([]);
  });
  expect(network).not.toHaveBeenCalled();
});

it("retains unknown pre-upgrade work until measured reconciliation and never revives a deleted source", async () => {
  vi.stubEnv("MANAGED_INFERENCE_ROUTE", "google_metered");
  const s = await legacyFixture();
  await expect(s.commit()).rejects.toThrow("APPROVAL_STALE");
  await s.t.mutation(internal.jobs.finishMatch, {
    organizationId: s.organizationId,
    key: s.key,
    semanticKey: s.semanticKey,
    ...failedInferenceSettlement(new Error("APPROVAL_STALE"), true),
  });
  await s.t.run(async (ctx) => {
    expect(await ctx.db.query("reservations").collect()).toMatchObject([
      { state: "active", max: 10, settled: 0 },
    ]);
    expect(await ctx.db.query("wallets").collect()).toMatchObject([
      { spent: 0, reserved: 10 },
    ]);
    expect(await ctx.db.query("costEntries").collect()).toEqual([]);
    await ctx.db.patch(s.sourceId, { state: "deleted", generation: 2 });
  });
  expect(await s.commit()).toBeNull();
  for (let replay = 0; replay < 2; replay++)
    await s.t.mutation(internal.jobs.finishMatch, {
      organizationId: s.organizationId,
      key: s.key,
      semanticKey: s.semanticKey,
      credits: 4,
    });
  await s.t.run(async (ctx) => {
    expect(await ctx.db.get(s.sourceId)).toMatchObject({
      state: "deleted",
      generation: 2,
    });
    expect(await ctx.db.get(s.jobId)).toMatchObject({ state: "failed" });
    expect((await ctx.db.get(s.jobId))?.actor).toBeUndefined();
    expect(await ctx.db.query("proposals").collect()).toEqual([]);
    expect(await ctx.db.query("reservations").collect()).toMatchObject([
      { state: "settled", settled: 4 },
    ]);
    expect(await ctx.db.query("wallets").collect()).toMatchObject([
      { spent: 4, reserved: 0 },
    ]);
    expect(await ctx.db.query("costEntries").collect()).toHaveLength(1);
  });
});

it("does not silently replay completed legacy cache or backfill its actor when a user explicitly requests a fresh quote", async () => {
  const s = await legacyFixture(true),
    network = vi.spyOn(globalThis, "fetch");
  const old = await s.t.run((ctx) =>
    Promise.all([ctx.db.get(s.jobId), ctx.db.get(s.proposalId!)]),
  );
  await expect(s.commit()).rejects.toThrow("APPROVAL_STALE");
  const fresh = await s.owner.mutation(api.jobs.reserveMatch, {
    id: s.sourceId,
    repositoryId: s.repositoryId,
    maxCredits: 10,
  });
  expect(fresh.cached).toBe(false);
  expect(fresh.semanticKey).not.toBe(s.semanticKey);
  expect(fresh.key).not.toBe(s.key);
  await s.t.run(async (ctx) => {
    expect(
      await Promise.all([ctx.db.get(s.jobId), ctx.db.get(s.proposalId!)]),
    ).toEqual(old);
    const jobs = await ctx.db.query("matchingJobs").collect();
    expect(jobs).toHaveLength(2);
    expect(jobs.find((j) => j.key === fresh.semanticKey)).toMatchObject({
      actor: s.actor,
      state: "pending",
      sourceGeneration: 1,
    });
    expect(jobs.find((j) => j.key === s.semanticKey)?.actor).toBeUndefined();
    expect(await ctx.db.query("proposals").collect()).toHaveLength(1);
    expect(await ctx.db.query("costEntries").collect()).toMatchObject([
      { key: s.key, credits: 2 },
    ]);
    expect(await ctx.db.query("wallets").collect()).toMatchObject([
      { spent: 2, reserved: 10 },
    ]);
    expect(await ctx.db.query("runs").collect()).toEqual([]);
    // Execution approval lives on runs.approvedBy, not a separate approvals table.
    expect((await ctx.db.get(s.proposalId!))?.review).toBe("unreviewed");
    expect((await ctx.db.get(s.proposalId!))?.planHash).toBeUndefined();
    expect(await ctx.db.query("outbox").collect()).toEqual([]);
  });
  expect(network).not.toHaveBeenCalled();
});
