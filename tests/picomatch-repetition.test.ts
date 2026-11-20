import { createRequire } from "node:module";
import { expect, it } from "vitest";

const fromRepomix = createRequire(import.meta.resolve("repomix"));
const fromGlobby = createRequire(fromRepomix.resolve("globby"));
const fromMicromatch = createRequire(fromGlobby.resolve("micromatch"));
const fromDocs = createRequire(
  createRequire(import.meta.url).resolve("fumadocs-core/package.json", {
    paths: [`${process.cwd()}/apps/starter`],
  }),
);
const fromTinyglobby = createRequire(fromDocs.resolve("tinyglobby"));

for (const [name, resolve] of [
  ["Repomix", fromMicromatch],
  ["docs", fromTinyglobby],
] as const) {
  const match = resolve("picomatch");
  it(`keeps ordinary ${name} patterns and treats a wildcard inside a repeated group literally`, () => {
    expect(match("src/**/*.ts")("src/read/index.ts")).toBe(true);
    expect(match("+(red|blue).ts")("redblue.ts")).toBe(true);
    expect(match("+(file*).ts")("+(file*).ts")).toBe(true);
    expect(match("+(file*).ts", { maxExtglobRecursion: false })("file.ts")).toBe(false);
  });
}
