"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Sparkles,
  Palette,
  TrendingUp,
  BriefcaseBusiness,
  Video,
  FolderGit2,
  ExternalLink,
} from "lucide-react";
import { ScrollCharacter } from "./scroll-character";
import { AppTheme } from "./app-theme";
import { InsightCardControl } from "./insight-card-control";
import { ErrorState } from "./assistant-elements/error-state";
import { track } from "@/lib/analytics";
import {
  beginOnboarding,
  saveAuthenticatedOnboarding,
} from "@/app/onboarding/actions";
import {
  onboardingDraft,
  onboardingLocalState,
  onboardingInterests,
  draftStorageKey,
  type OnboardingDraft,
} from "../../../packages/onboarding/journey";
import styles from "./onboarding.module.css";

function subscribeDraft(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("vibescroll-onboarding", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("vibescroll-onboarding", listener);
  };
}
function readDraftStorage() {
  try {
    return localStorage.getItem(draftStorageKey) ?? "";
  } catch {
    return "";
  }
}
const unhydratedDraft = "__vibescroll_unhydrated__";
const emptyDraft: Partial<OnboardingDraft> = {
  version: 1 as const,
  interests: [] as OnboardingDraft["interests"],
};
const icons = [Code2, Sparkles, Palette, TrendingUp, BriefcaseBusiness, Video];
const goals = [
  {
    id: "improve_product",
    label: "Improve my product",
    detail: "Design, features and better experiences",
  },
  {
    id: "grow_business",
    label: "Grow my business",
    detail: "Marketing, positioning and sales",
  },
  {
    id: "build_faster",
    label: "Build faster",
    detail: "Tools and useful development ideas",
  },
  {
    id: "find_ideas",
    label: "Find my next idea",
    detail: "Explore what I could make next",
  },
] as const;
type Starter = {
  familyId: string;
  title: string;
  authorName: string | null;
  canonical: string;
  interests: string[];
  insightCount: number;
  matched: number;
  thumbnailFrameId: string | null;
};
type Detail = {
  familyId: string;
  title: string;
  authorName: string | null;
  canonical: string;
  interests: string[];
  coverage: string;
  frames: { id: string; timestampMs: number }[];
  analysis: {
    summary: string;
    insights: {
      id: string;
      title: string;
      claim: string;
      interpretation?: string;
      verificationNeeds?: string[];
    }[];
  };
};
export function OnboardingShell({
  children,
  step = 0,
  authenticated = false,
}: {
  children: React.ReactNode;
  step?: number;
  authenticated?: boolean;
}) {
  return (
    <main id="main" className={styles.shell}>
      <AppTheme />
      <header className={styles.top}>
        <Link href="/" className={styles.brand}>
          <ScrollCharacter compact />
          <span>VibeScroll</span>
        </Link>
        <div
          className={styles.steps}
          aria-label={`Step ${Math.min(step + 1, 4)} of 4`}
        >
          {[0, 1, 2, 3].map((item) => (
            <span
              key={item}
              className={styles.step}
              data-active={item <= step}
            />
          ))}
        </div>
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
function poster(familyId: string, frameId: string, thumbnail = false) {
  return `/api/onboarding/starter?familyId=${encodeURIComponent(familyId)}&frameId=${encodeURIComponent(frameId)}${thumbnail ? "&thumbnail=1" : ""}`;
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
  const stored = useSyncExternalStore(
    subscribeDraft,
    readDraftStorage,
    () => unhydratedDraft,
  );
  const restored = useMemo(() => {
    try {
      const raw = JSON.parse(stored || "null");
      const local = onboardingLocalState.safeParse(raw);
      if (local.success) return local.data;
      const legacy = onboardingDraft.safeParse(raw);
      return legacy.success
        ? { draft: legacy.data, step: "feed" as const }
        : undefined;
    } catch {
      return undefined;
    }
  }, [stored]);
  const [editedDraft, setEditedDraft] = useState<Partial<OnboardingDraft>>();
  const draft = editedDraft ?? initialDraft ?? restored?.draft ?? emptyDraft;
  function setDraft(
    update: (value: Partial<OnboardingDraft>) => Partial<OnboardingDraft>,
  ) {
    setEditedDraft((value) => update(value ?? draft));
  }
  const [chosenStep, setStep] = useState<
    "interests" | "goal" | "feed" | "reader" | "import"
  >();
  const step =
    chosenStep ?? (initialDraft ? "feed" : (restored?.step ?? "interests"));
  const [loadedInterests, setLoadedInterests] = useState<string>();
  const interestsKey = (draft.interests ?? []).join(",");
  const loadingFeed = step === "feed" && loadedInterests !== interestsKey;
  const [interestSearch, setInterestSearch] = useState("");
  const [posts, setPosts] = useState<Starter[]>([]);
  const [detail, setDetail] = useState<Detail>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importedCount, setImportedCount] = useState<number>();
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const importController = useRef<AbortController | null>(null);
  useEffect(() => () => importController.current?.abort(), []);
  useEffect(() => {
    // The server snapshot has no browser storage. Never overwrite an existing
    // draft until useSyncExternalStore has read the actual client snapshot.
    if (stored === unhydratedDraft) return;
    const parsed = onboardingLocalState.safeParse({
      draft,
      step: step === "reader" ? "feed" : step,
    });
    if (parsed.success) {
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(parsed.data));
        window.dispatchEvent(new Event("vibescroll-onboarding"));
      } catch {
        /* Storage is optional. */
      }
    }
  }, [draft, step, stored]);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
    track("onboarding_step_viewed", { step });
  }, [step]);
  useEffect(() => {
    if (step !== "feed") return;
    const controller = new AbortController();
    fetch(`/api/onboarding/starter?interests=${interestsKey}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setPosts)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("We couldn't load the ready posts. Try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedInterests(interestsKey);
      });
    return () => controller.abort();
  }, [step, interestsKey]);
  async function open(post: Starter) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/starter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: post.familyId }),
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error);
      track("onboarding_result_viewed", { route: "cached" });
      setDetail(value);
      setDraft((d) => ({ ...d, selectedFamilyId: post.familyId }));
      setSelected(value.analysis.insights[0]?.id);
      setStep("reader");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This post couldn't be opened.",
      );
    } finally {
      setBusy(false);
    }
  }
  function continueSetup() {
    const parsed = onboardingDraft.safeParse(draft);
    if (!parsed.success) {
      setError("Choose your interests and a goal first.");
      return;
    }
    startTransition(async () => {
      if (authenticated) await saveAuthenticatedOnboarding(parsed.data);
      else await beginOnboarding(parsed.data);
    });
  }
  const tags = (items: string[]) => (
    <div className={styles.tags}>
      {items.map((id) => (
        <span key={id}>
          {onboardingInterests.find((x) => x.id === id)?.label ?? id}
        </span>
      ))}
    </div>
  );
  const commonError = error && (
    <ErrorState title="Let's try that again" detail={error} tone="attention" />
  );
  return (
    <OnboardingShell
      authenticated={authenticated}
      step={step === "interests" ? 0 : step === "goal" ? 1 : 2}
    >
      {step === "interests" && (
        <section className={styles.stage}>
          <h1 ref={heading} tabIndex={-1}>
            What catches your attention?
          </h1>
          <p className={styles.subtle}>
            Pick up to three interests. We'll find ready insights for you.
          </p>
          <label className={styles.field}>
            Find an interest
            <input
              type="search"
              value={interestSearch}
              onChange={(e) => setInterestSearch(e.target.value)}
              placeholder="Design, growth, development…"
            />
          </label>
          <div className={styles.choices} aria-label="Interests">
            {onboardingInterests.map((item, index) => {
              if (
                interestSearch &&
                !`${item.label} ${item.description}`
                  .toLowerCase()
                  .includes(interestSearch.toLowerCase())
              )
                return null;
              const Icon = icons[index];
              const active = draft.interests?.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.choice}
                  aria-pressed={!!active}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      interests: active
                        ? d.interests?.filter((id) => id !== item.id)
                        : (d.interests?.length ?? 0) < 3
                          ? [...(d.interests ?? []), item.id]
                          : d.interests,
                    }))
                  }
                >
                  <Icon size={22} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {active && <Check size={16} />}
                </button>
              );
            })}
          </div>
          <details>
            <summary>Another topic?</summary>
            <label className={styles.field}>
              Your interest
              <input
                value={draft.customTopic ?? ""}
                maxLength={80}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    customTopic: e.target.value || undefined,
                  }))
                }
                placeholder="For example, developer education"
              />
            </label>
            <p className={styles.footnote}>
              We'll keep your topic for your project plan. Our ready collection
              may include broader ideas.
            </p>
          </details>
          <div className={styles.actions}>
            <span className={styles.subtle}>
              {draft.interests?.length ?? 0} of 3 selected
            </span>
            <button
              className={styles.primary}
              disabled={
                !draft.interests?.length &&
                (draft.customTopic?.trim().length ?? 0) < 2
              }
              onClick={() => setStep("goal")}
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
          <p className={styles.footnote}>
            Try one complete ready result. Pro starts at €35/month for continued
            use.
          </p>
        </section>
      )}
      {step === "goal" && (
        <section className={styles.stage}>
          <h1 ref={heading} tabIndex={-1}>
            What would you like to do?
          </h1>
          <p className={styles.subtle}>
            Your interests find the posts. Your goal gives them somewhere to go.
          </p>
          <div className={styles.choices}>
            {goals.map((item) => (
              <button
                className={styles.choice}
                key={item.id}
                aria-pressed={draft.goal === item.id}
                onClick={() => setDraft((d) => ({ ...d, goal: item.id }))}
              >
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                {draft.goal === item.id && <Check size={18} />}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              onClick={() => setStep("interests")}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              className={styles.primary}
              disabled={!draft.goal}
              onClick={() => {
                track("onboarding_milestone", { milestone: "quiz_completed" });
                setStep("feed");
              }}
            >
              Find my posts <ArrowRight size={16} />
            </button>
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={draft.team ?? false}
              onChange={(event) =>
                setDraft((value) => ({ ...value, team: event.target.checked }))
              }
            />
            I'm working with a team
          </label>
        </section>
      )}
      {step === "feed" && (
        <section className={styles.feed}>
          <div className={styles.feedHeading}>
            <div>
              <h1 ref={heading} tabIndex={-1}>
                A good place to start.
              </h1>
              <p className={styles.subtle}>
                Choose a post. Its insights are already ready.
              </p>
            </div>
            <button
              className={styles.secondary}
              onClick={() => setStep("interests")}
            >
              <ArrowLeft size={16} /> Change interests
            </button>
          </div>
          {draft.customTopic && (
            <p className={styles.subtle}>
              Your topic: {draft.customTopic}. These are ready ideas from our
              launch collection.
            </p>
          )}
          {notice && (
            <output className={styles.notice}>
              {notice}
            </output>
          )}
          {commonError}
          {loadingFeed && (
            <output className={styles.notice}>Finding ready posts…</output>
          )}
          <div className={styles.postGrid}>
            {posts.map((post) => (
              <article className={styles.post} key={post.familyId}>
                {post.thumbnailFrameId && (
                  <Image
                    className={styles.poster}
                    src={poster(post.familyId, post.thumbnailFrameId, true)}
                    alt={`Video by ${post.authorName ?? "the creator"}`}
                    width={400}
                    height={300}
                    unoptimized
                  />
                )}
                <div className={styles.postCopy}>
                  <span className={styles.ready}>
                    <Check size={14} /> Already analyzed Â· {post.insightCount}{" "}
                    insights
                  </span>
                  <h2>{post.title}</h2>
                  <p className={styles.subtle}>{post.authorName}</p>
                  {tags(post.interests)}
                  {post.matched === 0 && (
                    <p className={styles.footnote}>
                      A broader pick from our ready collection.
                    </p>
                  )}
                  <button
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => open(post)}
                  >
                    View insights <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!loadingFeed && posts.length === 0 && (
            <div className={styles.next}>
              <h2>We're refreshing the starter collection.</h2>
              <p className={styles.subtle}>
                Your interests are saved. You can continue with your own post
                after setup.
              </p>
              <button
                className={styles.primary}
                onClick={continueSetup}
                disabled={pending}
              >
                Continue setup
              </button>
            </div>
          )}
          <details className={styles.ownLink}>
            <summary>Start with my own link</summary>
            <label className={styles.field}>
              Public video link
              <input
                type="url"
                value={draft.pendingUrl ?? ""}
                maxLength={2048}
                placeholder="Paste a Reel or TikTok link"
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    pendingUrl: e.target.value || undefined,
                  }))
                }
              />
            </label>
            <p className={styles.footnote}>
              Your link stays with your setup. After Pro, save it and review the
              analysis quote. Nothing is downloaded now.
            </p>
            <button
              className={styles.primary}
              disabled={
                pending ||
                !draft.pendingUrl ||
                !onboardingDraft.safeParse(draft).success
              }
              onClick={continueSetup}
            >
              Continue with my link <ArrowRight size={16} />
            </button>
          </details>
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              onClick={() => {
                setDraft((value) => ({ ...value, importRequested: true }));
                setStep("import");
              }}
            >
              Bring my Instagram saves
            </button>
            <span className={styles.footnote}>
              One complete result before you choose Pro.
            </span>
            {draft.selectedFamilyId && (
              <button
                className={styles.primary}
                onClick={continueSetup}
                disabled={pending}
              >
                Keep my selected post <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
      )}
      {step === "reader" && detail && (
        <section className={styles.feed}>
          <button className={styles.secondary} onClick={() => setStep("feed")}>
            <ArrowLeft size={16} /> Back to posts
          </button>
          <div className={styles.reader}>
            <div>
              {detail.frames[0] && (
                <Image
                  className={styles.sourcePoster}
                  src={poster(detail.familyId, detail.frames[0].id)}
                  alt={`Frame from ${detail.title}`}
                  width={540}
                  height={960}
                  unoptimized
                  priority
                />
              )}
              <p className={styles.eyebrow}>
                {detail.authorName ?? "Original creator"}
              </p>
              <h1 className={styles.sourceTitle} ref={heading} tabIndex={-1}>
                {detail.title}
              </h1>
              {tags(detail.interests)}
              <a
                className={styles.secondary}
                href={detail.canonical}
                target="_blank"
                rel="noreferrer"
              >
                Open original <ExternalLink size={14} />
              </a>
            </div>
            <div>
              <span className={styles.ready}>
                <Check size={14} /> Already analyzed
              </span>
              <p className={styles.subtle}>{detail.analysis.summary}</p>
              <div className={styles.insights}>
                {detail.analysis.insights.map((insight) => (
                  <article className={styles.insight} key={insight.id}>
                    <InsightCardControl
                      title={insight.title}
                      subtitle="Explore the idea"
                      icon="lightbulb"
                      expanded={selected === insight.id}
                      onClick={() =>
                        setSelected(
                          selected === insight.id ? undefined : insight.id,
                        )
                      }
                    />
                    {selected === insight.id && (
                      <div className={styles.insightBody}>
                        <p>{insight.claim}</p>
                        {insight.interpretation && (
                          <p>{insight.interpretation}</p>
                        )}
                        <details>
                          <summary>Source & evidence</summary>
                          <p>{detail.coverage}</p>
                          <div className={styles.frameGrid}>
                            {detail.frames.map((frame) => (
                              <a
                                key={frame.id}
                                href={poster(detail.familyId, frame.id)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Image
                                  src={poster(detail.familyId, frame.id)}
                                  width={120}
                                  height={180}
                                  alt={`Sample at ${(frame.timestampMs / 1000).toFixed(1)} seconds`}
                                  unoptimized
                                  loading="lazy"
                                />
                              </a>
                            ))}
                          </div>
                          {insight.verificationNeeds?.map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </details>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
            <aside className={styles.next}>
              <FolderGit2 size={23} />
              <h2>
                {draft.goal === "grow_business"
                  ? "Put this idea to work for your business."
                  : draft.goal === "build_faster"
                    ? "Turn this into a build plan."
                    : draft.goal === "find_ideas"
                      ? "Keep your next idea close."
                      : "Try this in your product."}
              </h2>
              <p className={styles.subtle}>
                Keep the post, connect a project and turn its insights into a
                plan you can act on.
              </p>
              {commonError}
              <button
                className={styles.primary}
                onClick={continueSetup}
                disabled={pending}
              >
                {pending ? "Continuing…" : "Keep this post"}
                <ArrowRight size={16} />
              </button>
              <p className={styles.footnote}>
                Create your account, then choose Pro. Your place is saved.
              </p>
            </aside>
          </div>
        </section>
      )}
      {step === "import" && (
        <section className={styles.stage}>
          <h1 ref={heading} tabIndex={-1}>
            Bring your Instagram saves.
          </h1>
          <p className={styles.subtle}>
            Request your export now. Explore ready posts while Instagram
            prepares it.
          </p>
          <label className={styles.field} htmlFor="onboarding-export">
            Already have your export?
            <input
              id="onboarding-export"
              type="file"
              accept=".zip,.json,.html,.htm,.csv"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                importController.current?.abort();
                const controller = new AbortController();
                importController.current = controller;
                setImportedCount(undefined);
                setError("");
                setBusy(true);
                try {
                  const { previewLinkFile, SAVED_TEXT_LIMIT } =
                    await import("../../../packages/instagram-import");
                  const preview = /\.zip$/i.test(file.name)
                    ? await (
                        await import("../../../packages/instagram-zip")
                      ).previewInstagramZip(file, controller.signal)
                    : file.size <= SAVED_TEXT_LIMIT
                      ? previewLinkFile(
                          new TextDecoder("utf-8", { fatal: true }).decode(
                            await file.arrayBuffer(),
                          ),
                          file.name,
                        )
                      : null;
                  if (!preview)
                    throw Error(
                      "Choose Saved metadata within 8 MB, or its ZIP.",
                    );
                  if (controller.signal.aborted) return;
                  track("import_previewed", {
                    format: preview.format,
                    count: preview.links.length,
                  });
                  setImportedCount(preview.links.length);
                  setDraft((value) => ({ ...value, importRequested: true }));
                } catch (failure) {
                  if (controller.signal.aborted) return;
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "This file couldn't be read.",
                  );
                } finally {
                  if (importController.current === controller) setBusy(false);
                }
              }}
            />
          </label>
          {busy && <output>Reading Saved links on this device…</output>}
          {importedCount !== undefined && (
            <output className={styles.notice}>
              {importedCount} unique links found. Finish setup, then reselect
              this file in Save to import them. Nothing has been uploaded or
              analyzed.
            </output>
          )}
          {commonError}
          <ol className={styles.guide}>
            <li>
              In your Instagram profile, open Menu, then Meta Account or
              Accounts Center. Choose Your information and permissions.
            </li>
            <li>
              Open Export your information, create an export, and choose your
              Instagram profile.
            </li>
            <li>
              Export to your device. Select Saved only, All time, and JSON.
            </li>
            <li>
              When the file is ready, choose Instagram export in VibeScroll's
              Save menu.
            </li>
          </ol>
          <p className={styles.footnote}>
            Instagram's labels can vary.{" "}
            <a
              href="https://www.facebook.com/help/instagram/181231772500920?cms_platform=iphone-app"
              target="_blank"
              rel="noreferrer"
            >
              Official export help
            </a>
            . Your archive is read on your device. Only selected Saved links are
            imported; analysis is quoted separately.
          </p>
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              onClick={() => setStep("feed")}
            >
              <ArrowLeft size={16} /> Browse ready posts
            </button>
            <button
              className={styles.primary}
              onClick={continueSetup}
              disabled={pending}
            >
              Continue setup <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}
    </OnboardingShell>
  );
}
