import { afterEach, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./lib/backend", () => ({
  backend: async () => ({ query }),
  api: {
    aiPreferences: { read: "taskPreferences" },
    product: { libraryContext: "libraryContext" },
    categories: { list: "categories" },
    organizations: { details: "organizationDetails" },
    devices: { list: "devices" },
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
    if (operation === "taskPreferences") return preferences;
    if (operation === "libraryContext") return { workspaceName: "Workspace" };
    if (operation === "categories") return [];
    if (operation === "organizationDetails") return { role: "owner" };
    if (operation === "devices") return [];
    throw new Error("Unexpected full-data read: " + operation);
  });
}
it("supplies current Cloud authority to global Save on Posts without loading analyses", async () => {
  mockReads();
  const data = await workspaceData({ org: organizationId, view: "posts" });
  expect("aiPreference" in data ? data.aiPreference : undefined).toEqual(
    preferences,
  );
  expect(data.sources).toEqual([]);
  expect(query.mock.calls.map(([operation]) => operation)).toEqual([
    "libraryContext",
    "categories",
    "taskPreferences",
  ]);
  expect(
    query.mock.calls.every(
      ([, args]) => args.organizationId === organizationId,
    ),
  ).toBe(true);
});
it("opens Save using only role, devices and current task preferences", async () => {
  mockReads();
  const data = await workspaceData({ org: organizationId, view: "capture" });
  expect(data).toMatchObject({
    workspaceSlice: "capture",
    role: "owner",
    aiPreference: preferences,
    devices: [],
    sources: [],
  });
  expect(query.mock.calls.map(([operation]) => operation)).toEqual([
    "organizationDetails",
    "devices",
    "taskPreferences",
  ]);
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
