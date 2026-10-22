import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.restoreAllMocks());
async function setup() {
  const t = convexTest(schema, modules);
  const users = await Promise.all(
    ["owner", "viewer", "outsider"].map((name) =>
      t.mutation(internal.accounts.syncUser, {
        subject: `relationship-${name}`,
        email: `${name}@example.test`,
        name,
      }),
    ),
  );
  const owner = t.withIdentity({ subject: "relationship-owner" }),
    viewer = t.withIdentity({ subject: "relationship-viewer" }),
    outsider = t.withIdentity({ subject: "relationship-outsider" });
  const organizationId = await owner.mutation(api.organizations.create, {
    name: "Explicit source relationships",
  });
  const foreignOrganizationId = await outsider.mutation(
    api.organizations.createPrivate,
    {},
  );
  await t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId,
      userId: users[1],
      role: "viewer",
    }),
  );
  const source = (org: Id<"organizations">, title: string) =>
    t.run((ctx) =>
      ctx.db.insert("sources", {
        organizationId: org,
        key: `relationship-${title}`,
        canonical: `text:${title}`,
        sourceType: "supplied_text",
        kind: "text",
        title,
        text: `Private bytes for ${title}`,
        rightsAttested: true,
        tags: [],
        state: "saved",
        coverage: "caption_only",
        generation: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
  const [a, b, c, foreignA, foreignB] = await Promise.all([
    source(organizationId, "Announcement"),
    source(organizationId, "Repository"),
    source(organizationId, "Another source"),
    source(foreignOrganizationId, "FOREIGN_PRIVATE_A"),
    source(foreignOrganizationId, "FOREIGN_PRIVATE_B"),
  ]);
  const save = (
    id = a,
    relatedSourceId = b,
    kind: "announcement_repository" | "related" = "announcement_repository",
  ) =>
    owner.mutation(api.sourceRelationships.save, {
      id,
      relatedSourceId,
      kind,
      explicitlyConfirmed: true,
    });
  return {
    t,
    owner,
    viewer,
    outsider,
    organizationId,
    foreignOrganizationId,
    a,
    b,
    c,
    foreignA,
    foreignB,
    save,
  };
}

it("records only explicit same-workspace relationships symmetrically and idempotently without processing sources", async () => {
  const s = await setup(),
    network = vi.spyOn(globalThis, "fetch");
  const before = await s.t.run((ctx) =>
    Promise.all([ctx.db.get(s.a), ctx.db.get(s.b)]),
  );
  await expect(
    s.owner.mutation(api.sourceRelationships.save, {
      id: s.a,
      relatedSourceId: s.b,
      kind: "related",
    } as never),
  ).rejects.toThrow();
  await expect(s.save(s.a, s.a)).rejects.toThrow("FORBIDDEN");
  const first = await s.save();
  expect(await s.save()).toEqual(first);
  expect(await s.save(s.b, s.a)).toEqual(first);
  expect(
    await s.owner.query(api.sourceRelationships.list, { id: s.a }),
  ).toEqual([
    {
      id: first.id,
      sourceId: s.b,
      title: "Repository",
      kind: "announcement_repository",
    },
  ]);
  expect(
    await s.viewer.query(api.sourceRelationships.list, { id: s.b }),
  ).toEqual([
    {
      id: first.id,
      sourceId: s.a,
      title: "Announcement",
      kind: "announcement_repository",
    },
  ]);
  await s.t.run(async (ctx) => {
    expect(await ctx.db.query("sourceRelationships").collect()).toHaveLength(1);
    expect(await Promise.all([ctx.db.get(s.a), ctx.db.get(s.b)])).toEqual(
      before,
    );
    for (const table of [
      "sourceAcquisitions",
      "sourceRevisions",
      "reservations",
      "matchingJobs",
      "localLibraryRuns",
      "outbox",
    ] as const)
      expect(await ctx.db.query(table).collect()).toEqual([]);
  });
  expect(network).not.toHaveBeenCalled();
});

it("denies viewer writes, cross-workspace endpoints and foreign relationship reads/removal", async () => {
  const s = await setup(),
    own = await s.save();
  const foreign = await s.outsider.mutation(api.sourceRelationships.save, {
    id: s.foreignA,
    relatedSourceId: s.foreignB,
    kind: "related",
    explicitlyConfirmed: true,
  });
  await expect(
    s.viewer.mutation(api.sourceRelationships.save, {
      id: s.a,
      relatedSourceId: s.c,
      kind: "related",
      explicitlyConfirmed: true,
    }),
  ).rejects.toThrow("permission");
  await expect(s.save(s.a, s.foreignA)).rejects.toThrow("FORBIDDEN");
  await expect(
    s.outsider.query(api.sourceRelationships.list, { id: s.a }),
  ).rejects.toThrow("Organization unavailable");
  await expect(
    s.owner.query(api.sourceRelationships.list, { id: s.foreignA }),
  ).rejects.toThrow("Organization unavailable");
  await expect(
    s.owner.mutation(api.sourceRelationships.remove, { id: foreign.id }),
  ).rejects.toThrow("Organization unavailable");
  await expect(
    s.outsider.mutation(api.sourceRelationships.remove, { id: own.id }),
  ).rejects.toThrow("Organization unavailable");
  await expect(
    s.viewer.mutation(api.sourceRelationships.remove, { id: own.id }),
  ).rejects.toThrow("permission");
  expect(
    JSON.stringify(
      await s.owner.query(api.sourceRelationships.list, { id: s.a }),
    ),
  ).not.toContain("FOREIGN_PRIVATE");
  expect(
    await s.t.run((ctx) => ctx.db.query("sourceRelationships").collect()),
  ).toHaveLength(2);
});

it("hides revoked, deleted and expired endpoints immediately while preserving authorized relationship removal", async () => {
  for (const patch of [
    { rightsAttested: false },
    { sourceRetentionUntil: Date.now() - 1 },
    { state: "deleted" as const },
  ]) {
    const s = await setup(),
      link = await s.save();
    await s.t.run((ctx) => ctx.db.patch(s.b, patch));
    expect(
      await s.owner.query(api.sourceRelationships.list, { id: s.a }),
    ).toEqual([]);
    await expect(
      s.owner.query(api.sourceRelationships.list, { id: s.b }),
    ).rejects.toThrow("SOURCE_UNAVAILABLE");
    await expect(s.save(s.a, s.b)).rejects.toThrow("SOURCE_UNAVAILABLE");
    await expect(s.save(s.b, s.c)).rejects.toThrow("SOURCE_UNAVAILABLE");
    expect(
      await s.owner.mutation(api.sourceRelationships.remove, { id: link.id }),
    ).toEqual({ removed: true });
    expect(
      await s.owner.query(api.sourceRelationships.list, { id: s.a }),
    ).toEqual([]);
  }
});

it("removes only the selected relationship and enforces the undirected per-source bound", async () => {
  const s = await setup(),
    first = await s.save(),
    second = await s.save(s.b, s.a, "related");
  const third = await s.save(s.a, s.c, "related");
  await s.owner.mutation(api.sourceRelationships.remove, { id: first.id });
  expect(
    (await s.owner.query(api.sourceRelationships.list, { id: s.b })).map(
      (row) => row.id,
    ),
  ).toEqual([second.id]);
  expect(
    new Set(
      (await s.owner.query(api.sourceRelationships.list, { id: s.a })).map(
        (row) => row.id,
      ),
    ),
  ).toEqual(new Set([second.id, third.id]));
  await s.t.run(async (ctx) => {
    const current = (await ctx.db.query("sourceRelationships").collect())[0];
    for (let n = 0; n < 19; n++)
      await ctx.db.insert("sourceRelationships", {
        organizationId: s.organizationId,
        sourceId: s.c,
        relatedSourceId: s.b,
        actor: current.actor,
        kind: "related",
        key: `bounded-fixture-${n}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  await expect(s.save(s.c, s.b)).rejects.toThrow("QUOTA_EXCEEDED");
  await expect(s.save(s.b, s.c)).rejects.toThrow("QUOTA_EXCEEDED");
  expect(
    (await s.t.run((ctx) => ctx.db.query("sourceRelationships").collect()))
      .length,
  ).toBe(21);
});
