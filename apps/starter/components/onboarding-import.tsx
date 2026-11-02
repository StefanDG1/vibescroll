"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileUp,
  Bookmark,
  SlidersHorizontal,
  ExternalLink,
  Check,
} from "lucide-react";
import { OnboardingGraphic } from "./onboarding-graphic";
import { ErrorState } from "./assistant-elements/error-state";
import { track } from "@/lib/analytics";
import styles from "./onboarding.module.css";

const steps = [
  {
    title: "Open your information settings",
    text: "In Instagram, open your profile and menu. Look for Your information and permissions in Meta Account or Accounts Center.",
    Icon: SlidersHorizontal,
  },
  {
    title: "Create an export to your device",
    text: "Choose Export your information, select your Instagram profile and export to your device.",
    Icon: Download,
  },
  {
    title: "Choose only your Saved information",
    text: "Select Saved, choose All time and JSON where available. You do not need to export your messages, photos or other account data.",
    Icon: Bookmark,
  },
  {
    title: "Bring the file back here",
    text: "Instagram may take time to prepare it. When it is ready, download the ZIP or Saved JSON/HTML file. You can continue with a ready post while you wait.",
    Icon: FileUp,
  },
];
export function OnboardingImport({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const [guide, setGuide] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ count: number; duplicates: number }>();
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const step = guide === undefined ? null : steps[guide];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [guide]);
  return (
    <section className={styles.stage} data-onboarding-stage="import">
      {!step && (
        <button type="button" className={styles.secondary} onClick={onBack}>
          <ArrowLeft size={17} /> Back
        </button>
      )}
      <h1 ref={heading} tabIndex={-1}>
        {step?.title ?? "Bring your Instagram saves into VibeScroll."}
      </h1>
      {!step ? (
        <>
          <p className={styles.subtle}>
            Choose your Saved export, review the links and decide what to bring
            in.
          </p>
          <OnboardingGraphic kind="import" />
          <div className={styles.importPaths}>
            <button type="button" onClick={() => setGuide(0)}>
              <Download size={23} />
              <span>
                <strong>Get my Instagram export</strong>
                <small>A short guide to finding your saves</small>
              </span>
              <ArrowRight size={18} />
            </button>
            <button type="button" onClick={() => fileInput.current?.click()}>
              <FileUp size={23} />
              <span>
                <strong>I already have a file</strong>
                <small>Preview its Saved links on this device</small>
              </span>
              <ArrowRight size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.guideVisual} aria-hidden="true">
            <step.Icon size={56} strokeWidth={1.3} />
          </div>
          <p className={styles.guideCopy}>{step.text}</p>
          <div
            className={styles.guideProgress}
            aria-label={`Export guide step ${guide! + 1} of ${steps.length}`}
          >
            {steps.map((item, index) => (
              <span key={item.title} data-current={index === guide} />
            ))}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setGuide(guide! > 0 ? guide! - 1 : undefined)}
            >
              <ArrowLeft size={16} /> Back
            </button>
            {guide! < steps.length - 1 ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() => setGuide(guide! + 1)}
              >
                Next <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={() => fileInput.current?.click()}
              >
                Choose my file <FileUp size={16} />
              </button>
            )}
          </div>
        </>
      )}
      <input
        ref={fileInput}
        className={styles.fileInput}
        type="file"
        aria-label="Preview Instagram Saved export"
        accept=".zip,.json,.html,.htm"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          controller.current?.abort();
          const current = new AbortController();
          controller.current = current;
          setBusy(true);
          setError("");
          setResult(undefined);
          try {
            const { previewLinkFile, SAVED_TEXT_LIMIT } =
              await import("../../../packages/instagram-import");
            const preview = /\.zip$/i.test(file.name)
              ? await (
                  await import("../../../packages/instagram-zip")
                ).previewInstagramZip(file, current.signal)
              : file.size <= SAVED_TEXT_LIMIT
                ? previewLinkFile(
                    new TextDecoder("utf-8", { fatal: true }).decode(
                      await file.arrayBuffer(),
                    ),
                    file.name,
                  )
                : null;
            if (!preview)
              throw Error("Choose Saved JSON/HTML within 8 MB, or its ZIP.");
            if (current.signal.aborted) return;
            setResult({
              count: preview.links.length,
              duplicates: preview.duplicates,
            });
            track("import_previewed", {
              format: preview.format,
              count: preview.links.length,
            });
          } catch (e) {
            if (!current.signal.aborted)
              setError(
                e instanceof Error ? e.message : "This file could not be read.",
              );
          } finally {
            if (controller.current === current) setBusy(false);
          }
        }}
      />
      {busy && (
        <output aria-live="polite">Reading Saved links on this device…</output>
      )}
      {result && (
        <output className={styles.notice}>
          <Check size={17} /> {result.count} unique links found
          {result.duplicates ? `; ${result.duplicates} duplicates skipped` : ""}
          . After setup, reselect this file in Save to choose what to import.
          Nothing has been uploaded or analyzed.
        </output>
      )}
      {error && (
        <ErrorState title="This file needs another look" detail={error} />
      )}
      <p className={styles.footnote}>
        Instagram's labels can vary.{" "}
        <a
          href="https://www.facebook.com/help/instagram/181231772500920?cms_platform=iphone-app"
          target="_blank"
          rel="noreferrer"
        >
          Official export help <ExternalLink size={12} />
        </a>
        . Only selected post links are imported. New analysis is quoted
        separately.
      </p>
      <button className={styles.secondary} type="button" onClick={onContinue}>
        Continue with a ready post <ArrowRight size={16} />
      </button>
    </section>
  );
}
