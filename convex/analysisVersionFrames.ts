"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createHash } from "node:crypto";
import { signedObject } from "../packages/providers/storage";
import { ensure } from "../packages/policy";
import { jpegDimensions } from "../packages/media/jpeg";

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
    const response = await fetch(signedObject(before.key, "GET", 30), {
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    });
    ensure(
      response.ok &&
        response.headers.get("content-type")?.split(";")[0] === "image/jpeg",
      "STORAGE_UNAVAILABLE",
      "The retained JPEG is unavailable.",
    );
    const chunks: Uint8Array[] = [];
    const reader = response.body?.getReader();
    ensure(reader, "STORAGE_UNAVAILABLE", "The retained JPEG has no body.");
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        ensure(
          total <= Math.min(before.size, 150000),
          "INVALID_EVIDENCE",
          "Retained image exceeds its bound.",
        );
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = Buffer.concat(chunks);
    const dimensions = jpegDimensions(bytes);
    ensure(
      bytes.length === before.size &&
        dimensions.width === before.width &&
        dimensions.height === before.height &&
        createHash("sha256").update(bytes).digest("hex") === before.sha256,
      "INVALID_EVIDENCE",
      "Retained image bytes changed.",
    );
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
