import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { reserve } from "../convex/product";
import { analysisVersionFixture } from "./analysis-version-fixture";

afterEach(() => vi.unstubAllEnvs());

async function pro(
  f: Awaited<ReturnType<typeof analysisVersionFixture>>,
  organizationId: Id<"organizations">,
) {
  return f.t.run(async (ctx) => {
    const now = Date.now(),
      end = now + 86400000;
    const old = await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (old) await ctx.db.patch(old._id, { tier: "pro", periodEnd: end });
    else
      await ctx.db.insert("wallets", {
        organizationId,
        createdAt: now,
        updatedAt: now,
        granted: 300,
        purchased: 0,
        spent: 0,
        reserved: 0,
        periodEnd: end,
        tier: "pro",
        interval: "monthly",
      });
    const subscription = `synthetic-${organizationId}`;
    const billingId = await ctx.db.insert("billing", {
      organizationId,
      customerId: subscription,
      subscriptionId: subscription,
      status: "active",
      periodEnd: end,
      verifiedAt: now,
      revision: 1,
    });
    await ctx.db.insert("billingPeriods", {
      organizationId,
      createdAt: now,
      updatedAt: now,
      key: subscription,
      start: now - 1000,
      end,
      credits: 300,
      subscription,
    });
    return billingId;
  });
}

it("requires the creator's own Pro and does not mint a team allowance", async () => {
  const f = await analysisVersionFixture();
  await expect(
    f.owner.mutation(api.organizations.createTeam, {
      name: "Paid team",
    }),
  ).rejects.toThrow(/own active Pro/);
  await pro(f, f.org);
  const before = await f.t.run((ctx) => ctx.db.query("wallets").take(10));
  const team = await f.owner.mutation(api.organizations.createTeam, {
    name: "Paid team",
  });
  expect(await f.t.run((ctx) => ctx.db.get(team))).toMatchObject({
    memberSubscriptionPolicy: "individual_pro_v1",
  });
  await expect(
    f.owner.run((ctx) => reserve(ctx, team, "team-charge", 1)),
  ).rejects.toThrow(/own credits/);
  expect(await f.t.run((ctx) => ctx.db.query("wallets").take(10))).toEqual(
    before,
  );
});

it("does not lend the owner's subscription to an invitee and rechecks each member's Pro", async () => {
  const f = await analysisVersionFixture();
  await pro(f, f.org);
  const team = await f.owner.mutation(api.organizations.createTeam, {
    name: "Independent subscriptions",
  });
  const subject = "user_02234567890123456789012345";
  await f.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "member@example.test",
    name: "Member",
  });
  const member = f.t.withIdentity({ subject });
  const account = await member.mutation(api.organizations.createPrivate, {});
  const tokenHash = "a".repeat(64);
  await f.owner.mutation(api.organizations.invite, {
    organizationId: team,
    email: "member@example.test",
    role: "member",
    tokenHash,
  });
  await expect(
    member.mutation(api.organizations.acceptInvite, { tokenHash }),
  ).rejects.toThrow(/own active Pro/);
  const billingId = await pro(f, account);
  expect(
    await member.mutation(api.organizations.acceptInvite, { tokenHash }),
  ).toBe(team);
  expect(
    await member.query(api.organizations.details, { organizationId: team }),
  ).toMatchObject({ name: "Independent subscriptions", role: "member" });
  const clientId = "client_01234567890123456789012345";
  await member.mutation(api.assistantGrants.save, {
    organizationId: team,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes: ["knowledge:read"],
    expectedVersion: 0,
    expiresAt: null,
    acknowledged: true,
  });
  const assistant = f.t.withIdentity({
    subject,
    issuer: "https://fixture.authkit.app",
    client_id: clientId,
    scope: "knowledge:read",
    sid: "app_consent_02234567890123456789012345",
  });
  expect(
    await assistant.query(internal.assistantWidget.state, { profileId: team }),
  ).toMatchObject({ role: "member" });
  await f.t.run((ctx) => ctx.db.patch(billingId, { status: "canceled" }));
  await expect(
    member.query(api.organizations.details, { organizationId: team }),
  ).rejects.toThrow(/own active Pro/);
  expect(
    await f.owner.query(api.organizations.details, { organizationId: team }),
  ).toMatchObject({ role: "owner" });
  await expect(
    assistant.query(internal.assistantWidget.state, { profileId: team }),
  ).rejects.toThrow(/own active Pro/);
  // Revocation keeps the membership and private account rather than deleting data.
  expect(
    await member.query(api.organizations.details, { organizationId: account }),
  ).toMatchObject({ role: "owner", private: true });
});
