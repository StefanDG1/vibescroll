import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { catalogConfiguration, catalogPermission } from "./cloudCatalog";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import {
  socialHash,
  privateCloudMediaIdentity,
} from "../../packages/social/contracts";
import { sourceRetained } from "./sourceAuthority";
import { ensure } from "../../packages/policy";

export async function currentAutomaticCatalogPolicy(
  ctx: QueryCtx,
  source: Doc<"sources">,
  actor: Doc<"users">,
) {
  const config = catalogConfiguration();
  const policy = config?.defaultPolicy;
  if (
    !policy ||
    !source.url ||
    source.kind !== "url" ||
    !source.rightsAttested ||
    source.state === "deleted" ||
    !sourceRetained(source.sourceRetentionUntil) ||
    actor.status !== "active"
  )
    return null;
  try {
    const identity = privateCloudMediaIdentity(source.url);
    if (identity.platform !== "instagram" && identity.platform !== "tiktok")
      return null;
    if (!policy.platforms.includes(identity.platform)) return null;
  } catch {
    return null;
  }
  // The normal authenticated save/request attestation is recorded honestly as
  // user-attested. It is never described as an independently verified licence.
  const reviewed = await catalogPermission(ctx, source.url);
  return {
    policy,
    policyHash: await socialHash(canonicalJson(policy)),
    ...reviewed,
  };
}

export async function recordAutomaticCatalogIntent(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actor: Doc<"users">,
) {
  const current = await currentAutomaticCatalogPolicy(ctx, source, actor);
  if (!current) return null;
  await ctx.db.patch(source._id, {
    catalogPolicy: {
      version: "automatic-neutral-catalog-v1",
      policyHash: current.policyHash,
      disclosureVersion: current.policy.disclosureVersion,
      actor: actor._id,
      requestedAt: Date.now(),
    },
  });
  return current;
}

export async function requireAutomaticCatalogIntent(
  ctx: QueryCtx,
  source: Doc<"sources">,
  actor: Doc<"users">,
) {
  const current = await currentAutomaticCatalogPolicy(ctx, source, actor);
  ensure(
    current &&
      source.catalogPolicy?.actor === actor._id &&
      source.catalogPolicy.policyHash === current.policyHash &&
      source.catalogPolicy.disclosureVersion ===
        current.policy.disclosureVersion &&
      source.catalogPolicy.requestedAt >= current.policy.reviewedAt &&
      source.catalogPolicy.requestedAt <= Date.now(),
    "POLICY_BLOCKED",
    "This analysis has no current automatic catalog request.",
  );
  return current;
}
