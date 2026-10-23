"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  prepareOrderedMedia,
  OrderedMediaPreparationError,
} from "../packages/providers/ordered-media";
import { signedObject, objectMetadata } from "../packages/providers/storage";
import { randomUUID, createHash } from "node:crypto";
import { exactArrayBuffer } from "../packages/providers/binary";
import { ensure } from "../packages/policy";

export const prepare = internalAction({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const first = await ctx.runMutation(
      internal.personalOrderedMediaState.begin,
      a,
    );
    if (!first) return;
    const staged: string[] = [];
    let computeCredits: number | undefined;
    const rate = Number(process.env.SANDBOX_CREDITS_PER_SECOND);
    try {
      ensure(
        Number.isFinite(rate) && rate > 0 && Math.ceil(300 * rate) <= 10,
        "QUOTE_CHANGED",
        "Review the bounded media compute quote.",
      );
      const authorize = async () => {
        if (
          !(await ctx.runQuery(internal.personalOrderedMediaState.snapshot, a))
        )
          throw Error("APPROVAL_STALE");
      };
      const decoded = await prepareOrderedMedia(first.input.assets, {
        authorize,
      });
      computeCredits = Math.ceil(decoded.computeSeconds * rate);
      await authorize();
      const now = Date.now(),
        expiresAt = Math.min(
          now + 3600000,
          first.source.sourceRetentionUntil ?? Infinity,
          ...first.rows.map((r) => r.expiresAt ?? Infinity),
        );
      const objects = [];
      for (const asset of decoded.manifest.assets)
        for (const file of [
          ...asset.representations,
          ...(asset.audio ? [asset.audio] : []),
        ]) {
          await authorize();
          const bytes = decoded.files.get(file.file)!;
          const key = `${first.source.organizationId}/ordered-${randomUUID()}`;
          staged.push(key);
          const type = file.file.endsWith(".wav") ? "audio/wav" : "image/jpeg";
          const response = await fetch(signedObject(key, "PUT", 300), {
            method: "PUT",
            headers: { "Content-Type": type },
            body: exactArrayBuffer(bytes),
            redirect: "error",
            signal: AbortSignal.timeout(30000),
          });
          ensure(
            response.ok,
            "STORAGE_UNAVAILABLE",
            "A private prepared object could not be written.",
          );
          const metadata = await objectMetadata(key);
          ensure(
            metadata.size === bytes.length && metadata.type === type,
            "INVALID_EVIDENCE",
            "Private prepared bytes changed.",
          );
          const args = {
            sourceId: a.id,
            generation: a.generation,
            key,
            size: bytes.length,
            etag: metadata.etag ?? "",
          };
          const assetId = await ctx.runMutation(
            type === "audio/wav"
              ? internal.assets.registerNormalized
              : internal.assets.registerEvidence,
            args,
          );
          ensure(assetId, "APPROVAL_STALE", "The ordered source changed.");
          await ctx.runMutation(internal.personalOrderedMediaState.bindObject, {
            ...a,
            assetId,
            expiresAt,
          });
          objects.push({
            file: file.file,
            assetId,
            key,
            size: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            type,
          });
        }
      const warnings = [
        ...(decoded.manifest.omitted.length
          ? [
              "Some original children could not be decoded; their original positions remain omitted.",
            ]
          : []),
        ...(decoded.manifest.assets.some((a) => a.kind === "video")
          ? [
              "Video evidence includes sampled frames and any explicitly transcribed audio; short scenes may be missed.",
            ]
          : []),
        ...(first.input.metadata.schemaVersion === "provided-media-v1"
          ? ["This is user-supplied media with unverified source attribution."]
          : []),
      ];
      const media = {
        schemaVersion: "personal-ordered-media-v1",
        generation: a.generation,
        inputBinding: first.source.personalAnalysis!.ordered!.inputBinding,
        metadata: first.input.metadata,
        manifest: decoded.manifest,
        objects,
        warnings,
        omissions: decoded.manifest.omitted,
        preparedAt: now,
        expiresAt,
      };
      if (
        await ctx.runMutation(internal.personalOrderedMediaState.finish, {
          ...a,
          organizationId: first.source.organizationId,
          computeCredits,
          media,
        })
      )
        return;
    } catch (error) {
      if (
        error instanceof OrderedMediaPreparationError &&
        error.computeSeconds !== undefined
      )
        computeCredits = Math.ceil(error.computeSeconds * rate);
      await ctx.runMutation(internal.personalOrderedMediaState.finish, {
        ...a,
        organizationId: first.source.organizationId,
        ...(computeCredits === undefined ? {} : { computeCredits }),
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
    claimToken: v.string(),
  },
  handler: async (ctx, a): Promise<any> => {
    const value = await ctx.runQuery(
      internal.personalAnalysis.orderedMediaLease,
      a,
    );
    return {
      ...value,
      objects: value.objects.map((o: any) => ({
        file: o.file,
        id: o.assetId,
        size: o.size,
        sha256: o.sha256,
        type: o.type,
        url: signedObject(o.key, "GET", 120),
      })),
    };
  },
});
