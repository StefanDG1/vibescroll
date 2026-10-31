"use node";
import { createHmac, timingSafeEqual } from "node:crypto";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
export const webhook = internalAction({
  args: { body: v.string(), signature: v.string(), delivery: v.string() },
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
