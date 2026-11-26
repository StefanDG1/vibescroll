import type { QueryCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { requireFullCatalog } from "./fullCatalogAccess";
import { currentCloudArtifactHeader } from "./cloudCatalog";
import { PolicyError, ensure } from "../../packages/policy";
import { publicCreatorKeys } from "./publicCreatorIdentity";
import {
  equivalentRepostSignatures,
  repostSignature,
} from "../../packages/social/repost-signature";

/** Call after shared-source or full-catalog authorization. Only verified linked accounts can add originals. */
export async function creatorCatalogOriginals(
  ctx: QueryCtx,
  row: Doc<"creatorCatalogPosts">,
  keys?: string[],
) {
  const signature = repostSignature.safeParse(row.signature),
    urls = new Set([row.canonical]);
  if (!signature.success) return [...urls];
  try {
    const current = await currentCloudArtifactHeader(ctx, row.artifactId);
    if (
      current.family._id !== row.familyId ||
      current.family.selectedArtifactId !== row.artifactId ||
      current.family.canonical !== row.canonical
    )
      return [...urls];
  } catch (error) {
    if (
      error instanceof PolicyError &&
      ["SOURCE_UNAVAILABLE", "POLICY_BLOCKED"].includes(error.code)
    )
      return [...urls];
    throw error;
  }
  for (const creatorKey of keys ??
    (await publicCreatorKeys(ctx, row.creatorKey))) {
    if (creatorKey === row.creatorKey) continue;
    const candidates = await ctx.db
      .query("creatorCatalogPosts")
      .withIndex("by_creator_caption", (q) =>
        q
          .eq("creatorKey", creatorKey)
          .eq("signature.captionHash", signature.data.captionHash),
      )
      .order("desc")
      .take(6);
    for (const candidate of candidates) {
      const other = repostSignature.safeParse(candidate.signature);
      if (
        !other.success ||
        !(
          candidate.contentKey === row.contentKey ||
          (row.publishedAt &&
            candidate.publishedAt &&
            Math.abs(row.publishedAt - candidate.publishedAt) <= 3 * 86400000 &&
            equivalentRepostSignatures(signature.data, other.data))
        )
      )
        continue;
      try {
        const current = await currentCloudArtifactHeader(
          ctx,
          candidate.artifactId,
        );
        if (
          current.family._id === candidate.familyId &&
          current.family.selectedArtifactId === candidate.artifactId &&
          current.family.canonical === candidate.canonical
        )
          urls.add(candidate.canonical);
      } catch (error) {
        if (
          error instanceof PolicyError &&
          ["SOURCE_UNAVAILABLE", "POLICY_BLOCKED"].includes(error.code)
        )
          continue;
        throw error;
      }
    }
  }
  return [...urls];
}

export async function creatorCatalogPage(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  key: string,
  cursor?: string | null,
) {
  try {
    await requireFullCatalog(ctx, organizationId);
  } catch (error) {
    if (error instanceof PolicyError && error.code === "FORBIDDEN")
      return { items: [], next: null };
    throw error;
  }
  let before: { sortAt: number; familyId: Id<"catalogFamilies"> } | null = null;
  if (cursor) {
    ensure(cursor.length <= 2048, "INVALID_INPUT", "Invalid creator cursor.");
    try {
      const value = JSON.parse(cursor);
      const familyId = ctx.db.normalizeId("catalogFamilies", value.familyId);
      ensure(
        familyId && Number.isSafeInteger(value.sortAt) && value.sortAt > 0,
        "INVALID_INPUT",
        "Invalid creator cursor.",
      );
      before = { sortAt: value.sortAt, familyId };
    } catch {
      throw new PolicyError("INVALID_INPUT", "Invalid creator cursor.");
    }
  }
  const keys = await publicCreatorKeys(ctx, key),
    candidates: Doc<"creatorCatalogPosts">[] = [];
  for (const creatorKey of keys) {
    const older = await ctx.db
      .query("creatorCatalogPosts")
      .withIndex("by_creator_published", (q) =>
        before
          ? q.eq("creatorKey", creatorKey).lt("sortAt", before.sortAt)
          : q.eq("creatorKey", creatorKey),
      )
      .order("desc")
      .take(13);
    candidates.push(...older);
    if (before)
      candidates.push(
        ...(await ctx.db
          .query("creatorCatalogPosts")
          .withIndex("by_creator_published", (q) =>
            q
              .eq("creatorKey", creatorKey)
              .eq("sortAt", before!.sortAt)
              .lt("familyId", before!.familyId),
          )
          .order("desc")
          .take(13)),
      );
  }
  candidates.sort(
    (a, b) =>
      b.sortAt - a.sortAt ||
      (a.familyId < b.familyId ? 1 : a.familyId === b.familyId ? 0 : -1),
  );
  const page = candidates.slice(0, 12),
    items = [];
  for (const row of page) {
    try {
      const current = await currentCloudArtifactHeader(ctx, row.artifactId);
      if (
        current.family._id !== row.familyId ||
        current.family.selectedArtifactId !== row.artifactId ||
        current.family.canonical !== row.canonical
      )
        continue;
      const originals = await creatorCatalogOriginals(ctx, row, keys);
      if (originals.length > 1 && row.canonical !== [...originals].sort()[0])
        continue;
      items.push({
        familyId: row.familyId,
        artifactId: row.artifactId,
        creatorKey: row.creatorKey,
        handle: row.handle,
        title: row.title,
        canonical: row.canonical,
        originals,
        publishedAt: row.publishedAt,
      });
    } catch (error) {
      if (
        error instanceof PolicyError &&
        ["SOURCE_UNAVAILABLE", "POLICY_BLOCKED"].includes(error.code)
      )
        continue;
      throw error;
    }
  }
  const last = page.at(-1);
  return {
    items,
    next:
      candidates.length > 12 && last
        ? JSON.stringify({ sortAt: last.sortAt, familyId: last.familyId })
        : null,
  };
}
