import { z } from "zod";

export const limits = {
  page: 30,
  evidence: 12,
  topicsPerSource: 8,
  credits: 10,
  outputTokens: 2400,
  timeoutMs: 300000,
} as const;
export const reference = z.strictObject({
  sourceId: z.string().min(1).max(100),
  generation: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  insightId: z.string().min(1).max(120),
});
export const privateVariantReference = reference.extend({
  schemaVersion: z.literal("private-source-reference-v1"),
  runId: z.string().min(1).max(100),
  privateVersion: z.number().int().positive(),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const evaluationReference = z.union([
  reference,
  privateVariantReference,
]);
const text = z.string().min(1).max(1200);
export const synthesis = z.strictObject({
  explanation: text,
  claims: z
    .array(
      z.strictObject({ text, references: z.array(reference).min(1).max(12) }),
    )
    .max(12),
  relations: z
    .array(
      z.strictObject({
        kind: z.enum([
          "similar",
          "complementary",
          "conflicting",
          "useful_connection",
        ]),
        explanation: text,
        references: z.array(reference).min(2).max(12),
      }),
    )
    .max(12),
  uncertainty: z.string().max(1200),
});
export const evaluation = z.strictObject({
  disposition: z.enum([
    "relevant",
    "no_fit",
    "already_implemented",
    "unsupported_claim",
    "needs_context",
    "defer",
  ]),
  title: z.string().min(1).max(180),
  rationale: text,
  problem: text,
  approach: text,
  acceptance: z.array(text).min(1).max(8),
  tests: z.array(text).min(1).max(8),
  risks: z.array(text).max(8),
  alternatives: z.array(text).max(8),
  questions: z.array(text).max(8),
  references: z.array(reference).min(1).max(12),
  repositoryEvidence: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(300),
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive(),
        explanation: text,
      }),
    )
    .max(12),
});
export type Reference = z.infer<typeof reference>;
export type EvaluationReference = z.infer<typeof evaluationReference>;
// Canonical evaluation/synthesis schemas retain their original wire format.
export const privateEvaluation = evaluation.extend({
  references: z.array(evaluationReference).min(1).max(12),
});
export const evaluationGroup = z.strictObject({
  schemaVersion: z.literal("project-opportunity-group-v1"),
  opportunities: z.array(evaluation).min(1).max(5),
});
export const privateEvaluationGroup = evaluationGroup.extend({
  opportunities: z.array(privateEvaluation).min(1).max(5),
});
export const evaluationGroupJson = z.toJSONSchema(evaluationGroup);
export const privateEvaluationGroupJson = z.toJSONSchema(
  privateEvaluationGroup,
);
export const issueApproval = z.strictObject({
  id: z.string().min(1).max(100),
  version: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  visibility: z.enum(["public", "private"]),
  publicationRights: z.literal(true),
});
export const referenceKey = (r: EvaluationReference) => {
  const base = `${r.sourceId}:${r.generation}:${r.revision}:${r.insightId}`;
  return "schemaVersion" in r
    ? `private-source-reference-v1:${JSON.stringify([r.sourceId, r.generation, r.revision, r.insightId, r.runId, r.privateVersion, r.outputHash])}`
    : base;
};
export function assertReferences(
  output: { references: EvaluationReference[] }[],
  allowed: EvaluationReference[],
) {
  const keys = new Set(allowed.map(referenceKey));
  if (output.some((c) => c.references.some((r) => !keys.has(referenceKey(r)))))
    throw new Error("INVALID_EVIDENCE: Unknown or stale source reference.");
}
export const synthesisJson = z.toJSONSchema(synthesis);
export const evaluationJson = z.toJSONSchema(evaluation);
export const privateEvaluationJson = z.toJSONSchema(privateEvaluation);
export const processingVersion = "knowledge-v1.2";
