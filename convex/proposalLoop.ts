import { v } from "convex/values";
import { createThread, listMessages, saveMessage } from "@convex-dev/agent";
import { query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { ensure } from "../packages/policy";
import {
  chatProposalBody,
  chatProposalDetail,
} from "../packages/contracts/chat-proposals";
import {
  proposalDiscussionInput,
  generatedProposalPlan,
  proposalOperationKey,
  proposalPlanTariff,
  proposalPlanSettlement,
} from "../packages/contracts/proposal-loop";
import {
  proposalPrincipal,
  currentProposal,
  proposalOperation,
  proposalHash,
  safeProposalText,
  proposalQuote,
  proposalServiceAllowed,
  patchProposalWork,
} from "./lib/proposalLoop";
import { reserve, settle } from "./product";
import { assistantGrant } from "./lib/assistantPrincipal";
import { limit } from "./lib";

const proposalArg = { proposalId: v.id("proposals") };
const operationArg = { operationId: v.id("proposalOperations") };
const idKey = { ...proposalArg, expectedVersion: v.number(), key: v.string() };

// Delete conversation references and private provider payloads in bounded batches.
// Financial/idempotency receipts remain until ordinary organization deletion;
// admission counters never reset when a user removes a post.
export const retire = internalMutation({
  args: { ...proposalArg, cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.proposalId)) return null;
    const page = await ctx.db
      .query("proposalOperations")
      .withIndex("by_proposal", (q) => q.eq("proposalId", args.proposalId))
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    for (const op of page.page) {
      if (op.kind === "message") await ctx.db.delete(op._id);
      else {
        const { rawOutput: _output, ...receipt } = op.receipt ?? {};
        await ctx.db.patch(op._id, {
          delegation: undefined,
          receipt,
          messageId: undefined,
        });
      }
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.proposalLoop.retire, {
        proposalId: args.proposalId,
        cursor: page.continueCursor,
      });
    return null;
  },
});

function projectOperation(op: Doc<"proposalOperations"> | null) {
  if (!op) return null;
  return {
    id: op._id,
    kind: op.kind,
    state:
      ["running", "queued"].includes(op.state) &&
      (op.deadline ?? Infinity) < Date.now()
        ? "unknown"
        : op.state,
    proposalVersion: op.proposalVersion,
    outputVersion: op.outputVersion ?? null,
    errorCode: op.errorCode ?? null,
    credits: op.receipt?.credits ?? null,
    updatedAt: op.updatedAt,
    issue: op.kind === "issue" ? (op.receipt?.issue ?? null) : null,
  };
}

// Delegation is captured from platform-verified claims, never accepted from a caller.
// Worker reads re-run ordinary membership/grant/source/project authorization.
export async function workerPrincipal(
  ctx: QueryCtx,
  op: Doc<"proposalOperations">,
) {
  ensure(
    op.delegation && op.delegation.subject,
    "FORBIDDEN",
    "Missing bounded proposal delegation.",
  );
  const actor = await ctx.db.get(op.actorId);
  ensure(
    actor?.status === "active" && actor.subject === op.delegation.subject,
    "FORBIDDEN",
    "The original planning account is unavailable.",
  );
  const delegated = {
    ...ctx,
    auth: { getUserIdentity: async () => op.delegation },
  };
  const p = await proposalPrincipal(delegated, op.proposalId, true);
  ensure(p.actor._id === op.actorId, "FORBIDDEN", "Planning actor changed.");
  return p;
}

