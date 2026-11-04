import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ensure, PolicyError } from "../../packages/policy";
import { cloudCatalogConfiguration } from "../../packages/contracts/cloud-catalog";
import { assistantGrantActive } from "../../packages/policy/assistant";
import { assistantGrant, assistantPrincipal } from "./assistantPrincipal";

type Authorized = Awaited<ReturnType<typeof assistantGrant>>;
type SelectionReason =
  "explicit" | "saved_default" | "personal" | "sole" | "required";

// Hiding a service workspace is not an authorization grant. Its configured
// identity remains infrastructure even when catalog processing is disabled.
function catalogServiceId() {
  try {
    return cloudCatalogConfiguration.parse(
      JSON.parse(process.env.CLOUD_CATALOG_CONFIGURATION_JSON ?? "null"),
    ).serviceOrganizationId;
  } catch {
    return null;
  }
}

export function widgetWorkspaceKind(a: Authorized) {
  return a.organization.privateOwnerId === a.actor._id
    ? ("personal" as const)
    : ("team" as const);
}

async function eligible(ctx: QueryCtx, id: Id<"organizations">) {
  if (id === catalogServiceId()) return null;
  try {
    return await assistantGrant(ctx, id, "knowledge:read");
  } catch (error) {
    if (error instanceof PolicyError && error.code === "FORBIDDEN") return null;
    throw error;
  }
}

export async function widgetDiscovery(
  ctx: QueryCtx,
  explicitId?: Id<"organizations">,
) {
  const p = await assistantPrincipal(ctx, "knowledge:read");
  const rows = await ctx.db
    .query("assistantGrants")
    .withIndex("by_actor_client", (q) =>
      q.eq("actor", p.actor._id).eq("clientId", p.client.id),
    )
    .take(51);
  const available = new Map<Id<"organizations">, Authorized>();
  for (const grant of rows.slice(0, 50)) {
    if (
      !assistantGrantActive(grant) ||
      !grant.scopes.includes("knowledge:read")
    )
      continue;
    const a = await eligible(ctx, grant.organizationId);
    if (a) available.set(a.organization._id, a);
  }
  let selected: Authorized | null = null;
  let reason: SelectionReason = "required";
  if (explicitId) {
    selected = await widgetExplicitAccess(ctx, explicitId);
    reason = "explicit";
  } else if (p.actor.defaultWorkspaceId) {
    selected =
      available.get(p.actor.defaultWorkspaceId) ??
      (await eligible(ctx, p.actor.defaultWorkspaceId));
    if (selected) reason = "saved_default";
  }
  if (!selected) {
    // An absent/revoked saved default cannot choose an arbitrary joined team.
    const personal = await ctx.db
      .query("organizations")
      .withIndex("by_private_owner", (q) => q.eq("privateOwnerId", p.actor._id))
      .take(2);
    const active = personal.filter((o) => o.status === "active");
    if (active.length === 1) {
      selected =
        available.get(active[0]._id) ?? (await eligible(ctx, active[0]._id));
      if (selected) reason = "personal";
    }
  }
  if (!selected && rows.length <= 50 && available.size === 1) {
    selected = [...available.values()][0];
    reason = "sole";
  }
  // A selected exact grant can be beyond the discovery bound. Keep it visible
  // without increasing the fifty-record picker or inventing complete coverage.
  if (selected && !available.has(selected.organization._id)) {
    if (available.size === 50) available.delete([...available.keys()][49]);
    available.set(selected.organization._id, selected);
  }
  return {
    available: [...available.values()],
    selected,
    reason,
    truncated: rows.length > 50,
  };
}

async function widgetExplicitAccess(ctx: QueryCtx, id: Id<"organizations">) {
  ensure(
    id !== catalogServiceId(),
    "FORBIDDEN",
    "Use your own workspace to browse the shared catalog.",
  );
  return assistantGrant(ctx, id, "knowledge:read");
}

export async function widgetAccess(
  ctx: QueryCtx,
  profileId?: Id<"organizations">,
) {
  if (profileId)
    return {
      a: await widgetExplicitAccess(ctx, profileId),
      reason: "explicit" as const,
    };
  const discovery = await widgetDiscovery(ctx);
  ensure(
    discovery.selected,
    "PROFILE_SELECTION_REQUIRED",
    "Choose a current workspace from widget_profiles.",
  );
  return { a: discovery.selected, reason: discovery.reason };
}
