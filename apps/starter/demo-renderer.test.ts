import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
import { Console, SourceDetail } from "./components/console";
import Demo from "./app/demo/page";
import { libraryDemoDrafts, libraryDemoSources } from "./lib/library-demo";
const initial = {
  sources: [],
  repositories: [],
  proposals: [],
  runs: [],
  notifications: [],
  usage: null,
};
function saveButtons(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(
    (match) => match[2].replace(/<[^>]*>/g, "").trim() === "Save",
  );
}
it("renders a reachable Save entry in the synthetic demo without mislabelling it viewer access", () => {
  const html = renderToStaticMarkup(
    createElement(Console, {
      initial,
      organizationId: "demo",
      demo: true,
      readOnly: true,
    }),
  );
  const buttons = saveButtons(html);
  expect(buttons.length).toBeGreaterThan(0);
  expect(buttons.some((match) => !match[1].includes("disabled"))).toBe(true);
  expect(html).toContain("Synthetic data only");
  expect(html).not.toContain("Viewer access.");
});
it("preserves viewer read-only Save restrictions in an actual workspace", () => {
  const html = renderToStaticMarkup(
    createElement(Console, {
      initial,
      organizationId: "synthetic-workspace",
      readOnly: true,
    }),
  );
  const buttons = saveButtons(html);
  expect(buttons.length).toBeGreaterThan(0);
  expect(buttons.every((match) => match[1].includes("disabled"))).toBe(true);
  expect(html).toContain("Viewer access.");
});

async function renderDemo(params: {
  view?: string;
  source?: string;
  proposal?: string;
  uiState?: string;
}) {
  return renderToStaticMarkup(
    await Demo({ searchParams: Promise.resolve(params) }),
  );
}

it("opens the actual source evidence reached from a demo library link", async () => {
  const source = libraryDemoSources[0];
  const html = await renderDemo({ view: "library", source: source._id });
  expect(html).toContain("Back to list");
  expect(html).toContain("AI summary");
  expect(html).toContain("Main points");
  expect(html).toContain(source.summary);
});

it("leaves an unknown source on the ordinary demo library", async () => {
  const html = await renderDemo({ view: "library", source: "unknown-source" });
  expect(html).not.toContain("AI summary");
  expect(html).not.toContain("Back to list");
  expect(html).toContain('<h1 class="sr-only">Library</h1>');
});

it.each(["loading", "error", "empty"])(
  "preserves the %s library state when a source link is supplied",
  async (uiState) => {
    const html = await renderDemo({
      view: "library",
      source: libraryDemoSources[0]._id,
      uiState,
    });
    expect(html).not.toContain("AI summary");
    expect(html).not.toContain("Back to list");
    if (uiState === "loading") expect(html).toContain('aria-busy="true"');
    if (uiState === "error")
      expect(html).toContain("Synthetic request failure.");
    if (uiState === "empty") expect(html).toContain("Synthetic absent source");
  },
);

it("opens the demo Connections view without granting assistant access", async () => {
  const html = await renderDemo({ view: "connections" });
  expect(html).toContain("Use saved ideas in your assistant");
  expect(html).toContain("Assistant access needs your own signed-in account.");
});

it("opens the exact existing issue draft targeted by a project proposal link", async () => {
  const draft = libraryDemoDrafts[0];
  const html = await renderDemo({ view: "projects", proposal: draft._id });
  expect(html).toContain("Explore project evidence");
  expect(html).toContain(
    '<details class="knowledge-result" open=""><summary><span>' + draft.title,
  );
});

