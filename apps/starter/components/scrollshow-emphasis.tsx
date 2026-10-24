"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useInterfaceMotion } from "./motion-preference";

const desktopQuery =
  "(min-width: 768px) and (hover: hover) and (pointer: fine)";
const serverDisabled = () => false;
const noSubscription = () => () => {};
function subscribeDesktop(listener: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function desktopSnapshot() {
  return window.matchMedia(desktopQuery).matches;
}
function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
function visibilitySnapshot() {
  return !document.hidden;
}
function observerSnapshot() {
  return typeof IntersectionObserver !== "undefined";
}

/** Optional decoration over the original, always-readable explanation. */
export function ScrollShowEmphasis({
  children,
}: {
  children: React.ReactNode;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<Element>());
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);
  const motion = useInterfaceMotion();
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    desktopSnapshot,
    serverDisabled,
  );
  const visible = useSyncExternalStore(
    subscribeVisibility,
    visibilitySnapshot,
    serverDisabled,
  );
  const supported = useSyncExternalStore(
    noSubscription,
    observerSnapshot,
    serverDisabled,
  );
  const eligible = motion && desktop && visible && supported;

  useEffect(() => {
    const node = container.current;
    if (!node || !playing || !eligible) return;
    const cards = [
      ...node.querySelectorAll<HTMLElement>(".ss-evidence-trail > li"),
    ];
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active || document.hidden) return;
        for (const entry of entries) {
          const card = entry.target as HTMLElement;
          if (!cards.includes(card)) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            card.dataset.emphasisVisible = "true";
            if (!seen.current.has(card)) {
              seen.current.add(card);
              card.dataset.emphasisReveal = "true";
            }
          } else {
            delete card.dataset.emphasisVisible;
            delete card.dataset.emphasisReveal;
          }
        }
      },
      { threshold: [0, 0.4] },
    );
    for (const card of cards) observer.observe(card);
    return () => {
      active = false;
      observer.disconnect();
      for (const card of cards) {
        delete card.dataset.emphasisVisible;
        delete card.dataset.emphasisReveal;
      }
    };
  }, [playing, eligible, replay]);

  function pause() {
    setPlaying(false);
  }
  return (
    <div
      ref={container}
      className="ss-emphasis"
      onFocusCapture={pause}
      onKeyDownCapture={pause}
    >
      <div
        className="ss-emphasis-controls"
        aria-label="Explanation emphasis controls"
        aria-describedby={`${id}-scope`}
      >
        <button
          type="button"
          className="secondary"
          disabled={playing || !eligible}
          onClick={() => setPlaying(true)}
        >
          Play scroll emphasis
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!playing}
          onClick={pause}
        >
          Pause emphasis
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!eligible}
          onClick={() => {
            seen.current.clear();
            setReplay((value) => value + 1);
            setPlaying(true);
          }}
        >
          Replay emphasis
        </button>
      </div>
      <p className="ss-note" id={`${id}-scope`}>
        {playing
          ? eligible
            ? "Scroll emphasis is on for visible cards."
            : "Scroll emphasis is suspended while hidden or motion is unavailable."
          : "Optional desktop scroll emphasis is paused."}{" "}
        All three steps remain readable. Emphasis shows the explanation, not
        processing progress.
      </p>
      {children}
    </div>
  );
}
