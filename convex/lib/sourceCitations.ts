import { resultRetained } from "../../packages/contracts/result-retention";
import { sourceRetained } from "./sourceAuthority";
import { currentOrderedSource } from "./workCloudMediaSource";
import { socialCitation } from "../../packages/social/analysis";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { retainedSourceRevision } from "./sourceAuthority";
import { ensure } from "../../packages/policy";
import { typedCitationSummary } from "../../packages/sources/citations";
import type { InsightCitation } from "../../packages/proposals/evidence";
import { sourcePolicyCurrent } from "./sourcePolicy";
import { queryRead } from "./knowledgeReadContext";
import { sourceInsightOutput } from "../../packages/contracts";
import {
  cloudImport,
  cloudSourceFamily,
  cloudSourceEvidence,
  cloudSourceVersion,
} from "./cloudCatalog";
import { neutralCloudObservations } from "../../packages/contracts/cloud-catalog";
import {
  isServicePreparedEvidence,
  servicePreparedEvidence,
} from "../../packages/contracts/prepared-evidence";
import {
  preparedEvidenceForSource,
  verifyPrivateEvidenceAssets,
} from "./preparedEvidenceAccess";

// Call only after current membership and the exact assistant/team grant passed.
export async function sharedTypedCitations(
  ctx: QueryCtx,
  source: Doc<"sources">,
  versionId?: Id<"analysisVersions">,
) {
  return queryRead(
    ctx,
    `shared-source-citations:${source._id}:${source.generation}:${source.updatedAt}:${versionId ?? source.selectedAnalysisVersionId ?? "selected"}`,
    async () => {
      if (source.state !== "ready") return null;
      const selectedId = versionId ?? source.selectedAnalysisVersionId;
      const selected = selectedId ? await ctx.db.get(selectedId) : null;
      const selectedEvidence = selected
        ? await ctx.db.get(selected.evidenceId)
        : null;
      if (
        selected &&
        selectedEvidence &&
        isServicePreparedEvidence(selectedEvidence.prepared)
      ) {
        ensure(
          selected.owner === "private" &&
            selected.organizationId === source.organizationId &&
            selected.sourceId === source._id &&
            selected.state === "ready" &&
            selected.output &&
            resultRetained(selected),
          "SOURCE_UNAVAILABLE",
          "This private analysis version changed.",
        );
        const evidence = await preparedEvidenceForSource(
          ctx,
          source,
          selected.evidenceId,
        );
        await verifyPrivateEvidenceAssets(ctx, source, evidence);
        const records = neutralCloudObservations(
          servicePreparedEvidence.parse(evidence.prepared).evidence,
        );
        return {
          sourceRevisionId: null,
          sourceContentHash: evidence.revisionHash,
          coverage: {
            method: "ordered_media",
            retrieved: evidence.frames.length,
            omitted: 0,
            omissions: [
              "Service-prepared transcript and sampled source screenshots. Sampling does not establish complete visual coverage or independent claim verification.",
            ],
          },
          summarize: (references: InsightCitation[]) =>
            references
              .slice(0, 10)
              .map((ref) =>
                socialCitation(
                  ref as Parameters<typeof socialCitation>[0],
                  records,
                ),
              ),
        };
      }
      const layer = source.publicImportId
        ? await ctx.db.get(source.publicImportId)
        : null;
      if (cloudImport(layer)) {
        await cloudSourceFamily(ctx, source);
        const id = versionId ?? source.selectedAnalysisVersionId;
        const version = id ? await ctx.db.get(id) : null;
        let shared;
        if (version?.owner === "private") {
          const attempt = version.attemptId
            ? await ctx.db.get(version.attemptId)
            : null;
          ensure(
            version.state === "ready" &&
              resultRetained(version) &&
              version.sourceId === source._id &&
              version.organizationId === source.organizationId &&
              attempt?.sourceId === source._id &&
              attempt.sourceGeneration === source.generation &&
              attempt.evidenceId === version.evidenceId &&
              attempt.resultVersionId === version._id &&
              attempt.state === "completed",
            "SOURCE_UNAVAILABLE",
            "This private candidate no longer matches its shared evidence.",
          );
          shared = await cloudSourceEvidence(ctx, source, version.evidenceId);
        } else shared = await cloudSourceVersion(ctx, source, id);
        const records = neutralCloudObservations(shared.prepared);
        return {
          sourceRevisionId: null,
          sourceContentHash: shared.prepared.sourceRevisionHash,
          coverage: {
            method: "ordered_media",
            retrieved: shared.prepared.frames.length,
            omitted: 0,
            omissions: [
              "Shared neutral evidence from authenticated host-reported analysis. Frames are sampled; model settings and provider retention are unverified.",
            ],
          },
          summarize: (evidence: InsightCitation[]) =>
            evidence
              .slice(0, 10)
              .map((ref) =>
                socialCitation(
                  ref as Parameters<typeof socialCitation>[0],
                  records,
                ),
              ),
        };
      }
      if (source.orderedMedia || source.analysis?.schemaVersion === "3.0.0") {
        ensure(
          sourceRetained(source.sourceRetentionUntil) &&
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
                    post.schemaVersion === "work-cloud-observed-media-v1"
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
