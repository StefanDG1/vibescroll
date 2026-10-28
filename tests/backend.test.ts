import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { isPaid } from "../packages/company-config";
import Stripe from "stripe";
const modules = import.meta.glob("../convex/**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const aliceId = await t.mutation(internal.accounts.syncUser, {
    subject: "alice",
    email: "alice@example.test",
    name: "Alice",
  });
  const bobId = await t.mutation(internal.accounts.syncUser, {
    subject: "bob",
    email: "bob@example.test",
    name: "Bob",
  });
  const alice = t.withIdentity({
      subject: "alice",
      auth_time: Math.floor(Date.now() / 1000),
    }),
    bob = t.withIdentity({
      subject: "bob",
      auth_time: Math.floor(Date.now() / 1000),
    });
  const a = await alice.mutation(api.organizations.create, {
      name: "Organization A",
    }),
    b = await bob.mutation(api.organizations.create, {
      name: "Organization B",
    });
  return { t, alice, bob, aliceId, bobId, a, b };
}
describe("actual backend authorization and lifecycle", () => {
  it("keeps unconfigured billing unavailable and rejects checkout before provider calls", async () => {
    const keys = [
      "STRIPE_SECRET_KEY",
      "STRIPE_PRO_PRICE_ID",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_MODE",
    ] as const;
    const previous = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    try {
      for (const key of keys) delete process.env[key];
      const { alice, a } = await fixture();
      expect(
        (await alice.query(api.billing.authorize, { organizationId: a }))
          .configured,
      ).toBe(false);
      await expect(
        alice.action(api.payments.checkout, { organizationId: a }),
      ).rejects.toThrow("Subscriptions are not available");
      process.env.STRIPE_MODE = "test";
      process.env.STRIPE_SECRET_KEY = "sk_live_synthetic";
      process.env.STRIPE_PRO_PRICE_ID = "price_synthetic";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_synthetic";
      expect(
        (await alice.query(api.billing.authorize, { organizationId: a }))
          .configured,
      ).toBe(false);
      process.env.STRIPE_SECRET_KEY = "sk_test_synthetic";
      expect(
        (await alice.query(api.billing.authorize, { organizationId: a }))
          .configured,
      ).toBe(true);
      delete process.env.STRIPE_WEBHOOK_SECRET;
      expect(
        (await alice.query(api.billing.authorize, { organizationId: a }))
          .configured,
      ).toBe(false);
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });

  it("denies anonymous and cross-organization reads, writes, exports and direct IDs", async () => {
    const { t, alice, bob, a, b } = await fixture();
    const id = await alice.mutation(api.projects.save, {
      organizationId: a,
      name: "Private",
      description: "Confidential",
    });
    await expect(
      t.query(api.projects.list, { organizationId: a }),
    ).rejects.toThrow();
    await expect(
      bob.query(api.projects.list, { organizationId: a }),
    ).rejects.toThrow();
    await expect(
      bob.query(api.projects.get, { organizationId: b, id }),
    ).rejects.toThrow();
    await expect(
      bob.mutation(api.projects.save, {
        organizationId: b,
        id,
        name: "Stolen",
        description: "",
      }),
    ).rejects.toThrow();
    await expect(
      bob.mutation(api.projects.remove, { organizationId: b, id }),
    ).rejects.toThrow();
    await expect(
      bob.query(api.organizations.exportData, { organizationId: a }),
    ).rejects.toThrow();
    expect(
      (await alice.query(api.projects.get, { organizationId: a, id })).name,
    ).toBe("Private");
  });
  it("binds invitations to a verified profile, consumes them once, and enforces member/revocation boundaries", async () => {
    const { alice, bob, a } = await fixture();
    const tokenHash = "a".repeat(64);
    await alice.mutation(api.organizations.invite, {
      organizationId: a,
      email: "bob@example.test",
      role: "member",
      tokenHash,
    });
    await expect(
      alice.mutation(api.organizations.acceptInvite, { tokenHash }),
    ).rejects.toThrow();
    await bob.mutation(api.organizations.acceptInvite, { tokenHash });
    await expect(
      bob.mutation(api.organizations.acceptInvite, { tokenHash }),
    ).rejects.toThrow();
    expect(await bob.query(api.projects.list, { organizationId: a })).toEqual(
      [],
    );
    await expect(
      bob.mutation(api.projects.save, {
        organizationId: a,
        name: "Forbidden",
        description: "",
      }),
    ).rejects.toThrow();
    const members = await alice.query(api.organizations.members, {
      organizationId: a,
    });
    const membership = members.find((m) => m.email === "bob@example.test")!;
    await expect(
      bob.mutation(api.organizations.changeMember, {
        organizationId: a,
        membershipId: membership.id,
        role: "owner",
      }),
    ).rejects.toThrow();
    await alice.mutation(api.organizations.changeMember, {
      organizationId: a,
      membershipId: membership.id,
      role: "remove",
    });
    await expect(
      bob.query(api.projects.list, { organizationId: a }),
    ).rejects.toThrow();
  });
  it("preserves the final owner and rejects expired invitations", async () => {
    const { t, alice, bob, a } = await fixture();
    const own = (
      await alice.query(api.organizations.members, { organizationId: a })
    )[0];
    await expect(
      alice.mutation(api.organizations.changeMember, {
        organizationId: a,
        membershipId: own.id,
        role: "remove",
      }),
    ).rejects.toThrow("last owner");
    await expect(
      alice.mutation(api.accounts.deleteAccount, {
        confirmation: "alice@example.test",
      }),
    ).rejects.toThrow("Transfer ownership");
    await alice.mutation(api.organizations.invite, {
      organizationId: a,
      email: "bob@example.test",
      role: "member",
      tokenHash: "b".repeat(64),
    });
    await t.run(async (ctx) => {
      const inv = await ctx.db.query("invitations").first();
      await ctx.db.patch(inv!._id, { expiresAt: 0 });
    });
    await expect(
      bob.mutation(api.organizations.acceptInvite, {
        tokenHash: "b".repeat(64),
      }),
    ).rejects.toThrow();
  });
  it("enforces project limits atomically under concurrent requests", async () => {
    const { alice, a } = await fixture();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        alice.mutation(api.projects.save, {
          organizationId: a,
          name: `Project ${i}`,
          description: "",
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(
      await alice.query(api.projects.list, { organizationId: a }),
    ).toHaveLength(3);
  });
  it("requires confirmed deletion, locks access immediately, and purges only the selected organization", async () => {
    const { t, alice, bob, a, b } = await fixture();
    await alice.mutation(api.projects.save, {
      organizationId: a,
      name: "A",
      description: "",
    });
    await bob.mutation(api.projects.save, {
      organizationId: b,
      name: "B",
      description: "",
    });
    await expect(
      alice.mutation(api.organizations.remove, {
        organizationId: a,
        confirmation: "wrong",
      }),
    ).rejects.toThrow();
    await alice.mutation(api.organizations.remove, {
      organizationId: a,
      confirmation: "Organization A",
    });
    await expect(
      alice.query(api.projects.list, { organizationId: a }),
    ).rejects.toThrow();
    await t.mutation(internal.maintenance.purgeOrganization, {
      organizationId: a,
    });
    expect(await t.run((ctx) => ctx.db.get(a))).toBeNull();
    expect(
      await bob.query(api.projects.list, { organizationId: b }),
    ).toHaveLength(1);
  });
});
describe("billing enforcement", () => {
  it("rejects free/stale/expired access and prevents old events from restoring canceled access", async () => {
    const { t, alice, a } = await fixture();
    await expect(
      alice.query(api.projects.report, { organizationId: a }),
    ).rejects.toThrow("Pro subscription");
    await t.mutation(internal.billing.attach, {
      organizationId: a,
      customerId: "cus_fixture",
    });
    const r1 = await t.mutation(internal.billing.reserveRefresh, {
      customerId: "cus_fixture",
    });
    const r2 = await t.mutation(internal.billing.reserveRefresh, {
      customerId: "cus_fixture",
    });
    await t.mutation(internal.billing.apply, {
      customerId: "cus_fixture",
      status: "canceled",
      periodEnd: Date.now() + 86400000,
      revision: r2!.revision,
      eventId: "evt_cancel",
    });
    await t.mutation(internal.billing.apply, {
      customerId: "cus_fixture",
      status: "active",
      periodEnd: Date.now() + 86400000,
      revision: r1!.revision,
      eventId: "evt_old",
    });
    await expect(
      alice.query(api.projects.report, { organizationId: a }),
    ).rejects.toThrow();
    const r3 = await t.mutation(internal.billing.reserveRefresh, {
      customerId: "cus_fixture",
    });
    await t.mutation(internal.billing.apply, {
      customerId: "cus_fixture",
      status: "active",
      periodEnd: Date.now() + 86400000,
      revision: r3!.revision,
      eventId: "evt_current",
    });
    expect(
      (await alice.query(api.projects.report, { organizationId: a })).count,
    ).toBe(0);
    await t.mutation(internal.billing.apply, {
      customerId: "cus_fixture",
      status: "canceled",
      periodEnd: 0,
      revision: r3!.revision,
      eventId: "evt_current",
    });
    expect(
      (await alice.query(api.projects.report, { organizationId: a })).count,
    ).toBe(0);
    expect(
      isPaid({
        status: "active",
        periodEnd: Date.now() - 1,
        verifiedAt: Date.now(),
      }),
    ).toBe(false);
    expect(
      isPaid({
        status: "active",
        periodEnd: Date.now() + 86400000,
        verifiedAt: Date.now() - 25 * 3600000,
      }),
    ).toBe(false);
  });
  it("blocks non-owners from billing and active subscriptions from organization deletion", async () => {
    const { t, alice, bob, a } = await fixture();
    await expect(
      bob.query(api.billing.authorize, { organizationId: a }),
    ).rejects.toThrow();
    await t.mutation(internal.billing.attach, {
      organizationId: a,
      customerId: "cus_active",
    });
    await t.mutation(internal.billing.apply, {
      customerId: "cus_active",
      status: "active",
      periodEnd: Date.now() + 86400000,
      revision: 1,
    });
    await expect(
      alice.mutation(api.organizations.remove, {
        organizationId: a,
        confirmation: "Organization A",
      }),
    ).rejects.toThrow("Cancel");
  });
  it("verifies the signed webhook boundary and rejects forged or wrong-environment events", async () => {
    const t = convexTest(schema, modules);
    process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_fixture";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_synthetic_fixture";
    process.env.STRIPE_MODE = "test";
    const body = JSON.stringify({
      id: "evt_signature",
      object: "event",
      type: "fixture.unhandled",
      livemode: false,
      data: { object: {} },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    expect(
      (await t.action(internal.payments.webhook, { body, signature })).status,
    ).toBe(200);
    expect(
      (
        await t.action(internal.payments.webhook, {
          body,
          signature: signature + "tampered",
        })
      ).status,
    ).toBe(400);
    process.env.STRIPE_SECRET_KEY = "sk_live_synthetic_fixture";
    await expect(
      t.action(internal.payments.webhook, { body, signature }),
    ).rejects.toThrow("environment do not match");
    process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_fixture";
    const live = body.replace('"livemode":false', '"livemode":true');
    const liveSignature = Stripe.webhooks.generateTestHeaderString({
      payload: live,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    expect(
      (
        await t.action(internal.payments.webhook, {
          body: live,
          signature: liveSignature,
        })
      ).status,
    ).toBe(400);
  });
  it("cleans expired records behind active ones without removing current records", async () => {
    const { t, a } = await fixture();
    await t.run(async (ctx) => {
      for (let i = 0; i < 205; i++)
        await ctx.db.insert("limits", {
          key: `current:${i}`,
          window: Math.floor(Date.now() / 60000),
          count: 1,
        });
      await ctx.db.insert("limits", { key: "expired", window: 0, count: 1 });
      await ctx.db.insert("events", { eventId: "old", processedAt: 0 });
      await ctx.db.insert("events", {
        eventId: "current",
        processedAt: Date.now(),
      });
      const org = await ctx.db.get(a);
      await ctx.db.insert("invitations", {
        organizationId: a,
        email: "expired@example.test",
        role: "member",
        tokenHash: "expired-token",
        expiresAt: 0,
        createdBy: org!.createdBy,
      });
    });
    await t.mutation(internal.maintenance.cleanup, {});
    await t.run(async (ctx) => {
      const limits = await ctx.db.query("limits").collect();
      expect(limits.filter((x) => x.key.startsWith("current:"))).toHaveLength(
        205,
      );
      expect(limits.some((x) => x.key === "expired")).toBe(false);
      expect(
        (await ctx.db.query("events").collect()).map((x) => x.eventId),
      ).toEqual(["current"]);
      expect(await ctx.db.query("invitations").collect()).toHaveLength(0);
    });
  });
});
