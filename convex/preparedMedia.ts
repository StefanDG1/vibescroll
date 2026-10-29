"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { prepareHostedEvidence } from "../packages/providers/prepared-media";
import { transcribePreparedAudio } from "../packages/providers/vercel-transcription";
import { analyzePreparedEvidence } from "../packages/providers/vercel-insights";
import { makePreparedEvidence } from "../packages/contracts/prepared-evidence";
import { privateCloudMediaIdentity } from "../packages/social/contracts";
import {
  signedObject,
  objectMetadata,
  deleteObject,
} from "../packages/providers/storage";
import {
  exactArrayBuffer,
  readResponseBytes,
} from "../packages/providers/binary";
import { ensure, PolicyError } from "../packages/policy";

export const runRetainedGateway = internalAction({
  args: { runId: v.id("mediaPreparations") },
  returns: v.null(),
  handler: async (ctx, { runId }): Promise<null> => {
    if (
      !(await ctx.runMutation(internal.preparedAnalysis.claimRetainedGateway, {
        runId,
      }))
    )
      return null;
    try {
      const input = await ctx.runQuery(
        internal.preparedAnalysis.retainedGatewayInput,
        { runId },
      );
      const apiKey = process.env.VERCEL_AI_GATEWAY_API_KEY;
      ensure(
        apiKey && apiKey.length > 10,
        "SETUP_REQUIRED",
        "Configure the bounded Gateway credential.",
      );
      const frames = await Promise.all(
        input.frames.map(async (f) => {
          const response = await fetch(signedObject(f.key, "GET", 30), {
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          });
          ensure(
            response.ok,
            "STORAGE_UNAVAILABLE",
            "Retained source image is unavailable.",
          );
          return {
            id: f.frameId,
            bytes: await readResponseBytes(response, Math.min(f.size, 150000)),
          };
        }),
      );
      await ctx.runQuery(internal.preparedAnalysis.retainedGatewayInput, {
        runId,
      });
      const result = await analyzePreparedEvidence({
        sourceId: input.sourceId,
        attemptId: runId,
        prepared: input.prepared,
        frames,
        apiKey,
        maximumUsd: input.maximumApiUsd,
        contributorAllowed: input.contributorAllowed,
        onReceipt: async (receipt) => {
          await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
            runId,
            kind: "analysis",
            receipt,
          });
        },
        onRejection: async (receipt) => {
          await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
            runId,
            kind: "analysis_rejection",
            receipt,
          });
        },
        onOutput: async (receipt) => {
          await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
            runId,
            kind: "analysis_output",
            receipt,
          });
        },
        onValidation: async (receipt) => {
          await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
            runId,
            kind: "analysis_validation",
            receipt,
          });
        },
      });
      await ctx.runMutation(internal.preparedAnalysis.finishGateway, {
        runId,
        ...result,
      });
    } catch (error) {
      await ctx.runMutation(internal.preparedAnalysis.fail, {
        runId,
        code:
          error instanceof PolicyError
            ? error.code
            : "PREPARATION_OUTCOME_UNCONFIRMED",
      });
    }
    return null;
  },
});

