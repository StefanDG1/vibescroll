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
const examples = [
  {
    label: "Inspect a cited idea",
    href: "/example#sample-evidence",
    description: "Authored synthetic passage and cited idea.",
  },
  {
    label: "Compare project decisions",
    href: "/example#decision-title",
    description:
      "Synthetic project decisions: useful to investigate, already implemented and no fit.",
  },
  {
    label: "Inspect an existing result",
    href: "/example#existing-result",
    description:
      "Founder-account production output captured October 22, 2026. No new processing or customer result.",
  },
  {
    label: "Explore the Library",
    href: "/demo?view=library",
    description: "Interactive Library demonstration with synthetic data.",
  },
  {
    label: "Try a first source",
    href: "/help/getting-started",
    description:
      "Help guide. Your source rights and current processing readiness still apply.",
  },
] as const;
function subscribeDesktop(listener: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
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
const serverDisabled = () => false;

/** Navigates approved examples only. The optional cycle never submits a task. */
export function ScrollShowPrompts() {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [restart, setRestart] = useState(0);
  const [visible, setVisible] = useState(false);
  const motion = useInterfaceMotion();
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    desktopSnapshot,
    serverDisabled,
  );
  const documentVisible = useSyncExternalStore(
    subscribeVisibility,
    visibilitySnapshot,
    serverDisabled,
  );
  const eligible = motion && desktop && documentVisible && visible;
  useEffect(() => {
    const element = container.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active) return;
        const entry = entries.find((item) => item.target === element);
        if (entry)
          setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.5);
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!playing || !eligible) return;
    const timer = setTimeout(
      () => setSelected((index) => (index + 1) % examples.length),
      3000,
    );
    return () => clearTimeout(timer);
  }, [playing, eligible, selected, restart]);

  const example = examples[selected];
  function pause() {
    setPlaying(false);
  }
  return (
    <div
      ref={container}
      className="ss-prompts"
      onFocusCapture={pause}
      onKeyDownCapture={pause}
    >
      <label htmlFor={`${id}-choice`}>What would you like to explore?</label>
      <div className="ss-prompt-choice">
        <select
          id={`${id}-choice`}
          value={selected}
          aria-describedby={`${id}-scope ${id}-description`}
          onChange={(event) => {
            const index = Number(event.target.value);
            if (
              Number.isInteger(index) &&
              index >= 0 &&
              index < examples.length
            )
              setSelected(index);
            pause();
          }}
        >
          {examples.map((item, index) => (
            <option key={item.href} value={index}>
              {item.label}
            </option>
          ))}
        </select>
        <a className="secondary" href={example.href}>
          Try this example
        </a>
      </div>
      <p id={`${id}-description`} className="ss-prompt-detail">
        {example.description}
      </p>
      <p id={`${id}-scope`} className="ss-note">
        Opens an existing example or guide; starts no analysis.
      </p>
      <div
        className="ss-prompts-controls"
        aria-label="Example cycling controls"
      >
        <button
          type="button"
          className="secondary"
          disabled={playing || !eligible}
          onClick={() => setPlaying(true)}
        >
          Play examples
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!playing}
          onClick={pause}
        >
          Pause examples
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!eligible}
          onClick={() => {
            setSelected(0);
            setPlaying(true);
            setRestart((value) => value + 1);
          }}
        >
          Restart examples
        </button>
      </div>
      <p className="ss-note">
        {playing
          ? eligible
            ? "Example cycling is playing."
            : "Example cycling is suspended while this control is hidden or motion is unavailable."
          : "Examples stay still until you choose Play on a supported desktop. Focus or selection pauses cycling."}
      </p>
      <noscript>
        <p>
          JavaScript is off. Open the direct links below to choose a
          destination.
        </p>
      </noscript>
      <details className="ss-prompt-alternatives">
        <summary>Open any example or guide directly</summary>
        <ul
          className="ss-prompt-links"
          aria-label="Open an example or guide directly"
        >
          {examples.map((item) => (
            <li key={item.href}>
              <a href={item.href}>{item.label}</a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
