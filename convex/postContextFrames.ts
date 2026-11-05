"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ensure } from "../packages/policy";
import { readRetainedJpeg } from "./lib/retainedJpeg";

export const read = internalAction({
  args: {
    profileId: v.optional(v.id("organizations")),
    sourceId: v.id("sources"),
    analysisVersionId: v.id("analysisVersions"),
    frameId: v.string(),
    expectedEvidenceHash: v.string(),
    sharedGrantId: v.optional(v.id("teamKnowledgeGrants")),
    sharedGrantVersion: v.optional(v.number()),
  },
  returns: v.object({
    mimeType: v.literal("image/jpeg"),
    data: v.string(),
    frameId: v.string(),
    timestampMs: v.number(),
    sha256: v.string(),
    sourceId: v.id("sources"),
    analysisVersionId: v.id("analysisVersions"),
    evidenceHash: v.string(),
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
    sourceId: typeof args.sourceId;
    analysisVersionId: typeof args.analysisVersionId;
    evidenceHash: string;
  }> => {
    const before = await ctx.runQuery(internal.postContext.frameContext, args);
    const bytes = await readRetainedJpeg(before);
    const after = await ctx.runQuery(internal.postContext.frameContext, args);
    ensure(
      JSON.stringify(before) === JSON.stringify(after),
      "APPROVAL_STALE",
      "The retained frame or access changed during retrieval.",
    );
    return {
      mimeType: "image/jpeg",
      data: bytes.toString("base64"),
      frameId: before.frameId,
      timestampMs: before.timestampMs,
      sha256: before.sha256,
      sourceId: before.sourceId,
      analysisVersionId: before.analysisVersionId,
      evidenceHash: before.evidenceHash,
    };
  },
});
