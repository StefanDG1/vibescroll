"use client";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import type {
  DiscoveryPage,
  DiscoverySource,
} from "../../../packages/reader/discovery";
import { SettingsPanel } from "./settings-panel";
import styles from "./insight-discovery.module.css";

/** The SVG encodes returned citations only. Results are never delayed for motion. */
export function InsightDiscovery({
  page,
  query,
  busy,
  error,
  compact = false,
  onOpen,
  onMore,
}: {
  page: DiscoveryPage | null;
  query: string;
  busy: boolean;
  error?: string;
  compact?: boolean;
  onOpen: (source: DiscoverySource) => void;
  onMore: () => void;
}) {
  const visible = page?.insights.slice(0, compact ? 3 : 20) ?? [];
  const connections = visible.slice(0, 3);
  const sources = (page?.sources ?? [])
    .filter((s) => connections.some((i) => i.sourceKey === s.key))
    .slice(0, 3);
  const status = busy
    ? "Searching saved knowledge"
    : page?.hasMore || page?.partial
      ? "Partial results"
      : "Search complete";
  return (
    <section
      className={styles.discovery}
      aria-label="Search insights"
      data-busy={busy}
    >
      <div className={styles.heading}>
        <div>
          <output className={styles.status}>{status}</output>
          <h1>{query ? `Ideas for “${query}”` : "Your saved knowledge"}</h1>
        </div>
        <Search size={20} aria-hidden="true" />
      </div>
      {!page && busy ? (
        <output className={styles.activity}>
          <span aria-hidden="true" />
          Looking for matching posts and insights…
        </output>
      ) : null}
      {sources.length > 0 && (
        <div className={styles.connections} aria-hidden="true">
          <div className={styles.nodes}>
            {sources.map((source, i) => (
              <span key={source.key}>
                <BookOpen size={14} />
                Source {i + 1}
              </span>
            ))}
          </div>
          <svg viewBox="0 0 600 88" preserveAspectRatio="none">
            {connections.map((insight, index) => {
              const from = sources.findIndex(
                (source) => source.key === insight.sourceKey,
              );
              return from < 0 ? null : (
                <path
                  key={insight.key}
                  d={`M ${((from + 0.5) * 600) / sources.length} 0 C ${((from + 0.5) * 600) / sources.length} 52, ${((index + 0.5) * 600) / connections.length} 36, ${((index + 0.5) * 600) / connections.length} 88`}
                />
              );
            })}
          </svg>
          <div className={styles.nodes}>
            {connections.map((insight) => (
              <span key={insight.key}>
                {insight.kind === "insight" ? "Retained insight" : "Post match"}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className={styles.results}>
        {visible.map((insight) => {
          const source = page?.sources.find((s) => s.key === insight.sourceKey);
          if (!source) return null;
          return (
            <article key={insight.key} className={styles.insight}>
              <h2>{insight.title}</h2>
              {insight.excerpt && <p>{insight.excerpt}</p>}
              <button type="button" onClick={() => onOpen(source)}>
                <BookOpen size={14} aria-hidden="true" />
                <span>{source.title}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
      {error && <p role="alert">{error}</p>}
      {page && !busy && !page.insights.length && (
        <p>
          {page.hasMore
            ? "No visible matches on this page. Continue to inspect the next bounded page."
            : "No matching insights were returned in this search."}
        </p>
      )}
      {page && (
        <footer className={styles.footer}>
          <span>
            {page.insights.filter((i) => i.kind === "insight").length} matching
            insights · {page.sources.length} sources
          </span>
          <SettingsPanel
            title="Search sources"
            triggerLabel="View search sources"
            trigger={<span>Sources</span>}
          >
            <p>
              Connections link returned matches to their cited source. They do
              not indicate semantic similarity.
            </p>
            {page.sources.map((source) => (
              <button
                className="button"
                key={source.key}
                onClick={() => onOpen(source)}
              >
                {source.title}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            ))}
            <p className="fine">{page.coverage}</p>
          </SettingsPanel>
        </footer>
      )}
      {page?.hasMore && (
        <button className="button" disabled={busy} onClick={onMore}>
          Continue search
        </button>
      )}
      {page?.coverage && <p className={styles.coverage}>{page.coverage}</p>}
    </section>
  );
}
