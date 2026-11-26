import type { QueryCtx } from "../_generated/server";
import { reciprocalCreatorComponent } from "../../packages/social/creator-identity";
import {
  creatorProfileUrl,
  type PublicCreatorProfile,
} from "../../packages/social/creator-identity";

export async function publicCreatorKeys(ctx: QueryCtx, key: string) {
  if (
    process.env.RESTORE_LOCK === "true" ||
    process.env.VIBESCROLL_CREATOR_MATCHING_ENABLED !== "true"
  )
    return [key];
  const seed = await ctx.db
    .query("creatorWatches")
    .withIndex("by_key", (q) => q.eq("creatorKey", key))
    .unique();
  const now = Date.now(),
    profiles: PublicCreatorProfile[] = [];
  if (
    !seed?.profile ||
    seed.profile.observedAt <= now - 86400000 ||
    seed.profile.observedAt > now + 5000
  )
    return [key];
  profiles.push(seed.profile);
  const visited = new Set([
    creatorProfileUrl(seed.profile.key, seed.profile.handle),
  ]);
  for (let i = 0; i < profiles.length && profiles.length < 8; i++)
    for (const url of profiles[i].links) {
      if (visited.has(url) || visited.size >= 12 || profiles.length >= 8)
        continue;
      visited.add(url);
      const matches = await ctx.db
        .query("creatorWatches")
        .withIndex("by_profile_url", (q) => q.eq("profileUrl", url))
        .take(2);
      const watch = matches.length === 1 ? matches[0] : null;
      if (
        watch?.profile &&
        watch.profile.observedAt > now - 86400000 &&
        watch.profile.observedAt <= now + 5000 &&
        !profiles.some((p) => p.key === watch.profile!.key)
      )
        profiles.push(watch.profile);
    }
  const component = reciprocalCreatorComponent(profiles, key);
  return component.length ? component : [key];
}