export const run = internalAction({
  args: { runId: v.id("mediaPreparations") },
  returns: v.null(),
  handler: async (ctx, { runId }): Promise<null> => {
    const keys: string[] = [];
    let retained = false;
    try {
      if (!(await ctx.runMutation(internal.preparedAnalysis.claim, { runId })))
        return null;
      const input = await ctx.runQuery(internal.preparedAnalysis.input, {
        runId,
      });
      const apiKey = process.env.VERCEL_AI_GATEWAY_API_KEY;
      ensure(
        apiKey && apiKey.length > 10,
        "SETUP_REQUIRED",
        "Configure the bounded Vercel Gateway test credential.",
      );
      const prepared = await prepareHostedEvidence(input.url, {
        stage: async (stage) => {
          await ctx.runMutation(internal.preparedAnalysis.progress, {
            runId,
            stage,
          });
        },
        metadata: async (metadata) => {
          await ctx.runMutation(internal.preparedAnalysis.progress, {
            runId,
            stage: "metadata",
            metadata,
          });
        },
      });
      const preparationReceipt = {
        startedAt: prepared.startedAt,
        times: prepared.times,
        sandboxId: prepared.sandboxId,
        stopAcknowledged: prepared.stopped,
        providerDeletionVerified: false,
        toolchain: {
          downloader: prepared.downloaderVersion,
          ffmpeg: prepared.sourceReceipt.ffmpegVersion,
          ffprobe: prepared.sourceReceipt.ffprobeVersion,
          python: prepared.sourceReceipt.pythonVersion,
        },
      };
      await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
        runId,
        kind: "preparation",
        receipt: preparationReceipt,
      });
      await ctx.runMutation(internal.preparedAnalysis.progress, {
        runId,
        stage: "transcribing",
      });
      const durationMs = Math.round(prepared.manifest.durationSeconds * 1000);
      const native = prepared.transcript
        ? z
            .object({
              segments: z.array(
                z.object({
                  id: z.string(),
                  text: z.string(),
                  startMs: z.number(),
                  endMs: z.number(),
                }),
              ),
              transcript: z.object({
                origin: z.enum([
                  "platform_manual",
                  "platform_auto",
                  "platform_unknown",
                ]),
                language: z.string(),
                trackSha256: z.string(),
              }),
            })
            .parse(prepared.transcript)
        : null;
      await ctx.runQuery(internal.preparedAnalysis.input, { runId });
      // The ASR request and durable JPEG upload are independent once decoding completes.
      const asrPromise = native
        ? Promise.resolve({
            segments: native.segments,
            language: native.transcript.language,
            provenance: {
              origin: native.transcript.origin,
              model: null,
              provider: null,
              inputSha256: native.transcript.trackSha256,
            },
            receipt: null,
          })
        : prepared.audio
          ? transcribePreparedAudio(
              prepared.audio,
              durationMs,
              Math.min(input.maximumApiUsd, 0.02),
              {
                apiKey,
                onReceipt: async (receipt) => {
                  await ctx.runMutation(
                    internal.preparedAnalysis.recordReceipt,
                    { runId, kind: "asr", receipt },
                  );
                },
                onTranscript: async (receipt) => {
                  await ctx.runMutation(
                    internal.preparedAnalysis.recordReceipt,
                    {
                      runId,
                      kind: "asr_output",
                      receipt,
                    },
                  );
                },
              },
            )
          : Promise.resolve({
              segments: [],
              language: "und",
              provenance: {
                origin: "none" as const,
                model: null,
                provider: null,
                inputSha256: null,
              },
              receipt: null,
            });
      const uploadsPromise = Promise.all(
        prepared.frames.map(async (frame) => {
          const key = `${input.organizationId}/prepared-${randomUUID()}`;
          keys.push(key);
          const response = await fetch(signedObject(key, "PUT", 120), {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: exactArrayBuffer(frame.bytes),
            signal: AbortSignal.timeout(12000),
          });
          ensure(
            response.ok,
            "STORAGE_UNAVAILABLE",
            "Prepared image storage failed.",
          );
          const metadata = await objectMetadata(key, 6000);
          ensure(
            metadata.size === frame.bytes.byteLength &&
              metadata.type?.split(";")[0] === "image/jpeg",
            "PREPARED_IMAGE_STORAGE_MISMATCH",
            "Stored image size or type changed.",
          );
          return {
            frameId: frame.id,
            key,
            sha256: frame.sha256,
            size: frame.bytes.byteLength,
            timestampMs: frame.timestampMs,
            width: frame.width,
            height: frame.height,
          };
        }),
      );
      const results = await Promise.allSettled([asrPromise, uploadsPromise]);
      const asrResult = results[0],
        uploadsResult = results[1];
      if (asrResult.status !== "fulfilled") throw asrResult.reason;
      if (uploadsResult.status !== "fulfilled") throw uploadsResult.reason;
      const asr = asrResult.value,
        frames = uploadsResult.value;
      const identity = privateCloudMediaIdentity(
        prepared.metadata.resolvedCanonical,
      );
      ensure(
        identity.platform === "instagram" || identity.platform === "tiktok",
        "SOURCE_UNAVAILABLE",
        "Use a supported social video.",
      );
      const recipeHash = createHash("sha256")
        .update(
          JSON.stringify({
            preparation: prepared.preparationRecipeHash,
            transcription: asr.provenance,
          }),
        )
        .digest("hex");
      const evidence = await makePreparedEvidence({
        requestedCanonical: input.canonical,
        canonical: identity.url,
        platform: identity.platform,
        sourceHash: prepared.sourceReceipt.sourceHash,
        recipeHash,
        downloaderVersion: prepared.downloaderVersion,
        title: prepared.metadata.title ?? "",
        authorName: prepared.metadata.authorName ?? "",
        durationMs,
        language: asr.language.split(/[-_]/)[0].toLowerCase(),
        observedAt: prepared.startedAt,
        transcript: asr.provenance,
        segments: asr.segments,
        frames: prepared.frames.map((f) => ({
          id: f.id,
          timestampMs: f.timestampMs,
          sha256: f.sha256,
          bytes: f.bytes.byteLength,
          width: f.width,
          height: f.height,
        })),
      });
      await ctx.runMutation(internal.preparedAnalysis.retain, {
        runId,
        prepared: evidence,
        frames,
        receipt: {
          preparation: preparationReceipt,
          asr: asr.receipt,
          funding: "operator_api_test",
          appCredits: 0,
          sourceBytes: prepared.sourceReceipt.sourceBytes,
        },
      });
      retained = true;
      if (input.executor === "work_cloud") {
        await ctx.runMutation(internal.preparedAnalysis.queueSubscription, {
          runId,
        });
      } else {
        await ctx.runMutation(internal.preparedAnalysis.progress, {
          runId,
          stage: "analyzing",
        });
        await ctx.runQuery(internal.preparedAnalysis.input, { runId });
        const result = await analyzePreparedEvidence({
          sourceId: input.sourceId,
          attemptId: runId,
          prepared: evidence,
          frames: prepared.frames.map((f) => ({ id: f.id, bytes: f.bytes })),
          apiKey,
          maximumUsd: 0.03,
          contributorAllowed: input.contributorAllowed,
          onReceipt: async (receipt) => {
            await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
              runId,
              kind: "analysis",
              receipt,
            });
          },
          onRejection: async (receipt) => {
            await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
              runId,
              kind: "analysis_rejection",
              receipt,
            });
          },
          onOutput: async (receipt) => {
            await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
              runId,
              kind: "analysis_output",
              receipt,
            });
          },
          onValidation: async (receipt) => {
            await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
              runId,
              kind: "analysis_validation",
              receipt,
            });
          },
        });
        await ctx.runMutation(internal.preparedAnalysis.finishGateway, {
          runId,
          ...result,
        });
      }
    } catch (error) {
      await ctx.runMutation(internal.preparedAnalysis.fail, {
        runId,
        code:
          error instanceof PolicyError
            ? error.code
            : "PREPARATION_OUTCOME_UNCONFIRMED",
      });
    } finally {
      if (!retained)
        await Promise.allSettled(
          keys.map(async (key) => {
            try {
              await deleteObject(key);
            } catch {
              await ctx.runMutation(internal.assets.queueEvidenceDeletion, {
                key,
              });
            }
          }),
        );
    }
    return null;
  },
});

