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
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://synthetic.convex.cloud");
  vi.stubEnv("APP_URL", "https://synthetic.example.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
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