export const read = query({
  args: { ...proposalArg, cursor: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const p = await proposalPrincipal(ctx, args.proposalId);
    const work = p.detail.work;
    const messages = work?.threadId
      ? await listMessages(ctx, components.agent, {
          threadId: work.threadId,
          paginationOpts: { cursor: args.cursor ?? null, numItems: 20 },
          excludeToolMessages: true,
        })
      : { page: [], isDone: true, continueCursor: "" };
    const page = messages.page.flatMap((m) => {
      try {
        const entry = JSON.parse(
          typeof m.message?.content === "string" ? m.message.content : "",
        );
        return entry.schemaVersion === "proposal-review-message-v1"
          ? [
              {
                id: m._id,
                author: entry.author,
                role: m.message?.role,
                body: entry.text,
                proposalVersion: entry.proposalVersion,
                createdAt: m._creationTime,
              },
            ]
          : [];
      } catch {
        return [];
      }
    });
    const latest = await ctx.db
      .query("proposalOperations")
      .withIndex("by_proposal", (q) => q.eq("proposalId", args.proposalId))
      .order("desc")
      .take(10);
    const pending = work?.pendingOperationId
      ? await ctx.db.get(work.pendingOperationId as Id<"proposalOperations">)
      : null;
    const body = chatProposalBody.parse(
      Object.fromEntries(
        Object.keys(chatProposalBody.shape).map((k) => [
          k,
          p.detail[k as keyof typeof p.detail],
        ]),
      ),
    );
    const issue = work?.issueOperationId
      ? await ctx.db.get(work.issueOperationId as Id<"proposalOperations">)
      : null;
    return {
      actorId: p.actor._id,
      proposalId: p.proposal._id,
      version: p.proposal.version,
      review: p.proposal.review,
      current: currentProposal(p),
      contextHash: p.context.contextHash,
      body,
      handoff: p.detail.handoff ?? null,
      generatedVersion: work?.generatedVersion ?? null,
      discussionRevision: work?.revision ?? 0,
      messages: {
        page,
        isDone: messages.isDone,
        continueCursor: messages.continueCursor,
      },
      operation: projectOperation(pending),
      issueOperation: projectOperation(issue),
      recentOperations: latest
        .filter((o) => o.kind !== "message")
        .map(projectOperation),
      analysisStarted: false,
      codingAuthorized: false,
    };
  },
});

export async function commentCore(
  ctx: MutationCtx,
  args: {
    proposalId: Id<"proposals">;
    expectedVersion: number;
    key: string;
    text: string;
  },
): Promise<any> {
  const input = proposalDiscussionInput.parse(args);
  ensure(
    safeProposalText(input.text),
    "POLICY_BLOCKED",
    "Keep credentials and protected media URLs out of discussion.",
  );
  const p = await proposalPrincipal(ctx, args.proposalId, true);
  const hash = await proposalHash({
    ...input,
    actor: p.actor._id,
    client: p.client.id,
  });
  const old = await proposalOperation(
    ctx,
    args.proposalId,
    "message",
    input.key,
  );
  if (old) {
    ensure(
      old.requestHash === hash && old.actorId === p.actor._id,
      "IDEMPOTENCY_CONFLICT",
      "This message key already identifies different content.",
    );
    return { messageId: old.messageId, replayed: true };
  }
  ensure(
    p.proposal.version === input.expectedVersion,
    "APPROVAL_STALE",
    "The plan changed. Review its current version before sending.",
  );
  await limit(ctx, `proposal-discussion:${p.actor._id}`, 60);
  const threadId =
    p.detail.work?.threadId ??
    (await createThread(ctx, components.agent, {
      title: p.proposal.title,
      userId: p.actor._id,
    }));
  const entry = {
    schemaVersion: "proposal-review-message-v1",
    text: input.text,
    author: p.assistant ? "Assistant" : p.actor.name,
    actorId: p.actor._id,
    proposalVersion: p.proposal.version,
  };
  const { messageId } = await saveMessage(ctx, components.agent, {
    threadId,
    userId: p.actor._id,
    order: "next",
    message: {
      role: p.assistant ? "assistant" : "user",
      content: JSON.stringify(entry),
    },
  });
  const now = Date.now();
  await ctx.db.insert("proposalOperations", {
    organizationId: p.proposal.organizationId,
    proposalId: p.proposal._id,
    actorId: p.actor._id,
    kind: "message",
    key: input.key,
    requestHash: hash,
    proposalVersion: p.proposal.version,
    state: "complete",
    messageId,
    createdAt: now,
    updatedAt: now,
  });
  await patchProposalWork(ctx, p, {
    ...p.detail.work,
    threadId,
    revision: (p.detail.work?.revision ?? 0) + 1,
  });
  return { messageId, replayed: false };
}

