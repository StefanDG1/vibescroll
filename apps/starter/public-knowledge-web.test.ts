import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({
  construct: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  setAuth: vi.fn(),
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    constructor(...args: unknown[]) {
      mock.construct(...args);
    }
    query = mock.query;
    mutation = mock.mutation;
    setAuth = mock.setAuth;
  },
}));
import {
  readPublicEdition,
  readPublicCollection,
  discoverPublic,
} from "./lib/public-knowledge";
import { POST } from "./app/api/public-knowledge/report/route";
import { PublicEditionContent } from "./components/public-edition-content";
import Edition from "./app/editions/[slug]/page";
import Collection from "./app/collections/[slug]/page";
import Discover from "./app/discover/page";
import type { PublicEdition } from "./lib/public-knowledge-display";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://synthetic.convex.cloud");
  vi.stubEnv("APP_URL", "https://synthetic.example.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("discovers collections without requesting or rendering retired region aggregates", async () => {
  vi.stubEnv("PUBLIC_KNOWLEDGE_WEB_ENABLED", "true");
  mock.query.mockResolvedValue({ page: [], isDone: true, continueCursor: "" });
  const html = renderToStaticMarkup(
    await Discover({ searchParams: Promise.resolve({}) }),
  );
  expect(mock.query).toHaveBeenCalledTimes(1);
  expect(html).toContain("Find a useful collection.");
  expect(html).not.toMatch(/globe|regional sharing|sharing region/i);
});
it("does not construct or query a backend while the web release gate is off", async () => {
  vi.stubEnv("PUBLIC_KNOWLEDGE_WEB_ENABLED", "false");
  expect((await readPublicEdition("permitted-example")).state).toBe("pending");
  expect((await readPublicCollection("permitted-example")).state).toBe(
    "pending",
  );
  expect((await discoverPublic("", null)).state).toBe("pending");
  expect(mock.construct).not.toHaveBeenCalled();
  expect(mock.query).not.toHaveBeenCalled();
});
it("rejects invalid slugs and credential-bearing backend URLs before network work", async () => {
  vi.stubEnv("PUBLIC_KNOWLEDGE_WEB_ENABLED", "true");
  expect((await readPublicEdition("../../private")).state).toBe("missing");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://token@synthetic.convex.cloud");
  expect((await readPublicCollection("permitted-example")).state).toBe(
    "pending",
  );
  expect(mock.construct).not.toHaveBeenCalled();
});
it("uses anonymous current reads and does not replace failures with fixture output", async () => {
  vi.stubEnv("PUBLIC_KNOWLEDGE_WEB_ENABLED", "true");
  mock.query.mockResolvedValueOnce(null);
  expect((await readPublicEdition("permitted-example")).state).toBe("missing");
  expect(mock.setAuth).not.toHaveBeenCalled();
  mock.query.mockRejectedValueOnce(Error("private upstream diagnostic"));
  expect(await readPublicEdition("permitted-example")).toEqual({
    state: "unavailable",
    data: null,
  });
});
function report(body: unknown, origin = "https://synthetic.example.test") {
  return new Request(
    "https://synthetic.example.test/api/public-knowledge/report",
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
it("bounds the anonymous report route and accepts no generic mutation or private fields", async () => {
  vi.stubEnv("PUBLIC_KNOWLEDGE_WEB_ENABLED", "true");
  const body = {
    slug: "permitted-example",
    key: "synthetic_report_key_123",
    reason: "privacy",
  };
  expect(
    (await POST(report(body, "https://foreign.example.test"))).status,
  ).toBe(403);
  expect(
    (await POST(report({ ...body, operation: "publishEdition" }))).status,
  ).toBe(400);
  expect(
    (await POST(report({ ...body, privateText: "x".repeat(1100) }))).status,
  ).toBe(400);
  expect(mock.mutation).not.toHaveBeenCalled();
  mock.mutation.mockResolvedValue({
    received: true,
    privateDto: "must not serialize",
  });
  const response = await POST(report(body));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("renders evidence as escaped text and omits unsafe source/citation links", () => {
  const html = renderToStaticMarkup(
    createElement(PublicEditionContent, {
      edition: {
        title: "<script>private()</script>",
        summary: "Synthetic",
        publisher: "Example",
        sourceUrl: "javascript:alert(1)",
        coverage: "supplied_text",
        language: "en",
        pipelineVersion: "1",
        schemaVersion: "1",
        insights: [
          {
            id: "one",
            title: "<img src=x>",
            claim: "<script>claim()</script>",
            interpretation: "Example",
            uncertainty: ["Incomplete"],
            citations: [
              {
                label: "Unsafe target",
                url: "file:///private",
                kind: "supplied_text",
              },
            ],
          },
        ],
      },
    }),
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain('href="file:');
  expect(html).toContain("Uncertainty");
});

function publicEdition(): PublicEdition & { corrections: [] } {
  return {
    slug: "permitted-example",
    version: 2,
    reuseAllowed: true,
    publishedDate: "2026-10-22",
    corrections: [],
    title: "Synthetic public edition",
    summary: "Synthetic generated summary",
    publisher: "Example publisher",
    sourceUrl: "https://github.com/example/project/blob/abc/README.md",
    coverage: "supplied_text",
    language: "en",
    pipelineVersion: "synthetic-v2",
    schemaVersion: "2",
    insights: [
      {
        id: "synthetic-point",
        title: "Synthetic source point",
        claim: "Synthetic claim requiring review",
        interpretation: "A possible application, subject to review",
        uncertainty: ["Not independently verified"],
        citations: [
          {
            label: "Supplied source excerpt",
            url: null,
            kind: "supplied_text",
          },
        ],
      },
    ],
  };
}

it("discloses AI generation visibly on the actual edition page before its claims", async () => {
  vi.stubEnv("PUBLIC_KNOWLEDGE_WEB_ENABLED", "true");
  const edition = publicEdition();
  mock.query.mockResolvedValueOnce(edition);
  const html = renderToStaticMarkup(
    await Edition({ params: Promise.resolve({ slug: edition.slug }) }),
  );
  expect(html).toMatch(/<p[^>]*>AI-generated analysis may contain errors\./);
  expect(html).toContain("Review the source references before relying on it.");
  expect(html).toContain(
    "The publisher is responsible for reviewing this edition.",
  );
  expect(html.indexOf("AI-generated analysis")).toBeLessThan(
    html.indexOf(edition.insights[0].claim),
  );
  expect(html).toContain(`href="${edition.sourceUrl}"`);
  expect(html).toContain("Supplied source excerpt");
  expect(html).not.toMatch(/human[- ]reviewed|reviewed by a human/i);
  expect(mock.query).toHaveBeenCalledTimes(1);
  expect(mock.setAuth).not.toHaveBeenCalled();
  expect(mock.mutation).not.toHaveBeenCalled();
});

it("labels generated summaries on the actual collection page and links to source review", async () => {
  vi.stubEnv("PUBLIC_KNOWLEDGE_WEB_ENABLED", "true");
  const edition = publicEdition();
  mock.query.mockResolvedValueOnce({
    slug: "example-collection",
    title: "Synthetic collection",
    description: "An explicitly permitted synthetic collection",
    topic: "Testing",
    editions: [edition],
  });
  const html = renderToStaticMarkup(
    await Collection({
      params: Promise.resolve({ slug: "example-collection" }),
    }),
  );
  expect(html).toMatch(/<p[^>]*>These edition summaries are AI-generated/);
  expect(html).toContain("may contain errors");
  expect(html).toContain(
    "Open an edition to review its source references before relying on it.",
  );
  expect(html.indexOf("These edition summaries are AI-generated")).toBeLessThan(
    html.indexOf(edition.summary),
  );
  expect(html).toContain(`href="/editions/${edition.slug}"`);
  expect(html).not.toMatch(/human[- ]reviewed|reviewed by a human/i);
  expect(mock.query).toHaveBeenCalledTimes(1);
  expect(mock.setAuth).not.toHaveBeenCalled();
  expect(mock.mutation).not.toHaveBeenCalled();
});
