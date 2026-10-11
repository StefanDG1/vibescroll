"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ChevronDown, GitBranch, ArrowRight, Lightbulb } from "lucide-react";
import { titleCase } from "@/lib/title-case";
import { KnowledgeMap } from "./knowledge-map";
import { InsightProjectLinks } from "./insight-project-links";
import { TopicDiagram } from "./topic-diagram";
import { LibraryAtlas } from "./library-atlas";
import {
  appendProposalBadges,
  type ProposalBadgePage,
} from "../../../packages/knowledge/proposal-badges";
import { libraryDemoMembers, demoProposalBadges } from "@/lib/library-demo";
import { ChoiceSelect } from "./choice-select";
import {
  libraryPlaceKey,
  restoredLibraryPlace,
  type LibraryPlace,
} from "@/lib/library-place";
import {
  buildTopicTree,
  topicPath,
  boundTopicHierarchy,
  singleChildTarget,
  type TopicNode,
} from "@/lib/topic-tree";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

type View = "tree" | "connections" | "journey" | "overview" | "helped";
const views: [View, string][] = [
  ["tree", "Topic tree"],
  ["connections", "Connections"],
  ["journey", "Idea journey"],
  ["overview", "Topic overview"],
  ["helped", "What helped"],
];
const scopeNames: Record<string, string> = {
  personal: "Personal",
  business: "Business",
  connected: "Connected spaces",
  workspace: "Workspace",
};
const fixture = {
  items: [
    {
      id: "demo-topic",
      name: "Business",
      autoCategory: true,
      ideas: 6,
      posts: 6,
      moreEvidence: false,
      pinned: false,
    },
    {
      id: "demo-guidance",
      name: "Product",
      autoCategory: true,
      parentId: "demo-topic",
      ideas: 3,
      posts: 3,
      moreEvidence: false,
      pinned: false,
    },
    {
      id: "demo-evidence",
      name: "Marketing",
      autoCategory: true,
      parentId: "demo-topic",
      ideas: 3,
      posts: 3,
      moreEvidence: false,
      pinned: false,
    },
    {
      id: "demo-next",
      name: "Customer experience",
      parentId: "demo-guidance",
      ideas: 2,
      posts: 2,
      moreEvidence: false,
      pinned: false,
    },
    {
      id: "demo-control",
      name: "Pricing",
      parentId: "demo-guidance",
      ideas: 2,
      posts: 2,
      moreEvidence: false,
      pinned: false,
    },
    {
      id: "demo-outcomes",
      name: "Content strategy",
      parentId: "demo-evidence",
      ideas: 2,
      posts: 2,
      moreEvidence: false,
      pinned: false,
    },
  ],
  next: null,
  scope: "workspace",
  scopes: ["workspace"],
  coverage:
    "Synthetic demonstration. Six illustrative ideas; no saved customer data or measured benefit.",
};
const fixtureDetail = {
  topic: {
    _id: "demo-topic",
    name: "A useful first result",
    version: 1,
    layoutVersion: 0,
    aliases: [],
  } satisfies Omit<
    NonNullable<
      FunctionReturnType<typeof api.knowledgeExplore.detail>["topic"]
    >,
    "_id"
  > & { _id: string },
  members: libraryDemoMembers,
  summaries: [] as any[],
  next: null,
  coverage: "Synthetic evidence only.",
};
fixtureDetail.summaries = [
  {
    id: "demo-summary",
    output: {
      relations: [
        {
          kind: "complementary",
          explanation:
            "The example provides context; the next decision gives the person somewhere to go. This is illustrative, not a measured result.",
          references: fixtureDetail.members
            .slice(0, 2)
            .map((m) => m.evidence.reference),
        },
        {
          kind: "similar",
          explanation:
            "Synthetic examples both make the supporting evidence inspectable.",
          references: fixtureDetail.members
            .slice(2, 5)
            .filter((_, i) => i !== 1)
            .map((m) => m.evidence.reference),
        },
        {
          kind: "complementary",
          explanation:
            "Synthetic guidance pairs a clear next step with the option to change a decision.",
          references: [
            fixtureDetail.members[1].evidence.reference,
            fixtureDetail.members[3].evidence.reference,
          ],
        },
        {
          kind: "useful_combination",
          explanation:
            "Synthetic example combines evidence review with recording a result. No benefit has been measured.",
          references: [
            fixtureDetail.members[2].evidence.reference,
            fixtureDetail.members[5].evidence.reference,
          ],
        },
      ],
    },
  },
];
export function LibraryExplore({
  organizationId,
  demo = false,
  enabled = true,
  readOnly = true,
  call,
  load,
}: {
  organizationId: string;
  demo?: boolean;
  enabled?: boolean;
  readOnly?: boolean;
  call?: (operation: string, args: any) => Promise<any>;
  load?: (operation: string, args: any) => Promise<any>;
}) {
  const [view, setView] = useState<View>("tree"),
    [scope, setScope] = useState("");
  const [treeDiagram, setTreeDiagram] = useState(true);
  const [pointerTransition, setPointerTransition] = useState(false);
  const [topics, setTopics] = useState<any>(demo ? fixture : null),
    [search, setSearch] = useState("");
  const [badges, setBadges] = useState<ProposalBadgePage | null>(
    demo ? demoProposalBadges() : null,
  );
  const [selected, setSelected] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [journey, setJourney] = useState<any>(null),
    [helped, setHelped] = useState<any>(null);
  const [method, setMethod] = useState(""),
    [savingStructure, setSavingStructure] = useState(false),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(!demo),
    [loadingEvidence, setLoadingEvidence] = useState(false),
    [laterPage, setLaterPage] = useState(false);
  const generation = useRef(0),
    selectionGeneration = useRef(0),
    selectedHeading = useRef<HTMLHeadingElement>(null),
    focusPending = useRef(false),
    detailCursor = useRef<string | undefined>(undefined);
  async function read(operation: string, args: any) {
    if (load) return load(operation, args);
    const response = await fetch("/api/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, args }),
    });
    const data = response.headers
      .get("content-type")
      ?.includes("application/json")
      ? await response.json()
      : null;
    if (!response.ok || !data)
      throw new Error(
        data?.error ??
          "Explore is unavailable. Reload after checking your session and space setup.",
      );
    return data.result;
  }
  const args = () => ({ organizationId, scope: scope || undefined });
  async function refresh(cursor?: string, append = false) {
    if (demo) return;
    const ticket = ++generation.current;
    setLoading(true);
    if (!append) setBadges(null);
    try {
      const [result, badgePage] = await Promise.all([
        append && !cursor && view !== "helped"
          ? Promise.resolve(topics)
          : read(view === "helped" ? "exploreHelped" : "exploreTopics", {
              ...args(),
              cursor,
              ...(view === "helped"
                ? { method: method || undefined }
                : { search: search || undefined }),
            }),
        view === "tree" && (!append || badges?.next)
          ? read("exploreProposalBadges", {
              ...args(),
              cursor: append ? badges?.next : undefined,
            })
          : Promise.resolve(null),
      ]);
      if (ticket !== generation.current) return;
      if (badgePage)
        setBadges((old) =>
          appendProposalBadges(append ? old : null, badgePage),
        );
      if (view === "helped") setHelped(result);
      else
        setTopics((old: any) => ({
          ...result,
          items:
            append && old
              ? boundTopicHierarchy([...old.items, ...result.items])
              : result.items,
        }));
      // Revalidate the selected branch on the same visibility-aware refresh.
      if (
        selected &&
        !append &&
        (await open(selected, detailCursor.current, false)) === false
      )
        return false;
      setMessage("");
    } catch (error) {
      if (ticket !== generation.current) return;
      selectionGeneration.current++;
      setTopics(null);
      setBadges(null);
      setDetail(null);
      setJourney(null);
      setHelped(null);
      setSelected(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Explore is unavailable. Reload to try again.",
      );
      return false;
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  const refreshVisible = useEffectEvent(() => refresh());
  useEffect(() => {
    if (!enabled || demo) return;
    let last = 0;
    const revalidate = () => {
      if (document.hidden || Date.now() - last < 2000) return;
      last = Date.now();
      void refreshVisible();
    };
    const timeout = setTimeout(revalidate, search ? 250 : 0);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- Invalidate the shared request counter, not a DOM ref, on cleanup.
      generation.current++;
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- Fence pending evidence responses on scope changes.
      selectionGeneration.current++;
    };
  }, [enabled, demo, organizationId, scope, search, view, method]);
  const [place, setPlace] = useState<LibraryPlace | null>(null);
  const restored = useRef<string | null>(null),
    pendingScroll = useRef<LibraryPlace | null>(null);
  const restoreTopic = useEffectEvent((topic: any) =>
    open(topic, undefined, false),
  );
  useEffect(() => {
    if (!topics || search || view !== "tree") return;
    const key = libraryPlaceKey(organizationId, topics.scope);
    if (restored.current === key) return;
    restored.current = key;
    try {
      const place = restoredLibraryPlace(
        localStorage.getItem(key),
        topics.items,
      );
      // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the authorized page with an external, scoped browser preference.
      if (place) {
        setTreeDiagram(place.representation === "tree");
        setPlace(place);
        pendingScroll.current = place;
      }
      const topic = topics.items.find((t: any) => t.id === place?.topicId);
      if (topic) {
        setSelected(topic);
        void restoreTopic(topic);
      } else {
        const root = topics.items.find(
          (item: any) =>
            !item.parentId && item.autoCategory && item.name === place.filing,
        );
        const target = root && singleChildTarget(topics.items, root.id);
        if (target && target.id !== root.id) void restoreTopic(target);
      }
    } catch {
      /* A fresh overview remains available without storage. */
    }
  }, [topics, demo, search, view, organizationId]);
  function remember(patch: Partial<LibraryPlace>) {
    if (!topics || search || view !== "tree") return;
    setPlace((old) => {
      const next: LibraryPlace = {
        ...old,
        representation: treeDiagram ? "tree" : "folders",
        ...patch,
      };
      try {
        localStorage.setItem(
          libraryPlaceKey(organizationId, topics.scope),
          JSON.stringify(next),
        );
      } catch {
        /* Optional browser preference. */
      }
      return next;
    });
  }
  const rememberScroll = useEffectEvent(() => {
    if (pendingScroll.current) return;
    remember({
      scrollTop: window.scrollY,
      rowScroll: [...document.querySelectorAll<HTMLElement>(".hybrid-node-row")]
        .map((row) => row.scrollLeft)
        .slice(0, 8),
    });
  });
  useEffect(() => {
    if (!topics || view !== "tree") return;
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(rememberScroll, 150);
    };
    window.addEventListener("scroll", save, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", save, true);
    };
  }, [topics, view]);
  useEffect(() => {
    const saved = pendingScroll.current;
    if (
      !saved ||
      !topics ||
      loading ||
      (saved.topicId && !selected) ||
      (selected && !selected.autoCategory && !detail)
    )
      return;
    const frame = requestAnimationFrame(() => {
      document
        .querySelectorAll<HTMLElement>(".hybrid-node-row")
        .forEach((row, i) => {
          row.scrollLeft = saved.rowScroll?.[i] ?? 0;
        });
      window.scrollTo({ top: saved.scrollTop ?? 0, behavior: "instant" });
      pendingScroll.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [topics, loading, selected, detail]);
  useEffect(
    () => () => {
      generation.current++;
      selectionGeneration.current++;
    },
    [],
  );
  useEffect(() => {
    if ((detail?.topic || journey) && focusPending.current) {
      selectedHeading.current?.focus({ preventScroll: true });
      selectedHeading.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
      focusPending.current = false;
    }
  }, [detail?.topic, journey]);
  async function open(topic: any, cursor?: string, focus = true) {
    if (view === "tree" && !cursor) {
      const target = singleChildTarget(topics?.items ?? [], topic.id);
      if (target && target.id !== topic.id) {
        topic = target;
        remember({ topicId: target.id });
      }
    }
    if (topic.autoCategory) {
      selectionGeneration.current++;
      setLoadingEvidence(false);
      setSelected(topic);
      setDetail({ topic: null, members: [], summaries: [], next: null });
      setJourney(null);
      return;
    }
    const ticket = ++selectionGeneration.current;
    setLoadingEvidence(true);
    if (!cursor) {
      focusPending.current = focus;
      detailCursor.current = cursor;
      setSelected(topic);
      setDetail(null);
      setJourney(null);
    }
    if (demo) {
      const demoMembers: Record<string, number[]> = {
        "demo-guidance": [0, 1, 3],
        "demo-evidence": [2, 4, 5],
        "demo-next": [0, 1, 2, 3, 4, 5],
        "demo-control": [1, 3],
        "demo-outcomes": [2, 5],
      };
      const indices = demoMembers[topic.id];
      setDetail({
        ...fixtureDetail,
        members: indices
          ? indices.map((i) => fixtureDetail.members[i])
          : fixtureDetail.members,
        topic: { ...fixtureDetail.topic, _id: topic.id, name: topic.name },
      });
      setLoadingEvidence(false);
      setJourney({
        items: [],
        next: null,
        coverage:
          "Synthetic example has no recorded project evaluation or outcome.",
      });
      return;
    }
    try {
      const result = await read(
        view === "journey" ? "exploreJourney" : "exploreDetail",
        { ...args(), topicId: topic.id, cursor },
      );
      if (ticket !== selectionGeneration.current) return;
      if (view === "journey") setJourney(result);
      else {
        setDetail((old: any) => ({
          ...result,
          resetKey: cursor ? (old?.resetKey ?? ticket) : ticket,
          members:
            cursor && old
              ? [
                  ...new Map(
                    [...old.members, ...result.members].map((member: any) => [
                      member._id,
                      member,
                    ]),
                  ).values(),
                ]
              : result.members,
        }));
        if (!result.topic && !result.next) setSelected(null);
      }
      setMessage("");
    } catch (error) {
      if (ticket !== selectionGeneration.current) return;
      setDetail(null);
      setJourney(null);
      setSelected(null);
      setMessage(error instanceof Error ? error.message : "Topic unavailable.");
      return false;
    } finally {
      if (ticket === selectionGeneration.current) setLoadingEvidence(false);
    }
  }
  function reset() {
    generation.current++;
    selectionGeneration.current++;
    setSelected(null);
    setDetail(null);
    setJourney(null);
    setHelped(null);
    setPlace(null);
    pendingScroll.current = null;
    restored.current = null;
    setTreeDiagram(true);
    setTopics(demo ? fixture : null);
    setBadges(demo ? demoProposalBadges() : null);
    setLaterPage(false);
    detailCursor.current = undefined;
  }
  const sourceLink = (source: any) =>
    demo ? (
      <span>Synthetic example</span>
    ) : (
      <a href={`/app/${organizationId}/library/${source.id}`}>{source.title}</a>
    );
  if ((view as string) === "tree")
    return (
      <div
        onPointerDownCapture={() => setPointerTransition(true)}
        onKeyDownCapture={() => setPointerTransition(false)}
      >
        <LibraryAtlas
          animateEntry={pointerTransition}
          key={`${organizationId}:${topics?.scope}`}
          topics={topics}
          badges={badges}
          selected={selected}
          detail={detail}
          search={search}
          onSearch={(value) => {
            reset();
            setSearch(value);
          }}
          folders={!treeDiagram}
          onFolders={(value) => {
            setTreeDiagram(!value);
            remember({ representation: value ? "folders" : "tree" });
          }}
          onOpen={(topic) => {
            remember({
              topicId: topic.id,
              closedTopicId: undefined,
              insightId: undefined,
            });
            void open(topic, undefined, false);
          }}
          place={place}
          onRemember={remember}
          onMoreTopics={() => {
            setLaterPage(true);
            void refresh(topics?.next ?? undefined, true);
          }}
          onMoreEvidence={() => void open(selected, detail.next)}
          loadingEvidence={loadingEvidence}
          loading={loading}
          message={message}
          onRetry={() => void refresh()}
          organizationId={organizationId}
          demo={demo}
          corrections={
            detail?.topic && !readOnly && !demo ? (
              <details className="hybrid-filing-editor">
                <summary>Move {titleCase(selected.name)}</summary>
                <form
                  key={`${selected.id}:${detail.topic.layoutVersion}`}
                  className="form-grid"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!call) return;
                    const parent = String(
                      new FormData(event.currentTarget).get("parent"),
                    );
                    setSavingStructure(true);
                    try {
                      await call("organizeExploreTopic", {
                        topicId: selected.id,
                        layoutVersion: detail.topic.layoutVersion,
                        parentId: parent || null,
                        aliases: detail.topic.aliases ?? [],
                      });
                      await refresh();
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Category was not saved.",
                      );
                    } finally {
                      setSavingStructure(false);
                    }
                  }}
                >
                  <label>
                    Parent category
                    <ChoiceSelect
                      name="parent"
                      defaultValue={selected.parentId ?? ""}
                    >
                      <option value="">Unfiled</option>
                      {topics.items
                        .filter((topic: any) => topic.id !== selected.id)
                        .map((topic: any) => (
                          <option key={topic.id} value={topic.id}>
                            {titleCase(topic.name)}
                          </option>
                        ))}
                    </ChoiceSelect>
                  </label>
                  <button disabled={savingStructure}>Move topic</button>
                </form>
              </details>
            ) : null
          }
          advanced={
            <>
              <label>
                Library access view
                <ChoiceSelect
                  value={scope || topics?.scope || ""}
                  onValueChange={(value) => {
                    reset();
                    setScope(value);
                  }}
                >
                  {(topics?.scopes ?? []).map((value: string) => (
                    <option key={value} value={value}>
                      {scopeNames[value]}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
              {!readOnly && !demo && (
                <button
                  disabled={savingStructure || !topics?.items.length}
                  onClick={async () => {
                    setSavingStructure(true);
                    try {
                      await call?.("autoOrganizeExploreTopics", {
                        organizationId,
                        topicIds: topics.items
                          .filter((topic: any) => !topic.autoCategory)
                          .slice(0, 20)
                          .map((topic: any) => topic.id),
                      });
                      await refresh();
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Categories were not saved.",
                      );
                    } finally {
                      setSavingStructure(false);
                    }
                  }}
                >
                  Organize uncategorized topics
                </button>
              )}
              <fieldset aria-label="Additional library views">
                {views
                  .filter(([id]) => id !== "tree")
                  .map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => {
                        reset();
                        setView(id);
                      }}
                    >
                      {label}
                    </button>
                  ))}
              </fieldset>
            </>
          }
        />
      </div>
    );
  return (
    <section className="library-explore" aria-label="Library Explore">
      <div className="explore-intro">
        <h2>Your library</h2>
        <p>Your saved ideas, connected.</p>
      </div>
      {(topics?.scopes?.length ?? 0) > 1 && (
        <nav className="atlas-scope-roots" aria-label="Library spaces">
          {topics.scopes.map((available: string) => (
            <button
              key={available}
              aria-pressed={(scope || topics.scope) === available}
              onClick={() => {
                reset();
                setScope(available);
              }}
            >
              {scopeNames[available]}
            </button>
          ))}
        </nav>
      )}
      <div className="explore-controls">
        <label>
          Library view
          <ChoiceSelect
            value={scope || topics?.scope || helped?.scope || ""}
            disabled={!(topics?.scopes?.length || helped?.scopes?.length)}
            onValueChange={(value) => {
              reset();
              setScope(value);
            }}
          >
            {!(topics?.scopes?.length || helped?.scopes?.length) && (
              <option value="">
                {loading ? "Loading spaces…" : "Unavailable"}
              </option>
            )}
            {(topics?.scopes ?? helped?.scopes ?? []).map((s: string) => (
              <option value={s} key={s}>
                {scopeNames[s]}
              </option>
            ))}
          </ChoiceSelect>
        </label>
        {view !== "helped" && (
          <label>
            Find a topic
            <input
              value={search}
              placeholder="Search topics and aliases"
              maxLength={120}
              onChange={(e) => {
                reset();
                setSearch(e.target.value);
              }}
            />
          </label>
        )}
        {view === "helped" && (
          <label htmlFor="explore-evidence-type">
            Evidence type
            <ChoiceSelect
              id="explore-evidence-type"
              value={method}
              onValueChange={(value) => {
                reset();
                setMethod(value);
              }}
            >
              <option value="">All recorded outcomes</option>
              <option value="judgment">Judgment only</option>
              <option value="measurement">Reported comparison</option>
            </ChoiceSelect>
          </label>
        )}
      </div>
      {view === "tree" && (
        <>
          <fieldset
            className="explore-views"
            aria-label="Topic tree representation"
          >
            <button
              aria-pressed={treeDiagram}
              onClick={() => setTreeDiagram(true)}
            >
              Tree
            </button>
            <button
              aria-pressed={!treeDiagram}
              onClick={() => setTreeDiagram(false)}
            >
              Folders
            </button>
          </fieldset>
        </>
      )}
      {message && (
        <div role="alert" className="error">
          <p>{message}</p>
          <button onClick={() => void refresh()}>Reload Explore</button>
        </div>
      )}
      {loading && (
        <output aria-live="polite">Loading current permitted knowledge…</output>
      )}
      {view === "helped" ? (
        <>
          {!loading && !helped?.items.length && !message && (
            <p>
              No recorded outcomes on this page. A merged PR alone does not
              establish a benefit.
            </p>
          )}
          <div className="explore-outcomes">
            {helped?.items.map((item: any) => (
              <article key={item.id}>
                <h3>{item.title}</h3>
                <p className="explore-meta">
                  {item.verdict.replaceAll("_", " ")} ·{" "}
                  {item.measurement
                    ? "Reported comparison"
                    : "Recorded judgment"}
                </p>
                <p>{item.note}</p>
                {item.measurement && <Measurement value={item.measurement} />}
                <p>
                  {item.deployedVersion
                    ? `Recorded deployment version: ${item.deployedVersion}`
                    : "No deployment version recorded."}
                </p>
                <ul>
                  {item.sources.map((s: any) => (
                    <li key={s.id}>{sourceLink(s)}</li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    reset();
                    setView("journey");
                    setSelected({ id: item.topicId, name: item.title });
                  }}
                >
                  Open attribution journey
                </button>
              </article>
            ))}
          </div>
          <p className="explore-coverage">{helped?.coverage}</p>
          {helped?.next && (
            <button
              disabled={loading}
              onClick={() => {
                setLaterPage(true);
                void refresh(helped.next);
              }}
            >
              Next outcomes page
            </button>
          )}
        </>
      ) : selected ? (
        <div className="explore-branch">
          {view === "tree" &&
            (treeDiagram ? (
              <TopicDiagram
                topics={topics?.items ?? []}
                selectedId={selected.id}
                onOpen={(topic) => void open(topic)}
              />
            ) : (
              <TopicBranches
                topics={topics?.items ?? []}
                onOpen={(topic) => void open(topic)}
              />
            ))}
          <div className="atlas-evidence-pane">
            <nav className="atlas-breadcrumbs" aria-label="Topic ancestors">
              {topicPath(topics?.items ?? [], selected.id).map((topic: any) => (
                <button
                  key={topic.id}
                  aria-current={
                    topic.id === selected.id ? "location" : undefined
                  }
                  onClick={() => void open(topic)}
                >
                  {titleCase(topic.name)}
                </button>
              ))}
            </nav>
            <button
              className="secondary"
              onClick={() => {
                selectionGeneration.current++;
                setSelected(null);
                setDetail(null);
                setJourney(null);
              }}
            >
              Library overview
            </button>
            <h3 ref={selectedHeading} tabIndex={-1}>
              {titleCase(detail?.topic?.name ?? selected.name)}
            </h3>
            {detail?.topic && !readOnly && (
              <details className="explore-structure">
                <summary>Edit topic structure</summary>
                <form
                  key={`${detail.topic._id}:${detail.topic.layoutVersion}`}
                  className="form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!call || demo) return;
                    const data = new FormData(e.currentTarget),
                      parent = String(data.get("parent"));
                    setSavingStructure(true);
                    try {
                      await call("organizeExploreTopic", {
                        topicId: selected.id,
                        layoutVersion: detail.topic.layoutVersion,
                        ...(parent === "keep"
                          ? {}
                          : { parentId: parent || null }),
                        aliases: String(data.get("aliases"))
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      });
                      await refresh();
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Structure was not saved. Reload and try again.",
                      );
                    } finally {
                      setSavingStructure(false);
                    }
                  }}
                >
                  <label>
                    Parent topic
                    <ChoiceSelect
                      id="explore-parent-topic"
                      name="parent"
                      defaultValue="keep"
                    >
                      <option value="keep">Keep saved parent</option>
                      <option value="">No parent</option>
                      {topics?.items
                        .filter((t: any) => t.id !== selected.id)
                        .map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {titleCase(t.name)}
                          </option>
                        ))}
                    </ChoiceSelect>
                  </label>
                  <label>
                    Aliases, separated by commas
                    <input
                      name="aliases"
                      defaultValue={detail.topic.aliases.join(", ")}
                      maxLength={390}
                    />
                  </label>
                  <p>
                    Use up to eight short aliases. Structure and aliases do not
                    change evidence or authorize analysis.
                  </p>
                  <button disabled={savingStructure || demo || !call}>
                    Save topic structure
                  </button>
                </form>
              </details>
            )}
            {view === "journey" ? (
              <>
                {!journey && (
                  <output aria-live="polite">Opening recorded journey…</output>
                )}
                {journey?.items.length === 0 && (
                  <p>
                    No recorded evaluations on this page. Saving a post does not
                    imply a project change.
                  </p>
                )}
                {journey?.items.map((item: any) => (
                  <article className="explore-journey" key={item.id}>
                    <h4>{item.repository}</h4>
                    <p className="explore-meta">
                      {item.current
                        ? "Current project fit"
                        : "Historical project fit; refresh before acting"}{" "}
                      · {item.state.replaceAll("_", " ")}
                    </p>
                    <ol>
                      <li>
                        <strong>Saved posts and cited ideas</strong>
                        <ul>
                          {item.sources.map((s: any) => (
                            <li key={s.id}>
                              {sourceLink(s)}{" "}
                              <span className="explore-meta">
                                {s.insights.length} cited{" "}
                                {s.insights.length === 1 ? "idea" : "ideas"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                      <li>
                        <strong>Evaluation</strong>
                        <p>
                          {item.disposition?.replaceAll("_", " ") ??
                            "No completed disposition"}{" "}
                          · Decision: {item.decision.replaceAll("_", " ")}
                        </p>
                        <p className="explore-meta">
                          Repository version {item.baseSha.slice(0, 12)}
                        </p>
                      </li>
                      {item.steps.map((step: any) => (
                        <li key={step.id}>
                          <strong>
                            {step.issueUrl ? (
                              <a
                                href={step.issueUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Published issue: {step.title}
                              </a>
                            ) : (
                              `Issue draft: ${step.title}`
                            )}
                          </strong>
                          <p>{step.state.replaceAll("_", " ")}</p>
                          {step.run ? (
                            <>
                              <p>
                                {step.run.prUrl ? (
                                  <a
                                    href={step.run.prUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open recorded PR
                                  </a>
                                ) : (
                                  "No PR recorded"
                                )}{" "}
                                ·{" "}
                                {step.run.prState?.replaceAll("_", " ") ??
                                  step.run.state.replaceAll("_", " ")}
                              </p>
                              {step.run.mergedAt && (
                                <p>
                                  Merged {step.run.mergedAt}. Benefit remains a
                                  separate outcome.
                                </p>
                              )}
                              {step.run.deployment && (
                                <p>
                                  Deployment record:{" "}
                                  {step.run.deployment.state ??
                                    step.run.deployment.status ??
                                    "recorded"}
                                </p>
                              )}
                            </>
                          ) : (
                            <p>No implementation run recorded.</p>
                          )}
                          {step.outcome ? (
                            <>
                              <p>
                                {step.outcome.verdict.replaceAll("_", " ")} ·{" "}
                                {step.outcome.method.replaceAll("_", " ")}
                              </p>
                              <p>{step.outcome.note}</p>
                              {step.outcome.measurement && (
                                <Measurement value={step.outcome.measurement} />
                              )}
                            </>
                          ) : (
                            <p>No outcome recorded.</p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
                <p className="explore-coverage">{journey?.coverage}</p>
                {journey?.next && (
                  <button onClick={() => void open(selected, journey.next)}>
                    Next evaluations page
                  </button>
                )}
              </>
            ) : (
              <>
                {!detail && (
                  <output aria-live="polite">Opening current evidence…</output>
                )}
                {detail && view === "connections" && (
                  <KnowledgeMap
                    key={`${selected.id}:${detail.topic?.version}:${scope}:${detail.members[0]?._id ?? "empty"}`}
                    detail={detail}
                    organizationId={organizationId}
                    demo={demo}
                  />
                )}
                {detail && view !== "connections" && (
                  <ul className="explore-tree atlas-insights">
                    {[
                      ...new Set(
                        detail.members.map(
                          (m: any) => m.evidence.reference.sourceId,
                        ),
                      ),
                    ].map((id: any) => {
                      const members = detail.members.filter(
                        (m: any) => m.evidence.reference.sourceId === id,
                      );
                      return (
                        <li key={id}>
                          <details open>
                            <summary>
                              <Lightbulb size={18} aria-hidden="true" />
                              <span>{members[0].evidence.title}</span>
                              <span className="explore-meta">
                                {members.length}{" "}
                                {members.length === 1 ? "insight" : "insights"}
                              </span>
                            </summary>
                            <ul>
                              {members.map((m: any) => (
                                <li key={m._id} className="atlas-insight">
                                  <Lightbulb size={20} aria-hidden="true" />
                                  <p>{m.evidence.insight.claim}</p>
                                  {sourceLink({
                                    id,
                                    title: "Inspect source evidence",
                                  })}
                                  <InsightProjectLinks
                                    key={`${scope}:${m._id}`}
                                    reference={m.evidence.reference}
                                    topicId={selected.id}
                                    organizationId={organizationId}
                                    demo={demo}
                                    read={() =>
                                      read("exploreJourney", {
                                        ...args(),
                                        topicId: selected.id,
                                      })
                                    }
                                  />
                                </li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {detail?.members.length === 0 && (
                  <p>
                    No current permitted evidence on this page. Choose another
                    page or review your filing.
                  </p>
                )}
                <p className="explore-coverage">{detail?.coverage}</p>
                {detail?.next && (
                  <button onClick={() => void open(selected, detail.next)}>
                    Next evidence page
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {!loading && !topics?.items.length && !message && (
            <p>
              No current permitted topics on this page. Try another page, clear
              the search, or file your analyzed posts in this view.
            </p>
          )}
          {view === "tree" ? (
            <>
              {treeDiagram ? (
                <TopicDiagram
                  topics={topics?.items ?? []}
                  onOpen={(topic) => void open(topic)}
                />
              ) : (
                <TopicBranches
                  topics={topics?.items ?? []}
                  onOpen={(topic) => void open(topic)}
                />
              )}
            </>
          ) : (
            <ul
              className={`explore-topics ${view === "overview" ? "explore-bars" : ""}`}
            >
              {topics?.items.map((topic: any) => (
                <li key={topic.id}>
                  <button
                    onClick={() => void open(topic)}
                    aria-label={`Open ${titleCase(topic.name)}`}
                  >
                    <GitBranch size={19} aria-hidden="true" />
                    <span className="explore-topic-text">
                      <strong>
                        {titleCase(topic.name)}
                        {topic.pinned ? " · Pinned" : ""}
                      </strong>
                      <span className="explore-meta">
                        {topic.posts} posts · {topic.ideas} current ideas
                        {topic.moreEvidence ? " · more evidence available" : ""}
                      </span>
                      {view === "overview" && (
                        <span className="explore-bar" aria-hidden="true">
                          <span
                            style={{ width: `${(topic.ideas / 20) * 100}%` }}
                          />
                        </span>
                      )}
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="explore-coverage">
            {topics?.coverage} Loaded topic pages are retained while browsing.
            {view === "overview" &&
              " Bars use the twenty-idea evidence-page limit as their full scale. They do not measure whole-topic size or independent corroboration."}
          </p>
          {laterPage && (
            <button
              className="secondary"
              onClick={() => {
                setLaterPage(false);
                void refresh();
              }}
            >
              Back to first topics page
            </button>
          )}
          {topics?.next && (
            <button
              disabled={loading}
              onClick={() => {
                setLaterPage(true);
                void refresh(topics?.next ?? undefined, true);
              }}
            >
              Show more topics
            </button>
          )}
        </>
      )}
      <details className="atlas-advanced">
        <summary>Connections and outcomes</summary>
        <fieldset className="explore-views" aria-label="Explore view">
          {views.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => {
                reset();
                setView(id);
              }}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </details>
    </section>
  );
}
function TopicBranches({
  topics,
  onOpen,
}: {
  topics: any[];
  onOpen: (topic: any) => void;
}) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const branch = (node: TopicNode) => {
    const topic = byId.get(node.id);
    return (
      <li key={node.id}>
        {node.children.length ? (
          <details open>
            <summary>
              <GitBranch size={19} aria-hidden="true" />
              <span>
                <strong>{titleCase(topic.name)}</strong>
                <span className="explore-meta">
                  {topic.posts} posts · {topic.ideas} current ideas
                </span>
              </span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <button className="secondary" onClick={() => onOpen(topic)}>
              Inspect {titleCase(topic.name)}
            </button>
            <ul>{node.children.map(branch)}</ul>
          </details>
        ) : (
          <button
            onClick={() => onOpen(topic)}
            aria-label={`Open ${titleCase(topic.name)}`}
          >
            <GitBranch size={19} aria-hidden="true" />
            <span>
              <strong>
                {titleCase(topic.name)}
                {topic.pinned ? " · Pinned" : ""}
              </strong>
              <span className="explore-meta">
                {topic.posts} posts · {topic.ideas} current ideas
                {topic.moreEvidence ? " · more evidence available" : ""}
              </span>
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </li>
    );
  };
  return (
    <ul className="explore-category-tree">
      {buildTopicTree(topics).map(branch)}
    </ul>
  );
}
function Measurement({ value: m }: { value: any }) {
  return (
    <div className="explore-measurement">
      <p>
        <strong>{m.label}</strong>: {m.before}{" "}
        <ArrowRight size={14} aria-label="to" /> {m.after} {m.unit}
      </p>
      <p>
        {m.baselineSamples} baseline samples · {m.observationSamples}{" "}
        observation samples
      </p>
      <p>
        Baseline {new Date(m.baselineStart).toISOString().slice(0, 10)} to{" "}
        {new Date(m.baselineEnd).toISOString().slice(0, 10)}. Observation{" "}
        {new Date(m.observationStart).toISOString().slice(0, 10)} to{" "}
        {new Date(m.observationEnd).toISOString().slice(0, 10)}.
      </p>
      <p>Limitations: {m.limitations}</p>
    </div>
  );
}
