import { backend, api } from "@/lib/backend";
import { sourceUnavailable, workspaceAccessLost } from "@/lib/workspace-access";
import { unstable_rethrow } from "next/navigation";
import type { Id } from "../../../../../../convex/_generated/dataModel";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await (
        await backend()
      ).query(api.product.detail, {
        id: (await params).id as Id<"sources">,
        organizationId: (new URL(request.url).searchParams.get(
          "organizationId",
        ) || undefined) as Id<"organizations"> | undefined,
      }),
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    unstable_rethrow(error);
    return Response.json(
      { error: "Source unavailable." },
      {
        status: workspaceAccessLost(error) ? 403 : sourceUnavailable(error) ? 404 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
