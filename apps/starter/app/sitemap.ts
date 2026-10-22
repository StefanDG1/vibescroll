import type { MetadataRoute } from "next";
import { helpArticles } from "@/lib/help-content";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "pricing",
    "how-it-works",
    "docs",
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
