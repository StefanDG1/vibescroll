import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { access, limit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import { librarySpace } from "./librarySpacesSchema";
import { cardSourceRetained } from "./lib/sourceAuthority";

export async function privateLibrary(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  const a = await access(ctx, organizationId);
  ensure(
    a.organization.privateOwnerId === a.actor._id,
    "FORBIDDEN",
    "Use your owner-private library for Personal and Business filing.",
  );
  return a;
}
export const setup = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const reader = await access(ctx, a.organizationId);
    if (!reader.organization.privateOwnerId) return null;
    return ctx.db
      .query("librarySetup")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
  },
});
export const saveSetup = mutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    focus: v.array(librarySpace),
    goal: v.string(),
    interests: v.array(v.string()),
    role: v.string(),
    connectSpaces: v.boolean(),
    confirmed: v.boolean(),
    stage: v.union(v.literal(0), v.literal(1), v.literal(2)),
  },
  handler: async (ctx, a) => {
    const { actor } = await privateLibrary(ctx, a.organizationId);
    await limit(ctx, `library-setup:${a.organizationId}`, 30);
    ensure(
      a.focus.length > 0 &&
        a.focus.length <= 2 &&
        new Set(a.focus).size === a.focus.length,
      "INVALID_INPUT",
      "Choose Personal, Business or both.",
    );
    ensure(
      a.goal.trim().length <= 300 &&
        a.role.trim().length <= 80 &&
        a.interests.length <= 8 &&
        a.interests.every((i) => i.trim().length > 0 && i.trim().length <= 60),
      "INVALID_INPUT",
      "Keep your goal under 300 characters and choose up to eight short interests.",
    );
    ensure(
      ![a.goal, a.role, ...a.interests].some(containsSecret),
      "INVALID_INPUT",
      "Do not include credentials in your setup.",
    );
    ensure(
      !a.connectSpaces || a.focus.length === 2,
      "INVALID_INPUT",
      "Choose both spaces before connecting them.",
    );
    ensure(
      !a.confirmed || a.stage === 2,
      "INVALID_INPUT",
      "Review your setup preview before confirming.",
    );
    const old = await ctx.db
      .query("librarySetup")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    ensure(
      a.expectedVersion === (old?.version ?? 0),
      "STALE_APPROVAL",
      "Your setup changed. Reload before saving.",
    );
    const fields = {
      organizationId: a.organizationId,
      actor: actor._id,
      version: (old?.version ?? 0) + 1,
      focus: a.focus,
      goal: a.goal.trim(),
      interests: [...new Set(a.interests.map((i) => i.trim()))],
      role: a.role.trim(),
      connectSpaces: a.connectSpaces,
      confirmed: a.confirmed,
      stage: a.stage,
      provenance: "user" as const,
      updatedAt: Math.max(Date.now(), (old?.updatedAt ?? 0) + 1),
    };
    if (old) await ctx.db.patch(old._id, fields);
    else await ctx.db.insert("librarySetup", fields);
    return fields;
  },
});
export async function filing(ctx: QueryCtx, sourceId: Id<"sources">) {
  return (
    await ctx.db
      .query("sourceSpaces")
      .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
      .take(2)
  ).map((r) => r.space);
}
export const fileSource = mutation({
  args: {
    organizationId: v.id("organizations"),
    sourceId: v.id("sources"),
    spaces: v.array(librarySpace),
  },
  handler: async (ctx, a) => {
    const { actor } = await privateLibrary(ctx, a.organizationId);
    await limit(ctx, `library-filing:${a.organizationId}`, 30);
    ensure(
      a.spaces.length <= 2 && new Set(a.spaces).size === a.spaces.length,
      "INVALID_INPUT",
      "Choose each space once.",
    );
    const source = await ctx.db.get(a.sourceId);
    ensure(
      source &&
        source.organizationId === a.organizationId &&
        source.state !== "deleted",
      "FORBIDDEN",
      "Source unavailable.",
    );
    const rows = await ctx.db
      .query("sourceSpaces")
      .withIndex("by_source", (q) => q.eq("sourceId", a.sourceId))
      .take(3);
    for (const row of rows)
      if (!a.spaces.includes(row.space)) await ctx.db.delete(row._id);
    for (const space of a.spaces)
      if (!rows.some((r) => r.space === space))
        await ctx.db.insert("sourceSpaces", {
          organizationId: a.organizationId,
          sourceId: a.sourceId,
          space,
          actor: actor._id,
          provenance: "user",
          updatedAt: Date.now(),
        });
    return { spaces: a.spaces };
  },
});
// Browsing reads only bounded metadata. Filing never copies evidence or queues analysis.
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    space: librarySpace,
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await privateLibrary(ctx, a.organizationId);
    const page = await ctx.db
      .query("sourceSpaces")
      .withIndex("by_space", (q) =>
        q.eq("organizationId", a.organizationId).eq("space", a.space),
      )
      .order("desc")
      .paginate({ cursor: a.cursor ?? null, numItems: 30 });
    const items = [];
    for (const row of page.page) {
      const card = await ctx.db
        .query("dashboardCards")
        .withIndex("by_entity", (q) => q.eq("entityId", row.sourceId))
        .unique();
      if (
        card &&
        card.organizationId === a.organizationId &&
        card.kind === "source" &&
        (await cardSourceRetained(ctx, card))
      )
        items.push({
          id: row.sourceId,
          title: card.title,
          state: card.state,
          mainPoints:
            card.rightsAttested && card.state === "ready"
              ? card.mainPoints
              : undefined,
          generation: card.generation,
          revision: card.updatedAt,
          filedAt: row.updatedAt,
          provenance: row.provenance,
        });
    }
    return { items, next: page.isDone ? null : page.continueCursor };
  },
});
export const exportPage = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await privateLibrary(ctx, a.organizationId);
    const page = await ctx.db
      .query("sourceSpaces")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .paginate({ cursor: a.cursor ?? null, numItems: 30 });
    const items = [];
    for (const row of page.page) {
      const card = await ctx.db
        .query("dashboardCards")
        .withIndex("by_entity", (q) => q.eq("entityId", row.sourceId))
        .unique();
      if (
        card &&
        card.organizationId === a.organizationId &&
        card.kind === "source" &&
        (await cardSourceRetained(ctx, card))
      )
        items.push({
          sourceId: row.sourceId,
          space: row.space,
          provenance: row.provenance,
          updatedAt: row.updatedAt,
        });
    }
    return {
      schemaVersion: 1,
      items,
      next: page.isDone ? null : page.continueCursor,
    };
  },
});

