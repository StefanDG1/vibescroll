"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  prepareOrderedMedia,
  OrderedMediaPreparationError,
} from "../packages/providers/ordered-media";
import { inspectOrderedMedia } from "../packages/social/preparation";
import {
  orderedIntakeAssets,
  orderedIntakeMetadata,
} from "../packages/social/ordered-intake";
import { orderedGoogleOperations } from "./lib/googleOrderedMedia";
import {
  audioTimingWarning,
  orderedDiagnostics,
} from "../packages/social/diagnostics";

export const prepare = internalAction({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a): Promise<{ prepared: boolean }> => {
    const dispatched = await ctx.runMutation(
      internal.orderedMediaRuntime.begin,
      a,
    );
    if (!dispatched.dispatched) return { prepared: false };
    const stage = JSON.parse(dispatched.stageJson);
    let computeCredits = 0,
      inferenceMicros = 0,
      inputTokens = 0,
      outputTokens = 0;
    let computeKnown = false,
      pendingInference = false;
    const checkpoint = async () => {
      await ctx.runMutation(internal.orderedMediaRuntime.recordProgress, {
        ...a,
        bindingHash: stage.bindingHash,
        computeCredits,
        inferenceMicros,
        inputTokens,
        outputTokens,
        usageUnconfirmed: !computeKnown || pendingInference,
      });
    };
    try {
      const authorize = async () => {
        await ctx.runQuery(internal.orderedMediaRuntime.authorize, a);
      };
      const decoded = await prepareOrderedMedia(
        orderedIntakeAssets.parse(stage.assets),
        {
          authorize,
          signal: AbortSignal.timeout(Math.max(1, stage.deadline - Date.now())),
        },
      );
      computeCredits = Math.ceil(
        decoded.computeSeconds * stage.computeCreditsPerSecond,
      );
      computeKnown = true;
      await checkpoint();
      const operations = orderedGoogleOperations(ctx, {
        authorize,
        deadline: stage.deadline,
        remainingMicros: () => (10 - computeCredits) * 10000 - inferenceMicros,
        recordUsage: (usage) => {
          inferenceMicros += usage.costMicros;
          inputTokens += usage.inputTokens;
          outputTokens += usage.outputTokens;
        },
        dispatch: (pending) => {
          pendingInference = pending;
        },
        checkpoint,
      });
      const inspected = await inspectOrderedMedia(
        decoded.manifest,
        decoded.files,
        orderedIntakeMetadata.parse(stage.metadata),
        {
          authorize,
          ...operations,
          signal: AbortSignal.timeout(Math.max(1, stage.deadline - Date.now())),
        },
      );
      const diagnostics = orderedDiagnostics.parse({
        omissions: inspected.omissions,
        warnings: [
          ...inspected.warnings,
          ...(decoded.manifest.assets.some(
            (asset) => asset.kind === "video" && asset.audio,
          )
            ? [audioTimingWarning]
            : []),
        ],
      });
      return await ctx.runMutation(internal.orderedMediaRuntime.finish, {
        ...a,
        bindingHash: stage.bindingHash,
        prepared: {
          schemaVersion: inspected.schemaVersion,
          post: inspected.post,
          evidence: inspected.evidence,
        },
        ...diagnostics,
        computeCredits,
        inferenceMicros,
        inputTokens,
        outputTokens,
      });
    } catch (error) {
      if (
        error instanceof OrderedMediaPreparationError &&
        error.computeSeconds !== undefined
      ) {
        computeKnown = true;
        computeCredits = Math.ceil(
          error.computeSeconds * stage.computeCreditsPerSecond,
        );
      }
      await checkpoint();
      await ctx.runMutation(internal.product.commitAnalysis, {
        ...a,
        error:
          "Ordered preparation stopped. Confirmed usage was recorded; unknown usage remains held. Audio or omitted children were not silently treated as inspected. Review before an explicit retry.",
        credits:
          computeKnown && !pendingInference
            ? computeCredits + Math.ceil(inferenceMicros / 10000)
            : 0,
        retainReservation: !computeKnown || pendingInference,
      });
      return { prepared: false };
    }
  },
});
