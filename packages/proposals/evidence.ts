import schema from "../../contracts/source-proposal-v2.schema.json";
import { validator } from "../contracts/validator.mjs";
import { containsSecret } from "../policy/secrets.mjs";
import { validateEvidenceRegistry } from "../sources/evidence";
import type { EvidenceRecord, SourceRevision } from "../sources/types";
import type { z } from "zod";

export const sourceProposalSchema = schema;
export type InsightCitation = {
  kind: string;
  id: string;
  startMs: number | null;
  endMs: number | null;
};
export type SourceProposal = {
  schemaVersion: "2.0.0";
  sourceId: string;
  sourceRevisionId: string;
  sourceContentHash: string;
  repositoryId: string;
  baseSha: string;
  profileVersion: number;
  insightIds: string[];
  disposition:
    | "relevant"
    | "no_fit"
    | "already_implemented"
    | "unsupported_claim"
    | "needs_context"
    | "defer";
  title: string;
  currentProblem: string;
  repositoryEvidence: {
    path: string;
    startLine: number;
    endLine: number;
    observation: string;
  }[];
  sourceEvidence: InsightCitation[];
  proposedChange: string | null;
  benefitHypothesis: string | null;
  risks: string[];
  nonGoals: string[];
  acceptanceCriteria: string[];
  verificationNeeds: string[];
};
export const sourceProposalOutput = validator(
  schema,
) as z.ZodType<SourceProposal>;
export type TypedProposalContext = {
  sourceId: string;
  sourceRevisionId: string;
  sourceContentHash: string;
  revision: SourceRevision;
  evidence: EvidenceRecord[];
  // Supply the exact current server-selected subset, never model-selected input.
  insights: { id: string; evidence: InsightCitation[] }[];
};
const citationKey = (ref: InsightCitation) =>
  JSON.stringify([ref.kind, ref.id, ref.startMs, ref.endMs]);
export async function validateTypedProposal(
  input: unknown,
  context: TypedProposalContext,
) {
  const detail = sourceProposalOutput.parse(input);
  const registry = await validateEvidenceRegistry(
    context.revision,
    context.evidence,
  );
  if (
    detail.sourceId !== context.sourceId ||
    detail.sourceRevisionId !== context.sourceRevisionId ||
    detail.sourceContentHash !== context.sourceContentHash ||
    context.sourceContentHash !== registry.revision.contentHash ||
    containsSecret(JSON.stringify(detail))
  )
    throw Error("INVALID_EVIDENCE: Proposal source revision changed.");
  const ids = detail.insightIds as string[];
  if (
    new Set(ids).size !== ids.length ||
    new Set(context.insights.map((i) => i.id)).size !==
      context.insights.length ||
    ids.some((id) => !context.insights.some((i) => i.id === id))
  )
    throw Error("INVALID_EVIDENCE: Unknown or duplicate selected insight.");
  const permitted = new Set(
    context.insights
      .filter((i) => ids.includes(i.id))
      .flatMap((i) => i.evidence.map(citationKey)),
  );
  for (const ref of detail.sourceEvidence as InsightCitation[]) {
    if (
      ref.startMs !== null ||
      ref.endMs !== null ||
      !registry.evidence.some(
        (record) => record.id === ref.id && record.kind === ref.kind,
      ) ||
      !permitted.has(citationKey(ref))
    )
      throw Error("INVALID_EVIDENCE: Unknown or excluded proposal citation.");
  }
  return detail;
}
