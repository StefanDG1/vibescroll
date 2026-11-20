import { afterEach, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./lib/backend", () => ({
  backend: async () => ({ query }),
  api: {
    organizations: { details: "org" },
    product: { proposal: "proposal", overview: "overview", usage: "usage" },
    jobs: { customerRoutes: "routes" },
    projectRecommendations: { read: "recommendations" },
    devices: { list: "devices" },
    aiPreferences: { read: "preferences" },
  },
}));
import { workspaceData } from "./lib/workspace-data";
afterEach(() => query.mockReset());
it("loads one planning proposal and bounded header preferences without the library, code, other drafts or devices", async () => {
  query.mockImplementation(async (operation: string) => {
    if (operation === "org")
      return { name: "Workspace", private: true, role: "owner" };
    if (operation === "preferences") return { processingRoute: "work_cloud" };
    if (operation === "recommendations") return { items: [], versionId: null };
    if (operation === "proposal")
      return {
        _id: "draft",
        sourceId: "source",
        organizationId: "workspace",
        detail: { schemaVersion: "chat-project-proposal-v1" },
      };
    throw Error("Unexpected broad query");
  });
  const data = await workspaceData({
    org: "workspace",
    view: "proposal",
    proposalId: "draft",
  });
  expect("workspaceSlice" in data && data.workspaceSlice).toBe("proposal");
  expect(data.sources).toEqual([]);
  expect(query.mock.calls.map(([operation]) => operation)).toEqual([
    "org",
    "proposal",
    "recommendations",
    "preferences",
  ]);
});
it("does not reveal a proposal from another workspace through a guessed detail URL", async () => {
  query.mockImplementation(async (operation: string) =>
    operation === "org"
      ? { name: "Workspace" }
      : { _id: "draft", organizationId: "other" },
  );
  await expect(
    workspaceData({ org: "workspace", view: "proposal", proposalId: "draft" }),
  ).rejects.toThrow(/unavailable/);
});

it("loads only the approved legacy proposal's run history and execution prerequisites", async () => {
  query.mockImplementation(async (operation: string) => {
    if (operation === "org")
      return { name: "Workspace", private: true, role: "owner" };
    if (operation === "proposal")
      return {
        _id: "legacy",
        organizationId: "workspace",
        review: "accepted",
        detail: { schemaVersion: "1.0.0" },
      };
    if (operation === "overview")
      return {
        runs: [
          { _id: "legacy-run", proposalId: "legacy" },
          { _id: "unrelated-run", proposalId: "unrelated" },
        ],
      };
    if (operation === "usage") return { wallet: null };
    if (operation === "routes") return { execution: { cloudReady: true } };
    if (operation === "preferences") return { processingRoute: "work_cloud" };
    if (operation === "devices") return [];
    throw Error("Unexpected broad query");
  });
  const data = await workspaceData({
    org: "workspace",
    view: "proposal",
    proposalId: "legacy",
  });
  expect(data).toMatchObject({
    workspaceSlice: "proposal",
    runs: [{ _id: "legacy-run", proposalId: "legacy" }],
    usage: { wallet: null },
    customerRoutes: { execution: { cloudReady: true } },
    sources: [],
  });
  expect(query.mock.calls.map(([operation]) => operation)).toEqual([
    "org",
    "proposal",
    "devices",
    "overview",
    "usage",
    "routes",
    "preferences",
  ]);
});
