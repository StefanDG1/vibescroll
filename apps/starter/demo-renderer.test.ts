import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
import { Console } from "./components/console";
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
it.each(["personalOrderedInput", "orderedMedia"])(
  "shows truthful provided-file provenance from existing %s data",
  (field) => {
    const metadata = {
      schemaVersion: "provided-media-v1",
      expectedAssetCount: 2,
      originalUrl: "https://example.test/user-reference",
      caption: "User <caption>",
    };
    const source = {
      _id: "synthetic-provided",
      title: "Provided files",
      kind: "upload",
      state: "saved",
      generation: 0,
      [field]:
        field === "personalOrderedInput" ? { metadata } : { post: metadata },
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
    expect(html).toContain("2 files saved in your chosen order");
    expect(html).toContain(
      "publication date and post completeness are unverified",
    );
    expect(html).toContain('href="https://example.test/user-reference"');
    expect(html).toContain("Original link supplied by you");
    expect(html).toContain("User &lt;caption&gt;");
    expect(html).not.toContain("User <caption>");
  },
);
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
it.each(["orderedPreparation", "orderedMedia", "serviceIntent"])(
  "does not offer legacy cloud analysis for an ordered source marked by %s",
  (field) => {
    const source = {
      _id: "synthetic-ordered",
      kind: "url",
      state: "saved",
      generation: 1,
      title: "Synthetic ordered source",
      url: "https://www.instagram.com/p/synthetic/",
      [field]: { state: "pending" },
    };
    const html = renderToStaticMarkup(
      createElement(Console, {
        initial: {
          ...initial,
          aiPreference: {
            cloudAnalysisEnabled: true,
            personalAlphaEnabled: false,
            preferChatGPTPlan: false,
            hostedStatus: "synthetic",
            active: true,
          },
        },
        organizationId: "synthetic-workspace",
        initialView: "source",
        initialSource: source,
      }),
    );
    expect(html).toContain(
      "Ordered-media analysis is awaiting its supported route",
    );
    expect(html).not.toContain("Analyze in cloud, up to 10 credits");
    expect(html).not.toContain("Transcribe and analyze video");
  },
);

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
