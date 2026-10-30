import { v } from "convex/values";
import { internalMutation } from "./lib/projectedMutations";
import { assistantGrant } from "./lib/assistantPrincipal";
import { readAuthorized } from "./assistantProposals";
import { sourceFor } from "./assistant";
import { audit, limit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { socialHash } from "../packages/social/contracts";
import { chatProposalDetail } from "../packages/contracts/chat-proposals";
import {
  prepareProjectIssueInput,
  reportProjectOutcomeInput,
  proposalIssueHandoff,
  proposalIssueBody,
} from "../packages/contracts/proposal-work";

const profile = {
  profileId: v.optional(v.id("organizations")),
  proposalId: v.id("proposals"),
};
const safeText = (text: string) =>
  !containsSecret(text) &&
  !/(?:X-Amz-|X-Goog-|[?&](?:token|sig|signature|key)=|\/api\/evidence\/|data:image)/i.test(
    text,
  );

export const prepare = internalMutation({
  args: {
    ...profile,
    expectedVersion: v.number(),
    expectedReview: v.string(),
    contextHash: v.string(),
    key: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const input = prepareProjectIssueInput.parse(args);
    const proposal = await ctx.db.get(args.proposalId);
    ensure(
      proposal &&
        (!args.profileId || proposal.organizationId === args.profileId),
      "FORBIDDEN",
      "Proposal unavailable in this workspace.",
    );
    const writer = await assistantGrant(
      ctx,
      proposal.organizationId,
      "suggestions:draft",
    );
    ensure(
      ["owner", "admin"].includes(writer.membership.role),
      "FORBIDDEN",
      "This workspace role cannot prepare a handoff.",
    );
    const { detail, context } = await readAuthorized(ctx, proposal);
    const requestHash = await socialHash(
      canonicalJson({
        input: { ...input, profileId: proposal.organizationId },
        actor: writer.actor._id,
        client: writer.client.id,
      }),
    );
    if (detail.handoff) {
      ensure(
        detail.handoff.key === input.key &&
          detail.handoff.requestHash === requestHash,
        "IDEMPOTENCY_CONFLICT",
        "This proposal already has a frozen handoff. Read the saved handoff instead of publishing another issue.",
      );
      return {
        handoff: detail.handoff,
        replayed: true,
        publicationStarted: false,
        codingAuthorized: false,
        creditsSpent: 0,
      };
    }
    ensure(
      proposal.version === input.expectedVersion &&
        proposal.review === input.expectedReview &&
        context.contextHash === input.contextHash &&
        proposal.baseSha === context.project.baseSha &&
        proposal.profileVersion === context.project.profileVersion &&
        detail._chat.binding.selectionVersion ===
          context.project.selectionVersion &&
        detail._chat.binding.sourceGeneration === context.source.generation &&
        detail._chat.binding.sourceRevision === context.source.sourceRevision,
      "APPROVAL_STALE",
      "Read the current proposal and project before preparing an issue.",
    );
    ensure(
      proposal.review !== "rejected",
      "APPROVAL_STALE",
      "A rejected proposal cannot be handed off.",
    );
    await limit(ctx, `proposal-handoff:${writer.actor._id}`, 20);
    const repository = (await ctx.db.get(proposal.repositoryId))!;
    const now = Date.now(),
      expiresAt = now + 30 * 86400000;
    const handoffId = `work_${crypto.randomUUID().replaceAll("-", "")}`;
    const body = proposalIssueBody({
      ...detail,
      proposalId: proposal._id,
      profileId: proposal.organizationId,
      proposalVersion: proposal.version,
      repository: repository.fullName,
      baseSha: proposal.baseSha,
      handoffId,
      expiresAt,
    });
    ensure(
      safeText(body) && safeText(detail.title),
      "POLICY_BLOCKED",
      "Remove credentials and protected asset URLs from the handoff.",
    );
    const handoff = proposalIssueHandoff.parse({
      schemaVersion: "proposal-issue-handoff-v1",
      id: handoffId,
      key: input.key,
      requestHash,
      proposalVersion: proposal.version,
      repositoryId: repository._id,
      repository: repository.fullName,
      baseSha: proposal.baseSha,
      analysisVersionId: detail._chat.binding.analysisVersionId,
      insightIds: detail.insightIds,
      title: detail.title,
      body,
      bodyHash: await socialHash(body),
      createdBy: writer.actor._id,
      createdAt: now,
      expiresAt,
      reports: [],
    });
    const next = chatProposalDetail.parse({ ...detail, handoff });
    ensure(
      new TextEncoder().encode(canonicalJson(next)).length <= 100000,
      "LIMIT_REACHED",
      "This handoff exceeds the retained proposal limit.",
    );
    await ctx.db.patch(proposal._id, { detail: next, updatedAt: now });
    await audit(
      ctx,
      proposal.organizationId,
      writer.actor._id,
      "assistant.proposal_handoff_prepared",
      proposal._id,
    );
    return {
      handoff,
      replayed: false,
      publicationStarted: false,
      codingAuthorized: false,
      creditsSpent: 0,
    };
  },
});

export const report = internalMutation({
  args: {
    ...profile,
    handoffId: v.string(),
    key: v.string(),
    status: v.string(),
    summary: v.string(),
    workUrls: v.array(v.string()),
    commitSha: v.union(v.string(), v.null()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const input = reportProjectOutcomeInput.parse(args);
    const proposal = await ctx.db.get(args.proposalId);
    ensure(
      proposal &&
        (!args.profileId || proposal.organizationId === args.profileId),
      "FORBIDDEN",
      "Proposal unavailable in this workspace.",
    );
    const writer = await assistantGrant(
      ctx,
      proposal.organizationId,
      "feedback:write",
    );
    ensure(
      ["owner", "admin"].includes(writer.membership.role),
      "FORBIDDEN",
      "This workspace role cannot report work.",
    );
    const library = await assistantGrant(
      ctx,
      proposal.organizationId,
      "knowledge:read",
    );
    ensure(
      await sourceFor(ctx, library, proposal.sourceId),
      "SOURCE_UNAVAILABLE",
      "The retained source is unavailable with current access.",
    );
    const projectAccess = await assistantGrant(
      ctx,
      proposal.organizationId,
      "context:read",
    );
    const project = await ctx.db.get(proposal.repositoryId);
    // A completion report observes the frozen task. Advancing HEAD is expected,
    // and grants no authority to inspect new code or rebind the planning draft.
    ensure(
      project &&
        project.organizationId === proposal.organizationId &&
        project.enabled &&
        (projectAccess.grant.contextScope === "all_confirmed"
          ? project.confirmed
          : projectAccess.grant.repositories?.some(
              (r) => r.repositoryId === project._id,
            )),
      "FORBIDDEN",
      "The handoff project is no longer accessible.",
    );
    const detail = chatProposalDetail.parse(proposal.detail);
    const handoff = detail.handoff;
    ensure(
      handoff && handoff.id === input.handoffId,
      "FORBIDDEN",
      "Use the exact saved handoff for this proposal.",
    );
    const hash = await socialHash(
      canonicalJson({
        input: { ...input, profileId: proposal.organizationId },
        actor: writer.actor._id,
        client: writer.client.id,
      }),
    );
    const prior = handoff.reports.find((r) => r.key === input.key);
    if (prior) {
      ensure(
        prior.hash === hash,
        "IDEMPOTENCY_CONFLICT",
        "This report key already identifies different content.",
      );
      return {
        proposalId: proposal._id,
        handoffId: handoff.id,
        report: prior,
        replayed: true,
        verifiedCompletion: false,
        verifiedCi: false,
        verifiedMerge: false,
        verifiedBenefit: false,
      };
    }
    ensure(
      handoff.expiresAt > Date.now(),
      "APPROVAL_STALE",
      "This handoff's reporting window expired. The saved proposal remains available.",
    );
    ensure(
      handoff.reports.length < 8,
      "LIMIT_REACHED",
      "This handoff reached its report limit.",
    );
    ensure(
      safeText(input.summary),
      "POLICY_BLOCKED",
      "Do not include credentials or protected asset URLs in reports.",
    );
    for (const url of input.workUrls) {
      const parsed = new URL(url);
      const suffix = parsed.pathname.slice(`/${handoff.repository}/`.length);
      ensure(
        parsed.origin === "https://github.com" &&
          !parsed.username &&
          !parsed.password &&
          !parsed.search &&
          !parsed.hash &&
          parsed.pathname.startsWith(`/${handoff.repository}/`) &&
          /^(?:issues|pull)\/[1-9][0-9]*$/.test(suffix),
        "INVALID_INPUT",
        "Work links must identify an issue or PR in the handoff repository.",
      );
    }
    const report = {
      key: input.key,
      status: input.status,
      summary: input.summary,
      workUrls: input.workUrls,
      commitSha: input.commitSha,
      hash,
      actorId: writer.actor._id,
      reportedAt: Date.now(),
      provenance: "authenticated_model_report" as const,
    };
    const next = chatProposalDetail.parse({
      ...detail,
      handoff: { ...handoff, reports: [...handoff.reports, report] },
    });
    ensure(
      new TextEncoder().encode(canonicalJson(next)).length <= 100000,
      "LIMIT_REACHED",
      "This report exceeds the retained proposal limit.",
    );
    await ctx.db.patch(proposal._id, { detail: next, updatedAt: Date.now() });
    await audit(
      ctx,
      proposal.organizationId,
      writer.actor._id,
      "assistant.proposal_work_reported",
      proposal._id,
    );
    return {
      proposalId: proposal._id,
      handoffId: handoff.id,
      report,
      replayed: false,
      verifiedCompletion: false,
      verifiedCi: false,
      verifiedMerge: false,
      verifiedBenefit: false,
    };
  },
});
