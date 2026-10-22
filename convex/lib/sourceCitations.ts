import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { retainedSourceRevision } from "./sourceAuthority";
import { ensure } from "../../packages/policy";
import { typedCitationSummary } from "../../packages/sources/citations";
import type { InsightCitation } from "../../packages/proposals/evidence";
import { sourcePolicyCurrent } from "./sourcePolicy";
import { queryRead } from "./knowledgeReadContext";
import { sourceInsightOutput } from "../../packages/contracts";

// Call only after current membership and the exact assistant/team grant passed.
export async function sharedTypedCitations(
  ctx: QueryCtx,
  source: Doc<"sources">,
) {
  return queryRead(
    ctx,
    `shared-source-citations:${source._id}:${source.generation}:${source.updatedAt}`,
    async () => {
      if (source.state !== "ready") return null;
      const typedRequired =
        source.currentRevisionId ||
        source.analysis?.schemaVersion === "2.0.0" ||
        source.sourceType === "github_repository" ||
        source.sourceType === "reddit_thread";
      if (!typedRequired) return null;
      ensure(
        source.currentRevisionId,
        "FORBIDDEN",
        "The cited source revision is unavailable or changed.",
      );
      const row = await ctx.db.get(source.currentRevisionId);
      const registry = row && (await retainedSourceRevision(ctx, row));
      ensure(
        row &&
          registry &&
          row.sourceId === source._id &&
          row.organizationId === source.organizationId &&
          row.generation === source.generation &&
          source.analysis?.schemaVersion === "2.0.0" &&
          source.analysis.sourceId === source._id &&
          source.analysis.processingRunId ===
            `${source._id}:${source.generation}` &&
          source.analysis.sourceRevisionId === row._id &&
          source.analysis.sourceContentHash === row.contentHash,
        "FORBIDDEN",
        "The cited source revision is unavailable or changed.",
      );
      ensure(
        sourcePolicyCurrent(registry.revision),
        "FORBIDDEN",
        "Source permission changed before retrieval.",
      );
      const analysis = sourceInsightOutput.parse(source.analysis) as {
        insights: { evidence: InsightCitation[] }[];
      };
      for (const insight of analysis.insights) {
        ensure(
          insight.evidence.length > 0,
          "FORBIDDEN",
          "A source claim has no current citation.",
        );
        for (const evidence of insight.evidence)
          typedCitationSummary(evidence, registry.evidence);
      }
      return {
        sourceRevisionId: row._id,
        sourceContentHash: row.contentHash,
        coverage: registry.revision.coverage,
        summarize: (evidence: InsightCitation[]) =>
          evidence
            .slice(0, 10)
            .map((e) => typedCitationSummary(e, registry.evidence)),
      };
    },
  );
}
