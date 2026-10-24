import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import manifest from "../docs/help/manifest.json";
import {
  helpArticle,
  helpArticles,
  helpAsset,
  readHelpArticle,
  safeHelpUrl,
} from "../apps/starter/lib/help-content";

describe("public task help", () => {
  it.each(["root", "starter"])(
    "reads the actual approved files from the %s working directory",
    async (directory) => {
      const root = process.cwd();
      const cwd = vi
        .spyOn(process, "cwd")
        .mockReturnValue(
          directory === "root" ? root : resolve(root, "apps/starter"),
        );
      try {
        for (const article of helpArticles) {
          expect((await readHelpArticle(article.slug))?.content).toBe(
            readFileSync(resolve(root, "docs/help", article.file), "utf8"),
          );
        }
        expect(await readHelpArticle("../../.env")).toBeNull();
        expect(
          await readHelpArticle("advanced-troubleshooting-draft"),
        ).toBeNull();
      } finally {
        cwd.mockRestore();
      }
    },
  );
  it("rejects malformed manifest filenames before selecting a filesystem path", async () => {
    const article = helpArticle("getting-started")!;
    const original = article.file;
    try {
      for (const filename of [
        "../../private.md",
        "nested/article.md",
        "article\\private.md",
        "article.json",
        "/private.md",
      ]) {
        article.file = filename;
        expect(await readHelpArticle(article.slug)).toBeNull();
      }
    } finally {
      article.file = original;
    }
  });
  it("exposes only approved known slugs and reads allowlisted Markdown", async () => {
    expect(helpArticle("advanced-troubleshooting-draft")).toBeUndefined();
    expect(helpArticle("../../.env")).toBeUndefined();
    expect(await readHelpArticle("unknown")).toBeNull();
    expect(await readHelpArticle("getting-started")).toMatchObject({
      article: { slug: "getting-started" },
      content: expect.stringMatching(/^# /),
    });
    expect(new Set(helpArticles.map((article) => article.slug)).size).toBe(
      helpArticles.length,
    );
  });
  it("keeps content, dependencies, related articles and public assets reviewable", () => {
    for (const article of manifest.articles) {
      expect(existsSync(resolve("docs/help", article.file))).toBe(true);
      expect(article.lastVerifiedCommit).toMatch(/^[a-f0-9]{7,40}$/);
      for (const path of article.dependencies)
        expect(existsSync(path)).toBe(true);
      if (article.status !== "approved") continue;
      for (const related of article.related)
        expect(helpArticle(related)).toBeDefined();
      const text = readFileSync(resolve("docs/help", article.file), "utf8");
      for (const match of text.matchAll(
        /(!?)\[[^\]]*\]\((\/help\/[^)#]+)(?:#[^)]*)?\)/g,
      )) {
        if (match[1] === "!")
          expect(helpAsset(match[2], article.assets)).toBeDefined();
        else expect(helpArticle(match[2].slice("/help/".length))).toBeDefined();
      }
      for (const path of article.assets as string[]) {
        const asset = helpAsset(path, article.assets);
        expect(asset).toBeDefined();
        expect(existsSync(resolve("apps/starter/public", path.slice(1)))).toBe(
          true,
        );
      }
    }
  });
  it("does not render unreviewed or external images", () => {
    expect(helpAsset("https://example.com/private.png", [])).toBeUndefined();
    expect(
      helpAsset("/help/unreviewed.png", ["/help/unreviewed.png"]),
    ).toBeUndefined();
  });
  it("rejects executable URLs, protocol-relative redirects and credentials", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "//example.com",
      "/\\evil",
      "https://token@example.com/",
      "file:///private",
      "relative.md",
      "mailto:a@b.test?body=private",
    ])
      expect(safeHelpUrl(value)).toBe("");
    for (const value of [
      "/help/getting-started",
      "#costs",
      "https://example.com/",
      "mailto:support@example.com",
    ])
      expect(safeHelpUrl(value)).toBe(value);
  });
});
