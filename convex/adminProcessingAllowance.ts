import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { refreshAdminProcessingAllowance } from "./lib/adminProcessingAllowance";

export const ensure = internalMutation({
  args: { organizationId: v.id("organizations") },
  returns: v.boolean(),
  handler: (ctx, { organizationId }) =>
    refreshAdminProcessingAllowance(ctx, organizationId),
});

// Exact-organization maintenance only. The helper rechecks the current policy,
// active owner, membership, workspace and restore lock on every renewal.
export const renew = internalMutation({
  args: { organizationId: v.id("organizations") },
  returns: v.boolean(),
  handler: (ctx, { organizationId }) =>
    refreshAdminProcessingAllowance(ctx, organizationId),
});
