import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { queryRead } from "./knowledgeReadContext";

// Only versioned cards written by the atomic source trigger are authoritative.
// Legacy/missing cards fall back to the canonical document. Read
// each call's current transaction; never cache across a mutation or request.
export async function sourceAuthority(ctx: QueryCtx, id: Id<"sources">) {
  return queryRead(ctx, `source-authority:${id}`, async () => {
    const card = await ctx.db
      .query("dashboardCards")
      .withIndex("by_entity", (q) => q.eq("entityId", id))
      .unique();
    if (
      card?.kind === "source" &&
      card.sourceId === id &&
      card.sourceAuthorityVersion === 1 &&
      card.generation !== undefined
    )
      return {
        _id: id,
        organizationId: card.organizationId,
        state: card.state,
        generation: card.generation,
      };
    const source = await ctx.db.get(id);
    return source
      ? {
          _id: source._id,
          organizationId: source.organizationId,
          state: source.state,
          generation: source.generation,
        }
      : null;
  });
}
