import type { MetadataRoute } from "next";
import { helpArticles } from "@/lib/help-content";
import { developerPages } from "@/lib/developer-docs";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "pricing",
    "how-it-works",
    ...developerPages.map(({ slug }) => `docs${slug ? `/${slug}` : ""}`),
    "help",
    "example",
    "open-source",
    "about",
    "contact",
    "status",
    "faq",
    ...helpArticles.map(({ slug }) => `help/${slug}`),
  ].map((path) => ({ url: `https://scroll.companynerve.com/${path}` }));
}
