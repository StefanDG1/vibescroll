"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Palette,
  ChartNoAxesCombined,
  Compass,
  FolderGit2,
  Lightbulb,
  Users,
  Search,
  BookOpen,
  Workflow,
  Layers,
  Bookmark,
} from "lucide-react";
import { AppTheme } from "./app-theme";
import { OnboardingGraphic } from "./onboarding-graphic";
import { OnboardingImport } from "./onboarding-import";
import { OnboardingStarterFeed } from "./onboarding-starter-feed";
import { ErrorState } from "./assistant-elements/error-state";
import {
  beginOnboarding,
  saveAuthenticatedOnboarding,
} from "@/app/onboarding/actions";
import {
  onboardingDraft,
  onboardingLocalState,
  onboardingStep,
  onboardingInterests,
  draftStorageKey,
  type OnboardingDraft,
  type OnboardingStep,
} from "../../../packages/onboarding/journey";
import {
  restoreOnboarding,
  quizReady,
  quizSteps,
  firstMissingQuestion,
  onboardingHint,
  goalChoices,
  workChoices,
  obstacleChoices,
} from "../../../packages/onboarding/flow";
import { track } from "@/lib/analytics";
import styles from "./onboarding.module.css";

const icons = {
  code: Code2,
  palette: Palette,
  chart: ChartNoAxesCombined,
  compass: Compass,
  folder: FolderGit2,
  lightbulb: Lightbulb,
  users: Users,
  search: Search,
  book: BookOpen,
  workflow: Workflow,
  layers: Layers,
};
const emptyDraft: Partial<OnboardingDraft> = { version: 1, interests: [] };
const emptyHistory: OnboardingStep[] = [];
const unhydrated = "__vibescroll_unhydrated__";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("vibescroll-onboarding", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("vibescroll-onboarding", listener);
  };
}
function readStorage() {
  try {
    return localStorage.getItem(draftStorageKey) ?? "";
  } catch {
    return "";
  }
}
export function OnboardingShell({
  children,
  authenticated = false,
}: {
  children: ReactNode;
  step?: number;
  authenticated?: boolean;
}) {
  return (
    <main id="main" className={styles.shell}>
      <AppTheme />
      <header className={styles.top}>
        <Link href="/" className={styles.brand}>
          VibeScroll
        </Link>
        <Link
          href={authenticated ? "/account" : "/sign-in"}
          className={styles.secondary}
        >
          {authenticated ? "Account" : "Sign in"}
        </Link>
      </header>
      {children}
    </main>
  );
}

