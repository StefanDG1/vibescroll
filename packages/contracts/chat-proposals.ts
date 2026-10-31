import { z } from "zod";
import { proposalIssueHandoff } from "./proposal-work";
import { analysisVersionOutput } from "./analysis-versions";

const id = z.string().min(1).max(100);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const key = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const lines = (maximum: number, length: number) =>
  z.array(z.string().trim().min(1).max(length)).max(maximum);

export const chatProposalBody = z.strictObject({
  title: z.string().trim().min(1).max(160),
  disposition: z.enum([
    "relevant",
    "no_fit",
    "already_implemented",
    "unsupported_claim",
    "needs_context",
    "defer",
  ]),
  currentProblem: z.string().trim().min(1).max(2000),
  proposedChange: z.string().trim().max(4000).nullable(),
  benefitHypothesis: z.string().trim().max(1500).nullable(),
  risks: lines(10, 500),
  nonGoals: lines(10, 500),
  acceptanceCriteria: lines(15, 500),
  verificationNeeds: lines(10, 500),
  steps: lines(12, 1000).optional(),
});
export const proposalWorkState = z.strictObject({
  threadId: z.string().min(1).max(200).optional(),
  revision: z.number().int().nonnegative(),
  pendingOperationId: id.optional(),
  issueOperationId: id.optional(),
  generatedVersion: z.number().int().positive().optional(),
});
export const chatProposalBinding = z.strictObject({
  analysisVersionId: id,
  insightIds: z.array(id).min(1).max(20),
  evidenceHash: hash,
  outputHash: hash,
  revisionHash: hash,
  sourceGeneration: z.number().int().nonnegative(),
  sourceRevision: z.number().int().nonnegative(),
  selectionVersion: z.number().int().nonnegative(),
});
export const chatProposalDetail = chatProposalBody.extend({
  schemaVersion: z.literal("chat-project-proposal-v1"),
  handoff: proposalIssueHandoff.optional(),
  work: proposalWorkState.optional(),
  repositoryId: id,
  baseSha: z.string().regex(/^[a-f0-9]{40}$/),
  profileVersion: z.number().int().positive(),
  insightIds: z.array(id).min(1).max(20),
  sourceEvidence: z
    .array(analysisVersionOutput.shape.insights.element.shape.evidence.element)
    .min(1)
    .max(600),
  repositoryEvidence: z.array(z.never()).max(0),
  _chat: z.strictObject({
    binding: chatProposalBinding,
    contextHash: hash,
    creator: id,
    clientId: z.string().min(1).max(200),
    createKey: key,
    createHash: hash,
    operations: z
      .array(
        z.strictObject({ key, hash, version: z.number().int().positive() }),
      )
      .min(1)
      .max(32),
    planningOnly: z.literal(true),
  }),
});
export type ChatProposalDetail = z.infer<typeof chatProposalDetail>;
export function isChatProposalDetail(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === "chat-project-proposal-v1"
  );
}
export const saveProjectProposalInput = z
  .strictObject({
    profileId: id.optional(),
    sourceId: id,
    projectId: id,
    analysisVersionId: id,
    insightIds: z.array(id).min(1).max(20),
    contextHash: hash,
    proposalId: id.optional(),
    expectedVersion: z.number().int().nonnegative(),
    expectedReview: z
      .enum(["unreviewed", "accepted", "rejected", "deferred"])
      .optional(),
    key,
    body: chatProposalBody,
  })
  .refine(
    (value) =>
      value.proposalId
        ? value.expectedVersion > 0 && value.expectedReview !== undefined
        : value.expectedVersion === 0 &&
          (value.expectedReview === undefined ||
            value.expectedReview === "unreviewed"),
    "Creation uses version zero; an update needs the current proposal version and review state.",
  );
export const getProjectProposalInput = z.strictObject({
  profileId: id.optional(),
  proposalId: id,
});
export const listProjectProposalsInput = z.strictObject({
  profileId: id.optional(),
  projectId: id.optional(),
  cursor: z.string().max(4096).optional(),
});

export const chatProposalOperations = new Set([
  "get_proposal_discussion",
  "add_proposal_message",
  "reply_to_project_plan",
  "quote_project_plan",
  "start_project_plan",
  "preview_project_issue",
  "approve_project_issue",
  "retry_project_issue",
  "prepare_project_issue",
  "report_project_outcome",
  "save_project_proposal",
  "get_project_proposal",
  "list_project_proposals",
]);
// Only these static messages cross the HTTP/MCP boundary. Never return raw exceptions.
export function chatProposalFailure(code: unknown) {
  switch (code) {
    case "APPROVAL_STALE":
      return {
        code,
        error:
          "Read the current proposal and project application context, reconcile the changes, then save with a new operation key and the current version and review state. Keep your existing connection.",
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        code,
        error:
          "This operation key already identifies different content. Read the saved proposal before choosing a new key for an intentional edit. Keep your existing connection.",
      };
    case "SETUP_REQUIRED":
    case "PERSONAL_FUNDING_REQUIRED":
      return {
        code,
        error:
          "Credit plan generation is not enabled for this account. You can still use this chat to refine and save the proposal with your own subscription. Keep your current connection.",
      };
    case "QUOTE_CHANGED":
      return {
        code,
        error:
          "Read the current discussion and request a new quote before starting paid plan generation.",
      };
    case "SOURCE_BUSY":
    case "COST_RECONCILIATION_REQUIRED":
      return {
        code,
        error:
          "Read get_proposal_discussion for the existing operation. Do not start replacement paid work or create another issue.",
      };
    case "INSUFFICIENT_CREDITS":
    case "BUDGET_EXCEEDED":
      return {
        code,
        error:
          "The current credit allowance cannot cover this plan. No alternative funding route was started.",
      };
    case "ISSUES_PERMISSION_REQUIRED":
    case "GITHUB_UNAVAILABLE":
      return {
        code,
        error:
          "Check the selected project’s GitHub connection and Issues permission. Preserve the frozen publication and retry its existing operation after setup.",
      };
    case "POLICY_BLOCKED":
    case "INVALID_INPUT":
      return {
        code,
        error:
          "Check the proposal fields and remove credentials or private asset URLs before saving. This draft error does not require reconnecting.",
      };
    case "LIMIT_REACHED":
      return {
        code,
        error:
          "The proposal limit was reached. Open an existing draft or retry later; do not reconnect or submit repeated creates.",
      };
    default:
      return undefined;
  }
}
