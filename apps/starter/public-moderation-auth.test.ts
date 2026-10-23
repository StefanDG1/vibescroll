import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";
import { api } from "../../convex/_generated/api";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  backend: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: state.auth }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("@/components/header", () => ({ Header: () => null }));
vi.mock("@/components/public-moderation", () => ({
  PublicModeration: () => null,
}));
vi.mock("@/lib/backend", () => ({
  api,
  configured: () => true,
  backend: state.backend,
}));
import Page from "./app/app/moderation/page";
import { POST } from "./app/api/product/route";
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://moderation.example.test");
  state.auth.mockResolvedValue({
    user: { id: "synthetic-moderator" },
    accessToken: "synthetic-token",
  });
  state.backend.mockResolvedValue({
    query: state.query,
    mutation: state.mutation,
  });
  state.query.mockResolvedValue([]);
  state.mutation.mockResolvedValue({ reviewed: true });
  state.redirect.mockImplementation((target) => {
    throw new Error(`REDIRECT:${target}`);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
function request(
  operation: string,
  args = {},
  origin = "https://moderation.example.test",
) {
  return new NextRequest("https://moderation.example.test/api/product", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify({ operation, args }),
  });
}
it("redirects an anonymous moderator page before rendering and never loads reports during server render", async () => {
  state.auth.mockResolvedValue({ user: null });
  await expect(Page()).rejects.toThrow(
    "REDIRECT:/sign-in?returnTo=%2Fapp%2Fmoderation",
  );
  expect(state.backend).not.toHaveBeenCalled();
  state.auth.mockResolvedValue({ user: { id: "synthetic" } });
  expect(await Page()).toBeTruthy();
  expect(state.query).not.toHaveBeenCalled();
});
it("denies anonymous and cross-origin moderation API access before backend dispatch", async () => {
  state.auth.mockResolvedValue({ user: null });
  expect((await POST(request("publicModerationReports"))).status).toBe(401);
  expect(
    (
      await POST(
        request("publicModerateReport", {}, "https://foreign.example.test"),
      )
    ).status,
  ).toBe(403);
  expect(state.backend).not.toHaveBeenCalled();
});
it.each([
  ["publicModerationReports", {}, "publicKnowledge:reports", "query"],
  [
    "publicModerationBlocks",
    { cursor: null },
    "publicKnowledge:moderationBlocks",
    "query",
  ],
  [
    "publicReleaseModerationBlock",
    {
      id: "block-1",
      expectedVersion: 2,
      note: "Reviewed evidence",
      explicitlyApproved: true,
    },
    "publicKnowledge:releaseModerationBlock",
    "mutation",
  ],
  [
    "publicRepairLegacyModeration",
    {
      editionId: "edition-1",
      expectedEditionVersion: 2,
      canonicalHash: "a".repeat(64),
      note: "Recovered identity",
      explicitlyApproved: true,
    },
    "publicKnowledge:repairLegacyModeration",
    "mutation",
  ],
  [
    "publicModerationInspect",
    { id: "report-1" },
    "publicKnowledge:inspectReport",
    "query",
  ],
  [
    "publicModerateReport",
    { reportId: "report-1", action: "remove" },
    "publicKnowledge:moderate",
    "mutation",
  ],
] as const)(
  "dispatches %s through the authenticated server client only",
  async (operation, args, name, method) => {
    const result = await POST(request(operation, args));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(state.backend).toHaveBeenCalledWith(
      await state.auth.mock.results[0].value,
    );
    const calls = state[method].mock.calls;
    expect(calls).toHaveLength(1);
    expect(getFunctionName(calls[0][0])).toBe(name);
    expect(calls[0][1]).toEqual(args);
  },
);
it.each([
  ["FORBIDDEN: private allowlist diagnostic", "FORBIDDEN"],
  ["Sign in again before changing a sensitive connection.", "REAUTH_REQUIRED"],
])(
  "preserves backend moderation refusals without leaking diagnostics",
  async (message, code) => {
    state.mutation.mockRejectedValue(
      Object.assign(new Error("wrapped"), { data: message }),
    );
    const result = await POST(
      request("publicModerateReport", {
        reportId: "report-1",
        action: "dismiss",
      }),
    );
    const body = await result.json();
    expect(result.status).toBe(400);
    expect(body.code).toBe(code);
    expect(body.error).not.toContain("private allowlist diagnostic");
    expect(state.mutation).toHaveBeenCalledTimes(1);
  },
);
