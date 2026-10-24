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
import { SharedOrderedAnalysisContent } from "./components/shared-ordered-analysis-content";
import type { SharedOrderedAnalysis } from "./lib/shared-ordered-analysis-display";
import Edition from "./app/editions/[slug]/page";
import Collection from "./app/collections/[slug]/page";
import type { PublicEdition } from "./lib/public-knowledge-display";
import { ProductMedia } from "./components/product-media";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://synthetic.convex.cloud");
  vi.stubEnv("APP_URL", "https://synthetic.example.test");
});

it("renders all prepared media with explicit native controls, ordered codec fallbacks and desktop disclosures", () => {
  const html = renderToStaticMarkup(
    createElement(ProductMedia, { idPrefix: "media-check" }),
  );
  const videos = [...html.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/g)];
  expect(videos).toHaveLength(7);
  for (const video of videos) {
    expect(video[1]).toContain('preload="none"');
    expect(video[1]).toContain("controls");
    expect(video[1]).toContain("playsInline");
    expect(video[1]).not.toMatch(/autoplay|loop|onplay/i);
    expect(video[2]).toContain('kind="captions"');
    expect(video[1]).toContain('poster="/product/');
    if (!video[2].includes("setup-walkthrough.mp4")) {
      expect(video[2].indexOf('type="video/mp4"')).toBeLessThan(
        video[2].indexOf('type="video/webm"'),
      );
      expect(video[2]).not.toContain("media=");
    }
  }
  expect(html.match(/<details\b/g)).toHaveLength(3);
  expect(html).toContain("not an implementation plan");
  expect(html).toContain("24 seconds");
  expect(html).toContain("20 seconds");
  expect(html).toContain('src="/product/setup-walkthrough.mp4"');
  for (const name of ["overview", "library", "social"]) {
    expect(html).toContain(`href="/product/${name}-transcript.txt"`);
    expect(html).toContain(`href="/product/${name}-storyboard.txt"`);
  }
});

it("keeps the overview variant concise with its canonical phone route, desktop alternative and existing gallery", () => {
  const html = renderToStaticMarkup(
    createElement(ProductMedia, {
      variant: "overview",
      idPrefix: "compact-media",
    }),
  );
  expect(html.match(/<video\b/g)).toHaveLength(2);
  expect(html).toContain('src="/product/overview.mp4"');
  expect(html).toContain('src="/product/overview-desktop.mp4"');
  expect(html).toContain('height="900"');
  expect(html).not.toContain('src="/product/library-mobile.mp4"');
  expect(html).not.toContain('src="/product/social-mobile.mp4"');
  expect(html).not.toContain('src="/product/setup-walkthrough.mp4"');
  expect(html).toContain("library-light-1440.png");
  expect(html).toContain("library-dark-390.png");
});

it("binds every current public media asset to actual bytes and preserves the historical source and setup", () => {
  type Asset = {
    path: string;
    bytes: number;
    sha256: string;
    history?: Asset[];
    sourceCommit?: string | null;
    sourceCommitStatus?: string;
  };
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../docs/launch-kit/assets.json", import.meta.url),
      "utf8",
    ),
  ) as { assets: Asset[] };
  for (const asset of manifest.assets) {
    const data = readFileSync(
      new URL(`./public${asset.path}`, import.meta.url),
    );
    expect(data.byteLength, asset.path).toBe(asset.bytes);
    expect(createHash("sha256").update(data).digest("hex"), asset.path).toBe(
      asset.sha256,
    );
    if (/\.(vtt|txt)$/.test(asset.path)) {
      expect(data.includes(13), `${asset.path} must use LF`).toBe(false);
      expect(data.subarray(0, 3).equals(Buffer.from([239, 187, 191]))).toBe(
        false,
      );
    }
  }
  const overview = manifest.assets.find(
    (asset) => asset.path === "/product/overview.mp4",
  )!;
  expect(overview.history?.[0].sha256).toBe(
    "a4b2709e931e1286d68646592486f1cf4be99b42e9b2efee5d6b4508fa6d1820",
  );
  const archive = readFileSync(
    new URL(
      "../../docs/launch-kit/media-m2-recipe/sources/overview-76ec7bf.mp4",
      import.meta.url,
    ),
  );
  expect(createHash("sha256").update(archive).digest("hex")).toBe(
    overview.history?.[0].sha256,
  );
  const setup = manifest.assets.find(
    (asset) => asset.path === "/product/setup-walkthrough.mp4",
  )!;
  expect(setup.history?.[0].sha256).toBe(
    "94da2151b29b1406bc6b1dd10cc2f52ca4714f0772e86e476a082b24cb7f40a0",
  );
  expect(setup.sha256).toBe(
    "9b47855eed43b2e35070d2699356479b5908be8f8cb5c41dc4e7444760545026",
  );
  const setupArchive = readFileSync(
    new URL(
      "../../docs/launch-kit/media-m2-recipe/sources/setup-76ec7bf.mp4",
      import.meta.url,
    ),
  );
  expect(createHash("sha256").update(setupArchive).digest("hex")).toBe(
    setup.history?.[0].sha256,
  );
  const founder = manifest.assets.find(
    (asset) => asset.path === "/product/production-summary.png",
  )!;
  expect(founder.sourceCommit).toBeNull();
  expect(founder.sourceCommitStatus).toContain("not independently verified");
});

