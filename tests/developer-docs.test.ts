import { expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  developerPages,
  readDeveloperPage,
  developerPage,
  developerSearchIndexes,
  mcpTools,
  docsToc,
  docsHeadingId,
} from "../apps/starter/lib/developer-docs";

it("publishes only manifest-selected documents and rejects path traversal", async () => {
  expect(developerPage("../../.env")).toBeUndefined();
  expect(await readDeveloperPage("../operations/CURRENT-STATE")).toBeNull();
  expect(await readDeveloperPage("mcp/subscription")).toMatchObject({
    page: { title: "Subscriptions and authentication" },
  });
  for (const page of developerPages)
    expect(existsSync(resolve("docs/developers", page.file))).toBe(true);
});

it("keeps local public links and generated tool anchors resolvable", async () => {
  const targets = new Set(
    developerPages.map((page) => `/docs${page.slug ? `/${page.slug}` : ""}`),
  );
  for (const page of developerPages) {
    const result = await readDeveloperPage(page.slug);
    for (const match of result!.text.matchAll(
      /\]\((\/docs[^)#]*)(?:#[^)]*)?\)/g,
    ))
      expect(targets.has(match[1]), match[1]).toBe(true);
  }
  expect(new Set(mcpTools.map((tool) => tool.name)).size).toBe(mcpTools.length);
  const indexes = await developerSearchIndexes();
  expect(
    indexes.find((item) => item.title === "save_project_proposal")?.url,
  ).toBe("/docs/mcp/tools#save_project_proposal");
  expect(indexes.every((item) => item.url.startsWith("/docs"))).toBe(true);
  expect(JSON.stringify(indexes)).not.toContain(
    "nn7d15ckc9p6xsx0z7sd09w7298fey3s",
  );
});

it("builds stable accessible anchors and ignores headings inside code", () => {
  expect(
    docsToc(
      "## Which route pays\n```text\n## not a heading\n```\n### Version 2",
    ),
  ).toEqual([
    { title: "Which route pays", url: "#which-route-pays", depth: 2 },
    { title: "Version 2", url: "#version-2", depth: 3 },
  ]);
  expect(docsHeadingId("Results, limits and errors")).toBe(
    "results-limits-and-errors",
  );
});

it("keeps public docs independent of authentication, Convex and paid execution", () => {
  for (const path of [
    "apps/starter/app/api/docs-search/route.ts",
    "apps/starter/lib/developer-docs.ts",
    "apps/starter/app/docs/[[...slug]]/page.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(
      /from ["'][^"']*(?:convex|workos|assistant-request)/,
    );
    expect(source).not.toMatch(/process\.env\.(?:.*KEY|.*SECRET|.*TOKEN)/);
  }
});
