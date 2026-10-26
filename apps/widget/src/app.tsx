/* eslint-disable react/set-state-in-effect -- Host navigation and grant changes arrive externally; synchronize the selected view and clear previous authority. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  FileText,
  Folder,
  GitBranch,
  Home,
  LayoutGrid,
  List,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useHost } from "./host";
import {
  profilesOf,
  sourcesOf,
  fetchSource,
  sourceContext,
  reauthorizeSources,
  type Source,
  type Insight,
} from "./data";
import {
  widgetExport,
  widgetRoute,
  jobPresentation,
  type ToolRecord,
  type WidgetRoute,
} from "../../../packages/widget/contracts";
import { setupPrompt } from "../../../packages/widget/setup";
import {
  Action,
  Empty,
  Loading,
  Failure,
  ProtectedLink,
  InsightDetail,
  SourceCard,
  JobCard,
} from "./components";

type Props = { compact?: boolean; exportViewer?: boolean };
type Page = { cursor?: string; offset?: number };
const titles: Record<string, string> = {
  home: "Home",
  library: "Your library",
  sources: "Sources",
  topics: "Topics",
  scroll: "Scroll",
  save: "Save a source",
  insight: "Source insights",
  compare: "Compare selected insights",
  projects: "Projects",
  proposal: "Private proposal",
  runs: "Current work",
  setup: "Connection setup",
  account: "Your account",
  usage: "Usage",
  export: "Exported knowledge",
};

export function WidgetApp({ compact = false, exportViewer = false }: Props) {
  const host = useHost();
  const cache = useQueryClient();
  const [route, setRoute] = useState<WidgetRoute>({
    view: exportViewer ? "export" : "library",
  });
  const [profileId, setProfile] = useState("");
  const [selectedId, select] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [notice, notify] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [exportFallback, setExportFallback] = useState("");
  const mainRef = useRef<HTMLElement | null>(null);
  const focusAfterNavigation = useRef(false);
  const lastInsightKey = useRef("");
  const [selected, setSelected] = useState<
    Record<string, { source: Source; insight: Insight }>
  >({});
  const [topicId, setTopic] = useState("");
  const [folders, setFolders] = useState(false);
  const [scrollIndex, setScroll] = useState(0);
  const [imported, setImported] = useState<ReturnType<
    typeof widgetExport.parse
  > | null>(null);
  const navigate = (next: Partial<WidgetRoute>) => {
    if (next.view && next.view !== route.view)
      focusAfterNavigation.current = true;
    setRoute((old) => widgetRoute.parse({ ...old, ...next }));
    if (next.sourceId) select(next.sourceId);
  };
  useEffect(() => {
    if (!focusAfterNavigation.current) return;
    focusAfterNavigation.current = false;
    const opener =
      route.view === "library" && lastInsightKey.current
        ? Array.from(
            mainRef.current?.querySelectorAll<HTMLButtonElement>(
              "button[data-insight-key]",
            ) ?? [],
          ).find(
            (button) => button.dataset.insightKey === lastInsightKey.current,
          )
        : undefined;
    if (opener) opener.focus({ preventScroll: true });
    else mainRef.current?.focus();
  }, [route.view]);
  useEffect(() => {
    if (!host.payload?.export_snapshot) return;
    const parsed = widgetExport.safeParse(host.payload.export_snapshot);
    if (parsed.success) setImported(parsed.data);
  }, [host.payload]);

  useEffect(() => {
    const next = widgetRoute.safeParse(host.route ?? host.payload?.route);
    if (next.success) {
      setRoute(next.data);
      if (next.data.profileId) setProfile(next.data.profileId);
      if (next.data.sourceId) select(next.data.sourceId);
    }
  }, [host.route, host.payload]);
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => profilesOf(await host.call("widget_profiles", {})),
    enabled: host.ready && !exportViewer,
  });
  useEffect(() => {
    if (!profileId && profiles.data?.length === 1)
      setProfile(profiles.data[0].profile_id);
  }, [profiles.data, profileId]);
  const state = useQuery({
    queryKey: ["state", profileId],
    queryFn: () => host.call("widget_state", { profileId }),
    enabled: host.ready && !!profileId && !exportViewer,
    staleTime: 15000,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  const actions = (state.data?.actions ?? {}) as Record<string, boolean>;
  const links = (state.data?.links ?? {}) as Record<string, string>;
  const grant = Number(state.data?.grant_version ?? 0);
  const authority = `${profileId}:${grant}`;
  const priorAuthority = useRef(authority);
  useEffect(() => {
    if (!state.error) return;
    setExportFallback("");
    cache.removeQueries({ predicate: (item) => item.queryKey[0] === "data" });
    setSelected({});
  }, [state.error, cache]);
  useEffect(() => {
    if (priorAuthority.current !== authority) {
      select(route.sourceId ?? null);
      setSelected({});
      setExportFallback("");
      setTopic("");
      setQuery("");
      setSearch("");
      cache.removeQueries({
        predicate: (item) =>
          item.queryKey[0] === "data" && item.queryKey[1] !== authority,
      });
      priorAuthority.current = authority;
    }
  }, [authority, cache, route.sourceId]);
  const context = useQuery({
    queryKey: ["data", authority, "context"],
    queryFn: () => host.call("get_profile", { profileId }),
    enabled: !!state.data && !!actions.context,
  });
  const activeProfile =
    profilesOf(context.data)[0] ??
    profiles.data?.find((item) => item.profile_id === profileId);
  const kind =
    route.view === "topics"
      ? "topics"
      : route.view === "projects" || route.view === "proposal"
        ? "proposals"
        : route.view === "runs"
          ? "jobs"
          : "sources";
  const browseEnabled =
    !!state.data &&
    [
      "home",
      "library",
      "sources",
      "topics",
      "scroll",
      "compare",
      "projects",
      "proposal",
      "runs",
    ].includes(route.view) &&
    (kind !== "proposals" || !!actions.context);
  const browse = useInfiniteQuery({
    queryKey: ["data", authority, "browse", kind, search],
    initialPageParam: {} as Page,
    queryFn: ({ pageParam }) =>
      search && ["sources", "jobs"].includes(kind)
        ? host.call("search", { profileId, query: search, ...pageParam })
        : host.call("widget_browse", { profileId, kind, ...pageParam }),
    getNextPageParam: (last): Page | undefined =>
      last.next_cursor
        ? { cursor: String(last.next_cursor) }
        : typeof last.next_offset === "number"
          ? { offset: last.next_offset }
          : undefined,
    enabled: browseEnabled,
    maxPages: 20,
  });
  const topic = useInfiniteQuery({
    queryKey: ["data", authority, "topic", topicId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      host.call("widget_topic", {
        profileId,
        topicId,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) =>
      last.next_cursor ? String(last.next_cursor) : undefined,
    enabled: !!state.data && !!topicId && route.view === "topics",
    maxPages: 20,
  });
  const detail = useQuery({
    queryKey: ["data", authority, "fetch", selectedId],
    queryFn: async () =>
      fetchSource(await host.call("fetch", { profileId, id: selectedId })),
    enabled: !!state.data && !!selectedId && route.view !== "save",
  });
  const sourceList = useMemo(() => {
    if (search || !["sources"].includes(kind)) return [];
    return (browse.data?.pages ?? []).flatMap(sourcesOf);
  }, [browse.data, kind, search]);
  const insights = sourceList.flatMap((source) =>
    source.insights.map((insight) => ({ source, insight })),
  );
  const rows = (browse.data?.pages ?? []).flatMap(
    (page) => (page.items ?? page.results ?? []) as ToolRecord[],
  );
  const current = detail.data;
  const currentInsight = current?.insights[0];
  const chooseProfile = (id: string) => {
    cache.clear();
    setProfile(id);
    select(null);
    setSelected({});
    setTopic("");
    setRoute({ view: "library" });
  };
  const openInsight = (source: Source, insight?: Insight) => {
    lastInsightKey.current = insight?.fetch_id ?? source.id;
    select(insight?.fetch_id ?? source.id);
    if (compact || window.matchMedia("(max-width: 760px)").matches)
      navigate({ view: "insight", sourceId: insight?.fetch_id ?? source.id });
  };
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["state", profileId] });
    void cache.invalidateQueries({ queryKey: ["data", authority] });
  };
  const loadMore = (
    <div className="page-end">
      {browse.hasNextPage && (
        <Action
          secondary
          busy={browse.isFetchingNextPage}
          onClick={() => void browse.fetchNextPage()}
        >
          Load more
        </Action>
      )}
      <p>{String(browse.data?.pages.at(-1)?.coverage ?? "")}</p>
    </div>
  );
  const sourceDetail = !selectedId ? (
    <Empty title="Select an insight">
      Its current claim, evidence, and actions will appear here.
    </Empty>
  ) : detail.isPending ? (
    <Loading label="Loading current source evidence" />
  ) : detail.error ? (
    <Failure error={detail.error} retry={() => void detail.refetch()} />
  ) : current && currentInsight ? (
    <InsightDetail
      key={`${authority}:${selectedId}:${current.revision}`}
      source={current}
      insight={currentInsight}
      profileId={profileId}
      grantVersion={grant}
      allowFeedback={!!actions.feedback}
      notify={notify}
    />
  ) : current ? (
    <Empty
      title={
        current.state === "ready"
          ? "No supported insights returned"
          : "This source is saved"
      }
      action={
        <ProtectedLink url={current.url}>Open current source</ProtectedLink>
      }
    >
      The current state is {current.state}. No insight is invented when analysis
      has not returned one.
    </Empty>
  ) : (
    <Empty title="Select an insight">
      Its current claim, evidence, and actions will appear here.
    </Empty>
  );
  const toggleSelect = (source: Source, insight: Insight) => {
    const id = insight.fetch_id ?? `${source.id}~${insight.id}`;
    setSelected((old) => {
      const next = { ...old };
      if (next[id]) delete next[id];
      else if (Object.keys(next).length < 5) next[id] = { source, insight };
      else notify("Select at most five insights to compare.");
      return next;
    });
  };
  const exportSelected = async () => {
    try {
      const chosen = Object.values(selected);
      const inputs = chosen.length
        ? [
            ...new Map(
              chosen.map((item) => [
                item.source.id,
                {
                  ...item.source,
                  insights: chosen
                    .filter((other) => other.source.id === item.source.id)
                    .map((other) => other.insight),
                },
              ]),
            ).values(),
          ]
        : current
          ? [current]
          : [];
      if (!inputs.length)
        throw new Error("Select insights or open a source before exporting.");
      await reauthorizeSources(host.call, profileId, inputs);
      const file = widgetExport.parse({
        schemaVersion: "vibescroll-widget-v1",
        exportedAt: new Date().toISOString(),
        title: "Selected VibeScroll insights",
        sources: inputs.slice(0, 5).map((source) => ({
          id: source.id,
          title: source.title,
          url: source.url,
          generation: source.generation,
          revision: source.revision,
          insights: source.insights.slice(0, 20).map((idea) => ({
            id: idea.id,
            title: idea.title,
            claim: idea.claim,
            evidence: idea.evidence.slice(0, 10).map((e) => ({
              kind: String(e.kind ?? "reference"),
              ...(typeof e.startMs === "number" ? { startMs: e.startMs } : {}),
              ...(typeof e.endMs === "number" ? { endMs: e.endMs } : {}),
            })),
          })),
        })),
      });
      const text = JSON.stringify(file, null, 2);
      if (await host.download(text)) {
        setExportFallback("");
        notify("The host accepted your selected snapshot download.");
      } else {
        setExportFallback(text);
        notify(
          "Download is unavailable. Copy the selected snapshot from the export panel.",
        );
      }
    } catch (e) {
      notify((e as Error).message);
    }
  };

  if (exportViewer || route.view === "export")
    return (
      <div className={`widget-root ${host.theme === "dark" ? "dark" : ""}`}>
        <div className="single-page">
          <h1>Exported knowledge</h1>
          <p className="subtitle">
            Open a .vibescroll snapshot. This does not import it or authorize
            live data access.
          </p>
          <label className="file-field">
            Choose exported snapshot
            <input
              type="file"
              accept=".vibescroll,application/vnd.vibescroll+json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 262144)
                    throw new Error("Choose a snapshot smaller than 256 KiB.");
                  setImported(
                    widgetExport.parse(JSON.parse(await file.text())),
                  );
                } catch (e) {
                  notify((e as Error).message);
                  setImported(null);
                }
              }}
            />
          </label>
          {imported && (
            <section>
              <h2>{imported.title}</h2>
              <p className="muted">
                Snapshot exported{" "}
                {new Date(imported.exportedAt).toLocaleString()}
              </p>
              {imported.sources.map((source) => (
                <article className="export-source" key={source.id}>
                  <h3>{source.title}</h3>
                  {source.insights.map((idea) => (
                    <div key={idea.id}>
                      <h4>{idea.title}</h4>
                      <p>{idea.claim}</p>
                    </div>
                  ))}
                  <ProtectedLink url={source.url}>
                    Open protected source
                  </ProtectedLink>
                </article>
              ))}
            </section>
          )}
          {notice && <p role="alert">{notice}</p>}
        </div>
      </div>
    );
  if (host.error)
    return (
      <div className="widget-root">
        <Failure error={new Error(host.error)} />
        <a
          className="text-link"
          href="https://scroll.companynerve.com/app"
          target="_blank"
          rel="noreferrer"
        >
          Open VibeScroll
          <ArrowRight size={14} />
        </a>
      </div>
    );
  if (!host.ready || profiles.isPending)
    return (
      <div className="widget-root">
        <Loading label="Connecting to your VibeScroll workspace" />
      </div>
    );
  if (profiles.error)
    return (
      <div className="widget-root">
        <Failure error={profiles.error} retry={() => void profiles.refetch()} />
        <ProtectedLink url="https://scroll.companynerve.com/app">
          Review your connection
        </ProtectedLink>
      </div>
    );
  if (!profiles.data?.length)
    return (
      <div className="widget-root">
        <Empty
          title="Review your VibeScroll connection"
          action={
            <ProtectedLink url="https://scroll.companynerve.com/app">
              Open account and connection setup
            </ProtectedLink>
          }
        >
          No current knowledge-readable workspace was returned. Sign in to the
          right account and review an app grant.
        </Empty>
      </div>
    );
  if (!profileId)
    return (
      <div className="widget-root single-page">
        <h1>Choose your workspace</h1>
        <p>Only currently approved workspaces are shown.</p>
        {profiles.data.map((item) => (
          <button
            className="workspace-choice"
            key={item.profile_id}
            onClick={() => chooseProfile(item.profile_id)}
          >
            <Folder size={18} />
            {item.name}
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
    );
  if (state.isPending)
    return (
      <div className="widget-root">
        <Loading label="Checking current workspace access" />
      </div>
    );
  if (state.error)
    return (
      <div className="widget-root">
        <Failure
          error={state.error}
          retry={() => {
            cache.clear();
            void state.refetch();
          }}
        />
        <ProtectedLink url="https://scroll.companynerve.com/app">
          Review current access
        </ProtectedLink>
      </div>
    );

  let content;
  if (route.view === "save")
    content = (
      <SaveView
        profileId={profileId}
        actions={actions}
        preferredRoute={
          typeof state.data?.processing_route === "string"
            ? state.data.processing_route
            : null
        }
        notify={notify}
        onOpen={(id) => {
          select(id);
          navigate({ view: "insight", sourceId: id });
        }}
      />
    );
  else if (
    route.view === "setup" ||
    route.view === "account" ||
    route.view === "usage"
  )
    content = (
      <AccountView
        state={state.data!}
        view={route.view}
        onRefresh={refresh}
        notify={notify}
      />
    );
  else if (route.view === "insight")
    content = (
      <div className="full-detail">
        <button className="back" onClick={() => navigate({ view: "library" })}>
          <ArrowLeft size={15} />
          Back to library
        </button>
        {sourceDetail}
        {current && (
          <div className="detail-buttons">
            <Action secondary onClick={exportSelected}>
              <Download size={15} />
              Export selected source
            </Action>
          </div>
        )}
      </div>
    );
  else if (route.view === "compare")
    content = (
      <>
        <div className="titleline">
          <div>
            <h1>Compare selected insights</h1>
            <p>Keep the evidence visible before asking for an explanation.</p>
          </div>
          <Action secondary onClick={exportSelected}>
            <Download size={15} />
            Export selection
          </Action>
        </div>
        {Object.values(selected).length ? (
          <>
            <div className="compare-grid">
              {Object.entries(selected).map(([id, item]) => (
                <article className="compare-card" key={id}>
                  <h2>{item.insight.title}</h2>
                  <p>{item.insight.claim}</p>
                  <ProtectedLink url={item.source.url}>
                    {item.source.title}
                  </ProtectedLink>
                </article>
              ))}
            </div>
            <Action
              disabled={!host.canMessage}
              onClick={() => {
                void reauthorizeSources(
                  host.call,
                  profileId,
                  Object.values(selected).map((item) => item.source),
                )
                  .then(() =>
                    host.message(
                      `Compare these explicitly selected VibeScroll insights. Explain support, disagreement and uncertainty with citations. Do not save a synthesis, start additional analysis, publish or execute work.\n\n${Object.values(
                        selected,
                      )
                        .map((item) =>
                          sourceContext(item.source, [item.insight]),
                        )
                        .join("\n\n")}`,
                    ),
                  )
                  .then(() =>
                    notify("Comparison request sent to the conversation."),
                  )
                  .catch((e) => notify(e.message));
              }}
            >
              <MessageSquare size={16} />
              Discuss this comparison
            </Action>
          </>
        ) : (
          <Empty title="Select insights from your library">
            Choose up to five insights using their selection boxes.
          </Empty>
        )}
      </>
    );
  else if (route.view === "projects" || route.view === "proposal")
    content = (
      <ProjectsView
        profile={activeProfile as unknown as ToolRecord | undefined}
        proposals={rows}
        loading={browse.isPending && !!actions.context}
        error={browse.error}
        canDraft={!!actions.draft}
        profileId={profileId}
        grantVersion={grant}
        reviewUrl={links.projects}
        notify={notify}
        onRefresh={refresh}
      />
    );
  else if (route.view === "runs")
    content = (
      <>
        <div className="titleline">
          <div>
            <h1>Current work</h1>
            <p>
              Actual source and analysis states. Coding runs remain in the
              protected project review.
            </p>
          </div>
          <Action secondary onClick={refresh}>
            <RefreshCw size={15} />
            Refresh
          </Action>
        </div>
        {browse.error ? (
          <Failure error={browse.error} />
        ) : browse.isPending ? (
          <Loading />
        ) : (
          <div className="source-grid">
            {rows.map((row) => (
              <JobCard
                key={String(row.id)}
                snapshot={row}
                onOpen={() => {
                  select(String(row.source_id));
                  navigate({
                    view: "insight",
                    sourceId: String(row.source_id),
                  });
                }}
              />
            ))}
          </div>
        )}
        {loadMore}
        <ProtectedLink url={links.projects}>
          Open plans, coding runs and draft PRs
        </ProtectedLink>
      </>
    );
  else if (route.view === "topics")
    content = (
      <>
        <div className="titleline">
          <div>
            <h1>Topics</h1>
            <p>
              Browse current permitted evidence. Topic filing does not change
              access.
            </p>
          </div>
          <div className="view-toggle">
            <button aria-pressed={!folders} onClick={() => setFolders(false)}>
              <GitBranch size={15} />
              Tree
            </button>
            <button aria-pressed={folders} onClick={() => setFolders(true)}>
              <Folder size={15} />
              Folders
            </button>
          </div>
        </div>
        {browse.error ? (
          <Failure error={browse.error} />
        ) : browse.isPending ? (
          <Loading />
        ) : (
          <div className={`topic-layout ${folders ? "folder-view" : ""}`}>
            <nav className="topic-list" aria-label="Topics">
              <TopicNavigation
                rows={rows}
                selected={topicId}
                folders={folders}
                onSelect={setTopic}
              />
              {!rows.length && (
                <p className="muted">
                  {String(
                    browse.data?.pages[0]?.coverage ??
                      "No current topics returned.",
                  )}
                </p>
              )}
            </nav>
            <section>
              {topic.isFetching && !topic.data ? (
                <Loading />
              ) : topic.error ? (
                <Failure error={topic.error} />
              ) : topicId ? (
                (topic.data?.pages ?? []).flatMap(sourcesOf).map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    onOpen={(id) => {
                      select(id);
                      navigate({ view: "insight", sourceId: id });
                    }}
                  />
                ))
              ) : (
                <Empty title="Choose a topic">
                  Its current sources will appear here.
                </Empty>
              )}
              {topic.hasNextPage && (
                <Action secondary onClick={() => void topic.fetchNextPage()}>
                  Load more topic evidence
                </Action>
              )}
            </section>
          </div>
        )}
        {loadMore}
        <ProtectedLink url={links.home ? `${links.home}/library` : undefined}>
          Organize topics in the protected library
        </ProtectedLink>
      </>
    );
  else if (route.view === "scroll") {
    const item =
      insights[Math.min(scrollIndex, Math.max(0, insights.length - 1))];
    content = (
      <div className="scroll-view">
        <div className="titleline">
          <div>
            <h1>Scroll your insights</h1>
            <p>
              {insights.length} loaded insights. More sources may be available.
            </p>
          </div>
          <div className="scroll-controls">
            <button
              aria-label="Previous insight"
              disabled={scrollIndex === 0}
              onClick={() => setScroll((index) => index - 1)}
            >
              <ChevronLeft size={21} />
            </button>
            <button
              aria-label="Next insight"
              disabled={scrollIndex >= insights.length - 1}
              onClick={() => setScroll((index) => index + 1)}
            >
              <ChevronRight size={21} />
            </button>
          </div>
        </div>
        {item ? (
          <InsightDetail
            key={`${authority}:${item.source.id}:${item.insight.id}`}
            source={item.source}
            insight={item.insight}
            profileId={profileId}
            grantVersion={grant}
            allowFeedback={!!actions.feedback}
            notify={notify}
          />
        ) : browse.isPending ? (
          <Loading />
        ) : (
          <Empty title="No insights loaded yet">
            Save a source or load more of the permitted library.
          </Empty>
        )}
        {loadMore}
      </div>
    );
  } else
    content = (
      <>
        <div className="titleline">
          <div>
            <h1>{titles[route.view] ?? "Your library"}</h1>
            <p>
              {route.view === "home"
                ? "Recent sources and the next useful action."
                : "Saved ideas, with the evidence to use them."}
            </p>
          </div>
          <Action
            disabled={!actions.save}
            onClick={() => navigate({ view: "save" })}
          >
            <Plus size={16} />
            Save a link
          </Action>
        </div>
        <form
          className="library-tools"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(query.trim());
            select(null);
          }}
        >
          <label className="searchfield">
            <Search size={17} />
            <input
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your current approved library"
              aria-label="Search library"
            />
          </label>
          <Action
            secondary
            onClick={() => {
              setSearch(query.trim());
              select(null);
            }}
          >
            Search
          </Action>
          {search && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setSearch("");
                setQuery("");
              }}
            >
              Clear
            </button>
          )}
        </form>
        <nav className="library-tabs" aria-label="Library views">
          <button
            className={route.view !== "sources" ? "selected" : ""}
            onClick={() => navigate({ view: "library" })}
          >
            Insights
          </button>
          <button
            className={route.view === "sources" ? "selected" : ""}
            onClick={() => navigate({ view: "sources" })}
          >
            Sources
          </button>
          <button onClick={() => navigate({ view: "topics" })}>Topics</button>
          <button onClick={() => navigate({ view: "scroll" })}>Scroll</button>
          <span>
            {search ? "Bounded search" : `${insights.length} loaded insights`}
          </span>
        </nav>
        {browse.error ? (
          <Failure error={browse.error} retry={() => void browse.refetch()} />
        ) : browse.isPending ? (
          <Loading />
        ) : search ? (
          <div className="search-results">
            {rows.map((row) => (
              <button
                key={String(row.id)}
                onClick={() => {
                  select(String(row.id));
                  navigate({ view: "insight" });
                }}
              >
                <h3>{String(row.title)}</h3>
                <p>{String(row.excerpt ?? row.state ?? "Saved source")}</p>
                <ArrowRight size={16} />
              </button>
            ))}
            {!rows.length && (
              <Empty title="No matches on this page">
                An empty bounded page does not establish that the rest of your
                library has no match. Load more when available.
              </Empty>
            )}
            {loadMore}
          </div>
        ) : route.view === "sources" || route.view === "home" ? (
          <>
            <div className="source-grid">
              {sourceList.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onOpen={(id) => {
                    select(id);
                    navigate({ view: "insight", sourceId: id });
                  }}
                />
              ))}
            </div>
            {!sourceList.length && (
              <Empty title="Your permitted library is ready">
                Save a supported source to start building your knowledge.
              </Empty>
            )}
            {loadMore}
          </>
        ) : (
          <div className="library-layout">
            <section className="insight-list">
              {insights.map(({ source, insight }) => (
                <div
                  className={`insight-row ${selectedId === (insight.fetch_id ?? source.id) ? "selected" : ""}`}
                  key={`${source.id}:${insight.id}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${insight.title} for comparison`}
                    checked={
                      !!selected[
                        insight.fetch_id ?? `${source.id}~${insight.id}`
                      ]
                    }
                    onChange={() => toggleSelect(source, insight)}
                  />
                  <button
                    data-insight-key={insight.fetch_id ?? source.id}
                    onClick={() => openInsight(source, insight)}
                  >
                    <span className="topic">
                      {String(source.kind ?? "Saved source")}
                    </span>
                    <h3>{insight.title}</h3>
                    <p>{insight.claim}</p>
                    <span className="row-foot">
                      <FileText size={12} />
                      {source.title}
                      <ChevronRight size={15} />
                    </span>
                  </button>
                </div>
              ))}
              {!insights.length && (
                <Empty title="No current insights on this page">
                  Sources may still be processing. Inspect Sources or load the
                  next permitted page.
                </Empty>
              )}
              {loadMore}
            </section>
            <aside className="detail-panel">{sourceDetail}</aside>
          </div>
        )}
      </>
    );

  if (compact && !expanded)
    return (
      <div
        className={`widget-root compact ${host.theme === "dark" ? "dark" : ""}`}
      >
        <div className="compact-heading">
          <BookOpen size={16} />
          <span>VibeScroll</span>
          <button
            aria-label="Expand workspace"
            onClick={() => {
              void host
                .expand()
                .then(() => setExpanded(true))
                .catch((e) => notify(e.message));
            }}
          >
            <LayoutGrid size={16} />
          </button>
        </div>
        {route.view === "save" && selectedId ? (
          <InlineStatus
            profileId={profileId}
            sourceId={selectedId}
            canRead={!!actions.jobs}
            onOpen={() => navigate({ view: "insight" })}
          />
        ) : selectedId ? (
          sourceDetail
        ) : (
          <div className="compact-result">
            <h2>Explore your saved insights</h2>
            <p>Open the library to inspect current cited knowledge.</p>
            <Action
              onClick={() => {
                void host
                  .expand()
                  .then(() => {
                    setExpanded(true);
                    navigate({ view: "library" });
                  })
                  .catch((e) => notify(e.message));
              }}
            >
              Open workspace
              <ArrowRight size={15} />
            </Action>
          </div>
        )}
        {notice && <output className="compact-notice">{notice}</output>}
      </div>
    );
  return (
    <div className={`widget-root ${host.theme === "dark" ? "dark" : ""}`}>
      {host.demo && (
        <div className="demo-banner">
          Interactive preview · Illustrative records · No live account,
          processing, or writes
        </div>
      )}
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brandmark">v</span>VibeScroll
          </div>
          <nav>
            {[
              ["home", "Home", Home],
              ["library", "Library", BookOpen],
              ["save", "Save", Plus],
              ["projects", "Projects", Folder],
              ["runs", "Current work", Cloud],
              ["account", "Account", Settings],
            ].map(([view, label, Icon]) => {
              const I = Icon as typeof Home;
              return (
                <button
                  key={String(view)}
                  className={route.view === view ? "active" : ""}
                  onClick={() =>
                    navigate({ view: view as WidgetRoute["view"] })
                  }
                >
                  <I size={18} />
                  {String(label)}
                </button>
              );
            })}
          </nav>
          <div className="side-label">YOUR KNOWLEDGE</div>
          <button
            className="side-topic"
            onClick={() => navigate({ view: "topics" })}
          >
            <GitBranch size={16} />
            Topics
          </button>
          <button
            className="side-topic"
            onClick={() => navigate({ view: "scroll" })}
          >
            <List size={16} />
            Scroll
          </button>
          <button
            className="side-topic"
            onClick={() => navigate({ view: "setup" })}
          >
            <Check size={16} />
            Connection setup
          </button>
          <div className="sidebar-bottom">
            <span className="avatar">
              {String(state.data?.name ?? "V")
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <div>
              <b>{String(state.data?.name)}</b>
              <span>Current approved workspace</span>
            </div>
          </div>
        </aside>
        <div className="app-main">
          <header className="app-header">
            <div className="breadcrumb">
              <span>{String(state.data?.name)}</span>
              <ChevronRight size={14} />
              <b>{titles[route.view]}</b>
            </div>
            <div className="header-controls">
              <select
                aria-label="Workspace"
                value={profileId}
                onChange={(e) => chooseProfile(e.target.value)}
              >
                {profiles.data.map((item) => (
                  <option key={item.profile_id} value={item.profile_id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                title="Refresh current view"
                aria-label="Refresh current view"
                onClick={refresh}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </header>
          <main
            className="main-content"
            ref={mainRef}
            tabIndex={-1}
            aria-label={titles[route.view]}
          >
            {Object.keys(selected).length > 0 && (
              <div className="selection-bar">
                <span>{Object.keys(selected).length} selected</span>
                <button onClick={() => navigate({ view: "compare" })}>
                  Compare
                  <ArrowRight size={14} />
                </button>
                <button onClick={exportSelected}>
                  Export
                  <Download size={14} />
                </button>
                <button
                  aria-label="Clear selection"
                  onClick={() => setSelected({})}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            {content}
            {exportFallback && (
              <section
                className="export-source"
                aria-label="Snapshot download fallback"
              >
                <h2>Copy your selected snapshot</h2>
                <p>
                  This host did not accept the download. Save this text in a
                  .vibescroll file.
                </p>
                <textarea
                  aria-label="Selected snapshot JSON"
                  readOnly
                  value={exportFallback}
                  rows={8}
                  style={{ width: "100%" }}
                />
                <Action secondary onClick={() => setExportFallback("")}>
                  Close export panel
                </Action>
              </section>
            )}
          </main>
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Primary">
        {[
          ["home", Home],
          ["library", BookOpen],
          ["save", Plus],
          ["projects", Folder],
          ["account", Settings],
        ].map(([view, Icon]) => {
          const I = Icon as typeof Home;
          return (
            <button
              aria-current={route.view === view ? "page" : undefined}
              key={String(view)}
              onClick={() => navigate({ view: view as WidgetRoute["view"] })}
            >
              <I size={19} />
              <span>
                {
                  (
                    {
                      home: "Home",
                      library: "Library",
                      save: "Save",
                      projects: "Projects",
                      account: "Account",
                    } as Record<string, string>
                  )[String(view)]
                }
              </span>
            </button>
          );
        })}
      </nav>
      {notice && (
        <output className="notice">
          {notice}
          <button aria-label="Dismiss notification" onClick={() => notify("")}>
            <X size={16} />
          </button>
        </output>
      )}
    </div>
  );
}

function SaveView({
  profileId,
  actions,
  preferredRoute,
  notify,
  onOpen,
}: {
  profileId: string;
  actions: Record<string, boolean>;
  preferredRoute: string | null;
  notify: (text: string) => void;
  onOpen: (id: string) => void;
}) {
  const host = useHost();
  const [url, setUrl] = useState("");
  const [saveOnly, setSaveOnly] = useState(!!preferredRoute);
  const [receipt, setReceipt] = useState<ToolRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [followup, setFollowup] = useState("");
  const request = useRef<{ url: string; key: string } | null>(null);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  const status = useQuery({
    queryKey: ["data", profileId, "job", receipt?.source_id],
    queryFn: () =>
      host.call("get_job_status", { profileId, sourceId: receipt?.source_id }),
    enabled: !!receipt?.source_id && !!actions.jobs,
    retry: false,
    refetchInterval: (query) =>
      visible && query.state.data && jobPresentation(query.state.data).active
        ? Math.min(60000, 10000 * Math.max(1, query.state.dataUpdateCount))
        : false,
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setFollowup("");
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "https:")
        throw new Error("Use a supported HTTPS source link.");
      const canonical = parsed.href;
      if (request.current?.url !== canonical)
        request.current = { url: canonical, key: crypto.randomUUID() };
      const result = await host.call("save_link", {
        profileId,
        url: canonical,
        title: parsed.hostname.replace(/^www\./, ""),
        key: request.current.key,
        analyze: false,
        explicitlyRequested: true,
      });
      setReceipt(result);
      if (
        !saveOnly &&
        actions.cloud &&
        result.source_id &&
        /(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|vimeo\.com)$/.test(
          parsed.hostname,
        )
      ) {
        const text = `Analyze this exact video already saved in VibeScroll using the existing approved Work Cloud flow. profileId=${profileId}; sourceId=${String(result.source_id)}. Read current status, reuse existing ready results, preserve running or unknown work, and follow the connection's current reviewed policy. Use my own supported plan with no paid API/credit fallback. Return cited insights to the same source. This request grants no repository, coding, sharing or publication authority.`;
        try {
          await host.message(text);
          notify(
            "Source saved. The conversation has the exact request to continue its existing Work Cloud analysis flow.",
          );
        } catch {
          setFollowup(text);
          notify(
            "Source saved. Continue the analysis request in the conversation below.",
          );
        }
      } else
        notify(
          "Source saved. No duplicate analysis was started by this widget.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const presentation = status.data ? jobPresentation(status.data) : null;
  return (
    <div className="single-page">
      <h1>Save something useful</h1>
      <p className="subtitle">
        Keep a supported link in your library and use your reviewed analysis
        preferences.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="form-label" htmlFor="source-url">
          Source link
        </label>
        <div className="urlfield">
          <input
            id="source-url"
            type="url"
            maxLength={2048}
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a supported video, repository, or discussion link"
          />
          <button
            className="solid"
            type="submit"
            disabled={pending || !actions.save}
          >
            {pending
              ? "Saving…"
              : saveOnly
                ? "Save link"
                : actions.cloud
                  ? "Save and ask Work Cloud"
                  : "Save source"}
            <ArrowRight size={15} />
          </button>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={saveOnly}
            onChange={(e) => setSaveOnly(e.target.checked)}
          />
          Save only for this source
        </label>
      </form>
      <div className="preference-line">
        <Cloud size={16} />
        <span>
          {actions.cloud
            ? "Work Cloud · Existing reviewed connection"
            : "Review analysis setup in your connected account"}
        </span>
      </div>
      {preferredRoute && (
        <p className="small muted">
          Saved preference:{" "}
          {(
            {
              local: "Local machine",
              cloud: "VibeScroll's servers",
              save_only: "Save only",
            } as Record<string, string>
          )[preferredRoute] ?? "Review in Connections"}
          . Saving here keeps that preference. Uncheck Save only to deliberately
          ask Work Cloud in this chat for this source.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error} Retry keeps the same save key for this URL.
        </p>
      )}
      {receipt && (
        <section className="processing-card">
          <header>
            <FileText size={20} />
            <div>
              <h2>{String(receipt.title ?? "Your source is saved")}</h2>
              <p>
                {String(
                  receipt.note ?? "The current source receipt is available.",
                )}
              </p>
            </div>
          </header>
          <div className="receipt-state">
            <span className="status-badge">
              {presentation?.label ?? String(receipt.status ?? "Saved")}
            </span>
            {presentation?.uncertain && (
              <p>
                Review the current result before retrying or changing processing
                routes.
              </p>
            )}
            {status.error && (
              <Failure
                error={status.error}
                retry={() => void status.refetch()}
              />
            )}
          </div>
          <footer>
            <Action secondary onClick={() => void status.refetch()}>
              <RefreshCw size={15} />
              Check status
            </Action>
            <Action onClick={() => onOpen(String(receipt.source_id))}>
              Open source
              <ArrowRight size={15} />
            </Action>
          </footer>
        </section>
      )}
      {followup && (
        <section className="fallback-message">
          <h2>Continue in the conversation</h2>
          <p>
            This host could not submit the follow-up. Copy this exact request
            into your chat.
          </p>
          <textarea value={followup} readOnly rows={7} />
          <Action
            secondary
            onClick={() => {
              void navigator.clipboard
                .writeText(followup)
                .then(() => notify("Analysis request copied."));
            }}
          >
            <Copy size={15} />
            Copy request
          </Action>
        </section>
      )}
      <p className="small muted">
        GitHub, discussion and other source types retain their source-specific
        review. A saved link does not grant unrestricted retrieval or paid
        processing.
      </p>
    </div>
  );
}

function AccountView({
  state,
  view,
  onRefresh,
  notify,
}: {
  state: ToolRecord;
  view: string;
  onRefresh: () => void;
  notify: (text: string) => void;
}) {
  const links = state.links as Record<string, string>;
  const actions = state.actions as Record<string, boolean>;
  const scopes = String(state.scope ?? "selected_sources").replaceAll("_", " ");
  return (
    <div className="single-page">
      <h1>
        {view === "setup"
          ? "Make VibeScroll yours"
          : view === "usage"
            ? "Your current usage"
            : "Your account"}
      </h1>
      <p className="subtitle">
        Connection and settings come from your current approved workspace.
      </p>
      <div className="setting-item">
        <div>
          <h3>{String(state.name)}</h3>
          <p>
            {scopes} ·{" "}
            {state.expires_at === null
              ? "Until revoked"
              : state.expires_at
                ? `Expires ${new Date(Number(state.expires_at)).toLocaleString()}`
                : "Review access duration"}
          </p>
        </div>
        <span className="status-badge">Connected</span>
      </div>
      <div className="setting-item">
        <div>
          <h3>Source analysis</h3>
          <p>
            {state.cloud_request_policy
              ? "Your connection supports explicit Work Cloud requests under its reviewed policy."
              : "Review the available analysis route in Connections."}
          </p>
        </div>
        <Cloud size={18} />
      </div>
      <div className="setting-item">
        <div>
          <h3>Permitted actions</h3>
          <p>
            {Object.entries(actions)
              .filter(([, allowed]) => allowed)
              .map(([name]) => name)
              .join(" · ") || "Knowledge reading"}
          </p>
        </div>
        <Check size={18} />
      </div>
      <div className="setting-item">
        <div>
          <h3>Settings and consent</h3>
          <p>
            Change permissions or processing preferences through the protected
            review. Existing grants are not silently widened.
          </p>
        </div>
        <ProtectedLink url={links.connections}>Review connection</ProtectedLink>
      </div>
      <div className="setting-item">
        <div>
          <h3>Usage and entitlement</h3>
          <p>
            Settled usage, reservations, and unresolved usage stay separate. The
            widget does not initiate a subscription purchase or upgrade.
          </p>
        </div>
        <ProtectedLink url={links.usage}>Inspect usage</ProtectedLink>
      </div>
      <div className="setting-item">
        <div>
          <h3>Privacy and sharing</h3>
          <p>
            Review recipients, account data, retention and deletion in your
            protected account.
          </p>
        </div>
        <ProtectedLink url={links.privacy}>Privacy settings</ProtectedLink>
      </div>
      <div className="detail-buttons">
        <Action secondary onClick={onRefresh}>
          <RefreshCw size={15} />
          Refresh access
        </Action>
        <Action
          secondary
          onClick={() => {
            void navigator.clipboard
              .writeText(setupPrompt)
              .then(() => notify("Agent setup prompt copied."));
          }}
        >
          <Copy size={15} />
          Copy setup prompt
        </Action>
      </div>
      <p className="small muted">
        Widget appearance follows the host theme. Notifications require a
        supported host and explicit monitoring instruction.
      </p>
    </div>
  );
}

function ProjectsView({
  profile,
  proposals,
  loading,
  error,
  canDraft,
  profileId,
  grantVersion,
  reviewUrl,
  notify,
  onRefresh,
}: {
  profile?: ToolRecord;
  proposals: ToolRecord[];
  loading: boolean;
  error: unknown;
  canDraft: boolean;
  profileId: string;
  grantVersion: number;
  reviewUrl?: string;
  notify: (text: string) => void;
  onRefresh: () => void;
}) {
  const host = useHost();
  const projects = (profile?.projects ?? []) as ToolRecord[];
  const [projectIndex, setProject] = useState(0);
  const [pending, setPending] = useState("");
  const [localError, setError] = useState("");
  const [proposalId, setProposal] = useState("");
  const proposal = useQuery({
    queryKey: ["data", `${profileId}:${grantVersion}`, "proposal", proposalId],
    queryFn: () => host.call("widget_proposal", { profileId, proposalId }),
    enabled: !!proposalId,
  });
  const project = projects[projectIndex];
  const evaluations = (project?.evaluations ?? []) as ToolRecord[];
  const draft = async (evaluation: ToolRecord) => {
    setPending(String(evaluation.evaluation_id));
    setError("");
    try {
      const result = await host.call("draft_project_suggestion", {
        profileId,
        evaluationId: evaluation.evaluation_id,
        evaluationHash: evaluation.evaluation_hash,
        grantVersion,
        explicitlyRequested: true,
      });
      notify(
        String(
          result.note ??
            "Private draft prepared. No publication or code execution started.",
        ),
      );
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending("");
    }
  };
  return (
    <>
      <div className="titleline">
        <div>
          <h1>Project review</h1>
          <p>
            Current selected context, evidence-backed fit, and private work.
          </p>
        </div>
        <ProtectedLink url={reviewUrl}>Manage projects</ProtectedLink>
      </div>
      {projects.length ? (
        <div className="project-picker">
          {projects.map((item, index) => (
            <button
              className={projectIndex === index ? "active" : ""}
              key={String(item.repository_id ?? index)}
              onClick={() => setProject(index)}
            >
              <Folder size={17} />
              {String(item.name ?? item.repository ?? "Selected project")}
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="Choose project context in Connections"
          action={
            <ProtectedLink url={reviewUrl}>Review project setup</ProtectedLink>
          }
        >
          The widget reads only the projects you explicitly grant. Repository
          selection does not grant code access or execution.
        </Empty>
      )}
      {project && (
        <section className="project-context">
          <h2>
            {String(project.name ?? project.repository ?? "Selected project")}
          </h2>
          <p>
            {typeof project.context === "string"
              ? project.context
              : typeof project.profile === "string"
                ? project.profile
                : "Current selected context is available through your approved profile."}
          </p>
          <span className="tag">Current approved context</span>
        </section>
      )}
      {error && <Failure error={error} />}
      {localError && (
        <p role="alert" className="inline-error">
          {localError}
        </p>
      )}
      {loading && <Loading />}
      <div className="review-columns">
        <section className="review-column">
          <header>
            <span className="stage-dot" />
            <b>Current evaluations</b>
            <span>{evaluations.length} loaded</span>
          </header>
          {evaluations.map((evaluation, index) => (
            <article
              className="review-card"
              key={String(evaluation.evaluation_id ?? index)}
            >
              <span className="tag">
                {String(evaluation.disposition ?? "Review fit").replaceAll(
                  "_",
                  " ",
                )}
              </span>
              <h3>
                {String(evaluation.title ?? "Current project evaluation")}
              </h3>
              <p>
                {String(
                  evaluation.summary ??
                    evaluation.reason ??
                    "Review its exact current source references before creating work.",
                )}
              </p>
              {canDraft && (
                <Action
                  secondary
                  busy={pending === evaluation.evaluation_id}
                  onClick={() => void draft(evaluation)}
                >
                  Prepare private draft
                  <ArrowRight size={14} />
                </Action>
              )}
            </article>
          ))}
          {!evaluations.length && (
            <p className="muted small">
              No current evaluations returned for this selected context. This is
              not proof of no fit across the full library.
            </p>
          )}
        </section>
        <section className="review-column">
          <header>
            <span className="stage-dot useful" />
            <b>Private proposals</b>
            <span>{proposals.length} loaded</span>
          </header>
          {proposals.map((row) => (
            <article className="review-card" key={String(row.id)}>
              <span className="tag">
                {String(row.state ?? "Private draft")}
              </span>
              <h3>{String(row.title)}</h3>
              <p>Version {String(row.version)} · Private reviewed work</p>
              <Action secondary onClick={() => setProposal(String(row.id))}>
                Read private proposal
              </Action>
              <ProtectedLink url={String(row.url ?? reviewUrl)}>
                Review and edit exact draft
              </ProtectedLink>
            </article>
          ))}
          {!proposals.length && (
            <p className="muted small">
              No current granted drafts on this page.
            </p>
          )}
        </section>
        <section className="review-column">
          <header>
            <span className="stage-dot" />
            <b>Plans, runs & PRs</b>
          </header>
          <article className="review-card">
            <h3>Review before execution</h3>
            <p>
              Inspect the exact plan, repository, base commit, funding route and
              limits in the existing approval workflow. No action starts from
              viewing this board.
            </p>
            <ProtectedLink url={reviewUrl}>
              Open protected project review
            </ProtectedLink>
          </article>
        </section>
      </div>
      {proposalId && (
        <section className="proposal-reader" aria-label="Private proposal">
          <div className="titleline">
            <h2>Private proposal</h2>
            <Action secondary onClick={() => setProposal("")}>
              Close
            </Action>
          </div>
          {proposal.isPending ? (
            <Loading />
          ) : proposal.error ? (
            <Failure
              error={proposal.error}
              retry={() => void proposal.refetch()}
            />
          ) : (
            proposal.data && (
              <>
                <h3>{String(proposal.data.title)}</h3>
                <p className="small muted">
                  Version {String(proposal.data.version)} ·{" "}
                  {String(proposal.data.state).replaceAll("_", " ")}
                </p>
                <p className="proposal-body">{String(proposal.data.body)}</p>
                <ProtectedLink url={String(proposal.data.review_url)}>
                  Edit and review this exact draft
                </ProtectedLink>
              </>
            )
          )}
        </section>
      )}
      <p className="small muted">
        Reading, assessing fit, and preparing a private draft grant no coding,
        paid fallback, sharing, or publication authority.
      </p>
    </>
  );
}

function TopicNavigation({
  rows,
  selected,
  folders,
  onSelect,
}: {
  rows: ToolRecord[];
  selected: string;
  folders: boolean;
  onSelect: (id: string) => void;
}) {
  const ids = new Set(rows.map((row) => String(row.id)));
  const parentOf = (row: ToolRecord) => {
    let parent = String(row.parent_id ?? "");
    const seen = new Set([String(row.id)]);
    let cursor = parent;
    while (ids.has(cursor)) {
      if (seen.has(cursor) || seen.size > 20) return "";
      seen.add(cursor);
      cursor = String(
        rows.find((item) => String(item.id) === cursor)?.parent_id ?? "",
      );
    }
    return ids.has(parent) ? parent : "";
  };
  const item = (row: ToolRecord) => (
    <button
      className={selected === row.id ? "active" : ""}
      aria-current={selected === row.id ? "page" : undefined}
      onClick={() => onSelect(String(row.id))}
    >
      <Folder size={16} />
      <span>{String(row.name)}</span>
      {!!row.pinned && <span className="tag">Pinned</span>}
      <ChevronRight size={14} />
    </button>
  );
  if (folders)
    return (
      <ul className="topic-folders">
        {rows.map((row) => (
          <li key={String(row.id)}>
            {item(row)}
            <small>
              {rows.find((parent) => parent.id === row.parent_id)?.name
                ? `In ${String(rows.find((parent) => parent.id === row.parent_id)?.name)}`
                : "Top-level or parent outside this page"}
            </small>
          </li>
        ))}
      </ul>
    );
  const branch = (parent: string, depth: number): React.ReactNode => (
    <ul>
      {rows
        .filter((row) => parentOf(row) === parent)
        .map((row) => (
          <li key={String(row.id)}>
            {item(row)}
            {depth < 20 && branch(String(row.id), depth + 1)}
          </li>
        ))}
    </ul>
  );
  return (
    <>
      {branch("", 0)}
      {!!rows.length && (
        <p className="small muted">
          Hierarchy uses loaded topics. Load more to include other branches.
        </p>
      )}
    </>
  );
}

function InlineStatus({
  profileId,
  sourceId,
  canRead,
  onOpen,
}: {
  profileId: string;
  sourceId: string;
  canRead: boolean;
  onOpen: () => void;
}) {
  const host = useHost();
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  const status = useQuery({
    queryKey: ["data", profileId, "inline-job", sourceId],
    queryFn: () => host.call("get_job_status", { profileId, sourceId }),
    enabled: canRead,
    refetchInterval: (query) =>
      visible && query.state.data && jobPresentation(query.state.data).active
        ? Math.min(60000, 10000 * Math.max(1, query.state.dataUpdateCount))
        : false,
  });
  if (!canRead)
    return (
      <Empty title="Status access is required">
        Review the connection's jobs permission to read current progress.
      </Empty>
    );
  if (status.isPending)
    return <Loading label="Reading current analysis status" />;
  if (status.error)
    return <Failure error={status.error} retry={() => void status.refetch()} />;
  const presentation = jobPresentation(status.data ?? {});
  return (
    <section className="compact-result" aria-live="polite">
      <h2>
        {typeof status.data?.title === "string" && status.data.title.trim()
          ? status.data.title
          : `Saved source ${sourceId.slice(0, 10)}`}
      </h2>
      <output className="status-badge">{presentation.label}</output>
      <p>
        {presentation.uncertain
          ? "Keep the current work in place. Refresh to reconcile its result."
          : "Open the source for its current result or recovery steps."}
      </p>
      <div className="detail-buttons">
        <Action
          secondary
          busy={status.isFetching}
          onClick={() => void status.refetch()}
        >
          <RefreshCw size={14} />
          Refresh status
        </Action>
        <Action onClick={onOpen}>View source</Action>
      </div>
    </section>
  );
}
