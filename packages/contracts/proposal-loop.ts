import { z } from "zod";
import { chatProposalBody } from "./chat-proposals";

export const proposalOperationKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const proposalDiscussionInput = z.strictObject({
  proposalId: z.string().min(1).max(100),
  expectedVersion: z.number().int().positive(),
  key: proposalOperationKey,
  text: z.string().trim().min(1).max(4000),
});
export const generatedProposalPlan = z.strictObject({
  message: z.string().trim().min(1).max(2000),
  body: chatProposalBody,
  steps: z.array(z.string().trim().min(1).max(1000)).min(1).max(12),
  insightIds: z.array(z.string().min(1).max(100)).min(1).max(20),
});
export const proposalPlanTariff = {
  version: "proposal-plan-v1",
  model: "zai/glm-5.3-flash",
  maximumCredits: 3,
  maximumApiUsd: 0.02,
  infrastructureUsd: 0.001,
  maximumInputBytes: 160000,
  maximumOutputTokens: 8000,
} as const;

/** Legacy internal units: accumulate exact microdollars and round only once. */
export function proposalPlanSettlement(
  inputTokens: number,
  outputTokens: number,
) {
  if (
    ![inputTokens, outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0)
  )
    throw Error("PROPOSAL_USAGE_UNAVAILABLE");
  // GLM 5.3 Flash on DeepInfra: USD0.075/M input, USD0.25/M output.
  // Nanodollars represent both exactly; infrastructure adds USD0.001.
  const providerNanoUsd = inputTokens * 75 + outputTokens * 250;
  const nanoUsd = providerNanoUsd + 1000000;
  if (!Number.isSafeInteger(nanoUsd)) throw Error("PROPOSAL_USAGE_OVERFLOW");
  const credits = Math.ceil(nanoUsd / 10000000);
  if (providerNanoUsd > 20000000 || credits > proposalPlanTariff.maximumCredits)
    throw Error("PROPOSAL_QUOTE_EXCEEDED");
  return { credits, estimatedUsd: nanoUsd / 1000000000 };
}

const proposal = {
  profileId: z.string().min(1).max(100).optional(),
  proposalId: z.string().min(1).max(100),
};
export const proposalLoopInputs = {
  get_proposal_discussion: z.strictObject({
    ...proposal,
    cursor: z.string().max(4096).optional(),
  }),
  add_proposal_message: proposalDiscussionInput.extend({
    profileId: proposal.profileId,
  }),
  reply_to_project_plan: proposalDiscussionInput.extend({
    profileId: proposal.profileId,
    quoteId: z.string().regex(/^[a-f0-9]{64}$/),
    maximumCredits: z.number().int().nonnegative(),
  }),
  quote_project_plan: z.strictObject(proposal),
  start_project_plan: z.strictObject({
    ...proposal,
    expectedVersion: z.number().int().positive(),
    key: proposalOperationKey,
    quoteId: z.string().regex(/^[a-f0-9]{64}$/),
    maximumCredits: z.number().int().nonnegative(),
  }),
  preview_project_issue: z.strictObject(proposal),
  approve_project_issue: z.strictObject({
    ...proposal,
    expectedVersion: z.number().int().positive(),
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    key: proposalOperationKey,
    visibility: z.enum(["public", "private"]),
    acknowledged: z.literal(true),
  }),
  retry_project_issue: z.strictObject({
    ...proposal,
    operationId: z.string().min(1).max(100),
  }),
};
