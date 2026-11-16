"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, FileText } from "lucide-react";
import type { FeedInsight } from "../lib/home-feed";
import { useInterfaceMotion } from "./motion-preference";
import styles from "./post-insight-strip.module.css";

export function PostInsightStrip({
  insights,
  selected,
  onSelect,
  renderFrame,
  evidence,
  children,
}: {
  insights: FeedInsight[];
  selected?: string;
  onSelect: (id: string) => void;
  renderFrame: (id: string) => ReactNode;
  evidence: (insight: FeedInsight) => ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  const active = insights.find((insight) => insight.id === selected);
  const detail = useRef<HTMLElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const reveal = useRef<string | null>(null);
  const motion = useInterfaceMotion();
  useEffect(() => {
    if (!selected || reveal.current !== selected) return;
    reveal.current = null;
    const panel = detail.current;
    if (!panel || panel.hidden) return;
    const edge =
      panel.closest("dialog[open]")?.getBoundingClientRect().bottom ??
      window.innerHeight - (window.innerWidth <= 720 ? 55 : 12);
    const box = panel.getBoundingClientRect();
    if (box.top + Math.min(box.height, 90) > edge)
      panel.scrollIntoView({
        block: "nearest",
        behavior: motion ? "smooth" : "instant",
      });
  }, [selected, motion]);
  return (
    <div className={styles.strip}>
      <div className={styles.rail} role="toolbar" aria-label="Post insights">
        {insights.map((insight, index) => (
          <button
            key={insight.id ?? index}
            type="button"
            ref={(element) => {
              cards.current[index] = element;
            }}
            className={styles.card}
            data-insight-id={insight.id}
            aria-expanded={active?.id === insight.id}
            aria-controls={id}
            tabIndex={index === Math.min(focusIndex, insights.length - 1) ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onKeyDown={(event) => {
              const last = insights.length - 1;
              const destination = {
                ArrowLeft: Math.max(0, index - 1),
                ArrowRight: Math.min(last, index + 1),
                Home: 0,
                End: last,
              }[event.key];
              if (destination === undefined) return;
              event.preventDefault();
              cards.current[destination]?.focus();
            }}
            onClick={() => {
              reveal.current = active?.id === insight.id ? null : insight.id;
              onSelect(insight.id);
            }}
          >
            <span className={styles.image}>
              {insight.frame ? (
                renderFrame(insight.frame.id)
              ) : (
                <span className={styles.fallback}>
                  <FileText size={22} aria-hidden="true" />
                  {insight.hasTranscript
                    ? "Transcript excerpt"
                    : "Text insight"}
                </span>
              )}
              {insight.frame?.timeMs != null && (
                <small>
                  {Math.floor(insight.frame.timeMs / 60000)}:
                  {String(
                    Math.floor(insight.frame.timeMs / 1000) % 60,
                  ).padStart(2, "0")}
                </small>
              )}
            </span>
            <span className={styles.title}>
              {insight.title ?? insight.claim}
              {active?.id === insight.id && (
                <Check size={14} aria-hidden="true" />
              )}
            </span>
          </button>
        ))}
      </div>
      <section
        id={id}
        ref={detail}
        aria-label={active?.title ?? "Insight details"}
        className={styles.detail}
        hidden={!active}
      >
        {active && (
          <>
            <p>{active.claim}</p>
            {evidence(active)}
            {!!active.resources?.length && (
              <div className={styles.resources}>
                <strong>Resources</strong>
                {active.resources.map((resource) => (
                  <a
                    key={resource.url}
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {resource.name}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                ))}
              </div>
            )}
            {children}
          </>
        )}
      </section>
    </div>
  );
}
