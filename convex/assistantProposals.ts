import { v } from "convex/values";
import { z } from "zod";
import {
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import type { Doc, Id } from "./_generated/dataModel";
import { assistantGrant } from "./lib/assistantPrincipal";
import { projectApplicationContextCore, selectedProfile } from "./assistant";
import { access, audit, limit } from "./lib";
import { isAssistantIdentity } from "../packages/policy/assistant";
import { ensure, containsSecret, PolicyError } from "../packages/policy";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { socialHash } from "../packages/social/contracts";
import {
  chatProposalBody,
  chatProposalDetail,
  isChatProposalDetail,
  saveProjectProposalInput,
} from "../packages/contracts/chat-proposals";

const profile = { profileId: v.optional(v.id("organizations")) };

export async function readAuthorized(
  ctx: QueryCtx,
  proposal: Doc<"proposals">,
) {
  ensure(
    isChatProposalDetail(proposal.detail),
    "INVALID_INPUT",
    "This tool reads chat-created proposals. Open the review page for an earlier proposal.",
  );
  const detail = chatProposalDetail.parse(proposal.detail);
  const context = await projectApplicationContextCore(ctx, {
    profileId: proposal.organizationId,
    sourceId: proposal.sourceId,
    projectId: proposal.repositoryId,
    analysisVersionId: detail._chat.binding
      .analysisVersionId as Id<"analysisVersions">,
    insightIds: detail.insightIds,
  });
  ensure(
    context.source.evidenceHash === detail._chat.binding.evidenceHash &&
      context.source.outputHash === detail._chat.binding.outputHash &&
      context.source.revisionHash === detail._chat.binding.revisionHash,
    "INVALID_EVIDENCE",
    "The proposal's retained evidence is unavailable.",
  );
  return { detail, context };
}

function snapshot(
  proposal: Doc<"proposals">,
  read: Awaited<ReturnType<typeof readAuthorized>>,
) {
  const { detail, context } = read;
  return {
    proposalId: proposal._id,
    profileId: proposal.organizationId,
    sourceId: proposal.sourceId,
    projectId: proposal.repositoryId,
    analysisVersionId: detail._chat.binding.analysisVersionId,
    insightIds: detail.insightIds,
    version: proposal.version,
    review: proposal.review,
    body: bodyOf(detail),
    contextHash: context.contextHash,
    current:
      proposal.baseSha === context.project.baseSha &&
      proposal.profileVersion === context.project.profileVersion &&
      detail._chat.binding.selectionVersion ===
        context.project.selectionVersion &&
      detail._chat.binding.sourceGeneration === context.source.generation &&
      detail._chat.binding.sourceRevision === context.source.sourceRevision,
    origin:
      detail._chat.clientId === "vibescroll_web"
        ? ("web_planning" as const)
        : ("chat_planning" as const),
    handoff: detail.handoff ?? null,
    repositoryCodeIncluded: false as const,
    creditsSpent: 0 as const,
    analysisStarted: false as const,
    codingAuthorized: false as const,
    publicationAuthorized: false as const,
    reviewUrl: `https://scroll.companynerve.com/app/${proposal.organizationId}/proposals/${proposal._id}`,
  };
}

// Keep the body projection explicit: detail also contains server-owned identity fields.
function bodyOf(detail: ReturnType<typeof chatProposalDetail.parse>) {
  return chatProposalBody.parse(
    Object.fromEntries(
      Object.keys(chatProposalBody.shape).map((key) => [
        key,
        detail[key as keyof typeof detail],
      ]),
    ),
  );
}

export const proposalSaveArgs = {
  ...profile,
  sourceId: v.id("sources"),
  projectId: v.id("repositories"),
  analysisVersionId: v.id("analysisVersions"),
  insightIds: v.array(v.string()),
  contextHash: v.string(),
  proposalId: v.optional(v.id("proposals")),
  expectedVersion: v.number(),
  expectedReview: v.optional(v.string()),
  key: v.string(),
  body: v.any(),
};

type ProposalSaveArgs = {
  profileId?: Id<"organizations">;
  sourceId: Id<"sources">;
  projectId: Id<"repositories">;
  analysisVersionId: Id<"analysisVersions">;
  insightIds: string[];
  contextHash: string;
  proposalId?: Id<"proposals">;
  expectedVersion: number;
  expectedReview?: string;
  key: string;
  body: unknown;
};
export const save = internalMutation({
  args: proposalSaveArgs,
  returns: v.any(),
  handler: saveProjectProposalCore,
});

export async function saveProjectProposalCore(
  ctx: MutationCtx,
  args: ProposalSaveArgs,
) {
  const input = saveProjectProposalInput.parse(args);
  const source = await ctx.db.get(args.sourceId);
  ensure(
    source && (!args.profileId || args.profileId === source.organizationId),
    "FORBIDDEN",
    "Choose a post in the current workspace.",
  );
  const identity = await ctx.auth.getUserIdentity();
  const writer =
    identity && isAssistantIdentity(identity)
      ? await assistantGrant(ctx, source.organizationId, "suggestions:draft")
      : {
          ...(await access(ctx, source.organizationId, ["owner", "admin"])),
          client: { id: "vibescroll_web" },
        };
  ensure(
    ["owner", "admin"].includes(writer.membership.role),
    "FORBIDDEN",
    "This workspace role cannot edit proposals.",
  );
  const requestHash = await socialHash(canonicalJson(input));
  let proposal = args.proposalId ? await ctx.db.get(args.proposalId) : null;
  ensure(
    !args.proposalId || proposal,
    "FORBIDDEN",
    "The proposal no longer exists. An update cannot recreate it.",
  );
  if (!args.proposalId) {
    const candidates = await ctx.db
      .query("proposals")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .take(101);
    proposal =
      candidates.find(
        (p) =>
          isChatProposalDetail(p.detail) &&
          p.detail._chat?.creator === writer.actor._id &&
          p.detail._chat?.clientId === writer.client.id &&
          p.detail._chat?.createKey === input.key,
      ) ?? null;
    ensure(
      proposal || candidates.length < 101,
      "LIMIT_REACHED",
      "Open an existing proposal for this post before creating another.",
    );
  }
  if (proposal) {
    ensure(
      proposal.organizationId === source.organizationId &&
        proposal.sourceId === args.sourceId &&
        proposal.repositoryId === args.projectId,
      "FORBIDDEN",
      "A proposal cannot move to another post or project.",
    );
    const read = await readAuthorized(ctx, proposal);
    ensure(
      read.detail._chat.binding.analysisVersionId === args.analysisVersionId &&
        canonicalJson(read.detail.insightIds) ===
          canonicalJson(args.insightIds),
      "APPROVAL_STALE",
      "Create another proposal when choosing different insight evidence.",
    );
    const operation = read.detail._chat.operations.find(
      (entry) => entry.key === input.key,
    );
    const createReplay =
      !args.proposalId && read.detail._chat.createKey === input.key;
    if (operation || createReplay) {
      ensure(
        (createReplay ? read.detail._chat.createHash : operation!.hash) ===
          requestHash,
        "IDEMPOTENCY_CONFLICT",
        "This operation key was already used with different proposal content.",
      );
      return {
        ...snapshot(proposal, read),
        body: bodyOf(read.detail),
        replayed: true,
        appliedVersion: createReplay ? 1 : operation!.version,
      };
    }
    ensure(
      args.proposalId &&
        proposal.version === input.expectedVersion &&
        proposal.review === input.expectedReview,
      "APPROVAL_STALE",
      "The proposal changed. Read it before updating your draft.",
    );
    if (read.detail.work?.issueOperationId) {
      const publication = await ctx.db.get(
        read.detail.work.issueOperationId as Id<"proposalOperations">,
      );
      ensure(
        !publication ||
          ["complete", "failed", "stale"].includes(publication.state),
        "SOURCE_BUSY",
        "Reconcile the frozen issue publication before editing its plan.",
      );
    }
    ensure(
      !proposal.plan && !proposal.planDraft,
      "APPROVAL_STALE",
      "A proposal with an existing implementation plan must use its review workflow.",
    );
  }
  const context = await projectApplicationContextCore(ctx, {
    profileId: args.profileId,
    sourceId: args.sourceId,
    projectId: args.projectId,
    analysisVersionId: args.analysisVersionId,
    insightIds: args.insightIds,
  });
  ensure(
    context.contextHash === input.contextHash,
    "APPROVAL_STALE",
    "The source, selected insights or project context changed. Read the context again.",
  );
  const serializedBody = canonicalJson(input.body);
  ensure(
    new TextEncoder().encode(serializedBody).length <= 20000 &&
      !containsSecret(serializedBody) &&
      !/(?:X-Amz-|X-Goog-|[?&](?:token|sig|signature|key)=|\/api\/evidence\/)/i.test(
        serializedBody,
      ),
    "POLICY_BLOCKED",
    "Keep credentials, signed media URLs and private asset capabilities out of a proposal.",
  );
  await limit(
    ctx,
    `chat-proposal:${source.organizationId}:${writer.actor._id}`,
    60,
  );
  const version = (proposal?.version ?? 0) + 1;
  const evidence = [
    ...new Map(
      context.source.insights
        .flatMap((insight) => insight.evidence)
        .map((ref) => [canonicalJson(ref), ref]),
    ).values(),
  ];
  const retained = proposal ? chatProposalDetail.parse(proposal.detail) : null;
  const prior = retained?._chat ?? null;
  // Older MCP clients omit steps. Preserve routine edits without silently
  // carrying an old implementation plan into a different project context.
  if (input.body.steps === undefined && retained?.steps?.length)
    ensure(
      proposal!.baseSha === context.project.baseSha &&
        proposal!.profileVersion === context.project.profileVersion &&
        retained._chat.binding.selectionVersion ===
          context.project.selectionVersion &&
        retained._chat.binding.sourceGeneration === context.source.generation &&
        retained._chat.binding.sourceRevision === context.source.sourceRevision,
      "APPROVAL_STALE",
      "Review and include the saved steps before rebinding this plan to changed context.",
    );
  const detail = chatProposalDetail.parse({
    ...input.body,
    ...(input.body.steps === undefined && retained?.steps
      ? { steps: retained.steps }
      : {}),
    ...(proposal?.detail.handoff ? { handoff: proposal.detail.handoff } : {}),
    ...(proposal?.detail.work ? { work: proposal.detail.work } : {}),
    schemaVersion: "chat-project-proposal-v1",
    repositoryId: context.project.id,
    baseSha: context.project.baseSha,
    profileVersion: context.project.profileVersion,
    insightIds: args.insightIds,
    sourceEvidence: evidence,
    repositoryEvidence: [],
    _chat: {
      binding: {
        analysisVersionId: context.source.analysisVersionId,
        insightIds: args.insightIds,
        evidenceHash: context.source.evidenceHash,
        outputHash: context.source.outputHash,
        revisionHash: context.source.revisionHash,
        sourceGeneration: context.source.generation,
        sourceRevision: context.source.sourceRevision,
        selectionVersion: context.project.selectionVersion,
      },
      contextHash: context.contextHash,
      creator: prior?.creator ?? writer.actor._id,
      clientId: prior?.clientId ?? writer.client.id,
      createKey: prior?.createKey ?? input.key,
      createHash: prior?.createHash ?? requestHash,
      operations: [
        ...(prior?.operations ?? []),
        { key: input.key, hash: requestHash, version },
      ].slice(-32),
      planningOnly: true,
    },
  });
  ensure(
    new TextEncoder().encode(canonicalJson(detail)).length <= 100000,
    "INVALID_INPUT",
    "This proposal exceeds its stored size bound.",
  );
  const now = Date.now();
  const values = {
    updatedAt: now,
    title: detail.title,
    detail,
    disposition: detail.disposition,
    version,
    review: "unreviewed",
  };
  const proposalId =
    proposal?._id ??
    (await ctx.db.insert("proposals", {
      ...values,
      organizationId: source.organizationId,
      createdAt: now,
      sourceId: source._id,
      repositoryId: args.projectId,
      baseSha: context.project.baseSha,
      profileVersion: context.project.profileVersion,
    }));
  if (proposal)
    await ctx.db.patch(proposalId, {
      ...values,
      baseSha: context.project.baseSha,
      profileVersion: context.project.profileVersion,
      reviewerCorrection: undefined,
      planHash: undefined,
    });
  const saved = (await ctx.db.get(proposalId))!;
  await audit(
    ctx,
    source.organizationId,
    writer.actor._id,
    writer.client.id === "vibescroll_web"
      ? "web.proposal_saved"
      : "assistant.proposal_saved",
    proposalId,
  );
  return {
    ...snapshot(saved, { detail, context }),
    body: bodyOf(detail),
    replayed: false,
    appliedVersion: version,
  };
}

export const read = internalQuery({
  args: { ...profile, proposalId: v.id("proposals") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    ensure(
      proposal &&
        (!args.profileId || proposal.organizationId === args.profileId),
      "FORBIDDEN",
      "Proposal unavailable in this workspace.",
    );
    const authorized = await readAuthorized(ctx, proposal);
    return {
      ...snapshot(proposal, authorized),
      body: bodyOf(authorized.detail),
    };
  },
});

export const list = internalQuery({
  args: {
    ...profile,
    projectId: v.optional(v.id("repositories")),
    cursor: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    ensure(
      !args.cursor || args.cursor.length <= 4096,
      "INVALID_INPUT",
      "Invalid proposal cursor.",
    );
    const principal = await assistantGrant(
      ctx,
      await selectedProfile(ctx, args.profileId),
      "knowledge:read",
    );
    await assistantGrant(ctx, principal.organization._id, "context:read");
    const page = await ctx.db
      .query("proposals")
      .withIndex("by_org", (q) =>
        q.eq("organizationId", principal.organization._id),
      )
      .order("desc")
      .paginate({ numItems: 10, cursor: args.cursor ?? null });
    const items = [];
    for (const proposal of page.page) {
      if (
        !isChatProposalDetail(proposal.detail) ||
        (args.projectId && proposal.repositoryId !== args.projectId)
      )
        continue;
      try {
        const data = snapshot(proposal, await readAuthorized(ctx, proposal));
        const { body, ...metadata } = data;
        items.push({
          ...metadata,
          title: body.title,
          disposition: body.disposition,
        });
      } catch (error) {
        // Omit inaccessible records, but surface programming/runtime failures.
        if (!(error instanceof PolicyError) && !(error instanceof z.ZodError))
          throw error;
      }
    }
    return {
      items,
      next_cursor: page.isDone ? null : page.continueCursor,
      examined: page.page.length,
      coverage:
        "Up to ten current-workspace proposals per page. Follow next_cursor; an empty page is not whole-library absence.",
    };
  },
});
