import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  assistantClients,
  assistantGrantActive,
} from "../../packages/policy/assistant";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { workCloudMediaPolicy } from "../../packages/contracts/work-cloud-text";
import { workCloudMediaAllowed } from "./personalAccess";
import { workCloudSourceEligible } from "./workCloudSourceAccess";
import { digest } from "../product";
import { sourceRetained } from "./sourceAuthority";

export const cloudSaveIntentLifetimeMs = 86400000;
export function savedCloudEnabled(subject: string) {
  return (
    workCloudMediaAllowed(subject) &&
    process.env.MCP_ENABLED === "true" &&
    process.env.MCP_EVENTS_ENABLED === "true" &&
    process.env.WORK_CLOUD_SAVED_LINKS_ENABLED === "true" &&
    process.env.WORK_CLOUD_SAVED_LINKS_VERIFIED === "true"
  );
}
export async function savedCloudGrantCurrent(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
  grant: Doc<"assistantGrants">,
) {
  const client = assistantClients().find((c) => c.id === grant.clientId);
  const required = [
    "analysis:request",
    "analysis:execute",
    "events:subscribe",
    "jobs:read",
  ] as const;
  return (
    savedCloudEnabled(actor.subject) &&
    actor.status === "active" &&
    organization.privateOwnerId === actor._id &&
    (await workCloudSourceEligible(ctx, organization, actor._id)) &&
    grant.organizationId === organization._id &&
    grant.actor === actor._id &&
    assistantGrantActive(grant) &&
    grant.libraryScope === "all" &&
    grant.cloudRequestPolicy === "explicit_per_source_v1" &&
    grant.cloudRequestPolicyHash ===
      (await digest(canonicalJson(workCloudMediaPolicy))) &&
    !!grant.cloudSaveDefaults &&
    !grant.analysisDefaults?.enabled &&
    required.every(
      (scope) => grant.scopes.includes(scope) && client?.scopes.includes(scope),
    )
  );
}
export function savedCloudSourceHash(source: Doc<"sources">) {
  return digest(
    canonicalJson({
      generation: source.generation,
      revision: source.updatedAt,
      canonical: source.canonical,
      url: source.url ?? null,
      kind: source.kind,
      sourceType: source.sourceType ?? "media",
      title: source.title,
      rightsAttested: source.rightsAttested,
      sourceRetentionUntil: source.sourceRetentionUntil ?? null,
    }),
  );
}
export async function savedCloudIntentCurrent(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
  grant: Doc<"assistantGrants">,
  source: Doc<"sources">,
) {
  const intent = source.workCloudSaveIntent;
  return (
    !!intent &&
    intent.actor === actor._id &&
    intent.grantId === grant._id &&
    intent.grantVersion === grant.version &&
    intent.clientId === grant.clientId &&
    intent.expiresAt > Date.now() &&
    intent.retainUntil > Date.now() &&
    source.organizationId === organization._id &&
    source.rightsAttested &&
    source.state !== "deleted" &&
    sourceRetained(source) &&
    (await savedCloudGrantCurrent(ctx, actor, organization, grant)) &&
    intent.defaultsHash ===
      (await digest(canonicalJson(grant.cloudSaveDefaults))) &&
    intent.policyHash === (await digest(canonicalJson(workCloudMediaPolicy))) &&
    (intent.analysisGeneration !== undefined
      ? intent.analysisGeneration === source.generation &&
        source.personalAnalysis?.executor === "work_cloud" &&
        source.personalAnalysis.generation === intent.analysisGeneration &&
        source.personalAnalysis.cloud.grantId === intent.grantId &&
        source.personalAnalysis.cloud.grantVersion === intent.grantVersion
      : intent.generation === source.generation &&
        intent.revision === source.updatedAt &&
        intent.sourceHash === (await savedCloudSourceHash(source)))
  );
}
