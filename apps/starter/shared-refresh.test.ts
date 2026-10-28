import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { getFunctionName } from "convex/server";
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/backend", () => ({
  api,
  backend: async () => ({ query: state.query }),
}));
import { GET } from "./app/api/workspace/[org]/route";
afterEach(() => {
  vi.resetAllMocks();
});
it("loads Usage and header Save setup through three scoped queries and strips raw private ledger and workspace content", async () => {
  const names: string[] = [];
  state.query.mockImplementation(async (reference) => {
    const name = getFunctionName(reference);
    names.push(name);
    if (name === "organizations:details")
      return { name: "Synthetic", private: true, role: "owner" };
    if (name === "aiPreferences:read") return { workCloud: null };
    if (name === "product:usage")
      return {
        wallet: { tier: "trial", _id: "private-wallet" },
        pools: [{ granted: 30, spent: 16, reserved: 10 }],
        reservations: [
          { key: "private-reservation", state: "active", max: 10 },
        ],
        entries: [
          {
            unitType: "service_credits",
            credits: 6,
            key: "source:private-source",
            createdAt: 100,
          },
        ],
      };
    throw Error("Hidden workspace content requested");
  });
  const response = await GET(
    new Request(
      "https://synthetic.example.test/api/workspace/owner?view=usage",
    ),
    { params: Promise.resolve({ org: "owner" }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(names.sort()).toEqual([
    "aiPreferences:read",
    "organizations:details",
    "product:usage",
  ]);
  const body = await response.json();
  expect(body).toMatchObject({
    workspaceSlice: "usage",
    sources: [],
    repositories: [],
    proposals: [],
    runs: [],
    usage: { available: 4, reserved: 10 },
  });
  expect(JSON.stringify(body)).not.toContain("private-");
});
it("denies Usage on loader authorization failure without disclosing private records", async () => {
  state.query.mockRejectedValue(Error("Private permission diagnostic"));
  const response = await GET(
    new Request(
      "https://synthetic.example.test/api/workspace/foreign?view=usage",
    ),
    { params: Promise.resolve({ org: "foreign" }) },
  );
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Workspace unavailable." });
});
it("refreshes an explicitly opened source beyond the first grant page and clears it after access loss", async () => {
  let available = true;
  state.query.mockImplementation(async (reference, args) => {
    if (
      getFunctionName(reference) === getFunctionName(api.organizations.details)
    )
      return { name: "Synthetic team", role: "viewer", private: false };
    if (
      getFunctionName(reference) === getFunctionName(api.knowledgeGrants.shared)
    )
      return { items: [], next: "synthetic-next-page" };
    if (
      getFunctionName(reference) ===
      getFunctionName(api.knowledgeGrants.fetchShared)
    ) {
      expect(args).toEqual({
        organizationId: "synthetic-team",
        grantId: "later-page-grant",
        sourceId: "chosen-source",
      });
      if (!available) throw new Error("Private upstream access diagnostic");
      return { title: "Synthetic selected source", revision: 1 };
    }
    throw new Error("Unrelated workspace payload requested");
  });
  const refresh = () =>
    GET(
      new Request(
        "https://synthetic.example.test/api/workspace/synthetic-team?view=shared&sharedGrantId=later-page-grant&sharedSourceId=chosen-source",
      ),
      { params: Promise.resolve({ org: "synthetic-team" }) },
    );
  const first = await refresh();
  expect(first.headers.get("cache-control")).toBe("no-store");
  expect(first.headers.get("referrer-policy")).toBe("no-referrer");
  expect((await first.json()).selectedSharedKnowledge.title).toBe(
    "Synthetic selected source",
  );
  expect(state.query).toHaveBeenCalledTimes(3);
  available = false;
  const second = await refresh();
  const data = await second.json();
  expect(data.selectedSharedKnowledge).toBeUndefined();
  expect(data.sharedKnowledgeError).toContain("unavailable or changed");
  expect(JSON.stringify(data)).not.toContain("Private upstream");
  expect(state.query).toHaveBeenCalledTimes(6);
});

it("loads Library context without hidden source, runner, wallet or full-editor queries", async () => {
  const names: string[] = [];
  state.query.mockImplementation(async (reference) => {
    const name = getFunctionName(reference);
    names.push(name);
    if (name === "product:libraryContext")
      return {
        workspaceName: "Synthetic",
        privateLibrary: true,
        role: "owner",
        repositories: [
          {
            _id: "project",
            fullName: "synthetic/project",
            enabled: true,
            confirmed: true,
          },
        ],
        proposals: [{ _id: "idea", review: "unreviewed" }],
        notifications: [],
      };
    if (name === "categories:list")
      return [{ key: "topic", name: "Topic", count: 1 }];
    if (name === "aiPreferences:read") return { personalAlphaEnabled: true };
    throw Error("Hidden workspace content requested");
  });
  const response = await GET(
    new Request(
      "https://synthetic.example.test/api/workspace/owner?view=library",
    ),
    { params: Promise.resolve({ org: "owner" }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(names.sort()).toEqual([
    "aiPreferences:read",
    "categories:list",
    "product:libraryContext",
  ]);
  expect(await response.json()).toMatchObject({
    workspaceSlice: "library",
    compact: false,
    sources: [],
    runs: [],
    usage: null,
    repositories: [{ _id: "project", confirmed: true }],
  });
});
it("clears Library context on actual access failure without returning cached payloads or diagnostics", async () => {
  state.query.mockRejectedValue(Error("Private permission diagnostic"));
  const response = await GET(
    new Request(
      "https://synthetic.example.test/api/workspace/owner?view=library",
    ),
    { params: Promise.resolve({ org: "owner" }) },
  );
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Workspace unavailable." });
});
it("loads Connections through exactly four required queries and omits library, trial, repository and wallet reads", async () => {
  const names: string[] = [];
  state.query.mockImplementation(async (reference) => {
    const name = getFunctionName(reference);
    names.push(name);
    if (name === "organizations:details")
      return { name: "Synthetic", private: true, role: "owner" };
    if (name === "jobs:customerRoutes")
      return { status: "disconnected", models: [] };
    if (name === "jobs:connections") return [];
    if (name === "aiPreferences:read") return { personalAlphaEnabled: true };
    throw Error("Hidden workspace content requested");
  });
  const response = await GET(
    new Request(
      "https://synthetic.example.test/api/workspace/owner?view=connections",
    ),
    { params: Promise.resolve({ org: "owner" }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(names.sort()).toEqual([
    "aiPreferences:read",
    "jobs:connections",
    "jobs:customerRoutes",
    "organizations:details",
  ]);
  expect(await response.json()).toMatchObject({
    workspaceSlice: "connections",
    sources: [],
    repositories: [],
    proposals: [],
    runs: [],
    usage: null,
  });
});
it("denies Connections on real loader authorization failure without private diagnostics", async () => {
  state.query.mockRejectedValue(Error("Private permission diagnostic"));
  const response = await GET(
    new Request(
      "https://synthetic.example.test/api/workspace/foreign?view=connections",
    ),
    { params: Promise.resolve({ org: "foreign" }) },
  );
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Workspace unavailable." });
});