export const comment = mutation({
  args: { ...idKey, text: v.string() },
  returns: v.any(),
  handler: commentCore,
});

export const quote = query({
  args: proposalArg,
  returns: v.any(),
  handler: async (ctx, args) =>
    proposalQuote(ctx, await proposalPrincipal(ctx, args.proposalId, true)),
});

export async function startCore(
  ctx: MutationCtx,
  args: {
    proposalId: Id<"proposals">;
    expectedVersion: number;
    key: string;
    quoteId: string;
    maximumCredits: number;
  },
): Promise<any> {
  proposalOperationKey.parse(args.key);
  const p = await proposalPrincipal(ctx, args.proposalId, true);
  const hash = await proposalHash({
    ...args,
    actor: p.actor._id,
    client: p.client.id,
  });
  const old = await proposalOperation(
    ctx,
    args.proposalId,
    "generation",
    args.key,
  );
  if (old) {
    ensure(
      old.requestHash === hash && old.actorId === p.actor._id,
      "IDEMPOTENCY_CONFLICT",
      "This plan key already identifies a different request.",
    );
    return { operation: projectOperation(old), replayed: true };
  }
  if (p.detail.work?.issueOperationId) {
    const issue = await ctx.db.get(
      p.detail.work.issueOperationId as Id<"proposalOperations">,
    );
    ensure(
      !issue || ["complete", "failed", "stale"].includes(issue.state),
      "SOURCE_BUSY",
      "Reconcile the frozen issue publication before generating another plan.",
    );
  }
  const quote = await proposalQuote(ctx, p);
  if (p.assistant) {
    await assistantGrant(ctx, p.proposal.organizationId, "analysis:request");
    await assistantGrant(ctx, p.proposal.organizationId, "analysis:execute");
  }
  ensure(
    args.expectedVersion === p.proposal.version &&
      args.quoteId === quote.quoteId &&
      args.maximumCredits === quote.maximumCredits,
    "QUOTE_CHANGED",
    "Review the current plan quote before starting.",
  );
  const pending =
    p.detail.work?.pendingOperationId &&
    (await ctx.db.get(
      p.detail.work.pendingOperationId as Id<"proposalOperations">,
    ));
  ensure(
    !pending || ["complete", "failed", "stale"].includes(pending.state),
    "SOURCE_BUSY",
    "A plan is already pending or needs usage reconciliation.",
  );
  const config = proposalServiceAllowed(p.actor.subject);
  ensure(
    typeof config.id === "string" && config.id.length >= 8,
    "SETUP_REQUIRED",
    "Plan service policy is unavailable.",
  );
  const counter = await ctx.db
    .query("proposalServiceCounters")
    .withIndex("by_policy", (q) => q.eq("policyId", config.id))
    .unique();
  ensure(
    (counter?.jobs ?? 0) < config.maximumTotalJobs,
    "BUDGET_EXCEEDED",
    "The current plan service allowance is used.",
  );
  const identity = await ctx.auth.getUserIdentity();
  ensure(identity, "FORBIDDEN", "Authenticated planning delegation required.");
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
  const reservationKey = `proposal-plan:${p.proposal._id}:${args.key}`;
  await reserve(
    ctx,
    quote.fundingOrganizationId,
    reservationKey,
    quote.maximumCredits,
  );
  if (counter) await ctx.db.patch(counter._id, { jobs: counter.jobs + 1 });
  else
    await ctx.db.insert("proposalServiceCounters", {
      policyId: config.id,
      jobs: 1,
    });
  const now = Date.now();
  const operationId = await ctx.db.insert("proposalOperations", {
    organizationId: p.proposal.organizationId,
    proposalId: p.proposal._id,
    actorId: p.actor._id,
    kind: "generation",
    policyId: config.id,
    key: args.key,
    requestHash: hash,
    proposalVersion: p.proposal.version,
    expectedReview: p.proposal.review,
    contextHash: quote.contextHash,
    discussionRevision: quote.discussionRevision,
    state: "queued",
    delegation,
    fundingOrganizationId: quote.fundingOrganizationId,
    reservationKey,
    deadline: now + 180000,
    createdAt: now,
    updatedAt: now,
  });
  await patchProposalWork(ctx, p, {
    ...p.detail.work,
    revision: p.detail.work?.revision ?? 0,
    pendingOperationId: operationId,
  });
  await ctx.scheduler.runAfter(0, internal.proposalLoopActions.generate, {
    operationId,
  });
  return {
    operation: projectOperation((await ctx.db.get(operationId))!),
    replayed: false,
  };
}

