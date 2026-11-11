import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { currentOrderedSource } from "./workCloudMediaSource";
import { retainedCloudFrames } from "../../packages/media/cloud-frames";
import { ensure } from "../../packages/policy";

/** Persist only an acknowledged result and its sampled JPEGs, never raw media or credentials. */
export async function persistCloudResult(
  ctx: MutationCtx,
  source: Doc<"sources">,
) {
  await currentOrderedSource(source);
  ensure(
    source.state === "ready" && source.personalAnalysis?.state === "completed",
    "SOURCE_UNAVAILABLE",
    "Use a completed video result.",
  );
  const frames = retainedCloudFrames(source);
  ensure(
    frames.length > 0 &&
      frames.length === source.orderedMedia?.post.frames.length,
    "SOURCE_UNAVAILABLE",
    "Keep results only while every sampled screenshot is retained.",
  );
  for (const frame of frames) {
    const id = ctx.db.normalizeId("assets", frame.assetId),
      asset = id ? await ctx.db.get(id) : null;
    ensure(
      asset?.kind === "work_cloud_frame" &&
        asset.state === "complete" &&
        asset.sourceId === source._id &&
        asset.organizationId === source.organizationId &&
        asset.sourceGeneration === source.generation &&
        !(await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", asset.key))
          .unique()),
      "SOURCE_UNAVAILABLE",
      "A retained screenshot is unavailable.",
    );
    await ctx.db.patch(asset._id, { expiresAt: undefined });
  }
  await ctx.db.patch(source._id, {
    resultRetention: "until_deleted",
    sourceRetentionUntil: undefined,
  });
  // An existing baseline can be upgraded without rewriting its immutable output.
  if (source.selectedAnalysisVersionId) {
    const version = await ctx.db.get(source.selectedAnalysisVersionId);
    if (version?.owner === "private" && version.sourceId === source._id) {
      const evidence = await ctx.db.get(version.evidenceId);
      ensure(
        evidence?.owner === "private" &&
          evidence.sourceId === source._id &&
          evidence.state === "retained",
        "SOURCE_UNAVAILABLE",
        "Retained evidence changed.",
      );
      await ctx.db.patch(evidence._id, { resultRetention: "until_deleted" });
      await ctx.db.patch(version._id, { resultRetention: "until_deleted" });
    }
  }
}
