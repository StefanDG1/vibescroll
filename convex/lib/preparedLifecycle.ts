import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export async function stopPreparedAttempt(
  ctx: MutationCtx,
  attempt: Doc<"analysisAttempts">,
  state: "unknown" | "failed",
) {
  if (attempt.basedOnVersionId) return;
  const run = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_attempt", (q) => q.eq("attemptId", attempt._id))
    .unique();
  if (!run || ["ready", "unknown", "failed"].includes(run.state)) return;
  const now = Date.now();
  await ctx.db.patch(run._id, {
    state,
    updatedAt: now,
    stages: [...run.stages, { stage: state, at: now }],
  });
  const source = await ctx.db.get(run.sourceId);
  if (
    source &&
    source.state !== "deleted" &&
    source.personalMedia?.runId === run._id
  )
    await ctx.db.patch(source._id, {
      personalMedia: { ...source.personalMedia, stage: state, updatedAt: now },
    });
}
