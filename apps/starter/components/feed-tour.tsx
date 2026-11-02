"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  CircleHelp,
  FolderGit2,
  Lightbulb,
  Link2,
  X,
} from "lucide-react";
import styles from "./feed-tour.module.css";

const storageKey = "vibescroll.feed-tour.v1";
const steps = [
  {
    title: "Start with a post",
    text: "Search the ready posts below, or save a Reel or TikTok link of your own.",
    Icon: Link2,
  },
  {
    title: "Find the useful part",
    text: "Open a post to read its insights. Expand any idea for the details and sources.",
    Icon: Lightbulb,
  },
  {
    title: "Put it to work",
    text: "Choose a project and create a plan. You review it before an issue is published.",
    Icon: FolderGit2,
  },
];

export function FeedTour({ autoStart = false }: { autoStart?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const autoDismissed = useRef(false);
  const titleId = useId();
  useEffect(() => {
    if (!autoStart) return;
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {
      /* Optional storage. */
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      if (autoDismissed.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (autoDismissed.current) return;
        if (
          document.activeElement?.matches("input,textarea") ||
          window.scrollY > 100
        )
          return;
        setOpen(true);
      }, 600);
    };
    // A first visit has one prompt at a time. Rejected analytics still unlocks
    // the tutorial; it never depends on opting into tracking.
    try {
      const cookie = document.cookie
        .split("; ")
        .find((value) => value.startsWith("vs_consent="));
      const consent =
        cookie &&
        JSON.parse(decodeURIComponent(cookie.slice("vs_consent=".length)));
      if (consent?.revision === 1 && Array.isArray(consent.categories))
        schedule();
    } catch {
      /* The consent controls handle an invalid preference. */
    }
    window.addEventListener("vibescroll:consent-changed", schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("vibescroll:consent-changed", schedule);
    };
  }, [autoStart]);
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    previousFocus.current = document.activeElement;
    const triggerElement = trigger.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (
        previousFocus.current instanceof HTMLElement &&
        previousFocus.current.isConnected
      )
        previousFocus.current.focus({ preventScroll: true });
      else triggerElement?.focus({ preventScroll: true });
    };
  }, [open]);
  function dismiss() {
    autoDismissed.current = true;
    setOpen(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* Optional storage. */
    }
  }
  const { title, text, Icon } = steps[step];
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label="Quick tour"
        title="Quick tour"
        onClick={() => {
          autoDismissed.current = true;
          setStep(0);
          setOpen(true);
        }}
      >
        <CircleHelp size={19} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          dismiss();
        }}
      >
        <button
          type="button"
          className={styles.close}
          aria-label="Skip tour"
          onClick={dismiss}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className={styles.slide} key={step}>
          <div className={styles.visual}>
            <Icon size={34} strokeWidth={1.5} aria-hidden="true" />
            <span />
            <span />
          </div>
          <h2 id={titleId}>{title}</h2>
          <p>{text}</p>
        </div>
        <footer>
          <div className={styles.dots} aria-label={`Step ${step + 1} of 3`}>
            {steps.map((_, index) => (
              <span key={index} data-active={index === step} />
            ))}
          </div>
          <button
            type="button"
            className={styles.next}
            onClick={() => (step === 2 ? dismiss() : setStep(step + 1))}
          >
            {step === 2 ? "Start scrolling" : "Next"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </footer>
      </dialog>
    </>
  );
}