// Operator-requested recovery of a verified zero-inference rejection. This
// consumes retained bytes and a fresh finite analysis authority, never media/ASR.
export const retryRejectedGateway = internalAction({
  args: {
    runId: v.id("mediaPreparations"),
    key: v.string(),
    generationId: v.string(),
    maximumApiUsd: v.optional(v.union(v.literal(0.02), v.literal(0.03))),
  },
  returns: v.null(),
  handler: async (ctx, a): Promise<null> => {
    const first = await ctx.runQuery(
      internal.preparedAnalysis.gatewayRetryInput,
      { runId: a.runId, key: a.key },
    );
    if (first.existing) return null;
    ensure(
      /^gen_[A-Za-z0-9]{20,80}$/.test(a.generationId),
      "INVALID_INPUT",
      "Use the exact operator-observed Gateway generation.",
    );
    const apiKey = process.env.VERCEL_AI_GATEWAY_API_KEY;
    ensure(
      apiKey && apiKey.length > 10,
      "SETUP_REQUIRED",
      "Configure the bounded Gateway credential.",
    );
    const response = await fetch(
      "https://ai-gateway.vercel.sh/v1/generation?id=" +
        encodeURIComponent(a.generationId),
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      },
    );
    ensure(
      response.ok,
      "COST_RECONCILIATION_REQUIRED",
      "Gateway did not verify the rejected generation.",
    );
    const record = JSON.parse(
      new TextDecoder().decode(await readResponseBytes(response, 20000)),
    );
    ensure(
      record.data?.id === a.generationId,
      "COST_RECONCILIATION_REQUIRED",
      "Gateway generation binding changed.",
    );
    const claimed = await ctx.runMutation(
      internal.preparedAnalysis.claimGatewayRetry,
      {
        runId: a.runId,
        key: a.key,
        generation: record.data,
        ...(a.maximumApiUsd ? { maximumApiUsd: a.maximumApiUsd } : {}),
      },
    );
    if (!claimed) return null;
    try {
      const input = await ctx.runQuery(
        internal.preparedAnalysis.gatewayRetryInput,
        { runId: a.runId, key: a.key, claimed: true },
      );
      ensure(
        !input.existing,
        "APPROVAL_STALE",
        "This retained retry is already finished.",
      );
      const frames = await Promise.all(
        input.frames.map(async (frame: any) => {
          const r = await fetch(signedObject(frame.key, "GET", 30), {
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          });
          ensure(
            r.ok,
            "STORAGE_UNAVAILABLE",
            "Retained source image is unavailable.",
          );
          return {
            id: frame.frameId,
            bytes: await readResponseBytes(r, Math.min(frame.size, 150000)),
          };
        }),
      );
      await ctx.runQuery(internal.preparedAnalysis.gatewayRetryInput, {
        runId: a.runId,
        key: a.key,
        claimed: true,
      });
      const result = await analyzePreparedEvidence({
        sourceId: input.sourceId,
        attemptId: a.runId,
        prepared: input.prepared,
        frames,
        apiKey,
        maximumUsd: input.maximumApiUsd,
        contributorAllowed: input.contributorAllowed,
        onReceipt: async (receipt) => {
          await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
            runId: a.runId,
            kind: "analysis",
            receipt,
          });
        },
        onRejection: async (receipt) => {
          await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
            runId: a.runId,
            kind:
              input.retryOrdinal === 2
                ? "analysis_retry_rejection"
                : "analysis_rejection",
            receipt,
          });
        },
        onOutput: async (receipt) => {
          await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
            runId: a.runId,
            kind: "analysis_output",
            receipt,
          });
        },
        onValidation: async (receipt) => {
          await ctx.runMutation(internal.preparedAnalysis.recordReceipt, {
            runId: a.runId,
            kind: "analysis_validation",
            receipt,
          });
        },
      });
      await ctx.runMutation(internal.preparedAnalysis.finishGateway, {
        runId: a.runId,
        ...result,
      });
    } catch (error) {
      await ctx.runMutation(internal.preparedAnalysis.fail, {
        runId: a.runId,
        code:
          error instanceof PolicyError
            ? error.code
            : "PREPARATION_OUTCOME_UNCONFIRMED",
      });
    }
    return null;
  },
});
