import { getVercelOidcToken } from "@vercel/oidc";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { verifySandboxRequest } from "../../../../../../packages/policy/sandbox-broker";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const denied = () =>
    Response.json({ error: "Unavailable." }, { status: 403, headers });
  if (
    process.env.SANDBOX_BRIDGE_ENABLED !== "true" ||
    process.env.RESTORE_LOCK === "true" ||
    request.headers.has("Origin") ||
    request.headers.get("Content-Type") !== "application/json"
  )
    return denied();
  try {
    const reader = request.body?.getReader();
    if (!reader) return denied();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 256) return denied();
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const body = new TextDecoder().decode(Buffer.concat(chunks));
    const signature = request.headers.get("X-Vibe-Signature") ?? "";
    if (
      !(await verifySandboxRequest(
        body,
        signature,
        process.env.SANDBOX_BRIDGE_SECRET ?? "",
      ))
    )
      return denied();
    if (
      !process.env.NEXT_PUBLIC_CONVEX_URL ||
      !process.env.SANDBOX_TEAM_ID ||
      !process.env.SANDBOX_PROJECT_ID
    )
      return denied();
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
    const authorized = await client.mutation(api.sandboxBroker.consume, {
      body,
      signature,
    });
    if (!authorized) return denied();
    const token = await getVercelOidcToken();
    return Response.json(
      {
        token,
        teamId: process.env.SANDBOX_TEAM_ID,
        projectId: process.env.SANDBOX_PROJECT_ID,
        ...(authorized !== true
          ? {
              snapshots: authorized.snapshots,
              snapshotAuthorities: authorized.snapshotAuthorities,
            }
          : {}),
      },
      { headers },
    );
  } catch {
    return denied();
  }
}
