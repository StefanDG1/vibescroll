import { instagramCreatorFeedPolicy } from "../../packages/social/creator-feed";
import { platformPostKey } from "../../packages/sources/post-identity";
import type { QueryCtx } from "../_generated/server";

export async function locateAuthorizedInstagramMedia(
  ctx: QueryCtx,
  sourceUrl: string,
) {
  if (process.env.VIBESCROLL_CREATOR_DISCOVERY_ENABLED !== "true") return null;
  const postKey = platformPostKey(sourceUrl);
  if (!postKey?.startsWith("instagram:")) return null;
  const rows = await ctx.db
    .query("creatorDiscoveries")
    .withIndex("by_post_key", (q) => q.eq("postKey", postKey))
    .take(4);
  if (rows.length === 4) return null;
  const matches = rows.flatMap((row) => {
    if (!row.providerMediaId || platformPostKey(row.url) !== postKey) return [];
    const policy = instagramCreatorFeedPolicy(row.creatorKey);
    return policy
      ? [
          {
            creatorKey: row.creatorKey,
            postKey,
            mediaId: row.providerMediaId,
            ...(policy.businessDiscoveryRequesterId
              ? { method: "business_discovery" as const }
              : {}),
          },
        ]
      : [];
  });
  return matches.length === 1 ? matches[0] : null;
}
