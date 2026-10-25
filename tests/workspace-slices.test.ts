// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({ backend: vi.fn(), query: vi.fn() }));
vi.mock("../apps/starter/lib/backend", async () => ({
  backend: session.backend,
  api: (await import("../convex/_generated/api")).api,
}));
import { workspaceData } from "../apps/starter/lib/workspace-data";
afterEach(() => vi.resetAllMocks());
const organizationId = "synthetic-org";
function fixture(denied = false) {
  const calls: { name: string; args: any }[] = [];
  session.backend.mockResolvedValue({ query: session.query });
  session.query.mockImplementation(async (reference, args) => {
    const name = getFunctionName(reference);
    calls.push({ name, args });
    if (args.organizationId !== organizationId)
      throw Error("FOREIGN_WORKSPACE");
    if (denied) throw Error("ACCESS_LOST");
    if (name === "organizations:details")
      return { name: "Synthetic", private: true, role: "owner" };
    if (name === "product:repositories")
      return [
        {
          _id: "repo",
          fullName: "synthetic/project",
          enabled: true,
          confirmed: true,
          status: "ready",
          profile: "Private repository context",
          snapshotPaths: ["private/path"],
        },
      ];
    if (name === "product:detail")
      return {
        _id: args.id,
        organizationId,
        state: "ready",
        analysis: { insights: [{ id: "point", claim: "Retained claim" }] },
        proposals: [{ _id: "source-proposal" }],
        privateSourceEligibility: { available: true },
        workCloudMediaEnabled: true,
      };
    if (name === "aiPreferences:read")
      return { personalAlphaEnabled: true, cloudAnalysisEnabled: true };
    if (name === "product:proposals")
      return [
        { _id: "proposal", repositoryId: "repo", title: "Synthetic plan" },
      ];
    if (name === "devices:list") return [{ _id: "device", state: "paired" }];
    if (name === "githubLinks:choices")
      return [{ id: 1, fullName: "synthetic/project" }];
    throw Error(`UNEXPECTED_QUERY:${name}`);
  });
  return calls;
}
it("loads project review, context and scan prerequisites in five scoped reads without fetching library or billing", async () => {
  const calls = fixture();
  const result = await workspaceData({ org: organizationId, view: "projects" });
  expect(calls.map((c) => c.name)).toEqual([
    "organizations:details",
    "product:proposals",
    "product:repositories",
    "devices:list",
    "githubLinks:choices",
  ]);
  expect(calls.every((c) => c.args.organizationId === organizationId)).toBe(
    true,
  );
  expect(result).toMatchObject({
    workspaceSlice: "projects",
    sources: [],
    usage: null,
    repositories: [{ _id: "repo" }],
    proposals: [{ _id: "proposal" }],
    devices: [{ _id: "device" }],
  });
});
it("loads one source and its action prerequisites in exactly five reads without library, unrelated runs or usage", async () => {
  const calls = fixture();
  const result = await workspaceData({
    org: organizationId,
    view: "source",
    sourceId: "selected-post",
  });
  expect(calls.map((call) => call.name)).toEqual([
    "organizations:details",
    "product:detail",
    "product:repositories",
    "devices:list",
    "aiPreferences:read",
  ]);
  expect(calls[1].args).toEqual({ id: "selected-post", organizationId });
  expect(result).toMatchObject({
    workspaceSlice: "source",
    sources: [],
    proposals: [],
    runs: [],
    notifications: [],
    usage: null,
    selectedSource: {
      _id: "selected-post",
      analysis: { insights: [{ claim: "Retained claim" }] },
      proposals: [{ _id: "source-proposal" }],
      privateSourceEligibility: { available: true },
      workCloudMediaEnabled: true,
    },
    repositories: [
      {
        _id: "repo",
        fullName: "synthetic/project",
        enabled: true,
        confirmed: true,
      },
    ],
    devices: [{ _id: "device" }],
    aiPreference: { personalAlphaEnabled: true },
  });
  expect(JSON.stringify(result)).not.toContain("Private repository context");
  expect(JSON.stringify(result)).not.toContain("private/path");
});
it("denies missing or unavailable selected sources instead of loading a broad workspace fallback", async () => {
  let calls = fixture();
  await expect(
    workspaceData({ org: organizationId, view: "source" }),
  ).rejects.toThrow("Source unavailable");
  expect(calls).toHaveLength(0);
  calls = fixture(true);
  await expect(
    workspaceData({
      org: organizationId,
      view: "source",
      sourceId: "denied-post",
    }),
  ).rejects.toThrow("ACCESS_LOST");
  expect(calls.some((call) => /library|usage|overview/.test(call.name))).toBe(
    false,
  );
});
it.each(["plans", "proposals"])(
  "loads %s with two scoped reads and marks the slice for a fresh capture-context load",
  async (view) => {
    const calls = fixture();
    const result = await workspaceData({ org: organizationId, view });
    expect(calls.map((c) => c.name)).toEqual([
      "organizations:details",
      "product:proposals",
    ]);
    expect(result).toMatchObject({
      workspaceSlice: "plans",
      sources: [],
      repositories: [],
      devices: [],
      githubChoices: [],
      usage: null,
    });
  },
);
it("does not convert membership loss into a successful empty project or plan page", async () => {
  fixture(true);
  await expect(
    workspaceData({ org: organizationId, view: "projects" }),
  ).rejects.toThrow("ACCESS_LOST");
  await expect(
    workspaceData({ org: organizationId, view: "plans" }),
  ).rejects.toThrow("ACCESS_LOST");
});
