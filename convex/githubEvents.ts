"use node";
import { createHmac, timingSafeEqual } from "node:crypto";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
export const webhook = internalAction({
  args: { body: v.string(), signature: v.string(), delivery: v.string() },
  returns: v.object({ status: v.number(), category: v.optional(v.string()) }),
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true")
      return { status: 503, category: "RECOVERY_LOCKED" };
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (
      !secret ||
      a.body.length > 1000000 ||
      !/^[a-zA-Z0-9-]{8,100}$/.test(a.delivery)
    )
      return { status: 400, category: "DELIVERY_OR_SETUP_INVALID" };
    const expected = `sha256=${createHmac("sha256", secret).update(a.body).digest("hex")}`;
    if (
      expected.length !== a.signature.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(a.signature))
    )
      return { status: 400, category: "SIGNATURE_INVALID" };
    let payload;
    try {
      payload = JSON.parse(a.body);
    } catch {
      return { status: 400 };
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return { status: 400 };
    const installationId = payload.installation?.id,
      repositoryId = payload.repository?.id,
      prNumber = payload.pull_request?.number;
    if (prNumber !== undefined) {
      if (
        ![installationId, repositoryId, prNumber].every(
          (n) => Number.isSafeInteger(n) && n > 0,
        )
      )
        return { status: 400 };
      await ctx.runMutation(internal.jobs.enqueuePR, {
        delivery: a.delivery,
        installationId,
        repositoryId,
        prNumber,
      });
      const pr = payload.pull_request;
      if (
        ["opened", "edited", "reopened", "synchronize", "closed"].includes(
          payload.action,
        ) &&
        Number.isSafeInteger(pr.id) &&
        pr.id > 0 &&
        typeof payload.repository.full_name === "string" &&
        pr.base?.repo?.id === repositoryId &&
        pr.base?.repo?.full_name === payload.repository.full_name &&
        typeof pr.html_url === "string" &&
        typeof pr.body === "string" &&
        typeof pr.head?.sha === "string" &&
        typeof pr.merged === "boolean" &&
        (pr.merge_commit_sha === null ||
          typeof pr.merge_commit_sha === "string") &&
        typeof pr.updated_at === "string" &&
        Number.isSafeInteger(Date.parse(pr.updated_at)) &&
        ["open", "closed"].includes(pr.state) &&
        (!pr.merged || pr.state === "closed")
      )
        await ctx.runMutation(
          internal.assistantProposalWork.observePullRequest,
          {
            installationId,
            providerId: repositoryId,
            repository: payload.repository.full_name,
            pullRequestId: pr.id,
            number: prNumber,
            url: pr.html_url,
            body: pr.body,
            headSha: pr.head.sha,
            mergeCommitSha: pr.merged ? pr.merge_commit_sha : null,
            state: pr.merged ? "merged" : pr.state,
            updatedAt: Date.parse(pr.updated_at),
            delivery: a.delivery,
          },
        );
    }
    if (payload.check_run !== undefined && payload.action === "completed") {
      const check = payload.check_run;
      if (
        ![installationId, repositoryId, check?.id, check?.app?.id].every(
          (n) => Number.isSafeInteger(n) && n > 0,
        ) ||
        typeof payload.repository.full_name !== "string" ||
        check.status !== "completed" ||
        typeof check.conclusion !== "string" ||
        typeof check.head_sha !== "string" ||
        typeof check.completed_at !== "string" ||
        !Number.isSafeInteger(Date.parse(check.completed_at)) ||
        !Array.isArray(check.pull_requests) ||
        check.pull_requests.length > 20
      )
        return { status: 400, category: "CHECK_OBSERVATION_INVALID" };
      if (!check.pull_requests.length)
        return { status: 200, category: "CHECK_PR_CONTEXT_UNAVAILABLE" };
      // A check is evidence about one SHA and app, not proof all required CI passed.
      for (const pr of check.pull_requests) {
        if (
          !Number.isSafeInteger(pr.id) ||
          pr.id <= 0 ||
          !Number.isSafeInteger(pr.number) ||
          pr.number <= 0 ||
          pr.base?.repo?.id !== repositoryId ||
          pr.head?.sha !== check.head_sha
        )
          continue;
        await ctx.runMutation(internal.assistantProposalWork.observeCheck, {
          installationId,
          providerId: repositoryId,
          repository: payload.repository.full_name,
          number: pr.number,
          pullRequestId: pr.id,
          checkRunId: check.id,
          appId: check.app.id,
          headSha: check.head_sha,
          conclusion: check.conclusion,
          completedAt: Date.parse(check.completed_at),
          delivery: a.delivery,
        });
      }
    }
    if (payload.issue?.number !== undefined && !payload.issue.pull_request) {
      const number = payload.issue.number;
      if (
        ![installationId, repositoryId, number].every(
          (n) => Number.isSafeInteger(n) && n > 0,
        )
      )
        return { status: 400 };
      if (
        ["opened", "edited", "closed", "reopened"].includes(payload.action) &&
        Number.isSafeInteger(payload.issue.id) &&
        payload.issue.id > 0 &&
        typeof payload.repository.full_name === "string" &&
        typeof payload.issue.html_url === "string" &&
        typeof payload.issue.title === "string" &&
        typeof payload.issue.body === "string" &&
        typeof payload.issue.updated_at === "string" &&
        Number.isSafeInteger(Date.parse(payload.issue.updated_at)) &&
        ["open", "closed"].includes(payload.issue.state)
      )
        await ctx.runMutation(internal.assistantProposalWork.observeIssue, {
          installationId,
          providerId: repositoryId,
          repository: payload.repository.full_name,
          issueId: payload.issue.id,
          number,
          url: payload.issue.html_url,
          title: payload.issue.title,
          body: payload.issue.body,
          state: payload.issue.state,
          updatedAt: Date.parse(payload.issue.updated_at),
        });
      await ctx.runMutation(internal.issues.enqueueWebhook, {
        installationId,
        providerId: repositoryId,
        number,
        delivery: a.delivery,
      });
    }
    return { status: 200 };
  },
});
