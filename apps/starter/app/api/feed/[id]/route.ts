import { backend, api } from "@/lib/backend";
import { postTopics, suggestProjects } from "@/lib/project-suggestions";
import type { FeedDetail } from "@/lib/home-feed";
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
    if (!organizationId) throw Error("Workspace required");
    const client = await backend();
    const [source, projects] = await Promise.all([
      client.query(api.product.detail, {
        id: (await params).id as Id<"sources">,
        organizationId: organizationId as Id<"organizations">,
      }),
      client.query(api.product.repositories, {
        organizationId: organizationId as Id<"organizations">,
      }),
    ]);
    if (!source || source.state !== "ready") throw Error("Post unavailable");
    const detail: FeedDetail = {
      id: source._id,
      generation: source.generation,
      title: postDisplayTitle(source),
      authorName: source.linkPreview?.authorName ?? null,
      url: source.url ?? null,
      summary: source.summary ?? "",
      categoryKeys: postTopics(source),
      thumbnailAssetIds: postThumbnailCandidates(source),
      analysisVersionId: source.analysisVersion?.id ?? null,
      insights: (source.analysis?.insights ?? []).map((insight: any) => ({
        id: insight.id,
        title: insight.title,
        claim: insight.claim,
        icon: insight.icon,
        categories: insight.categories,
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
      suggestions: suggestProjects(source, projects),
      projects: projects
        .filter((project) => project.enabled && project.confirmed)
        .map((project) => ({ id: project._id, name: project.fullName })),
    };
    return Response.json(detail, { headers });
  } catch {
    return Response.json(
      { error: "Post unavailable." },
      { status: 404, headers },
    );
  }
}
