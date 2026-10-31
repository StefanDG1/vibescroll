import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { EvidenceFrame } from "../packages/recovery/evidence-backup.mjs";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.mutation(internal.accounts.syncUser, {
    subject: "synthetic-recovery-a",
    email: "recovery-a@example.test",
    name: "Synthetic",
  });
  await t.mutation(internal.accounts.syncUser, {
    subject: "synthetic-recovery-b",
    email: "recovery-b@example.test",
    name: "Synthetic",
  });
  const a = t.withIdentity({
      subject: "synthetic-recovery-a",
      auth_time: Math.floor(Date.now() / 1000),
    }),
    b = t.withIdentity({
      subject: "synthetic-recovery-b",
      auth_time: Math.floor(Date.now() / 1000),
    });
  const org = await a.mutation(api.organizations.create, {
      name: "Synthetic restore A",
    }),
    other = await b.mutation(api.organizations.create, {
      name: "Synthetic restore B",
    });
  return { t, a, b, org, other, userId };
}
it("does not dispatch restored deletion work while the recovery destination is locked", async () => {
  const { t } = await setup();
  const deletion = await t.run((ctx) =>
    ctx.db.insert("objectDeletions", {
      key: "synthetic-restored-object",
      state: "pending",
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  vi.stubEnv("RESTORE_LOCK", "true");
  await t.mutation(internal.privacy.sweep, {});
  const state = await t.run(async (ctx) => ({
    row: await ctx.db.get(deletion),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(state.row?.attempts).toBe(0);
  expect(state.scheduled).toHaveLength(0);
});
it.each([
  "stripeEvent",
  "paymentWebhook",
  "githubWebhook",
  "billingReconcile",
  "paymentReconcile",
  "pullRequestReconcile",
  "objectDeletion",
  "email",
  "stagingEmail",
])(
  "refuses %s while recovery is locked, even with configured credentials",
  async (boundary) => {
    const { t, org } = await setup();
    vi.stubEnv("RESTORE_LOCK", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_unit_only");
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "synthetic_unit_only");
    vi.stubEnv("EMAIL_REAL_DELIVERY_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "synthetic_unit_only");
    vi.stubEnv("RESEND_FROM", "synthetic@example.test");
    vi.stubEnv("APP_URL", "https://synthetic.example.test");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("External dispatch must not run"));
    try {
      switch (boundary) {
        case "stripeEvent":
          expect(
            await t.action(internal.reconciliation.stripeEvent, {
              body: "{}",
              signature: "synthetic",
            }),
          ).toMatchObject({ status: 503 });
          break;
        case "paymentWebhook":
          expect(
            await t.action(internal.payments.webhook, {
              body: "{}",
              signature: "synthetic",
            }),
          ).toMatchObject({ status: 503 });
          break;
        case "githubWebhook":
          expect(
            await t.action(internal.githubEvents.webhook, {
              body: "{}",
              signature: "synthetic",
              delivery: "synthetic-delivery",
            }),
          ).toMatchObject({ status: 503 });
          break;
        case "billingReconcile":
          await t.action(internal.reconciliation.allBilling, {});
          break;
        case "paymentReconcile":
          await t.action(internal.payments.reconcile, {});
          break;
        case "pullRequestReconcile":
          await t.action(internal.integrations.reconcilePRs, {});
          break;
        case "objectDeletion":
          await t.action(internal.integrations.deleteObject, {
            key: "synthetic/object",
          });
          break;
        case "email":
          expect(
            await t.mutation(internal.email.notify, {
              organizationId: org,
              key: "synthetic",
            }),
          ).toMatchObject({ sent: false });
          break;
        case "stagingEmail":
          await expect(
            t.mutation(internal.email.stagingDeliveryTest, {}),
          ).rejects.toThrow("recovery");
          break;
        default:
          throw new Error("Unknown recovery boundary");
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  },
);
it("blocks private access during restoration and reapplies a latest source marker without touching a foreign workspace", async () => {
  const { t, a, org, other } = await setup();
  const ids = await t.run(async (ctx) => {
    const make = (organizationId: typeof org) =>
      ctx.db.insert("sources", {
        organizationId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        key: `synthetic:${organizationId}`,
        canonical: `synthetic:${organizationId}`,
        kind: "text",
        title: "Owned synthetic restore",
        text: "Owned synthetic private content",
        tags: [],
        state: "ready",
        coverage: "caption_only",
        generation: 1,
        rightsAttested: true,
      });
    return { own: await make(org), foreign: await make(other) };
  });
  await a.mutation(api.product.deleteSource, { id: ids.own });
  const page = await t.query(internal.recovery.markerPage, {
    section: "tombstones",
    cursor: null,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.own, {
      state: "ready",
      text: "Synthetic resurrected backup content",
    });
  });
  await expect(
    t.mutation(internal.recovery.applyMarkers, { entries: page.page }),
  ).rejects.toThrow("POLICY_BLOCKED");
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    a.query(api.product.library, { organizationId: org }),
  ).rejects.toThrow("Recovery");
  await t.mutation(internal.recovery.applyMarkers, { entries: page.page });
  const restored = await t.run(async (ctx) => ctx.db.get(ids.own));
  expect(restored?.text).toBeUndefined();
  await expect(
    t.mutation(internal.recovery.applyMarkers, {
      entries: [
        {
          kind: "source",
          target: ids.foreign,
          organizationId: org,
          at: Date.now(),
        },
      ],
    }),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    await t.run(async (ctx) => (await ctx.db.get(ids.foreign))?.text),
  ).toBe("Owned synthetic private content");
});
it("preserves workspace deletion markers after purge and prevents a late callback from recreating a deleted identity", async () => {
  const { t, a, org, userId } = await setup();
  await a.mutation(api.organizations.remove, {
    organizationId: org,
    confirmation: "Synthetic restore A",
  });
  await t.mutation(internal.maintenance.purgeOrganization, {
    organizationId: org,
  });
  const markers = await t.query(internal.recovery.markerPage, {
    section: "deletionMarkers",
    cursor: null,
  });
  expect(
    markers.page.some((m) => m.kind === "workspace" && m.target === org),
  ).toBe(true);
  await a.mutation(api.accounts.deleteAccount, {
    confirmation: "recovery-a@example.test",
  });
  await t.run(async (ctx) => {
    await ctx.db.delete(userId);
  });
  await expect(
    t.mutation(internal.accounts.syncUser, {
      subject: "synthetic-recovery-a",
      email: "recovery-a@example.test",
      name: "Synthetic",
    }),
  ).rejects.toThrow("identity was deleted");
  const latest = await t.query(internal.recovery.markerPage, {
    section: "deletionMarkers",
    cursor: null,
  });
  expect(JSON.stringify(latest.page)).not.toContain("recovery-a@example.test");
  expect(JSON.stringify(latest.page)).not.toContain("synthetic-recovery-a");
});

it("inventories only surviving retained frames and fences deletion or source changes between pages", async () => {
  const { t, org, other } = await setup();
  const state = await t.run(async (ctx) => {
    const source = await ctx.db.insert("sources", {
      organizationId: org,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      key: "synthetic-evidence-inventory",
      canonical: "synthetic:evidence-inventory",
      kind: "text",
      title: "Synthetic evidence inventory",
      text: "PRIVATE recovered transcript must stay outside current-record projections",
      tags: [],
      state: "ready",
      coverage: "full_sampled",
      generation: 2,
      rightsAttested: true,
    });
    for (const [key, extra] of [
      ["retained", {}],
      ["retired", {}],
      ["expired", { expiresAt: Date.now() - 1000 }],
      ["temporary", { kind: "normalized_audio", type: "audio/wav" }],
      ["foreign", { organizationId: other }],
    ] as const)
      await ctx.db.insert("assets", {
        organizationId: org,
        sourceId: source,
        key: `${org}/${key}`,
        size: 40,
        type: "image/jpeg",
        kind: "evidence",
        state: "complete",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...extra,
      });
    await ctx.db.insert("objectDeletions", {
      key: `${org}/retired`,
      state: "deleted",
      attempts: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { source, key: `${org}/retained` };
  });
  const asOf = Date.now() + 10;
  vi.useFakeTimers();
  vi.setSystemTime(asOf);
  try {
    const entries = [];
    let cursor: string | null = null,
      pages = 0;
    do {
      const page: {
        entries: EvidenceFrame[];
        isDone: boolean;
        cursor: string;
      } = await t.query(internal.recovery.evidencePage, {
        asOf,
        cursor,
        limit: 2,
      });
      entries.push(...page.entries);
      pages++;
      cursor = page.isDone ? null : page.cursor;
    } while (cursor);
    expect(pages).toBe(3);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: state.key,
      generation: 2,
      type: "image/jpeg",
    });
    await expect(
      t.query(internal.recovery.evidenceRestoreCurrent, {
        key: state.key,
        asOf,
      }),
    ).rejects.toThrow("POLICY_BLOCKED");
    vi.stubEnv("RESTORE_LOCK", "true");
    const restoreCurrent = await t.query(
      internal.recovery.evidenceRestoreCurrent,
      { key: state.key, asOf },
    );
    expect(restoreCurrent).toMatchObject({
      locked: true,
      source: { id: state.source, generation: 2 },
      asset: { key: state.key, type: "image/jpeg", size: 40 },
      organization: { id: org, status: "active" },
    });
    expect(JSON.stringify(restoreCurrent)).not.toContain(
      "PRIVATE recovered transcript",
    );
    expect(restoreCurrent).not.toHaveProperty("latestMarkersApplied");
    for (const name of ["retired", "expired", "temporary", "foreign"])
      expect(
        await t.query(internal.recovery.evidenceRestoreCurrent, {
          key: `${org}/${name}`,
          asOf,
        }),
      ).toBeNull();
    await expect(
      t.query(internal.recovery.evidenceRestoreCurrent, {
        key: "x".repeat(301),
        asOf,
      }),
    ).rejects.toThrow("INVALID_INPUT");
    vi.stubEnv("R2_ENDPOINT", "https://synthetic.eu.r2.cloudflarestorage.com");
    vi.stubEnv("R2_BUCKET", "synthetic-evidence");
    vi.stubEnv("R2_ACCESS_KEY_ID", "synthetic-backup-read-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "synthetic-backup-read-secret");
    const lease = await t.query(internal.recoveryStorage.evidenceReadLease, {
      key: state.key,
      asOf,
    });
    expect(lease).not.toBeNull();
    expect(new URL(lease!.url).searchParams.get("X-Amz-Expires")).toBe("60");
    for (const name of ["retired", "expired", "temporary", "foreign"])
      expect(
        await t.query(internal.recoveryStorage.evidenceReadLease, {
          key: `${org}/${name}`,
          asOf,
        }),
      ).toBeNull();
    await t.run((ctx) => ctx.db.patch(state.source, { generation: 3 }));
    expect(
      await t.query(internal.recovery.evidenceRestoreCurrent, {
        key: state.key,
        asOf,
      }),
    ).toMatchObject({ source: { generation: 3 } });
    expect(
      await t.query(internal.recovery.evidenceCurrent, {
        key: state.key,
        asOf,
      }),
    ).toMatchObject({ generation: 3 });
    await t.run((ctx) =>
      ctx.db.insert("tombstones", {
        target: state.source,
        organizationId: org,
        at: asOf,
      }),
    );
    expect(
      await t.query(internal.recovery.evidenceCurrent, {
        key: state.key,
        asOf,
      }),
    ).toBeNull();
    expect(
      await t.query(internal.recovery.evidenceRestoreCurrent, {
        key: state.key,
        asOf,
      }),
    ).toBeNull();
    expect(
      await t.query(internal.recoveryStorage.evidenceReadLease, {
        key: state.key,
        asOf,
      }),
    ).toBeNull();
    await expect(
      t.query(internal.recovery.evidencePage, {
        asOf,
        cursor: null,
        limit: 26,
      }),
    ).rejects.toThrow("INVALID_INPUT");
  } finally {
    vi.useRealTimers();
  }
});
