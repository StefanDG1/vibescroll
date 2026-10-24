import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { access, writeAccess, limit } from "./lib";
import { ensure } from "../packages/policy";
import { sourceRetained } from "./lib/sourceAuthority";
async function source(ctx: QueryCtx, id: Id<"sources">) {
  const row = await ctx.db.get(id);
  ensure(
    row && row.state !== "deleted" && row.rightsAttested && sourceRetained(row),
    "SOURCE_UNAVAILABLE",
    "Choose a current permitted source.",
  );
  return row;
}
async function links(ctx: QueryCtx, id: Id<"sources">) {
  return [
    ...(await ctx.db
      .query("sourceRelationships")
      .withIndex("by_source", (q) => q.eq("sourceId", id))
      .take(21)),
    ...(await ctx.db
      .query("sourceRelationships")
      .withIndex("by_related", (q) => q.eq("relatedSourceId", id))
      .take(21)),
  ];
}
export const list = query({
  args: { id: v.id("sources") },
  handler: async (ctx, a) => {
    const original = await source(ctx, a.id);
    await access(ctx, original.organizationId);
    const items = [];
    for (const link of await links(ctx, a.id)) {
      if (link.organizationId !== original.organizationId) continue;
      const targetId =
        link.sourceId === a.id ? link.relatedSourceId : link.sourceId;
      const target = await ctx.db.get(targetId);
      if (
        !target ||
        target.organizationId !== original.organizationId ||
        target.state === "deleted" ||
        !sourceRetained(target) ||
        !target.rightsAttested
      )
        continue;
      items.push({
        id: link._id,
        sourceId: target._id,
        title: target.title,
        kind: link.kind,
      });
    }
    return items;
  },
});
export const save = mutation({
  args: {
    id: v.id("sources"),
    relatedSourceId: v.id("sources"),
    kind: v.union(v.literal("announcement_repository"), v.literal("related")),
    explicitlyConfirmed: v.literal(true),
  },
  handler: async (ctx, a) => {
    const original = await source(ctx, a.id);
    const { actor } = await writeAccess(ctx, original.organizationId);
    const related = await source(ctx, a.relatedSourceId);
    ensure(
      original._id !== related._id &&
        original.organizationId === related.organizationId,
      "FORBIDDEN",
      "Choose a different source in this workspace.",
    );
    await limit(ctx, `source-relationships:${actor._id}`, 20);
    const key = [...[original._id, related._id].sort(), a.kind].join(":");
    const old = await ctx.db
      .query("sourceRelationships")
      .withIndex("by_key", (q) =>
        q.eq("organizationId", original.organizationId).eq("key", key),
      )
      .unique();
    if (old) return { id: old._id };
    ensure(
      (await links(ctx, original._id)).length < 20 &&
        (await links(ctx, related._id)).length < 20,
      "QUOTA_EXCEEDED",
      "Each source can have up to twenty explicit relationships.",
    );
    const now = Date.now();
    const id = await ctx.db.insert("sourceRelationships", {
      organizationId: original.organizationId,
      sourceId: original._id,
      relatedSourceId: related._id,
      kind: a.kind,
      actor: actor._id,
      key,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});
export const remove = mutation({
  args: { id: v.id("sourceRelationships") },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.id);
    ensure(row, "SOURCE_UNAVAILABLE", "Relationship unavailable.");
    await writeAccess(ctx, row.organizationId);
    await ctx.db.delete(row._id);
    return { removed: true };
  },
});
