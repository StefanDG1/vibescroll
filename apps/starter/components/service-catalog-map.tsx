import type { ServiceCatalogCard } from "../../../packages/social/catalog";

/** Membership only, derived from one currently checked page. No network or private context. */
export function ServiceCatalogMap({
  cards,
}: {
  cards: readonly ServiceCatalogCard[];
}) {
  const sources = cards.slice(0, 5);
  const all = [...new Set(sources.flatMap((card) => card.categories))].sort();
  const categories = all.slice(0, 9);
  if (!categories.length)
    return (
      <p>No generic category memberships are recorded for this checked page.</p>
    );
  const y = (index: number, length: number) =>
    35 + (index * 290) / Math.max(1, length - 1);
  return (
    <section
      aria-label="Checked page category memberships"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h3>Categories on this checked page</h3>
      <p>
        The list shows recorded generic category membership for the currently
        shown, unexpired analyses only. It is not a similarity judgment, creator
        rating or platform trend.
      </p>
      {all.length > categories.length && (
        <p>
          The map and list show the first nine categories alphabetically. Other
          categories remain on the analysis cards.
        </p>
      )}
      <ul>
        {categories.map((category) => (
          <li key={category}>
            <strong>{category.replaceAll("_", " ")}</strong>
            <ul>
              {sources
                .filter((card) => card.categories.includes(category))
                .map((card) => (
                  <li key={card.artifactId}>{card.title}</li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
      <details>
        <summary>Show the optional category map</summary>
        <p>
          Categories are on the left and analyses on the right. Use the
          membership list above to read every label.
        </p>
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 640 360"
          width="640"
          height="360"
          style={{
            display: "block",
            width: "100%",
            maxWidth: 640,
            height: "auto",
            color: "var(--ink)",
          }}
        >
          {categories.flatMap((category, ci) =>
            sources.map((card, si) =>
              card.categories.includes(category) ? (
                <line
                  key={`${category}:${card.artifactId}`}
                  x1="190"
                  y1={y(ci, categories.length)}
                  x2="420"
                  y2={y(si, sources.length)}
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.35"
                />
              ) : null,
            ),
          )}
          {categories.map((category, index) => (
            <g key={category}>
              <circle
                cx="190"
                cy={y(index, categories.length)}
                r="5"
                fill="currentColor"
              />
              <text
                x="178"
                y={y(index, categories.length) + 4}
                textAnchor="end"
                fill="currentColor"
                fontSize="13"
              >
                {category.replaceAll("_", " ").slice(0, 20)}
                {category.length > 20 ? "…" : ""}
              </text>
            </g>
          ))}
          {sources.map((card, index) => (
            <g key={card.artifactId}>
              <rect
                x="415"
                y={y(index, sources.length) - 5}
                width="10"
                height="10"
                fill="currentColor"
              />
              <text
                x="435"
                y={y(index, sources.length) + 4}
                fill="currentColor"
                fontSize="13"
              >
                {card.title.slice(0, 24)}
                {card.title.length > 24 ? "…" : ""}
              </text>
            </g>
          ))}
        </svg>
      </details>
    </section>
  );
}
