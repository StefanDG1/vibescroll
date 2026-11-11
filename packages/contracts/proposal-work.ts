import { z } from "zod";

const id = z.string().min(1).max(100);
const key = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const profile = { profileId: id.optional(), proposalId: id };
export const prepareProjectIssueInput = z.strictObject({
  ...profile,
  expectedVersion: z.number().int().positive(),
  expectedReview: z.enum(["unreviewed", "accepted", "rejected", "deferred"]),
  contextHash: hash,
  key,
});
export const reportProjectOutcomeInput = z.strictObject({
  ...profile,
  handoffId: key,
  key,
  status: z.enum(["completed", "blocked", "failed"]),
  summary: z.string().trim().min(1).max(2000),
  workUrls: z.array(z.string().url().max(300)).max(4),
  commitSha: sha.nullable(),
});
export const proposalWorkReport = reportProjectOutcomeInput
  .omit({
    profileId: true,
    proposalId: true,
    handoffId: true,
  })
  .extend({
    hash,
    actorId: id,
    reportedAt: z.number().int().nonnegative(),
    provenance: z.literal("authenticated_model_report"),
  });
export const proposalGithubIssueObservation = z.strictObject({
  provenance: z.literal("signed_github_webhook"),
  issueId: z.number().int().positive(),
  number: z.number().int().positive(),
  url: z.string().url().max(300),
  state: z.enum(["open", "closed", "unknown"]),
  providerUpdatedAt: z.number().int().nonnegative(),
  observedAt: z.number().int().nonnegative(),
  bodyMatchesFrozen: z.boolean(),
  eventHash: hash,
});
export const proposalGithubCheckObservation = z.strictObject({
  provenance: z.literal("signed_github_webhook"),
  checkRunId: z.number().int().positive(),
  appId: z.number().int().positive(),
  headSha: sha,
  conclusion: z.enum([
    "success",
    "failure",
    "neutral",
    "cancelled",
    "skipped",
    "timed_out",
    "action_required",
    "stale",
    "startup_failure",
    "unknown",
  ]),
  providerCompletedAt: z.number().int().nonnegative(),
  observedAt: z.number().int().nonnegative(),
  eventHash: hash,
});
export const proposalGithubPullRequestObservation = z.strictObject({
  provenance: z.literal("signed_github_webhook"),
  pullRequestId: z.number().int().positive(),
  number: z.number().int().positive(),
  url: z.string().url().max(300),
  issueNumber: z.number().int().positive(),
  headSha: sha,
  mergeCommitSha: sha.nullable(),
  state: z.enum(["open", "closed", "merged", "unknown"]),
  providerUpdatedAt: z.number().int().nonnegative(),
  observedAt: z.number().int().nonnegative(),
  eventHash: hash,
  checks: z.array(proposalGithubCheckObservation).max(12),
});
// Internal correlation receipt. It carries identifiers, never credentials or bodies.
export const proposalGithubPullRequestBinding = z.strictObject({
  schemaVersion: z.literal("proposal-pr-binding-v1"),
  proposalId: id,
  handoffId: key,
  pullRequestId: z.number().int().positive(),
});
export const proposalGithubPendingChecks = z.strictObject({
  schemaVersion: z.literal("proposal-pr-pending-checks-v1"),
  pullRequestId: z.number().int().positive(),
  checks: z.array(proposalGithubCheckObservation).max(12),
});
export const proposalIssueHandoff = z.strictObject({
  schemaVersion: z.literal("proposal-issue-handoff-v1"),
  id: key,
  key,
  requestHash: hash,
  proposalVersion: z.number().int().positive(),
  repositoryId: id,
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  baseSha: sha,
  analysisVersionId: id,
  insightIds: z.array(id).min(1).max(20),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(24000),
  bodyHash: hash,
  createdBy: id,
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  reports: z.array(proposalWorkReport).max(8),
  githubIssue: proposalGithubIssueObservation.optional(),
  githubPullRequests: z
    .array(proposalGithubPullRequestObservation)
    .max(4)
    .optional(),
  publication: z
    .strictObject({
      provenance: z.literal("github_api_receipt"),
      number: z.number().int().positive(),
      url: z.string().url().max(300),
      confirmedAt: z.number().int().nonnegative(),
      bodyMatchesFrozen: z.literal(true),
    })
    .optional(),
});

