import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { user } from "./lib";
import { projectApplicationContextCore } from "./assistant";
import {
  proposalSaveArgs,
  saveProjectProposalCore,
} from "./assistantProposals";

// Website sessions use normal membership. OAuth callers keep the MCP grant route.
export const context = query({
  args: {
    sourceId: v.id("sources"),
    projectId: v.id("repositories"),
    analysisVersionId: v.id("analysisVersions"),
    insightIds: v.array(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await user(ctx);
    return projectApplicationContextCore(ctx, args);
  },
});
export const save = mutation({
  args: proposalSaveArgs,
  returns: v.any(),
  handler: async (ctx, args) => {
    await user(ctx);
    return saveProjectProposalCore(ctx, args);
  },
});
