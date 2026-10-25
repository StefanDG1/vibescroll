"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { randomUUID } from "node:crypto";
import { sourcePreview } from "../packages/providers/source-preview";
import { signedObject, objectMetadata } from "../packages/providers/storage";
import { exactArrayBuffer } from "../packages/providers/binary";
export const retrieve = internalAction({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const s = await ctx.runMutation(internal.sourcePreviewState.begin, { id });
    if (!s) return;
    let key: string | undefined;
    try {
      const preview = await sourcePreview(s.url);
      if (!preview) {
        await ctx.runMutation(internal.sourcePreviewState.finish, {
          id,
          canonical: s.canonical,
          generation: s.generation,
        });
        return;
      }
      const fields = {
        id,
        canonical: s.canonical,
        generation: s.generation,
        title: preview.title,
        authorName: preview.authorName,
        durationSeconds: preview.durationSeconds,
        publishedAt: preview.publishedAt,
      };
      if (!("bytes" in preview) || !preview.bytes) {
        await ctx.runMutation(internal.sourcePreviewState.finish, fields);
        return;
      }
      key = `${s.organizationId}/thumbnail-${randomUUID()}`;
      const res = await fetch(signedObject(key, "PUT", 120), {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: exactArrayBuffer(preview.bytes),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw Error();
      const metadata = await objectMetadata(key);
      if (
        metadata.size !== preview.bytes.length ||
        metadata.type !== "image/jpeg"
      )
        throw Error();
      const accepted = await ctx.runMutation(
        internal.sourcePreviewState.finish,
        {
          ...fields,
          key,
          size: preview.bytes.length,
          etag: metadata.etag || "",
        },
      );
      if (!accepted)
        await ctx.runMutation(internal.assets.queueEvidenceDeletion, { key });
    } catch {
      if (key)
        await ctx.runMutation(internal.assets.queueEvidenceDeletion, { key });
      await ctx.runMutation(internal.sourcePreviewState.finish, {
        id,
        canonical: s.canonical,
        generation: s.generation,
      });
    }
  },
});
