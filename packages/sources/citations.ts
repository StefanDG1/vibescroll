import type { EvidenceRecord } from "./types";
import type { InsightCitation } from "../proposals/evidence";

// Sharing a clipped insight grants citation metadata, not the underlying excerpt.
// Keep this allowlist explicit rather than spreading a registry record.
export function typedCitationSummary(
  ref: InsightCitation,
  records: readonly EvidenceRecord[],
) {
  const record = records.find((r) => r.id === ref.id && r.kind === ref.kind);
  if (!record || ref.startMs !== null || ref.endMs !== null)
    throw Error("INVALID_EVIDENCE: Unknown typed citation.");
  const common = {
    id: record.id,
    kind: record.kind,
    startMs: null,
    endMs: null,
    canonicalUrl: record.canonicalUrl,
    observedAt: record.observedAt,
    excerptHash: record.excerptHash,
  };
  if (record.kind === "github_file")
    return {
      ...common,
      repositoryId: record.repositoryId,
      repository: record.repository,
      commitSha: record.commitSha,
      path: record.path,
      startLine: record.startLine,
      endLine: record.endLine,
    };
  if (record.kind === "supplied_text")
    return {
      ...common,
      originalUrl: record.originalUrl,
      startOffset: record.startOffset,
      endOffset: record.endOffset,
      provenance: record.provenance,
    };
  return {
    ...common,
    postId: record.postId,
    itemId: record.itemId,
    parentId: record.parentId,
    author: record.author,
    role: record.role,
    availability: record.availability,
    createdAt: record.createdAt,
    editedAt: record.editedAt,
  };
}
