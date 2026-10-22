"use node";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  acquireGithubSource,
  inspectGithubSource,
} from "../packages/providers/github-source";
import { acquireRedditSource } from "../packages/providers/reddit-source";
import { createPublicSourceTransport } from "../packages/providers/source-transport";
import { acquisitionFailure } from "../packages/sources/limits";
import type { AdapterContext } from "../packages/sources/types";

async function run(
  ctx: ActionCtx,
  a: { id: Id<"sourceAcquisitions">; version: number },
  phase: "inspect" | "acquire",
): Promise<{ accepted: boolean }> {
  const job = await ctx.runMutation(internal.sourceAcquisition.claim, {
    ...a,
    phase,
  });
  const context: AdapterContext = {
    transport: createPublicSourceTransport({
      userAgent: "VibeScroll/1.0 selected-source reader",
      redditOAuth: async () => process.env.REDDIT_SOURCE_OAUTH_TOKEN ?? "",
    }),
    claimProviderRequest: (provider) =>
      ctx.runMutation(internal.sourceAcquisition.providerClaim, {
        id: a.id,
        lease: job.lease,
        provider,
      }),
    observeProviderResponse: async (provider, headers) => {
      await ctx.runMutation(internal.sourceAcquisition.providerObserved, {
        provider,
        headers: Object.fromEntries(
          Object.entries(headers).filter(
            (pair): pair is [string, string] => typeof pair[1] === "string",
          ),
        ),
      });
    },
    recordResponseBytes: async (_provider, bytes) => {
      await ctx.runMutation(internal.sourceAcquisition.bytesObserved, {
        id: a.id,
        lease: job.lease,
        bytes,
      });
    },
  };
  let result: unknown;
  try {
    if (phase === "inspect")
      result = {
        status: "selected",
        selection: await inspectGithubSource({ url: job.url }, context),
      };
    else if (job.provider === "github")
      result = await acquireGithubSource(
        {
          url: job.url,
          commit: job.pinnedCommit!,
          repositoryId: job.repositoryId!,
          selectedPaths: job.selectedPaths,
          rightsBasis: job.rightsBasis,
        },
        context,
      );
    else {
      let eligibility: unknown;
      try {
        eligibility = JSON.parse(
          process.env.REDDIT_SOURCE_ELIGIBILITY_JSON ?? "null",
        );
      } catch {
        eligibility = null;
      }
      result = await acquireRedditSource(
        { url: job.url, eligibility },
        context,
      );
    }
  } catch (error) {
    result = acquisitionFailure(error);
  }
  return ctx.runMutation(internal.sourceAcquisition.finish, {
    id: a.id,
    lease: job.lease,
    phase,
    result,
  });
}
export const inspect = action({
  args: { id: v.id("sourceAcquisitions"), version: v.number() },
  handler: (ctx, a) => run(ctx, a, "inspect"),
});
export const acquire = action({
  args: { id: v.id("sourceAcquisitions"), version: v.number() },
  handler: (ctx, a) => run(ctx, a, "acquire"),
});
