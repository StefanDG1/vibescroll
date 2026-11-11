import { afterEach, expect, it, vi } from "vitest";
import { fixture } from "./chat-proposal-fixture";
import { api, internal } from "../convex/_generated/api";

afterEach(() => vi.unstubAllEnvs());

it("rejects an oversized selection before changing connections, wallets or scheduling work", async () => {
  const f = await fixture();
  const snapshot = () =>
    f.t.run(async (ctx) => ({
      repositories: await ctx.db.query("repositories").collect(),
      wallets: await ctx.db.query("wallets").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
  const before = await snapshot();
  await expect(
    f.owner.mutation(api.repositorySelection.save, {
      organizationId: f.org,
      draftContext: false,
      maxCredits: 0,
      choices: Array.from({ length: 1001 }, (_, i) => ({
        installationId: 42,
        providerId: i + 100,
        fullName: `owned/project-${i}`,
      })),
    }),
  ).rejects.toThrow("batches of at most 1,000");
  expect(await snapshot()).toEqual(before);
});

it("connects a sixteenth Pro repository without spending credits or changing existing project data", async () => {
  const f = await fixture();
  await f.t.mutation(internal.commerce.grantPeriod, {
    organizationId: f.org,
    subscription: "sub_pro_capacity",
    tier: "pro",
    interval: "monthly",
    start: Date.now(),
    end: Date.now() + 31 * 86400000,
    verifiedPayment: true,
  });
  const old = await f.t.run((ctx) => ctx.db.get(f.projectId));
  await f.t.run(async (ctx) => {
    const { _id, _creationTime, ...copy } = old!;
    for (let n = 0; n < 14; n++)
      await ctx.db.insert("repositories", {
        ...copy,
        providerId: 100 + n,
        fullName: `owned/project-${n}`,
      });
  });
  const before = await f.t.run(async (ctx) => ({
    repositories: await ctx.db.query("repositories").collect(),
    wallets: await ctx.db.query("wallets").collect(),
  }));
  const id = await f.t.mutation(internal.jobs.saveRepository, {
    organizationId: f.org,
    installationId: 42,
    providerId: 5000,
    fullName: "owned/sixteenth",
    sha: "a".repeat(40),
    branch: "main",
    manifest: [],
    context: "",
  });
  expect(await f.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    fullName: "owned/sixteenth",
    enabled: true,
  });
  const after = await f.t.run(async (ctx) => ({
    repositories: await ctx.db.query("repositories").collect(),
    wallets: await ctx.db.query("wallets").collect(),
  }));
  expect(after.repositories).toHaveLength(16);
  expect(after.repositories.filter((r) => r._id !== id)).toEqual(
    before.repositories,
  );
  expect(after.wallets).toEqual(before.wallets);
});

it("saves sixteen authorized Pro selections in one batch without an analysis charge", async () => {
  const f = await fixture();
  await f.t.mutation(internal.commerce.grantPeriod, {
    organizationId: f.org,
    subscription: "sub_pro_selection",
    tier: "pro",
    interval: "monthly",
    start: Date.now(),
    end: Date.now() + 31 * 86400000,
    verifiedPayment: true,
  });
  const choices = [
    { installationId: 42, providerId: 55, fullName: "owned/synthetic" },
    ...Array.from({ length: 15 }, (_, i) => ({
      installationId: 42,
      providerId: 2000 + i,
      fullName: `owned/selected-${i}`,
    })),
  ];
  await f.t.run(async (ctx) => {
    const now = Date.now(),
      tenant = { organizationId: f.org, createdAt: now, updatedAt: now };
    await ctx.db.insert("connections", {
      ...tenant,
      provider: "github",
      ciphertext: "synthetic-unused",
      keyVersion: "test",
      status: "connected",
    });
    await ctx.db.insert("githubBindings", {
      ...tenant,
      githubUserId: 42,
      installationId: 42,
      repositories: choices.map((c) => ({
        id: c.providerId,
        fullName: c.fullName,
      })),
      status: "connected",
    });
  });
  const before = await f.t.run((ctx) => ctx.db.query("wallets").collect());
  const result = await f.owner.mutation(api.repositorySelection.save, {
    organizationId: f.org,
    choices,
    draftContext: false,
    maxCredits: 0,
  });
  expect(result).toHaveLength(16);
  expect(
    await f.t.run((ctx) => ctx.db.query("repositories").collect()),
  ).toHaveLength(16);
  expect(await f.t.run((ctx) => ctx.db.query("wallets").collect())).toEqual(
    before,
  );
  expect(await f.t.run((ctx) => ctx.db.get(f.projectId))).toMatchObject({
    sha: "a".repeat(40),
    confirmed: true,
  });
});

async function preparedRefresh() {
  const f = await fixture();
  const before = await f.t.run((ctx) => ctx.db.get(f.projectId));
  const otherId = await f.t.run(async (ctx) => {
    const { _id, _creationTime, ...copy } = before!;
    return ctx.db.insert("repositories", {
      ...copy,
      providerId: 56,
      fullName: "owned/other",
    });
  });
  return {
    ...f,
    before,
    otherId,
    args: {
      id: f.projectId,
      expectedSha: "a".repeat(40),
      expectedSelectionVersion: 0,
    },
  };
}

it("refreshes only the selected project without changing its confirmed profile or another project", async () => {
  const f = await preparedRefresh();
  const other = await f.t.run((ctx) => ctx.db.get(f.otherId));
  const refresh = await f.owner.mutation(
    api.repositorySelection.startRefresh,
    f.args,
  );
  expect(refresh).toMatchObject({
    id: f.projectId,
    selectionVersion: 1,
    snapshotPaths: [],
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.projectId))).toMatchObject({
    profile: f.before!.profile,
    profileVersion: 1,
    confirmed: true,
    status: "preparing",
    sha: "a".repeat(40),
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.otherId))).toEqual(other);
  expect(
    await f.t.run((ctx) => ctx.db.query("proposalOperations").collect()),
  ).toEqual([]);
});

