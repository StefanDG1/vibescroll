"use client";

import { useState } from "react";
import Link from "next/link";
import { Folder, Search, Tag, X } from "lucide-react";

type Category = {
  key: string;
  name: string;
  count: number;
  level?: string;
};

export function CategoryDirectory({
  organizationId,
  categories,
}: {
  organizationId: string;
  categories: Category[];
}) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(12);
  const matches = categories
    .filter(
      (category) =>
        category.count > 0 &&
        category.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <section className="category-directory" aria-labelledby="categories-title">
      <header>
        <div>
          <h2 id="categories-title">Browse categories</h2>
          <p>Find saved posts by topic or collection.</p>
        </div>
        <search className="posts-search-field" aria-label="Find categories">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Find categories"
            placeholder="Find categories"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisible(12);
            }}
          />
          {query && (
            <button
              type="button"
              className="asset-icon-button"
              aria-label="Clear category search"
              onClick={() => setQuery("")}
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </search>
      </header>
      {matches.length ? (
        <ul>
          {matches.slice(0, visible).map((category) => {
            const Mark = category.level === "collection" ? Folder : Tag;
            return (
              <li key={category.key}>
                <Link
                  href={`/app/${organizationId}/posts?category=${encodeURIComponent(category.key)}`}
                  prefetch={false}
                >
                  <Mark size={17} aria-hidden="true" />
                  <span>{category.name}</span>
                  <small>
                    {category.count} {category.count === 1 ? "post" : "posts"}
                  </small>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <output className="directory-empty">
          {query
            ? "No categories match this search."
            : "Categories appear as you organize and analyze posts."}
        </output>
      )}
      {matches.length > visible && (
        <button
          type="button"
          className="button secondary"
          onClick={() => setVisible((count) => count + 12)}
        >
          More categories
        </button>
      )}
    </section>
  );
}
