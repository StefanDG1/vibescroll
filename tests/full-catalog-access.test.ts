import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { requireFullCatalog } from "../convex/lib/fullCatalogAccess";

const subject = "user_01234567890123456789012345";
afterEach(() => vi.unstubAllEnvs());

it("does not grant the complete catalog merely because a user can read their saved posts", async () => {
  const f = await analysisVersionFixture();
  expect(
    await f.owner.query(api.catalogAccess.status, { organizationId: f.org }),
  ).toMatchObject({ entitled: false, enabled: false, source: null });
  await expect(
    f.owner.mutation(api.catalogAccess.setEnabled, { enabled: true }),
  ).rejects.toThrow(/not included/);
  expect(
    (
      await f.owner.query(api.posts.recent, { organizationId: f.org })
    ).items.map((p) => p.id),
  ).toEqual([f.sourceId]);
});

it("keeps an operator grant separate from billing and toggling never imports or analyzes posts", async () => {
  const f = await analysisVersionFixture();
  const before = await f.t.run(async (ctx) => ({
    sources: (await ctx.db.query("sources").take(10)).length,
    wallets: await ctx.db.query("wallets").take(10),
  }));
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject,
    enabled: true,
    reason: "Owner-requested admin browse test",
  });
  expect(
    await f.owner.query(api.catalogAccess.status, { organizationId: f.org }),
  ).toMatchObject({ entitled: true, enabled: true, source: "operator" });
  await f.owner.mutation(api.catalogAccess.setEnabled, { enabled: false });
  expect(
    await f.owner.query(api.catalogAccess.status, { organizationId: f.org }),
  ).toMatchObject({ entitled: true, enabled: false });
  const after = await f.t.run(async (ctx) => ({
    sources: (await ctx.db.query("sources").take(10)).length,
    wallets: await ctx.db.query("wallets").take(10),
  }));
  expect(after).toEqual(before);
});

it("uses the current OAuth grant for MCP status and immediately honors operator revocation", async () => {
  const f = await analysisVersionFixture();
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject,
    enabled: true,
    reason: "Scoped admin test",
  });
  expect(
    await f.assistant.query(api.catalogAccess.status, {
      organizationId: f.org,
    }),
  ).toMatchObject({ entitled: true, enabled: true });
  await f.t.mutation(internal.catalogAccess.revokeOperatorAccess, { subject });
  expect(
    await f.assistant.query(api.catalogAccess.status, {
      organizationId: f.org,
    }),
  ).toMatchObject({ entitled: false, enabled: false });
});

it("does not turn a catalog grant into membership in somebody else's workspace", async () => {
  const f = await analysisVersionFixture(),
    otherSubject = "user_02234567890123456789012345";
  await f.t.mutation(internal.accounts.syncUser, {
    subject: otherSubject,
    email: "other@example.test",
    name: "Other",
  });
  const other = f.t.withIdentity({ subject: otherSubject });
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject: otherSubject,
    enabled: true,
    reason: "Independent operator test",
  });
  await expect(
    other.query(api.catalogAccess.status, { organizationId: f.org }),
  ).rejects.toThrow(/Organization unavailable/);
});

it("refuses a full-catalog read when the entitled user turns the view off", async () => {
  const f = await analysisVersionFixture();
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject,
    enabled: false,
    reason: "View-off test",
  });
  await expect(
    f.owner.run((ctx) => requireFullCatalog(ctx, f.org)),
  ).rejects.toThrow(/Turn on/);
});
