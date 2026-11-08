import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleUserRound,
  ExternalLink,
  FolderGit2,
  Home,
  Maximize2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useApplication, type CollectionKind } from "./use-application";
import {
  profilesOf,
  reauthorizeSources,
  evidenceLabel,
  insightSchema,
  type Source,
} from "./data";
import {
  appOrigin,
  jobPresentation,
  type ToolRecord,
} from "../../../packages/widget/contracts";
import { PostInsightReader } from "../../starter/components/post-insight-reader";
import { InsightCardControl } from "../../starter/components/insight-card-control";
import { SettingsPanel } from "../../starter/components/settings-panel";
import { ProjectProposalComposer } from "../../starter/components/project-proposal-composer";
import { ObservedSourceProgress } from "../../starter/components/source-progress";
import {
  ProcessingAccountSummary,
  ProcessingCreditReceipt,
} from "../../starter/components/processing-account-summary";
import { InsightDiscovery } from "../../starter/components/insight-discovery";
import { insightPresentation } from "../../../packages/insights/presentation";
import { suggestProjects } from "../../starter/lib/project-suggestions";
import { ProposalPanel } from "./proposal-panel";
import { FullscreenFeed } from "./fullscreen-feed";
import { useSourceMedia } from "./source-media";

type View = "home" | "explore" | "work" | "save" | "catalog";
export function CompactApp() {
  const model = useApplication();
  const { host, source } = model;
  const full = host.fullscreen;
  const media = useSourceMedia(
    full ? source : null,
    model.profileId,
    Number(model.workspace?.grant_version ?? 0),
    host.call,
    host.readImage,
  );
  const [view, setView] = useState<View>("home");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [projects, setProjects] = useState<
    { id: string; name: string; profile: string }[]
  >([]);
  const [projectSource, setProjectSource] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<{
    id: string;
    profileId: string;
  } | null>(null);
  const [frame, setFrame] = useState<{
    id: string;
    data: string;
    key: string;
  } | null>(null);
  const [frameBusy, setFrameBusy] = useState(false);
  const [frameError, setFrameError] = useState("");
  const webUrl = model.profileId
    ? `${appOrigin}/app/${model.profileId}`
    : `${appOrigin}/app`;
  const catalog = model.workspace?.catalog as
    Record<string, unknown> | undefined;
  async function open(destination: string) {
    try {
      await host.open(new URL(destination, appOrigin).href);
    } catch (failed) {
      model.fail(failed, true);
    }
  }
  async function expand() {
    try {
      await host.expand();
    } catch (failed) {
      model.fail(failed, true);
    }
  }
  function navigate(nextView: View) {
    setView(nextView);
    setExpanded(null);
    setProjects([]);
    setProjectSource("");
    setSelectedProposal(null);
    setFrame(null);
    model.clearSelection();
    const kind: CollectionKind =
      nextView === "catalog"
        ? "catalog"
        : nextView === "work"
          ? "proposals"
          : "sources";
    if (nextView !== "save" && nextView !== "explore")
      void model.load(model.profileId || undefined, undefined, undefined, kind);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || !model.profileId) return;
    const link = url.trim();
    const current = model.captureScope();
    setSaving(true);
    setSubmitted(link);
    try {
      const result = await host.call("save_link", {
        profileId: model.profileId,
        url: link,
      });
      if (!current()) return;
      if (typeof result.source_id !== "string")
        throw Error(
          "Save was not confirmed. Check VibeScroll before trying again.",
        );
      setSubmitted("");
      setUrl("");
      await model.load(
        String(result.profile_id ?? model.profileId),
        result.source_id,
        undefined,
        "sources",
        model.workspace,
        result,
      );
    } catch (failed) {
      if (current()) model.fail(failed, true);
    } finally {
      setSaving(false);
    }
  }
  function openSource(selected: {
    id: string;
    profileId?: string;
    fetchId?: string;
    sharedGrantId?: string;
    sharedGrantVersion?: number;
  }) {
    setSelectedProposal(null);
    setExpanded(null);
    setProjectSource("");
    setProjects([]);
    void model.load(
      selected.profileId ?? model.profileId,
      selected.fetchId ?? selected.id,
      undefined,
      "sources",
      undefined,
      undefined,
      selected.sharedGrantId
        ? {
            sharedGrantId: selected.sharedGrantId,
            sharedGrantVersion: selected.sharedGrantVersion,
          }
        : undefined,
    );
  }
  async function showProjects() {
    if (!source || projectBusy || !model.actions.context) return;
    setProjectBusy(true);
    const currentScope = model.captureScope();
    try {
      const current = profilesOf(
        await host.call("get_profile", { profileId: model.profileId }),
      );
      if (!currentScope()) return;
      const list =
        current.find((p) => p.profile_id === model.profileId)?.projects ?? [];
      setProjects(
        list.flatMap((p) => {
          const id = p.project_id ?? p.repository_id;
          return typeof id === "string" &&
            typeof p.name === "string" &&
            p.context_changed !== true
            ? [
                {
                  id,
                  name: p.name,
                  profile: typeof p.context === "string" ? p.context : "",
                },
              ]
            : [];
        }),
      );
      setProjectSource(source.id);
    } catch (failed) {
      if (currentScope()) model.fail(failed, true);
    } finally {
      setProjectBusy(false);
    }
  }
  async function proposalCall(operation: string, args: unknown) {
    if (!source) throw Error("Open a saved post first.");
    if (operation === "projectPlanningContext")
      await reauthorizeSources(host.call, model.profileId, [source]);
    const name =
      operation === "projectPlanningContext"
        ? "get_project_application_context"
        : operation === "projectProposalSave"
          ? "save_project_proposal"
          : null;
    if (!name) throw Error("Open VibeScroll for this project action.");
    return host.call(name, {
      ...(args as ToolRecord),
      profileId: model.profileId,
    });
  }
  async function continueProposal(proposalId: string) {
    await host.call("get_project_proposal", {
      profileId: model.profileId,
      proposalId,
    });
    await host.message(
      `Continue my VibeScroll proposal ${proposalId} in profile ${model.profileId}. Read get_project_proposal and all retained post insights with the selected project context. Saving a draft does not authorize coding, spending or publication.`,
    );
  }
  const suggestions =
    source && projectSource === source.id
      ? suggestProjects(
          {
            analysisVersion: { id: source.analysisVersionId },
            analysis: { insights: source.insights },
          },
          projects.map((p) => ({
            _id: p.id,
            fullName: p.name,
            profile: p.profile,
            enabled: true,
            confirmed: true,
            status: "connected",
          })),
        ).items
      : [];
  const progress = model.progress;
  const processingView = (
    <>
      {progress.progress && (
        <ObservedSourceProgress
          progress={progress.progress}
          steps={progress.steps}
          paused={model.paused}
          observedAt={model.observedAt}
          action={
            model.paused ? (
              <button className="button" onClick={() => void model.refresh()}>
                Refresh status
              </button>
            ) : undefined
          }
        />
      )}
      <ProcessingCreditReceipt processing={model.job?.processing} />
    </>
  );
  const projectPanel = source ? (
    <div className="widget-project-panel">
      {selectedProposal?.profileId === model.profileId ? (
        <ProposalPanel
          draftStorage={host.draftStorage}
          readOnly={!model.actions.draft}
          proposalId={selectedProposal.id}
          profileId={model.profileId}
          call={host.call}
          onNavigate={(value) => void open(value)}
          onBack={() => setSelectedProposal(null)}
        />
      ) : model.actions.draft ? (
        projectSource === source.id ? (
          projects.length && source.analysisVersionId && source.insights[0] ? (
            <ProjectProposalComposer
              key={`${model.profileId}:${source.id}:${source.analysisVersionId}`}
              organizationId={model.profileId}
              sourceId={source.id}
              analysisVersionId={source.analysisVersionId}
              insight={source.insights[0]}
              insights={source.insights}
              sourceTitle={source.title}
              projects={projects}
              suggestions={suggestions}
              disabled={model.busy}
              call={proposalCall}
              onNavigate={host.open}
              onSaved={(id) =>
                setSelectedProposal({ id, profileId: model.profileId })
              }
              onContinue={host.canMessage ? continueProposal : undefined}
            />
          ) : (
            <>
              <p>No current granted projects were returned.</p>
              <button
                className="button"
                onClick={() => void open(`${webUrl}/projects`)}
              >
                Review projects
              </button>
            </>
          )
        ) : (
          <button
            className="button"
            disabled={projectBusy}
            onClick={() => void showProjects()}
          >
            {projectBusy ? "Loading projects…" : "Apply to a project"}
          </button>
        )
      ) : (
        <button
          className="button"
          onClick={() => void open(`${webUrl}/connections`)}
        >
          Review project access
        </button>
      )}
    </div>
  ) : null;
  const title =
    typeof model.job?.title === "string" ? model.job.title : source?.title;
  const readyInsights = (post: Source, compact = false) => (
    <PostInsightReader sourceAction={null}>
      {post.insights.slice(0, compact ? 3 : undefined).map((insight) => (
        <article
          className="post-insight-card"
          key={`${post.analysisVersionId}:${insight.id}`}
          data-selected={expanded === insight.id}
        >
          <InsightCardControl
            title={insight.title}
            subtitle={insight.claim}
            icon={insightPresentation(insight).icon}
            expanded={expanded === insight.id}
            onClick={() =>
              setExpanded(expanded === insight.id ? null : insight.id)
            }
          >
            <SettingsPanel
              title="Insight evidence"
              triggerLabel={`Evidence and options for ${insight.title}`}
            >
              <p>{insight.title}</p>
              {insight.evidence.length ? (
                <ul>
                  {insight.evidence.map((ref, i) => (
                    <li key={i}>{evidenceLabel(ref)}</li>
                  ))}
                </ul>
              ) : (
                <p>Open the post to inspect retained evidence.</p>
              )}
              <button className="button" onClick={() => void open(post.url)}>
                Open full evidence
                <ExternalLink size={15} />
              </button>
            </SettingsPanel>
          </InsightCardControl>
          {expanded === insight.id && (
            <div className="post-insight-detail">
              <p>{insight.claim}</p>
            </div>
          )}
        </article>
      ))}
    </PostInsightReader>
  );
  const saveForm = (
    <form className="compact-save" onSubmit={save}>
      <label className="sr-only" htmlFor="compact-url">
        Post link
      </label>
      <input
        id="compact-url"
        type="url"
        required
        maxLength={2048}
        placeholder="Paste a Reel or TikTok link"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        disabled={saving || !model.actions.save}
      />
      <button
        type="submit"
        disabled={saving || !url.trim() || !model.actions.save}
        aria-label="Save link"
      >
        <Plus size={20} />
      </button>
    </form>
  );
  return (
    <main
      className={`compact-root${full ? " application-full" : " application-inline"}`}
      data-theme={host.theme}
      data-presentation={full ? "fullscreen" : "inline"}
    >
      <header className="compact-header">
        <div className="compact-brand">
          <strong>VibeScroll</strong>
          {full && model.profiles.length > 1 && model.profileId && (
            <label className="compact-workspace">
              <span className="sr-only">Workspace</span>
              <select
                value={model.profileId}
                onChange={(event) => {
                  setView("home");
                  void model.load(event.target.value);
                }}
              >
                {model.profiles.map((profile) => (
                  <option key={profile.profile_id} value={profile.profile_id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="application-header-actions">
          {model.workspace && (
            <ProcessingAccountSummary
              account={model.account}
              unavailable={model.accountUnavailable}
              onOpen={(destination) => void open(destination)}
            />
          )}
          {full ? (
            <button
              className="compact-open"
              onClick={() => void open(webUrl)}
              aria-label="Open VibeScroll website"
            >
              <ExternalLink size={16} />
            </button>
          ) : (
            <button
              className="compact-open"
              onClick={() => void expand()}
              aria-label="Open full VibeScroll view"
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
      </header>
      {host.demo && (
        <p className="compact-demo">
          Synthetic preview. No real source, analysis or write.
        </p>
      )}
      {host.error ? (
        <section role="alert">
          <p>{host.error}</p>
          <button
            className="button"
            onClick={() => void open(`${appOrigin}/app`)}
          >
            Continue in VibeScroll
          </button>
        </section>
      ) : !host.ready ? (
        <output>Connecting to VibeScroll…</output>
      ) : (
        <>
          {full && model.profileId && (
            <nav className="application-nav" aria-label="VibeScroll">
              <button
                aria-current={view === "home" ? "page" : undefined}
                onClick={() => navigate("home")}
              >
                <Home size={17} />
                Home
              </button>
              <button
                aria-current={
                  view === "explore" || view === "catalog" ? "page" : undefined
                }
                onClick={() => navigate("explore")}
              >
                <Search size={17} />
                Explore
              </button>
              <button
                aria-current={view === "work" ? "page" : undefined}
                onClick={() => navigate("work")}
              >
                <FolderGit2 size={17} />
                Work
              </button>
              <button
                aria-current={view === "save" ? "page" : undefined}
                onClick={() => navigate("save")}
              >
                <Plus size={17} />
                Save
              </button>
              <button
                className="application-account-link"
                onClick={() => void open(`${webUrl}/account`)}
              >
                <CircleUserRound size={17} />
                Account
              </button>
            </nav>
          )}
          {model.busy && !model.profileId && !model.search && (
            <section
              className="compact-startup"
              aria-busy="true"
              aria-label="Loading your library"
            >
              <output>Opening your library…</output>
              <div className="startup-card" aria-hidden="true" />
              <div className="startup-card" aria-hidden="true" />
              <div className="startup-card" aria-hidden="true" />
            </section>
          )}
          {!model.profileId && !model.search && !model.busy && (
            <section className="workspace-start">
              <h1>
                {model.profiles.length
                  ? "Your workspaces"
                  : "Connect your library"}
              </h1>
              <p>
                {model.profiles.length
                  ? "Choose where to view your posts."
                  : "Open VibeScroll to set up access to your saved posts."}
              </p>
              <div className="workspace-options">
                {model.profiles.map((profile) => (
                  <button
                    className="workspace-option"
                    key={profile.profile_id}
                    onClick={() => void model.load(profile.profile_id)}
                  >
                    <span className="workspace-avatar" aria-hidden="true">
                      {profile.name.trim().slice(0, 1).toUpperCase()}
                    </span>
                    <span>{profile.name}</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
              {!model.profiles.length && (
                <button
                  className="button"
                  onClick={() => void open(`${appOrigin}/app`)}
                >
                  Review access in VibeScroll
                </button>
              )}
            </section>
          )}
          {model.error && (
            <section role="alert" className="application-error">
              <p>{model.error}</p>
              <button className="button" onClick={() => void model.refresh()}>
                Refresh
              </button>
              <button
                className="compact-open"
                onClick={() => void open(webUrl)}
              >
                Open app
              </button>
            </section>
          )}
          {(saving ||
            submitted ||
            (host.initialPending && typeof host.input?.url === "string")) && (
            <section aria-live="polite" className="compact-progress">
              <strong>{saving ? "Saving link…" : "Save needs checking"}</strong>
              <p className="fine">
                {submitted || String(host.input?.url ?? "")}
              </p>
              <p>
                Submitted link. Saving and processing are confirmed separately.
              </p>
            </section>
          )}
          {full && (view === "explore" || model.search) && (
            <form
              className="application-search"
              onSubmit={(event) => {
                event.preventDefault();
                if (query.trim()) void model.runSearch(query.trim());
              }}
            >
              <label className="sr-only" htmlFor="knowledge-query">
                Search saved insights
              </label>
              <Search size={18} aria-hidden="true" />
              <input
                id="knowledge-query"
                placeholder="What would you like to put to work?"
                maxLength={200}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button className="button" type="submit" disabled={!query.trim()}>
                Search
              </button>
            </form>
          )}
          {full && view === "explore" && catalog?.allowed === true && (
            <button
              className="compact-back"
              onClick={() => navigate("catalog")}
            >
              <BookOpen size={17} />
              Browse shared catalog
            </button>
          )}
          {full &&
          view === "work" &&
          selectedProposal?.profileId === model.profileId ? (
            <ProposalPanel
              draftStorage={host.draftStorage}
              readOnly={!model.actions.draft}
              key={`${model.profileId}:${selectedProposal.id}`}
              proposalId={selectedProposal.id}
              profileId={model.profileId}
              call={host.call}
              onNavigate={(value) => void open(value)}
              onBack={() => setSelectedProposal(null)}
            />
          ) : full && view === "home" && model.rows.length > 0 ? (
            <>
              <FullscreenFeed
                media={media}
                posts={model.rows}
                active={source}
                status={processingView}
                nextPage={!!model.next}
                onVisible={(post) => {
                  if (model.source?.id !== post.id) openSource(post);
                }}
                onOpen={(value) => void open(value)}
                projectPanel={projectPanel}
                evidence={
                  <button
                    className="button"
                    onClick={() => source && void open(source.url)}
                  >
                    Open retained evidence
                  </button>
                }
              />
              {model.coverage && (
                <details className="compact-coverage">
                  <summary>About these results</summary>
                  <p>{model.coverage}</p>
                </details>
              )}
              {model.next && (
                <button
                  className="button"
                  disabled={model.busy}
                  onClick={() =>
                    void model.load(
                      model.profileId,
                      undefined,
                      model.next!,
                      "sources",
                    )
                  }
                >
                  Load more posts
                </button>
              )}
            </>
          ) : model.search ? (
            <>
              <InsightDiscovery
                page={model.search.page}
                query={model.search.query}
                busy={model.search.busy}
                error={model.search.error}
                compact={!full}
                onOpen={openSource}
                onMore={() => void model.runSearch(model.search!.query, true)}
              />
              {!full && (
                <button className="button" onClick={() => void expand()}>
                  Open full view
                  <Maximize2 size={15} />
                </button>
              )}
            </>
          ) : source ? (
            <>
              {full && (
                <button
                  className="compact-back"
                  onClick={() => void model.load(model.profileId)}
                >
                  <ArrowLeft size={16} />
                  Home
                </button>
              )}
              <div className="compact-post-title">
                <h1>{title}</h1>
                <button
                  className="icon-button"
                  disabled={model.busy}
                  onClick={() => void model.refresh()}
                  aria-label="Refresh this post"
                >
                  <RefreshCw size={17} />
                </button>
              </div>
              {progress.progress && (
                <ObservedSourceProgress
                  progress={progress.progress}
                  steps={progress.steps}
                  paused={model.paused}
                  observedAt={model.observedAt}
                  action={
                    model.paused ? (
                      <button
                        className="button"
                        onClick={() => void model.refresh()}
                      >
                        Refresh status
                      </button>
                    ) : undefined
                  }
                />
              )}
              <ProcessingCreditReceipt processing={model.job?.processing} />
              {!progress.progress && source.state !== "ready" && (
                <p className="fine">
                  Saved. No active processing was reported.
                </p>
              )}
              {model.busy && (
                <output className="compact-loading">
                  Loading current post…
                </output>
              )}
              <div
                className={
                  full ? "widget-source-scene" : "application-post-content"
                }
              >
                {full ? (
                  <FullscreenFeed
                    media={media}
                    posts={[source]}
                    active={source}
                    nextPage={false}
                    onVisible={() => {}}
                    onOpen={(value) => void open(value)}
                    projectPanel={projectPanel}
                    evidence={
                      <button
                        className="button"
                        onClick={() => void open(source.url)}
                      >
                        Open retained evidence
                      </button>
                    }
                  />
                ) : (
                  readyInsights(source, true)
                )}
              </div>
              {!full && (
                <div className="inline-primary-actions">
                  <button className="button" onClick={() => void expand()}>
                    {source.insights.length
                      ? "View insights"
                      : "Open full view"}
                    <Maximize2 size={15} />
                  </button>
                  <SettingsPanel
                    title="Saved source"
                    triggerLabel="View saved source"
                    trigger={<span>Source</span>}
                  >
                    <p>{source.title}</p>
                    <button
                      className="button"
                      onClick={() => void open(source.url)}
                    >
                      Open source evidence
                      <ExternalLink size={15} />
                    </button>
                  </SettingsPanel>
                </div>
              )}
            </>
          ) : model.catalogPost ? (
            <CatalogPost
              post={model.catalogPost}
              onBack={() =>
                void model.load(
                  model.profileId,
                  undefined,
                  undefined,
                  "catalog",
                )
              }
              onFrame={async (id) => {
                const post = model.catalogPost!;
                setFrameBusy(true);
                setFrameError("");
                try {
                  const data = await host.readImage("widget_catalog_frame", {
                    profileId: model.profileId,
                    familyId: post.family_id,
                    artifactId: post.artifact_id,
                    frameId: id,
                  });
                  setFrame({
                    id,
                    data,
                    key: `${post.family_id}:${post.artifact_id}`,
                  });
                } catch (failed) {
                  setFrameError(
                    failed instanceof Error
                      ? failed.message
                      : "Frame unavailable.",
                  );
                } finally {
                  setFrameBusy(false);
                }
              }}
              frame={
                frame?.key ===
                `${model.catalogPost.family_id}:${model.catalogPost.artifact_id}`
                  ? frame
                  : null
              }
              frameBusy={frameBusy}
              frameError={frameError}
            />
          ) : (
            model.profileId && (
              <>
                {model.busy && (
                  <output className="compact-loading">Loading…</output>
                )}
                {(view === "save" || !full) && saveForm}
                {((view !== "explore" && view !== "save") || !full) && (
                  <>
                    <h1>
                      {model.kind === "catalog"
                        ? "Shared catalog"
                        : model.kind === "proposals"
                          ? "Your project plans"
                          : "Recent posts"}
                    </h1>
                    {model.kind === "catalog" && (
                      <p className="fine">
                        Browsing retained shared results does not add them to
                        your saved posts or start analysis.
                      </p>
                    )}
                    <div className="compact-recent">
                      {model.kind === "sources"
                        ? model.rows.map((post) => (
                            <button
                              key={post.id}
                              onClick={() => openSource(post)}
                            >
                              <span>
                                <strong>{post.title}</strong>
                                <small>
                                  {
                                    jobPresentation({ status: post.state })
                                      .label
                                  }
                                </small>
                              </span>
                              <ArrowRight size={17} />
                            </button>
                          ))
                        : model.records.map((record) => (
                            <button
                              key={String(record.id)}
                              onClick={() =>
                                model.kind === "catalog"
                                  ? void model.openCatalog(record)
                                  : setSelectedProposal({
                                      id: String(record.proposalId),
                                      profileId: model.profileId,
                                    })
                              }
                            >
                              <span>
                                <strong>{String(record.title)}</strong>
                                <small>
                                  {model.kind === "catalog"
                                    ? `${record.insight_count} retained insights`
                                    : String(record.state)}
                                </small>
                              </span>
                              <ArrowRight size={17} />
                            </button>
                          ))}
                    </div>
                    {!model.busy &&
                      !(model.rows.length || model.records.length) && (
                        <p>
                          {model.next
                            ? "No visible records on this page. Continue to inspect the next page."
                            : model.kind === "catalog"
                              ? "No eligible catalog posts were returned."
                              : model.kind === "proposals"
                                ? "No current plans were returned for your granted projects."
                                : "No saved posts were returned for this workspace."}
                        </p>
                      )}
                    {model.coverage && (
                      <details className="compact-coverage">
                        <summary>About these results</summary>
                        <p>{model.coverage}</p>
                      </details>
                    )}
                    {model.next && (
                      <button
                        className="button"
                        disabled={model.busy}
                        onClick={() =>
                          void model.load(
                            model.profileId,
                            undefined,
                            model.next!,
                            model.kind,
                          )
                        }
                      >
                        Load more
                      </button>
                    )}
                  </>
                )}
                {full && view === "home" && (
                  <button
                    className="compact-open"
                    onClick={() => void open(`${webUrl}/library`)}
                  >
                    Open Library Tree and Folders
                    <ExternalLink size={15} />
                  </button>
                )}
              </>
            )
          )}
        </>
      )}
    </main>
  );
}

function CatalogPost({
  post,
  onBack,
  onFrame,
  frame,
  frameBusy,
  frameError,
}: {
  post: ToolRecord;
  onBack: () => void;
  onFrame: (id: string) => void;
  frame: { id: string; data: string } | null;
  frameBusy: boolean;
  frameError: string;
}) {
  const analysis = post.analysis as ToolRecord | undefined;
  const parsed = insightSchema.array().safeParse(analysis?.insights ?? []);
  const insights = parsed.success ? parsed.data : [];
  const frames = (post.frames ?? []) as ToolRecord[];
  return (
    <section>
      <button className="compact-back" onClick={onBack}>
        <ArrowLeft size={16} />
        Catalog
      </button>
      <h1>{String(post.title)}</h1>
      <p className="fine">
        {String(post.author_name ?? "")} · Shared retained result
      </p>
      <PostInsightReader>
        {insights.map((idea) => (
          <article className="post-insight-card catalog-insight" key={idea.id}>
            <h2>{idea.title}</h2>
            <p>{idea.claim}</p>
            <SettingsPanel
              title="Retained insight evidence"
              triggerLabel={`Evidence for ${idea.title}`}
            >
              <ul>
                {idea.evidence.map((ref, i) => (
                  <li key={i}>{evidenceLabel(ref)}</li>
                ))}
              </ul>
            </SettingsPanel>
          </article>
        ))}
      </PostInsightReader>
      <SettingsPanel
        title="Retained frames"
        triggerLabel="View retained frames"
        trigger={<span>Source frames</span>}
      >
        <p>Frames belong to this exact retained catalog version.</p>
        {frames.map((item) => (
          <button
            className="button"
            key={String(item.id)}
            disabled={frameBusy}
            onClick={() => onFrame(String(item.id))}
          >
            {typeof item.timestampMs === "number"
              ? evidenceLabel({ startMs: item.timestampMs })
              : "View frame"}
          </button>
        ))}
        {frameBusy && <output>Loading retained frame…</output>}
        {frameError && <p role="alert">{frameError}</p>}
        {frame && (
          // eslint-disable-next-line next/no-img-element -- The MCP iframe uses authorized in-memory JPEG bytes; Next's image endpoint and website cookies are unavailable.
          <img
            className="catalog-frame"
            src={frame.data}
            alt="Selected retained evidence frame"
          />
        )}
      </SettingsPanel>
      <p className="fine">
        {typeof post.coverage === "string"
          ? post.coverage
          : "Current authorized catalog version. No personal save or new analysis."}
      </p>
    </section>
  );
}
