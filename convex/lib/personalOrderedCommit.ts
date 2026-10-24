import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { validateOrderedAnalysis } from "../../packages/social/analysis";
import { ensure } from "../../packages/policy";
import { settle } from "../product";
import { syncCategories } from "../categories";
import { syncKnowledge } from "../knowledge";

// Execution authority and current evidence must be checked by the caller.
export async function commitPersonalOrdered(
  ctx: MutationCtx,
  source: Doc<"sources">,
  job: NonNullable<Doc<"sources">["personalAnalysis"]>,
  validated: Awaited<ReturnType<typeof validateOrderedAnalysis>>,
  usage: { inputTokens: number; outputTokens: number } | undefined,
  now: number,
  pipelineVersion = "official-personal-ordered-v1",
) {
  ensure(
    !usage ||
      [usage.inputTokens, usage.outputTokens].every(
        (n) => Number.isSafeInteger(n) && n >= 0 && n <= 10000000,
      ),
    "INVALID_INPUT",
    "Invalid plan usage.",
  );
  const output = validated.analysis;
  await settle(
    ctx,
    source.organizationId,
    `source:${source._id}:${job.generation}`,
    0,
  );
  await ctx.db.patch(source._id, {
    state: "ready",
    orderedMedia: validated.prepared,
    analysis: output,
    analysisPipelineVersion: pipelineVersion,
    summary: output.summary,
    coverage: "ordered_media",
    personalAnalysis: { ...job, state: "completed", ...usage },
    error: undefined,
    updatedAt: now,
  });
  await syncCategories(ctx, (await ctx.db.get(source._id))!, output);
  await syncKnowledge(ctx, (await ctx.db.get(source._id))!, { enqueue: false });
}
