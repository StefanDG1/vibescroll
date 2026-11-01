import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("@/lib/backend", () => ({
  backend: async () => mock,
  api: {
    organizations: { createPrivate: "personal", ensureDefault: "default" },
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
import Page from "./app/app/page";
afterEach(() => vi.resetAllMocks());
it("opens personal Pro billing even when the selected workspace is a team", async () => {
  mock.mutation.mockResolvedValue("my-personal-account");
  await expect(
    Page({
      searchParams: Promise.resolve({
        view: "billing",
        workspace: "team-account",
      }),
    }),
  ).rejects.toThrow("redirect:/app/my-personal-account/billing?tier=pro");
  expect(mock.mutation).toHaveBeenCalledExactlyOnceWith("personal", {});
});
it("keeps ordinary app entry on its selected workspace", async () => {
  mock.mutation.mockResolvedValue("team-account");
  await expect(
    Page({ searchParams: Promise.resolve({ workspace: "team-account" }) }),
  ).rejects.toThrow("redirect:/app/team-account");
  expect(mock.mutation).toHaveBeenCalledExactlyOnceWith("default", {
    preferredId: "team-account",
  });
});
