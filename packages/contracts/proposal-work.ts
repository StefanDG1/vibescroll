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
  insightIds: z.array(id).min(1).max(8),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(24000),
  bodyHash: hash,
  createdBy: id,
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  reports: z.array(proposalWorkReport).max(8),
});

export function proposalIssueBody(input: {
  title: string;
  currentProblem: string;
  proposedChange: string | null;
  benefitHypothesis: string | null;
  risks: string[];
  nonGoals: string[];
  acceptanceCriteria: string[];
  verificationNeeds: string[];
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
  return `## Problem\n\n${input.currentProblem}\n\n## Proposed approach\n\n${input.proposedChange ?? "Inspect the project and clarify the approach first."}\n\n## Expected benefit (unverified)\n\n${input.benefitHypothesis ?? "No benefit claim."}\n\n## Acceptance criteria\n\n${bullets(input.acceptanceCriteria)}\n\n## Verification needed\n\n${bullets(input.verificationNeeds)}\n\n## Risks\n\n${bullets(input.risks)}\n\n## Non-goals\n\n${bullets(input.nonGoals)}\n\n## VibeScroll handoff\n\nProposal: https://scroll.companynerve.com/app/${input.profileId}/proposals/${input.proposalId}\nProposal version: ${input.proposalVersion}. Project: ${input.repository}. Context commit: ${input.baseSha}.\n\nInspect the current repository before implementing. The proposal uses retained insights and a project profile; it does not establish that repository code was inspected. This issue does not authorize coding, spending, merging or publication. Use the user's actual implementation instructions.\n\nAfter the requested work, use your authenticated VibeScroll MCP connection and call report_project_outcome with profileId=${input.profileId}, proposalId=${input.proposalId}, handoffId=${input.handoffId}, a stable new key, status=completed/blocked/failed, a concise summary, workUrls containing only issue/PR links in ${input.repository}, and commitSha as the actual commit or null. Report tests and limitations honestly. Reuse the same key and content if the reply is unknown. Reporting expires ${new Date(input.expiresAt).toISOString()}; the saved proposal remains available. If no authorized VibeScroll connection is available, report that limitation in the issue instead; do not request or embed credentials. A model report is separate from verified CI, merge and user benefit.\n\n<!-- vibescroll-handoff:${input.handoffId} -->`;
}
