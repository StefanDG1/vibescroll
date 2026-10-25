"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createHash, randomUUID } from "node:crypto";
import { signedObject, objectMetadata } from "../packages/providers/storage";
import { exactArrayBuffer } from "../packages/providers/binary";
import { workCloudFrameInput } from "../packages/contracts/work-cloud-text";
import { ensure } from "../packages/policy";
import { jpegDimensions } from "../packages/media/jpeg";

export const upload = internalAction({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    taskId: v.string(),
    leaseToken: v.string(),
    preparationHash: v.string(),
    frameId: v.string(),
    data: v.string(),
  },
  returns: v.object({ assetId: v.string() }),
  handler: async (ctx, raw): Promise<{ assetId: string }> => {
    const parsed = workCloudFrameInput.parse(raw);
    const { data, ...lease } = { ...parsed, sourceId: raw.sourceId };
    const c = await ctx.runQuery(
      internal.workCloudAnalysis.frameUploadContext,
      lease,
    );
    const bytes = Buffer.from(data, "base64");
    const dimensions = jpegDimensions(bytes);
    ensure(
      bytes.toString("base64") === data &&
        bytes.length === c.frame.bytes &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255 &&
        bytes.at(-2) === 255 &&
        bytes.at(-1) === 217 &&
        dimensions.width === c.frame.width &&
        dimensions.height === c.frame.height &&
        createHash("sha256").update(bytes).digest("hex") === c.frame.sha256,
      "INVALID_EVIDENCE",
      "Image bytes do not match the prepared JPEG frame.",
    );
    if (c.assetId) return { assetId: c.assetId };
    const key = `${c.organizationId}/cloud-frame-${randomUUID()}`;
    try {
      const response = await fetch(signedObject(key, "PUT", 60), {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: exactArrayBuffer(bytes),
        signal: AbortSignal.timeout(6000),
      });
      ensure(response.ok, "STORAGE_UNAVAILABLE", "Private frame write failed.");
      const meta = await objectMetadata(key, 4000);
      ensure(
        meta.size === bytes.length && meta.type === "image/jpeg",
        "INVALID_EVIDENCE",
        "Private storage changed image metadata.",
      );
      // Repeat all lease, rights, generation and preparation checks after I/O.
      const result = await ctx.runMutation(
        internal.workCloudAnalysis.recordFrame,
        {
          ...lease,
          key,
          size: meta.size,
          etag: meta.etag ?? "",
        },
      );
      ensure(
        result,
        "STORAGE_UNAVAILABLE",
        "The private image quota is unavailable.",
      );
      return result;
    } catch (error) {
      await ctx.runMutation(internal.assets.queueEvidenceDeletion, { key });
      throw error;
    }
  },
});
