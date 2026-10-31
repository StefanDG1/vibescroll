"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateProposalPlan } from "../packages/providers/proposal-plan";
import { containsSecret } from "../packages/policy";
import { chatProposalBody } from "../packages/contracts/chat-proposals";

export const generate = internalAction({
  args: { operationId: v.id("proposalOperations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let requestStarted = false;
    try {
      const c = await ctx.runMutation(internal.proposalLoop.claim, args);
      if (!c) return null;
      const apiKey = process.env.VERCEL_AI_GATEWAY_API_KEY ?? "";
      if (apiKey.length <= 10) throw Error("SETUP_REQUIRED");
      const proposal = chatProposalBody.parse(
        Object.fromEntries(
          Object.keys(chatProposalBody.shape).map((k) => [
            k,
            c.proposal[k as keyof typeof c.proposal],
          ]),
        ),
      );
      const output = await generateProposalPlan({
        packet: {
          source: c.context.source,
          project: c.context.project,
          proposal,
          discussion: c.discussion,
        },
        apiKey,
        deadline: c.deadline ?? 0,
        onDispatch: () => {
          requestStarted = true;
        },
        onReceipt: async (receipt) => {
          if (
            typeof receipt.rawOutput === "string" &&
            containsSecret(receipt.rawOutput)
          )
            receipt.rawOutput = "[redacted; protected response]";
          await ctx.runMutation(internal.proposalLoop.recordReceipt, {
            ...args,
            receipt,
          });
        },
      });
      await ctx.runMutation(internal.proposalLoop.finish, {
        ...args,
        output,
        requestStarted,
      });
    } catch (error) {
      const errorCode =
        error instanceof Error &&
        /APPROVAL_STALE|FORBIDDEN|SETUP_REQUIRED/.test(error.message)
          ? "APPROVAL_STALE"
          : requestStarted
            ? "PLAN_PROVIDER_OR_VALIDATION_FAILED"
            : "PLAN_START_FAILED";
      await ctx.runMutation(internal.proposalLoop.finish, {
        ...args,
        errorCode,
        requestStarted,
      });
    }
    return null;
  },
});