// This untrusted locator is usable only after signature and repository checks.
// Requiring the exact initial frozen body prevents a copied marker from binding
// an unrelated issue. Later observations remain facts about the bound issue.
export function proposalIssueLocator(body: string) {
  const links = [
    ...body.matchAll(
      /^Proposal: https:\/\/scroll\.companynerve\.com\/app\/([a-z0-9]{1,100})\/proposals\/([a-z0-9]{1,100})\r?$/gm,
    ),
  ];
  const markers = [
    ...body.matchAll(/<!-- vibescroll-handoff:([A-Za-z0-9_-]{8,64}) -->/g),
  ];
  return links.length === 1 && markers.length === 1
    ? {
        profileId: links[0][1],
        proposalId: links[0][2],
        handoffId: markers[0][1],
      }
    : null;
}

// A signed PR body is a reference to work, not proof the change implements it.
// Require a closing reference to the already bound issue in the same repository.
export function proposalClosingIssueReferences(
  body: string,
  repository: string,
) {
  const refs = new Set<number>();
  const pattern =
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/([1-9][0-9]*)|(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#([1-9][0-9]*))\b/gi;
  for (const match of body.matchAll(pattern)) {
    if (
      (match[1] || match[3] || repository).toLowerCase() !==
      repository.toLowerCase()
    )
      continue;
    const value = Number(match[2] || match[4]);
    if (Number.isSafeInteger(value)) refs.add(value);
  }
  return [...refs];
}

export function proposalIssueBody(input: {
  title: string;
  currentProblem: string;
  proposedChange: string | null;
  benefitHypothesis: string | null;
  risks: string[];
  nonGoals: string[];
  acceptanceCriteria: string[];
  verificationNeeds: string[];
  steps?: string[];
  proposalId: string;
  profileId: string;
  proposalVersion: number;
  repository: string;
  baseSha: string;
  handoffId: string;
  expiresAt: number;
}) {
  const bullets = (items: string[]) =>
    items.length
      ? items.map((item) => `- ${item}`).join("\n")
      : "Not established.";
  return `## Problem\n\n${input.currentProblem}\n\n## Proposed approach\n\n${input.proposedChange ?? "Inspect the project and clarify the approach first."}\n\n## Expected benefit (unverified)\n\n${input.benefitHypothesis ?? "No benefit claim."}\n\n${input.steps?.length ? `## Implementation plan\n\n${bullets(input.steps)}\n\n` : ""}## Acceptance criteria\n\n${bullets(input.acceptanceCriteria)}\n\n## Verification needed\n\n${bullets(input.verificationNeeds)}\n\n## Risks\n\n${bullets(input.risks)}\n\n## Non-goals\n\n${bullets(input.nonGoals)}\n\n## VibeScroll handoff\n\nProposal: https://scroll.companynerve.com/app/${input.profileId}/proposals/${input.proposalId}\nProposal version: ${input.proposalVersion}. Project: ${input.repository}. Context commit: ${input.baseSha}.\n\nInspect the current repository before implementing. The proposal uses retained insights and a project profile; it does not establish that repository code was inspected. This issue does not authorize coding, spending, merging or publication. Use the user's actual implementation instructions.\n\nAfter the requested work, use your authenticated VibeScroll MCP connection and call report_project_outcome with profileId=${input.profileId}, proposalId=${input.proposalId}, handoffId=${input.handoffId}, a stable new key, status=completed/blocked/failed, a concise summary, workUrls containing only issue/PR links in ${input.repository}, and commitSha as the actual commit or null. Report tests and limitations honestly. Reuse the same key and content if the reply is unknown. Reporting expires ${new Date(input.expiresAt).toISOString()}; the saved proposal remains available. If no authorized VibeScroll connection is available, report that limitation in the issue instead; do not request or embed credentials. A model report is separate from verified CI, merge and user benefit.\n\nWhen opening a PR for this issue, include the Proposal line and final handoff marker from this page once, plus a same-repository closing reference to this issue. These public identifiers associate signed PR and check observations with this saved work; they grant no callback or execution authority.\n\n<!-- vibescroll-handoff:${input.handoffId} -->`;
}