export const start = mutation({
  args: { ...idKey, quoteId: v.string(), maximumCredits: v.number() },
  returns: v.any(),
  handler: startCore,
});

export const claim = internalMutation({
  args: operationArg,
  returns: v.any(),
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (!op || op.kind !== "generation" || op.state !== "queued") return null;
    ensure(
      (op.deadline ?? 0) > Date.now(),
      "APPROVAL_STALE",
      "Queued planning authority expired before inference.",
    );
    const p = await workerPrincipal(ctx, op);
    ensure(
      proposalServiceAllowed(p.actor.subject).id === op.policyId,
      "APPROVAL_STALE",
      "The approved planning policy changed.",
    );
    ensure(
      currentProposal(p) &&
        p.proposal.version === op.proposalVersion &&
        p.proposal.review === op.expectedReview &&
        p.context.contextHash === op.contextHash &&
        (p.detail.work?.revision ?? 0) === op.discussionRevision,
      "APPROVAL_STALE",
      "The proposal context changed before inference.",
    );
    const messages = p.detail.work?.threadId
      ? await listMessages(ctx, components.agent, {
          threadId: p.detail.work.threadId,
          paginationOpts: { cursor: null, numItems: 12 },
          excludeToolMessages: true,
        })
      : { page: [] };
    await ctx.db.patch(op._id, { state: "running", updatedAt: Date.now() });
    return {
      operationId: op._id,
      context: p.context,
      proposal: p.detail,
      discussion: messages.page
        .reverse()
        .map((m) =>
          typeof m.message?.content === "string" ? m.message.content : "",
        ),
      deadline: op.deadline,
    };
  },
});

