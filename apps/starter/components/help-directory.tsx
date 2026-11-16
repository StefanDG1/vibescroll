"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useRef, useState } from "react";

type Article = { slug: string; title: string; summary: string };
const keywords: Record<string, string> = {
  "getting-started": "onboarding first post sign in",
  "first-useful-insight": "evidence transcript frames screenshot",
  "organize-your-library": "search sort tags filters topics categories",
  "evaluate-an-idea-for-a-project": "github repository fit review context",
  "processing-and-recovery": "credits payment usage allowance stuck retry",
  "imports-and-data": "instagram export saved posts privacy download",
  "actions-and-publication": "issue pull request approve publication",
  "share-a-post": "instagram tiktok reels paste upload save link",
  "work-cloud-text-review": "assistant chatgpt cloud codex automatic",
};

export function HelpDirectory({ articles }: { articles: Article[] }) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = articles.filter(({ slug, title, summary }) => {
    const searchable =
      `${title} ${summary} ${keywords[slug] ?? ""}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });

  return (
    <section aria-label="Help articles">
      <div className="public-search">
        <label htmlFor="search-help">Search help</label>
        <div>
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            id="search-help"
            ref={search}
            placeholder="Try “save a post”"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="public-icon-button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                search.current?.focus();
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <output className="sr-only" aria-live="polite">
        {visible.length} {visible.length === 1 ? "guide" : "guides"}
      </output>
      {visible.length > 0 ? (
        <div className="public-card-grid">
          {visible.map(({ slug, title, summary }) => (
            <Link
              className="public-list-card"
              key={slug}
              href={`/help/${slug}`}
            >
              <h2>{title}</h2>
              <p>{summary}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="public-state-card">
          <h2>No matching guides</h2>
          <p>Try a word like “save”, “credits” or “project”.</p>
        </div>
      )}
    </section>
  );
}
