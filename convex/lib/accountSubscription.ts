import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ensure, PolicyError } from "../../packages/policy";
import { requireProCatalogAccess } from "./catalogEntitlement";

// Membership never lends a team owner's subscription or allowance to a member.
export async function requireAccountPro(ctx: QueryCtx, actor: Doc<"users">) {
  const owned = await ctx.db
    .query("organizations")
    .withIndex("by_private_owner", (q) => q.eq("privateOwnerId", actor._id))
    .take(2);
  for (const organization of owned) {
    if (organization.status !== "active") continue;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", organization._id).eq("userId", actor._id),
      )
      .unique();
    if (membership?.role !== "owner") continue;
    try {
      await requireProCatalogAccess(ctx, organization._id);
      return organization;
    } catch (error) {
      if (!(error instanceof PolicyError) || error.code !== "FORBIDDEN")
        throw error;
    }
  }
  ensure(false, "FORBIDDEN", "Your own active Pro subscription is required.");
}

export async function requireTeamSubscription(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
) {
  if (organization.memberSubscriptionPolicy === "individual_pro_v1")
    await requireAccountPro(ctx, actor);
}

export async function teamSubscriptionCurrent(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
) {
  try {
    await requireTeamSubscription(ctx, actor, organization);
    return true;
  } catch (error) {
    if (error instanceof PolicyError && error.code === "FORBIDDEN")
      return false;
    throw error;
  }
}
