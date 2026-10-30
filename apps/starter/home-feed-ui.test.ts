import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalArtifact } from "./components/assistant-elements/proposal-artifact";
import { feedDemoDetails } from "./lib/home-feed-demo";

const backendMock = vi.hoisted(() => ({ query: vi.fn(), backend: vi.fn() }));
vi.mock("./lib/backend", () => ({
  backend: backendMock.backend,
  api: { product: { detail: "detail", repositories: "repositories" } },
}));
import { GET } from "./app/api/feed/[id]/route";
afterEach(() => {
  vi.clearAllMocks();
});

it("keeps a real topic-fit disclosure on a collapsed saved plan without a pretend approval action", () => {
  const detail = feedDemoDetails["feed-demo-0"];
  const html = renderToStaticMarkup(
    createElement(ProposalArtifact, {
      proposal: detail.proposals[0],
      fit: detail.suggestions.items[0].fit,
      href: "/proposal/real",
    }),
  );
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Topic fit");
  expect(html).toContain("100");
  expect(html).toContain("Open plan");
  expect(html).not.toMatch(
    /Approve|Needs changes|Send message|Assistant replied/,
  );
});

it("does not score a planning seed as a ready proposal", () => {
  const detail = feedDemoDetails["feed-demo-0"];
  const html = renderToStaticMarkup(
    createElement(ProposalArtifact, {
      proposal: { ...detail.proposals[0], disposition: "needs_context" },
      fit: detail.suggestions.items[0].fit,
      href: "/proposal/real",
    }),
  );
  expect(html).toContain("Draft");
  expect(html).not.toContain("Topic fit");
});

it("requires a workspace before querying saved content", async () => {
  const response = await GET(
    new Request("https://example.com/api/feed/source"),
    { params: Promise.resolve({ id: "source" }) },
  );
  expect(response.status).toBe(404);
  expect(backendMock.backend).not.toHaveBeenCalled();
});

it("returns no source or project text after an authorization failure", async () => {
  backendMock.backend.mockResolvedValue({ query: backendMock.query });
  backendMock.query.mockRejectedValueOnce(Error("Private database detail"));
  backendMock.query.mockResolvedValueOnce([
    { profile: "private-project-text" },
  ]);
  const response = await GET(
    new Request("https://example.com/api/feed/source?organizationId=workspace"),
    { params: Promise.resolve({ id: "source" }) },
  );
  expect(response.status).toBe(404);
  expect(await response.text()).toBe('{"error":"Post unavailable."}');
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("projects only authorized feed content and binds both reads to the requested workspace", async () => {
  backendMock.backend.mockResolvedValue({ query: backendMock.query });
  backendMock.query.mockResolvedValueOnce({
    _id: "source",
    organizationId: "workspace",
    title: "Saved title",
    kind: "url",
    state: "ready",
    generation: 1,
    analysisVersion: { id: "version" },
    categoryKeys: ["coding"],
    analysis: {
      insights: [
        {
          id: "idea",
          title: "Helpful idea",
          claim: "Use this idea",
          evidence: [{ private: "not-needed-in-feed" }],
        },
      ],
    },
    transcript: "private full transcript",
    proposals: [],
  });
  backendMock.query.mockResolvedValueOnce([
    {
      _id: "project",
      fullName: "Owned project",
      enabled: true,
      confirmed: true,
      status: "connected",
      profile: "purpose: coding\n\ngoals: software",
      privateField: "not-for-browser",
    },
  ]);
  const response = await GET(
    new Request("https://example.com/api/feed/source?organizationId=workspace"),
    { params: Promise.resolve({ id: "source" }) },
  );
  expect(response.status).toBe(200);
  const detail = await response.json();
  expect(detail.analysisVersionId).toBe("version");
  expect(detail.insights[0].claim).toBe("Use this idea");
  expect(detail.projects).toEqual([{ id: "project", name: "Owned project" }]);
  expect(JSON.stringify(detail)).not.toMatch(
    /private full transcript|not-for-browser|not-needed-in-feed|purpose: coding/,
  );
  expect(
    backendMock.query.mock.calls.map((call) => call[1].organizationId),
  ).toEqual(["workspace", "workspace"]);
  expect(backendMock.query.mock.calls[0][1].id).toBe("source");
});

it("keeps failed or in-progress sources out of the analyzed feed", async () => {
  backendMock.backend.mockResolvedValue({ query: backendMock.query });
  backendMock.query.mockResolvedValueOnce({ state: "running" });
  backendMock.query.mockResolvedValueOnce([]);
  const response = await GET(
    new Request("https://example.com/api/feed/source?organizationId=workspace"),
    { params: Promise.resolve({ id: "source" }) },
  );
  expect(response.status).toBe(404);
});
