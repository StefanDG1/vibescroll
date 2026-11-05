import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function billingRiskHeld(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  return Boolean(
    await ctx.db
      .query("billingRiskHolds")
      .withIndex("by_org_state", (q) =>
        q.eq("organizationId", organizationId).eq("state", "held"),
      )
      .first(),
  );
}
