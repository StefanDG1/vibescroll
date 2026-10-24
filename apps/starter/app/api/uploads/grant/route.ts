import { randomUUID } from "node:crypto";
import { backend, api } from "@/lib/backend";
import { allowedRequestOrigin } from "@/lib/request-origin";
import { signedUploadObject } from "../../../../../../packages/providers/storage";
import type { Id } from "../../../../../../convex/_generated/dataModel";
export async function POST(req: Request) {
  if (!allowedRequestOrigin(req))
    return Response.json({ error: "Origin denied." }, { status: 403 });
  try {
    const { organizationId, size, type } = await req.json();
    const key = `${organizationId}/${randomUUID()}`;
    const url = signedUploadObject(key, { size, type }, 300);
    await (
      await backend()
    ).mutation(api.assets.grant, {
      organizationId: organizationId as Id<"organizations">,
      key,
      size,
      type,
    });
    return Response.json(
      { url, key },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Private upload unavailable. Configure EU storage and sign in to your workspace.",
      },
      { status: 503 },
    );
  }
}
