import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { configured } from "@/lib/backend";
import { allowedRequestOrigin } from "@/lib/request-origin";

// Return only this browser's existing, short-lived user token. Convex refreshes
// it through AuthKit; no server credential or assistant OAuth token is exposed.
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!allowedRequestOrigin(request) || !configured())
    return NextResponse.json(
      { error: "Session unavailable" },
      { status: 403, headers },
    );
  const session = await withAuth();
  if (!session.user || !session.accessToken)
    return NextResponse.json(
      { error: "Sign in to continue" },
      { status: 401, headers },
    );
  return NextResponse.json(
    { url: process.env.NEXT_PUBLIC_CONVEX_URL, token: session.accessToken },
    { headers },
  );
}
