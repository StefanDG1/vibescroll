"use client";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import {
  ArrowDown,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  MoreHorizontal,
  MoreVertical,
  Play,
  Video,
} from "lucide-react";
import { InsightCardControl } from "./insight-card-control";
import { PostEngagement } from "./post-engagement";
import { ProjectProposalComposer } from "./project-proposal-composer";
import { FeedTour } from "./feed-tour";
import { SettingsPanel } from "./settings-panel";
import { ErrorState } from "./assistant-elements/error-state";
import { ProposalArtifactCore } from "./assistant-elements/proposal-artifact-core";
import { insightPresentation } from "../../../packages/insights/presentation";
import {
  projectLabel,
  type FeedDetail,
  type FeedPost,
  type FeedEngagement,
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
}: {
  post: FeedCardPost;
  detail?: FeedDetail;
  engagement?: FeedEngagement;
  onReaction: (
    value: Pick<FeedEngagement, "scopeKey" | "liked" | "revision">,
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
  preview?: {
    resolveThumbnail: (id: string, ownerId?: string) => string;
    onContinue: () => void;
    evidence?: ReactNode;
    projectName?: string;
  };
}) {
  const article = useRef<HTMLElement>(null);
  const reportVisible = useEffectEvent(onVisible);
  const [selected, setSelected] = useState<string | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [demoLiked, setDemoLiked] = useState(true);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeError, setLikeError] = useState("");
  const likeFlight = useRef(false);
  const uid = useId();
  const sourceHref = preview
    ? "/onboarding"
    : demo
      ? `/demo?source=demo-0`
      : `${base}/posts/${post.id}`;
  const title = detail?.title ?? post.title;
  const author = detail?.authorName ?? post.authorName ?? "Saved post";
  const candidates = detail?.thumbnailAssetIds.length
    ? detail.thumbnailAssetIds
    : post.thumbnailAssetIds;
  const topics = detail?.categoryKeys ?? [];
  const insights = active ? (detail?.insights ?? []) : [];
  const expandedInsight =
    selected === null
      ? insights[0]
      : insights.find((item) => item.id === selected);
  const insight = insights[0];
  const analysisVersionId = detail?.analysisVersionId;
  const proposals = active ? (detail?.proposals ?? []) : [];
  const openPlan = expandedPlan === undefined ? proposals[0]?.id : expandedPlan;
  const recommendations =
    detail?.suggestions.items
      .filter(
        (project) =>
          project.fit.matched > 0 &&
          !proposals.some((plan) => plan.projectId === project.id),
      )
      .slice(0, Math.max(0, 3 - proposals.length)) ?? [];
  const engagement = demo ? detail?.engagement : observedEngagement;
  async function like() {
    if (!engagement || likeFlight.current) return;
    likeFlight.current = true;
    setLikeBusy(true);
    setLikeError("");
    try {
      const result = await call("setPostLike", {
        organizationId,
        sourceId: post.id,
        liked: !engagement.liked,
        expectedRevision: engagement.revision,
        key: crypto.randomUUID(),
      });
      onReaction(result);
    } catch {
      setLikeError(
        "Could not confirm your reaction. Check its updated state before trying again.",
      );
    } finally {
      likeFlight.current = false;
      setLikeBusy(false);
    }
  }
  useEffect(() => {
    if (!article.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) reportVisible();
      },
      { rootMargin: "-10% 0px -55% 0px" },
    );
    observer.observe(article.current);
    return () => observer.disconnect();
  }, []);
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  function skip() {
    if (!nextPost) return;
    scrollTo(`feed-post-${nextPost.id}`);
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
      Keep this post <ChevronRight size={16} aria-hidden="true" />
    </button>
  ) : (
    <PostEngagement
      likes={
        demo && engagement
          ? engagement.likes + (demoLiked ? 0 : -1)
          : engagement?.likes
      }
      requests={engagement?.shares}
      liked={demo ? demoLiked : engagement?.liked}
      onLike={
        demo
          ? () => setDemoLiked((value) => !value)
          : engagement && !readOnly
            ? () => void like()
            : undefined
      }
      busy={likeBusy}
      notice={likeError}
      onSettings={() => setSettingsOpen(true)}
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
  return (
    <article
      id={`feed-post-${post.id}`}
      ref={article}
      className={styles.post}
      data-feed-post={post.id}
      data-loaded={!!detail && active}
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
          <section
            className={styles.source}
            data-feed-column="source"
            aria-labelledby={`feed-title-${post.id}`}
          >
            <div className={styles.creator}>
              <span className={styles.avatar}>
                {author.slice(0, 1).toUpperCase()}
              </span>
              <strong>{author}</strong>
              {!demo && !preview && showTour && <FeedTour />}
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label={`Post settings for ${title}`}
              >
                <MoreVertical size={20} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.poster}>
              {demo ? (
                <ImageView
                  render={renderImage}
                  src="/product/overview-poster.png"
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
                  resolve={thumbnailResolver}
                />
              )}
              {showPlayControl &&
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
                  {String(Math.floor(detail.durationMs / 1000) % 60).padStart(
                    2,
                    "0",
                  )}
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
                    <li key={topic}>{topicName(topic)}</li>
                  ))}
                </ul>
              ) : (
                <div className={styles.tagSpace} />
              )}
              <p className={styles.summary}>{detail?.summary ?? ""}</p>
              {observedState}
              {reactions}
              <button
                type="button"
                className={styles.mobileCue}
                onClick={() => scrollTo(`${uid}-insights`)}
              >
                Scroll for insights <ChevronDown size={17} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.desktopNext}>{next}</div>
          </section>
          <section
            id={`${uid}-insights`}
            className={styles.insights}
            data-feed-column="insights"
            aria-label={`Insights for ${title}`}
          >
            <div className={styles.mobileContext}>
              <Thumbnail
                render={renderThumbnail}
                candidates={candidates}
                kind={post.kind}
                demo={demo}
                resolve={thumbnailResolver}
              />
              <div>
                <h3>{title}</h3>
                <small>{topics.slice(0, 2).map(topicName).join(" · ")}</small>
              </div>
            </div>
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
              ) : error && active ? (
                <ErrorState
                  title="Insights unavailable"
                  detail={error}
                  onRetry={onRetry}
                  action={<a href={sourceHref}>Open post</a>}
                />
              ) : !detail || !active ? (
                <FeedSkeleton label="Insights load as this post approaches" />
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
                          trigger={
                            <MoreHorizontal size={20} aria-hidden="true" />
                          }
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
        </div>
        <section
          id={`${uid}-plans`}
          className={styles.plans}
          data-feed-column="plans"
          aria-label={`Project plans for ${title}`}
        >
          <div className={styles.mobileContext}>
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
              <small>{topics.slice(0, 2).map(topicName).join(" · ")}</small>
            </div>
          </div>
          <div className={styles.sectionHeading}>
            <h2>Apply to a project</h2>
            <SettingsPanel
              title="Project options"
              triggerLabel={`Project options for ${title}`}
            >
              <p>Each proposal considers all insights from this post.</p>
              {preview ? (
                <p>
                  A project is a product, business or codebase you are working
                  on.
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
                <button
                  type="button"
                  className="button primary"
                  onClick={preview.onContinue}
                >
                  Use for my project{" "}
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            ) : !detail || !active ? (
              <FeedSkeleton label="Project plans load with this post" />
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
          <div className={styles.mobileNext}>{next}</div>
        </section>
      </div>
      <SettingsPanel
        title="Post settings"
        triggerLabel="Post settings"
        trigger={false}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      >
        <h3>{title}</h3>
        <p>{author}</p>
        {topics.length > 0 && (
          <ul className={styles.tags}>
            {topics.map((topic) => (
              <li key={topic}>{topicName(topic)}</li>
            ))}
          </ul>
        )}
        <h4>About this post</h4>
        <p>{detail?.summary}</p>
        {detail?.url && (
          <p>
            <a href={detail.url} target="_blank" rel="noopener noreferrer">
              Open original post
            </a>
          </p>
        )}
        <h4>Analysis and evidence</h4>
        {preview ? (
          preview.evidence
        ) : (
          <a className="button" href={sourceHref}>
            Open complete post
          </a>
        )}
        <p className="fine">
          Version history, transcript, screenshots and advanced analysis options
          are on the complete post.
        </p>
        <p className="fine">
          Post requests count people who sent this link to VibeScroll, including
          cached results. Each person counts once, since tracking began.
        </p>
      </SettingsPanel>
    </article>
  );
}

function topicName(topic: string) {
  const name = topic.replaceAll("_", " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
type ThumbnailProps = {
  candidates: string[];
  kind: string;
  demo?: boolean;
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
