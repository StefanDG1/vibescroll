"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ensure } from "../packages/policy";
import { readRetainedJpeg } from "./lib/retainedJpeg";

export const read = internalAction({
  args: {
    sourceId: v.id("sources"),
    attemptId: v.id("analysisAttempts"),
    generation: v.optional(v.number()),
    taskId: v.string(),
    leaseToken: v.string(),
    frameId: v.string(),
  },
  returns: v.object({
    mimeType: v.literal("image/jpeg"),
    data: v.string(),
    frameId: v.string(),
    timestampMs: v.number(),
    sha256: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    mimeType: "image/jpeg";
    data: string;
    frameId: string;
    timestampMs: number;
    sha256: string;
  }> => {
    const before = await ctx.runQuery(
      internal.analysisVersions.frameContext,
      args,
    );
    const bytes = await readRetainedJpeg(before);
    // Recheck authority after storage I/O, before disclosing bytes or acknowledging a read.
    const after = await ctx.runQuery(
      internal.analysisVersions.frameContext,
      args,
    );
    ensure(
      before.key === after.key && before.sha256 === after.sha256,
      "APPROVAL_STALE",
      "Retained frame changed during retrieval.",
    );
    await ctx.runMutation(internal.analysisVersions.acknowledgeFrame, args);
    return {
      mimeType: "image/jpeg" as const,
      data: bytes.toString("base64"),
      frameId: before.frameId,
      timestampMs: before.timestampMs,
      sha256: before.sha256,
    };
  },
});
