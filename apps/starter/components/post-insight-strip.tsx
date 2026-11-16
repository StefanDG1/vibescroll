"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ArrowUpRight, ChevronDown, FileText } from "lucide-react";
import type { FeedInsight } from "../lib/home-feed";
import { useInterfaceMotion } from "./motion-preference";
import styles from "./post-insight-strip.module.css";

const desktopQuery = "(min-width: 1040px)";
function subscribeDesktop(notify: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

export function PostInsightStrip({
  insights,
  selected,
  onSelect,
  renderFrame,
  evidence,
  children,
  desktopList = false,
}: {
  insights: FeedInsight[];
  selected?: string;
  onSelect: (id: string) => void;
  renderFrame: (id: string) => ReactNode;
  evidence: (insight: FeedInsight) => ReactNode;
  children?: ReactNode;
  desktopList?: boolean;
}) {
  const id = useId();
  const wide = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
  const vertical = desktopList && wide;
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
  const renderPanel = (panelId: string) => (
    <section
      id={panelId}
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
  );
  return (
    <div className={styles.strip} data-vertical={vertical}>
      <div
        className={styles.rail}
        role={vertical ? undefined : "toolbar"}
        aria-label="Post insights"
      >
        {insights.map((insight, index) => (
          <div className={styles.item} key={insight.id ?? index}>
            <button
              type="button"
              ref={(element) => {
                cards.current[index] = element;
              }}
              className={styles.card}
              data-insight-id={insight.id}
              aria-expanded={active?.id === insight.id}
              aria-controls={vertical ? `${id}-${index}` : id}
              tabIndex={
                vertical || index === Math.min(focusIndex, insights.length - 1)
                  ? 0
                  : -1
              }
              onFocus={() => setFocusIndex(index)}
              onKeyDown={(event) => {
                const last = insights.length - 1;
                const destination = {
                  [vertical ? "ArrowUp" : "ArrowLeft"]: Math.max(0, index - 1),
                  [vertical ? "ArrowDown" : "ArrowRight"]: Math.min(
                    last,
                    index + 1,
                  ),
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
              </span>
              <ChevronDown
                className={styles.disclosure}
                size={15}
                aria-hidden="true"
              />
            </button>
            {vertical &&
              (active?.id === insight.id ? (
                renderPanel(`${id}-${index}`)
              ) : (
                <div id={`${id}-${index}`} hidden />
              ))}
          </div>
        ))}
      </div>
      {!vertical && renderPanel(id)}
    </div>
  );
}
