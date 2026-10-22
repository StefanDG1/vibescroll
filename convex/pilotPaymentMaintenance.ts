import { v } from "convex/values";
import { internalMutation } from "./lib/projectedMutations";
import { withdrawOrganizationPilotPayments } from "./lib/pilotPayments";
export const withdrawOrganization = internalMutation({
  args: { organizationId: v.id("organizations"), before: v.number() },
  handler: (ctx, a) =>
    withdrawOrganizationPilotPayments(ctx, a.organizationId, a.before),
});
