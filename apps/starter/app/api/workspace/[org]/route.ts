import { workspaceData } from "@/lib/workspace-data";
import { workspaceAccessLost } from "@/lib/workspace-access";
import { unstable_rethrow } from "next/navigation";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  try {
    const q = new URL(request.url).searchParams;
    const data = await workspaceData({
      org: (await params).org,
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
  } catch (error) {
    unstable_rethrow(error);
    return Response.json(
      { error: "Workspace unavailable." },
      {
        status: workspaceAccessLost(error) ? 403 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
