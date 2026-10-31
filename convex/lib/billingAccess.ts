import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const billingFor = (ctx: QueryCtx, id: Id<"organizations">) =>
  ctx.db
    .query("billing")
    .withIndex("by_org", (q) => q.eq("organizationId", id))
    .unique();
