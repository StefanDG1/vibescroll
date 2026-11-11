import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { syncKnowledge } from "./knowledge";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { access, writeAccess, limit } from "./lib";
import {
  defaultVocabulary,
  categoryName,
  categoryKey,
  resolveCategories,
  analysisCategoryNames,
} from "../packages/categories";
import { ensure, containsSecret } from "../packages/policy";
import { internal } from "./_generated/api";
import { categoryDomains } from "../packages/categories/domains";
export async function vocabulary(
  ctx: QueryCtx,
  organizationId: Doc<"sources">["organizationId"],
) {
  const shared = await ctx.db.query("categoryVocabulary").take(300);
  const local = await ctx.db
    .query("workspaceCategories")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .take(200);
  return [...defaultVocabulary, ...shared, ...local];
}
export async function syncCategories(
  ctx: MutationCtx,
  source: Doc<"sources">,
  analysis = source.analysis,
) {
  const topics =
    source.state === "deleted"
      ? []
      : resolveCategories(
          analysisCategoryNames(source, analysis),
          await vocabulary(ctx, source.organizationId),
        );
  const broad =
    source.state === "deleted" || !topics.length ? [] : categoryDomains(topics);
  const categories = [
    ...broad.map((d) => ({ key: d.key, name: d.name, aliases: [] })),
    ...topics.filter((t) => !t.key.startsWith("domain_")),
  ];
  const old = await ctx.db
    .query("sourceCategories")
    .withIndex("by_source", (q) => q.eq("sourceId", source._id))
    .collect();
  const next = new Set(categories.map((c) => c.key));
  for (const link of old)
    if (!next.has(link.categoryKey)) {
      await ctx.db.delete(link._id);
      const category = await ctx.db
        .query("workspaceCategories")
        .withIndex("by_org_key", (q) =>
          q
            .eq("organizationId", source.organizationId)
            .eq("key", link.categoryKey),
        )
        .unique();
      if (category)
        await ctx.db.patch(category._id, {
          count: Math.max(0, category.count - 1),
          updatedAt: Date.now(),
        });
    }
  for (const item of categories) {
    const previous = old.find((link) => link.categoryKey === item.key);
    const fields = {
      title: source.title.toLowerCase(),
      sourceCreatedAt: source.createdAt,
      sourceUpdatedAt: source.updatedAt,
      savedAt: source.originalSavedAt ?? source.createdAt,
      publishedAt: source.publishedAt ?? 0,
      updatedAt: Date.now(),
    };
    if (previous)
      await ctx.db.patch(previous._id, { ...fields, searchable: undefined });
    else
      await ctx.db.insert("sourceCategories", {
        ...fields,
        organizationId: source.organizationId,
        sourceId: source._id,
        categoryKey: item.key,
        createdAt: Date.now(),
      });
    const category = await ctx.db
      .query("workspaceCategories")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", source.organizationId).eq("key", item.key),
      )
      .unique();
    if (category)
      await ctx.db.patch(category._id, {
        count: category.count + (previous ? 0 : 1),
        updatedAt: Date.now(),
      });
    else {
      const count = await ctx.db
        .query("workspaceCategories")
        .withIndex("by_org", (q) =>
          q.eq("organizationId", source.organizationId),
        )
        .take(200);
      ensure(
        count.length < 200,
        "CATEGORY_LIMIT",
        "This workspace has reached 200 categories. Reuse an existing category.",
      );
      await ctx.db.insert("workspaceCategories", {
        organizationId: source.organizationId,
        key: item.key,
        name: item.name,
        aliases: [],
        count: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  await ctx.db.patch(source._id, {
    domainKeys: broad.map((d) => d.key),
    categoryKeys: categories.map((c) => c.key),
    categoryNames: categories.map((c) => c.name),
  });
}
export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    return (
      await ctx.db
        .query("workspaceCategories")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .take(200)
    )
      .map((c) => ({
        key: c.key,
        name: c.name,
        count: c.count,
        level: c.key.startsWith("domain_") ? "collection" : "topic",
        parents: c.key.startsWith("domain_")
          ? []
          : categoryDomains([c]).map((d) => d.name),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  },
});
export const assign = mutation({
  args: { id: v.id("sources"), names: v.array(v.string()) },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    ensure(
      source && source.state !== "deleted",
      "FORBIDDEN",
      "Source unavailable.",
    );
    await writeAccess(ctx, source.organizationId);
    await limit(ctx, `categories:${source.organizationId}`, 30);
    ensure(
      a.names.length <= 8,
      "INVALID_INPUT",
      "Choose at most eight categories.",
    );
    ensure(
      a.names.every((n) => !containsSecret(n)),
      "INVALID_INPUT",
      "Do not include credentials in category names.",
    );
    let names: string[];
    try {
      names = a.names.map(categoryName);
    } catch {
      ensure(
        false,
        "INVALID_INPUT",
        "Use category names of 1 to 48 letters, numbers or spaces.",
      );
    }
    const revision = Math.max(Date.now(), source.updatedAt + 1);
    await ctx.db.patch(source._id, {
      categoryOverride: names,
      updatedAt: revision,
    });
    await syncCategories(ctx, {
      ...source,
      categoryOverride: names,
      updatedAt: revision,
    });
    const saved = await ctx.db.get(source._id);
    if (saved) await syncKnowledge(ctx, saved);
    return {
      saved: true,
      names: saved?.categoryNames ?? [],
      keys: saved?.categoryKeys ?? [],
    };
  },
});
export const suggest = mutation({
  args: { organizationId: v.id("organizations"), key: v.string() },
  handler: async (ctx, a) => {
    await writeAccess(ctx, a.organizationId, ["owner", "admin"]);
    await limit(ctx, `category-suggestion:${a.organizationId}`, 5);
    const category = await ctx.db
      .query("workspaceCategories")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", a.organizationId).eq("key", a.key),
      )
      .unique();
    ensure(category, "INVALID_INPUT", "Category unavailable.");
    const existing = await ctx.db
      .query("categorySuggestions")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", a.organizationId).eq("key", a.key),
      )
      .unique();
    if (!existing)
      await ctx.db.insert("categorySuggestions", {
        organizationId: a.organizationId,
        key: a.key,
        name: category.name,
        state: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    return { submitted: true };
  },
});
// Only the trusted operator's administrative API can promote a reviewed name.
// This table contains category vocabulary, never source content or tenant IDs.
export const publish = internalMutation({
  args: {
    name: v.string(),
    aliases: v.array(v.string()),
    suggestionId: v.optional(v.id("categorySuggestions")),
  },
  handler: async (ctx, a) => {
    ensure(a.aliases.length <= 20, "INVALID_INPUT", "Too many aliases.");
    ensure(
      !containsSecret([a.name, ...a.aliases].join(" ")),
      "INVALID_INPUT",
      "Category names must not contain credentials.",
    );
    const name = categoryName(a.name),
      key = categoryKey(name),
      aliases = a.aliases.map(categoryName);
    if (a.suggestionId) {
      const suggestion = await ctx.db.get(a.suggestionId);
      ensure(
        suggestion?.state === "pending" && suggestion.key === key,
        "INVALID_INPUT",
        "Review a pending matching category suggestion.",
      );
      await ctx.db.patch(a.suggestionId, {
        state: "approved",
        updatedAt: Date.now(),
      });
    }
    const existing = await ctx.db
      .query("categoryVocabulary")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing)
      await ctx.db.patch(existing._id, {
        name,
        aliases,
        updatedAt: Date.now(),
      });
    else {
      ensure(
        (await ctx.db.query("categoryVocabulary").take(300)).length < 300,
        "CATEGORY_LIMIT",
        "Shared vocabulary limit reached.",
      );
      await ctx.db.insert("categoryVocabulary", {
        key,
        name,
        aliases,
        updatedAt: Date.now(),
      });
    }
    return { key };
  },
});
export const backfill = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const page = await ctx.db
      .query("sources")
      .paginate({ numItems: 20, cursor: a.cursor ?? null });
    for (const source of page.page) await syncCategories(ctx, source);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.categories.backfill, {
        cursor: page.continueCursor,
      });
    return { done: page.isDone };
  },
});

export const forSource = internalQuery({
  args: { id: v.id("sources") },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    if (!source || source.state === "deleted") return [];
    return (await vocabulary(ctx, source.organizationId)).map((c) => c.name);
  },
});
export const reviewQueue = internalQuery({
  args: {},
  handler: async (ctx) =>
    await ctx.db
      .query("categorySuggestions")
      .withIndex("by_state", (q) => q.eq("state", "pending"))
      .take(100),
});

export const reject = internalMutation({
  args: { id: v.id("categorySuggestions") },
  handler: async (ctx, a) => {
    const suggestion = await ctx.db.get(a.id);
    ensure(
      suggestion?.state === "pending",
      "INVALID_INPUT",
      "Suggestion unavailable.",
    );
    await ctx.db.patch(a.id, { state: "rejected", updatedAt: Date.now() });
  },
});
