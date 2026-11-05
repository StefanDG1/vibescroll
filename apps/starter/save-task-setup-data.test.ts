import { afterEach, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./lib/backend", () => ({
  backend: async () => ({ query }),
  api: {
    organizations: { details: "organization" },
    posts: { recent: "posts" },
    aiPreferences: { read: "taskPreferences" },
    product: { libraryContext: "libraryContext" },
    categories: { list: "categories" },
  },
}));
import { workspaceData } from "./lib/workspace-data";
const organizationId = "workspace";
const preferences = {
  processingRoute: "work_cloud",
  workCloud: {
    available: true,
    configured: true,
    grantId: "grant",
    grantVersion: 12,
  },
};
afterEach(() => query.mockReset());
function mockReads() {
  query.mockImplementation(async (operation: string) => {
    if (operation === "organization")
      return { name: "Workspace", private: true, role: "owner" };
    if (operation === "posts")
      return {
        items: [{ id: "post", title: "Saved Reel", generation: 0 }],
        next: null,
      };
    if (operation === "taskPreferences") return preferences;
    if (operation === "libraryContext") return { workspaceName: "Workspace" };
    if (operation === "categories") return [];
    throw new Error("Unexpected full-data read: " + operation);
  });
}
it("supplies current Cloud authority to global Save on metadata-only Posts without loading analyses", async () => {
  mockReads();
  const data = await workspaceData({ org: organizationId, view: "posts" });
  expect("aiPreference" in data ? data.aiPreference : undefined).toEqual(
    preferences,
  );
  expect(data.sources).toEqual([]);
  expect("recentPosts" in data ? data.recentPosts?.items : undefined).toEqual([
    { id: "post", title: "Saved Reel", generation: 0 },
  ]);
  expect(query.mock.calls.map(([operation]) => operation)).toEqual([
    "organization",
    "posts",
    "taskPreferences",
  ]);
  expect(
    query.mock.calls.every(
      ([, args]) => args.organizationId === organizationId,
    ),
  ).toBe(true);
});
it("keeps one preference read on views that already supply Save setup", async () => {
  mockReads();
  const data = await workspaceData({ org: organizationId, view: "library" });
  expect("aiPreference" in data ? data.aiPreference : undefined).toEqual(
    preferences,
  );
  expect(
    query.mock.calls.filter(([operation]) => operation === "taskPreferences"),
  ).toHaveLength(1);
});
