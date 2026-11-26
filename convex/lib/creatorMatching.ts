import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const creatorMatchingEnabled = () =>
  process.env.VIBESCROLL_CREATOR_MATCHING_ENABLED === "true" &&
  process.env.RESTORE_LOCK !== "true";

export async function enqueueCreatorMatching(
  ctx: MutationCtx,
  sourceId: Id<"sources">,
) {
  if (creatorMatchingEnabled())
    await ctx.scheduler.runAfter(0, internal.creatorProfiles.matchSavedSource, {
      sourceId,
    });
}
