"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import type { SetupSnapshot } from "../../../packages/onboarding/companion-setup";
import {
  instagramGuideSteps,
  journeyChapters,
  type JourneyAction,
  type ProjectBuilderJourney,
  type SkillRecommendation,
} from "../../../packages/onboarding/project-builder-journey";
import { useInterfaceMotion } from "./motion-preference";
import { ScrollCharacter } from "./scroll-character";

function JourneyIllustration({ chapter }: { chapter: number }) {
  const allowed = useInterfaceMotion();
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const animate = allowed && !paused && !hidden;
  return (
    <figure style={{ margin: "16px 0" }}>
      <svg
        viewBox="0 0 360 104"
        aria-hidden="true"
        style={{ width: "100%", maxWidth: 480, display: "block" }}
      >
        <title>
          Illustration only; no account connection or processing is shown
        </title>
        {[
          [8, "Source"],
          [128, "Idea"],
          [248, "Library"],
        ].map(([x, label], index) => (
          <motion.g
            key={`${chapter}-${replay}-${index}`}
            initial={false}
            animate={{ x: animate ? [0, 4, 0] : 0 }}
            transition={
              animate
                ? { duration: 1.2, delay: index * 0.2, repeat: 0 }
                : { duration: 0 }
            }
          >
            <rect
              x={Number(x)}
              y="16"
              width="104"
              height="68"
              rx="12"
              fill="var(--panel)"
              stroke="var(--line)"
            />
            <text
              x={Number(x) + 52}
              y="55"
              textAnchor="middle"
              fill="var(--ink)"
              fontSize="15"
            >
              {label}
            </text>
          </motion.g>
        ))}
        <path d="M114 50h12m108 0h12" stroke="var(--teal)" strokeWidth="3" />
      </svg>
      <figcaption>
        Illustration. Source → idea → private library. This is not a live task
        or a processing-time estimate.
      </figcaption>
      <div className="actions">
        <button
          type="button"
          className="secondary"
          onClick={() => setPaused(!paused)}
          disabled={!allowed}
        >
          {paused ? "Resume illustration" : "Pause illustration"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setPaused(false);
            setReplay(replay + 1);
          }}
          disabled={!allowed}
        >
          Replay illustration
        </button>
      </div>
      {!allowed && (
        <p className="fine">
          Static illustration. Your device or Interface motion preference is
          respected; every instruction remains available.
        </p>
      )}
    </figure>
  );
}

function sourceLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function ProjectBuilderGuide({
  journey,
  snapshot,
  onAction,
  onNavigate,
  onSave,
  recommendations = [],
  recommendationStatus = "unavailable",
  recommendationExplanation,
  followingAvailable = false,
  disabled = false,
}: {
  journey: ProjectBuilderJourney;
  snapshot: SetupSnapshot;
  onAction: (action: JourneyAction) => Promise<void>;
  onNavigate: (view: string) => void;
  onSave: () => void;
  recommendations?: readonly SkillRecommendation[];
  recommendationStatus?: "ready" | "unavailable" | "needs_context";
  recommendationExplanation?: string;
  followingAvailable?: boolean;
  disabled?: boolean;
}) {
  const headingId = useId();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [device, setDevice] = useState<"Android" | "iPhone" | "Computer">(
    "Computer",
  );
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterAction = useRef(false);
  useEffect(() => {
    if (!busy && focusAfterAction.current) {
      headingRef.current?.focus();
      focusAfterAction.current = false;
    }
  }, [busy, journey.updatedAt]);
  const done = journey.finishedAt !== undefined && journey.chapter === 5;
  const guideAcknowledged = journey.instagramGuide.acknowledgedAt !== undefined;
  const guideStep = instagramGuideSteps[journey.instagramGuide.step];
  const cards =
    recommendationStatus === "ready"
      ? recommendations
          .filter(
            (item) =>
              item.destination === "codex" &&
              item.license &&
              Number.isFinite(item.verifiedAt) &&
              item.verifiedAt > 0 &&
              sourceLink(item.sourceUrl),
          )
          .slice(0, 3)
      : [];
  const act = async (action: JourneyAction) => {
    if (disabled || busy) return;
    setBusy(true);
    setError("");
    focusAfterAction.current = true;
    try {
      await onAction(action);
    } catch {
      focusAfterAction.current = false;
      setError(
        "Progress was not confirmed. Check current setup before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const optional =
    (journey.chapter === 0 && journey.substep === 2) ||
    [1, 3, 5].includes(journey.chapter);
  const exportIntent = async (intent: "requested" | "later") => {
    await act({ type: "export_intent", intent });
  };
  return (
    <section
      className="panel form-grid"
      aria-labelledby={headingId}
      aria-busy={busy}
    >
      <div className="row wrap">
        <ScrollCharacter compact />
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          {done ? "Your setup is saved" : journeyChapters[journey.chapter]}
        </h2>
      </div>
      <p>
        Chapter {journey.chapter + 1} of {journeyChapters.length}.
      </p>
      <ol aria-label="Guide chapters">
        {journeyChapters.map((name, index) => (
          <li
            key={name}
            aria-current={index === journey.chapter ? "step" : undefined}
          >
            {name}
            {journey.completedChapters.includes(index) ? " · reviewed" : ""}
          </li>
        ))}
      </ol>
      {journey.exportIntent?.state === "requested" && (
        <aside className="panel" aria-label="Self-reported export task">
          <h3>Return when your export is ready</h3>
          <p>
            You reported requesting an Instagram export. VibeScroll has not
            verified its preparation or download. This saved intention starts no
            reminder, inbox access or analysis.
          </p>
          <button type="button" className="secondary" onClick={onSave}>
            Open Save to preview my real download
          </button>
          <a
            href="/help/instagram-export-guide"
            target="_blank"
            rel="noopener noreferrer"
          >
            Replay the static export instructions
          </a>
        </aside>
      )}
      {done ? (
        <>
          <p>
            {snapshot.sampleCited
              ? "A cited result is available in your library. Inspect its actual evidence and warnings."
              : "Setup completion is separate from your first insight. Existing sources can still be saved, waiting or failed."}
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => onNavigate("library")}
          >
            Open Library
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || busy}
            onClick={() => void act({ type: "replay" })}
          >
            Replay the guide
          </button>
        </>
      ) : (
        <>
          <JourneyIllustration chapter={journey.chapter} />
          {journey.chapter === 0 && journey.substep === 0 && (
            <>
              <h3>A little context</h3>
              <p>
                Your existing goal, interests and Personal/Business choices stay
                saved. Review them if they have changed; this guide does not
                replace your answers with AI suggestions.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => onNavigate("home")}
              >
                Review my library purpose
              </button>
            </>
          )}
          {journey.chapter === 0 && journey.substep === 1 && (
            <>
              <h3>Connect processing</h3>
              <p>
                Choose where tasks run in Continue setup. My own Cloud Work uses
                your ChatGPT subscription and is our recommended direction.
                VibeScroll's servers use credits bought separately. Local
                machine uses your own subscription and needs your computer on.
                Unavailable options stay disabled, with setup links beside them.
              </p>
              <details>
                <summary>Experimental text review</summary>
                <p>
                  Experimental Work Cloud text:{" "}
                  {snapshot.workCloudTextState === "available_unverified"
                    ? "Available for text review; processing connection unverified."
                    : snapshot.workCloudTextState === "unavailable"
                      ? "Not available for this account."
                      : "Text-review availability unverified."}{" "}
                  Review a supported text handoff without GitHub or a paired
                  computer. Successful host execution and video processing
                  remain unverified.{" "}
                  <Link href="/help/work-cloud-text-review" prefetch={false}>
                    Read the text handoff guide
                  </Link>
                  .
                </p>
              </details>
              <p>
                Paired: {snapshot.paired ? "yes" : "not yet"}. Current account
                observed: {snapshot.accountConnected ? "yes" : "not verified"}.
                Worker:{" "}
                {snapshot.workerAvailable ? "available" : "not verified"}. These
                observations do not guarantee model access or a successful task.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => onNavigate("runners")}
              >
                Review my computer
              </button>
              <a
                href="/help/connect-your-computer"
                target="_blank"
                rel="noopener noreferrer"
              >
                Processing setup help
              </a>
              <p>
                You can continue exploring while a route is unavailable.
                Continuing grants no provider consent, spending or processing
                authority.
              </p>
            </>
          )}
          {journey.chapter === 0 && journey.substep === 2 && (
            <>
              <h3>Connect a project, if useful</h3>
              <p>
                GitHub and selected repository context are optional. Connecting
                them can help evaluate an idea for your project; it does not
                approve coding or public publication.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => onNavigate("projects")}
              >
                Review GitHub and a project
              </button>
              <p>
                Project context:{" "}
                {snapshot.projectConfirmed
                  ? "confirmed in this workspace"
                  : "not confirmed"}
                . Library-only use remains available.
              </p>
            </>
          )}
          {journey.chapter === 1 && (
            <>
              <h3>Relevant additions, not required installations</h3>
              {recommendationExplanation && <p>{recommendationExplanation}</p>}
              <p>
                Recommendations use confirmed context and a reviewed catalogue.
                Installing a skill is separate from connecting VibeScroll to
                ChatGPT. Review its source, licence and destination before
                choosing a manual installation.
              </p>
              {!cards.length ? (
                <output>
                  {recommendationStatus === "needs_context"
                    ? "Review your goal or selected project to request relevant recommendations."
                    : "No verified recommendations are available here yet. You can decide later and continue."}
                </output>
              ) : (
                <>
                  {cards.length < 3 && (
                    <p>
                      Only {cards.length} verified recommendation
                      {cards.length === 1 ? " is" : "s are"} available; the
                      guide does not fill missing slots with invented skills.
                    </p>
                  )}
                  {cards.map((item) => (
                    <article key={item.id} className="panel">
                      <h4>{item.name}</h4>
                      <p>{item.purpose}</p>
                      <p>Why it fits: {item.fitReason}</p>
                      <p>
                        Publisher: {item.publisher}. Licence: {item.license}.
                        Destination: {item.destination}. Installation:{" "}
                        {item.installed === "verified"
                          ? "verified by the available inventory"
                          : "unknown; not verified"}
                        .
                      </p>
                      <p className="fine">
                        Catalogue verification:{" "}
                        {new Date(item.verifiedAt).toISOString().slice(0, 10)}.
                      </p>
                      <a
                        href={sourceLink(item.sourceUrl) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Review source and details
                      </a>
                      {item.installCommand && (
                        <details>
                          <summary>
                            Review manual installation instructions
                          </summary>
                          <p>
                            This is text to review for the stated destination.
                            VibeScroll has not run it or verified a new
                            installation.
                          </p>
                          <pre
                            style={{
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {item.installCommand}
                          </pre>
                        </details>
                      )}
                    </article>
                  ))}
                </>
              )}
            </>
          )}
          {journey.chapter === 2 && (
            <>
              <h3>Now we can vibe. Time to scroll.</h3>
              <p>Find a useful post. Send it to VibeScroll. Keep the ideas.</p>
              <p>
                Start with one source you have permission to process. A faithful
                quotation can still contain bad advice. The next chapter shows
                explicit sharing and a dependable web fallback.
              </p>
            </>
          )}
          {journey.chapter === 3 && journey.substep === 0 && (
            <>
              <h3>Send a post explicitly to VibeScroll</h3>
              <div
                className="actions"
                aria-label="Sharing instructions for your device"
              >
                {(["Android", "iPhone", "Computer"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="secondary"
                    aria-pressed={device === value}
                    onClick={() => setDevice(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <p>
                {device === "Computer"
                  ? "Copy the permitted post's link from your browser."
                  : `On ${device}, open the post's sharing options. If ChatGPT is offered, you may choose it; otherwise copy the link and open ChatGPT yourself.`}{" "}
                Exact native menus depend on your app/account; no share
                destination is assumed installed.
              </p>
              <ol>
                <li>
                  Connect the VibeScroll tool in a supported ChatGPT surface,
                  using its verified setup controls.
                </li>
                <li>
                  Review the connected VibeScroll account and assistant
                  permission scope.
                </li>
                <li>
                  Explicitly select VibeScroll and send the link. Merely sharing
                  to ChatGPT does not guarantee a tool call.
                </li>
                <li>
                  Read the actual receipt: saved, reused, waiting, failed and
                  cited-ready are different states.
                </li>
              </ol>
              <button
                type="button"
                className="secondary"
                onClick={() => onNavigate("connections")}
              >
                Review VibeScroll tool connection
              </button>
              <p>
                Suggested request:{" "}
                <code>
                  Use VibeScroll to save this post and extract its ideas: [paste
                  link]
                </code>
              </p>
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      "Use VibeScroll to save this post and extract its ideas: [paste link]",
                    );
                    setCopied(true);
                  } catch {
                    setCopied(false);
                    setError(
                      "Copy is unavailable. Select and copy the request text yourself.",
                    );
                  }
                }}
              >
                {copied ? "Request copied" : "Copy request text"}
              </button>
              <a
                href="/help/share-a-post"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sharing instructions and fallback
              </a>
            </>
          )}
          {journey.chapter === 3 && journey.substep === 1 && (
            <>
              <h3>Try one permitted source</h3>
              <p>
                Use the connected tool where available, or paste/upload/supply
                text through web Save. Inspect the actual source, funding route,
                permissions and maximum before requesting analysis.
              </p>
              <button type="button" className="secondary" onClick={onSave}>
                Use web Save instead
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => onNavigate("library")}
              >
                Inspect my sources and citations
              </button>
              <p>
                {snapshot.sampleCited
                  ? "A cited result is available; open its original evidence."
                  : "No cited first result is confirmed here. You may continue the guide while work waits; an example cannot count as your real result."}
              </p>
            </>
          )}
          {journey.chapter === 4 && (
            <>
              <h3>Instagram export education</h3>
              <p>
                This lesson is required for this new guide. You do not need an
                Instagram account, an export request or a file to complete it.
                Every step works as text; animation playback is optional.
              </p>
              <p>
                Step {journey.instagramGuide.step + 1} of{" "}
                {instagramGuideSteps.length}
              </p>
              <h4>{guideStep.title}</h4>
              <p>{guideStep.text}</p>
              <p className="fine">
                Instructional illustration, not a live Meta screen or a verified
                export status. Menu labels can change; device-specific captures
                remain separate evidence.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    disabled || busy || journey.instagramGuide.step === 0
                  }
                  onClick={() => void act({ type: "guide_back" })}
                >
                  Previous lesson step
                </button>
                {journey.instagramGuide.step <
                instagramGuideSteps.length - 1 ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={disabled || busy}
                    onClick={() => void act({ type: "guide_next" })}
                  >
                    Next lesson step
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={disabled || busy || guideAcknowledged}
                    onClick={() => void act({ type: "guide_ack" })}
                  >
                    {guideAcknowledged
                      ? "Lesson acknowledged"
                      : "I've seen how it works"}
                  </button>
                )}
              </div>
              <a
                href="/help/instagram-export-guide"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the complete static lesson
              </a>
              {guideAcknowledged && (
                <>
                  <output>
                    Education acknowledged. No export or import was performed.
                  </output>
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={disabled || busy}
                      onClick={() => void exportIntent("requested")}
                    >
                      Record that I requested an export
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={disabled || busy}
                      onClick={onSave}
                    >
                      I already have a download
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={disabled || busy}
                      onClick={() => void exportIntent("later")}
                    >
                      Do this later
                    </button>
                  </div>
                  <p>
                    To request a real export, use Instagram's own controls.
                    Recording your intention is self-reported; VibeScroll cannot
                    verify Meta's state and starts no inbox monitor or reminder.
                  </p>
                  {journey.exportIntent && (
                    <p>
                      Saved intention:{" "}
                      {journey.exportIntent.state === "requested"
                        ? "you reported requesting an export"
                        : "you chose to return later"}
                      . Actual archive/import/results remain separate.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {journey.chapter === 5 && (
            <>
              <h3>Keep ideas coming</h3>
              <p>
                Following is optional. A supported creator route still needs its
                own eligibility, recurring scope, cutoff and budget review.
                Finishing this guide starts no discovery or digest.
              </p>
              <button
                type="button"
                className="secondary"
                disabled={!followingAvailable || disabled || busy}
                onClick={() => onNavigate("following")}
              >
                Review creator following
              </button>
              {!followingAvailable && (
                <output>
                  Creator following is unavailable for this account or
                  deployment. Keep using Save and your library.
                </output>
              )}
              <button
                type="button"
                className="primary"
                disabled={disabled || busy || !guideAcknowledged}
                onClick={() => void act({ type: "finish" })}
              >
                Finish setup guide
              </button>
            </>
          )}
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={
                disabled ||
                busy ||
                (journey.chapter === 0 && journey.substep === 0)
              }
              onClick={() => void act({ type: "back" })}
            >
              Back
            </button>
            {optional && (
              <button
                type="button"
                className="secondary"
                disabled={disabled || busy}
                onClick={() => void act({ type: "defer" })}
              >
                {journey.chapter === 0
                  ? "Skip GitHub for now"
                  : journey.chapter === 1
                    ? "Decide on skills later"
                    : journey.chapter === 3
                      ? "Continue while work is pending"
                      : "Keep following for later"}
              </button>
            )}
            {journey.chapter < 5 && (
              <button
                type="button"
                className="primary"
                disabled={
                  disabled ||
                  busy ||
                  (journey.chapter === 4 && !guideAcknowledged)
                }
                onClick={() => void act({ type: "next" })}
              >
                {journey.chapter === 0 && journey.substep === 1
                  ? "Continue with current processing state"
                  : "Continue"}
              </button>
            )}
          </div>
        </>
      )}
      <p>
        <button
          type="button"
          className="secondary"
          onClick={() => onNavigate("library")}
        >
          Return to Library
        </button>{" "}
        Your Library stays accessible. Only confirmed progress is saved.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
