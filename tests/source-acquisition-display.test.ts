import { expect, it } from "vitest";
import {
  githubSelectionPreset,
  sourceDate,
  acquisitionStage,
} from "../apps/starter/lib/source-acquisition-display";
it("presets only README, licence and docs files with exact byte and count bounds", () => {
  const file = (path: string, size = 10) => ({
    path,
    size,
    blobSha: "a".repeat(40),
  });
  const files = [
    ...Array.from({ length: 30 }, (_, i) => file(`docs/${i}.md`)),
    file("README.md"),
    file("LICENSE"),
    file("AGENTS.md"),
    file("src/execute.ts"),
  ];
  const paths = githubSelectionPreset(files);
  expect(paths.slice(0, 2)).toEqual(["README.md", "LICENSE"]);
  expect(paths).toHaveLength(20);
  expect(paths).not.toContain("AGENTS.md");
  expect(paths).not.toContain("src/execute.ts");
  expect(
    githubSelectionPreset(
      Array.from({ length: 10 }, (_, i) => file(`docs/${i}.md`, 65536)),
    ),
  ).toHaveLength(8);
  expect(
    githubSelectionPreset([
      file("README.md", 65537),
      file("LICENSE", 0),
      file("docs/invalid.md", NaN),
    ]),
  ).toEqual([]);
});
it("does not turn source retrieval or missing dates into analysis and timestamps", () => {
  expect(acquisitionStage("ready")).toContain("analysis is separate");
  expect(acquisitionStage("partial")).toContain("omissions");
  expect(acquisitionStage("rate_limited")).toContain("explicit retry");
  expect(sourceDate(null)).toBe("Not recorded");
  expect(sourceDate(undefined)).toBe("Not recorded");
  expect(sourceDate(NaN)).toBe("Not recorded");
  expect(sourceDate(0)).toBe("1970-01-01T00:00:00.000Z");
});
