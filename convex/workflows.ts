import { internalMutation } from "./lib/projectedMutations";
import { vWorkflowId, vResultValidator } from "@convex-dev/workflow";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
// Paid/external effects are deliberately not retried. Existing generation fences,
// reservations and fingerprinted stage reuse remain authoritative.
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 2, retryActionsByDefault: false },
});
export const linkPreview = workflow
  .define({ args: { id: v.id("sources") }, returns: v.null() })
  .handler(async (step, a): Promise<null> => {
    await step.runAction(internal.sourcePreview.retrieve, a, {
      retry: false,
      name: "bounded-private-link-preview-v1",
    });
    return null;
  });
export const sourceAnalysis = workflow
  .define({
    args: {
      id: v.id("sources"),
      generation: v.number(),
      media: v.boolean(),
      route: v.optional(
        v.union(
          v.literal("media"),
          v.literal("text"),
          v.literal("source_text"),
          v.literal("ordered_media"),
          v.literal("ordered_prepare"),
        ),
      ),
    },
    returns: v.null(),
  })
  .handler(async (step, a): Promise<null> => {
    try {
      if (a.route === "ordered_prepare") {
        const prepared = await step.runAction(
          internal.orderedMedia.prepare,
          { id: a.id, generation: a.generation },
          { retry: false, name: "bounded-ordered-preparation-v1" },
        );
        if (!prepared.prepared) return null;
      }
      await step.runAction(
        a.route === "ordered_media" || a.route === "ordered_prepare"
          ? internal.serviceArtifactInference.analyze
          : (a.route ?? (a.media ? "media" : "text")) === "media"
            ? internal.media.analyze
            : internal.integrations.analyze,
        { id: a.id, generation: a.generation },
        { retry: false, name: "bounded-source-analysis-v1" },
      );
    } catch {
      await step.runMutation(
        internal.product.commitAnalysis,
        {
          id: a.id,
          generation: a.generation,
          credits: 0,
          retainReservation: true,
          error:
            "The analysis worker stopped before confirming completion. Its usage reservation remains held for reconciliation. Review the provider before an explicit retry.",
        },
        { name: "source-worker-reconciliation-v1" },
      );
    }
    return null;
  });
export const personalPreparation = workflow
  .define({
    args: { id: v.id("sources"), generation: v.number() },
    returns: v.null(),
  })
  .handler(async (step, a): Promise<null> => {
    try {
      await step.runAction(internal.personalMedia.prepare, a, {
        retry: false,
        name: "bounded-personal-media-v1",
      });
    } catch {
      const source = await step.runQuery(internal.product.workerSource, {
        id: a.id,
      });
      if (source)
        await step.runMutation(
          internal.personalMediaState.finish,
          { ...a, organizationId: source.organizationId },
          { name: "personal-media-reconciliation-v1" },
        );
    }
    return null;
  });
export const coding = workflow
  .define({
    args: { id: v.id("runs"), generation: v.number() },
    returns: v.null(),
  })
  .handler(async (step, a): Promise<null> => {
    try {
      await step.runAction(
        internal.cloud.execute,
        { id: a.id },
        { retry: false, name: "bounded-cloud-coding-v1" },
      );
    } catch {
      await step.runMutation(
        internal.jobs.failCloud,
        {
          ...a,
          credits: 0,
          error:
            "The coding worker stopped without a confirmed result. Usage remains reserved for operator reconciliation; no automatic rerun is authorized.",
        },
        { name: "coding-worker-reconciliation-v1" },
      );
    }
    return null;
  });

export const completed = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.any() },
  handler: async (ctx, a) => {
    // Keep only one day of ID-only orchestration history for staging diagnostics.
    await ctx.scheduler.runAfter(86400000, internal.workflows.cleanup, {
      workflowId: a.workflowId,
    });
  },
});
export const cleanup = internalMutation({
  args: { workflowId: vWorkflowId },
  handler: async (ctx, a) => {
    await workflow.cleanup(ctx, a.workflowId);
  },
});
