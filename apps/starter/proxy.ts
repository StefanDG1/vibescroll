import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { privateContentPolicy } from "./lib/security";
import { NextResponse, NextRequest, type NextFetchEvent } from "next/server";
const auth = authkitProxy({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/sign-in", "/sign-up", "/callback"],
  },
});
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (
    !process.env.WORKOS_CLIENT_ID ||
    !process.env.WORKOS_API_KEY ||
    !process.env.WORKOS_COOKIE_PASSWORD
  ) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const policy = privateContentPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  const headers = new Headers(request.headers);
  // Always replace caller-supplied nonce and CSP values.
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  // Preserve the host adapter's original request and its body metadata.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  const response =
    (await auth(request, event)) ?? NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/app/:path*",
    "/account/:path*",
    "/join/:path*",
    "/sign-in",
    "/sign-up",
    "/callback",
    "/api/product",
    "/api/realtime/:path*",
    "/api/source/:path*",
    "/api/uploads/:path*",
    "/api/evidence/:path*",
    "/api/workspace/:path*",
    "/api/library/:path*",
    "/api/posts/:path*",
    "/api/accounting/:path*",
    "/api/github/:path*",
  ],
};
