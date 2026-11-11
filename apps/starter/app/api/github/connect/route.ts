import { NextRequest, NextResponse } from "next/server";
import { backend, api } from "@/lib/backend";
export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("organizationId");
  if (!organizationId || !process.env.GITHUB_APP_CLIENT_ID)
    return NextResponse.json(
      { error: "GitHub setup is incomplete." },
      { status: 503 },
    );
  const client = await backend();
  const state = await client.mutation(api.githubLinks.begin, {
    organizationId: organizationId as any,
  });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_APP_CLIENT_ID);
  url.searchParams.set("state", state);
  url.searchParams.set(
    "redirect_uri",
    new URL("/api/github/callback", req.url).href,
  );
  const response = NextResponse.redirect(url);
  response.cookies.set(
    "vibe-github-link",
    JSON.stringify({
      state,
      organizationId,
      onboarding: req.nextUrl.searchParams.get("returnTo") === "onboarding",
    }),
    {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      maxAge: 600,
      path: "/api/github",
    },
  );
  return response;
}
