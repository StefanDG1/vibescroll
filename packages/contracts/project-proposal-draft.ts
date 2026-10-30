import { saveProjectProposalInput } from "./chat-proposals";
import { canonicalJson } from "./canonical-json.mjs";
import { socialHash } from "../social/contracts";

/** Identical explicit drafts reopen across retries/reloads instead of creating duplicates. */
export async function projectProposalDraft(input: {
  sourceId: string;
  projectId: string;
  analysisVersionId: string;
  insightId: string;
  contextHash: string;
  title: string;
  goal: string;
  change: string;
}) {
  const request = {
    sourceId: input.sourceId,
    projectId: input.projectId,
    analysisVersionId: input.analysisVersionId,
    insightIds: [input.insightId],
    contextHash: input.contextHash,
    expectedVersion: 0,
    body: {
      title: input.title.trim(),
      disposition: "needs_context" as const,
      currentProblem: input.goal.trim(),
      proposedChange: input.change.trim() || null,
      benefitHypothesis: null,
      risks: [],
      nonGoals: [],
      acceptanceCriteria: [],
      verificationNeeds: [
        "Inspect the current project code before approving implementation.",
      ],
    },
  };
  const parsed = saveProjectProposalInput.parse({
    ...request,
    key: "validation-only",
  });
  const { key: _key, ...normalized } = parsed;
  return saveProjectProposalInput.parse({
    ...normalized,
    key: `draft_${(await socialHash(canonicalJson(normalized))).slice(0, 58)}`,
  });
}
