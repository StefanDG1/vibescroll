import { v } from "convex/values";
import { internalMutation } from "./lib/projectedMutations";
import { assistantGrant } from "./lib/assistantPrincipal";
import { readAuthorized } from "./assistantProposals";
import { sourceFor } from "./assistant";
import { audit, limit, access } from "./lib";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isAssistantIdentity } from "../packages/policy/assistant";
import { sourceRetained } from "./lib/sourceAuthority";
import { ensure, containsSecret } from "../packages/policy";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { socialHash } from "../packages/social/contracts";
import { chatProposalDetail } from "../packages/contracts/chat-proposals";
import {
  prepareProjectIssueInput,
  reportProjectOutcomeInput,
  proposalIssueHandoff,
  proposalIssueBody,
  proposalIssueLocator,
  proposalClosingIssueReferences,
  proposalGithubPullRequestBinding,
  proposalGithubPullRequestObservation,
  proposalGithubCheckObservation,
  proposalGithubPendingChecks,
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

export async function prepareIssueCore(
  ctx: MutationCtx,
  args: {
    profileId?: import("./_generated/dataModel").Id<"organizations">;
    proposalId: import("./_generated/dataModel").Id<"proposals">;
    expectedVersion: number;
    expectedReview: string;
    contextHash: string;
    key: string;
  },
) {
  const input = prepareProjectIssueInput.parse(args);
  const proposal = await ctx.db.get(args.proposalId);
  ensure(
    proposal && (!args.profileId || proposal.organizationId === args.profileId),
    "FORBIDDEN",
    "Proposal unavailable in this workspace.",
  );
  const writer = isAssistantIdentity(await ctx.auth.getUserIdentity())
    ? await assistantGrant(ctx, proposal.organizationId, "suggestions:draft")
    : {
        ...(await access(ctx, proposal.organizationId, ["owner", "admin"])),
        client: { id: "vibescroll_web" },
      };
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
}

export const prepare = internalMutation({
  args: {
    ...profile,
    expectedVersion: v.number(),
    expectedReview: v.string(),
    contextHash: v.string(),
    key: v.string(),
  },
  returns: v.any(),
  handler: prepareIssueCore,
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

// Only the signature-verified webhook invokes this exact-record observation.
// It grants no access, publication, coding, CI, merge or benefit authority.
export const observeIssue = internalMutation({
  args: {
    installationId: v.number(),
    providerId: v.number(),
    repository: v.string(),
    issueId: v.number(),
    number: v.number(),
    url: v.string(),
    title: v.string(),
    body: v.string(),
    state: v.string(),
    updatedAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    const now = Date.now();
    if (
      process.env.RESTORE_LOCK === "true" ||
      ![a.installationId, a.providerId, a.issueId, a.number].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ) ||
      !Number.isSafeInteger(a.updatedAt) ||
      a.updatedAt > now + 300000 ||
      !["open", "closed"].includes(a.state) ||
      a.title.length > 160 ||
      a.body.length > 24000
    )
      return false;
    const locator = proposalIssueLocator(a.body);
    const id = locator && ctx.db.normalizeId("proposals", locator.proposalId);
    const proposal = id ? await ctx.db.get(id) : null;
    if (!locator || !proposal || proposal.organizationId !== locator.profileId)
      return false;
    const parsed = chatProposalDetail.safeParse(proposal.detail);
    if (!parsed.success) return false;
    const detail = parsed.data,
      handoff = detail.handoff;
    if (!handoff || handoff.id !== locator.handoffId) return false;
    const repo = await ctx.db.get(proposal.repositoryId);
    const organization = await ctx.db.get(proposal.organizationId);
    const source = await ctx.db.get(proposal.sourceId);
    if (
      organization?.status !== "active" ||
      !source ||
      source.state === "deleted" ||
      source.organizationId !== proposal.organizationId ||
      !sourceRetained(source.sourceRetentionUntil) ||
      !repo?.enabled ||
      repo.organizationId !== proposal.organizationId ||
      repo._id !== handoff.repositoryId ||
      repo.fullName !== handoff.repository ||
      repo.installationId !== a.installationId ||
      repo.providerId !== a.providerId ||
      repo.fullName !== a.repository ||
      a.url !== `https://github.com/${repo.fullName}/issues/${a.number}` ||
      a.updatedAt + 1000 < handoff.createdAt
    )
      return false;
    const old = handoff.githubIssue;
    if (
      old &&
      (old.issueId !== a.issueId ||
        old.number !== a.number ||
        old.url !== a.url ||
        old.providerUpdatedAt > a.updatedAt)
    )
      return false;
    const bodyMatchesFrozen =
      a.title === handoff.title &&
      (await socialHash(a.body)) === handoff.bodyHash;
    if (!old && !bodyMatchesFrozen) return false;
    const eventHash = await socialHash(canonicalJson(a));
    if (old?.eventHash === eventHash) return false;
    const sameTime = old?.providerUpdatedAt === a.updatedAt;
    // GitHub timestamps have second resolution. Conflicting states at the same
    // timestamp cannot establish ordering, even if one delivery arrived later.
    if (sameTime && old.state === "unknown") return false;
    const state = sameTime && old.state !== a.state ? "unknown" : a.state;
    const githubIssue = {
      provenance: "signed_github_webhook" as const,
      issueId: a.issueId,
      number: a.number,
      url: a.url,
      state,
      providerUpdatedAt: a.updatedAt,
      observedAt: now,
      bodyMatchesFrozen: sameTime
        ? old.bodyMatchesFrozen && bodyMatchesFrozen
        : bodyMatchesFrozen,
      eventHash,
    };
    const next = chatProposalDetail.parse({
      ...detail,
      handoff: { ...handoff, githubIssue },
    });
    // Provider facts must not invalidate an already-retained proposal at its byte limit.
    if (new TextEncoder().encode(canonicalJson(next)).length > 100000)
      return false;
    await ctx.db.patch(proposal._id, {
      detail: next,
      updatedAt: Math.max(now, proposal.updatedAt + 1),
    });
    return true;
  },
});

async function currentProviderHandoff(
  ctx: MutationCtx,
  proposalId: Id<"proposals">,
  a: {
    installationId: number;
    providerId: number;
    repository: string;
  },
) {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) return null;
  const parsed = chatProposalDetail.safeParse(proposal.detail);
  if (!parsed.success || !parsed.data.handoff) return null;
  const detail = parsed.data,
    handoff = detail.handoff!;
  const [repo, organization, source] = await Promise.all([
    ctx.db.get(proposal.repositoryId),
    ctx.db.get(proposal.organizationId),
    ctx.db.get(proposal.sourceId),
  ]);
  if (
    organization?.status !== "active" ||
    !source ||
    source.state === "deleted" ||
    source.organizationId !== proposal.organizationId ||
    !sourceRetained(source.sourceRetentionUntil) ||
    !repo?.enabled ||
    repo.organizationId !== proposal.organizationId ||
    repo._id !== handoff.repositoryId ||
    repo.fullName !== handoff.repository ||
    repo.installationId !== a.installationId ||
    repo.providerId !== a.providerId ||
    repo.fullName !== a.repository
  )
    return null;
  return { proposal, detail, handoff };
}

const prReceiptProvider = "github-proposal-pr";
const prReceiptKey = (a: {
  installationId: number;
  providerId: number;
  number: number;
}) => `${a.installationId}:${a.providerId}:${a.number}`;

function readPrReceipt(state: string) {
  if (state.length > 16384) return null;
  try {
    const value = JSON.parse(state);
    const binding = proposalGithubPullRequestBinding.safeParse(value);
    if (binding.success) return binding.data;
    const pending = proposalGithubPendingChecks.safeParse(value);
    return pending.success ? pending.data : null;
  } catch {
    return null;
  }
}

type CheckObservation = ReturnType<typeof proposalGithubCheckObservation.parse>;
function mergeCheck(checks: CheckObservation[], incoming: CheckObservation) {
  const old = checks.find((check) => check.checkRunId === incoming.checkRunId);
  if (
    old &&
    (old.appId !== incoming.appId ||
      old.headSha !== incoming.headSha ||
      old.providerCompletedAt > incoming.providerCompletedAt ||
      old.eventHash === incoming.eventHash)
  )
    return null;
  if (!old && checks.length >= 12) return null;
  const sameTime = old?.providerCompletedAt === incoming.providerCompletedAt;
  if (sameTime && old.conclusion === "unknown") return null;
  const check = {
    ...incoming,
    conclusion:
      sameTime && old.conclusion !== incoming.conclusion
        ? ("unknown" as const)
        : incoming.conclusion,
  };
  return [...checks.filter((c) => c.checkRunId !== incoming.checkRunId), check];
}

// Only signed webhook dispatch calls these internal observers. A PR body can
// identify an observed relationship, never grant implementation authority.
export const observePullRequest = internalMutation({
  args: {
    installationId: v.number(),
    providerId: v.number(),
    repository: v.string(),
    pullRequestId: v.number(),
    number: v.number(),
    url: v.string(),
    body: v.string(),
    headSha: v.string(),
    mergeCommitSha: v.union(v.string(), v.null()),
    state: v.union(v.literal("open"), v.literal("closed"), v.literal("merged")),
    updatedAt: v.number(),
    delivery: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    const now = Date.now();
    if (
      process.env.RESTORE_LOCK === "true" ||
      ![a.installationId, a.providerId, a.pullRequestId, a.number].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ) ||
      !Number.isSafeInteger(a.updatedAt) ||
      a.updatedAt < 0 ||
      a.updatedAt > now + 300000 ||
      a.body.length > 30000 ||
      !/^[a-f0-9]{40}$/.test(a.headSha) ||
      (a.mergeCommitSha !== null && !/^[a-f0-9]{40}$/.test(a.mergeCommitSha)) ||
      !/^[a-zA-Z0-9-]{8,100}$/.test(a.delivery)
    )
      return false;
    const receipt = await ctx.db
      .query("webhookReceipts")
      .withIndex("by_key", (q) =>
        q.eq("provider", prReceiptProvider).eq("key", prReceiptKey(a)),
      )
      .unique();
    const previous = receipt ? readPrReceipt(receipt.state) : null;
    // Preserve unknown/historical receipts rather than rebinding them.
    if (receipt && (!previous || previous.pullRequestId !== a.pullRequestId))
      return false;
    const binding =
      previous?.schemaVersion === "proposal-pr-binding-v1" ? previous : null;
    const pending =
      previous?.schemaVersion === "proposal-pr-pending-checks-v1"
        ? previous
        : null;
    const locator = proposalIssueLocator(a.body);
    const id = ctx.db.normalizeId(
      "proposals",
      binding?.proposalId ?? locator?.proposalId ?? "",
    );
    if (!id) return false;
    const current = await currentProviderHandoff(ctx, id, a);
    if (!current) return false;
    const { proposal, detail, handoff } = current;
    if (
      a.url !== `https://github.com/${a.repository}/pull/${a.number}` ||
      a.updatedAt + 1000 < handoff.createdAt ||
      (binding && binding.handoffId !== handoff.id)
    )
      return false;
    const old = handoff.githubPullRequests?.find(
      (pr) => pr.number === a.number,
    );
    if (
      old &&
      (old.pullRequestId !== a.pullRequestId ||
        old.providerUpdatedAt > a.updatedAt)
    )
      return false;
    const issueNumber =
      handoff.publication?.number ?? handoff.githubIssue?.number;
    if (
      !old &&
      (!locator ||
        locator.profileId !== proposal.organizationId ||
        locator.handoffId !== handoff.id ||
        !issueNumber ||
        !proposalClosingIssueReferences(a.body, a.repository).includes(
          issueNumber,
        ))
    )
      return false;
    if (!old && (handoff.githubPullRequests?.length ?? 0) >= 4) return false;
    // Exclude transport delivery IDs: redelivery does not change provider facts.
    const { delivery: _delivery, ...facts } = a;
    const eventHash = await socialHash(canonicalJson(facts));
    if (old?.eventHash === eventHash) return false;
    const sameTime = old?.providerUpdatedAt === a.updatedAt;
    const conflicting =
      sameTime &&
      (old.state !== a.state ||
        old.headSha !== a.headSha ||
        old.mergeCommitSha !== a.mergeCommitSha);
    if (sameTime && old.state === "unknown") return false;
    const pr = proposalGithubPullRequestObservation.parse({
      provenance: "signed_github_webhook",
      pullRequestId: a.pullRequestId,
      number: a.number,
      url: a.url,
      issueNumber: old?.issueNumber ?? issueNumber,
      headSha: a.headSha,
      mergeCommitSha: conflicting ? null : a.mergeCommitSha,
      state: conflicting ? "unknown" : a.state,
      providerUpdatedAt: a.updatedAt,
      observedAt: now,
      eventHash,
      checks:
        old && old.headSha === a.headSha && !conflicting
          ? old.checks
          : !old && pending
            ? pending.checks.filter(
                (check) =>
                  check.headSha === a.headSha &&
                  check.providerCompletedAt + 1000 >= handoff.createdAt,
              )
            : [],
    });
    const prs = [
      ...(handoff.githubPullRequests ?? []).filter(
        (p) => p.number !== a.number,
      ),
      pr,
    ];
    const next = chatProposalDetail.parse({
      ...detail,
      handoff: { ...handoff, githubPullRequests: prs },
    });
    if (new TextEncoder().encode(canonicalJson(next)).length > 100000)
      return false;
    await ctx.db.patch(proposal._id, {
      detail: next,
      updatedAt: Math.max(now, proposal.updatedAt + 1),
    });
    const state = canonicalJson(
      proposalGithubPullRequestBinding.parse({
        schemaVersion: "proposal-pr-binding-v1",
        proposalId: proposal._id,
        handoffId: handoff.id,
        pullRequestId: a.pullRequestId,
      }),
    );
    if (receipt && pending) await ctx.db.patch(receipt._id, { state, at: now });
    else if (!receipt)
      await ctx.db.insert("webhookReceipts", {
        provider: prReceiptProvider,
        key: prReceiptKey(a),
        at: now,
        state,
      });
    return true;
  },
});

