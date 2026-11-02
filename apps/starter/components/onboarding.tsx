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
  Search,
  X,
  LoaderCircle,
  FolderGit2,
  ExternalLink,
} from "lucide-react";
import { FeedTour } from "./feed-tour";
import {
  discoveryDraft,
  matchesStarter,
} from "../../../packages/onboarding/discovery";
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
          <span>VibeScroll</span>
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
  const [chosenStep, setStep] = useState<"feed" | "reader" | "import">();
  const step = chosenStep ?? (restored?.step === "import" ? "import" : "feed");
  const [loadedInterests, setLoadedInterests] = useState<string>();
  const interestsKey = (draft.interests ?? []).join(",");
  const loadingFeed = step === "feed" && loadedInterests !== interestsKey;
  const [search, setSearch] = useState<string>();
  const query = search ?? draft.pendingUrl ?? "";
  function setQuery(value: string) {
    setSearch(value);
    const parsed = onboardingDraft.safeParse({
      ...discoveryDraft(draft),
      pendingUrl: value,
    });
    setDraft((previous) => ({
      ...previous,
      pendingUrl: parsed.success ? parsed.data.pendingUrl : undefined,
    }));
  }
  const [feedRevision, refreshFeed] = useState(0);
  const [openingId, setOpeningId] = useState<string>();
  const [posts, setPosts] = useState<Starter[]>([]);
  const [detail, setDetail] = useState<Detail>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [previewUsed, setPreviewUsed] = useState(false);
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
  }, [step, interestsKey, feedRevision]);
  async function open(post: Starter) {
    setBusy(true);
    setOpeningId(post.familyId);
    setError("");
    try {
      const response = await fetch("/api/onboarding/starter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: post.familyId }),
      });
      const value = await response.json();
      if (!response.ok) {
        setPreviewUsed(value.code === "PREVIEW_USED");
        throw Error(value.error);
      }
      track("onboarding_result_viewed", { route: "cached" });
      setDetail(value);
      setDraft((d) => ({
        ...discoveryDraft(d, post.interests),
        selectedFamilyId: post.familyId,
      }));
      setSelected(value.analysis.insights[0]?.id);
      setStep("reader");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This post couldn't be opened.",
      );
    } finally {
      setBusy(false);
      setOpeningId(undefined);
    }
  }
  function continueSetup() {
    const value = discoveryDraft(draft);
    if (step === "feed" && /^https?:\/\//i.test(query.trim()))
      value.pendingUrl = query.trim();
    const parsed = onboardingDraft.safeParse(value);
    if (!parsed.success) {
      setError("Use a public Reel, TikTok or another supported video link.");
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
  const visiblePosts = posts.filter((post) => matchesStarter(post, query));
  const isLink = /^https?:\/\//i.test(query.trim());
  function retryFeed() {
    setError("");
    setLoadedInterests(undefined);
    refreshFeed((value) => value + 1);
  }
  const commonError = error && (
    <ErrorState
      title={previewUsed ? "Keep exploring with Pro" : "Let's try that again"}
      detail={error}
      tone="attention"
    />
  );
  return (
    <OnboardingShell authenticated={authenticated}>
      {step === "feed" && (
        <section className={styles.feed}>
          <div className={styles.discoverHeading}>
            <h1 ref={heading} tabIndex={-1}>
              Find your next idea.
            </h1>
            <FeedTour discovery autoStart={!loadingFeed && posts.length > 0} />
          </div>
          <label className={styles.searchBox}>
            <Search size={20} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search posts or paste a link"
              placeholder="Search posts or paste a link"
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 2048))}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={17} aria-hidden="true" />
              </button>
            )}
          </label>
          {notice && <output className={styles.notice}>{notice}</output>}
          {commonError}
          {error && (
            <button
              className={styles.secondary}
              onClick={() => (previewUsed ? continueSetup() : retryFeed())}
            >
              {previewUsed ? "Continue" : "Try again"}
            </button>
          )}
          {loadingFeed && (
            <output
              className={styles.postGrid}
              aria-label="Loading ready posts"
            >
              {[0, 1, 2].map((id) => (
                <span key={id} className={styles.skeleton} />
              ))}
            </output>
          )}
          <div className={styles.postGrid}>
            {visiblePosts.map((post) => (
              <article className={styles.post} key={post.familyId}>
                <button
                  className={styles.posterButton}
                  aria-label={`Open ${post.title}`}
                  disabled={busy}
                  onClick={() => open(post)}
                >
                  {post.thumbnailFrameId && (
                    <Image
                      className={styles.poster}
                      src={poster(post.familyId, post.thumbnailFrameId, true)}
                      alt={`Video by ${post.authorName ?? "the creator"}`}
                      width={400}
                      height={500}
                      unoptimized
                    />
                  )}
                  <span className={styles.insightCount}>
                    {post.insightCount} insights
                  </span>
                </button>
                <div className={styles.postCopy}>
                  <p className={styles.creatorName}>{post.authorName}</p>
                  <h2>{post.title}</h2>
                  {tags(post.interests.slice(0, 2))}
                  <button
                    className={styles.openPost}
                    disabled={busy}
                    onClick={() => open(post)}
                  >
                    {openingId === post.familyId ? (
                      <>
                        <LoaderCircle size={16} className={styles.spinner} />{" "}
                        Opening…
                      </>
                    ) : (
                      <>
                        Read insights{" "}
                        <ArrowRight size={16} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!loadingFeed && visiblePosts.length === 0 && (
            <section className={styles.empty} aria-live="polite">
              <h2>
                {isLink
                  ? "Start with your link."
                  : posts.length
                    ? "No posts found."
                    : "The ready collection is unavailable."}
              </h2>
              <p className={styles.subtle}>
                {isLink
                  ? "Your link stays saved through setup. Fresh analysis is quoted after Pro."
                  : posts.length
                    ? "Try a topic like AI, development or marketing."
                    : "Try again, or paste a Reel or TikTok link above."}
              </p>
              <button
                className={styles.primary}
                disabled={pending}
                onClick={() =>
                  isLink
                    ? continueSetup()
                    : posts.length
                      ? setQuery("")
                      : retryFeed()
                }
              >
                {isLink
                  ? "Continue with this link"
                  : posts.length
                    ? "Show all posts"
                    : "Try again"}
              </button>
            </section>
          )}
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              onClick={() => {
                setDraft((value) => ({ ...value, importRequested: true }));
                setStep("import");
              }}
            >
              Import Instagram saves
            </button>
            {draft.selectedFamilyId && (
              <button
                className={styles.secondary}
                onClick={continueSetup}
                disabled={pending}
              >
                Keep selected post <ArrowRight size={15} />
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
              <p className={styles.subtle}>{detail.analysis.summary}</p>
              <div className={styles.insights}>
                {detail.analysis.insights.map((insight) => (
                  <article className={styles.insight} key={insight.id}>
                    <InsightCardControl
                      title={insight.title}
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
              <h2>Keep this idea.</h2>
              <p className={styles.subtle}>
                Save the post and use its insights in a project.
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
                Continue with an account and Pro. Your place is saved.
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
