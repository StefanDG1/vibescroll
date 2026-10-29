import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  assistantClients,
  assistantGrantActive,
  isAssistantIdentity,
  type AssistantScope,
} from "../../packages/policy/assistant";
import { ensure } from "../../packages/policy";
import { workspaceReadable } from "./workspacePrivacy";
import { requireTeamSubscription } from "./accountSubscription";
export async function assistantPrincipal(
  ctx: QueryCtx,
  required?: AssistantScope,
) {
  const identity = await ctx.auth.getUserIdentity();
  ensure(
    process.env.MCP_ENABLED === "true" &&
      process.env.RESTORE_LOCK !== "true" &&
      identity &&
      isAssistantIdentity(identity),
    "FORBIDDEN",
    "Assistant access is unavailable.",
  );
  const client = assistantClients().find((c) => c.id === identity.client_id);
  ensure(
    client &&
      typeof identity.scope === "string" &&
      identity.scope.length <= 2048 &&
      typeof identity.sid === "string" &&
      /^app_consent_[a-zA-Z0-9]{20,80}$/.test(identity.sid) &&
      /^user_[a-zA-Z0-9]{20,80}$/.test(identity.subject),
    "FORBIDDEN",
    "Use an approved user OAuth connection.",
  );
  const scopes = identity.scope.split(" ").filter(Boolean);
  ensure(
    !required ||
      (scopes.includes(required) && client.scopes.includes(required)),
    "FORBIDDEN",
    "The OAuth scope is missing.",
  );
  const actor = await ctx.db
    .query("users")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .unique();
  ensure(
    actor?.status === "active",
    "FORBIDDEN",
    "Complete app account setup first.",
  );
  return { identity, actor, client, scopes };
}
export async function assistantGrant(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  required: AssistantScope,
) {
  const principal = await assistantPrincipal(ctx, required);
  const organization = await ctx.db.get(organizationId);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", organizationId).eq("userId", principal.actor._id),
    )
    .unique();
  const grant = await ctx.db
    .query("assistantGrants")
    .withIndex("by_pair", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("actor", principal.actor._id)
        .eq("clientId", principal.client.id),
    )
    .unique();
  ensure(
    organization &&
      workspaceReadable(organization, principal.actor._id) &&
      membership &&
      grant &&
      assistantGrantActive(grant) &&
      grant.scopes.includes(required),
    "FORBIDDEN",
    "This assistant grant is unavailable, expired or revoked.",
  );
  if (
    required !== "knowledge:read" &&
    required !== "context:read" &&
    required !== "jobs:read" &&
    required !== "events:subscribe"
  )
    ensure(
      ["owner", "admin", "member"].includes(membership.role),
      "FORBIDDEN",
      "Write access is unavailable.",
    );
  await requireTeamSubscription(ctx, principal.actor, organization);
  return { ...principal, organization, membership, grant };
}
