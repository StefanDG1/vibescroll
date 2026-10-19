"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { uploadLocalFrame, localEvaluationBundle } from "./localLibraryActions";
export const frame = internalAction({
  args: {
    credentialHash: v.string(),
    id: v.id("localSourceImports"),
    frameId: v.string(),
    data: v.string(),
  },
  handler: async (ctx, a): Promise<any> => {
    const c = await ctx.runQuery(internal.assistantLocal.frame, {
      credentialHash: a.credentialHash,
      id: a.id,
      frameId: a.frameId,
    });
    return uploadLocalFrame(ctx, a, c, (args) =>
      ctx.runMutation(internal.assistantLocal.operation, {
        credentialHash: a.credentialHash,
        operation: "record_frame",
        args,
      }),
    );
  },
});
export const evaluation = internalAction({
  args: { credentialHash: v.string(), args: v.any() },
  handler: async (ctx, a): Promise<any> => {
    const c = await ctx.runMutation(internal.assistantLocal.operation, {
      credentialHash: a.credentialHash,
      operation: "evaluation_prepare",
      args: a.args,
    });
    return localEvaluationBundle(ctx, c, (args) =>
      ctx.runMutation(internal.assistantLocal.operation, {
        credentialHash: a.credentialHash,
        operation: "record_inspection",
        args,
      }),
    );
  },
});
