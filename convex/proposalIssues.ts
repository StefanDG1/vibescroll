import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ensure } from "../packages/policy";
import { proposalOperationKey } from "../packages/contracts/proposal-loop";
import { chatProposalDetail } from "../packages/contracts/chat-proposals";
import {
  proposalPrincipal,
  proposalOperation,
  proposalHash,
  currentProposal,
} from "./lib/proposalLoop";
import { workerPrincipal } from "./proposalLoop";
import { prepareIssueCore } from "./assistantProposalWork";

const target = { proposalId: v.id("proposals") };
const operation = { operationId: v.id("proposalOperations") };
const lease = { ...operation, leaseId: v.string() };
const visibility = v.union(v.literal("public"), v.literal("private"));
function publishingAllowed() {
  ensure(
    process.env.DISABLE_ISSUES !== "true" &&
      process.env.RESTORE_LOCK !== "true",
    "POLICY_BLOCKED",
    "Issue publication is paused.",
  );
}
export const previewContext = internalQuery({
  args: target,
  returns: v.any(),
  handler: async (ctx, args) => {
    publishingAllowed();
    const p = await proposalPrincipal(ctx, args.proposalId, true);
    ensure(
      currentProposal(p),
      "APPROVAL_STALE",
      "Read the current plan and project before publication.",
    );
    return {
      repo: (await ctx.db.get(p.proposal.repositoryId))!,
      version: p.proposal.version,
      contextHash: p.context.contextHash,
    };
  },
});