it.each([
  ["text", "Original supplied text and corrections"],
  ["upload", "Original transcript and corrections"],
  ["url", "Original transcript and corrections"],
])(
  "keeps %s source wording and original/corrected evidence distinct",
  (kind, title) => {
    const source = {
      ...libraryDemoSources[0],
      kind,
      originalText: "Original <source> passage",
      text: "Corrected source passage",
      analysis: {
        insights: [
          {
            id: "synthetic-text-evidence",
            title: "Inspect the original passage",
            claim: "Synthetic claim for renderer validation only.",
            evidence: [
              {
                kind: "user_note",
                id: "supplied_text",
                startMs: null,
                endMs: null,
              },
            ],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      createElement(Console, {
        initial,
        organizationId: "demo",
        demo: true,
        readOnly: true,
        initialView: "source",
        initialSource: source,
      }),
    );
    expect(html).toContain(`<summary>${title}</summary>`);
    expect(html).toContain('id="source-transcript"');
    expect(html).toContain("Original &lt;source&gt; passage");
    expect(html).toContain("Current user correction: Corrected source passage");
    expect(html).toContain("user note · Supplied text");
    expect(html).not.toContain("user note · 0.0s");
  },
);

it.each([true, false])(
  "shows the retained Cloud speech instead of older source text, speech present=%s",
  (speechPresent) => {
    const source = {
      ...libraryDemoSources[0],
      kind: "url",
      originalText: "Older source text is not Cloud speech",
      text: "A saved caption is not Cloud speech",
      analysis: { insights: [] },
      orderedMedia: {
        post: {
          schemaVersion: "work-cloud-observed-media-v1",
          retainUntil: Date.now() + 60000,
          segments: speechPresent
            ? [
                {
                  id: "speech_000",
                  startMs: 0,
                  endMs: 1760,
                  text: "Actual first <speech> segment.",
                },
                {
                  id: "speech_001",
                  startMs: 1760,
                  endMs: 2640,
                  text: "Actual second speech segment.",
                },
              ]
            : [],
        },
        evidence: [],
      },
    };
    const html = renderToStaticMarkup(
      createElement(Console, {
        initial,
        organizationId: "demo",
        demo: true,
        readOnly: true,
        initialView: "source",
        initialSource: source,
      }),
    );
    const panel = html
      .split('id="source-transcript"')[1]
      ?.split("</details>")[0];
    expect(panel).toBeDefined();
    expect(panel).not.toContain("Older source text");
    expect(panel).not.toContain("A saved caption");
    if (speechPresent) {
      expect(panel).toContain("Actual first &lt;speech&gt; segment.");
      expect(panel).toContain("Actual second speech segment.");
      expect(panel).toContain("1.8");
      expect(panel).toContain("2.6");
    } else expect(panel).toContain("Original transcript is unavailable.");
  },
);
it("renders retained Cloud screenshots and timestamps while excluding older local frames", () => {
  const source = {
    ...libraryDemoSources[0],
    _id: "synthetic-cloud-source",
    kind: "url",
    state: "ready",
    generation: 2,
    rightsAttested: true,
    originalMediaEvidence: [
      { kind: "frame", id: "old-local-frame", startMs: 0, endMs: 0 },
    ],
    analysis: {
      insights: [
        {
          id: "cited",
          title: "Cited Cloud evidence",
          claim: "Fixture claim",
          evidence: [
            {
              kind: "video_observation",
              id: "frame-1",
              startMs: 12000,
              endMs: 12001,
            },
            {
              kind: "video_observation",
              id: "speech",
              startMs: 0,
              endMs: 1000,
            },
          ],
        },
      ],
    },
    orderedMedia: {
      post: {
        schemaVersion: "work-cloud-observed-media-v1",
        segments: [
          { id: "speech", startMs: 0, endMs: 1000, text: "Retained speech" },
        ],
        frames: [
          { id: "frame-1", sha256: "hash", bytes: 100, timestampMs: 12000 },
        ],
      },
      evidence: [
        {
          kind: "video_observation",
          id: "frame-1",
          startMs: 12000,
          endMs: 12001,
          basis: "visible",
        },
        {
          kind: "video_observation",
          id: "speech",
          startMs: 0,
          endMs: 1000,
          basis: "transcript",
        },
      ],
    },
    personalAnalysis: {
      executor: "work_cloud",
      generation: 2,
      state: "completed",
      cloud: {
        media: { preparationHash: "prepared", retainUntil: Date.now() + 60000 },
      },
    },
    personalMedia: {
      cloudFrames: {
        generation: 2,
        preparationHash: "prepared",
        frames: [
          {
            frameId: "frame-1",
            assetId: "cloud-frame-asset",
            sha256: "hash",
            size: 100,
            timestampMs: 12000,
          },
        ],
      },
    },
  };
  const html = renderToStaticMarkup(
    createElement(SourceDetail, {
      source,
      authoritative: true,
      demo: false,
      readOnly: true,
      org: { _id: "synthetic-org" },
      repos: [],
      devices: [],
      call: vi.fn(),
      strictCall: vi.fn(),
    }),
  );
  expect(html).toContain("/api/evidence/cloud-frame-asset?inline=true");
  expect(html).toContain("12.0");
  expect(html).not.toContain("/api/evidence/old-local-frame");
  expect(html).toContain('href="#source-transcript"');
  expect(html).toContain("Frame · 12.0s");
});
