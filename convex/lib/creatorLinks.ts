import {
  isEquivalentPreparedRepost,
  preparedMediaContentKey,
} from "../../packages/social/prepared-post";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { selectedAnalysis } from "./analysisHistory";
import { sourceRetained } from "./sourceAuthority";
import { publicCreatorKeys } from "./publicCreatorIdentity";
import { creatorCatalogOriginals } from "./creatorCatalog";

export async function linkedCreatorKeys(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  accountKey: string,
) {
  const publicKeys = await publicCreatorKeys(ctx, accountKey);
  const membership = await ctx.db
    .query("creatorAccountLinks")
    .withIndex("by_org_account", (q) =>
      q.eq("organizationId", organizationId).eq("accountKey", accountKey),
    )
    .unique();
  if (
    !membership ||
    (membership.groupKey.startsWith("auto_") &&
      membership.linkedAt < Date.now() - 7 * 86400000)
  )
    return publicKeys;
  const links = await ctx.db
    .query("creatorAccountLinks")
    .withIndex("by_org_group", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("groupKey", membership.groupKey),
    )
    .take(8);
  return [
    ...new Set([...publicKeys, ...links.map((link) => link.accountKey)]),
  ].slice(0, 8);
}

export async function visibleOriginals(ctx: QueryCtx, source: Doc<"sources">) {
  const urls = source.url ? [source.url] : [];
  const creator = source.creator;
  if (
    !creator?.contentKey ||
    creator.generation !== source.generation ||
    !source.rightsAttested ||
    source.state !== "ready"
  )
    return urls;
  const keys = await linkedCreatorKeys(ctx, source.organizationId, creator.key);
  if (keys.length < 2) return urls;
  const post = await selectedPost(ctx, source);
  if (!post || (await preparedMediaContentKey(post)) !== creator.contentKey)
    return urls;
  for (const key of keys) {
    if (key === creator.key) continue;
    const exact = await ctx.db
      .query("sources")
      .withIndex("by_org_creator_content", (q) =>
        q
          .eq("organizationId", source.organizationId)
          .eq("creator.key", key)
          .eq("creator.contentKey", creator.contentKey),
      )
      .take(3);
    const candidates = exact.length
      ? exact
      : await ctx.db
          .query("sources")
          .withIndex("by_org_creator", (q) =>
            q
              .eq("organizationId", source.organizationId)
              .eq("creator.key", key)
              .eq("state", "ready"),
          )
          .order("desc")
          .take(6);
    for (const other of candidates) {
      if (
        !other.url ||
        !other.rightsAttested ||
        other.state !== "ready" ||
        other.creator?.generation !== other.generation ||
        !sourceRetained(other.sourceRetentionUntil) ||
        (!exact.length &&
          (!source.publishedAt ||
            !other.publishedAt ||
            Math.abs(source.publishedAt - other.publishedAt) > 3 * 86400000))
      )
        continue;
      try {
        const comparison = await selectedPost(ctx, other);
        if (comparison && isEquivalentPreparedRepost(post, comparison))
          urls.push(other.url);
      } catch {
        // A withdrawn analysis never becomes another original.
      }
    }
  }
  if (source.publicImportId) {
    const layer = await ctx.db.get(source.publicImportId);
    if (
      layer &&
      "familyId" in layer &&
      layer.organizationId === source.organizationId &&
      layer.sourceId === source._id &&
      layer.sourceGeneration === source.generation
    ) {
      const shared = await ctx.db
        .query("creatorCatalogPosts")
        .withIndex("by_family", (q) => q.eq("familyId", layer.familyId))
        .unique();
      if (
        shared?.creatorKey === creator.key &&
        shared.contentKey === creator.contentKey
      )
        urls.push(...(await creatorCatalogOriginals(ctx, shared, keys)));
    }
  }
  return [...new Set(urls)];
}

async function selectedPost(ctx: QueryCtx, source: Doc<"sources">) {
  const selected = await selectedAnalysis(ctx, source);
  return selected && "preparedService" in selected
    ? (selected.preparedService?.post ?? null)
    : null;
}
