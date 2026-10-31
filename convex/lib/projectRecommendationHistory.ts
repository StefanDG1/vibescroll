import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { containsSecret } from "../../packages/policy";
import { chatProposalDetail } from "../../packages/contracts/chat-proposals";
import { queryRead } from "./knowledgeReadContext";

/** Caller already authorized this exact retained post and repository. */
export async function samePostPlans(
  ctx: QueryCtx,
  source: Doc<"sources">,
  project: Doc<"repositories">,
  analysisVersionId: string | null,
) {
  const rows = await queryRead(
    ctx,
    `recommendation-source-plans:${source._id}`,
    () =>
      ctx.db
        .query("proposals")
        .withIndex("by_source", (q) => q.eq("sourceId", source._id))
        .order("desc")
        .take(21),
  );
  return {
    limited: rows.length > 20,
    items: rows
      .slice(0, 20)
      .filter(
        (p) =>
          p.organizationId === source.organizationId &&
          p.repositoryId === project._id &&
          (p.references ?? []).every(
            (r) =>
              r.sourceId === source._id && r.generation === source.generation,
          ) &&
          !containsSecret(p.title),
      )
      .map((p) => {
        const parsed = chatProposalDetail.safeParse(p.detail);
        const detail = parsed.success ? parsed.data : null;
        const binding = detail?._chat.binding ?? null;
        const handoff = detail?.handoff;
        return {
          id: p._id,
          title: p.title.slice(0, 200),
          version: p.version,
          review: p.review,
          outcome: {
            githubIssueState: handoff?.githubIssue?.state ?? null,
            githubObservedAt: handoff?.githubIssue?.observedAt ?? null,
            issuePublicationConfirmed: !!handoff?.publication,
            modelReportedStatus: handoff?.reports.at(-1)?.status ?? null,
            measuredBenefit: null,
          },
          current: !!(
            binding &&
            binding.analysisVersionId === analysisVersionId &&
            binding.sourceGeneration === source.generation &&
            binding.sourceRevision === source.updatedAt &&
            p.baseSha === project.sha &&
            p.profileVersion === project.profileVersion &&
            binding.selectionVersion === (project.selectionVersion ?? 0)
          ),
        };
      }),
  };
}
