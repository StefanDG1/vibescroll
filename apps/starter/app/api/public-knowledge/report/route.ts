import { NextResponse } from "next/server";
import { allowedRequestOrigin } from "@/lib/request-origin";
import { publicWebClient } from "@/lib/public-knowledge";
import { publicSlug } from "@/lib/public-knowledge-display";
import { api } from "../../../../../../convex/_generated/api";
import { readAssistantBody } from "../../../../../../packages/policy/assistant-http";
export async function POST(request: Request) {
  if (!allowedRequestOrigin(request))
    return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const client = publicWebClient();
  if (!client)
    return NextResponse.json({ error: "POLICY_BLOCKED" }, { status: 503 });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const body = await readAssistantBody(request, 1024);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).sort().join(",") !== "key,reason,slug"
    )
      throw Error();
    const value = body as Record<string, unknown>;
    if (
      typeof value.slug !== "string" ||
      !publicSlug(value.slug) ||
      typeof value.key !== "string" ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(value.key) ||
      typeof value.reason !== "string" ||
      !["copyright", "privacy", "inaccuracy", "abuse"].includes(value.reason)
    )
      throw Error();
    const result = await client.mutation(api.publicKnowledge.report, {
      slug: value.slug,
      key: value.key,
      reason: value.reason as "copyright" | "privacy" | "inaccuracy" | "abuse",
    });
    return NextResponse.json(
      { received: result.received },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "REPORT_UNAVAILABLE" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
