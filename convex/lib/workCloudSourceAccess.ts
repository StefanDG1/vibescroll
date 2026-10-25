import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

// Execution eligibility does not adopt a workspace, move sources or grant access
// across organizations. Route gates and a reviewed grant remain mandatory.
export async function workCloudSourceEligible(
  ctx: QueryCtx,
  organization: Doc<"organizations">,
  actor: Id<"users">,
) {
  if (organization.status !== "active") return false;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", organization._id).eq("userId", actor),
    )
    .unique();
  if (membership?.role !== "owner") return false;
  if (organization.privateOwnerId) return organization.privateOwnerId === actor;
  if (organization.createdBy !== actor) return false;
  const members = await ctx.db
    .query("memberships")
    .withIndex("by_org", (q) => q.eq("organizationId", organization._id))
    .take(2);
  if (members.length !== 1 || members[0]._id !== membership._id) return false;
  const invitations = await ctx.db
    .query("invitations")
    .withIndex("by_org", (q) => q.eq("organizationId", organization._id))
    .take(51);
  return (
    invitations.length < 51 &&
    !invitations.some((invitation) => invitation.expiresAt > Date.now())
  );
}
