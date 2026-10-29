import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { referencesGranted } from "../convex/knowledgeGrants";
import { api, internal } from "../convex/_generated/api";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("shares a retained version and keeps its exact version after selection changes", async () => {
  const f = await cloudCatalogFixture();
  const before = (await f.t.run((ctx) => ctx.db.get(f.sourceId)))!;
  const incumbent = before.selectedAnalysisVersionId!;
  await f.owner.mutation(api.analysisVersions.select, {
    sourceId: f.sourceId,
    versionId: f.versionId,
    expectedSelectionRevision: before.analysisSelectionRevision ?? 0,
  });
  const team = await f.owner.mutation(api.organizations.create, {
    name: "Version sharing",
  });
  const source = (await f.t.run((ctx) => ctx.db.get(f.sourceId)))!;
  const grant = await f.owner.mutation(api.knowledgeGrants.save, {
    organizationId: f.org,
    recipientOrganizationId: team,
    expectedVersion: 0,
    sources: [
      {
        sourceId: f.sourceId,
        generation: source.generation,
        revision: source.updatedAt,
      },
    ],
    expiresAt: Date.now() + 86400000,
    acknowledged: true,
  });
  const result = await f.owner.query(api.knowledgeGrants.fetchShared, {
    organizationId: team,
    grantId: grant.id,
    sourceId: f.sourceId,
  });
  expect(result.insights).toHaveLength(f.output.insights.length);
  expect(result.insights[0].reference.analysisVersionId).toBe(f.versionId);
  const binding = { ...result.insights[0].reference, sourceId: f.sourceId };
  const row = (await f.t.run((ctx) => ctx.db.get(grant.id)))!;
  expect(await f.t.run((ctx) => referencesGranted(ctx, row, [binding]))).toBe(
    true,
  );
  expect(
    await f.t.run((ctx) =>
      referencesGranted(ctx, row, [
        { ...binding, analysisVersionId: undefined },
      ]),
    ),
  ).toBe(false);
  await f.owner.mutation(api.analysisVersions.select, {
    sourceId: f.sourceId,
    versionId: incumbent,
    expectedSelectionRevision: source.analysisSelectionRevision ?? 0,
  });
  const after = await f.owner.query(api.knowledgeGrants.fetchShared, {
    organizationId: team,
    grantId: grant.id,
    sourceId: f.sourceId,
  });
  expect(after.insights).toEqual(result.insights);
  expect((await f.t.run((ctx) => ctx.db.get(f.sourceId)))!.analysis).toEqual(
    before.analysis,
  );
});
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ownerId = await t.mutation(internal.accounts.syncUser, {
    subject: "grant-owner",
    email: "owner@example.test",
    name: "Synthetic owner",
  });
  const readerId = await t.mutation(internal.accounts.syncUser, {
    subject: "grant-reader",
    email: "reader@example.test",
    name: "Synthetic reader",
  });
  await t.mutation(internal.accounts.syncUser, {
    subject: "grant-other",
    email: "other@example.test",
    name: "Synthetic other",
  });
  const owner = t.withIdentity({
      subject: "grant-owner",
      auth_time: Math.floor(Date.now() / 1000),
    }),
    reader = t.withIdentity({ subject: "grant-reader" }),
    other = t.withIdentity({ subject: "grant-other" });
  const organizationId = await owner.mutation(
    api.organizations.createPrivate,
    {},
  );
  const recipientOrganizationId = await owner.mutation(
    api.organizations.create,
    { name: "Synthetic shared team" },
  );
  const readerMembership = await t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId: recipientOrganizationId,
      userId: readerId,
      role: "viewer",
    }),
  );
  const sourceId = await owner.mutation(api.product.capture, {
    organizationId,
    key: "synthetic-share-source",
    kind: "text",
    title: "Explicitly selected synthetic source",
    text: "Synthetic source text must not leave through a metadata grant",
    rightsAttested: true,
  });
  const source = await t.run((ctx) => ctx.db.get(sourceId));
  const args = {
    organizationId,
    recipientOrganizationId,
    expectedVersion: 0,
    sources: [
      { sourceId, generation: source!.generation, revision: source!.updatedAt },
    ],
    expiresAt: Date.now() + 7 * 86400000,
    acknowledged: true as const,
  };
  return {
    t,
    owner,
    reader,
    other,
    ownerId,
    readerId,
    organizationId,
    recipientOrganizationId,
    sourceId,
    args,
    readerMembership,
  };
}
it("uses the normal account session and exact selected versions; no source is moved, copied or processed", async () => {
  const s = await setup();
  const old = s.t.withIdentity({
    subject: "grant-owner",
    auth_time: Math.floor(Date.now() / 1000) - 301,
  });
  await expect(
    s.owner.mutation(api.knowledgeGrants.save, {
      ...s.args,
      sources: [{ ...s.args.sources[0], revision: 0 }],
    }),
  ).rejects.toThrow("STALE_APPROVAL");
  const before = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  const grant = await old.mutation(api.knowledgeGrants.save, s.args);
  const page = await s.reader.query(api.knowledgeGrants.shared, {
    organizationId: s.recipientOrganizationId,
  });
  expect(page.items).toEqual([
    expect.objectContaining({
      sourceId: s.sourceId,
      title: before!.title,
      grantVersion: 1,
    }),
  ]);
  const shared = await s.reader.query(api.knowledgeGrants.fetchShared, {
    organizationId: s.recipientOrganizationId,
    grantId: grant.id,
    sourceId: s.sourceId,
  });
  expect(shared).not.toHaveProperty("text");
  expect(shared).not.toHaveProperty("objectKey");
  expect(shared.url).toBe(
    `https://scroll.companynerve.com/app/${s.recipientOrganizationId}/shared?grant=${grant.id}&source=${s.sourceId}`,
  );
  expect(shared.insights).toEqual([]);
  expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(before);
  expect(await s.t.run((ctx) => ctx.db.query("outbox").collect())).toEqual([]);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
  await expect(
    s.reader.query(api.product.detail, { id: s.sourceId }),
  ).rejects.toThrow("unavailable");
});
it("separates private filing/connection preference from sharing and rejects wrong workspace, account and omitted source", async () => {
  const s = await setup();
  await s.owner.mutation(api.librarySpaces.fileSource, {
    organizationId: s.organizationId,
    sourceId: s.sourceId,
    spaces: ["personal", "business"],
  });
  expect(
    (
      await s.reader.query(api.knowledgeGrants.shared, {
        organizationId: s.recipientOrganizationId,
      })
    ).items,
  ).toEqual([]);
  const grant = await s.owner.mutation(api.knowledgeGrants.save, s.args);
  const omitted = await s.owner.mutation(api.product.capture, {
    organizationId: s.organizationId,
    key: "synthetic-unshared",
    kind: "text",
    title: "PRIVATE unselected topic",
    text: "Unselected private text",
    rightsAttested: true,
  });
  const list = await s.reader.query(api.knowledgeGrants.shared, {
    organizationId: s.recipientOrganizationId,
  });
  expect(JSON.stringify(list)).not.toContain("PRIVATE unselected");
  expect(list.items).toHaveLength(1);
  await expect(
    s.reader.query(api.knowledgeGrants.fetchShared, {
      organizationId: s.recipientOrganizationId,
      grantId: grant.id,
      sourceId: omitted,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.other.query(api.knowledgeGrants.shared, {
      organizationId: s.recipientOrganizationId,
    }),
  ).rejects.toThrow("unavailable");
  const wrong = await s.owner.mutation(api.organizations.create, {
    name: "Another synthetic team",
  });
  await expect(
    s.owner.query(api.knowledgeGrants.fetchShared, {
      organizationId: wrong,
      grantId: grant.id,
      sourceId: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.reader.mutation(api.knowledgeGrants.revoke, {
      organizationId: s.organizationId,
      id: grant.id,
      expectedVersion: 1,
    }),
  ).rejects.toThrow("unavailable");
});
it("source correction or deletion hides stale titles, counts and fetch results until a newly reviewed grant", async () => {
  const s = await setup();
  const grant = await s.owner.mutation(api.knowledgeGrants.save, s.args);
  await s.owner.mutation(api.product.editSource, {
    id: s.sourceId,
    correctedText: "Corrected synthetic text",
    summary: "Synthetic correction",
    tags: [],
  });
  expect(
    (
      await s.reader.query(api.knowledgeGrants.shared, {
        organizationId: s.recipientOrganizationId,
      })
    ).items,
  ).toEqual([]);
  await expect(
    s.reader.query(api.knowledgeGrants.fetchShared, {
      organizationId: s.recipientOrganizationId,
      grantId: grant.id,
      sourceId: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.owner.mutation(api.knowledgeGrants.save, {
      ...s.args,
      expectedVersion: 1,
    }),
  ).rejects.toThrow("STALE_APPROVAL");
  const changed = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  await s.owner.mutation(api.knowledgeGrants.save, {
    ...s.args,
    expectedVersion: 1,
    sources: [
      {
        sourceId: s.sourceId,
        generation: changed!.generation,
        revision: changed!.updatedAt,
      },
    ],
  });
  expect(
    (
      await s.reader.query(api.knowledgeGrants.shared, {
        organizationId: s.recipientOrganizationId,
      })
    ).items,
  ).toHaveLength(1);
  await s.owner.mutation(api.product.deleteSource, { id: s.sourceId });
  expect(
    (
      await s.reader.query(api.knowledgeGrants.shared, {
        organizationId: s.recipientOrganizationId,
      })
    ).items,
  ).toEqual([]);
});
it("revocation is immediate without a fresh-login barrier and stale edits cannot reactivate the old grant", async () => {
  const s = await setup();
  const grant = await s.owner.mutation(api.knowledgeGrants.save, s.args);
  const owner = s.t.withIdentity({ subject: "grant-owner" });
  await owner.mutation(api.knowledgeGrants.revoke, {
    organizationId: s.organizationId,
    id: grant.id,
    expectedVersion: 1,
  });
  expect(
    (
      await s.reader.query(api.knowledgeGrants.shared, {
        organizationId: s.recipientOrganizationId,
      })
    ).items,
  ).toEqual([]);
  await expect(
    s.reader.query(api.knowledgeGrants.fetchShared, {
      organizationId: s.recipientOrganizationId,
      grantId: grant.id,
      sourceId: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.owner.mutation(api.knowledgeGrants.save, {
      ...s.args,
      expectedVersion: 1,
    }),
  ).rejects.toThrow("STALE_APPROVAL");
});
it("expires every read and fences loss of sender or recipient membership", async () => {
  const s = await setup();
  await s.owner.mutation(api.knowledgeGrants.save, {
    ...s.args,
    expiresAt: Date.now() + 1000,
  });
  vi.spyOn(Date, "now").mockReturnValue(s.args.expiresAt + 1);
  expect(
    (
      await s.reader.query(api.knowledgeGrants.shared, {
        organizationId: s.recipientOrganizationId,
      })
    ).items,
  ).toEqual([]);
  vi.restoreAllMocks();
  await s.owner.mutation(api.knowledgeGrants.save, {
    ...s.args,
    expectedVersion: 1,
  });
  const membership = await s.t.run((ctx) =>
    ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", s.recipientOrganizationId)
          .eq("userId", s.ownerId),
      )
      .unique(),
  );
  await s.t.run((ctx) => ctx.db.patch(membership!._id, { role: "viewer" }));
  expect(
    (
      await s.reader.query(api.knowledgeGrants.shared, {
        organizationId: s.recipientOrganizationId,
      })
    ).items,
  ).toEqual([]);
  await s.t.run((ctx) => ctx.db.delete(s.readerMembership));
  await expect(
    s.reader.query(api.knowledgeGrants.shared, {
      organizationId: s.recipientOrganizationId,
    }),
  ).rejects.toThrow("unavailable");
});

it("rejects an entire mixed-input derived group unless every exact cited insight is granted and current", async () => {
  const s = await setup();
  const created = await s.owner.mutation(api.knowledgeGrants.save, s.args);
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      state: "ready",
      analysis: {
        insights: [
          {
            id: "synthetic-insight",
            title: "Synthetic",
            claim: "Synthetic claim",
            evidence: [],
          },
        ],
      },
    }),
  );
  const omitted = await s.owner.mutation(api.product.capture, {
    organizationId: s.organizationId,
    key: "synthetic-mixed-hidden",
    kind: "text",
    title: "Private hidden source",
    text: "Hidden synthetic text",
    rightsAttested: true,
  });
  const other = await s.t.run((ctx) => ctx.db.get(omitted));
  const ref = { ...s.args.sources[0], insightId: "synthetic-insight" };
  const check = async (refs: (typeof ref)[]) =>
    s.t.run(async (ctx) =>
      referencesGranted(ctx, (await ctx.db.get(created.id))!, refs),
    );
  expect(await check([ref])).toBe(true);
  expect(
    await check([
      ref,
      {
        sourceId: omitted,
        generation: other!.generation,
        revision: other!.updatedAt,
        insightId: "hidden-insight",
      },
    ]),
  ).toBe(false);
  expect(await check([{ ...ref, insightId: "missing-insight" }])).toBe(false);
  expect(await check([{ ...ref, revision: ref.revision + 1 }])).toBe(false);
  await s.owner.mutation(api.knowledgeGrants.revoke, {
    organizationId: s.organizationId,
    id: created.id,
    expectedVersion: 1,
  });
  expect(await check([ref])).toBe(false);
});