export const observeCheck = internalMutation({
  args: {
    installationId: v.number(),
    providerId: v.number(),
    repository: v.string(),
    number: v.number(),
    pullRequestId: v.number(),
    checkRunId: v.number(),
    appId: v.number(),
    headSha: v.string(),
    conclusion: v.string(),
    completedAt: v.number(),
    delivery: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    const now = Date.now();
    if (
      process.env.RESTORE_LOCK === "true" ||
      ![
        a.installationId,
        a.providerId,
        a.number,
        a.pullRequestId,
        a.checkRunId,
        a.appId,
      ].every((n) => Number.isSafeInteger(n) && n > 0) ||
      !Number.isSafeInteger(a.completedAt) ||
      a.completedAt < 0 ||
      a.completedAt > now + 300000 ||
      !/^[a-zA-Z0-9-]{8,100}$/.test(a.delivery)
    )
      return false;
    const input = proposalGithubCheckObservation.safeParse({
      provenance: "signed_github_webhook",
      checkRunId: a.checkRunId,
      appId: a.appId,
      headSha: a.headSha,
      conclusion: a.conclusion,
      providerCompletedAt: a.completedAt,
      observedAt: now,
      eventHash: "0".repeat(64),
    });
    if (!input.success) return false;
    const receipt = await ctx.db
      .query("webhookReceipts")
      .withIndex("by_key", (q) =>
        q.eq("provider", prReceiptProvider).eq("key", prReceiptKey(a)),
      )
      .unique();
    const previous = receipt ? readPrReceipt(receipt.state) : null;
    if (receipt && (!previous || previous.pullRequestId !== a.pullRequestId))
      return false;
    const { delivery: _delivery, ...facts } = a;
    const incoming = {
      ...input.data,
      eventHash: await socialHash(canonicalJson(facts)),
    };
    if (
      !previous ||
      previous.schemaVersion === "proposal-pr-pending-checks-v1"
    ) {
      // Retain only signed facts for an already configured active installation.
      // This does not bind them to a proposal or authorize any work.
      const repos = await ctx.db
        .query("repositories")
        .withIndex("by_github", (q) =>
          q
            .eq("installationId", a.installationId)
            .eq("providerId", a.providerId),
        )
        .take(20);
      let available = false;
      for (const repo of repos)
        if (
          repo.enabled &&
          repo.fullName === a.repository &&
          (await ctx.db.get(repo.organizationId))?.status === "active"
        ) {
          available = true;
          break;
        }
      if (!available) return false;
      const checks = mergeCheck(previous?.checks ?? [], incoming);
      if (!checks) return false;
      const state = canonicalJson(
        proposalGithubPendingChecks.parse({
          schemaVersion: "proposal-pr-pending-checks-v1",
          pullRequestId: a.pullRequestId,
          checks,
        }),
      );
      if (receipt) await ctx.db.patch(receipt._id, { state, at: now });
      else
        await ctx.db.insert("webhookReceipts", {
          provider: prReceiptProvider,
          key: prReceiptKey(a),
          at: now,
          state,
        });
      return true;
    }
    const binding = previous;
    const id = ctx.db.normalizeId("proposals", binding.proposalId);
    if (!id) return false;
    const current = await currentProviderHandoff(ctx, id, a);
    if (!current || current.handoff.id !== binding.handoffId) return false;
    const { proposal, detail, handoff } = current;
    const pr = handoff.githubPullRequests?.find(
      (p) => p.number === a.number && p.pullRequestId === a.pullRequestId,
    );
    if (
      !pr ||
      pr.headSha !== a.headSha ||
      pr.state === "unknown" ||
      a.completedAt + 1000 < handoff.createdAt
    )
      return false;
    const checks = mergeCheck(pr.checks, incoming);
    if (!checks) return false;
    const next = chatProposalDetail.parse({
      ...detail,
      handoff: {
        ...handoff,
        githubPullRequests: handoff.githubPullRequests!.map((p) =>
          p.number === pr.number
            ? {
                ...p,
                checks,
              }
            : p,
        ),
      },
    });
    if (new TextEncoder().encode(canonicalJson(next)).length > 100000)
      return false;
    await ctx.db.patch(proposal._id, {
      detail: next,
      updatedAt: Math.max(now, proposal.updatedAt + 1),
    });
    return true;
  },
});
