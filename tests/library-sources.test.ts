import { expect, it } from "vitest";
import {
  libraryPageAfterContext,
  sourceCoverageLabel,
} from "../apps/starter/lib/library-sources";

it("discards Home display cards and their preview continuation before a Library context becomes visible", () => {
  const preview = {
    compact: true,
    sources: [{ _id: "preview", title: "Home display card", state: "ready" }],
    libraryNext: "more",
  };
  const page = libraryPageAfterContext(preview);
  expect(page).toEqual({ sources: [], libraryNext: null });
  expect(preview.sources).toHaveLength(1);
  expect(preview.libraryNext).toBe("more");
});

it("preserves an authoritative full page and its cursor when delayed context arrives after the page", () => {
  const sources = [{ _id: "post", coverage: "audio_only", generation: 3 }];
  const page = libraryPageAfterContext({
    compact: false,
    sources,
    libraryNext: "opaque-cursor",
  });
  expect(page.sources).toBe(sources);
  expect(page.libraryNext).toBe("opaque-cursor");
});

it("does not invent link or analysis coverage from missing display metadata", () => {
  for (const missing of [undefined, null, ""])
    expect(sourceCoverageLabel(missing)).toBe("Coverage not recorded");
  expect(sourceCoverageLabel("metadata_only")).toBe("Link");
  expect(sourceCoverageLabel("full_sampled")).toBe("Audio + sampled frames");
  expect(sourceCoverageLabel("source_text")).toBe("source text");
});
