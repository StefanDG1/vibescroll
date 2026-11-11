import { backend } from "@/lib/backend";
import { loadLibraryPage } from "@/lib/library-query";
import type { Id } from "../../../../../../convex/_generated/dataModel";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  try {
    const q = new URL(request.url).searchParams;
    const result = await loadLibraryPage(await backend(), {
      organizationId: (await params).org as Id<"organizations">,
      query: q.get("q") || undefined,
      state: q.get("state") || undefined,
      category: q.get("category") || undefined,
      sort: q.get("sort") || undefined,
      cursor: q.get("cursor") || undefined,
    });
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return Response.json(
      { error: "Library unavailable." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
