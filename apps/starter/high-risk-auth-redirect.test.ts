import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ConvexError } from "convex/values";
const state = vi.hoisted(() => ({
  mutation: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("navigation"), { url });
  }),
  signIn: vi.fn(async () => "https://provider.example/authorize"),
  referer: "https://example.test/account?section=privacy",
  deleteCookie: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ referer: state.referer }),
  cookies: async () => ({ delete: state.deleteCookie }),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  getSignInUrl: state.signIn,
  signOut: vi.fn(),
}));
vi.mock("@/lib/backend", () => ({
  backend: async () => ({ mutation: state.mutation }),
  api: {
    accounts: { deleteAccount: "deleteAccount" },
    organizations: { remove: "remove" },
  },
}));
import { deleteAccount, deleteOrganization } from "./app/actions";
import { GET } from "./app/sign-in/route";
beforeEach(() => {
  vi.clearAllMocks();
  state.mutation.mockRejectedValue(
    new ConvexError(
      "REAUTH_REQUIRED: Sign in again to confirm this high-risk action.",
    ),
  );
});
it.each(["account", "workspace"])(
  "redirects %s deletion directly to sign-in and preserves the return page without replay",
  async (kind) => {
    state.referer =
      kind === "account"
        ? "https://example.test/account?section=privacy"
        : "https://example.test/app/workspace/settings?section=delete";
    const d = new FormData();
    d.set("organizationId", "workspace");
    d.set("confirmation", "Synthetic");
    await expect(
      (kind === "account" ? deleteAccount : deleteOrganization)({}, d),
    ).rejects.toHaveProperty(
      "url",
      `/sign-in?reauth=true&returnTo=${encodeURIComponent(new URL(state.referer).pathname + new URL(state.referer).search)}`,
    );
    expect(state.mutation).toHaveBeenCalledOnce();
    expect(state.deleteCookie).not.toHaveBeenCalled();
  },
);
it.each(["/account?section=privacy", "/app/workspace/posts/source?version=2"])(
  "starts the official sign-in flow back to %s",
  async (returnTo) => {
    await expect(
      GET(
        new NextRequest(
          "https://example.test/sign-in?reauth=true&returnTo=" +
            encodeURIComponent(returnTo),
        ),
      ),
    ).rejects.toHaveProperty("url", "https://provider.example/authorize");
    expect(state.signIn).toHaveBeenCalledWith({ returnTo, maxAge: 300 });
  },
);
