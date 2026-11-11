"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ensure } from "../packages/policy";
import { readRetainedJpeg } from "./lib/retainedJpeg";

export const read = internalAction({
  args: {
    profileId: v.optional(v.id("organizations")),
    familyId: v.id("catalogFamilies"),
    artifactId: v.id("publicArtifacts"),
    frameId: v.string(),
  },
  returns: v.object({
    mimeType: v.literal("image/jpeg"),
    data: v.string(),
    familyId: v.id("catalogFamilies"),
    artifactId: v.id("publicArtifacts"),
    frameId: v.string(),
    sha256: v.string(),
    size: v.number(),
    width: v.number(),
    height: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    mimeType: "image/jpeg";
    data: string;
    familyId: typeof args.familyId;
    artifactId: typeof args.artifactId;
    frameId: string;
    sha256: string;
    size: number;
    width: number;
    height: number;
  }> => {
    // Mutations deliberately recheck current scope, membership, entitlement,
    // toggle, selected version and evidence on both sides of storage I/O.
    const before = await ctx.runMutation(
      internal.assistantWidget.catalogFrame,
      args,
    );
    const bytes = await readRetainedJpeg(before);
    const after = await ctx.runMutation(
      internal.assistantWidget.catalogFrame,
      args,
    );
    ensure(
      JSON.stringify(before) === JSON.stringify(after),
      "APPROVAL_STALE",
      "The catalog image or access changed during retrieval.",
    );
    return {
      mimeType: "image/jpeg",
      data: bytes.toString("base64"),
      familyId: args.familyId,
      artifactId: args.artifactId,
      frameId: args.frameId,
      sha256: before.sha256,
      size: before.size,
      width: before.width,
      height: before.height,
    };
  },
});
