import { isCloudObservedMedia } from "../../packages/social/contracts";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { retainedSourceRevision, sourceRetained } from "./sourceAuthority";
import { ensure } from "../../packages/policy";
import { typedCitationSummary } from "../../packages/sources/citations";
import type { InsightCitation } from "../../packages/proposals/evidence";
import { sourcePolicyCurrent } from "./sourcePolicy";
import { queryRead } from "./knowledgeReadContext";
import { sourceInsightOutput } from "../../packages/contracts";
import { socialCitation } from "../../packages/social/analysis";
import { currentOrderedSource } from "./orderedSource";

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
      if (source.orderedMedia || source.analysis?.schemaVersion === "3.0.0") {
        ensure(
          sourceRetained(source) &&
            source.rightsAttested &&
            source.orderedMedia &&
            source.analysis?.schemaVersion === "3.0.0",
          "FORBIDDEN",
          "Ordered source rights or evidence changed.",
        );
        const validated = await currentOrderedSource(source);
        const post = validated.prepared.post;
        const omitted = new Set(
          post.assets
            .filter((asset) => !asset.inspected)
            .map((asset) => asset.index),
        );
        if (source.orderedPreparation?.generation === source.generation)
          for (const item of source.orderedPreparation.omissions)
            omitted.add(item.index);
        if (post.expectedAssetCount !== null)
          for (let index = 0; index < post.expectedAssetCount; index++)
            if (!post.assets.some((asset) => asset.index === index))
              omitted.add(index);
        return {
          sourceRevisionId: null,
          sourceContentHash: validated.prepared.post.revisionHash,
          coverage: {
            method: "ordered_media",
            retrieved: validated.prepared.post.assets.filter(
              (asset) => asset.inspected,
            ).length,
            omitted: omitted.size,
            omissions: [
              ...[...omitted]
                .sort((a, b) => a - b)
                .map(
                  (index) =>
                    `Child ${index + 1} was unavailable or not inspected.`,
                ),
              ...(post.coverage === "complete_manifest"
                ? []
                : [
                    isCloudObservedMedia(post)
                      ? "Private authenticated host-reported acquisition; sampled frames, model execution and provider retention are unverified."
                      : post.schemaVersion === "provided-media-v1"
                        ? "Some supplied files were unavailable or not inspected. The original post and publication date are unverified."
                        : "The provider's child manifest is incomplete or unknown.",
                  ]),
            ],
          },
          summarize: (evidence: InsightCitation[]) =>
            evidence
              .slice(0, 10)
              .map((ref) =>
                socialCitation(
                  ref as Parameters<typeof socialCitation>[0],
                  validated.prepared.evidence,
                ),
              ),
        };
      }
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
