import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { validPostAuthorProof } from "../../packages/social/post-author-proof";

/** The caller has already validated the independently owned catalog artifact. */
export async function indexedCatalogCreator(
  ctx: QueryCtx,
  familyId: Id<"catalogFamilies">,
  artifactId: Id<"publicArtifacts">,
  canonical: string,
) {
  const row = await ctx.db
    .query("creatorCatalogPosts")
    .withIndex("by_family", (q) => q.eq("familyId", familyId))
    .unique();
  if (!row || row.artifactId !== artifactId || row.canonical !== canonical)
    return null;
  const proof = validPostAuthorProof(row.identityProof, canonical);
  if (
    !proof ||
    proof.creatorKey !== row.creatorKey ||
    proof.handle !== row.handle
  )
    return null;
  return { key: row.creatorKey, handle: row.handle, postKey: proof.postKey };
}
