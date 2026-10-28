import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  try {
    const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
    const result = await (
      await backend()
    ).query(api.posts.recent, {
      organizationId: (await params).org as Id<"organizations">,
      cursor,
    });
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      { error: "Posts unavailable." },
      { status: 404, headers },
    );
  }
}
