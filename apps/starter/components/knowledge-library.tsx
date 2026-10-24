"use client";
import { useEffect, useState, useEffectEvent, useRef } from "react";
import { usePolling } from "@/lib/use-polling";
import ReactMarkdown from "react-markdown";
import { ChoiceSelect } from "./choice-select";
import { downloadText } from "@/lib/download";
import { LibraryExplore } from "./library-explore";
import { libraryDemoDrafts } from "@/lib/library-demo";
import { KnowledgeMap } from "./knowledge-map";

type Call = (operation: string, args: any) => Promise<any>;
type Props = {
  organizationId: string;
  repositories: any[];
  readOnly: boolean;
  demo: boolean;
  call: Call;
  onOpenImprovements?: () => void;
  section?: "topics" | "ideas" | "issues";
  enabled?: boolean;
  targetDraftId?: string;
};
async function read(operation: string, args: any) {
  const response = await fetch("/api/product", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, args }),
  });
  const data = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : undefined;
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw Object.assign(
      new Error(
        "Knowledge is unavailable. Check your session and current workspace access.",
      ),
      {
        clearWorkspace:
          response.redirected ||
          [401, 403, 404].includes(response.status) ||
          ["FORBIDDEN", "REAUTH_REQUIRED"].includes(data?.code),
      },
    );
  return data.result;
}
const synthetic = {
  _id: "demo-topic",
  name: "Review a first useful result",
  version: 1,
  pinned: false,
  state: "ready",
  explanation:
    "A populated example and a clear next action can work together. These are synthetic demonstration ideas, not verified customer outcomes.",
  covered: 2,
  sourceCount: 2,
  insightCount: 2,
  updatedAt: 0,
};
export function KnowledgeLibrary(p: Props) {
  const [localSection, setLocalSection] = useState<
    "topics" | "ideas" | "issues"
  >("topics");
  const activeSection = p.section ?? localSection;
  const [exploring, setExploring] = useState(true);
  const returnToTopic = useRef(false);
  const [topics, setTopics] = useState<any[]>(p.demo ? [synthetic] : []),
    [next, setNext] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [searchScope, setSearchScope] = useState("topic"),
    [recent, setRecent] = useState(""),
    [readiness, setReadiness] = useState(""),
    [selected, setSelected] = useState<any>(),
    [detail, setDetail] = useState<any>(),
    [detailView, setDetailView] = useState<"map" | "text">("map"),
    [cursor, setCursor] = useState<string>(),
    [policy, setPolicy] = useState<any>(),
    [localRuns, setLocalRuns] = useState<any[]>([]),
    [ideas, setIdeas] = useState<any[]>([]),
    [ideaNext, setIdeaNext] = useState<string | null>(null),
    [issues, setIssues] = useState<any[]>(p.demo ? libraryDemoDrafts : []),
    [issueNext, setIssueNext] = useState<string | null>(null),
    [project, setProject] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!p.demo),
    [browsingLaterPages, setBrowsingLaterPages] = useState(false);
  const refreshGeneration = useRef(0),
    detailGeneration = useRef(0);
  const detailPanel = useRef<HTMLDivElement>(null),
    topicOverview = useRef<HTMLDivElement>(null),
    detailHeading = useRef<HTMLHeadingElement>(null),
    topicTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!detail?.topic?._id) return;
    detailHeading.current?.focus({ preventScroll: true });
    detailPanel.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  }, [detail?.topic?._id]);
  useEffect(() => {
    if (!selected && returnToTopic.current) {
      returnToTopic.current = false;
      const trigger = topicTrigger.current?.classList.contains(
        "knowledge-topic",
      )
        ? topicTrigger.current
        : topicOverview.current?.querySelector<HTMLButtonElement>(
            ".knowledge-topic",
          );
      trigger?.focus();
    }
  }, [selected]);
  const openDemoMap = useEffectEvent(() => {
    void open(synthetic);
  });
  useEffect(() => {
    if (p.demo && new URLSearchParams(location.search).get("map") === "1")
      openDemoMap();
  }, [p.demo]);
  async function scopedRead(operation: string, args: any) {
    try {
      return await read(operation, args);
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "clearWorkspace" in e &&
        e.clearWorkspace
      ) {
        refreshGeneration.current++;
        detailGeneration.current++;
        setTopics([]);
        setIdeas([]);
        setIssues([]);
        setPolicy(undefined);
        setLocalRuns([]);
        setSelected(undefined);
        setDetail(undefined);
        setNext(null);
        setIdeaNext(null);
        setIssueNext(null);
        setLoading(false);
      }
      setMessage(e instanceof Error ? e.message : "Knowledge is unavailable.");
      throw e;
    }
  }
  async function refresh(append = false, topicCursor?: string) {
    if (p.demo) return;
    const generation = ++refreshGeneration.current;
    const detailAtStart = detailGeneration.current;
    try {
      const [list, policy, ideas, drafts, localRuns] = await Promise.all([
        activeSection === "topics" && !exploring
          ? scopedRead("knowledgeList", {
              organizationId: p.organizationId,
              search: searchScope === "topic" ? search || undefined : undefined,
              sourceSearch:
                searchScope === "source" ? search || undefined : undefined,
              updatedSince: recent
                ? Date.now() - Number(recent) * 86400000
                : undefined,
              readiness: readiness || undefined,
              cursor: topicCursor,
              repositoryId: project || undefined,
            })
          : Promise.resolve(null),
        activeSection === "topics" && !exploring
          ? scopedRead("knowledgePolicy", { organizationId: p.organizationId })
          : Promise.resolve(null),
        activeSection === "ideas"
          ? scopedRead("knowledgeIdeas", {
              organizationId: p.organizationId,
              repositoryId: project || undefined,
            })
          : Promise.resolve(null),
        activeSection === "issues"
          ? scopedRead("issueList", {
              organizationId: p.organizationId,
              id: p.targetDraftId,
            })
          : Promise.resolve(null),
        activeSection === "topics" && !exploring
          ? scopedRead("localLibraryList", { organizationId: p.organizationId })
          : Promise.resolve(null),
      ]);
      if (generation !== refreshGeneration.current) return;
      if (list) {
        setTopics((old) =>
          append
            ? [
                ...new Map(
                  [...old, ...list.items].map((t) => [t._id, t]),
                ).values(),
              ]
            : list.items,
        );
        setNext(list.next);
      }
      if (policy) setPolicy(policy);
      if (localRuns) setLocalRuns(localRuns);
      if (ideas) {
        setIdeas(ideas.items);
        setIdeaNext(ideas.next);
      }
      if (drafts) {
        setIssues(drafts.items);
        setIssueNext(drafts.next);
      }
      setMessage("");
      if (
        activeSection === "topics" &&
        selected &&
        detailAtStart === detailGeneration.current
      )
        await loadDetail(selected, cursor);
    } catch (e) {
      if (generation !== refreshGeneration.current) return;
      setMessage(e instanceof Error ? e.message : "Knowledge is unavailable.");
      return false;
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }
  const processing =
    (activeSection === "topics" &&
      (topics.some((t) => ["pending", "updating"].includes(t.state)) ||
        localRuns.some((r) => ["queued", "running"].includes(r.state)))) ||
    (activeSection === "ideas" &&
      ideas.some((e) => ["queued", "running"].includes(e.state)));
  usePolling(
    () => refresh(),
    processing ? 15000 : 60000,
    !p.demo &&
      p.enabled !== false &&
      !browsingLaterPages &&
      !(activeSection === "topics" && exploring),
    JSON.stringify([
      p.organizationId,
      activeSection,
      exploring,
      search,
      searchScope,
      recent,
      readiness,
      project,
    ]),
  );
  async function run(operation: string, args: any) {
    setBusy(true);
    try {
      const result = await p.call(operation, args);
      await refresh();
      return result;
    } finally {
      setBusy(false);
    }
  }
  async function loadDetail(
    topic: any,
    pageCursor?: string,
    summaryCursor?: string,
  ) {
    const generation = ++detailGeneration.current;
    if (p.demo) {
      setDetail({
        topic,
        members: [
          {
            _id: "demo-a",
            evidence: {
              title: "Synthetic populated example",
              reference: {
                sourceId: "demo-a",
                generation: 1,
                revision: 1,
                insightId: "first",
              },
              insight: {
                claim:
                  "Show a populated example before asking a person to configure a project.",
              },
            },
          },
          {
            _id: "demo-b",
            evidence: {
              title: "Synthetic next action",
              reference: {
                sourceId: "demo-b",
                generation: 1,
                revision: 1,
                insightId: "next",
              },
              insight: {
                claim:
                  "Offer one clear next decision after the first useful result.",
              },
            },
          },
        ],
        summaries: [
          {
            id: "demo",
            output: {
              explanation: synthetic.explanation,
              claims: [],
              relations: [
                {
                  kind: "complementary",
                  explanation:
                    "Show an example before asking the person to configure their project, then offer the next decision.",
                  references: [
                    {
                      sourceId: "demo-a",
                      generation: 1,
                      revision: 1,
                      insightId: "first",
                    },
                    {
                      sourceId: "demo-b",
                      generation: 1,
                      revision: 1,
                      insightId: "next",
                    },
                  ],
                },
              ],
              uncertainty:
                "Synthetic example. No independent usability result.",
            },
          },
        ],
        coverage: "Synthetic demonstration; two illustrative ideas.",
        next: null,
      });
      return;
    }
    setLoading(true);
    try {
      const response = await scopedRead("knowledgeDetail", {
        id: topic._id,
        cursor: pageCursor,
        summaryCursor,
      });
      if (generation === detailGeneration.current) setDetail(response);
    } catch {
      if (generation !== detailGeneration.current) return;
      setMessage("This topic is unavailable in the current workspace.");
      setSelected(undefined);
    } finally {
      if (generation === detailGeneration.current) setLoading(false);
    }
  }
  async function open(topic: any, pageCursor?: string, summaryCursor?: string) {
    if (!pageCursor && !summaryCursor)
      topicTrigger.current = document.activeElement as HTMLElement;
    setSelected(topic);
    setDetail(undefined);
    setCursor(pageCursor);
    await loadDetail(topic, pageCursor, summaryCursor);
  }
  return (
    <section className="knowledge-library" aria-label="Connected knowledge">
      {message && (
        <output className="error" aria-live="polite">
          {message}
        </output>
      )}
      {!p.section && (
        <LibrarySections
          active={activeSection}
          onSelect={(section) =>
            setLocalSection(section as "topics" | "ideas" | "issues")
          }
        />
      )}
      {activeSection === "topics" && (
        <>
          {exploring && (
            <LibraryExplore
              key={`${p.organizationId}:${p.demo}`}
              organizationId={p.organizationId}
              demo={p.demo}
              enabled={p.enabled !== false}
              readOnly={p.readOnly}
              call={p.call}
            />
          )}
          <button
            className="secondary"
            onClick={() => setExploring(!exploring)}
          >
            {exploring ? "Analysis and corrections" : "Back to Explore"}
          </button>
        </>
      )}
      {activeSection === "topics" &&
        !exploring &&
        selected &&
        loading &&
        !detail && <output aria-live="polite">Opening topic…</output>}
      {activeSection === "topics" && !exploring && (
        <div
          className="knowledge-overview"
          hidden={!!selected}
          ref={topicOverview}
        >
          <h2>Connected ideas</h2>
          <p>Explore what your saved posts have in common.</p>
          {localRuns
            .filter((r) => r.state === "active")
            .slice(0, 1)
            .map((r) => (
              <div className="notice" key={r._id} aria-live="polite">
                <p>
                  {r.completed} of {r.sources.length} posts analyzed · GPT-6.1
                  Sol · Medium · Your Codex subscription · 0 app credits
                </p>
                <p>
                  {r.state === "active"
                    ? "Your laptop is building the library. Previously saved knowledge remains available."
                    : `Local run ${r.state.replaceAll("_", " ")}. Saved knowledge remains available.`}
                </p>
                {r.state === "active" && !p.readOnly && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run("localLibraryCancel", { runId: r._id })
                    }
                  >
                    Stop this run
                  </button>
                )}
              </div>
            ))}
          <details>
            <summary>Analysis settings</summary>
            <p>
              Each explanation reserves up to 10 processing credits for at most
              12 insights. Existing provider and service limits still apply. You
              can pause updates; saved sources and previous explanations remain
              available. Permission to organize does not approve publication or
              coding.
            </p>
            <p>
              {policy
                ? `${policy.state.replaceAll("_", " ")} · ${policy.used} of ${policy.ceiling} credits in approved batch ceilings this month`
                : "Choose a ceiling before enabling funded automatic explanations. Existing analyses can be grouped without new media processing."}
            </p>
            <form
              key={`${policy?._id ?? "new"}:${policy?.version ?? 0}`}
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run("knowledgeConfigure", {
                  organizationId: p.organizationId,
                  enabled: f.get("enabled") === "on",
                  ceiling: Number(f.get("ceiling")),
                });
              }}
            >
              <label>
                Monthly organization ceiling
                <input
                  type="number"
                  name="ceiling"
                  min={10}
                  max={200}
                  step={10}
                  defaultValue={policy?.ceiling ?? 50}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={policy?.enabled ?? true}
                />
                I approve automatic organization within this ceiling
              </label>
              <button disabled={p.readOnly || busy || loading || p.demo}>
                Save organization policy
              </button>
            </form>
          </details>
          <div className="knowledge-search">
            <label>
              <span className="sr-only">
                Search{" "}
                {searchScope === "source" ? "source titles" : "topic titles"}
              </span>
              <input
                value={search}
                placeholder={
                  searchScope === "source"
                    ? "Find a saved post"
                    : "Find a topic"
                }
                onChange={(e) => (
                  setBrowsingLaterPages(false),
                  setSearch(e.target.value)
                )}
              />
            </label>
            <details className="knowledge-filters">
              <summary>Filters</summary>
              <div className="form-grid">
                <label htmlFor="knowledge-search-scope">
                  Search in
                  <ChoiceSelect
                    id="knowledge-search-scope"
                    value={searchScope}
                    onValueChange={(value) => {
                      setBrowsingLaterPages(false);
                      setSearchScope(value);
                    }}
                  >
                    <option value="topic">Topic titles</option>
                    <option value="source">Source titles</option>
                  </ChoiceSelect>
                </label>
                <label htmlFor="knowledge-recent">
                  Recent updates
                  <ChoiceSelect
                    id="knowledge-recent"
                    value={recent}
                    onValueChange={(value) => {
                      setBrowsingLaterPages(false);
                      setRecent(value);
                    }}
                  >
                    <option value="">All dates</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                  </ChoiceSelect>
                </label>
                <label htmlFor="knowledge-readiness">
                  Readiness
                  <ChoiceSelect
                    id="knowledge-readiness"
                    value={readiness}
                    onValueChange={(value) => {
                      setBrowsingLaterPages(false);
                      setReadiness(value);
                    }}
                  >
                    <option value="">All update states</option>
                    <option value="ready">Ready</option>
                    <option value="pending">Pending</option>
                    <option value="updating">Updating</option>
                    <option value="budget_paused">Budget paused</option>
                    <option value="failed">Failed</option>
                    <option value="unknown">Usage uncertain</option>
                  </ChoiceSelect>
                </label>
                <label>
                  Project applicability
                  <ChoiceSelect
                    value={project}
                    onValueChange={(value) => {
                      setBrowsingLaterPages(false);
                      setProject(value);
                    }}
                  >
                    <option value="">All projects</option>
                    {p.repositories
                      .filter((r) => r.enabled)
                      .map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.fullName}
                        </option>
                      ))}
                  </ChoiceSelect>
                </label>
              </div>
            </details>
          </div>
          <output aria-live="polite" className="knowledge-count">
            {loading
              ? "Loading connected knowledge…"
              : `${topics.length} ${topics.length === 1 ? "topic" : "topics"}${next ? " · more available" : ""}`}
          </output>
          {!loading && !topics.length && (
            <p>
              No topics on this page. Keep saving permitted sources, complete
              analysis, or clear filters. Your individual posts remain below.
            </p>
          )}
          <div className="knowledge-cards">
            {[...topics]
              .sort((a, b) => Number(b.pinned) - Number(a.pinned))
              .map((t) => (
                <article key={t._id}>
                  <button
                    className="knowledge-topic"
                    aria-label={`Open map for ${t.name}`}
                    onClick={() => void open(t)}
                  >
                    <span className="knowledge-topic-name">
                      {t.name}
                      {t.pinned ? " · Pinned" : ""}
                    </span>
                    <span className="knowledge-topic-preview">
                      {t.explanation}
                    </span>
                    <span className="knowledge-topic-meta">
                      {t.sourceCount ?? 0} posts · {t.insightCount ?? t.covered}{" "}
                      ideas
                      {t.conflicts ? ` · ${t.conflicts} disagreements` : ""}
                      {t.state !== "ready"
                        ? ` · ${t.state.replaceAll("_", " ")}`
                        : ""}
                    </span>
                    <span className="knowledge-topic-action">Open map</span>
                  </button>
                </article>
              ))}
          </div>
          {next && (
            <button
              disabled={loading}
              onClick={() => {
                setBrowsingLaterPages(true);
                void refresh(true, next);
              }}
            >
              More topics
            </button>
          )}
        </div>
      )}
      {activeSection === "topics" && !exploring && selected && detail && (
        <div
          className="knowledge-detail"
          aria-label="Topic detail"
          ref={detailPanel}
        >
          <button
            onClick={() => {
              detailGeneration.current++;
              setSelected(undefined);
              setDetail(undefined);
              returnToTopic.current = true;
            }}
          >
            Back to topics
          </button>
          <h2 ref={detailHeading} tabIndex={-1}>
            {detail.topic.name}
          </h2>

          <fieldset className="knowledge-map-toggle" aria-label="Topic view">
            <button
              type="button"
              aria-pressed={detailView === "map"}
              onClick={() => setDetailView("map")}
            >
              Map
            </button>
            <button
              type="button"
              aria-pressed={detailView === "text"}
              onClick={() => setDetailView("text")}
            >
              Text
            </button>
          </fieldset>
          {detailView === "map" && (
            <KnowledgeMap
              key={`${detail.topic._id}:${cursor ?? "first"}:${detail.topic.version}`}
              detail={detail}
              organizationId={p.organizationId}
              demo={p.demo}
            />
          )}
          {detail.jobState === "unknown" && (
            <p>
              Provider usage is uncertain. The cost hold remains; automatic
              retry is blocked. Ask a workspace administrator to reconcile
              provider usage.
            </p>
          )}
          {detail.jobState === "failed" && (
            <p>
              This batch failed. Saved evidence remains available. Review
              provider availability and the funding policy before requesting
              another changed-input update.
            </p>
          )}
          {detail.summaries.length === 0 && (
            <p>
              A combined explanation is pending, paused or stale. Inspect the
              surviving evidence below. No exhaustive review is claimed.
            </p>
          )}
          <details open={detailView === "text"}>
            <summary>Explanation and coverage</summary>
            <p>{detail.coverage}</p>
            {detail.summaries.map((s: any) => (
              <article key={s.id}>
                <p>{s.output.explanation}</p>
                {s.output.claims.map((c: any, i: number) => (
                  <p key={i}>
                    {c.text}{" "}
                    <EvidenceLinks
                      references={c.references}
                      organizationId={p.organizationId}
                    />
                  </p>
                ))}
                {detailView === "text" &&
                  s.output.relations.map((r: any, i: number) => (
                    <div key={i}>
                      <strong>{r.kind.replaceAll("_", " ")}</strong>
                      <p>
                        {r.explanation}{" "}
                        <EvidenceLinks
                          references={r.references}
                          organizationId={p.organizationId}
                        />
                      </p>
                    </div>
                  ))}
                <p>{s.output.uncertainty}</p>
              </article>
            ))}
          </details>
          {detail.summaryNext && (
            <button
              onClick={() => void open(selected, cursor, detail.summaryNext)}
            >
              More explanation batches
            </button>
          )}
          <details className="knowledge-edit">
            <summary>Edit topic</summary>
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run("knowledgeCorrect", {
                  id: selected._id,
                  version: detail.topic.version,
                  name: String(f.get("name")),
                  pinned: f.get("pinned") === "on",
                });
              }}
            >
              <label>
                Topic name
                <input
                  name="name"
                  defaultValue={detail.topic.name}
                  maxLength={48}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  name="pinned"
                  defaultChecked={detail.topic.pinned}
                />
                Pin this topic
              </label>
              <button disabled={p.readOnly || busy || p.demo}>
                Save correction
              </button>
            </form>
            <details>
              <summary>Merge this topic</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run("knowledgeCorrect", {
                    id: selected._id,
                    version: detail.topic.version,
                    mergeInto: String(f.get("destination")),
                  });
                }}
              >
                <label>
                  Destination topic
                  <ChoiceSelect name="destination" required defaultValue="">
                    <option value="" disabled>
                      Choose a loaded topic
                    </option>
                    {topics
                      .filter((t) => t._id !== selected._id)
                      .map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                  </ChoiceSelect>
                </label>
                <p>
                  Manual exclusions remain in force. Later classification
                  follows the merged topic.
                </p>
                <button disabled={p.readOnly || busy || p.demo}>
                  Merge topics
                </button>
              </form>
            </details>
            <details className="knowledge-edit">
              <summary>Sources and organization</summary>
              {detail.members.map((m: any) => (
                <article className="panel" key={m._id}>
                  <h4>
                    {m.evidence?.title ?? "Unavailable or excluded evidence"}
                  </h4>
                  <p>
                    {m.evidence?.insight?.claim ??
                      "This insight is excluded, stale, deleted or not analyzed."}
                  </p>
                  {m.evidence && (
                    <EvidenceLinks
                      references={[m.evidence.reference]}
                      organizationId={p.organizationId}
                    />
                  )}
                  <button
                    disabled={p.readOnly || busy || p.demo}
                    onClick={() =>
                      void run("knowledgeCorrect", {
                        id: selected._id,
                        version: detail.topic.version,
                        memberId: m._id,
                        excluded: !m.excluded,
                      })
                    }
                  >
                    {m.excluded
                      ? "Include this insight"
                      : "Exclude this connection"}
                  </button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run("knowledgeCorrect", {
                        id: selected._id,
                        version: detail.topic.version,
                        memberId: m._id,
                        splitName: String(f.get("name")),
                      });
                    }}
                  >
                    <label>
                      Split into a new topic
                      <input name="name" maxLength={48} required />
                    </label>
                    <button disabled={p.readOnly || busy || p.demo}>
                      Split and keep this decision
                    </button>
                  </form>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run("knowledgeCorrect", {
                        id: selected._id,
                        version: detail.topic.version,
                        memberId: m._id,
                        destination: String(f.get("destination")),
                      });
                    }}
                  >
                    <label>
                      Move to a loaded topic
                      <ChoiceSelect name="destination" required defaultValue="">
                        <option value="" disabled>
                          Choose topic
                        </option>
                        {topics
                          .filter((t) => t._id !== selected._id)
                          .map((t) => (
                            <option key={t._id} value={t._id}>
                              {t.name}
                            </option>
                          ))}
                      </ChoiceSelect>
                    </label>
                    <button disabled={p.readOnly || busy || p.demo}>
                      Move insight
                    </button>
                  </form>
                </article>
              ))}
            </details>
          </details>
          {detail.next && (
            <button onClick={() => void open(selected, detail.next)}>
              Next evidence page
            </button>
          )}
          {cursor && (
            <button onClick={() => void open(selected)}>
              First evidence batch
            </button>
          )}
          <details>
            <summary>Find ideas for a project</summary>
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                for (const repositoryId of f.getAll("repository"))
                  await run("knowledgeEvaluate", {
                    id: selected._id,
                    repositoryId,
                    cursor,
                    maxCredits: 10,
                  });
              }}
            >
              <h3>Apply this evidence batch to projects</h3>
              <p>
                Each selected project reserves up to 10 credits and gets its own
                evaluation. Other evidence batches remain omitted until you
                review them. This does not approve publication or coding.
              </p>
              {p.repositories
                .filter((r) => r.enabled && r.confirmed)
                .map((r) => (
                  <label className="check" key={r._id}>
                    <input type="checkbox" name="repository" value={r._id} />
                    {r.fullName}
                  </label>
                ))}
              {!p.repositories.some((r) => r.enabled && r.confirmed) && (
                <p>Select a project and confirm its business context first.</p>
              )}
              <button disabled={p.readOnly || busy || p.demo}>
                Evaluate selected projects · up to 10 credits each
              </button>
            </form>
          </details>
        </div>
      )}
      {activeSection === "ideas" && (
        <div className="knowledge-overview">
          <h2>Ideas for your projects</h2>
          <p>
            These are repository-specific decisions from the loaded workspace
            knowledge. No fit and already implemented remain useful results.
          </p>
          {!ideas.length && (
            <p>
              Inspect a topic, then evaluate a current evidence batch for a
              selected project.
            </p>
          )}
          {ideas.map((e) => (
            <details className="knowledge-result" key={e._id}>
              <summary>
                <span>{e.output?.title ?? "Evaluation pending"}</span>
                <span className="knowledge-result-meta">
                  {p.repositories.find((r) => r._id === e.repositoryId)
                    ?.fullName ?? "Unavailable project"}{" "}
                  · {e.output?.disposition?.replaceAll("_", " ") ?? e.state}
                </span>
              </summary>
              <article className="panel">
                <h3>{e.output?.title ?? "Evaluation pending"}</h3>
                {e.privateEvaluationOrigin?.kind ===
                  "private_evaluation_brief" && (
                  <p className="fine">Private evaluation focus</p>
                )}
                {e.privateEvaluationOrigin?.kind ===
                  "private_source_variant" && (
                  <p className="fine">
                    Private source result version{" "}
                    {e.privateEvaluationOrigin.version}
                  </p>
                )}
                <p>
                  {p.repositories.find((r) => r._id === e.repositoryId)
                    ?.fullName ?? "Unavailable project"}{" "}
                  · {e.state} · {e.output?.disposition?.replaceAll("_", " ")} ·{" "}
                  {e.decision}
                </p>
                <p>{e.output?.rationale}</p>
                <p>
                  {e.covered} insights in this batch.{" "}
                  {e.omitted
                    ? "Other evidence was omitted."
                    : "Only cited evidence was evaluated."}
                </p>
                <EvidenceLinks
                  references={e.output?.references ?? []}
                  organizationId={p.organizationId}
                />
                <div className="actions">
                  {["rejected", "deferred", "accepted"].map((decision) => (
                    <button
                      key={decision}
                      disabled={p.readOnly || busy || p.demo}
                      onClick={() =>
                        void run("knowledgeDecide", { id: e._id, decision })
                      }
                    >
                      {decision === "rejected"
                        ? "Reject"
                        : decision === "deferred"
                          ? "Defer"
                          : "Keep idea"}
                    </button>
                  ))}
                  <button
                    disabled={
                      p.readOnly || busy || p.demo || e.state !== "ready"
                    }
                    onClick={() =>
                      void run("issueCreate", { id: e._id, followUp: false })
                    }
                  >
                    Draft an issue
                  </button>
                  <button
                    disabled={
                      p.readOnly || busy || p.demo || e.state !== "ready"
                    }
                    onClick={() =>
                      void run("issueCreate", { id: e._id, followUp: true })
                    }
                  >
                    Review a follow-up issue
                  </button>
                </div>
              </article>
            </details>
          ))}
          {ideaNext && (
            <button
              onClick={async () => {
                const generation = refreshGeneration.current;
                const r = await scopedRead("knowledgeIdeas", {
                  organizationId: p.organizationId,
                  repositoryId: project || undefined,
                  cursor: ideaNext,
                }).catch(() => null);
                if (!r || generation !== refreshGeneration.current) return;
                setBrowsingLaterPages(true);
                setIdeas((old) => [...old, ...r.items]);
                setIdeaNext(r.next);
              }}
            >
              More project ideas
            </button>
          )}
        </div>
      )}
      <div className="knowledge-overview" hidden={activeSection !== "issues"}>
        <h2 aria-label="Reviewed issues" tabIndex={-1}>
          Issues
        </h2>
        <p>
          An issue shares exactly its reviewed text with the target repository.
          Deleting library content does not delete an external GitHub issue.
          External edits or deletion require separate authorization. Closing an
          issue does not prove implementation or benefit.
        </p>
        {!issues.length && (
          <p>
            Draft an issue from a project idea. Markdown export works even when
            Issues write permission is unavailable.
          </p>
        )}
        {issues.map((d) => (
          <details
            className="knowledge-result"
            open={p.targetDraftId === d._id}
            key={`${d._id}:${d.version}:${d.visibility ?? "unchecked"}:${d.body ? "text" : "redacted"}`}
          >
            <summary>
              <span>{d.title}</span>
              <span className="knowledge-result-meta">
                {d.repository} · {d.state} ·{" "}
                {d.visibility ?? "Visibility unchecked"}
                {d.current ? "" : " · Needs review"}
              </span>
            </summary>
            <IssueReview
              key={`${d._id}:${d.version}:${d.visibility ?? "unchecked"}:${d.body ? "text" : "redacted"}`}
              draft={d}
              busy={busy}
              readOnly={p.readOnly || p.demo}
              run={run}
              onOpenImprovements={p.onOpenImprovements}
            />
          </details>
        ))}
        {issueNext && (
          <button
            onClick={async () => {
              const generation = refreshGeneration.current;
              const r = await scopedRead("issueList", {
                organizationId: p.organizationId,
                cursor: issueNext,
              }).catch(() => null);
              if (!r || generation !== refreshGeneration.current) return;
              setBrowsingLaterPages(true);
              setIssues((old) => [...old, ...r.items]);
              setIssueNext(r.next);
            }}
          >
            More issues
          </button>
        )}
      </div>
    </section>
  );
}
export function LibrarySections({
  active,
  onSelect,
  posts = false,
}: {
  active: string;
  onSelect: (section: "topics" | "posts" | "ideas" | "issues") => void;
  posts?: boolean;
}) {
  const choices: ("topics" | "posts" | "ideas" | "issues")[] = posts
    ? ["topics", "posts", "ideas", "issues"]
    : ["topics", "ideas", "issues"];
  return (
    <nav className="library-sections" aria-label="Library views">
      {choices.map((section) => (
        <button
          type="button"
          key={section}
          aria-current={active === section ? "page" : undefined}
          onClick={() => onSelect(section)}
        >
          {section === "topics"
            ? "Explore"
            : section === "ideas"
              ? "Insights"
              : section === "issues"
                ? "Proposals"
                : "Posts"}
        </button>
      ))}
    </nav>
  );
}
function EvidenceLinks({
  references,
  organizationId,
}: {
  references: any[];
  organizationId: string;
}) {
  if (
    references.some((r) => r.sourceId === "demo-a" || r.sourceId === "demo-b")
  )
    return (
      <span className="knowledge-evidence">Synthetic example evidence</span>
    );
  return (
    <span className="knowledge-evidence">
      {references.map((r, i) => (
        <a
          key={`${r.sourceId}:${r.insightId}:${i}`}
          href={`/app/${organizationId}/library/${r.sourceId}`}
        >
          Inspect source {i + 1}
        </a>
      ))}
    </span>
  );
}
function IssueReview({
  draft: d,
  busy,
  readOnly,
  run,
  onOpenImprovements,
}: {
  draft: any;
  busy: boolean;
  readOnly: boolean;
  run: Call;
  onOpenImprovements?: () => void;
}) {
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState(d.title),
    [body, setBody] = useState(d.body),
    [rights, setRights] = useState(false),
    [sensitive, setSensitive] = useState(d.sensitive),
    [message, setMessage] = useState("");
  const changed =
    title !== d.title || body !== d.body || sensitive !== d.sensitive;
  const permissionCurrent = d.permissionCurrent === true;
  return (
    <article className="panel">
      <h3>{d.repository}</h3>
      <p>
        {d.state} ·{" "}
        {d.current
          ? "Current evidence"
          : "Stale or unavailable evidence: publication blocked"}
      </p>
      <p>
        {d.visibility === "public"
          ? "PUBLIC repository: anyone can read this issue. Private workspace knowledge will leave VibeScroll if included below."
          : d.visibility === "private"
            ? "PRIVATE repository: everyone with repository access can read this text. Workspace membership and repository membership can differ."
            : "Repository visibility and Issues write permission must be verified before publication."}
      </p>
      {d.visibility && (
        <p>
          {permissionCurrent
            ? "Issues write permission was verified recently. Publication rechecks current access."
            : "Issues write permission has not been verified or its check expired. Verify permission before publishing. Markdown export remains available."}
        </p>
      )}
      <label>
        Exact issue title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={180}
          disabled={d.state !== "draft"}
        />
      </label>
      <label>
        Exact Markdown body
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={15}
          maxLength={20000}
          disabled={d.state !== "draft"}
        />
      </label>
      <details>
        <summary>Preview exact Markdown</summary>
        <div className="knowledge-markdown">
          <ReactMarkdown skipHtml>{body}</ReactMarkdown>
        </div>
      </details>
      <p>
        Recovery marker is part of the reviewed body. Raw transcripts, private
        code, screenshots, credentials and signed storage links are excluded by
        default.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(e) => setSensitive(e.target.checked)}
          disabled={d.state !== "draft"}
        />
        I separately choose to include only excerpts I am permitted to publish
      </label>
      <div className="actions">
        <button
          disabled={readOnly || busy || d.state !== "draft"}
          onClick={() =>
            void run("issueEdit", {
              id: d._id,
              version: d.version,
              title,
              body,
              includePermittedExcerpts: sensitive,
            })
          }
        >
          Save exact text
        </button>
        <button
          onClick={() =>
            downloadText(
              "reviewed-issue.md",
              `# ${title}\n\n${body}`,
              "text/markdown;charset=utf-8",
            )
          }
        >
          Download Markdown
        </button>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`# ${title}\n\n${body}`);
              setMessage("Markdown copied.");
            } catch {
              setMessage("Copy is unavailable. Download Markdown instead.");
            }
          }}
        >
          Copy Markdown
        </button>
        <button
          disabled={
            readOnly || busy || !d.current || changed || d.state !== "draft"
          }
          onClick={() => void run("issuePrepare", { id: d._id })}
        >
          Verify permission and visibility
        </button>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={rights}
          onChange={(e) => setRights(e.target.checked)}
        />
        I have publication rights and approve exactly this title/body for{" "}
        {d.repository} with the visibility shown above
      </label>
      <button
        className="primary"
        disabled={
          readOnly ||
          busy ||
          !rights ||
          !d.current ||
          changed ||
          !d.visibility ||
          !permissionCurrent ||
          d.state !== "draft"
        }
        onClick={() =>
          void run("issuePublish", {
            id: d._id,
            version: d.version,
            hash: d.hash,
            visibility: d.visibility,
            publicationRights: rights,
          })
        }
      >
        Publish reviewed issue
      </button>
      <output aria-live="polite">{message}</output>
      {d.current && !changed && ["draft", "published"].includes(d.state) && (
        <details className="improvement-start">
          <summary>Turn this issue into an improvement</summary>
          <label>
            What would a better result look like?
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </label>
          <p>
            AI prepares a plan for up to 10 credits. Coding has its own review
            and maximum spend.
          </p>
          <button
            type="button"
            className="primary"
            disabled={readOnly || busy || !goal.trim()}
            onClick={async () => {
              const id = await run("improvementStart", {
                issueId: d._id,
                goal,
                maxCredits: 10,
              });
              if (typeof id === "string") onOpenImprovements?.();
            }}
          >
            Prepare the plan
          </button>
        </details>
      )}
      {d.attempts.map((a: any) => (
        <div key={a._id}>
          <p>
            {a.state} · {a.externalState ?? "Not checked"}
            {a.externalEdited ? " · Edited on GitHub; edits preserved" : ""}
          </p>
          {a.url && (
            <a href={a.url} target="_blank" rel="noreferrer">
              Open GitHub issue #{a.number}
            </a>
          )}
          <button
            disabled={readOnly || busy}
            onClick={() => void run("issueRefresh", { id: a._id })}
          >
            Refresh or reconcile GitHub status
          </button>
          {["unknown", "publishing", "approved"].includes(a.state) && (
            <p>
              GitHub may have created this issue. No blind retry is permitted.
            </p>
          )}
        </div>
      ))}
    </article>
  );
}
