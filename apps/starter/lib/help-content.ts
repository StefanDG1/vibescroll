import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import manifest from "../../../docs/help/manifest.json";

export type HelpAsset = {
  path: string;
  status: "approved" | "draft";
  alt: string;
  caption: string;
  width: number;
  height: number;
  captureCommit: string;
  synthetic: boolean;
};
export function helpAsset(path: string, allowed: readonly string[]) {
  return (manifest.assets as HelpAsset[]).find(
    (asset) =>
      asset.path === path &&
      allowed.includes(path) &&
      asset.status === "approved" &&
      asset.synthetic &&
      /^\/help\/[a-z0-9-]+\.(png|webp)$/.test(asset.path),
  );
}

export const helpArticles = manifest.articles.filter(
  (article) => article.status === "approved",
);
export function helpArticle(slug: string) {
  return helpArticles.find((article) => article.slug === slug);
}
export async function readHelpArticle(slug: string) {
  const article = helpArticle(slug);
  if (!article || !/^[a-z][a-z-]*\.md$/.test(article.file)) return null;
  // Only manifest entries can select a file. No request text becomes a path.
  const content = await readFile(
    resolve(
      process.cwd(),
      basename(process.cwd()) === "starter" ? "../../docs/help" : "docs/help",
      article.file,
    ),
    "utf8",
  );
  return { article, content };
}
export function safeHelpUrl(value: string) {
  if (/^#[a-zA-Z0-9_-]*$/.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//") && !/[\\\s]/.test(value))
    return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
    if (
      url.protocol === "mailto:" &&
      !url.search &&
      !url.hash &&
      /^[^?\s]+@[^?\s]+$/.test(url.pathname)
    )
      return value;
  } catch {
    // Invalid and relative external URLs are not navigation targets.
  }
  return "";
}
