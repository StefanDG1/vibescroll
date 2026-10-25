import {
  workspaceData,
  workspacePostProgress,
} from "../../../../lib/workspace-data";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  try {
    const q = new URL(request.url).searchParams;
    const org = (await params).org;
    const data =
      q.get("view") === "post-progress"
        ? await workspacePostProgress(org, q.getAll("sourceIds"))
        : await workspaceData({
            org,
            view: q.get("view") ?? "full",
            search: q.get("q") ?? "",
            filter: q.get("state") ?? "",
            category: q.get("category") ?? "",
            sort: q.get("sort") ?? "newest",
            sourceId: q.get("sourceId") ?? undefined,
            proposalId: q.get("proposalId") ?? undefined,
            sharedSourceId: q.get("sharedSourceId") ?? undefined,
            sharedGrantId: q.get("sharedGrantId") ?? undefined,
            compactHome: q.get("homeMode") === "compact",
          });
    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return Response.json(
      { error: "Workspace unavailable." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
