"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { uploadLocalFrame, localEvaluationBundle } from "./localLibraryActions";
import { authorizeRepository } from "./lib/githubAuthorization";
import { retrieveContext } from "../packages/providers/github";
import { repositoryCheckContext } from "../packages/plans/repository-checks";
import { loadProjectSourceImage } from "../packages/providers/project-source-images";
export const taskSourceFrame = internalAction({
  args: { credentialHash: v.string(), args: v.any() },
  handler: async (ctx, a): Promise<any> => {
    const image = await ctx.runMutation(internal.assistantLocal.operation, {
      credentialHash: a.credentialHash,
      operation: "task_source_frame_prepare",
      args: a.args,
    });
    const pixels = await loadProjectSourceImage(image);
    const current = await ctx.runMutation(internal.assistantLocal.operation, {
      credentialHash: a.credentialHash,
      operation: "task_source_frame_prepare",
      args: a.args,
    });
    if (JSON.stringify(image) !== JSON.stringify(current))
      throw Error("PROJECT_SOURCE_IMAGE_CHANGED");
    return { id: image.id, ...pixels };
  },
});
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
export const taskContext = internalAction({
  args: { credentialHash: v.string(), args: v.any() },
  handler: async (ctx, a): Promise<any> => {
    const c = await ctx.runMutation(internal.assistantLocal.operation, {
      credentialHash: a.credentialHash,
      operation: "task_context_prepare",
      args: a.args,
    });
    if (c.workload === "source_reanalysis_text") return c;
    if (c.workload === "project_evaluation")
      return localEvaluationBundle(ctx, c, (record) =>
        ctx.runMutation(internal.assistantLocal.operation, {
          credentialHash: a.credentialHash,
          operation: "task_record_evaluation_inspection",
          args: { ...a.args, ...record },
        }),
      );
    await authorizeRepository(ctx, c.repo, c.repo.sha);
    const inspected = await retrieveContext(
      c.repo,
      JSON.stringify({ title: c.proposal.title, detail: c.proposal.detail }),
      c.proposal.detail.repositoryEvidence ?? [],
      "planning",
    );
    await authorizeRepository(ctx, c.repo, c.repo.sha);
    const paths = new Set(inspected.excerpts.map((e) => e.path));
    await ctx.runMutation(internal.assistantLocal.operation, {
      credentialHash: a.credentialHash,
      operation: "task_record_inspection",
      args: {
        ...a.args,
        inspected: inspected.excerpts,
        manifest: inspected.manifestEntries.filter((f) => paths.has(f.path)),
      },
    });
    return {
      proposal: c.proposal.detail,
      reviewerCorrection: c.proposal.reviewerCorrection,
      businessProfile: c.repo.profile,
      baseSha: c.repo.sha,
      excerpts: inspected.excerpts,
      inspectedTree: inspected.tree,
      checks: repositoryCheckContext(inspected.excerpts),
    };
  },
});
