import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import schema from "../convex/schema";
import fixture from "../fixtures/insight.json";
import { api, internal } from "../convex/_generated/api";
import {
  categoryKey,
  categoryName,
  defaultVocabulary,
  resolveCategories,
} from "../packages/categories";
const modules = import.meta.glob("../convex/**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  for (const subject of ["a", "b"])
    await t.mutation(internal.accounts.syncUser, {
      subject,
      email: `${subject}@example.test`,
      name: subject,
    });
  const a = t.withIdentity({ subject: "a" }),
    b = t.withIdentity({ subject: "b" });
  const org = await a.mutation(api.organizations.create, {
    name: "Synthetic category workspace",
  });
  const other = await b.mutation(api.organizations.create, {
    name: "Synthetic other workspace",
  });
  async function source(title: string, organizationId = org) {
    return t.run((ctx) =>
      ctx.db.insert("sources", {
        organizationId,
        title,
        key: title,
        canonical: title,
        kind: "text",
        state: "ready",
        coverage: "caption_only",
        tags: [],
        rightsAttested: true,
        generation: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        analysis: {
          summary: "Synthetic category analysis",
          insights: [
            {
              title: "Synthetic star observation",
              categories: ["other"],
              topics: ["Astrophotography"],
            },
          ],
        },
      }),
    );
  }
  return { t, a, b, org, other, source };
}
describe("evolving category boundaries", () => {
  it("normalizes aliases, retains new subjects and rejects links", () => {
    expect(categoryKey("Café guides")).toBe("cafe_guides");
    expect(
      resolveCategories(
        ["books", "Reading", "Astrophotography", "https://example.test"],
        defaultVocabulary,
      ).map((c) => c.name),
    ).toEqual(["Reading", "Astrophotography"]);
    expect(() => categoryName("https://example.test")).toThrow();
    expect(
      resolveCategories(
        Array.from({ length: 12 }, (_, i) => `Topic ${i}`),
        defaultVocabulary,
      ),
    ).toHaveLength(8);
  });
  it("keeps names private until explicit suggestion and operator review, and deletes source links", async () => {
    const { t, a, b, org, other, source } = await setup();
    const id = await source("Synthetic stars");
    await t.mutation(internal.categories.backfill, {});
    expect(
      (await a.query(api.categories.list, { organizationId: org }))[0],
    ).toMatchObject({ name: "Astrophotography", count: 1 });
    await expect(
      b.query(api.categories.list, { organizationId: org }),
    ).rejects.toThrow();
    await expect(
      b.mutation(api.categories.assign, { id, names: ["Music"] }),
    ).rejects.toThrow();
    expect(
      await t.run((ctx) => ctx.db.query("categorySuggestions").collect()),
    ).toEqual([]);
    await a.mutation(api.categories.suggest, {
      organizationId: org,
      key: "astrophotography",
    });
    await a.mutation(api.categories.suggest, {
      organizationId: org,
      key: "astrophotography",
    });
    expect(
      await t.run((ctx) => ctx.db.query("categoryVocabulary").collect()),
    ).toEqual([]);
    const queue = await t.query(internal.categories.reviewQueue, {});
    expect(queue).toHaveLength(1);
    await t.mutation(internal.categories.publish, {
      name: "Astrophotography",
      aliases: ["Star photography"],
      suggestionId: queue[0]._id,
    });
    expect(await t.query(internal.categories.reviewQueue, {})).toEqual([]);
    const foreign = await source("Synthetic foreign", other);
    expect(
      await t.query(internal.categories.forSource, { id: foreign }),
    ).toContain("Astrophotography");
    expect(
      await b.query(api.categories.list, { organizationId: other }),
    ).toEqual([]);
    await a.mutation(api.categories.assign, { id, names: ["books"] });
    expect(
      (
        await a.query(api.product.library, {
          organizationId: org,
          category: "reading",
        })
      ).items[0].categoryNames,
    ).toEqual(["Learning", "Reading"]);
    await a.mutation(api.product.deleteSource, { id });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("sourceCategories")
          .withIndex("by_source", (q) => q.eq("sourceId", id))
          .collect(),
      ),
    ).toEqual([]);
    expect(
      (await a.query(api.categories.list, { organizationId: org })).every(
        (c) => c.count === 0,
      ),
    ).toBe(true);
  });
  it("creates a novel category only after validated current analysis commits", async () => {
    const { t, a, org, source } = await setup();
    const id = await source("Synthetic telescope");
    await t.run((ctx) =>
      ctx.db.patch(id, { state: "processing", analysis: undefined }),
    );
    const output: any = structuredClone(fixture);
    output.sourceId = id;
    output.processingRunId = `${id}:1`;
    output.coverage = "caption_only";
    output.insights = output.insights.map((i: any) => ({
      ...i,
      topics: ["Astrophotography"],
      evidence: [
        { kind: "user_note", id: "supplied_text", startMs: null, endMs: null },
      ],
    }));
    await t.mutation(internal.product.commitAnalysis, {
      id,
      generation: 0,
      output,
      credits: 0,
    });
    expect(await a.query(api.categories.list, { organizationId: org })).toEqual(
      [],
    );
    await t.mutation(internal.product.commitAnalysis, {
      id,
      generation: 1,
      output,
      credits: 0,
    });
    expect(
      (await a.query(api.categories.list, { organizationId: org })).some(
        (c) => c.name === "Astrophotography",
      ),
    ).toBe(true);
  });
  it("sorts before paging, joins category membership within the tenant, and preserves manual overrides", async () => {
    const { t, a, org, source } = await setup();
    for (let i = 34; i >= 0; i--)
      await source(`Synthetic ${String(i).padStart(2, "0")}`);
    await t.mutation(internal.categories.backfill, {});
    await t.finishAllScheduledFunctions(() => {});
    const first = await a.query(api.product.library, {
      organizationId: org,
      category: "astrophotography",
      sort: "title",
    });
    expect(first.items).toHaveLength(30);
    expect(first.items[0].title).toBe("Synthetic 00");
    const second = await a.query(api.product.library, {
      organizationId: org,
      category: "astrophotography",
      sort: "title",
      cursor: first.next!,
    });
    expect(second.items).toHaveLength(5);
    expect(second.items.at(-1)?.title).toBe("Synthetic 34");
    await a.mutation(api.categories.assign, {
      id: first.items[0]._id,
      names: [],
    });
    await t.mutation(internal.categories.backfill, {});
    await t.finishAllScheduledFunctions(() => {});
    expect(
      (await a.query(api.categories.list, { organizationId: org }))[0].count,
    ).toBe(34);
    await expect(
      a.query(api.product.library, { organizationId: org, sort: "invalid" }),
    ).rejects.toThrow();
  });
});

