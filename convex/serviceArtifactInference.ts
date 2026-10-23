"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  inferGoogle,
  failedInferenceSettlement,
  type GoogleMeasuredUsage,
} from "./lib/googleInference";
import {
  googleCostPolicy,
  googleInferenceModel,
} from "../packages/providers/google-inference";
import { inferencePayload } from "../packages/policy/inference-broker";
import { socialAnalysisOutput } from "../packages/social/analysis";
import { mergeOrderedWarnings } from "../packages/social/diagnostics";

export const analyze = internalAction({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    // begin is a one-way dispatch fence. A replay never settles or overwrites
    // another invocation's reservation/result, even if that invocation is slow.
    const prepared = await ctx.runMutation(
      internal.serviceArtifactRuntime.begin,
      a,
    );
    if (!prepared.dispatched) return;
    let started = false;
    let usage: GoogleMeasuredUsage | undefined;
    try {
      started = true;
      const result = await inferGoogle(
        ctx,
        inferencePayload.parse(JSON.parse(prepared.payloadJson)),
        (measured) => {
          usage = measured;
        },
      );
      if (!usage) throw Error("SERVICE_USAGE_UNCONFIRMED");
      const prior = prepared.preparationUsage;
      const inferenceMicros = prior.inferenceMicros + usage.costMicros;
      const credits = prior.computeCredits + Math.ceil(inferenceMicros / 10000);
      const output = socialAnalysisOutput.parse(result.output);
      output.warnings = mergeOrderedWarnings(output.warnings, prior.warnings);
      await ctx.runMutation(internal.product.commitAnalysis, {
        ...a,
        output,
        credits,
        receipt: {
          generation: a.generation,
          route: "google_metered",
          model: googleInferenceModel,
          costPolicy: googleCostPolicy,
          startedAt: prepared.processingStartedAt,
          completedAt: Date.now(),
          inputTokens: prior.inputTokens + usage.inputTokens,
          outputTokens: prior.outputTokens + usage.outputTokens,
          inferenceMicros,
          computeCredits: prior.computeCredits,
          chargedCredits: credits,
          reusedMedia: false,
        },
      });
    } catch (error) {
      await ctx.runMutation(internal.product.commitAnalysis, {
        ...a,
        error:
          "Shared analysis stopped. Confirmed usage was recorded; unknown usage remains held. Review before an explicit retry. No alternate funding route ran.",
        ...failedInferenceSettlement(
          error,
          started,
          usage
            ? prepared.preparationUsage.computeCredits +
                Math.ceil(
                  (prepared.preparationUsage.inferenceMicros +
                    usage.costMicros) /
                    10000,
                )
            : undefined,
        ),
      });
      return;
    }
    // Artifact failure cannot turn a confirmed ready analysis into an inferred
    // failure or discharge an unknown hold. A later explicit request can finish
    // publishing this exact completed managed result without new inference.
    await ctx.runMutation(internal.serviceArtifacts.commit, {
      sourceId: a.id,
      generation: a.generation,
      compatibilityKey: prepared.compatibilityKey,
      result: (await ctx.runQuery(internal.product.workerSource, { id: a.id }))
        ?.analysis,
    });
  },
});
