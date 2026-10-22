import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { excerptHash } from "../packages/sources/evidence";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function setup(
  count: number,
  sourceBytes = 0,
  bytesRead = 1700000,
  largePublicPayload = false,
) {
  vi.stubEnv("PUBLIC_KNOWLEDGE_ENABLED", "true");
  const t = convexTest({ schema, modules, transactionLimits: { bytesRead } });
  const now = Date.now();
  const payload = {
    title: "Synthetic public idea",
    summary: "Explicitly reviewed synthetic public summary",
    publisher: "Synthetic publisher",
    sourceUrl: null,
    coverage: "caption_only",
    language: "en",
    pipelineVersion: "synthetic-v1",
    schemaVersion: "1.0.0",
    insights: largePublicPayload
      ? Array.from({ length: 5 }, (_, index) => ({
          id: `point-${index + 1}`,
          title: "Synthetic claim",
          claim: "x".repeat(2000),
          interpretation: "x".repeat(2000),
          uncertainty: [],
          citations: [
            {
              kind: "user_note",
              label: "Synthetic supplied evidence",
              url: null,
            },
          ],
        }))
      : [],
  };
  const hash = await excerptHash(canonicalJson(payload));
  const fixture = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      subject: "synthetic-public-read-owner",
      name: "Synthetic owner",
      email: "owner@example.test",
      status: "active",
      createdAt: now,
    });
    const org = await ctx.db.insert("organizations", {
      name: "Synthetic public read budget",
      status: "active",
      createdBy: owner,
      createdAt: now,
    });
    await ctx.db.insert("memberships", {
      organizationId: org,
      userId: owner,
      role: "owner",
    });
    const editions: Id<"publicEditions">[] = [];
    for (let index = 0; index < count; index++) {
      const actor = await ctx.db.insert("users", {
        subject: `synthetic-contributor-${index}`,
        name: "Synthetic contributor",
        email: `${index}@example.test`,
        status: "active",
        createdAt: now,
      });
      await ctx.db.insert("memberships", {
        organizationId: org,
        userId: actor,
        role: "admin",
      });
      const sourceId = await ctx.db.insert("sources", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        key: `synthetic-source-${index}`,
        canonical: `synthetic-source-${index}`,
        kind: "text",
        title: "Synthetic retained source",
        text: "x".repeat(sourceBytes),
        tags: [],
        state: "ready",
        coverage: "caption_only",
        generation: 1,
        rightsAttested: true,
      });
      editions.push(
        await ctx.db.insert("publicEditions", {
          organizationId: org,
          actor,
          sourceId,
          sourceGeneration: 1,
          sourceRevision: now,
          state: "published",
          version: 1,
          slug: `synthetic-read-${index}`,
          payload,
          payloadHash: hash,
          rightsBasis: "owner_created",
          permissionReference: "Synthetic permission",
          permissionExpiresAt: now + 60000,
          reuseAllowed: false,
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      );
      await ctx.db.insert("publicGeography", {
        organizationId: org,
        actor,
        cell: "europe",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { org, owner, editions };
  });
  async function collection(slug: string, ids: Id<"publicEditions">[]) {
    return t.run((ctx) =>
      ctx.db.insert("publicCollections", {
        organizationId: fixture.org,
        actor: fixture.owner,
        slug,
        title: "Synthetic collection",
        description: "A fully bound synthetic collection",
        topic: "Synthetic",
        state: "published",
        version: 1,
        editions: ids,
        bindings: ids.map((id) => ({ id, version: 1, hash })),
        reviewedHash: "synthetic-reviewed",
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  return { t, ...fixture, collection };
}

it("keeps a large anonymous regional census within 1.7 MB by sampling at most 25 full source checks", async () => {
  const s = await setup(110, 60000);
  const regions = await s.t.query(api.publicKnowledge.geography, {});
  expect(regions).toEqual([
    {
      id: "europe",
      label: "Europe",
      latitude: 50,
      longitude: 15,
      contributors: "25+",
      coverage: "bounded_snapshot",
    },
  ]);
  expect(JSON.stringify(regions)).not.toMatch(
    /actor|organization|createdAt|updatedAt|subject/,
  );
});

it("also bounds payload reads when a contributor opted in from a different workspace than their latest edition", async () => {
  const s = await setup(110, 0, 1700000, true);
  await s.t.run(async (ctx) => {
    const other = await ctx.db.insert("organizations", {
      name: "Other synthetic contributor workspace",
      status: "active",
      createdBy: s.owner,
      createdAt: Date.now(),
    });
    for (const row of await ctx.db
      .query("publicGeography")
      .withIndex("by_org", (q) => q.eq("organizationId", s.org))
      .collect()) {
      await ctx.db.insert("memberships", {
        organizationId: other,
        userId: row.actor,
        role: "admin",
      });
      await ctx.db.patch(row._id, { organizationId: other });
    }
  });
  expect(await s.t.query(api.publicKnowledge.geography, {})).toEqual([]);
});

it("shares 24 edition validations across discovery and skips a collection rather than returning a partial binding", async () => {
  const s = await setup(28);
  for (let index = 0; index < 4; index++)
    await s.collection(
      `synthetic-seven-${index}`,
      s.editions.slice(index * 7, (index + 1) * 7),
    );
  const result = await s.t.query(api.publicKnowledge.discover, {
    cursor: null,
  });
  expect(result.page).toHaveLength(3);
  for (const collection of result.page)
    expect(collection.editions).toHaveLength(7);
});

it("memoizes current edition checks across collections within one immutable discovery page", async () => {
  const s = await setup(10);
  for (let index = 0; index < 4; index++)
    await s.collection(`synthetic-shared-${index}`, s.editions);
  const result = await s.t.query(api.publicKnowledge.discover, {
    cursor: null,
  });
  expect(result.page).toHaveLength(4);
  for (const collection of result.page)
    expect(collection.editions).toHaveLength(10);
});

it("preserves direct reads of a complete 25-edition collection and denies a malformed binding list", async () => {
  const s = await setup(25);
  const id = await s.collection("synthetic-full-collection", s.editions);
  const result = await s.t.query(api.publicKnowledge.readCollection, {
    slug: "synthetic-full-collection",
  });
  expect(result?.editions).toHaveLength(25);
  await s.t.run((ctx) => ctx.db.patch(id, { editions: s.editions.slice(1) }));
  expect(
    await s.t.query(api.publicKnowledge.readCollection, {
      slug: "synthetic-full-collection",
    }),
  ).toBeNull();
});