it("groups broad subjects, keeps specific topics private, and separates import from publication dates", async () => {
  const { t, a, b, org, source } = await setup();
  const first = await source("Synthetic recipe"),
    second = await source("Synthetic fashion"),
    third = await source("Synthetic cooking pending");
  await t.run(async (ctx) => {
    await ctx.db.patch(first, {
      createdAt: 3000,
      publishedAt: 1000,
      originalSavedAt: 9000,
      analysis: {
        insights: [
          {
            title: "Synthetic recipe point",
            topics: ["Food / Baking"],
            categories: ["other"],
          },
        ],
      },
    });
    await ctx.db.patch(second, {
      createdAt: 1000,
      publishedAt: 9000,
      originalSavedAt: 1000,
      analysis: {
        insights: [
          {
            title: "Synthetic styling point",
            topics: ["Fashion / Styling"],
            categories: ["other"],
          },
        ],
      },
    });
    await ctx.db.patch(third, {
      state: "queued",
      createdAt: 2000,
      analysis: undefined,
    });
  });
  await t.mutation(internal.categories.backfill, {});
  expect(
    (
      await a.query(api.product.library, {
        organizationId: org,
        sort: "newest",
      })
    ).items[0]._id,
  ).toBe(first);
  expect(
    (
      await a.query(api.product.library, {
        organizationId: org,
        sort: "published",
      })
    ).items.map((s) => s._id),
  ).toEqual([second, first, third]);
  expect(
    (await a.query(api.product.library, { organizationId: org, sort: "saved" }))
      .items[0]._id,
  ).toBe(first);
  const food = await a.query(api.product.library, {
    organizationId: org,
    category: "domain_food",
    sort: "published",
  });
  expect(food.items.map((s) => s._id)).toEqual([first]);
  expect(
    (
      await a.query(api.product.library, {
        organizationId: org,
        state: "not_analyzed",
      })
    ).items.map((s) => s._id),
  ).toEqual([third]);
  expect(
    (
      await a.query(api.product.library, {
        organizationId: org,
        state: "in_progress",
      })
    ).items.map((s) => s._id),
  ).toEqual([third]);
  expect(
    (
      await a.query(api.product.library, {
        organizationId: org,
        category: "domain_food",
        state: "not_analyzed",
      })
    ).items,
  ).toEqual([]);
  const categories = await a.query(api.categories.list, {
    organizationId: org,
  });
  expect(categories.find((c) => c.key === "domain_food")).toMatchObject({
    level: "collection",
    count: 1,
  });
  expect(categories.find((c) => c.name === "Food / Baking")).toMatchObject({
    level: "topic",
    parents: ["Food"],
  });
  await expect(
    b.query(api.product.library, {
      organizationId: org,
      category: "domain_food",
    }),
  ).rejects.toThrow();
  await a.mutation(api.categories.assign, {
    id: first,
    names: ["Fashion / Styling"],
  });
  await t.mutation(internal.categories.backfill, {});
  expect(
    (
      await a.query(api.product.library, {
        organizationId: org,
        category: "domain_food",
      })
    ).items,
  ).toEqual([]);
  expect(
    (
      await a.query(api.product.library, {
        organizationId: org,
        category: "domain_fashion",
      })
    ).items,
  ).toHaveLength(2);
});
