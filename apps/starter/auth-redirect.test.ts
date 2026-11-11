import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({
  read: vi.fn(),
  action: vi.fn(),
  query: vi.fn(),
  token: vi.fn(),
}));
vi.mock("@workos-inc/authkit-nextjs", async (original) => ({
  ...(await original<typeof import("@workos-inc/authkit-nextjs")>()),
  withAuth: session.read,
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth = session.token;
    action = session.action;
    query = session.query;
  },
}));
let proxy: typeof import("./proxy").default;
beforeAll(async () => {
  for (const [name, value] of Object.entries({
    WORKOS_CLIENT_ID: "client_onboarding_synthetic",
    WORKOS_API_KEY: "sk_test_synthetic_not_a_credential",
    WORKOS_COOKIE_PASSWORD: "synthetic-cookie-password-for-tests-only-32",
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://auth-test.invalid/callback",
    WORKOS_COOKIE_NAME: "__Host-launchproof-test",
    APP_URL: "https://auth-test.invalid",
    NEXT_PUBLIC_CONVEX_URL: "https://synthetic.convex.cloud",
  }))
    vi.stubEnv(name, value);
  vi.stubEnv("WORKOS_COOKIE_DOMAIN", "");
  proxy = (await import("./proxy")).default;
});
afterAll(() => vi.unstubAllEnvs());
const event = {} as NextFetchEvent;

describe("private-page authentication redirects", () => {
  it("runs the authentication proxy for every API route using the authenticated backend", async () => {
    const { config } = await import("./proxy");
    const root = "apps/starter/app";
    function routes(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? routes(join(directory, entry.name))
          : entry.name === "route.ts"
            ? [join(directory, entry.name)]
            : [],
      );
    }
    const privateRoutes = routes(join(root, "api")).filter((file) =>
      /\bbackend\(|\bworkspaceData\(/.test(readFileSync(file, "utf8")),
    );
    expect(privateRoutes.length).toBeGreaterThan(8);
    for (const file of privateRoutes) {
      const path =
        "/" +
        relative(root, file)
          .replaceAll("\\", "/")
          .replace(/\/route\.ts$/, "")
          .replace(/\[[^/]+\]/g, "synthetic-id");
      expect(
        unstable_doesMiddlewareMatch({
          config,
          nextConfig: {},
          url: `https://auth-test.invalid${path}`,
        }),
        path,
      ).toBe(true);
    }
    for (const path of ["/mcp", "/api/health", "/help/work-cloud-text-review"])
      expect(
        unstable_doesMiddlewareMatch({
          config,
          nextConfig: {},
          url: `https://auth-test.invalid${path}`,
        }),
        path,
      ).toBe(false);
  });
  it("preserves POST bodies for host adapters that reuse the middleware request", async () => {
    const body = JSON.stringify({
      operation: "importLinks",
      args: { text: "Synthetic Saved metadata" },
    });
    const request = new NextRequest("https://auth-test.invalid/api/product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://auth-test.invalid",
      },
      body,
    });
    await proxy(request, event);
    expect(request.bodyUsed).toBe(false);
    expect(await request.text()).toBe(body);
  });
  it.each([
    "/app",
    "/account",
    "/app/workspace/orders",
    "/join/invite",
    "/api/posts/workspace",
    "/api/accounting/settlements",
  ])("starts PKCE in the proxy for an anonymous %s request", async (path) => {
    const response = await proxy(
      new NextRequest(`https://auth-test.invalid${path}`, {
        headers: { accept: "text/html" },
      }),
      event,
    );
    if (!response) throw new Error("Expected a response");
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.hostname).toBe("api.workos.com");
    expect(location.searchParams.get("client_id")).toBe(
      "client_onboarding_synthetic",
    );
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://auth-test.invalid/callback",
    );
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).not.toContain("Domain=");
  });
  it.each(["/sign-in", "/sign-up", "/callback"])(
    "allows %s to reach its cookie-writing route handler without a loop",
    async (path) => {
      const response = await proxy(
        new NextRequest(`https://auth-test.invalid${path}`, {
          headers: { accept: "text/html" },
        }),
        event,
      );
      if (!response) throw new Error("Expected a response");
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );
  it("restarts an invalid browser session before rendering", async () => {
    const response = await proxy(
      new NextRequest("https://auth-test.invalid/account", {
        headers: {
          accept: "text/html",
          cookie: "__Host-launchproof-test=invalid-session",
        },
      }),
      event,
    );
    if (!response) throw new Error("Expected a response");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("api.workos.com");
  });
  it("does not overwrite PKCE cookies for a prefetched private page", async () => {
    const response = await proxy(
      new NextRequest("https://auth-test.invalid/app", {
        headers: { accept: "text/html", RSC: "1", "Next-Router-Prefetch": "1" },
      }),
      event,
    );
    if (!response) throw new Error("Expected a response");
    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("redirects a missing server-render session to the local handler without requesting an SDK cookie write", async () => {
    session.read.mockImplementation(async (options) => {
      if (options?.ensureSignedIn)
        throw new Error("Cookies cannot be modified during rendering");
      return { user: null };
    });
    const { backend } = await import("./lib/backend");
    try {
      await backend();
      throw new Error("Expected redirect");
    } catch (error) {
      expect((error as { digest?: string }).digest).toContain(
        "NEXT_REDIRECT;replace;/sign-in;307;",
      );
    }
    expect(session.action).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "bootstraps a signed-in provider profile only when freshness requires it: %s",
    async (required) => {
      session.action.mockClear();
      session.query.mockResolvedValue(required);
      session.read.mockResolvedValue({
        user: { id: "user_synthetic" },
        accessToken: "synthetic-jwt",
      });
      const { backend } = await import("./lib/backend");
      await backend();
      expect(session.action).toHaveBeenCalledTimes(required ? 1 : 0);
      expect(session.token).toHaveBeenCalledWith("synthetic-jwt");
    },
  );
});
