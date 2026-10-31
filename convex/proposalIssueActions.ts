"use node";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { authorizeRepository } from "./lib/githubAuthorization";
import {
  issueAccess,
  createIssue,
  findIssue,
} from "../packages/providers/issues";

export const preview = action({
  args: { proposalId: v.id("proposals") },
  returns: v.any(),
  handler: async (
    ctx,
    args,
  ): Promise<{
    repository: string;
    visibility: string;
    version: number;
    contextHash: string;
  }> => {
    const c = await ctx.runQuery(internal.proposalIssues.previewContext, args);
    await authorizeRepository(ctx, c.repo, c.repo.sha);
    const access = await issueAccess(c.repo);
    return {
      repository: c.repo.fullName,
      visibility: access.visibility,
      version: c.version,
      contextHash: c.contextHash,
    };
  },
});

export const publish = internalAction({
  args: { operationId: v.id("proposalOperations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let leaseId: string | undefined;
    try {
      const c = await ctx.runMutation(internal.proposalIssues.claim, args);
      if (!c) return null;
      leaseId = c.leaseId;
      await authorizeRepository(ctx, c.repo, c.handoff.baseSha);
      const access = await issueAccess(c.repo, !c.receipt?.dispatchedAt);
      const marker = `<!-- vibescroll-handoff:${c.handoff.id} -->`;
      let issue;
      if (c.receipt?.dispatchedAt) {
        issue = await findIssue(
          access.token,
          c.repo.fullName,
          marker,
          c.receipt?.issue?.number,
        );
      } else if (
        await ctx.runMutation(internal.proposalIssues.dispatch, {
          ...args,
          leaseId: c.leaseId,
          visibility: access.visibility as "public" | "private",
        })
      ) {
        const created = await createIssue(
          access.token,
          c.repo.fullName,
          c.handoff.title,
          c.handoff.body,
        );
        // createIssue already proves the exact returned title/body. Retain that
        // authoritative POST receipt even if a later status GET is unavailable.
        issue = {
          number: created.number,
          html_url: created.url,
          title: c.handoff.title,
          body: c.handoff.body,
        };
      }
      await ctx.runMutation(internal.proposalIssues.finish, {
        ...args,
        leaseId,
        ...(issue ? { issue } : {}),
        errorCode: "PUBLICATION_UNKNOWN",
      });
    } catch (error) {
      const code =
        (error instanceof Error &&
          /ISSUES_PERMISSION_REQUIRED|RECONNECT_REQUIRED|APPROVAL_STALE/.exec(
            error.message,
          )?.[0]) ||
        "GITHUB_UNAVAILABLE";
      await ctx.runMutation(internal.proposalIssues.finish, {
        ...args,
        ...(leaseId ? { leaseId } : {}),
        errorCode: code,
      });
    }
    return null;
  },
});
