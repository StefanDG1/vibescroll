"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  prepareMedia,
  MediaPreparationError,
} from "../packages/providers/media";
import { personalDecoder } from "../packages/media/decoder-personal";
import { signedObject, objectMetadata } from "../packages/providers/storage";
import { createHash, randomUUID } from "node:crypto";
import { ensure } from "../packages/policy";
import { exactArrayBuffer } from "../packages/providers/binary";
import { sourceRetained } from "./lib/sourceAuthority";

export const prepare = internalAction({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const source = await ctx.runMutation(internal.personalMediaState.begin, a);
    if (!source) return;
    let computeCredits: number | undefined;
    let stage = "decode";
    const staged: string[] = [];
    try {
      const input = await ctx.runQuery(
        internal.personalMediaState.inputSnapshot,
        a,
      );
      ensure(
        input,
        "APPROVAL_STALE",
        "The original media input is unavailable.",
      );
      const source = input.source;
      ensure(
        source.rightsAttested && sourceRetained(source),
        "APPROVAL_STALE",
        "Source rights or retention changed before preparation.",
      );
      const rate = Number(process.env.SANDBOX_CREDITS_PER_SECOND);
      // Bound total sandbox lifetime, not just the expected clip time.
      ensure(
        Number.isFinite(rate) && rate > 0 && Math.ceil(300 * rate) <= 10,
        "QUOTE_CHANGED",
        "The media worker's configured ceiling exceeds the approved budget.",
      );
      const prepared = await prepareMedia(
        source.kind === "url" ? { url: source.url! } : source.objectKey!,
        personalDecoder,
        true,
      );
      computeCredits = Math.ceil(prepared.computeSeconds * rate);
      ensure(
        computeCredits <= 10,
        "BUDGET_EXCEEDED",
        "Compute exceeded its approved ceiling.",
      );
      const currentInput = await ctx.runQuery(
        internal.personalMediaState.inputSnapshot,
        a,
      );
      if (
        !currentInput ||
        currentInput.inputBinding !== input.inputBinding ||
        currentInput.cacheBinding !== input.cacheBinding
      )
        throw new Error("CANCELED");
      const preparedAt = Date.now();
      const media: any = {
        durationMs: Math.round(prepared.manifest.durationSeconds * 1000),
        coverage: prepared.manifest.coverage,
        frames: [],
        ...(input.cacheBinding
          ? {
              preparation: {
                version: "personal-preparation-v1",
                generation: a.generation,
                binding: input.cacheBinding,
                inputBinding: input.inputBinding,
                preparedAt,
                expiresAt: input.expiresAt,
              },
            }
          : {}),
      };
      const put = async (bytes: Uint8Array, type: string) => {
        stage = "storage_write";
        const key = `${source.organizationId}/personal-${randomUUID()}`;
        staged.push(key);
        const res = await fetch(signedObject(key, "PUT", 120), {
          method: "PUT",
          headers: { "Content-Type": type },
          body: exactArrayBuffer(bytes),
          signal: AbortSignal.timeout(30000),
        });
        ensure(res.ok, "STORAGE_UNAVAILABLE", "Private media write failed.");
        stage = "storage_verify";
        const metadata = await objectMetadata(key);
        if (metadata.size !== bytes.byteLength || metadata.type !== type)
          console.error("personal_media_metadata_mismatch", {
            expectedSize: bytes.byteLength,
            receivedSize: metadata.size,
            expectedType: type,
            receivedType: [
              "audio/wav",
              "image/jpeg",
              "application/octet-stream",
            ].includes(metadata.type ?? "")
              ? metadata.type
              : "other",
          });
        ensure(
          metadata.size === bytes.byteLength && metadata.type === type,
          "INVALID_EVIDENCE",
          "Media write changed.",
        );
        return {
          key,
          size: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          etag: metadata.etag ?? "",
        };
      };
      if (prepared.audio) {
        const blob = await put(prepared.audio, "audio/wav");
        stage = "audio_register";
        const assetId = await ctx.runMutation(
          internal.assets.registerNormalized,
          {
            sourceId: a.id,
            generation: a.generation,
            key: blob.key,
            size: blob.size,
            etag: blob.etag,
          },
        );
        ensure(assetId, "APPROVAL_STALE", "Media source changed.");
        media.audio = { ...blob, assetId };
      }
      for (const f of prepared.frames) {
        if (!(await ctx.runQuery(internal.personalMediaState.pending, a)))
          throw new Error("CANCELED");
        const blob = await put(Buffer.from(f.data, "base64"), "image/jpeg");
        stage = "frame_register";
        const assetId = await ctx.runMutation(
          internal.assets.registerEvidence,
          {
            sourceId: a.id,
            generation: a.generation,
            key: blob.key,
            size: blob.size,
            etag: blob.etag,
          },
        );
        ensure(assetId, "APPROVAL_STALE", "Media source changed.");
        media.frames.push({
          ...blob,
          assetId,
          timestampMs: f.timestampMs,
          selectionReason: f.selectionReason,
        });
      }
      stage = "queue";
      const accepted = await ctx.runMutation(
        internal.personalMediaState.finish,
        {
          ...a,
          organizationId: source.organizationId,
          computeCredits,
          media,
          inputBinding: input.inputBinding,
          ...(prepared.acquisition
            ? { acquisition: prepared.acquisition }
            : {}),
        },
      );
      if (accepted) return;
    } catch (error) {
      if (
        error instanceof MediaPreparationError &&
        error.computeSeconds !== undefined
      )
        computeCredits = Math.ceil(
          error.computeSeconds * Number(process.env.SANDBOX_CREDITS_PER_SECOND),
        );
      const message = error instanceof Error ? error.message : "";
      const category =
        [
          "APPROVAL_STALE",
          "INVALID_EVIDENCE",
          "STORAGE_UNAVAILABLE",
          "UPLOAD_INCOMPLETE",
          "QUOTE_CHANGED",
          "BUDGET_EXCEEDED",
          "CANCELED",
        ].find((code) => message.includes(code)) ?? "UNCLASSIFIED";
      console.error("personal_media_failed", {
        stage,
        category,
        computeKnown: computeCredits !== undefined,
      });
      await ctx.runMutation(internal.personalMediaState.finish, {
        ...a,
        organizationId: source.organizationId,
        ...(computeCredits === undefined ? {} : { computeCredits }),
        ...(error instanceof MediaPreparationError && error.acquisition
          ? { acquisition: error.acquisition }
          : {}),
      });
    }
    for (const key of staged)
      await ctx.runMutation(internal.assets.queueEvidenceDeletion, { key });
  },
});
export const lease = internalAction({
  args: {
    credentialHash: v.string(),
    id: v.id("sources"),
    generation: v.number(),
  },
  handler: async (ctx, a): Promise<any> => {
    const media = await ctx.runQuery(internal.personalAnalysis.mediaLease, a);
    ensure(media, "APPROVAL_STALE", "Media unavailable.");
    ensure(
      media.sourceAuthority && sourceRetained(media.sourceAuthority),
      "APPROVAL_STALE",
      "Source rights or retention changed before media delivery.",
    );
    const blob = (b: any) => ({
      id: b.assetId,
      size: b.size,
      sha256: b.sha256,
      url: signedObject(b.key, "GET", 120),
    });
    return {
      durationMs: media.durationMs,
      coverage: media.coverage,
      ...(media.audio ? { audio: blob(media.audio) } : {}),
      frames: media.frames.map((f: any) => ({
        ...blob(f),
        timestampMs: f.timestampMs,
        selectionReason: f.selectionReason,
      })),
    };
  },
});
