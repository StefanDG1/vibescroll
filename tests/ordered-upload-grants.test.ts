import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actor = await t.mutation(internal.accounts.syncUser, {
    subject: "synthetic-upload-owner",
    email: "upload-owner@example.test",
    name: "Synthetic upload owner",
    verified: true,
  });
  const owner = t.withIdentity({ subject: "synthetic-upload-owner" });
  const org = await owner.mutation(api.organizations.createPrivate, {});
  const files = (count = 35, size = 1000) =>
    Array.from({ length: count }, (_, index) => ({
      key: `${org}/batch-${index}`,
      size,
      type: index % 2 ? "video/mp4" : "image/png",
    }));
  return { t, owner, org, actor, files };
}
it("atomically reserves all 35 image/video objects, one existing rate-limit request and finite expiry without source/jobs", async () => {
  const s = await setup();
  expect(
    await s.owner.mutation(api.assets.grantBatch, {
      organizationId: s.org,
      files: s.files(),
    }),
  ).toEqual({ count: 35 });
  await s.t.run(async (ctx) => {
    const assets = await ctx.db.query("assets").collect();
    expect(assets).toHaveLength(35);
    expect(
      assets.every(
        (asset) =>
          asset.state === "pending" &&
          asset.expiresAt === Date.now() + 86400000,
      ),
    ).toBe(true);
    expect((await ctx.db.query("storageUsage").collect())[0].bytes).toBe(35000);
    expect(
      (
        await ctx.db
          .query("limits")
          .withIndex("by_key", (q) => q.eq("key", `upload:${s.actor}`))
          .unique()
      )?.count,
    ).toBe(1);
    expect(await ctx.db.query("sources").collect()).toEqual([]);
    expect(await ctx.db.query("reservations").collect()).toEqual([]);
    expect(await ctx.db.query("localLibraryRuns").collect()).toEqual([]);
  });
});
it("rejects unsupported, oversized, duplicate and foreign objects without partial reservations", async () => {
  const s = await setup();
  for (const files of [
    [],
    s.files(36),
    s.files(2, 125000001),
    [{ ...s.files(1)[0], size: 1.5 }],
    [{ ...s.files(1)[0], type: "audio/wav" }],
    [{ ...s.files(1)[0], key: "other-workspace/object" }],
    [s.files(1)[0], s.files(1)[0]],
  ])
    await expect(
      s.owner.mutation(api.assets.grantBatch, { organizationId: s.org, files }),
    ).rejects.toThrow();
  await s.t.run(async (ctx) => {
    expect(await ctx.db.query("assets").collect()).toEqual([]);
    expect(await ctx.db.query("storageUsage").collect()).toEqual([]);
  });
});
it("checks cumulative retained storage atomically and refuses previously granted keys", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    await ctx.db.insert("storageUsage", {
      organizationId: s.org,
      bytes: 999999000,
    });
  });
  await expect(
    s.owner.mutation(api.assets.grantBatch, {
      organizationId: s.org,
      files: s.files(2),
    }),
  ).rejects.toThrow("STORAGE_LIMIT");
  await s.owner.mutation(api.assets.grantBatch, {
    organizationId: s.org,
    files: s.files(1),
  });
  await expect(
    s.owner.mutation(api.assets.grantBatch, {
      organizationId: s.org,
      files: s.files(1),
    }),
  ).rejects.toThrow();
  expect(
    await s.t.run(
      async (ctx) => (await ctx.db.query("assets").collect()).length,
    ),
  ).toBe(1);
});
it("enforces workspace membership, capture pause and restore lock before reserving uploads", async () => {
  const s = await setup();
  await expect(
    s.t
      .withIdentity({ subject: "synthetic-other-user" })
      .mutation(api.assets.grantBatch, {
        organizationId: s.org,
        files: s.files(1),
      }),
  ).rejects.toThrow();
  vi.stubEnv("DISABLE_CAPTURE", "true");
  await expect(
    s.owner.mutation(api.assets.grantBatch, {
      organizationId: s.org,
      files: s.files(1),
    }),
  ).rejects.toThrow("CAPTURE_DISABLED");
  vi.stubEnv("DISABLE_CAPTURE", "false");
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    s.owner.mutation(api.assets.grantBatch, {
      organizationId: s.org,
      files: s.files(1),
    }),
  ).rejects.toThrow("Recovery");
  expect(
    await s.t.run(
      async (ctx) => (await ctx.db.query("assets").collect()).length,
    ),
  ).toBe(0);
});
it("shares the ten-request rate limit with single uploads rather than granting unbounded batches", async () => {
  const s = await setup();
  for (let index = 0; index < 9; index++)
    await s.owner.mutation(api.assets.grant, {
      organizationId: s.org,
      key: `${s.org}/single-${index}`,
      size: 1,
      type: "audio/wav",
    });
  await s.owner.mutation(api.assets.grantBatch, {
    organizationId: s.org,
    files: s.files(),
  });
  await expect(
    s.owner.mutation(api.assets.grantBatch, {
      organizationId: s.org,
      files: [{ ...s.files(1)[0], key: `${s.org}/another` }],
    }),
  ).rejects.toThrow("Too many requests");
  expect(
    await s.t.run(
      async (ctx) => (await ctx.db.query("assets").collect()).length,
    ),
  ).toBe(44);
});
it("retires expired pending uploads without allowing the same key to be granted again", async () => {
  const s = await setup();
  await s.owner.mutation(api.assets.grantBatch, {
    organizationId: s.org,
    files: s.files(1),
  });
  const asset = await s.t.run(
    async (ctx) => (await ctx.db.query("assets").collect())[0],
  );
  vi.setSystemTime(asset.expiresAt! + 1);
  await s.t.mutation(internal.assets.expireAsset, { id: asset._id });
  await expect(
    s.owner.mutation(api.assets.grantBatch, {
      organizationId: s.org,
      files: s.files(1),
    }),
  ).rejects.toThrow("UPLOAD_INVALID");
  await s.t.run(async (ctx) => {
    expect((await ctx.db.get(asset._id))?.state).toBe("deleting");
    expect((await ctx.db.query("storageUsage").collect())[0].bytes).toBe(1000);
    expect(
      (
        await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", asset.key))
          .unique()
      )?.state,
    ).toBe("pending");
  });
});