it("admits one concurrent refresh and refuses stale replays before another preparation", async () => {
  const f = await preparedRefresh();
  const results = await Promise.allSettled([
    f.owner.mutation(api.repositorySelection.startRefresh, f.args),
    f.owner.mutation(api.repositorySelection.startRefresh, f.args),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await f.t.run((ctx) => ctx.db.get(f.projectId))).toMatchObject({
    selectionVersion: 1,
  });
  await expect(
    f.owner.mutation(api.repositorySelection.startRefresh, {
      ...f.args,
      expectedSelectionVersion: 1,
    }),
  ).rejects.toThrow("SOURCE_BUSY");
});

it("requires the project's normal owner/admin session and retains the snapshot on refusal", async () => {
  const f = await preparedRefresh();
  await expect(
    f.t
      .withIdentity({ subject: "stranger" })
      .mutation(api.repositorySelection.startRefresh, f.args),
  ).rejects.toThrow();
  await expect(
    f.assistant.mutation(api.repositorySelection.startRefresh, f.args),
  ).rejects.toThrow();
  await expect(
    f.owner.mutation(api.repositorySelection.startRefresh, {
      ...f.args,
      expectedSha: "b".repeat(40),
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(await f.t.run((ctx) => ctx.db.get(f.projectId))).toEqual(f.before);
});

it("fences a returned snapshot after repository selection changes, preserving current data", async () => {
  const f = await preparedRefresh();
  const refresh = await f.owner.mutation(
    api.repositorySelection.startRefresh,
    f.args,
  );
  await f.t.run((ctx) =>
    ctx.db.patch(f.projectId, { enabled: false, selectionVersion: 2 }),
  );
  await expect(
    f.owner.mutation(internal.jobs.saveRepository, {
      organizationId: f.org,
      installationId: refresh.installationId,
      providerId: refresh.providerId,
      fullName: refresh.fullName,
      selectionVersion: refresh.selectionVersion,
      snapshotActor: refresh.actor,
      sha: "b".repeat(40),
      branch: "main",
      manifest: [],
      context: "returned snapshot",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(await f.t.run((ctx) => ctx.db.get(f.projectId))).toMatchObject({
    enabled: false,
    selectionVersion: 2,
    sha: "a".repeat(40),
  });
});