it("keeps caption, transcript and static walkthrough semantics accurate and excludes active/private content", () => {
  for (const family of ["overview", "library", "social"]) {
    const files = [".vtt", "-transcript.txt", "-storyboard.txt"].map((suffix) =>
      readFileSync(
        new URL(`./public/product/${family}${suffix}`, import.meta.url),
        "utf8",
      ),
    );
    for (const content of files) {
      expect(content).not.toContain("Keep an editable private plan");
      expect(content).not.toMatch(/<script|file:\/\/|C:\\Users|\.worktrees/i);
    }
  }
  const caption = readFileSync(
    new URL("./public/product/overview.vtt", import.meta.url),
    "utf8",
  );
  expect(caption).toContain("00:00:22.000 --> 00:00:28.000");
  expect(caption).toContain(
    "Review a private issue draft. Publication needs separate approval.",
  );
  expect(caption).toContain("Manual analysis is shown");
  expect(caption).toContain("No processing job is running");
  const setupCaption = readFileSync(
    new URL("./public/product/setup-walkthrough.vtt", import.meta.url),
    "utf8",
  );
  expect(setupCaption).toContain("00:01:20.000 --> 00:01:30.000");
  expect(setupCaption).toContain("Inspect a private issue draft");
  expect(setupCaption).not.toContain("Inspect a retained private plan");
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
it("renders honest supplied-text provenance in actual edition and collection content", async () => {
  vi.stubEnv("PUBLIC_KNOWLEDGE_WEB_ENABLED", "true");
  const edition = {
    ...publicEdition(),
    coverage: "source_text",
    sourceProvenance: "supplied_text_unverified" as const,
    sourceUrl: `https://github.com/example/project/blob/${"a".repeat(40)}/README.md`,
  };
  mock.query.mockResolvedValueOnce(edition);
  const page = renderToStaticMarkup(
    await Edition({ params: Promise.resolve({ slug: edition.slug }) }),
  );
  mock.query.mockResolvedValueOnce({
    slug: "supplied-collection",
    title: "Reviewed supplied text",
    description: "Reviewable references",
    topic: "Evidence",
    editions: [edition],
  });
  const collection = renderToStaticMarkup(
    await Collection({
      params: Promise.resolve({ slug: "supplied-collection" }),
    }),
  );
  expect(page).toContain("Coverage: Text");
  expect(page).toContain("supplied text with untimed references");
  expect(page).toContain("Open the publisher-supplied reference");
  expect(collection).toContain(
    "Text with publisher-supplied, untimed references",
  );
  expect(collection).toContain("Review the supplied reference and claims");
  for (const html of [page, collection]) {
    expect(html).not.toContain("Coverage: caption only");
    expect(html).not.toContain("Open the original source");
  }
});

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

function sharedAnalysis(): SharedOrderedAnalysis {
  return {
    title: "Instagram post",
    summary: "Synthetic neutral summary",
    sourceUrl: "https://www.instagram.com/p/fixture/",
    coverage: "ordered_media",
    language: "en",
    pipelineVersion: "ordered-social-v1",
    schemaVersion: "3.0.0",
    warnings: ["Later slides were not inspected."],
    acquisitionCoverage: "partial",
    expectedAssetCount: null,
    inspectedAssetCount: 1,
    insights: [
      {
        id: "idea1",
        kind: "idea",
        title: "Read the original",
        claim: "Synthetic claim",
        interpretation: "Synthetic interpretation",
        confidence: "uncertain",
        uncertainty: ["Check context"],
        citations: [
          {
            id: "visible1",
            kind: "image_observation",
            url: "https://www.instagram.com/p/fixture/",
            label: "Image 3",
            startMs: null,
            endMs: null,
            assetId: "slide3",
            assetIndex: 2,
            postRevisionHash: "a".repeat(64),
            textHash: "b".repeat(64),
            basis: "ocr",
            uncertainty: "Small text",
            crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
          },
        ],
      },
    ],
  };
}
it("renders service evidence as ordered untimed images, actual crop and uncertainty without invented edition authority", () => {
  const html = renderToStaticMarkup(
    createElement(SharedOrderedAnalysisContent, { analysis: sharedAnalysis() }),
  );
  expect(html).toContain("AI-generated analysis may contain errors");
  expect(html).toContain("total asset count is unknown");
  expect(html).toContain("Complete source coverage has not been established");
  expect(html).toContain("Image 3");
  expect(html).toContain("Asset 3, ocr");
  expect(html).toContain("Untimed image reference");
  expect(html).toContain("Crop: x 0.1, y 0.2, width 0.5, height 0.4");
  expect(html).toContain("Small text");
  expect(html).toContain("Later slides were not inspected");
  expect(html).not.toMatch(
    /Public edition version|Published by|0–0s|human.reviewed/,
  );
  expect(mock.query).not.toHaveBeenCalled();
  expect(mock.mutation).not.toHaveBeenCalled();
});
it("renders actual video ranges and escapes untrusted analysis without allowing active source URLs", () => {
  const analysis = sharedAnalysis();
  analysis.sourceUrl = "javascript:alert(1)";
  analysis.insights[0].claim = "<script>alert('fixture')</script>";
  analysis.insights[0].citations = [
    {
      ...analysis.insights[0].citations[0],
      kind: "video_observation",
      label: "Video 2–4s",
      startMs: 2000,
      endMs: 4000,
      url: "javascript:alert(1)",
      crop: undefined,
    },
  ];
  const html = renderToStaticMarkup(
    createElement(SharedOrderedAnalysisContent, { analysis }),
  );
  expect(html).toContain("2–4s");
  expect(html).not.toContain("Untimed image reference");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("href=");
});
