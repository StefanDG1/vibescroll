import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { safeSourceUrl } from "../../packages/policy";
import { githubSourceUrl, redditSourceUrl } from "../../packages/sources/urls";
import { excerptHash } from "../../packages/sources/evidence";
import { sourcePolicyCurrent } from "./sourcePolicy";
import { sharedTypedCitations } from "./sourceCitations";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { sourceRetained, retainedSourceRevision } from "./sourceAuthority";

export const publicEnabled = () =>
  process.env.PUBLIC_KNOWLEDGE_ENABLED === "true" &&
  process.env.RESTORE_LOCK !== "true";
export function publicSourceUrl(value?: string): string | null {
  if (!value) return null;
  for (const parse of [
    safeSourceUrl,
    (s: string) => githubSourceUrl(s).url,
    (s: string) => redditSourceUrl(s).url,
  ])
    try {
      return parse(value);
    } catch {
      /* Only exact supported canonical identities are publishable. */
    }
  return null;
}
export async function editionCurrent(
  ctx: QueryCtx,
  edition: Doc<"publicEditions"> | null,
) {
  if (
    !publicEnabled() ||
    !edition ||
    edition.state !== "published" ||
    edition.permissionExpiresAt <= Date.now()
  )
    return false;
  if (
    (await excerptHash(canonicalJson(edition.payload))) !== edition.payloadHash
  )
    return false;
  const [source, actor, org, membership] = await Promise.all([
    ctx.db.get(edition.sourceId),
    ctx.db.get(edition.actor),
    ctx.db.get(edition.organizationId),
    ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", edition.organizationId)
          .eq("userId", edition.actor),
      )
      .unique(),
  ]);
  if (
    !source ||
    !sourceRetained(source.sourceRetentionUntil) ||
    source.state !== "ready" ||
    !source.rightsAttested ||
    source.publicImportId ||
    source.organizationId !== edition.organizationId ||
    source.generation !== edition.sourceGeneration ||
    source.updatedAt !== edition.sourceRevision ||
    actor?.status !== "active" ||
    org?.status !== "active" ||
    !membership ||
    !["owner", "admin"].includes(membership.role) ||
    (org.privateOwnerId && org.privateOwnerId !== actor._id)
  )
    return false;
  try {
    await sharedTypedCitations(ctx, source);
  } catch {
    return false;
  }
  if (source.currentRevisionId) {
    const revision = await ctx.db.get(source.currentRevisionId);
    if (
      !revision ||
      revision.state !== "current" ||
      revision.sourceId !== source._id ||
      revision.generation !== source.generation ||
      revision.organizationId !== source.organizationId ||
      (revision.revision?.retention &&
        revision.revision.retention.retainUntil <= Date.now())
    )
      return false;
    try {
      const registry = await retainedSourceRevision(ctx, revision);
      if (!registry || !sourcePolicyCurrent(registry.revision)) return false;
    } catch {
      return false;
    }
  }
  return true;
}
export async function publicEdition(ctx: QueryCtx, id: Id<"publicEditions">) {
  const row = await ctx.db.get(id);
  if (!(await editionCurrent(ctx, row))) return null;
  return row!;
}
export async function reusableArtifact(
  ctx: QueryCtx,
  id: Id<"publicArtifacts">,
) {
  const artifact = await ctx.db.get(id);
  if (!artifact || artifact.state !== "eligible") return null;
  const edition = await publicEdition(ctx, artifact.editionId);
  if (
    !edition ||
    !edition.reuseAllowed ||
    edition.version !== artifact.editionVersion
  )
    return null;
  const p = edition.payload;
  if (
    artifact.organizationId !== edition.organizationId ||
    artifact.language !== p.language ||
    artifact.pipelineVersion !== p.pipelineVersion ||
    artifact.schemaVersion !== p.schemaVersion ||
    artifact.coverage !== p.coverage
  )
    return null;
  const source = await ctx.db.get(edition.sourceId);
  if (!source) return null;
  const contentHash = await excerptHash(
    JSON.stringify([source.currentRevisionId ?? source.canonical, p]),
  );
  const compatibilityKey = await excerptHash(
    JSON.stringify([
      contentHash,
      p.language,
      p.pipelineVersion,
      p.schemaVersion,
      p.coverage,
      edition.rightsBasis,
      edition.permissionReference,
      edition.version,
    ]),
  );
  if (
    artifact.contentHash !== contentHash ||
    artifact.compatibilityKey !== compatibilityKey
  )
    return null;
  return { artifact, edition };
}
export function editionDto(edition: Doc<"publicEditions">) {
  return {
    slug: edition.slug,
    version: edition.version,
    ...edition.payload,
    reuseAllowed: edition.reuseAllowed,
    publishedDate: edition.publishedAt
      ? new Date(edition.publishedAt).toISOString().slice(0, 10)
      : null,
  };
}