export const recordReceipt = internalMutation({
  args: { ...operationArg, receipt: v.any() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (op?.state === "running") {
      const receipt = { ...args.receipt };
      if (!(await ctx.db.get(op.proposalId))) delete receipt.rawOutput;
      await ctx.db.patch(op._id, {
        receipt: { ...op.receipt, ...receipt },
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const finish = internalMutation({
  args: {
    ...operationArg,
    output: v.optional(v.any()),
    errorCode: v.optional(v.string()),
    requestStarted: v.boolean(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (!op || ["complete", "failed", "stale"].includes(op.state)) return null;
    let credits: number | null = null;
    if (op.receipt?.inputTokens !== undefined) {
      try {
        credits = proposalPlanSettlement(
          op.receipt.inputTokens,
          op.receipt.outputTokens,
        ).credits;
      } catch {
        credits = null;
      }
    } else if (!args.requestStarted) credits = 0;
    const proposal = await ctx.db.get(op.proposalId);
    let p: Awaited<ReturnType<typeof proposalPrincipal>> | null = null;
    try {
      p = proposal ? await workerPrincipal(ctx, op) : null;
    } catch {
      p = null;
    }
    const current =
      p &&
      currentProposal(p) &&
      p.proposal.version === op.proposalVersion &&
      p.proposal.review === op.expectedReview &&
      p.context.contextHash === op.contextHash &&
      (p.detail.work?.revision ?? 0) === op.discussionRevision;
    let state =
      credits === null
        ? "unknown"
        : args.output && current
          ? "complete"
          : args.output
            ? "stale"
            : "failed";
    let version: number | undefined;
    if (args.output && current && p && credits !== null) {
      const result = generatedProposalPlan.parse(args.output);
      ensure(
        result.insightIds.length === p.detail.insightIds.length &&
          result.insightIds.every(
            (id, index) => id === p.detail.insightIds[index],
          ),
        "INVALID_EVIDENCE",
        "The generated plan changed its source binding.",
      );
      ensure(
        safeProposalText(JSON.stringify(result)),
        "POLICY_BLOCKED",
        "Plan output contains protected data.",
      );
      const threadId =
        p.detail.work?.threadId ??
        (await createThread(ctx, components.agent, {
          title: p.proposal.title,
          userId: op.actorId,
        }));
      version = p.proposal.version + 1;
      await saveMessage(ctx, components.agent, {
        threadId,
        userId: op.actorId,
        order: "next",
        message: {
          role: "assistant",
          content: JSON.stringify({
            schemaVersion: "proposal-review-message-v1",
            text: result.message,
            author: "VibeScroll",
            proposalVersion: version,
            plan: { ...result.body, steps: result.steps },
            model: proposalPlanTariff.model,
          }),
        },
      });
      const detail = chatProposalDetail.parse({
        ...p.detail,
        ...result.body,
        steps: result.steps,
        work: {
          threadId,
          revision: (p.detail.work?.revision ?? 0) + 1,
          generatedVersion: version,
        },
      });
      ensure(
        new TextEncoder().encode(JSON.stringify(detail)).length <= 100000,
        "LIMIT_REACHED",
        "Generated plan exceeds the retained proposal bound.",
      );
      await ctx.db.patch(p.proposal._id, {
        title: detail.title,
        detail,
        version,
        disposition: detail.disposition,
        review: "unreviewed",
        updatedAt: Date.now(),
      });
    } else if (
      p &&
      credits !== null &&
      p.detail.work?.pendingOperationId === op._id
    ) {
      const { pendingOperationId: _pending, ...work } = p.detail.work;
      await patchProposalWork(ctx, p, work);
    }
    if (credits !== null && op.fundingOrganizationId && op.reservationKey)
      await settle(ctx, op.fundingOrganizationId, op.reservationKey, credits);
    await ctx.db.patch(op._id, {
      state: state as "complete" | "unknown" | "stale" | "failed",
      outputVersion: version,
      errorCode:
        args.errorCode ?? (state === "stale" ? "APPROVAL_STALE" : undefined),
      receipt: { ...op.receipt, credits },
      updatedAt: Date.now(),
    });
    return projectOperation((await ctx.db.get(op._id))!);
  },
});

export const reply = mutation({
  args: {
    ...idKey,
    text: v.string(),
    quoteId: v.string(),
    maximumCredits: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const p = await proposalPrincipal(ctx, args.proposalId, true);
    const hash = await proposalHash({
      ...args,
      actor: p.actor._id,
      client: p.client.id,
    });
    const old = await proposalOperation(
      ctx,
      args.proposalId,
      "generation",
      args.key,
    );
    if (old) {
      ensure(
        old.actorId === p.actor._id && old.receipt?.replyHash === hash,
        "IDEMPOTENCY_CONFLICT",
        "This reply key identifies different content.",
      );
      return { operation: projectOperation(old), replayed: true };
    }
    const before = await proposalQuote(ctx, p);
    ensure(
      before.quoteId === args.quoteId &&
        before.maximumCredits === args.maximumCredits &&
        before.version === args.expectedVersion,
      "QUOTE_CHANGED",
      "Review the current reply quote.",
    );
    await commentCore(ctx, {
      proposalId: args.proposalId,
      expectedVersion: args.expectedVersion,
      key: args.key,
      text: args.text,
    });
    const after = await proposalQuote(
      ctx,
      await proposalPrincipal(ctx, args.proposalId, true),
    );
    const started = await startCore(ctx, {
      proposalId: args.proposalId,
      expectedVersion: args.expectedVersion,
      key: args.key,
      quoteId: after.quoteId,
      maximumCredits: after.maximumCredits,
    });
    const operation = (await ctx.db.get(
      started.operation.id as Id<"proposalOperations">,
    ))!;
    await ctx.db.patch(operation._id, {
      receipt: { ...operation.receipt, replyHash: hash },
    });
    return started;
  },
});
