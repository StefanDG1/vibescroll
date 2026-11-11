import { NextRequest, NextResponse } from "next/server";
import { backend, api } from "@/lib/backend";
export async function GET(req: NextRequest) {
  let organizationId = "";
  let onboarding = false;
  try {
    const link = JSON.parse(
      req.cookies.get("vibe-github-link")?.value ?? "null",
    );
    const state = req.nextUrl.searchParams.get("state"),
      code = req.nextUrl.searchParams.get("code");
    onboarding = link?.onboarding === true;
    if (!link || state !== link.state || !code)
      throw Error("Invalid authorization state");
    organizationId = link.organizationId;
    const client = await backend();
    await client.action(api.githubOAuth.complete, {
      organizationId: organizationId as any,
      state: state!,
      code,
    });
    const response = NextResponse.redirect(
      new URL(
        onboarding
          ? "/onboarding/resume?github=connected"
          : `/app/${organizationId}/projects?github=connected`,
        req.url,
      ),
    );
    response.cookies.delete({ name: "vibe-github-link", path: "/api/github" });
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL(
        onboarding
          ? "/onboarding/resume?github=failed"
          : organizationId
            ? `/app/${organizationId}/connections?github=failed`
            : "/app?github=failed",
        req.url,
      ),
    );
    response.cookies.delete({ name: "vibe-github-link", path: "/api/github" });
    return response;
  }
}
