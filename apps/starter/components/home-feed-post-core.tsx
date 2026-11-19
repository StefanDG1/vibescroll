"use client";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
  type PointerEvent,
} from "react";
import {
  ArrowDown,
  BookmarkPlus,
  MessageSquareText,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  MoreHorizontal,
  MoreVertical,
  Play,
  Settings2,
  ArrowUpRight,
  FileText,
  Video,
  Heart,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { useInterfaceMotion } from "./motion-preference";
import { InsightCardControl } from "./insight-card-control";
import { PostInsightStrip } from "./post-insight-strip";
import { PostEngagement } from "./post-engagement";
import { ProjectProposalComposer } from "./project-proposal-composer";
import { FeedTour } from "./feed-tour";
import { SettingsPanel } from "./settings-panel";
import { ErrorState } from "./assistant-elements/error-state";
import { ProposalArtifactCore } from "./assistant-elements/proposal-artifact-core";
import { insightPresentation } from "../../../packages/insights/presentation";
import {
  postTopicName,
  projectLabel,
  type FeedDetail,
  type FeedInsight,
  type FeedPost,
  type FeedEngagement,
  type HomeMode,
} from "../lib/home-feed";
import styles from "./home-feed.module.css";
export type FeedCardPost = Pick<
  FeedPost,
  "title" | "authorName" | "kind" | "thumbnailAssetIds"
> & { id: string };

export function FeedPostCardCore({
  post,
  detail,
  engagement: observedEngagement,
  onReaction,
  active,
  demo,
  error,
  organizationId,
  readOnly,
  call,
  base,
  onVisible,
  onRetry,
  nextPost,
  preview,
  renderThumbnail,
  renderImage,
  renderProposal,
  onNavigate,
  projectPanel,
  evidence,
  showTour = true,
  endLabel = "You’re up to date",
  observedState,
  showPlayControl = true,
  mode,
  current = false,
  onAdvance,
  onViewFrame,
  skipped = false,
}: {
  post: FeedCardPost;
  detail?: FeedDetail;
  engagement?: FeedEngagement;
  onReaction: (
    value: Pick<FeedEngagement, "scopeKey" | "liked" | "revision"> &
      Partial<Pick<FeedEngagement, "likes" | "shares">>,
  ) => void;
  active: boolean;
  demo: boolean;
  error?: string;
  organizationId: string;
  readOnly: boolean;
  call: (operation: string, args: unknown) => Promise<any>;
  base: string;
  onVisible: () => void;
  onRetry: () => void;
  nextPost?: FeedCardPost;
  renderThumbnail?: (props: {
    candidates: string[];
    kind: string;
    demo?: boolean;
    priority?: boolean;
    resolve?: (id: string) => string;
  }) => ReactNode;
  renderImage?: (props: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    fill?: boolean;
    sizes?: string;
    className?: string;
  }) => ReactNode;
  renderProposal?: (
    props: ComponentProps<typeof ProposalArtifactCore>,
  ) => ReactNode;
  onNavigate?: (url: string) => void;
  projectPanel?: ReactNode;
  evidence?: ReactNode;
  showTour?: boolean;
  endLabel?: string;
  observedState?: ReactNode;
  showPlayControl?: boolean;
  mode?: HomeMode;
  current?: boolean;
  onAdvance?: (restore?: () => Promise<boolean>) => void;
  onViewFrame?: (frame: NonNullable<FeedInsight["frame"]>) => void;
  skipped?: boolean;
  preview?: {
    resolveThumbnail: (id: string, ownerId?: string) => string;
    resolveEvidenceFrame?: (id: string) => string;
    onContinue: () => void;
    onProof?: (kind: "insight" | "frame") => void;
    evidence?: ReactNode;
    projectName?: string;
  };
}) {
  const article = useRef<HTMLElement>(null);
  const snapDetails = useRef<HTMLDialogElement>(null);
  const sheetGesture = useRef<number | null>(null);
  const reportVisible = useEffectEvent(onVisible);
  const [selected, setSelected] = useState<string | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [demoLiked, setDemoLiked] = useState(true);
  const [pendingLike, setPendingLike] = useState<{
    scopeKey: string;
    liked: boolean;
  } | null>(null);
  const [likeError, setLikeError] = useState("");
  const interfaceMotion = useInterfaceMotion();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const likeQueue = useRef<{
    scopeKey: string;
    desired: boolean;
  } | null>(null);
  const latestEngagement = useRef(observedEngagement);
  useEffect(() => {
    latestEngagement.current = observedEngagement;
  }, [observedEngagement]);
  const uid = useId();
  const sourceHref = preview
    ? "/onboarding"
    : demo
      ? `/demo?source=demo-${post.id.endsWith("-1") ? "1" : "0"}`
      : `${base}/posts/${post.id}`;
  const title = detail?.title ?? post.title;
  const author = detail?.authorName ?? post.authorName ?? "Saved post";
  const isVideo =
    demo ||
    post.kind === "upload" ||
    detail?.durationMs != null ||
    /\/(reel|shorts|video)\/|youtu\.be\//.test(detail?.url ?? "");
  const candidates = detail?.thumbnailAssetIds.length
    ? detail.thumbnailAssetIds
    : post.thumbnailAssetIds;
  const topics = detail?.categoryKeys ?? [];
  const insights = detail?.insights ?? [];
  const expandedInsight =
    selected === null
      ? insights[0]
      : insights.find((item) => item.id === selected);
  const insight = insights[0];
  const analysisVersionId = detail?.analysisVersionId;
  const allProjects = detail?.allProjects ?? detail?.projects ?? [];
  const proposals = detail?.proposals ?? [];
  const openPlan =
    expandedPlan === undefined && !mode ? proposals[0]?.id : expandedPlan;
  const recommendations =
    detail?.suggestions.items
      .filter(
        (project) =>
          project.fit.matched > 0 &&
          !proposals.some((plan) => plan.projectId === project.id),
      )
      .slice(0, Math.max(0, 3 - proposals.length)) ?? [];
  const engagement = demo ? detail?.engagement : observedEngagement;
  const displayedLiked =
    pendingLike &&
    engagement?.scopeKey === pendingLike.scopeKey
      ? pendingLike.liked
      : engagement?.liked;
  const displayedLikes = engagement
    ? Math.max(
        0,
        engagement.likes + Number(displayedLiked) - Number(engagement.liked),
      )
    : undefined;
  async function like(
    liked = !(likeQueue.current?.desired ?? engagement?.liked),
    previous = engagement,
  ) {
    if (!previous || readOnly) return;
    const scopeKey = previous.scopeKey;
    const inFlight = likeQueue.current;
    if (inFlight && inFlight.scopeKey !== scopeKey) return;
    const queue = inFlight ?? { scopeKey, desired: liked };
    queue.desired = liked;
    setPendingLike({ scopeKey, liked });
    setLikeError("");
    if (inFlight) return;
    likeQueue.current = queue;
    let confirmed = previous;
    let recovered = false;
    try {
      while (confirmed.liked !== queue.desired) {
        const target = queue.desired;
        const args = {
          organizationId,
          sourceId: post.id,
          liked: target,
          expectedRevision: confirmed.revision,
          key: crypto.randomUUID(),
        };
        try {
          const result: Pick<FeedEngagement, "scopeKey" | "liked" | "revision"> =
            await call("setPostLike", args).catch((failure) => {
              // A timeout leaves the write outcome unknown. Replay the same key
              // before sending an opposite intent against its revision.
              if (failure instanceof TypeError ||
                  (failure instanceof Error && failure.name === "TimeoutError"))
                return call("setPostLike", args);
              throw failure;
            });
          if (
            result.scopeKey !== scopeKey ||
            result.revision <= confirmed.revision
          ) throw new Error("The reaction revision changed.");
          onReaction(result);
          const observed = latestEngagement.current;
          confirmed =
            observed?.scopeKey === scopeKey && observed.revision > result.revision
              ? observed
              : { ...confirmed, ...result };
        } catch (failure) {
          const stale = failure instanceof Error && "code" in failure &&
            failure.code === "APPROVAL_STALE";
          if (!stale && queue.desired === target) {
            if (failure instanceof Error && !("outcome" in failure)) {
              void call("postEngagementRead", {
                organizationId,
                sourceIds: [post.id],
              }).then((items: (FeedEngagement & { sourceId: string })[] | null) => {
                const current = items?.find((item) => item.sourceId === post.id);
                if (current?.scopeKey === scopeKey) onReaction(current);
              }).catch(() => {});
            }
            throw failure;
          }
          const items: (FeedEngagement & { sourceId: string })[] | undefined =
            await call("postEngagementRead", {
              organizationId,
              sourceIds: [post.id],
            }).catch(() => undefined);
          const current = items?.find((item) => item.sourceId === post.id);
          if (!current || current.scopeKey !== scopeKey) throw failure;
          onReaction(current);
          confirmed = current;
          if (current.liked === queue.desired) break;
          if (recovered) throw failure;
          recovered = true;
        }
      }
      return confirmed;
    } catch {
      setLikeError("Could not save your reaction. Try again.");
    } finally {
      likeQueue.current = null;
      setPendingLike(null);
    }
  }
  async function reviewLike() {
    if (demo) {
      const prior = demoLiked;
      setDemoLiked(true);
      onAdvance?.(async () => {
        setDemoLiked(prior);
        return true;
      });
    } else if (engagement?.liked) {
      onAdvance?.(async () => true);
    } else {
      const result = await like(true);
      if (result && engagement) {
        const prior = engagement;
        onAdvance?.(
          async () => !!(await like(prior.liked, { ...prior, ...result })),
        );
      }
    }
  }
  function likeFromMedia() {
    if (demo) setDemoLiked(true);
    else if (engagement && !displayedLiked) void like(true);
  }
  function pointerDown(event: PointerEvent<HTMLElement>) {
    if (
      !mode ||
      !event.isPrimary ||
      event.pointerType !== "touch" ||
      (event.target as Element).closest(
        "button, a, input, textarea, select, video",
      )
    )
      return;
    touchStart.current = { x: event.clientX, y: event.clientY };
  }
  function pointerUp(event: PointerEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !mode) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) > 55 && Math.abs(x) > Math.abs(y) * 1.5) {
      lastTap.current = 0;
      if (mode === "review") {
        if (x < 0) onAdvance?.();
        else void reviewLike();
      } else if (mode === "browse" && x > 0) {
        scrollTo(`${uid}-insights`);
      }
      return;
    }
    if (
      mode === "review" ||
      Math.abs(x) > 12 ||
      Math.abs(y) > 12 ||
      !(event.target as Element).closest("[data-post-media]")
    )
      return;
    if (event.timeStamp - lastTap.current < 280 && lastTap.current > 0) {
      likeFromMedia();
      lastTap.current = 0;
    } else lastTap.current = event.timeStamp;
  }
  useEffect(() => {
    if (!article.current || typeof IntersectionObserver === "undefined") return;
    if (mode === "snap") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) reportVisible();
      },
      { rootMargin: "-10% 0px -55% 0px" },
    );
    observer.observe(article.current);
    return () => observer.disconnect();
  }, [mode]);
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({
      block: "start",
      behavior: interfaceMotion ? "smooth" : "instant",
    });
  }
  function openSnapDetails() {
    const panel = snapDetails.current;
    if (!panel || panel.open) return;
    article.current
      ?.querySelector('[data-feed-column="source"]')
      ?.scrollIntoView({ block: "start", behavior: "instant" });
    panel.showModal();
  }
  function skip() {
    if (!nextPost) return;
    scrollTo(`feed-post-${nextPost.id}`);
    if (mode === "snap") return;
    document
      .getElementById(`feed-title-${nextPost.id}`)
      ?.focus({ preventScroll: true });
  }
  const thumbnailResolver = preview
    ? (id: string) => preview.resolveThumbnail(id, post.id)
    : undefined;
  const reactions = preview ? (
    <button
      type="button"
      className="button primary"
      onClick={preview.onContinue}
    >
      <BookmarkPlus size={16} aria-hidden="true" /> Keep this post
    </button>
  ) : (
    <PostEngagement
      likes={
        demo && engagement
          ? engagement.likes + (demoLiked ? 0 : -1)
          : displayedLikes
      }
      requests={engagement?.shares}
      liked={demo ? demoLiked : displayedLiked}
      onLike={
        demo
          ? () => setDemoLiked((value) => !value)
          : engagement && !readOnly
            ? () => void like()
            : undefined
      }
      notice={likeError}
      onSettings={mode ? undefined : () => setSettingsOpen(true)}
    />
  );
  const next = nextPost ? (
    <button type="button" className={styles.next} onClick={skip}>
      <Thumbnail
        render={renderThumbnail}
        candidates={nextPost.thumbnailAssetIds}
        kind={nextPost.kind}
        demo={demo}
        resolve={
          preview
            ? (id: string) => preview.resolveThumbnail(id, nextPost.id)
            : undefined
        }
      />
      <span>
        <small>Next post</small>
        <strong>{nextPost.title}</strong>
      </span>
      <ChevronRight size={19} aria-hidden="true" />
    </button>
  ) : (
    <div className={styles.nextEnd}>{endLabel}</div>
  );
  const sourceSection = (
    <section
      className={styles.source}
      data-feed-column="source"
      aria-labelledby={`feed-title-${post.id}`}
      onPointerDown={pointerDown}
      onPointerUp={pointerUp}
      onPointerCancel={() => {
        touchStart.current = null;
      }}
    >
      <div className={styles.creator}>
        <span className={styles.avatar}>
          {author.slice(0, 1).toUpperCase()}
        </span>
        <strong>{author}</strong>
        {!mode && !demo && !preview && showTour && <FeedTour />}
        {!mode && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={`Post settings for ${title}`}
          >
            <MoreVertical size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        className={styles.poster}
        data-post-media
        data-has-poster={demo || candidates.length > 0}
        data-media-kind={post.kind}
      >
        {demo ? (
          <ImageView
            render={renderImage}
            src={
              post.id.endsWith("-1")
                ? "/product/setup-poster.png"
                : "/product/overview-poster.png"
            }
            alt="Synthetic VibeScroll walkthrough"
            fill
            sizes="(max-width:720px) 100vw, 340px"
            className={styles.demoPoster}
          />
        ) : (
          <Thumbnail
            render={renderThumbnail}
            candidates={candidates}
            kind={post.kind}
            priority={Boolean(mode && current)}
            resolve={thumbnailResolver}
          />
        )}
        {showPlayControl && isVideo &&
          (detail?.url ? (
            <a
              className={styles.play}
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Watch original post"
            >
              <Play size={28} fill="currentColor" aria-hidden="true" />
            </a>
          ) : (
            <span className={styles.play} title="Example poster">
              <Play size={28} fill="currentColor" aria-hidden="true" />
            </span>
          ))}
        {detail?.durationMs != null && (
          <span className={styles.duration}>
            {Math.floor(detail.durationMs / 60000)}:
            {String(Math.floor(detail.durationMs / 1000) % 60).padStart(2, "0")}
          </span>
        )}
      </div>
      <div className={styles.sourceCopy}>
        <h2 id={`feed-title-${post.id}`} tabIndex={-1}>
          {title}
        </h2>
        {topics.length ? (
          <ul className={styles.tags} aria-label="Topics">
            {topics.slice(0, 4).map((topic) => (
              <li key={topic}>{postTopicName(topic)}</li>
            ))}
          </ul>
        ) : (
          <div className={styles.tagSpace} />
        )}
        <p className={styles.summary}>{detail?.summary ?? ""}</p>
        {observedState}
        {mode === "review" ? (
          <div className={styles.reviewActions}>
            <button
              type="button"
              aria-label="Pass"
              title="Pass"
              onClick={() => onAdvance?.()}
            >
              <X size={21} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Like"
              title="Like"
              disabled={!demo && (!engagement || readOnly)}
              onClick={() => void reviewLike()}
            >
              <Heart size={21} aria-hidden="true" />
            </button>
            {likeError && <p role="alert">{likeError}</p>}
          </div>
        ) : (
          reactions
        )}
        {mode === "snap" && (
          <button
            type="button"
            className={styles.snapHandle}
            aria-label="Open insights and projects"
            title="Insights and projects"
            aria-haspopup="dialog"
            aria-controls={`${uid}-details`}
            onClick={openSnapDetails}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse") return;
              sheetGesture.current = event.clientY;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              if (
                sheetGesture.current !== null &&
                sheetGesture.current - event.clientY > 24
              )
                openSnapDetails();
              sheetGesture.current = null;
            }}
            onPointerCancel={() => {
              sheetGesture.current = null;
            }}
          >
            <MessageSquareText size={21} aria-hidden="true" />
          </button>
        )}
        {!mode && (
          <button
            type="button"
            className={styles.mobileCue}
            onClick={() => scrollTo(`${uid}-insights`)}
          >
            Scroll for insights <ChevronDown size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      {!mode && <div className={styles.desktopNext}>{next}</div>}
    </section>
  );
  const insightsSection = (
    <section
      id={`${uid}-insights`}
      className={styles.insights}
      data-feed-column="insights"
      aria-label={`Insights for ${title}`}
    >
      {!mode && <div className={styles.mobileContext}>
        <Thumbnail
          render={renderThumbnail}
          candidates={candidates}
          kind={post.kind}
          demo={demo}
          resolve={thumbnailResolver}
        />
        <div>
          <h3>{title}</h3>
          <small>{topics.slice(0, 2).map(postTopicName).join(" · ")}</small>
        </div>
      </div>}
      <div className={styles.sectionHeading}>
        <h2>Insights</h2>
        {detail && active && <span>{insights.length}</span>}
      </div>
      <div className={styles.insightList}>
        {preview && (!detail || !active) ? (
          <div className={styles.noProjects}>
            <p>Keep exploring with your own library.</p>
            <button
              type="button"
              className="button"
              onClick={preview.onContinue}
            >
              Continue setup
            </button>
          </div>
        ) : error && active && !detail ? (
          <ErrorState
            title="Insights unavailable"
            detail={error}
            onRetry={onRetry}
            action={<a href={sourceHref}>Open post</a>}
          />
        ) : !detail ? (
          <FeedSkeleton label="Insights load as this post approaches" />
        ) : mode && insights.length ? (
          <PostInsightStrip
            insights={insights}
            desktopList={mode === "browse"}
            selected={selected === null ? undefined : expandedInsight?.id}
            onSelect={(id) => {
              if (selected !== id) preview?.onProof?.("insight");
              setSelected(selected === id ? "closed" : id);
            }}
            renderFrame={(id) =>
              demo ? (
                <ImageView
                  render={renderImage}
                  src={`/product/${id}.webp`}
                  alt=""
                  fill
                  sizes="190px"
                  className={styles.demoInsightFrame}
                />
              ) : (
                <Thumbnail
                  render={renderThumbnail}
                  candidates={[id]}
                  kind="upload"
                  resolve={preview?.resolveEvidenceFrame}
                />
              )
            }
            evidence={(item) =>
              preview ? (
                item.frame && preview.resolveEvidenceFrame ? (
                  <a
                    href={preview.resolveEvidenceFrame(item.frame.id)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => preview.onProof?.("frame")}
                  >
                    View source frame
                  </a>
                ) : (
                  preview.evidence
                )
              ) : item.frame ? (
                onViewFrame && !demo ? (
                  <button
                    type="button"
                    className={styles.frameAction}
                    onClick={() => {
                      if (item.frame) onViewFrame(item.frame);
                    }}
                  >
                    <ImageIcon size={17} aria-hidden="true" />
                    View source frame
                  </button>
                ) : (
                  <a
                    href={
                      demo
                        ? `/product/${item.frame.id}.webp`
                        : `/api/evidence/${encodeURIComponent(item.frame.id)}?inline=true`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    View source frame
                  </a>
                )
              ) : item.hasTranscript ? (
                <a href={`${sourceHref}#source-transcript`}>View transcript</a>
              ) : null
            }
          />
        ) : insights.length ? (
          insights.map((item) => {
            const open = expandedInsight?.id === item.id;
            return (
              <article
                key={item.id}
                className={styles.insight}
                data-selected={open}
                data-insight-id={item.id}
              >
                <InsightCardControl
                  title={item.title ?? item.claim}
                  subtitle={open ? "" : item.claim}
                  icon={insightPresentation(item).icon}
                  expanded={open}
                  aria-controls={`${uid}-${item.id}`}
                  onClick={() => setSelected(open ? "closed" : item.id)}
                >
                  <SettingsPanel
                    title="Insight evidence"
                    triggerLabel={`Evidence for ${item.title ?? item.claim}`}
                    trigger={<MoreHorizontal size={20} aria-hidden="true" />}
                  >
                    <p>{item.claim}</p>
                    {evidence ? (
                      evidence
                    ) : preview ? (
                      preview.evidence
                    ) : (
                      <a href={sourceHref}>
                        View source evidence and transcript
                      </a>
                    )}
                  </SettingsPanel>
                </InsightCardControl>
                <div
                  id={`${uid}-${item.id}`}
                  hidden={!open}
                  className={styles.claim}
                >
                  <p>{item.claim}</p>
                </div>
              </article>
            );
          })
        ) : (
          <p className={styles.note}>
            No insights are available for this version.
          </p>
        )}
      </div>
      <button
        type="button"
        className={styles.mobileApply}
        onClick={() => scrollTo(`${uid}-plans`)}
      >
        Apply to a project <ArrowDown size={16} aria-hidden="true" />
      </button>
    </section>
  );
  const plansSection = (
    <section
      id={`${uid}-plans`}
      className={styles.plans}
      data-feed-column="plans"
      aria-label={`Project plans for ${title}`}
    >
      {!mode && <div className={styles.mobileContext}>
        <button
          type="button"
          aria-label="Back to insights"
          onClick={() => scrollTo(`${uid}-insights`)}
        >
          <ChevronDown size={20} aria-hidden="true" />
        </button>
        <Thumbnail
          render={renderThumbnail}
          candidates={candidates}
          kind={post.kind}
          demo={demo}
          resolve={thumbnailResolver}
        />
        <div>
          <h3>{title}</h3>
          <small>{topics.slice(0, 2).map(postTopicName).join(" · ")}</small>
        </div>
      </div>}
      <div className={styles.sectionHeading}>
        <h2>Apply to a project</h2>
        {!mode && (
          <SettingsPanel
            title="Project options"
            triggerLabel={`Project options for ${title}`}
          >
            <p>Each proposal considers all insights from this post.</p>
            {preview ? (
              <p>
                A project is a product, business or codebase you are working on.
              </p>
            ) : (
              <a
                className="button"
                href={demo ? "/demo?view=projects" : `${base}/projects`}
              >
                Manage projects
              </a>
            )}
          </SettingsPanel>
        )}
      </div>
      <div className={styles.planList}>
        {projectPanel !== undefined ? (
          projectPanel
        ) : preview ? (
          <div className={`${styles.noProjects} ${styles.previewPlan}`}>
            <FolderGit2 size={28} aria-hidden="true" />
            <h3>{preview.projectName || "Put the idea to work"}</h3>
            <p>
              A plan connects the useful ideas in this post to a change you
              could make. You can discuss and edit it before acting.
            </p>
          </div>
        ) : !detail ? (
          <FeedSkeleton label="Project plans load with this post" />
        ) : mode ? (
          <>
            {insight && analysisVersionId && detail.projects.length > 0 ? (
              <ProjectProposalComposer
                key={`${post.id}:${analysisVersionId}`}
                organizationId={organizationId}
                sourceId={post.id}
                analysisVersionId={analysisVersionId}
                insight={{ ...insight, title: insight.title ?? insight.claim }}
                insights={insights}
                sourceTitle={title}
                projects={detail.projects}
                compactProjects={allProjects}
                existingProposals={proposals}
                aiFirst={mode === "browse" && !demo}
                suggestions={detail.suggestions.items}
                disabled={readOnly || demo}
                call={call}
                onSaved={onRetry}
                onPreferencesChange={onRetry}
              />
            ) : (
              <a href={demo ? "/demo?view=projects" : `${base}/projects`}>
                {allProjects.length ? "Manage projects" : "Connect a project"}
              </a>
            )}
            <h3>Proposals</h3>
            {proposals.length ? (
              proposals.map((proposal) => (
                <Artifact
                  render={renderProposal}
                  key={proposal.id}
                  proposal={proposal}
                  presentation="feed"
                  chatOnly={mode === "browse" && !demo}
                  enabled={mode === "browse" && !demo && active}
                  readOnly={readOnly}
                  call={call}
                  open={openPlan === proposal.id}
                  onOpenChange={(open) =>
                    setExpandedPlan(open ? proposal.id : null)
                  }
                  href={
                    demo
                      ? `/demo?proposal=${proposal.id}`
                      : `${base}/proposals/${proposal.id}`
                  }
                />
              ))
            ) : (
              <p>No proposals yet.</p>
            )}
            <div className={styles.postActions}>
              <a href={sourceHref}>Open full post</a>
              <button type="button" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={16} aria-hidden="true" /> Advanced settings
              </button>
            </div>
          </>
        ) : (
          <>
            {proposals.map((proposal) => (
              <Artifact
                render={renderProposal}
                key={proposal.id}
                proposal={proposal}
                call={call}
                enabled={!demo}
                readOnly={readOnly}
                open={openPlan === proposal.id}
                onOpenChange={(open) =>
                  setExpandedPlan(open ? proposal.id : null)
                }
                fit={
                  detail.suggestions.items.find(
                    (project) => project.id === proposal.projectId,
                  )?.fit
                }
                href={
                  demo
                    ? `/demo?proposal=${proposal.id}`
                    : `${base}/proposals/${proposal.id}`
                }
              />
            ))}
            {insight &&
              analysisVersionId &&
              recommendations.map((project) => (
                <div className={styles.draftOption} key={project.id}>
                  <span className={styles.draftIcon}>
                    {projectLabel(project.name) === "VibeScroll" ? (
                      <ImageView
                        render={renderImage}
                        src="/icon.svg"
                        alt=""
                        width={29}
                        height={29}
                      />
                    ) : (
                      <FolderGit2 size={21} aria-hidden="true" />
                    )}
                  </span>
                  <ProjectProposalComposer
                    key={`${post.id}:${analysisVersionId}:${project.id}`}
                    organizationId={organizationId}
                    sourceId={post.id}
                    analysisVersionId={analysisVersionId}
                    insight={{
                      ...insight,
                      title: insight.title ?? insight.claim,
                    }}
                    insights={insights}
                    sourceTitle={title}
                    projects={[
                      { id: project.id, name: projectLabel(project.name) },
                    ]}
                    suggestions={[
                      { ...project, name: projectLabel(project.name) },
                    ]}
                    disabled={readOnly || demo}
                    call={call}
                    onSaved={onRetry}
                    onPreferencesChange={onRetry}
                  />
                  <ChevronRight
                    size={18}
                    className={styles.draftArrow}
                    aria-hidden="true"
                  />
                </div>
              ))}
            {!proposals.length && !recommendations.length && (
              <div className={styles.noProjects}>
                <FolderGit2 size={24} aria-hidden="true" />
                <p>Connect a project to start a plan.</p>
                <a href={demo ? "/demo?view=projects" : `${base}/projects`}>
                  Choose a project
                </a>
              </div>
            )}
          </>
        )}
      </div>
      {!mode && <div className={styles.mobileNext}>{next}</div>}
    </section>
  );
  return (
    <article
      id={`feed-post-${post.id}`}
      ref={article}
      className={styles.post}
      data-feed-post={post.id}
      data-loaded={!!detail}
      data-feed-layout={mode}
      data-feed-current={current}
      hidden={skipped || (mode === "review" && !current)}
      onClickCapture={
        onNavigate
          ? (event) => {
              const anchor = (event.target as Element).closest("a");
              if (anchor && event.currentTarget.contains(anchor)) {
                event.preventDefault();
                onNavigate(anchor.getAttribute("href") ?? sourceHref);
              }
            }
          : undefined
      }
    >
      <div className={styles.columns} data-feed-columns>
        <div className={styles.readingPane} data-feed-reading-pane>
          {sourceSection}
          {!mode && insightsSection}
        </div>
        {mode === "snap" ? (
          <dialog
            ref={snapDetails}
            id={`${uid}-details`}
            className={styles.snapDetails}
            aria-label="Post insights and projects"
          >
            <div className={styles.snapSheet}>
              <header className={styles.snapSheetTop}>
                <button
                  type="button"
                  aria-label="Close insights and projects"
                  onClick={() => snapDetails.current?.close()}
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse") return;
                    sheetGesture.current = event.clientY;
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerUp={(event) => {
                    if (
                      sheetGesture.current !== null &&
                      event.clientY - sheetGesture.current > 24
                    )
                      snapDetails.current?.close();
                    sheetGesture.current = null;
                  }}
                  onPointerCancel={() => {
                    sheetGesture.current = null;
                  }}
                >
                  <span aria-hidden="true" />
                  <X size={20} aria-hidden="true" />
                </button>
              </header>
              {insightsSection}
              {plansSection}
            </div>
          </dialog>
        ) : mode ? (
          <div className={styles.modeDetails}>
            {insightsSection}
            {plansSection}
          </div>
        ) : (
          plansSection
        )}
      </div>
      <SettingsPanel
        title="Post settings"
        triggerLabel="Post settings"
        variant="post"
        trigger={false}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      >
        <section className="post-settings-group" aria-label="Source and evidence">
          <h3>Source and evidence</h3>
          <div className="post-settings-links">
            {detail?.url && (
              <a href={detail.url} target="_blank" rel="noopener noreferrer">
                <ArrowUpRight size={18} aria-hidden="true" />
                <span><strong>Original post</strong><small>Open on the source platform</small></span>
              </a>
            )}
            {preview ? preview.evidence : (
              <>
                <a href={`${sourceHref}#post-settings-evidence`}>
                  <FileText size={18} aria-hidden="true" />
                  <span><strong>Source evidence</strong><small>Transcript, caption and saved frames</small></span>
                </a>
                <a href={`${sourceHref}#post-settings`}>
                  <Settings2 size={18} aria-hidden="true" />
                  <span><strong>Analysis and post controls</strong><small>Versions, categories, privacy and processing</small></span>
                </a>
              </>
            )}
          </div>
        </section>
      </SettingsPanel>
    </article>
  );
}

type ThumbnailProps = {
  candidates: string[];
  kind: string;
  demo?: boolean;
  priority?: boolean;
  resolve?: (id: string) => string;
};
function Thumbnail({
  render,
  ...props
}: ThumbnailProps & { render?: (props: ThumbnailProps) => ReactNode }) {
  return (
    render?.(props) ?? (
      <span className="source-thumb" aria-hidden="true">
        <Video size={28} />
      </span>
    )
  );
}
type ImageProps = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  sizes?: string;
  className?: string;
};
function ImageView({
  render,
  ...props
}: ImageProps & { render?: (props: ImageProps) => ReactNode }) {
  return render?.(props) ?? <Video size={28} aria-hidden="true" />;
}
type ArtifactProps = ComponentProps<typeof ProposalArtifactCore>;
function Artifact({
  render,
  ...props
}: ArtifactProps & { render?: (props: ArtifactProps) => ReactNode }) {
  return render?.(props) ?? <ProposalArtifactCore {...props} />;
}
function FeedSkeleton({ label }: { label: string }) {
  return (
    <output className={styles.skeleton} aria-label={label}>
      <span />
      <span />
      <span />
    </output>
  );
}
