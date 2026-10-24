import { v } from "convex/values";
import { query } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { sourceDetail, scrubSourceResults } from "./lib/privateSourceAnalysis";
export const detail = query({
  args: {
    sourceId: v.id("sources"),
    runId: v.optional(v.id("localLibraryRuns")),
  },
  handler: (ctx, a) => sourceDetail(ctx, a.sourceId, a.runId),
});
export const scrub = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sourceId: v.id("sources"),
    cursor: v.union(v.string(), v.null()),
    maxGeneration: v.optional(v.number()),
  },
  handler: (ctx, a) =>
    scrubSourceResults(
      ctx,
      a.organizationId,
      a.sourceId,
      a.cursor,
      a.maxGeneration,
    ),
});
