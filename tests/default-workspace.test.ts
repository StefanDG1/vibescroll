import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.mutation(internal.accounts.syncUser, {
    subject: "default-owner",
    email: "owner@example.test",
    name: "Owner",
  });
  const owner = t.withIdentity({
    subject: "default-owner",
    auth_time: Math.floor(Date.now() / 1000),
  });
  return { t, userId, owner };
}
it("creates one owned default across concurrent first visits without purchasing or granting paid access", async () => {
  const { t, userId, owner } = await setup();
  const ids = await Promise.all(
    Array.from({ length: 4 }, () =>
      owner.mutation(api.organizations.ensureDefault, {}),
    ),
  );
  expect(new Set(ids).size).toBe(1);
  const data = await owner.query(api.accounts.current, {});
  expect(data.organizations).toEqual([
    { id: ids[0], name: "Personal workspace", role: "owner", private: true },
  ]);
  await t.run(async (ctx) => {
    expect((await ctx.db.get(userId))?.defaultWorkspaceId).toBe(ids[0]);
    expect(await ctx.db.query("billing").collect()).toEqual([]);
    expect(
      (await ctx.db.query("audit").collect()).filter(
        (x) => x.action === "organization.created",
      ),
    ).toHaveLength(1);
  });
});
it("uses existing memberships, remembers a selected workspace and rechecks lost access", async () => {
  const { t, owner, userId } = await setup();
  const first = await owner.mutation(api.organizations.create, {
    name: "Existing",
  });
  expect(await owner.mutation(api.organizations.ensureDefault, {})).toBe(first);
  const second = await owner.mutation(api.organizations.create, {
    name: "Second",
  });
  expect(
    await owner.mutation(api.organizations.ensureDefault, {
      preferredId: second,
    }),
  ).toBe(second);
  expect(await owner.mutation(api.organizations.ensureDefault, {})).toBe(
    second,
  );
  await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", second).eq("userId", userId),
      )
      .unique();
    await ctx.db.delete(membership!._id);
  });
  await expect(
    owner.mutation(api.organizations.ensureDefault, { preferredId: second }),
  ).rejects.toThrow("unavailable");
  expect(await owner.mutation(api.organizations.ensureDefault, {})).toBe(first);
  await t.run(async (ctx) => {
    await ctx.db.patch(first, { status: "deleting" });
  });
  expect(await owner.mutation(api.organizations.ensureDefault, {})).toBeNull();
  expect((await t.run((ctx) => ctx.db.get(first)))?.status).toBe("deleting");
});
it("does not undo deletion on dashboard prefetch, even after the purge, and allows explicit recreation", async () => {
  const { t, owner } = await setup();
  const first = await owner.mutation(api.organizations.create, {
    name: "Deliberately removed",
  });
  await owner.mutation(api.organizations.remove, {
    organizationId: first,
    confirmation: "Deliberately removed",
  });
  expect(await owner.mutation(api.organizations.ensureDefault, {})).toBeNull();
  await t.mutation(internal.maintenance.purgeOrganization, {
    organizationId: first,
  });
  expect(await owner.mutation(api.organizations.ensureDefault, {})).toBeNull();
  expect((await owner.query(api.accounts.current, {})).organizations).toEqual(
    [],
  );
  const next = await owner.mutation(api.organizations.create, {
    name: "Explicit replacement",
  });
  expect(await owner.mutation(api.organizations.ensureDefault, {})).toBe(next);
});
it("allows identity deletion while a confirmed workspace purge is queued", async () => {
  const { t, owner, userId } = await setup();
  const workspace = await owner.mutation(api.organizations.ensureDefault, {});
  await owner.mutation(api.organizations.remove, {
    organizationId: workspace!,
    confirmation: "Personal workspace",
  });
  expect(
    await owner.mutation(api.accounts.deleteAccount, {
      confirmation: "owner@example.test",
    }),
  ).toEqual({ status: "deleting" });
  expect((await t.run((ctx) => ctx.db.get(userId)))?.status).toBe("deleting");
  await expect(owner.query(api.accounts.current, {})).rejects.toThrow(
    "Account unavailable",
  );
});
it("rejects foreign selections, anonymous access, deleting accounts and recovery lock", async () => {
  const { t, owner, userId } = await setup();
  await t.mutation(internal.accounts.syncUser, {
    subject: "other",
    email: "other@example.test",
    name: "Other",
  });
  const foreign = await t
    .withIdentity({
      subject: "other",
      auth_time: Math.floor(Date.now() / 1000),
    })
    .mutation(api.organizations.create, { name: "Foreign" });
  await t.run((ctx) => ctx.db.patch(userId, { defaultWorkspaceId: foreign }));
  await expect(
    owner.mutation(api.organizations.ensureDefault, { preferredId: foreign }),
  ).rejects.toThrow("unavailable");
  expect(await owner.mutation(api.organizations.ensureDefault, {})).not.toBe(
    foreign,
  );
  await expect(t.mutation(api.organizations.ensureDefault, {})).rejects.toThrow(
    "Sign in",
  );
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    owner.mutation(api.organizations.ensureDefault, {}),
  ).rejects.toThrow("Recovery");
  vi.stubEnv("RESTORE_LOCK", "false");
  await t.run((ctx) => ctx.db.patch(userId, { status: "deleting" }));
  await expect(
    owner.mutation(api.organizations.ensureDefault, {}),
  ).rejects.toThrow("Account unavailable");
});