export const connected = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await privateLibrary(ctx, a.organizationId);
    const setup = await ctx.db
      .query("librarySetup")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    ensure(
      setup?.confirmed && setup.connectSpaces && setup.focus.length === 2,
      "FORBIDDEN",
      "Confirm connecting your private views before browsing them together.",
    );
    const page = await ctx.db
      .query("sourceSpaces")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .paginate({ cursor: a.cursor ?? null, numItems: 30 });
    const items = [];
    const seen = new Set<string>();
    for (const row of page.page) {
      if (seen.has(row.sourceId)) continue;
      seen.add(row.sourceId);
      const card = await ctx.db
        .query("dashboardCards")
        .withIndex("by_entity", (q) => q.eq("entityId", row.sourceId))
        .unique();
      if (
        card &&
        card.organizationId === a.organizationId &&
        card.kind === "source" &&
        (await cardSourceRetained(ctx, card))
      )
        items.push({
          id: row.sourceId,
          title: card.title,
          state: card.state,
          mainPoints:
            card.rightsAttested && card.state === "ready"
              ? card.mainPoints
              : undefined,
          generation: card.generation,
          revision: card.updatedAt,
        });
    }
    return {
      items,
      next: page.isDone ? null : page.continueCursor,
      setupVersion: setup.version,
    };
  },
});