export const approve = mutation({
  args: {
    ...target,
    expectedVersion: v.number(),
    contextHash: v.string(),
    key: v.string(),
    visibility,
    acknowledged: v.boolean(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    publishingAllowed();
    proposalOperationKey.parse(args.key);
    const p = await proposalPrincipal(ctx, args.proposalId, true);
    const requestHash = await proposalHash({
      ...args,
      actor: p.actor._id,
      client: p.client.id,
    });
    const old = await proposalOperation(
      ctx,
      args.proposalId,
      "issue",
      args.key,
    );
    if (old) {
      ensure(
        old.requestHash === requestHash && old.actorId === p.actor._id,
        "IDEMPOTENCY_CONFLICT",
        "This publication key identifies another approval.",
      );
      return { operationId: old._id, state: old.state, replayed: true };
    }
    ensure(
      args.acknowledged &&
        currentProposal(p) &&
        p.proposal.version === args.expectedVersion &&
        p.context.contextHash === args.contextHash,
      "APPROVAL_STALE",
      "Approve the exact current plan and target repository.",
    );
    ensure(
      p.detail.disposition === "relevant" &&
        !!p.detail.proposedChange &&
        p.detail.acceptanceCriteria.length > 0,
      "APPROVAL_STALE",
      "This plan needs a concrete change and acceptance criteria before approval.",
    );
    ensure(
      !p.detail.handoff,
      "IDEMPOTENCY_CONFLICT",
      "An issue package is already frozen. Open or reconcile that package instead.",
    );
    const pending =
      p.detail.work?.pendingOperationId &&
      (await ctx.db.get(
        p.detail.work.pendingOperationId as Id<"proposalOperations">,
      ));
    ensure(
      !pending || ["complete", "failed", "stale"].includes(pending.state),
      "SOURCE_BUSY",
      "Finish or reconcile the pending plan before approval.",
    );
    await ctx.db.patch(p.proposal._id, {
      review: "accepted",
      updatedAt: Date.now(),
    });
    const frozen = await prepareIssueCore(ctx, {
      proposalId: args.proposalId,
      expectedVersion: args.expectedVersion,
      expectedReview: "accepted",
      contextHash: args.contextHash,
      key: args.key,
    });
    const identity = (await ctx.auth.getUserIdentity())!;
    const delegation = Object.fromEntries(
      [
        "subject",
        "issuer",
        "tokenIdentifier",
        "client_id",
        "scope",
        "sid",
      ].flatMap((k) =>
        typeof identity[k] === "string" ? [[k, identity[k]]] : [],
      ),
    );
    const now = Date.now();
    const operationId = await ctx.db.insert("proposalOperations", {
      organizationId: p.proposal.organizationId,
      proposalId: args.proposalId,
      actorId: p.actor._id,
      kind: "issue",
      key: args.key,
      requestHash,
      delegation,
      proposalVersion: args.expectedVersion,
      contextHash: args.contextHash,
      expectedReview: "accepted",
      state: "queued",
      deadline: now + 180000,
      receipt: {
        visibility: args.visibility,
        handoffId: frozen.handoff.id,
        bodyHash: frozen.handoff.bodyHash,
      },
      createdAt: now,
      updatedAt: now,
    });
    const fresh = (await ctx.db.get(args.proposalId))!;
    const detail = chatProposalDetail.parse(fresh.detail);
    await ctx.db.patch(fresh._id, {
      detail: {
        ...detail,
        work: {
          ...detail.work,
          revision: detail.work?.revision ?? 0,
          issueOperationId: operationId,
        },
      },
    });
    await ctx.scheduler.runAfter(0, internal.proposalIssueActions.publish, {
      operationId,
    });
    return { operationId, state: "queued", replayed: false };
  },
});

// Retrying an ambiguous POST only schedules authoritative lookup. It never removes
// the durable dispatchedAt barrier, even if no matching issue is found.
export const retry = mutation({
  args: { ...target, ...operation },
  returns: v.any(),
  handler: async (ctx, args) => {
    publishingAllowed();
    const op = await ctx.db.get(args.operationId);
    ensure(
      op?.kind === "issue" && op.proposalId === args.proposalId,
      "FORBIDDEN",
      "Publication unavailable.",
    );
    const p = await proposalPrincipal(ctx, op.proposalId, true);
    ensure(
      p.actor._id === op.actorId,
      "FORBIDDEN",
      "Only the approving account may retry publication.",
    );
    if (
      op.state === "complete" ||
      op.state === "queued" ||
      (op.state === "running" && (op.deadline ?? 0) > Date.now())
    )
      return { operationId: op._id, state: op.state };
    ensure(
      p.proposal.version === op.proposalVersion &&
        p.proposal.review === "accepted" &&
        currentProposal(p) &&
        p.context.contextHash === op.contextHash,
      "APPROVAL_STALE",
      "The approved plan or project changed.",
    );
    await ctx.db.patch(op._id, {
      state: "queued",
      leaseId: undefined,
      deadline: Date.now() + 180000,
      errorCode: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.proposalIssueActions.publish, {
      operationId: args.operationId,
    });
    return { operationId: op._id, state: "queued" };
  },
});

export const claim = internalMutation({
  args: operation,
  returns: v.any(),
  handler: async (ctx, args) => {
    publishingAllowed();
    const op = await ctx.db.get(args.operationId);
    if (!op || op.kind !== "issue" || op.state !== "queued") return null;
    const p = await workerPrincipal(ctx, op);
    ensure(
      (op.deadline ?? 0) > Date.now() &&
        currentProposal(p) &&
        p.proposal.version === op.proposalVersion &&
        p.proposal.review === "accepted" &&
        p.context.contextHash === op.contextHash &&
        p.detail.handoff?.id === op.receipt?.handoffId &&
        p.detail.handoff?.bodyHash === op.receipt?.bodyHash,
      "APPROVAL_STALE",
      "Publication authority changed.",
    );
    const leaseId = crypto.randomUUID();
    await ctx.db.patch(op._id, {
      state: "running",
      leaseId,
      updatedAt: Date.now(),
    });
    return {
      leaseId,
      repo: (await ctx.db.get(p.proposal.repositoryId))!,
      handoff: p.detail.handoff!,
      receipt: op.receipt,
    };
  },
});

export const dispatch = internalMutation({
  args: { ...lease, visibility },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    publishingAllowed();
    const op = await ctx.db.get(args.operationId);
    ensure(
      op?.kind === "issue" &&
        op.state === "running" &&
        op.leaseId === args.leaseId &&
        (op.deadline ?? 0) > Date.now(),
      "APPROVAL_STALE",
      "Publication lease expired.",
    );
    if (op.receipt?.dispatchedAt) return false;
    const p = await workerPrincipal(ctx, op);
    ensure(
      currentProposal(p) &&
        p.proposal.version === op.proposalVersion &&
        p.proposal.review === "accepted" &&
        p.context.contextHash === op.contextHash &&
        p.detail.handoff?.bodyHash === op.receipt?.bodyHash &&
        args.visibility === op.receipt?.visibility,
      "APPROVAL_STALE",
      "Plan, access or repository visibility changed.",
    );
    await ctx.db.patch(op._id, {
      receipt: { ...op.receipt, dispatchedAt: Date.now() },
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const finish = internalMutation({
  args: {
    ...operation,
    leaseId: v.optional(v.string()),
    issue: v.optional(v.any()),
    errorCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (
      !op ||
      op.kind !== "issue" ||
      op.state === "complete" ||
      (args.leaseId && op.leaseId !== args.leaseId) ||
      (!args.leaseId && op.state !== "queued")
    )
      return null;
    const proposal = await ctx.db.get(op.proposalId);
    const detail = proposal && chatProposalDetail.parse(proposal.detail);
    const handoff = detail?.handoff;
    const i = args.issue;
    const confirmed = !!(
      i &&
      handoff &&
      handoff.id === op.receipt?.handoffId &&
      i.title === handoff.title &&
      i.body === handoff.body &&
      !i.pull_request &&
      Number.isSafeInteger(i.number) &&
      i.number > 0 &&
      i.html_url ===
        `https://github.com/${handoff.repository}/issues/${i.number}`
    );
    if (confirmed && detail && proposal && handoff) {
      await ctx.db.patch(proposal._id, {
        detail: {
          ...detail,
          handoff: {
            ...handoff,
            publication: {
              provenance: "github_api_receipt",
              number: i.number,
              url: i.html_url,
              confirmedAt: Date.now(),
              bodyMatchesFrozen: true,
            },
          },
        },
        updatedAt: Date.now(),
      });
    }
    const state = confirmed
      ? "complete"
      : op.receipt?.dispatchedAt
        ? "unknown"
        : "failed";
    await ctx.db.patch(op._id, {
      state,
      errorCode: confirmed
        ? undefined
        : (args.errorCode ?? "PUBLICATION_UNKNOWN"),
      receipt: {
        ...op.receipt,
        ...(confirmed ? { issue: { number: i.number, url: i.html_url } } : {}),
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});
