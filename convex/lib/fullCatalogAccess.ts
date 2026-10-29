import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { access, billingFor } from "../lib";
import { ensure, PolicyError } from "../../packages/policy";
import { isAssistantIdentity } from "../../packages/policy/assistant";
import { assistantGrant } from "./assistantPrincipal";
import { requireAccountPro } from "./accountSubscription";
export { requireAccountPro } from "./accountSubscription";

export async function catalogViewer(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity && isAssistantIdentity(identity))
    return assistantGrant(ctx, organizationId, "knowledge:read");
  return access(ctx, organizationId);
}

export async function fullCatalogEntitled(ctx: QueryCtx, actor: Doc<"users">) {
  const grant = actor.fullCatalogGrant,
    now = Date.now();
  if (
    process.env.RESTORE_LOCK === "true" ||
    actor.status !== "active" ||
    !grant ||
    grant.grantedAt > now ||
    grant.revokedAt !== undefined ||
    (grant.expiresAt !== undefined && grant.expiresAt <= now)
  )
    return false;
  // An operator concession is explicit, not a fabricated paid subscription.
  if (grant.source === "operator") return true;
  if (!grant.billingSubscriptionId || grant.expiresAt === undefined)
    return false;
  try {
    const account = await requireAccountPro(ctx, actor);
    const billing = await billingFor(ctx, account!._id);
    return (
      billing?.subscriptionId === grant.billingSubscriptionId &&
      grant.expiresAt <= billing.periodEnd
    );
  } catch (error) {
    if (error instanceof PolicyError && error.code === "FORBIDDEN")
      return false;
    throw error;
  }
}

export async function requireFullCatalog(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  const viewer = await catalogViewer(ctx, organizationId);
  ensure(
    await fullCatalogEntitled(ctx, viewer.actor),
    "FORBIDDEN",
    "Full catalog access requires its add-on or an operator grant.",
  );
  ensure(
    viewer.actor.fullCatalogEnabled === true,
    "FORBIDDEN",
    "Turn on full catalog browsing in Settings.",
  );
  return viewer;
}
