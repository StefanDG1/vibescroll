import { z } from "zod";
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
});
export const chatProposalBinding = z.strictObject({
  analysisVersionId: id,
  insightIds: z.array(id).min(1).max(8),
  evidenceHash: hash,
  outputHash: hash,
  revisionHash: hash,
  sourceGeneration: z.number().int().nonnegative(),
  sourceRevision: z.number().int().nonnegative(),
  selectionVersion: z.number().int().nonnegative(),
});
export const chatProposalDetail = chatProposalBody.extend({
  schemaVersion: z.literal("chat-project-proposal-v1"),
  repositoryId: id,
  baseSha: z.string().regex(/^[a-f0-9]{40}$/),
  profileVersion: z.number().int().positive(),
  insightIds: z.array(id).min(1).max(8),
  sourceEvidence: z
    .array(analysisVersionOutput.shape.insights.element.shape.evidence.element)
    .min(1)
    .max(240),
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
    insightIds: z.array(id).min(1).max(8),
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