export function Onboarding({
  authenticated = false,
  initialDraft,
  notice,
}: {
  authenticated?: boolean;
  initialDraft?: OnboardingDraft;
  notice?: string;
}) {
  const stored = useSyncExternalStore(subscribe, readStorage, () => unhydrated);
  const restored = useMemo(() => restoreOnboarding(stored), [stored]);
  const [edited, setEdited] = useState<Partial<OnboardingDraft>>();
  const draft = edited ?? initialDraft ?? restored?.draft ?? emptyDraft;
  const [navigation, setNavigation] = useState<{
    step: OnboardingStep;
    history: OnboardingStep[];
    back?: boolean;
  }>();
  const step =
    navigation?.step ??
    restored?.step ??
    (initialDraft ? "summary" : "welcome");
  const history = navigation?.history ?? restored?.history ?? emptyHistory;
  const [topicQuery, setTopicQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = useRef(false);
  function patch(value: Partial<OnboardingDraft>) {
    dirty.current = true;
    setEdited((previous) => ({ ...(previous ?? draft), ...value }));
  }
  function go(next: OnboardingStep) {
    dirty.current = true;
    const trail = [...history, step].slice(-30);
    setNavigation({ step: next, history: trail });
    setError("");
    const url = new URL(window.location.href);
    if (!window.history.state?.onboardingStep)
      window.history.replaceState(
        {
          ...window.history.state,
          onboardingStep: step,
          onboardingHistory: history,
        },
        "",
        url,
      );
    url.searchParams.set("step", next);
    window.history.pushState(
      {
        ...window.history.state,
        onboardingStep: next,
        onboardingHistory: trail,
      },
      "",
      url,
    );
  }
  function back() {
    dirty.current = true;
    const trail = [...history];
    const previous = trail.pop() ?? "welcome";
    setNavigation({ step: previous, history: trail, back: true });
    setError("");
    const url = new URL(window.location.href);
    url.searchParams.set("step", previous);
    window.history.replaceState(
      {
        ...window.history.state,
        onboardingStep: previous,
        onboardingHistory: trail,
      },
      "",
      url,
    );
  }
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      const parsed = onboardingStep.safeParse(event.state?.onboardingStep);
      if (parsed.success) {
        dirty.current = true;
        setNavigation({
          step: parsed.data,
          history: (event.state?.onboardingHistory ?? [])
            .filter((item: unknown) => onboardingStep.safeParse(item).success)
            .slice(-30),
          back: true,
        });
      }
    };
    const external = (event: StorageEvent) => {
      if (event.key !== draftStorageKey && event.key !== null) return;
      dirty.current = false;
      setEdited(undefined);
      setNavigation(undefined);
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("storage", external);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("storage", external);
    };
  }, []);
  useEffect(() => {
    if (stored === unhydrated || !dirty.current) return;
    const value = onboardingLocalState.safeParse({
      draft,
      step: step === "reader" ? "feed" : step,
      history,
    });
    if (!value.success) return;
    const next = JSON.stringify(value.data);
    dirty.current = false;
    if (next !== stored)
      try {
        localStorage.setItem(draftStorageKey, next);
        window.dispatchEvent(new Event("vibescroll-onboarding"));
      } catch {
        /* Local storage is optional. */
      }
  }, [draft, step, history, stored]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
    track("onboarding_step_viewed", { step });
  }, [step]);
  function continueSetup(value = draft) {
    const parsed = onboardingDraft.safeParse(value);
    if (!parsed.success) {
      setError("Choose your goal and a topic, or choose I am exploring.");
      return;
    }
    startTransition(async () => {
      try {
        if (authenticated) await saveAuthenticatedOnboarding(parsed.data);
        else await beginOnboarding(parsed.data);
      } catch (failure) {
        if (failure instanceof Error && failure.message === "NEXT_REDIRECT")
          throw failure;
        setError(
          "Setup could not continue. Your answers are kept; please try again.",
        );
      }
    });
  }
  const quizIndex = (quizSteps as readonly string[]).indexOf(step);
  const choices =
    step === "goal"
      ? goalChoices
      : step === "work"
        ? workChoices
        : obstacleChoices;
  const value =
    step === "goal"
      ? draft.goal
      : step === "work"
        ? draft.workStage
        : draft.obstacle;
  const nextQuiz = () =>
    go(
      step === "goal"
        ? "interests"
        : step === "interests"
          ? "work"
          : step === "work"
            ? "obstacle"
            : "summary",
    );
  const filteredTopics = onboardingInterests.filter((topic) =>
    `${topic.label} ${topic.description}`
      .toLowerCase()
      .includes(topicQuery.toLowerCase()),
  );
  const title =
    step === "goal"
      ? "What would you like to do with your ideas?"
      : step === "interests"
        ? "What would you like to see more of?"
        : step === "work"
          ? "What are you working on right now?"
          : "Where do good ideas get stuck?";
  const hint =
    step === "goal"
      ? "We will start with ideas that help with this."
      : step === "interests"
        ? "Choose up to three topics, or explore something new."
        : step === "work"
          ? "This helps us suggest a useful next step. No GitHub account needed yet."
          : "We will show you the part of VibeScroll that helps with this.";
  return (
    <OnboardingShell authenticated={authenticated}>
      {notice && <output className={styles.notice}>{notice}</output>}
      {error && <ErrorState title="Let's try that again" detail={error} />}
      <div
        key={step}
        className={styles.journey}
        data-direction={navigation?.back ? "back" : "forward"}
        data-onboarding-stage={step}
      >
        {step === "welcome" && (
          <section className={styles.welcome}>
            <div>
              <h1 ref={heading} tabIndex={-1}>
                Make your forgotten posts useful again.
              </h1>
              <p>You saved it because it could help. Then it got buried.</p>
              <p className={styles.subtle}>
                Rediscover the useful ideas and put them to work in the things
                you are building.
              </p>
              <button
                type="button"
                className={styles.primary}
                onClick={() => go("goal")}
              >
                Get started <ArrowRight size={17} />
              </button>
              <p className={styles.footnote}>
                Import earlier saves or start with a link.{" "}
                <Link href="/pricing">See Pro plans</Link>
              </p>
            </div>
            <OnboardingGraphic />
          </section>
        )}
        {quizIndex >= 0 && (
          <section className={styles.quiz}>
            <div className={styles.quizTop}>
              <button
                type="button"
                className={styles.secondary}
                onClick={back}
                aria-label="Previous question"
              >
                <ArrowLeft size={20} />
              </button>
              <progress
                className={styles.quizProgress}
                aria-label="Quiz progress"
                max={4}
                value={quizIndex + 1}
              />
              <span>{quizIndex + 1} / 4</span>
            </div>
            <h1 ref={heading} tabIndex={-1}>
              {title}
            </h1>
            <p className={styles.subtle}>{hint}</p>
            {step === "interests" ? (
              <>
                <label className={styles.searchBox}>
                  <Search size={18} />
                  <input
                    type="search"
                    placeholder="Find a topic"
                    aria-label="Find a topic"
                    value={topicQuery}
                    onChange={(e) => setTopicQuery(e.target.value.slice(0, 80))}
                  />
                </label>
                <div className={styles.topicGrid}>
                  {filteredTopics.map((topic) => {
                    const chosen = draft.interests?.includes(topic.id) ?? false;
                    const Icon =
                      [
                        Code2,
                        Lightbulb,
                        Palette,
                        ChartNoAxesCombined,
                        FolderGit2,
                        Bookmark,
                      ][onboardingInterests.indexOf(topic)] ?? Lightbulb;
                    return (
                      <button
                        type="button"
                        key={topic.id}
                        aria-pressed={chosen}
                        className={styles.topicChoice}
                        data-selected={chosen}
                        disabled={
                          !chosen && (draft.interests?.length ?? 0) >= 3
                        }
                        onClick={() =>
                          patch({
                            interests: chosen
                              ? draft.interests?.filter((id) => id !== topic.id)
                              : [...(draft.interests ?? []), topic.id],
                            customTopic:
                              draft.customTopic === "Exploring"
                                ? undefined
                                : draft.customTopic,
                          })
                        }
                      >
                        <Icon size={25} strokeWidth={1.5} />
                        <strong>{topic.label}</strong>
                        <small>{topic.description}</small>
                        {chosen && (
                          <Check size={16} className={styles.choiceCheck} />
                        )}
                      </button>
                    );
                  })}
                </div>
                {!filteredTopics.length && topicQuery.trim().length >= 2 && (
                  <button
                    className={styles.secondary}
                    type="button"
                    onClick={() => patch({ customTopic: topicQuery.trim() })}
                  >
                    Use {topicQuery.trim()}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.secondary}
                  aria-pressed={draft.customTopic === "Exploring"}
                  onClick={() =>
                    patch({ interests: [], customTopic: "Exploring" })
                  }
                >
                  {draft.customTopic === "Exploring" && <Check size={16} />} I
                  am exploring
                </button>
                {draft.customTopic && draft.customTopic !== "Exploring" && (
                  <p className={styles.notice}>Topic: {draft.customTopic}</p>
                )}
              </>
            ) : (
              <fieldset className={styles.quizChoices}>
                <legend className={styles.visuallyHidden}>{title}</legend>
                {choices.map((choice) => {
                  const Icon = icons[choice.icon];
                  return (
                    <label
                      key={choice.id}
                      className={styles.quizChoice}
                      data-selected={value === choice.id}
                    >
                      <input
                        type="radio"
                        name={step}
                        value={choice.id}
                        checked={value === choice.id}
                        onChange={() =>
                          step === "goal"
                            ? patch({
                                goal: choice.id as OnboardingDraft["goal"],
                              })
                            : step === "work"
                              ? patch({
                                  workStage:
                                    choice.id as OnboardingDraft["workStage"],
                                  team: choice.id === "team",
                                })
                              : patch({
                                  obstacle:
                                    choice.id as OnboardingDraft["obstacle"],
                                })
                        }
                      />
                      <span className={styles.choiceIcon}>
                        <Icon size={24} strokeWidth={1.5} />
                      </span>
                      <span>
                        <strong>{choice.label}</strong>
                        <small>{choice.description}</small>
                      </span>
                      <span className={styles.choiceMark}>
                        {value === choice.id && <Check size={16} />}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
            {step === "work" &&
              ["existing", "team"].includes(draft.workStage ?? "") && (
                <label className={styles.field}>
                  Project name or description{" "}
                  <span className={styles.subtle}>optional</span>
                  <input
                    maxLength={160}
                    value={draft.projectDescription ?? ""}
                    onChange={(e) =>
                      patch({ projectDescription: e.target.value })
                    }
                    placeholder="What are you building?"
                  />
                </label>
              )}
            <footer className={styles.quizFooter}>
              <button
                type="button"
                className={styles.primary}
                disabled={!quizReady(step, draft)}
                onClick={nextQuiz}
              >
                Continue <ArrowRight size={17} />
              </button>
            </footer>
          </section>
        )}
        {step === "summary" && (
          <section className={styles.stage}>
            <button type="button" className={styles.secondary} onClick={back}>
              <ArrowLeft size={17} /> Back
            </button>
            <h1 ref={heading} tabIndex={-1}>
              A starting point for your ideas.
            </h1>
            <p className={styles.subtle}>{onboardingHint(draft)}</p>
            <OnboardingGraphic />
            <div className={styles.answerSummary}>
              <strong>
                {goalChoices.find((goal) => goal.id === draft.goal)?.label ??
                  "Find useful ideas"}
              </strong>
              <div className={styles.tags}>
                {draft.interests?.map((id) => (
                  <span key={id}>
                    {
                      onboardingInterests.find((topic) => topic.id === id)
                        ?.label
                    }
                  </span>
                ))}
                {draft.customTopic && <span>{draft.customTopic}</span>}
              </div>
              {draft.projectDescription && <p>{draft.projectDescription}</p>}
            </div>
            <p className={styles.subtle}>
              Bring in a post, find its useful ideas and see how they could help
              your work. We will show you a real ready result.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => go("goal")}
              >
                Edit my answers
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => go(firstMissingQuestion(draft) ?? "feed")}
              >
                Show me how it works <ArrowRight size={17} />
              </button>
            </div>
          </section>
        )}
        {step === "feed" && (
          <>
            <h1 ref={heading} tabIndex={-1} className={styles.visuallyHidden}>
              Find the useful idea
            </h1>
            <OnboardingStarterFeed
              draft={draft}
              onSelected={(id) => patch({ selectedFamilyId: id })}
              onContinue={() => go("import_benefit")}
              onBack={() => go("summary")}
              onLink={(url) => {
                const parsed = onboardingDraft.safeParse({
                  ...draft,
                  pendingUrl: url,
                });
                if (parsed.success) {
                  patch({ pendingUrl: parsed.data.pendingUrl });
                  go("import_benefit");
                } else setError("Use a supported public Reel or TikTok link.");
              }}
            />
          </>
        )}
        {step === "import_benefit" && (
          <section className={styles.stage}>
            <button type="button" className={styles.secondary} onClick={back}>
              <ArrowLeft size={17} /> Back
            </button>
            <h1 ref={heading} tabIndex={-1}>
              You saved them for a reason.
            </h1>
            <p className={styles.subtle}>
              Good ideas get buried in your saved posts. Bring them into
              VibeScroll to rediscover the useful advice and see where it could
              help your projects.
            </p>
            <OnboardingGraphic kind="import" />
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={pending}
                onClick={() => continueSetup()}
              >
                Start with one post
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  patch({ importRequested: true });
                  go("import");
                }}
              >
                Import my Instagram saves <ArrowRight size={17} />
              </button>
            </div>
          </section>
        )}
        {step === "import" && (
          <OnboardingImport onBack={back} onContinue={() => continueSetup()} />
        )}
      </div>
    </OnboardingShell>
  );
}
