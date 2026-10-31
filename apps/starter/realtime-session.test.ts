import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/backend", () => ({ configured: () => true }));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: async () =>
    state.signedIn
      ? {
          user: { id: "synthetic-owner" },
          accessToken: "synthetic-short-lived-user-token",
        }
      : { user: null },
}));
import { POST } from "./app/api/realtime/session/route";
afterEach(() => {
  vi.unstubAllEnvs();
  state.signedIn = true;
});
it("returns only the current user's session without caching, and refuses cross-origin requests or logged-out sessions", async () => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://synthetic.convex.cloud");
  const request = (origin: string) =>
    new NextRequest("https://app.example.test/api/realtime/session", {
      method: "POST",
      headers: { Origin: origin },
    });
  expect((await POST(request("https://evil.example.test"))).status).toBe(403);
  const response = await POST(request("https://app.example.test"));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    url: "https://synthetic.convex.cloud",
    token: "synthetic-short-lived-user-token",
  });
  state.signedIn = false;
  expect((await POST(request("https://app.example.test"))).status).toBe(401);
});
