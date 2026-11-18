import { localSnapshotEnabled } from "@/lib/local-snapshot-mode";
import { backend, api } from "@/lib/backend";
import { sourceUnavailable, workspaceAccessLost } from "@/lib/workspace-access";
import { unstable_rethrow } from "next/navigation";
import { postTopics, suggestProjects } from "@/lib/project-suggestions";
import { feedInsightEvidence, type FeedDetail } from "@/lib/home-feed";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { postDisplayTitle } from "../../../../../../packages/sources/display";
import { postThumbnailCandidates } from "../../../../../../packages/sources/thumbnail";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

/** A normal-session, read-only projection. No model, source acquisition or credit write. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!organizationId)
      return Response.json({ error: "Post unavailable." }, { status: 404, headers });
    const client = await backend();
    const id = (await params).id as Id<"sources">;
    const [source, projects, recommendations] = await Promise.all([
      client.query(api.product.detail, {
        id,
        organizationId: organizationId as Id<"organizations">,
      }),
      client.query(api.product.repositories, {
        organizationId: organizationId as Id<"organizations">,
      }),
      client
        .query(api.projectRecommendations.read, {
          organizationId: organizationId as Id<"organizations">,
          sourceId: id,
        })
        .catch(() => null),
    ]);
    if (!source || source.state !== "ready")
      return Response.json({ error: "Post unavailable." }, { status: 404, headers });
    const detail: FeedDetail = {
      id: source._id,
      generation: source.generation,
      title: postDisplayTitle(source),
      authorName: source.linkPreview?.authorName ?? null,
      url: source.url ?? null,
      summary: source.summary ?? "",
      durationMs:
        source.linkPreview?.durationSeconds == null
          ? null
          : Math.round(source.linkPreview.durationSeconds * 1000),
      categoryKeys: postTopics(source),
      thumbnailAssetIds: postThumbnailCandidates(source),
      analysisVersionId: source.analysisVersion?.id ?? null,
      insights: (source.analysis?.insights ?? []).map((insight: any) => ({
        id: insight.id,
        title: insight.title,
        claim: insight.claim,
        icon: insight.icon,
        categories: insight.categories,
        ...feedInsightEvidence(source, insight.evidence),
      })),
      proposals: (source.proposals ?? [])
        .sort(
          (a: any, b: any) =>
            (b.updatedAt ?? 0) - (a.updatedAt ?? 0) ||
            String(a._id).localeCompare(String(b._id)),
        )
        .slice(0, 20)
        .map((proposal: any) => ({
          id: proposal._id,
          title: proposal.title,
          projectId: proposal.repositoryId,
          projectName:
            projects.find((project) => project._id === proposal.repositoryId)
              ?.fullName ?? "Project",
          version: proposal.version,
          insightIds:
            proposal.detail?.insightIds ??
            proposal.references
              ?.map((reference: any) => reference.insightId)
              .filter(Boolean) ??
            [],
          review: proposal.review,
          disposition: proposal.disposition,
          currentProblem: proposal.detail?.currentProblem,
          steps: proposal.detail?.steps,
          proposedChange: proposal.detail?.proposedChange,
          acceptanceCriteria: proposal.detail?.acceptanceCriteria ?? [],
        })),
      suggestions: recommendations ?? suggestProjects(source, projects),
      allProjects: projects.map((project) => ({
        id: project._id,
        name: project.fullName,
      })),
      projects: projects
        .filter(
          (project) =>
            project.enabled &&
            project.confirmed &&
            project.status === "connected",
        )
        .map((project) => ({ id: project._id, name: project.fullName })),
    };
    if (localSnapshotEnabled(request.headers.get("host"))) {
      const { localFeedEngagement } = await import("@/lib/local-snapshot");
      detail.engagement = localFeedEngagement(id);
    }
    return Response.json(detail, { headers });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json(
      { error: "Post unavailable." },
      { status: workspaceAccessLost(error) ? 403 : sourceUnavailable(error) ? 404 : 503, headers },
    );
  }
}
