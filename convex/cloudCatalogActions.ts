"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createHash } from "node:crypto";
import { signedObject } from "../packages/providers/storage";
import { jpegDimensions } from "../packages/media/jpeg";
import { ensure } from "../packages/policy";

export const contribute = action({
  args: {
    sourceId: v.id("sources"),
    versionId: v.id("analysisVersions"),
    key: v.string(),
    consent: v.any(),
  },
  returns: v.object({
    contributionId: v.id("catalogContributions"),
    state: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    contributionId: import("./_generated/dataModel").Id<"catalogContributions">;
    state: string;
  }> => {
    const prepared = await ctx.runMutation(internal.cloudCatalog.prepare, args);
    if (prepared.existing)
      return { contributionId: prepared.contributionId, state: prepared.state };
    ensure(
      prepared.copyToken,
      "APPROVAL_STALE",
      "The copy lease was not returned.",
    );
    const binding = {
      contributionId: prepared.contributionId,
      copyToken: prepared.copyToken,
    };
    try {
      const input = await ctx.runQuery(
        internal.cloudCatalog.copyInput,
        binding,
      );
      ensure(
        input.frames.length >= 1 && input.frames.length <= 8,
        "INVALID_EVIDENCE",
        "Copy at most eight retained screenshots.",
      );
      const buffers: { targetKey: string; bytes: Buffer }[] = [];
      let bytesRead = 0;
      for (const frame of input.frames) {
        const response = await fetch(signedObject(frame.key, "GET", 30), {
          redirect: "error",
          signal: AbortSignal.timeout(6000),
        });
        ensure(
          response.ok &&
            response.headers.get("content-type")?.split(";")[0] ===
              "image/jpeg",
          "STORAGE_UNAVAILABLE",
          "A retained screenshot is unavailable.",
        );
        const chunks: Uint8Array[] = [],
          reader = response.body?.getReader();
        ensure(
          reader,
          "STORAGE_UNAVAILABLE",
          "The retained screenshot has no body.",
        );
        let size = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            bytesRead += part.value.length;
            ensure(
              size <= Math.min(frame.size, 150000) && bytesRead <= 1200000,
              "INVALID_EVIDENCE",
              "The bounded screenshot copy exceeded its byte allowance.",
            );
            chunks.push(part.value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        const bytes = Buffer.concat(chunks),
          dimensions = jpegDimensions(bytes);
        ensure(
          bytes.length === frame.size &&
            dimensions.width === frame.width &&
            dimensions.height === frame.height &&
            createHash("sha256").update(bytes).digest("hex") === frame.sha256,
          "INVALID_EVIDENCE",
          "Retained screenshot bytes changed.",
        );
        buffers.push({ targetKey: frame.targetKey, bytes });
      }
      // No object is uploaded until every source JPEG and current authority pass.
      const checked = await ctx.runQuery(
        internal.cloudCatalog.copyInput,
        binding,
      );
      ensure(
        JSON.stringify(input.frames) === JSON.stringify(checked.frames),
        "APPROVAL_STALE",
        "The screenshot copy manifest changed.",
      );
      for (const item of buffers) {
        await ctx.runQuery(internal.cloudCatalog.copyInput, binding);
        const response = await fetch(signedObject(item.targetKey, "PUT", 30), {
          method: "PUT",
          headers: {
            "content-type": "image/jpeg",
            "cache-control": "private, no-store",
          },
          body: Uint8Array.from(item.bytes),
          redirect: "error",
          signal: AbortSignal.timeout(6000),
        });
        ensure(
          response.ok,
          "STORAGE_UNAVAILABLE",
          "The independent screenshot copy was not confirmed.",
        );
      }
      await ctx.runMutation(internal.cloudCatalog.commitCopy, binding);
      return { contributionId: prepared.contributionId, state: "published" };
    } catch {
      const outcome = await ctx.runMutation(
        internal.cloudCatalog.failCopy,
        binding,
      );
      return { contributionId: prepared.contributionId, state: outcome.state };
    }
  },
});
