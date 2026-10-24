"use client";
import { useState, useEffect, useRef, useEffectEvent, useId } from "react";
import { useRouter } from "next/navigation";
import { usePolling } from "@/lib/use-polling";
import { AssistantConnections } from "./assistant-connections";
import { AssistantIntakeStatus } from "./assistant-intake-status";
import { WorkCloudText } from "./work-cloud-text";
import { UsageSummary } from "./usage-summary";
import { usageOverview } from "../../../packages/billing/usage-overview";
import Link from "next/link";
import Image from "next/image";
import { Brand } from "./site";
import {
  Home,
  Library,
  GitBranch,
  Inbox,
  FileCheck2,
  GitPullRequest,
  Gauge,
  Plug,
  Laptop,
  ShieldCheck,
  CreditCard,
  Plus,
  FileText,
  Link2,
  Video,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowRight,
  Lightbulb,
  Check,
} from "lucide-react";
import { AccountMenu, type AccountProfile } from "./account-menu";
import { KnowledgeLibrary, LibrarySections } from "./knowledge-library";
import { LibrarySkeleton } from "./library-skeleton";
import { LibraryScan } from "./library-scan";
import { SubscriptionTrials } from "./subscription-trials";
import { Improvements } from "./improvements";
import { NoticeToast } from "./notice-toast";
import { TeamKnowledgeSharing } from "./team-knowledge-sharing";
import { SharedKnowledge } from "./shared-knowledge";
import { PrivateLibrary } from "./private-library";
import { StudioHome } from "./studio-home";
import { motion } from "motion/react";
import { useInterfaceMotion } from "./motion-preference";
import { mobileNavigationGroup } from "@/lib/mobile-navigation";
import { clearLibraryPlaces } from "@/lib/library-place";
import {
  libraryPageAfterContext,
  sourceCoverageLabel,
} from "@/lib/library-sources";
import { ProposalTrail } from "./proposal-trail";
import { AppTheme } from "./app-theme";
import { MotionPreference } from "./motion-preference";
import { downloadText } from "@/lib/download";
import { RepositoryChecklist, BusinessContext } from "./repository-checklist";
import { PlanEditor } from "./plan-editor";
import { ChoiceSelect } from "./choice-select";
import { policyRelease } from "../../../packages/policy/publication";
import { EvidenceViewer } from "./evidence-viewer";
import { AnalysisReview } from "./analysis-review";
import { SetupJourney } from "./setup-journey";
import { CreatorFollowing } from "./creator-following";
import { ServiceCatalog } from "./service-catalog";
import { CreatorDigest } from "./creator-digest";
import { OwnPlanTaskControls } from "./own-plan-task-controls";
import { OrderedFileUpload } from "./ordered-file-upload";
import { SourceAcquisitionPanel } from "./source-acquisition-panel";
import { TypedSourceEvidence } from "./typed-source-evidence";
import { PrivateSourceAnalysis } from "./private-source-analysis";
import { PublicKnowledgePanel } from "./public-knowledge-panel";
import { SavedPublicSource } from "./saved-public-source";
import { PublicSaveContinuation } from "./public-save-continuation";
import { SourceRelationships } from "./source-relationships";
import {
  availableProcessingCredits,
  cloudExecutionEstimate,
} from "../../../packages/plans/execution-quote";
import { reviewedPlan } from "../../../packages/plans/editor";
import { CookieSettings, rejectAnalytics } from "./consent";
import { track } from "@/lib/analytics";
import {
  productAnalyticsEvent,
  createJourneyMeasurements,
} from "@/lib/analytics-events";
import type { ImportPreview } from "../../../packages/instagram-import";
type Initial = {
  workspaceSlice?: "library" | "connections" | "usage" | "projects" | "plans";
  compact?: boolean;
  privateLibrary?: boolean;
  sharedKnowledge?: { items: any[]; next: string | null };
  selectedSharedKnowledge?: any;
  sharedKnowledgeError?: string;
  workspaceName?: string;
  aiPreference?: {
    preferChatGPTPlan: boolean;
    hostedStatus: string;
    active: boolean;
    personalAlphaEnabled?: boolean;
    linkAnalysisEnabled?: boolean;
    cloudAnalysisEnabled?: boolean;
    orderedPersonalAnalysisEnabled?: boolean;
  };
  sources: any[];
  selectedSource?: any;
  selectedProposal?: any;
  categories?: {
    key: string;
    name: string;
    count: number;
    level?: string;
    parents?: string[];
  }[];
  libraryNext?: string | null;
  repositories: any[];
  proposals: any[];
  runs: any[];
  notifications: any[];
  usage: any;
  devices?: any[];
  connections?: { provider: string; status: string; updatedAt: number }[];
  measured?: number;
  githubChoices?: { id: number; fullName: string; installationId: number }[];
  customerRoutes?: {
    status: string;
    models: { id: string; version: string; maxProviderUsdCents: number }[];
    execution?: {
      localReady: boolean;
      cloudReady: boolean;
      computeReservationCredits?: number;
      creditsPerSecond?: number;
    };
  };
};
const id = (o: any) => o._id ?? o.id;
const label = (s: string) => s.replaceAll("_", " ");
const blankPlan = {
  scope: "",
  nonGoals: [],
  files: [{ path: "", isNew: true }],
  steps: [""],
  tests: [""],
  risks: [],
  rollout: "",
  rollback: "",
  unknowns: [],
};
const Button = ({
  children,
  onClick,
  primary = false,
  disabled = false,
  busy = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) => (
  <button
    type="button"
    disabled={busy || disabled}
    aria-busy={busy || undefined}
    className={primary ? "primary" : "secondary"}
    onClick={onClick}
  >
    {busy && <Loader2 className="spinner" size={16} aria-hidden="true" />}
    {children}
  </button>
);

function SourceThumbnail({ source, demo }: { source: any; demo: boolean }) {
  const frame =
    (source.linkPreview?.assetId
      ? { id: source.linkPreview.assetId, kind: "frame" }
      : undefined) ??
    (source.originalMediaEvidence ?? source.mediaEvidence ?? []).find(
      (e: any) => e.kind === "frame",
    ) ??
    (source.personalMedia?.frames?.[0]
      ? { id: source.personalMedia.frames[0].assetId, kind: "frame" }
      : undefined);
  const [failedId, setFailedId] = useState<string>(),
    [loadedId, setLoadedId] = useState<string>();
  const failed = Boolean(frame && failedId === frame.id),
    loaded = Boolean(frame && loadedId === frame.id);
  return (
    <span className="source-thumb" aria-hidden="true">
      {!demo && frame && !failed && (
        <Image
          className={loaded ? "source-preview ready" : "source-preview"}
          src={`/api/evidence/${encodeURIComponent(frame.id)}?inline=true`}
          width={60}
          height={76}
          alt=""
          unoptimized
          loading="lazy"
          onLoad={() => setLoadedId(frame.id)}
          onError={() => setFailedId(frame.id)}
        />
      )}
      {(!loaded || failed) &&
        (source.kind === "text" ? (
          <FileText size={24} strokeWidth={1.5} />
        ) : source.kind === "upload" ? (
          <Video size={24} strokeWidth={1.5} />
        ) : (
          <Link2 size={24} strokeWidth={1.5} />
        ))}
    </span>
  );
}

export function Console({
  profile,
  compactHomePreview = false,
  demo = false,
  readOnly = false,
  canSuggestCategories = false,
  initial,
  organizationId,
  initialView = "home",
  initialReviewDraftId,
  initialSharedDraft = "",
  initialSearch = "",
  initialFilter = "",
  initialCategory = "",
  initialSort = "newest",
  initialSource = null,
  demoState = "ready",
  publicEdition,
  publicVersion,
}: {
  profile?: AccountProfile;
  compactHomePreview?: boolean;
  demo?: boolean;
  readOnly?: boolean;
  canSuggestCategories?: boolean;
  initial: Initial;
  organizationId: string;
  initialView?: string;
  initialReviewDraftId?: string;
  initialSharedDraft?: string;
  initialSearch?: string;
  initialFilter?: string;
  initialCategory?: string;
  initialSort?: string;
  initialSource?: any;
  demoState?: "ready" | "loading" | "error" | "empty";
  publicEdition?: string;
  publicVersion?: number;
}) {
  const [accessAvailable, setAccessAvailable] = useState(true);
  const captureAccess = useRef(true);
  const [journey] = useState(() => createJourneyMeasurements(track));
  const captureOrigin = useRef<HTMLElement | null>(null);
  const router = useRouter(),
    [data, setData] = useState(initial),
    [view, setView] = useState(
      initialView === "account"
        ? "menu"
        : initialView === "plans"
          ? "proposals"
          : initialView,
    ),
    [librarySection, setLibrarySection] = useState<
      "topics" | "posts" | "ideas" | "issues"
    >(
      demoState !== "ready" && demo
        ? "posts"
        : initialSearch || initialFilter || initialCategory
          ? "posts"
          : "topics",
    ),
    [selected, setSelected] = useState<any>(initialSource),
    [search, setSearch] = useState(initialSearch),
    [filter, setFilter] = useState(initialFilter),
    [category, setCategory] = useState(initialCategory),
    [sort, setSort] = useState(initialSort),
    [notice, setNotice] = useState(""),
    [noticeKind, setNoticeKind] = useState<"info" | "success" | "error">(
      "info",
    ),
    [reauthReturnTo, setReauthReturnTo] = useState(""),
    [busy, setBusy] = useState(false),
    [libraryLoading, setLibraryLoading] = useState(
      (demo && demoState === "loading") ||
        (!demo && (initial.compact || initial.workspaceSlice === "library")),
    ),
    [libraryError, setLibraryError] = useState(
      demo && demoState === "error"
        ? "Synthetic request failure. Your library could not be loaded."
        : "",
    ),
    [captureOpen, setCaptureOpen] = useState(
      !readOnly && Boolean(initialSharedDraft),
    ),
    [planText, setPlanText] = useState(JSON.stringify(blankPlan, null, 2)),
    [railCollapsed, setRailCollapsed] = useState(false),
    [pairing, setPairing] = useState<{
      id: string;
      fingerprint: string;
      credentialHash: string;
      name: string;
    } | null>(null);
  const [homeData, setHomeData] = useState<Initial | null>(
    initial.compact ? initial : null,
  );
  const viewGeneration = useRef(0);
  const homePreview = useRef(compactHomePreview);
  const firstView = useRef(true);
  const seenNotifications = useRef(new Set(initial.notifications.map(id)));
  const captureDialog = useRef<HTMLDialogElement>(null);
  const [sharedDraft, setSharedDraft] = useState(initialSharedDraft);
  const [followingRequested, setFollowingRequested] = useState(false);
  const followingPanel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (view === "library" && followingRequested && followingPanel.current) {
      followingPanel.current.open = true;
      followingPanel.current.querySelector("summary")?.focus();
    }
  }, [view, followingRequested]);
  const [analysisSettingsOpen, setAnalysisSettingsOpen] = useState(false);
  const libraryRequest = useRef(0);
  const libraryAbort = useRef<AbortController | null>(null);
  const refreshFlight = useRef<Promise<Initial | undefined> | null>(null);
  const recordReturn = useEffectEvent((hiddenAt: number) => {
    const destination = view === "proposals" ? "plans" : view;
    if (
      !["library", "projects", "source", "plans"].includes(destination) ||
      (!data.sources.some((s) => s.state === "ready") && !data.proposals.length)
    )
      return;
    journey.returned(
      `${organizationId}:${destination}:${hiddenAt}`,
      destination,
      new Date(hiddenAt).toDateString() === new Date().toDateString()
        ? "same_day"
        : "later_day",
    );
  });
  useEffect(() => {
    if (demo) return;
    let hiddenAt = 0;
    const changed = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= 60000) {
        recordReturn(hiddenAt);
        hiddenAt = 0;
      }
    };
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, [demo, organizationId]);
  async function loadLibrary(append = false) {
    if (demo) {
      setLibraryError("");
      return;
    }
    const generation = ++libraryRequest.current;
    libraryAbort.current?.abort();
    const abort = new AbortController();
    libraryAbort.current = abort;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      const q = new URLSearchParams({
        q: search,
        state: filter,
        category,
        sort,
      });
      if (append && data.libraryNext) q.set("cursor", data.libraryNext);
      const response = await fetch(`/api/library/${organizationId}?${q}`, {
        cache: "no-store",
        signal: abort.signal,
      });
      if (response.redirected || [401, 403, 404].includes(response.status)) {
        if (generation === libraryRequest.current) clearAccess();
        throw new Error("Your library could not be loaded. Sign in again.");
      }
      if (!response.ok)
        throw new Error("Your library could not be loaded. Try again.");
      const result = await response.json();
      if (generation !== libraryRequest.current) return;
      setData((current) => ({
        ...current,
        compact: false,
        ...(current.compact ? { workspaceSlice: "library" as const } : {}),
        sources: append
          ? [
              ...current.sources,
              ...result.items.filter(
                (item: any) =>
                  !current.sources.some((old) => id(old) === id(item)),
              ),
            ]
          : result.items,
        libraryNext: result.next,
      }));
    } catch (error) {
      if (!abort.signal.aborted && generation === libraryRequest.current)
        setLibraryError(
          error instanceof Error
            ? error.message
            : "Your library could not be loaded.",
        );
    } finally {
      if (generation === libraryRequest.current) setLibraryLoading(false);
    }
  }
  const loadLibraryFromEffect = useEffectEvent(() => loadLibrary());
  useEffect(() => {
    if (demo || view !== "library" || librarySection !== "posts") return;
    const timeout = setTimeout(() => {
      loadLibraryFromEffect().catch(() =>
        setNotice("Library search is unavailable. Try again."),
      );
    }, 250);
    return () => {
      clearTimeout(timeout);
      libraryAbort.current?.abort();
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- Invalidate this asynchronous request generation on cleanup.
      libraryRequest.current++;
    };
  }, [
    demo,
    organizationId,
    view,
    librarySection,
    search,
    filter,
    category,
    sort,
  ]);
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const github = currentUrl.searchParams.get("github");
    if (!demo && ["connected", "failed"].includes(github ?? "")) {
      setNotice(
        github === "connected"
          ? "GitHub connected. Choose a repository."
          : "GitHub connection failed. Try linking again; your existing selections are unchanged.",
      );
      currentUrl.searchParams.delete("github");
      window.history.replaceState(null, "", currentUrl);
    }
    const draft = currentUrl.searchParams.get("draft");
    if (!demo && draft) {
      const url = new URL(window.location.href);
      url.searchParams.delete("draft");
      window.history.replaceState(null, "", url);
    }
  }, [demo]);
  useEffect(() => {
    if (!captureOpen) return;
    const previous = captureOrigin.current;
    const dialog = captureDialog.current;
    dialog?.showModal();
    const controls = () =>
      [
        ...(dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ) ?? []),
      ].filter((element) => element.getClientRects().length);
    controls()[0]?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setCaptureOpen(false);
      }
      if (event.key !== "Tab") return;
      const items = controls(),
        first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      dialog?.close();
      const available = (element: HTMLElement | null) =>
        captureAccess.current &&
        element?.isConnected &&
        element !== document.body &&
        !element.matches(":disabled") &&
        element.getClientRects().length > 0;
      const target = available(previous)
        ? previous
        : [
            ...document.querySelectorAll<HTMLButtonElement>(
              ".product-top button.primary, .mobile-save",
            ),
          ].find(available);
      target?.focus();
      captureOrigin.current = null;
    };
  }, [captureOpen]);
  function applyData(next: Initial) {
    captureAccess.current = true;
    setAccessAvailable(true);
    if (next.workspaceSlice === "library") {
      setData((current) => ({
        ...current,
        ...next,
        ...libraryPageAfterContext(current),
      }));
      notify(next.notifications);
      return;
    }
    if (next.compact) {
      setHomeData(next);
      setData((current) => ({ ...current, notifications: next.notifications }));
      notify(next.notifications);
      return;
    }
    if (view === "home") setHomeData(null);
    if (!demo)
      for (const source of next.sources) {
        const old = data.sources.find((s) => id(s) === id(source));
        if (source.state === "ready" && old && old.state !== "ready")
          journey.ready(
            `${id(source)}:${source.generation}:${source.updatedAt}`,
            source.personalAnalysis?.state === "completed"
              ? "personal_chatgpt"
              : "included",
            source.coverage,
          );
      }
    setData((current) => ({ ...next, workspaceName: current.workspaceName }));
    setSelected((current: any) => {
      if (!current) return null;
      // A request started for a different selection cannot overwrite a source
      // or proposal opened while that request was in flight.
      if (!selected || id(current) !== id(selected)) return current;
      if (view === "source")
        return next.selectedSource && id(next.selectedSource) === id(current)
          ? next.selectedSource
          : null;
      return (
        (next.selectedProposal && id(next.selectedProposal) === id(current)
          ? next.selectedProposal
          : null) ??
        next.proposals.find((p) => id(p) === id(current)) ??
        next.sources.find((s) => id(s) === id(current)) ??
        null
      );
    });
    notify(next.notifications);
  }
  function notify(notifications: Initial["notifications"]) {
    for (const notification of notifications) {
      if (
        !seenNotifications.current.has(id(notification)) &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("VibeScroll has an update", {
          body: "Open your private inbox to review it.",
          tag: id(notification),
          icon: "/brand/icon-192.png",
          badge: "/brand/notification-badge.png",
        });
      }
      seenNotifications.current.add(id(notification));
    }
  }
  function clearAccess() {
    journey.clear();
    captureAccess.current = false;
    captureOrigin.current = null;
    setAccessAvailable(false);
    setCaptureOpen(false);
    try {
      clearLibraryPlaces(localStorage, organizationId);
    } catch {
      /* Access loss still clears all rendered data. */
    }
    viewGeneration.current++;
    libraryRequest.current++;
    libraryAbort.current?.abort();
    setLibraryLoading(false);
    setLibraryError(
      "Your session or access changed. Sign in again to continue.",
    );
    setHomeData(null);
    setSelected(null);
    setData({
      sources: [],
      repositories: [],
      proposals: [],
      runs: [],
      notifications: [],
      usage: null,
    });
  }

  async function refreshData() {
    if (demo) return;
    if (refreshFlight.current) return refreshFlight.current;
    const request = (async () => {
      const next = await refreshWorkspace();
      if (next && view === "library" && librarySection === "posts")
        await loadLibrary();
      return next;
    })();
    refreshFlight.current = request;
    try {
      await request;
    } finally {
      refreshFlight.current = null;
    }
  }
  async function refreshWorkspace(requestView = view) {
    const generation = viewGeneration.current;
    const query = new URLSearchParams({
      view: requestView,
      q: search,
      state: filter,
      category,
      sort,
    });
    if (view === "source" && selected) query.set("sourceId", id(selected));
    if (homePreview.current) query.set("homeMode", "compact");
    if (view === "proposal" && selected) query.set("proposalId", id(selected));
    if (requestView === "shared") {
      const selectedSharing = new URLSearchParams(window.location.search);
      const sharedGrantId = selectedSharing.get("grant");
      const sharedSourceId = selectedSharing.get("source");
      if (sharedGrantId && sharedSourceId) {
        query.set("sharedGrantId", sharedGrantId);
        query.set("sharedSourceId", sharedSourceId);
      }
    }
    const response = await fetch(`/api/workspace/${organizationId}?${query}`, {
      cache: "no-store",
    });
    if (
      response.ok &&
      !response.redirected &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      const next = await response.json();
      if (generation !== viewGeneration.current) return;
      applyData(next);
      return next as Initial;
    } else if (
      response.redirected ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    ) {
      if (generation !== viewGeneration.current) return;
      clearAccess();
    }
  }
  const refreshView = useEffectEvent(async () => {
    if (refreshFlight.current) await refreshFlight.current;
    await refreshWorkspace();
  });
  useEffect(() => {
    viewGeneration.current++;
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (!demo)
      refreshView().catch(() =>
        setNotice("This view could not be loaded. Try again."),
      );
  }, [view, demo]);
  async function openCapture() {
    if ((readOnly && !demo) || !captureAccess.current) return;
    // Full-editor loading can disable Save and move focus to the page body.
    // Retain the actual opener before starting that asynchronous refresh.
    captureOrigin.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const origin = captureOrigin.current;
    const forgetOrigin = () => {
      if (captureOrigin.current === origin) captureOrigin.current = null;
    };
    const generation = viewGeneration.current;
    if ((data.compact || data.workspaceSlice) && !demo) {
      setBusy(true);
      try {
        if (refreshFlight.current) await refreshFlight.current;
        if (!captureAccess.current || generation !== viewGeneration.current) {
          forgetOrigin();
          return;
        }
        const next = await refreshWorkspace("full");
        if (!captureAccess.current || generation !== viewGeneration.current) {
          forgetOrigin();
          return;
        }
        if (!next || next.compact || next.workspaceSlice)
          throw new Error("Capture options could not be loaded. Try again.");
        setCaptureOpen(true);
      } catch (error) {
        forgetOrigin();
        setNoticeKind("error");
        setNotice(
          error instanceof Error
            ? error.message
            : "Capture options could not be loaded.",
        );
      } finally {
        setBusy(false);
      }
    } else setCaptureOpen(true);
  }
  async function openProposal(proposalId: string) {
    if (demo) {
      setSelected(data.proposals.find((p) => id(p) === proposalId));
      setView("proposal");
      return;
    }
    const generation = viewGeneration.current;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/workspace/${organizationId}?view=full&proposalId=${encodeURIComponent(proposalId)}`,
        { cache: "no-store" },
      );
      if ([401, 403, 404].includes(response.status) || response.redirected)
        clearAccess();
      if (
        !response.ok ||
        response.redirected ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new Error(
          "This idea is unavailable. Open the current review list.",
        );
      const next: Initial = await response.json();
      if (generation !== viewGeneration.current) return;
      if (!next.selectedProposal)
        throw new Error(
          "This idea is unavailable. Its evidence may have changed.",
        );
      applyData(next);
      setSelected(next.selectedProposal);
      setView("proposal");
      journey.decision(
        `${id(next.selectedProposal)}:${next.selectedProposal.version}:${next.selectedProposal.updatedAt}`,
        next.selectedProposal.detail?.disposition,
      );
    } catch (error) {
      setNoticeKind("error");
      setNotice(
        error instanceof Error
          ? error.message
          : "This idea could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  const home = homeData ?? data;
  const processing =
    (view === "source" &&
      selected &&
      ["queued", "processing"].includes(selected.state)) ||
    data.sources.some((s) => ["queued", "processing"].includes(s.state)) ||
    data.repositories.some((r) =>
      ["preparing", "drafting_context"].includes(r.status),
    ) ||
    data.runs.some((r) =>
      ["queued", "running", "publishing"].includes(r.state),
    );
  usePolling(
    refreshData,
    processing ? 15000 : 60000,
    !demo && view !== "connections",
    organizationId,
  );
  const planIdentity = selected
    ? `${id(selected)}:${selected.planHash ?? (selected.planDraftVersion === selected.version ? (selected.planDraftKey ?? JSON.stringify(selected.planDraft ?? null)) : "")}`
    : "";
  const [editedPlanIdentity, setEditedPlanIdentity] = useState("");
  if (editedPlanIdentity !== planIdentity) {
    setEditedPlanIdentity(planIdentity);
    setPlanText(
      JSON.stringify(
        selected?.plan ??
          (selected?.planDraftVersion === selected?.version
            ? selected?.planDraft
            : undefined) ??
          blankPlan,
        null,
        2,
      ),
    );
  }
  async function call(operation: string, args: any, strict = false) {
    if (
      readOnly &&
      !demo &&
      ![
        "setupJourney",
        "acquisitionStatus",
        "publicOwn",
        "savedPublicDetail",
        "sourceRelationships",
      ].includes(operation)
    ) {
      setNotice(
        "Your viewer role allows reading. Ask a workspace owner to change your role before making changes.",
      );
      if (strict)
        throw new Error("Your current role cannot perform this operation.");
      return;
    }
    setBusy(true);
    setNoticeKind("info");
    setNotice("");
    setReauthReturnTo("");
    try {
      if (demo) {
        setNotice(
          "Synthetic demo action only. No provider, payment, execution or GitHub write occurred.",
        );
        return "demo";
      }
      if (operation === "preferences" && args.analytics === false)
        rejectAnalytics();
      const res = await fetch("/api/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, args }),
      });
      if (res.redirected || res.status === 401 || res.status === 403) {
        clearAccess();
        throw new Error(
          "Your session or access changed. Sign in again to continue.",
        );
      }
      if (!res.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "The application host is temporarily unavailable. No success was confirmed. Check the inbox before retrying this action.",
        );
      const body = await res.json();
      if (!res.ok) {
        setReauthReturnTo(
          body.code === "REAUTH_REQUIRED"
            ? window.location.pathname + window.location.search
            : "",
        );
        if (!demo)
          track("operation_failed", {
            operation,
            code: body.code ?? "UNKNOWN",
          });
        throw new Error(body.error);
      }
      if (
        [
          "checkPersonalSession",
          "subscriptionTrialList",
          "subscriptionTrialBundle",
          "setupJourney",
          "saveSetupJourney",
          "creatorFollowing",
          "creatorDigest",
          "creatorFollow",
          "creatorFollowChange",
          "creatorSuppress",
          "creatorPreviewBackfill",
          "creatorApproveBackfill",
          "localTaskCapabilities",
          "localTaskResume",
          "serviceArtifactPreview",
          "serviceArtifactBrowse",
          "workCloudTextPreview",
          "workCloudTextApprove",
          "localTaskQuote",
          "localTaskStatus",
          "privateSourceAnalysisDetail",
          "localTaskApprove",
          "localTaskCancel",
          "localTaskReconcile",
          "acquisitionStatus",
          "publicOwn",
          "savedPublicDetail",
          "sourceRelationships",
        ].includes(operation)
      )
        return body.result;
      const event = productAnalyticsEvent(operation, args, body.result);
      if (!demo && event && operation !== "editPlan")
        track(event.event, event.properties);
      if (!demo && operation === "editPlan")
        journey.planRetained(
          `${args.id}:${args.version}:${JSON.stringify(args.plan)}`.slice(
            0,
            512,
          ),
        );
      setHomeData(null);
      await refreshData();
      if (operation === "deleteSource") go("library");
      setNotice(
        operation === "deleteSource"
          ? "Source deleted."
          : operation === "suggestCategory"
            ? "Category name submitted for review."
            : ((
                {
                  improvementStart: "Plan prepared. Review it in Improvements.",
                  subscriptionTrialPrepare:
                    "Trial evidence prepared for your agent.",
                  subscriptionTrialFinish:
                    "Trial results added. Review them in Library.",
                  subscriptionTrialCancel: "Trial evidence deleted.",
                  scanPrepare:
                    "Counting your full library. Review the scan before analysis starts.",
                  scanApprove:
                    "Library scan started within your maximum spend.",
                  scanPause:
                    "Scan updated. Already approved work retains its existing limits.",
                  improvementExecute:
                    "AI coding queued within your maximum spend.",
                  improvementOutcome: "Your feedback was recorded.",
                  improvementPolicySave: "Project limits saved.",
                  improvementPolicyPause: "Continuous operation paused.",
                  improvementCategorize: "Plan added to the routine queue.",
                  improvementPreferencesSave:
                    "Preferences saved. Future ideas will use them.",
                  improvementRefresh: "Progress refreshed.",
                  issuePublish: "Issue published to GitHub.",
                  issuePrepare: "GitHub access checked.",
                  issueRefresh: "GitHub issue refreshed.",
                  process: "Analysis queued.",
                  knowledgeEvaluate: "Idea evaluation queued.",
                  knowledgeCorrect: "Topic updated.",
                  draftProfile:
                    "Context draft prepared. Review it in Projects.",
                  confirmProfile: "Business context confirmed.",
                  publish: "Pull request publication completed.",
                  approve: "Coding queued within your maximum spend.",
                  cancel: "Stop requested.",
                } as Record<string, string>
              )[operation] ?? "Saved."),
      );
      setNoticeKind("success");
      return body.result;
    } catch (e) {
      setNoticeKind("error");
      setNotice(e instanceof Error ? e.message : "The action failed.");
      if (strict) throw e;
    } finally {
      setBusy(false);
    }
  }
  const strictCall = (operation: string, args: any) =>
    call(operation, args, true);
  const syncRoute = useEffectEvent(() => {
    setView(
      initialView === "account"
        ? "menu"
        : initialView === "plans"
          ? "proposals"
          : initialView,
    );
    setSelected(initialSource ?? null);
  });
  useEffect(() => {
    syncRoute();
  }, [initialView, organizationId]);
  const [projectScanOpen, setProjectScanOpen] = useState(false);
  const [projectEvidenceOpen, setProjectEvidenceOpen] =
    useState(!!initialReviewDraftId);
  const [projectEvidenceSection, setProjectEvidenceSection] = useState<
    "topics" | "ideas" | "issues"
  >(initialReviewDraftId ? "issues" : "topics");
  const pointerInput = useRef(false);
  useEffect(() => {
    const pointer = () => {
      pointerInput.current = true;
    };
    const keyboard = () => {
      pointerInput.current = false;
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, []);
  const interfaceMotion = useInterfaceMotion();
  const go = (v: string) => {
    if (v === "following") {
      setFollowingRequested(true);
      v = "library";
    } else if (v !== "library") setFollowingRequested(false);
    if (!demo && v === "billing") {
      router.push(`/app/${organizationId}/billing`);
      return;
    }
    setView(v);
    setSelected(null);
    if (!demo) track("workspace_viewed", { view: v });
    if (!demo)
      history.pushState(
        history.state,
        "",
        `/app/${organizationId}/${v === "home" ? "" : v === "menu" ? "account" : v}${v === "home" && homePreview.current ? "?homeMode=compact" : ""}`,
      );
  };
  useEffect(() => {
    if (demo) return;
    const recover = () => {
      const parts = location.pathname.split("/").filter(Boolean);
      if (parts[0] !== "app" || parts[1] !== organizationId) return;
      const target = parts[2] || "home";
      if (
        [
          "home",
          "library",
          "projects",
          "improvements",
          "inbox",
          "runs",
          "proposals",
          "usage",
          "connections",
          "runners",
          "privacy",
          "account",
        ].includes(target) &&
        !parts[3]
      ) {
        setView(target === "account" ? "menu" : target);
        setSelected(null);
      }
    };
    window.addEventListener("popstate", recover);
    return () => window.removeEventListener("popstate", recover);
  }, [demo, organizationId]);
  const filtered = !demo
    ? data.sources
    : data.sources.filter(
        (s) =>
          (!search ||
            [
              s.title,
              s.summary,
              s.text,
              ...(s.tags ?? []),
              ...(s.mainPoints ?? []),
            ]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!category || s.categoryKeys?.includes(category)) &&
          (!filter ||
            s.state === filter ||
            s.matches?.some((m: any) => m.disposition === filter)),
      );
  function findSource(s: any) {
    if (!demo)
      track("source_viewed", {
        kind: s.kind,
        state: s.state,
        coverage: s.coverage,
      });
    setSelected(s);
    setView("source");
    if (!demo) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries({
        q: search,
        state: filter,
        category,
        sort,
      }))
        if (value && (key !== "sort" || value !== "newest"))
          query.set(key, value);
      router.push(
        `/app/${organizationId}/library/${encodeURIComponent(id(s))}${query.size ? `?${query}` : ""}`,
      );
    }
  }
  const nav = [
    ["home", "Home", Home],
    ["library", "Library", Library],
    ["projects", "Projects", GitBranch],
    ["improvements", "Improvements", FileCheck2],
    ["inbox", "Inbox", Inbox],
    ["runs", "Runs & PRs", GitPullRequest],
    ["proposals", "Proposals", FileCheck2],
    ["usage", "Usage", Gauge],
    ["connections", "Connections", Plug],
    ["runners", "Computers", Laptop],
    ["privacy", "Privacy", ShieldCheck],
    ["billing", "Billing", CreditCard],
  ] as const;
  const pendingProposals = data.proposals.filter(
    (p) => p.review === "unreviewed",
  ).length;
  return (
    <div
      className={`product-shell atlas-shell ${railCollapsed ? "rail-collapsed" : ""}`}
    >
      <AppTheme />
      <aside className="product-rail">
        <div className="rail-brand">
          <Brand href={demo ? "/demo" : `/app/${organizationId}`} />
          <button
            type="button"
            className="icon-button"
            aria-label="Collapse sidebar"
            onClick={() => setRailCollapsed(true)}
          >
            <PanelLeftClose size={19} />
          </button>
        </div>
        {demo && <p className="workspace-label">Demo workspace</p>}
        <nav aria-label="Application">
          {nav.slice(0, 3).map(([key, title, Icon]) => (
            <button
              type="button"
              key={key}
              aria-current={view === key ? "page" : undefined}
              className={view === key ? "active" : ""}
              onClick={() => go(key)}
            >
              <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
              {title}
              {key === "inbox" && data.notifications.some((n) => !n.read) && (
                <span className="nav-count">
                  {data.notifications.filter((n) => !n.read).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <button type="button" onClick={() => go("connections")}>
            <Plug size={18} />
            Connections
          </button>
          <AccountMenu go={go} demo={demo} profile={profile} />
        </div>
      </aside>
      <div className="product-body">
        <header className="product-top">
          <div className="row">
            <button
              type="button"
              className="icon-button rail-open"
              aria-label="Expand sidebar"
              onClick={() => setRailCollapsed(false)}
            >
              <PanelLeftOpen size={19} />
            </button>
            <Brand href={demo ? "/demo" : `/app/${organizationId}`} />
            <div className="studio-scope">
              <span className="top-view">
                {view === "source"
                  ? "Library"
                  : view === "proposal"
                    ? "Proposals"
                    : view === "menu"
                      ? "Account"
                      : view === "shared"
                        ? "Shared knowledge"
                        : (nav.find((n) => n[0] === view)?.[1] ??
                          "Review plan")}
              </span>
              <Link
                href={demo ? "/demo" : "/app/workspaces"}
                prefetch={false}
                title={
                  data.workspaceName ??
                  (demo ? "Demo workspace" : "Current workspace")
                }
              >
                {data.workspaceName ??
                  (demo ? "Demo workspace" : "Current workspace")}
              </Link>
            </div>
            {demo && <span className="status">Synthetic demo</span>}
          </div>
          <div className="row">
            <Button
              busy={busy}
              disabled={(readOnly && !demo) || !accessAvailable}
              primary
              onClick={() => {
                void openCapture();
              }}
            >
              <Plus size={17} />
              Save
            </Button>
          </div>
        </header>
        {readOnly && !demo && (
          <p className="demo-banner">
            Viewer access. You can read this workspace. Captures, edits,
            approvals, execution and billing changes require another role.
          </p>
        )}
        {demo && (
          <p className="demo-banner">
            Synthetic data only. No real videos, customer repositories, measured
            benefits or live execution.
          </p>
        )}
        <main id="main" className="product-main">
          <div
            className={`page-heading ${view === "source" ? "source-heading" : ""}`}
          >
            <div>
              <h1 className={view === "library" ? "sr-only" : undefined}>
                {view === "source"
                  ? (selected?.title ?? "Source unavailable")
                  : view === "proposal"
                    ? selected?.title
                    : view === "menu"
                      ? "Account"
                      : view === "shared"
                        ? "Shared knowledge"
                        : (nav.find((n) => n[0] === view)?.[1] ??
                          "Review plan")}
              </h1>
            </div>
            {selected && (
              <Button
                busy={busy}
                onClick={() => go(view === "source" ? "library" : "proposals")}
              >
                Back to list
              </Button>
            )}
          </div>
          <NoticeToast
            message={notice}
            kind={noticeKind}
            onDismiss={() => setNotice("")}
            action={
              reauthReturnTo ? (
                <a
                  href={`/sign-in?reauth=true&returnTo=${encodeURIComponent(reauthReturnTo)}`}
                >
                  Sign in again
                </a>
              ) : undefined
            }
          />
          {!accessAvailable ? (
            <section className="panel" role="alert">
              <h2>Your access changed</h2>
              <p>
                Sign in again to reload current permitted data. Your unsaved
                link remains on this page.
              </p>
              <Link
                prefetch={false}
                href={`/sign-in?reauth=true&returnTo=${encodeURIComponent(`/app/${organizationId}/`)}`}
              >
                Sign in again
              </Link>
            </section>
          ) : data.compact && view !== "home" && view !== "menu" ? (
            <section aria-busy="true" className="studio-empty">
              <output>Loading this workspace view...</output>
              <Button
                onClick={() => {
                  void refreshData();
                }}
              >
                Try again
              </Button>
            </section>
          ) : (
            <>
              {view === "shared" && (
                <SharedKnowledge
                  key={`${organizationId}:${JSON.stringify([data.sharedKnowledge, data.selectedSharedKnowledge, data.sharedKnowledgeError])}`}
                  organizationId={organizationId}
                  initial={data.sharedKnowledge}
                  initialDetail={data.selectedSharedKnowledge}
                  initialError={data.sharedKnowledgeError}
                />
              )}
              {view === "improvements" && (
                <Improvements
                  organizationId={organizationId}
                  call={call}
                  readOnly={readOnly}
                  demo={demo}
                  executionReady={
                    data.customerRoutes?.execution?.cloudReady === true
                  }
                  availableCredits={
                    data.usage?.wallet
                      ? Math.max(
                          0,
                          data.usage.wallet.granted -
                            data.usage.wallet.spent -
                            data.usage.wallet.reserved,
                        )
                      : 0
                  }
                  onOpenIssues={() => go("projects")}
                  onOpenRuns={() => go("runs")}
                  computeReservationCredits={
                    data.customerRoutes?.execution?.computeReservationCredits
                  }
                  creditsPerSecond={
                    data.customerRoutes?.execution?.creditsPerSecond
                  }
                />
              )}
              {view === "library" && !demo && data.privateLibrary && (
                <ServiceCatalog
                  key={organizationId}
                  organizationId={organizationId}
                  call={strictCall}
                  disabled={readOnly}
                  entitlementKey={JSON.stringify([
                    data.usage?.wallet?.tier ?? null,
                    data.usage?.wallet?.periodEnd ?? null,
                    data.usage?.billing?.status ?? null,
                    data.usage?.billing?.subscriptionId ?? null,
                    data.usage?.billing?.verifiedAt ?? null,
                    data.usage?.billing?.periodEnd ?? null,
                  ])}
                />
              )}
              {view === "library" && !demo && data.privateLibrary && (
                <details className="panel" id="following" ref={followingPanel}>
                  <summary>Following</summary>
                  <CreatorFollowing
                    organizationId={organizationId}
                    call={strictCall}
                    disabled={readOnly}
                  />
                </details>
              )}
              {view === "library" && (
                <>
                  <details
                    className="library-secondary"
                    open={librarySection !== "topics"}
                  >
                    <summary>Posts, insights and sharing</summary>
                    <a
                      href="/help/organize-your-library"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Library and filing help
                    </a>
                    {!data.privateLibrary && !demo && (
                      <a
                        className="button secondary"
                        href={`/app/${organizationId}/shared`}
                      >
                        Knowledge shared with this workspace
                      </a>
                    )}
                    <LibrarySections
                      active={librarySection}
                      onSelect={setLibrarySection}
                      posts
                    />
                  </details>
                  <details
                    className="library-analysis-settings"
                    hidden={librarySection !== "posts"}
                    onToggle={(event) =>
                      setAnalysisSettingsOpen(event.currentTarget.open)
                    }
                  >
                    <summary>Analyze saved posts</summary>
                    <SubscriptionTrials
                      key={`trials:${organizationId}`}
                      organizationId={organizationId}
                      call={call}
                      readOnly={readOnly}
                      enabled={
                        !demo &&
                        librarySection === "posts" &&
                        analysisSettingsOpen &&
                        !!data.aiPreference?.personalAlphaEnabled
                      }
                    />
                  </details>
                  <div
                    className="library-knowledge-container"
                    hidden={librarySection === "posts"}
                  >
                    <KnowledgeLibrary
                      enabled={librarySection !== "posts"}
                      section={
                        librarySection === "posts" ? "topics" : librarySection
                      }
                      key={organizationId}
                      organizationId={organizationId}
                      repositories={data.repositories}
                      readOnly={readOnly}
                      demo={demo}
                      call={call}
                      onOpenImprovements={() => go("improvements")}
                    />
                  </div>
                </>
              )}
              {view === "home" && (
                <>
                  {!demo && publicEdition && publicVersion && (
                    <PublicSaveContinuation
                      slug={publicEdition}
                      version={publicVersion}
                      organizationId={organizationId}
                      call={strictCall}
                      disabled={readOnly}
                    />
                  )}
                  {data.privateLibrary && !demo && (
                    <SetupJourney
                      key={organizationId}
                      organizationId={organizationId}
                      call={strictCall}
                      onNavigate={go}
                      onSave={() => void openCapture()}
                      disabled={readOnly}
                      followingAvailable
                    />
                  )}
                  {data.privateLibrary && !demo && (
                    <CreatorDigest
                      organizationId={organizationId}
                      call={strictCall}
                      onOpenSource={findSource}
                      disabled={readOnly}
                    />
                  )}
                  {data.privateLibrary && !demo && (
                    <div id="library-purpose">
                      <PrivateLibrary
                        key={organizationId}
                        organizationId={organizationId}
                        call={call}
                        readOnly={readOnly}
                        onOpenSource={findSource}
                        onSave={() => {
                          void openCapture();
                        }}
                        onProjects={() => go("projects")}
                      />
                    </div>
                  )}
                  <StudioHome
                    organizationId={organizationId}
                    demo={demo}
                    key={organizationId}
                    sources={home.sources}
                    proposals={home.proposals}
                    repositories={home.repositories}
                    runs={home.runs}
                    libraryNext={home.libraryNext}
                    compact={home.compact}
                    draft={sharedDraft}
                    onDraft={setSharedDraft}
                    onSave={() => {
                      void openCapture();
                    }}
                    onOpenSource={findSource}
                    onOpenProposal={(proposal) => {
                      void openProposal(id(proposal));
                    }}
                    go={go}
                    readOnly={readOnly}
                    busy={busy}
                  />
                </>
              )}
              {view === "library" && librarySection === "posts" && (
                <>
                  {pendingProposals > 0 && (
                    <div className="attention">
                      <h2>
                        {pendingProposals}{" "}
                        {pendingProposals === 1 ? "proposal" : "proposals"} to
                        review
                      </h2>
                      <Button busy={busy} onClick={() => go("proposals")}>
                        Review <ArrowRight size={16} />
                      </Button>
                    </div>
                  )}
                  <div className="library-tools">
                    <label>
                      <span className="sr-only">Search your library</span>
                      <input
                        value={search}
                        placeholder="Search your library"
                        onChange={(e) => {
                          setSearch(e.target.value);
                          const u = new URL(location.href);
                          u.searchParams.set("q", e.target.value);
                          history.replaceState(null, "", u);
                        }}
                      />
                    </label>
                    <label>
                      <span className="sr-only">Filter sources</span>
                      <ChoiceSelect
                        aria-label="Filter sources"
                        value={filter}
                        onValueChange={(value) => {
                          setFilter(value);
                          const u = new URL(location.href);
                          u.searchParams.set("state", value);
                          history.replaceState(null, "", u);
                        }}
                      >
                        <option value="">All posts</option>
                        <option value="ready">Analyzed</option>
                        <option value="not_analyzed">Not analyzed</option>
                        <option value="in_progress">Processing</option>
                        {[
                          "failed",
                          "needs_upload",
                          "no_fit",
                          "already_implemented",
                          "unsupported_claim",
                          "needs_context",
                        ].map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </ChoiceSelect>
                    </label>
                    <label>
                      <span className="sr-only">Category</span>
                      <ChoiceSelect
                        aria-label="Category"
                        value={category}
                        onValueChange={(value) => {
                          setCategory(value);
                          const u = new URL(location.href);
                          u.searchParams.set("category", value);
                          history.replaceState(null, "", u);
                        }}
                      >
                        <option value="">All categories</option>
                        {(data.categories ?? [])
                          .filter((c) => c.count > 0)
                          .sort(
                            (a, b) =>
                              Number(b.level === "collection") -
                                Number(a.level === "collection") ||
                              a.name.localeCompare(b.name),
                          )
                          .map((c) => (
                            <option
                              key={c.key}
                              value={c.key}
                              data-group={
                                c.level === "collection"
                                  ? "Collections"
                                  : "Topics"
                              }
                            >
                              {c.name} ({c.count})
                            </option>
                          ))}
                      </ChoiceSelect>
                    </label>
                    <label>
                      <span className="sr-only">Sort sources</span>
                      <ChoiceSelect
                        aria-label="Sort sources"
                        value={search ? "relevance" : sort}
                        disabled={Boolean(search)}
                        onValueChange={(value) => {
                          setSort(value);
                          const u = new URL(location.href);
                          u.searchParams.set("sort", value);
                          history.replaceState(null, "", u);
                        }}
                      >
                        {search && (
                          <option value="relevance">Most relevant</option>
                        )}
                        <option value="newest">Added to app · newest</option>
                        <option value="oldest">Added to app · oldest</option>
                        <option value="saved">
                          Saved on platform · newest
                        </option>
                        <option value="published">
                          Post published · newest
                        </option>
                        <option value="updated">Recently updated</option>
                        <option value="title">Title A-Z</option>
                      </ChoiceSelect>
                    </label>
                    {(search || filter || category || sort !== "newest") && (
                      <Button
                        busy={busy}
                        onClick={() => {
                          setSearch("");
                          setFilter("");
                          setCategory("");
                          setSort("newest");
                          const u = new URL(location.href);
                          for (const key of ["q", "state", "category", "sort"])
                            u.searchParams.delete(key);
                          history.replaceState(null, "", u);
                        }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                  {sort === "published" && !search && (
                    <p className="fine">
                      Posts with an unavailable publication date appear last.
                    </p>
                  )}
                  {libraryError && (
                    <div className="panel error" role="alert">
                      {libraryError}
                      <Button
                        busy={libraryLoading}
                        onClick={() => loadLibrary()}
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                  <div className="source-list" aria-busy={libraryLoading}>
                    {libraryLoading && !filtered.length ? (
                      <LibrarySkeleton kind="topics" rows={5} />
                    ) : filtered.length ? (
                      filtered.map((s) => (
                        <article key={id(s)} className="source-card">
                          <button
                            type="button"
                            className="source-hitarea"
                            onClick={() => findSource(s)}
                            aria-label={`Open ${s.title}`}
                          />
                          <SourceThumbnail source={s} demo={demo} />
                          <div className="source-card-body">
                            <h2>{s.title}</h2>
                            <div className="row spread">
                              <span className="coverage">
                                {sourceCoverageLabel(s.coverage)}
                              </span>
                            </div>
                            {!demo && s.state !== "ready" && (
                              <span className="muted source-state">
                                {label(s.state ?? "ready")}
                              </span>
                            )}
                            <p>
                              {s.summary ??
                                (s.state === "needs_upload"
                                  ? "Add the video or transcript to analyze it."
                                  : ["processing", "queued"].includes(s.state)
                                    ? "Transcribing and analyzing your source..."
                                    : s.state === "failed"
                                      ? "Analysis stopped. Open for details."
                                      : "Ready for analysis.")}
                            </p>
                            <ul className="point-preview">
                              {s.mainPoints?.slice(0, 3).map((p: string) => (
                                <li key={p}>{p}</li>
                              ))}
                            </ul>
                            <div className="row wrap">
                              {s.createdAt && (
                                <span className="fine">
                                  Added{" "}
                                  {new Date(s.createdAt).toLocaleDateString()}
                                </span>
                              )}
                              {sort === "published" && (
                                <span className="fine">
                                  {s.publishedAt
                                    ? `Published ${new Date(s.publishedAt).toLocaleDateString()}`
                                    : "Publication date unavailable"}
                                </span>
                              )}
                              {sort === "saved" && (
                                <span className="fine">
                                  {s.originalSavedAt
                                    ? `Saved ${new Date(s.originalSavedAt).toLocaleDateString()}`
                                    : "Save date unavailable"}
                                </span>
                              )}
                              {s.insightCount > 0 && (
                                <span className="tag">
                                  {s.insightCount} insights
                                </span>
                              )}
                              {s.matches?.map((m: any) => (
                                <span className="status" key={m.repositoryId}>
                                  {label(m.disposition)}
                                </span>
                              ))}
                              {(s.categoryNames ?? s.tags)
                                ?.slice(0, 4)
                                .map((t: string) => (
                                  <span className="tag" key={t}>
                                    {label(t)}
                                  </span>
                                ))}
                              {s.pullRequests?.length > 0 && (
                                <span className="tag">
                                  {
                                    s.pullRequests.filter(
                                      (p: any) => p.mergedAt,
                                    ).length
                                  }{" "}
                                  merged PR ·{" "}
                                  {
                                    s.pullRequests.filter(
                                      (p: any) => p.state === "open",
                                    ).length
                                  }{" "}
                                  open
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className="icon-button source-open"
                            aria-hidden="true"
                          >
                            <ArrowRight size={18} />
                          </span>
                        </article>
                      ))
                    ) : (
                      <div className="empty">
                        <h2>
                          {search || filter || category
                            ? "No matches on this page"
                            : "Your library starts here."}
                        </h2>
                        <p>
                          {search || filter || category
                            ? data.libraryNext
                              ? "Continue loading to check more sources, or clear the filters."
                              : "Clear the filters to see your saved sources."
                            : "Add a supported link, upload permitted content, or supply a transcript."}
                        </p>
                        <Button
                          busy={busy}
                          primary
                          onClick={() =>
                            search || filter || category
                              ? (setSearch(""), setFilter(""), setCategory(""))
                              : void openCapture()
                          }
                        >
                          {search || filter || category
                            ? "Clear filters"
                            : "Add source"}
                        </Button>
                      </div>
                    )}
                  </div>
                  {!demo && data.libraryNext && (
                    <Button
                      busy={busy}
                      onClick={() =>
                        loadLibrary(true).catch(() =>
                          setNotice("Could not load the next page."),
                        )
                      }
                    >
                      Load more sources
                    </Button>
                  )}
                </>
              )}
              {view === "source" && selected && (
                <SourceDetail
                  key={id(selected)}
                  source={selected}
                  sources={data.sources}
                  readOnly={readOnly}
                  busy={busy}
                  canSuggestCategories={canSuggestCategories}
                  demo={demo}
                  org={organizationId}
                  repos={data.repositories}
                  devices={data.devices ?? []}
                  personalEnabled={
                    !demo && data.aiPreference?.personalAlphaEnabled === true
                  }
                  linkAnalysisEnabled={data.aiPreference?.linkAnalysisEnabled}
                  orderedPersonalEnabled={
                    data.aiPreference?.orderedPersonalAnalysisEnabled === true
                  }
                  cloudEnabled={data.aiPreference?.cloudAnalysisEnabled}
                  call={call}
                  strictCall={strictCall}
                  onRefresh={refreshData}
                  journey={journey}
                  onProposal={(p: any) => {
                    setSelected(p);
                    setView("proposal");
                  }}
                />
              )}
              {view === "source" && !selected && (
                <div className="panel empty-state">
                  <p>This source is no longer available in this workspace.</p>
                  <Button onClick={() => go("library")}>Open library</Button>
                </div>
              )}
              {view === "projects" && (
                <>
                  <section
                    className="atlas-projects"
                    aria-label="Your selected projects"
                  >
                    {data.repositories
                      .filter((r) => r.enabled)
                      .map((r) => {
                        const proposals = data.proposals.filter(
                          (p) => p.repositoryId === id(r),
                        );
                        return (
                          <article className="panel atlas-project" key={id(r)}>
                            <GitBranch size={24} aria-hidden="true" />
                            <h2>
                              {r.fullName ?? r.name ?? "Selected project"}
                            </h2>
                            <span className="status">
                              {r.confirmed
                                ? "Context reviewed"
                                : "Context needs review"}
                            </span>
                            {proposals.length ? (
                              <ul>
                                {proposals.slice(0, 6).map((p) => (
                                  <li key={id(p)}>
                                    <button
                                      onClick={() => void openProposal(id(p))}
                                    >
                                      <Lightbulb size={18} aria-hidden="true" />
                                      <span>{p.title}</span>
                                      <span className="explore-meta">
                                        {label(p.review)}
                                      </span>
                                      <ArrowRight
                                        size={16}
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p>No proposals on this loaded page.</p>
                            )}
                            <Button onClick={() => go("proposals")}>
                              Review proposals
                            </Button>
                          </article>
                        );
                      })}
                    {!data.repositories.some((r) => r.enabled) && (
                      <section className="panel">
                        <h2>Your ideas need a destination</h2>
                        <p>Choose a project below and review its context.</p>
                      </section>
                    )}
                  </section>
                  <details
                    className="panel atlas-project-settings"
                    open={!data.repositories.some((r) => r.enabled)}
                  >
                    <summary>Project connections and context</summary>
                    <RepositoryChecklist
                      key={`selection:${organizationId}`}
                      organizationId={organizationId}
                      repositories={data.repositories}
                      choices={data.githubChoices ?? []}
                      call={call}
                      readOnly={readOnly}
                      demo={demo}
                    />
                    {data.repositories.map((r) => (
                      <BusinessContext
                        key={`${id(r)}:${r.profileVersion}:${r.selectionVersion ?? 0}:${r.profileDraftSha ?? ""}`}
                        repo={r}
                        call={call}
                        readOnly={readOnly || demo}
                      />
                    ))}
                  </details>
                  <details
                    className="panel"
                    onToggle={(event) =>
                      setProjectScanOpen(event.currentTarget.open)
                    }
                  >
                    <summary>Find proposals across saved insights</summary>
                    <LibraryScan
                      enabled={projectScanOpen}
                      key={`scan:${organizationId}`}
                      organizationId={organizationId}
                      repositories={data.repositories}
                      devices={data.devices ?? []}
                      call={call}
                      readOnly={readOnly}
                      demo={demo}
                      onOpenIssues={() => {
                        setProjectEvidenceSection("issues");
                        setProjectEvidenceOpen(true);
                      }}
                    />
                  </details>
                  <details
                    className="panel"
                    open={projectEvidenceOpen}
                    onToggle={(event) =>
                      setProjectEvidenceOpen(event.currentTarget.open)
                    }
                  >
                    <summary>Explore project evidence</summary>
                    <LibrarySections
                      active={projectEvidenceSection}
                      onSelect={(section) => {
                        if (section !== "posts")
                          setProjectEvidenceSection(section);
                      }}
                    />
                    <KnowledgeLibrary
                      enabled={projectEvidenceOpen}
                      section={projectEvidenceSection}
                      targetDraftId={initialReviewDraftId}
                      key={`project-knowledge:${organizationId}`}
                      organizationId={organizationId}
                      repositories={data.repositories}
                      readOnly={readOnly}
                      demo={demo}
                      call={call}
                      onOpenImprovements={() => go("improvements")}
                    />
                  </details>
                  {demo && (
                    <div className="panel">
                      <h2>Demo Planner</h2>
                      <p>
                        Purpose: help people organize a small project. Audience:
                        first-time planners. Goal: a clear first useful result.
                        Non-goal: changing account or payment logic.
                      </p>
                      <span className="status">
                        Synthetic confirmed profile
                      </span>
                    </div>
                  )}
                </>
              )}
              {view === "proposals" && (
                <>
                  {data.proposals.length ? (
                    data.proposals.map((p) => (
                      <article className="panel" key={id(p)}>
                        <span className="status">{label(p.disposition)}</span>
                        {p.privateEvaluationOrigin?.kind ===
                          "private_evaluation_brief" && (
                          <span className="status">
                            Private evaluation focus
                          </span>
                        )}
                        {p.privateEvaluationOrigin?.kind ===
                          "private_source_variant" && (
                          <span className="status">
                            Private source result version{" "}
                            {p.privateEvaluationOrigin.version}
                          </span>
                        )}
                        <h2>{p.title}</h2>
                        <p>{p.detail?.currentProblem}</p>
                        <p>{label(p.review)}</p>
                        <Button
                          busy={busy}
                          onClick={() => {
                            setSelected(p);
                            setView("proposal");
                          }}
                        >
                          Review proposal
                        </Button>
                      </article>
                    ))
                  ) : (
                    <div className="empty">
                      <h2>No proposals to review.</h2>
                      <p>
                        Analyze a source and match it to a confirmed repository.
                        No useful match is a valid result.
                      </p>
                      {demo && (
                        <Button
                          busy={busy}
                          onClick={() => {
                            setSelected({
                              id: "demo-proposal",
                              title: "Preview a useful result before setup",
                              disposition: "relevant",
                              review: "unreviewed",
                              version: 1,
                              detail: {
                                currentProblem:
                                  "Demo Planner opens with an empty view.",
                                proposedChange:
                                  "Offer a reversible populated example.",
                                benefitHypothesis:
                                  "A first-time visitor may understand the product sooner.",
                                risks: [
                                  "Sample data could be mistaken for a saved project.",
                                ],
                                acceptanceCriteria: [
                                  "Sample remains labeled",
                                  "Start fresh removes the example",
                                ],
                              },
                            });
                            setView("proposal");
                          }}
                        >
                          Open synthetic proposal
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
              {view === "proposal" && selected && (
                <>
                  {!demo && selected.review === "accepted" && (
                    <OwnPlanTaskControls
                      organizationId={organizationId}
                      call={strictCall}
                      privateLibrary={data.privateLibrary === true}
                      proposal={{
                        id: id(selected),
                        title: selected.title,
                        version: selected.version,
                        review: selected.review,
                        privateEvaluationOrigin:
                          selected.privateEvaluationOrigin,
                      }}
                      repositories={data.repositories
                        .filter((repo) => id(repo) === selected.repositoryId)
                        .map((repo) => ({ id: id(repo), name: repo.fullName }))}
                      disabled={readOnly}
                      onComplete={async () => {
                        await refreshData();
                      }}
                    />
                  )}
                  <ProposalTrail
                    proposal={selected}
                    runs={data.runs.filter(
                      (r) => r.proposalId === id(selected),
                    )}
                  />
                  <span className="status">{label(selected.disposition)}</span>
                  {selected.privateEvaluationOrigin?.kind ===
                    "private_evaluation_brief" && (
                    <p className="notice">
                      Private evaluation focus. Review this personalized project
                      assessment before approving a plan or publication.
                    </p>
                  )}
                  {selected.privateEvaluationOrigin?.kind ===
                    "private_source_variant" && (
                    <p className="notice">
                      Private source result version{" "}
                      {selected.privateEvaluationOrigin.version}. This
                      assessment uses selected private ideas. Review it before
                      approving a plan or publication.
                    </p>
                  )}
                  {selected.reviewerCorrection && (
                    <p className="notice">
                      Reviewer correction:{" "}
                      {label(selected.reviewerCorrection.to)}. Original model
                      assessment: {label(selected.reviewerCorrection.from)}.
                      Reason: {selected.reviewerCorrection.reason}
                    </p>
                  )}
                  {!demo && (
                    <form
                      className="panel form-grid"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        await call("decide", {
                          id: id(selected),
                          version: selected.version,
                          decision: "accepted",
                          disposition: form.get("disposition"),
                          note: form.get("reason"),
                        });
                      }}
                    >
                      <h2>Review the assessment</h2>
                      <label>
                        Reviewer assessment
                        <ChoiceSelect
                          name="disposition"
                          defaultValue={selected.disposition}
                        >
                          {[
                            "relevant",
                            "no_fit",
                            "already_implemented",
                            "unsupported_claim",
                            "needs_context",
                            "defer",
                          ].map((value) => (
                            <option key={value} value={value}>
                              {label(value)}
                            </option>
                          ))}
                        </ChoiceSelect>
                      </label>
                      <label>
                        Evidence and reason for any correction
                        <textarea
                          name="reason"
                          maxLength={2000}
                          placeholder="Explain the source and repository evidence. Changing an assessment requires a reason."
                        />
                      </label>
                      <button className="primary" disabled={busy} type="submit">
                        Accept reviewed relevant proposal
                      </button>
                    </form>
                  )}

                  <section className="panel">
                    <h2>Why this project?</h2>
                    <p>{selected.detail?.currentProblem}</p>
                    <h3>Proposed change</h3>
                    <p>
                      {selected.detail?.proposedChange ??
                        "No code change recommended."}
                    </p>
                    <h3>Expected benefit, as a hypothesis</h3>
                    <p>
                      {selected.detail?.benefitHypothesis ??
                        "No benefit claim."}
                    </p>
                    <h3>Risks and reasons to reject</h3>
                    <ul>
                      {selected.detail?.risks?.map((s: string) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                    <h3>Acceptance criteria</h3>
                    <ul>
                      {selected.detail?.acceptanceCriteria?.map((s: string) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                    <details>
                      <summary>Source and repository evidence</summary>
                      <pre>
                        {JSON.stringify(
                          {
                            source: selected.detail?.sourceEvidence,
                            repository: selected.detail?.repositoryEvidence,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                    <div className="row wrap">
                      {["rejected", "deferred", "accepted"].map((d) => (
                        <Button
                          busy={busy}
                          key={d}
                          primary={d === "accepted"}
                          disabled={
                            d === "accepted" &&
                            selected.disposition !== "relevant"
                          }
                          onClick={async () => {
                            await call("decide", {
                              id: id(selected),
                              version: selected.version,
                              decision: d,
                              note: "",
                            });
                            if (demo) setSelected({ ...selected, review: d });
                          }}
                        >
                          {d === "accepted"
                            ? "Accept proposal"
                            : d === "rejected"
                              ? "Reject"
                              : "Defer"}
                        </Button>
                      ))}
                    </div>
                  </section>
                  <section className="panel">
                    <h2>Review and edit the plan</h2>
                    <a
                      href="/help/evaluate-an-idea-for-a-project"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Project decision and plan help
                    </a>
                    <Button
                      busy={busy}
                      disabled={selected.review !== "accepted"}
                      onClick={() =>
                        call("draftPlan", {
                          id: id(selected),
                          version: selected.version,
                          maxCredits: 10,
                        })
                      }
                    >
                      Draft an editable plan, maximum 10 credits
                    </Button>
                    {selected.planDraft &&
                      selected.planDraftVersion === selected.version && (
                        <details>
                          <summary>Unconfirmed AI plan draft</summary>
                          <pre>
                            {JSON.stringify(selected.planDraft, null, 2)}
                          </pre>
                          <Button
                            busy={busy}
                            onClick={() =>
                              setPlanText(
                                JSON.stringify(selected.planDraft, null, 2),
                              )
                            }
                          >
                            Copy draft into the editable plan
                          </Button>
                          <p>
                            Review and save a new version before execution. This
                            draft grants no coding permission.
                          </p>
                        </details>
                      )}
                    <p>
                      Acceptance does not authorize execution. Files marked
                      existing must appear in the repository snapshot. Saving
                      creates a new immutable plan hash.
                    </p>
                    <PlanEditor
                      value={planText}
                      onChange={setPlanText}
                      disabled={busy || readOnly}
                    />
                    <Button
                      busy={busy}
                      disabled={selected.review !== "accepted"}
                      onClick={async () => {
                        try {
                          await call("editPlan", {
                            id: id(selected),
                            version: selected.version,
                            plan: reviewedPlan(planText),
                          });
                        } catch {
                          setNotice(
                            "Add a scope, at least one file, implementation step and check. Keep all required sections and valid JSON.",
                          );
                        }
                      }}
                    >
                      Save new plan version
                    </Button>
                    <Button
                      busy={busy}
                      onClick={() => {
                        downloadText(
                          "vibescroller-plan.json",
                          planText,
                          "application/json",
                        );
                        if (!demo)
                          journey.planExported(
                            `${id(selected)}:${selected.version}:${selected.updatedAt}`,
                            "json",
                          );
                      }}
                    >
                      Export plan
                    </Button>
                  </section>
                  <ExecutionApproval
                    proposal={selected}
                    call={call}
                    routes={data.customerRoutes}
                    usage={data.usage}
                    busy={busy}
                  />
                </>
              )}
              {view === "runs" && (
                <>
                  {data.runs.length ? (
                    data.runs.map((r) => (
                      <RunCard
                        key={id(r)}
                        run={r}
                        title={
                          data.proposals.find(
                            (proposal) => id(proposal) === r.proposalId,
                          )?.title
                        }
                        call={call}
                        busy={busy}
                        readOnly={readOnly}
                      />
                    ))
                  ) : (
                    <div className="empty">
                      <h2>No authorized runs yet.</h2>
                      <p>
                        Approve a reviewed plan with a specific executor and
                        funding route. An offline laptop never triggers a cloud
                        charge.
                      </p>
                    </div>
                  )}
                </>
              )}
              {view === "inbox" && (
                <>
                  <p>
                    Notifications use safe previews. Telegram is planned for
                    later. Messages never approve execution.
                  </p>
                  {data.notifications.length ? (
                    data.notifications.map((n) => (
                      <article className="panel" key={id(n)}>
                        <p>{n.message}</p>
                        <small>{new Date(n.createdAt).toLocaleString()}</small>
                      </article>
                    ))
                  ) : (
                    <div className="empty">
                      <h2>You're caught up.</h2>
                      <p>
                        Processing and review notifications will appear here.
                      </p>
                    </div>
                  )}
                  <Button
                    busy={busy}
                    onClick={async () => {
                      if (!("Notification" in window)) {
                        setNotice(
                          "This browser does not support desktop notifications. Use the inbox.",
                        );
                        return;
                      }
                      const result = await Notification.requestPermission();
                      setNotice(
                        result === "granted"
                          ? "Browser notifications allowed. Delivery still requires an open application or a configured push service."
                          : "Browser notifications remain off. The inbox is available.",
                      );
                    }}
                  >
                    Enable browser notification permission
                  </Button>
                  <CookieSettings className="secondary" />
                  <Button
                    busy={busy}
                    onClick={() =>
                      call("preferences", {
                        organizationId,
                        email: true,
                        telegram: false,
                        analytics: false,
                        legalVersion: policyRelease.id,
                      })
                    }
                  >
                    Request email notifications
                  </Button>
                  <p>
                    Email stays unavailable until a verified sender is
                    connected.
                  </p>
                </>
              )}
              {view === "usage" && (
                <UsageSummary
                  usage={
                    data.workspaceSlice === "usage"
                      ? data.usage
                      : usageOverview(data.usage)
                  }
                  organizationId={organizationId}
                />
              )}
              {view === "connections" && (
                <>
                  <AssistantConnections
                    key={organizationId}
                    organizationId={organizationId}
                    call={call}
                    readOnly={readOnly}
                    demo={demo}
                  />
                  <section className="panel">
                    <h2>Use your plan for local analysis</h2>
                    <p>
                      Prefer your own allowance for eligible AI requests and
                      keep VibeScroll inference credits for other work. ChatGPT
                      limits still apply; transcription, storage and cloud
                      execution have separate costs.
                    </p>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: ".65rem",
                        minHeight: 44,
                      }}
                    >
                      <input
                        type="checkbox"
                        style={{ width: 18, height: 18, flexShrink: 0 }}
                        checked={data.aiPreference?.preferChatGPTPlan ?? false}
                        disabled={demo || busy}
                        onChange={async (event) => {
                          const preferChatGPTPlan = event.target.checked;
                          const result = await call("aiPreference", {
                            organizationId,
                            preferChatGPTPlan,
                          });
                          if (result)
                            setData((current) => ({
                              ...current,
                              aiPreference: {
                                ...current.aiPreference,
                                preferChatGPTPlan,
                                hostedStatus: "awaiting_commercial_access",
                                active: false,
                              },
                            }));
                        }}
                      />
                      Prefer my ChatGPT plan when available
                    </label>
                    <p className="notice" style={{ textAlign: "left" }}>
                      Hosted subscription-funded analysis is awaiting OpenAI
                      commercial access. This is separate from assistant library
                      access. Saving this preference does not connect an
                      account, grant consent, or change the funding route of a
                      current task.
                    </p>
                    <p>
                      Personal alpha accounts can pair a laptop and approve text
                      and video analysis from the source screen. Audio is
                      transcribed on that laptop; sampled frames and text use
                      your connected ChatGPT account. Coding requires verified
                      isolation and separate approval.
                    </p>
                    <a
                      href="https://chatgpt.com/settings/usage"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Manage ChatGPT app access and usage
                    </a>
                  </section>
                  <div className="panel">
                    <h2>GitHub</h2>
                    <p>
                      Install the VibeScroller GitHub App on selected
                      repositories. Administration and workflow write are not
                      requested by default.
                    </p>
                    <Button busy={busy} onClick={() => go("projects")}>
                      Manage selected repositories
                    </Button>
                    {data.connections?.some(
                      (connection) =>
                        connection.provider === "github" &&
                        connection.status === "connected",
                    ) ? (
                      <Button
                        busy={busy}
                        onClick={() =>
                          call("revoke", { organizationId, provider: "github" })
                        }
                      >
                        Disconnect GitHub
                      </Button>
                    ) : (
                      <a
                        className="secondary"
                        href={`/api/github/connect?org=${organizationId}`}
                      >
                        Link GitHub account
                      </a>
                    )}
                  </div>
                  <form
                    className="panel"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      call("saveKey", {
                        organizationId,
                        secret: f.get("secret"),
                      });
                      e.currentTarget.reset();
                    }}
                  >
                    <h2>Your OpenAI API credential</h2>
                    <p>
                      Provider charges are separate. The server encrypts this
                      credential; the browser does not retain it. Saving does
                      not activate execution. Sign in again before saving or
                      testing.
                    </p>
                    <p>
                      Status:{" "}
                      {label(data.customerRoutes?.status ?? "disconnected")}.{" "}
                      {data.customerRoutes?.models.length ?? 0} reviewed models
                      available.
                    </p>
                    <label>
                      API key
                      <input
                        name="secret"
                        type="password"
                        autoComplete="off"
                        required
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Encrypt and save credential
                    </button>
                    <Button
                      busy={busy}
                      onClick={() => call("testKey", { organizationId })}
                    >
                      Verify credential with a model-list request
                    </Button>
                    <p className="fine">
                      Verification sends no inference request. Coding requires a
                      separate USD provider ceiling and platform compute
                      allowance. No reviewed available model means this route
                      stays unavailable.
                    </p>
                    <Button
                      busy={busy}
                      onClick={() =>
                        call("revoke", { organizationId, provider: "openai" })
                      }
                    >
                      Revoke credential
                    </Button>
                  </form>
                  <div className="panel">
                    <h2>Telegram</h2>
                    <p>
                      Planned for later. Use the web inbox now. Setup needs a
                      BotFather bot, secret webhook, numeric-user pairing and
                      replay tests.
                    </p>
                  </div>
                </>
              )}
              {view === "runners" && (
                <>
                  <div className="panel">
                    <h2>Optional laptop execution</h2>
                    <p>
                      Pair a named computer, confirm its fingerprint, map
                      repositories, and verify Windows isolation. Official Codex
                      app-server keeps authentication on the computer. No
                      inbound port is required.
                    </p>
                    <p className="notice">
                      Execution is blocked until its isolation tests pass. A
                      worktree alone is not a sandbox.
                    </p>
                    <Link href="/docs">Read runner setup</Link>
                  </div>
                  {!readOnly && (
                    <section className="panel">
                      <h2>Pair this computer</h2>
                      <p>
                        Run the documented local pairing command, then paste its
                        public request here. Check its fingerprint against the
                        terminal before confirming. A fresh sign-in is required.
                      </p>
                      <form
                        className="form-grid"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            const value = JSON.parse(
                              String(
                                new FormData(e.currentTarget).get("request") ??
                                  "",
                              ),
                            );
                            if (
                              Object.keys(value).sort().join(",") !==
                                "codeHash,credentialHash,fingerprint,name,workspaceId" ||
                              typeof value.name !== "string" ||
                              value.workspaceId !== organizationId ||
                              ![
                                value.codeHash,
                                value.credentialHash,
                                value.fingerprint,
                              ].every(
                                (v) =>
                                  typeof v === "string" &&
                                  /^[a-f0-9]{64}$/.test(v),
                              )
                            )
                              throw new Error(
                                "Invalid public pairing request.",
                              );
                            const existing = data.devices?.find(
                              (d) =>
                                d.personalOwned &&
                                d.pairingActive &&
                                d.fingerprint === value.fingerprint &&
                                d.name === value.name,
                            );
                            const deviceId = existing
                              ? id(existing)
                              : await call("startDevice", {
                                  organizationId,
                                  name: value.name,
                                  fingerprint: value.fingerprint,
                                  codeHash: value.codeHash,
                                });
                            if (deviceId)
                              setPairing({
                                id: deviceId,
                                name: value.name,
                                fingerprint: value.fingerprint,
                                credentialHash: value.credentialHash,
                              });
                          } catch {
                            setNotice(
                              "Paste the public request generated by your runner. Do not paste keys or login tokens.",
                            );
                          }
                        }}
                      >
                        <label>
                          Public pairing request
                          <textarea
                            name="request"
                            required
                            maxLength={1200}
                            rows={5}
                          />
                        </label>
                        <button className="secondary" disabled={busy}>
                          Review device request
                        </button>
                      </form>
                      {pairing && (
                        <div>
                          <h3>Confirm {pairing.name}</h3>
                          <p className="code-label">
                            Fingerprint {pairing.fingerprint}
                          </p>
                          <p>
                            Confirm only if this fingerprint matches the
                            computer you control. Pairing enables communication.
                            Coding still requires separately verified isolation
                            and an approved plan.
                          </p>
                          <Button
                            busy={busy}
                            onClick={async () => {
                              const result = await call("approveDevice", {
                                id: pairing.id,
                                fingerprint: pairing.fingerprint,
                                credentialHash: pairing.credentialHash,
                              });
                              if (result !== undefined) setPairing(null);
                            }}
                          >
                            Confirm matching computer
                          </Button>
                        </div>
                      )}
                    </section>
                  )}
                  {data.devices?.map((d) => (
                    <article className="panel" key={id(d)}>
                      <h3>{d.name}</h3>
                      <p>
                        {d.state} · Fingerprint {d.fingerprint}
                      </p>
                      <Button
                        busy={busy}
                        onClick={() => call("revokeDevice", { id: id(d) })}
                      >
                        Revoke computer
                      </Button>
                    </article>
                  ))}
                </>
              )}
              {view === "privacy" && (
                <>
                  <MotionPreference control />
                  <div className="panel">
                    <h2>Your content and preferences</h2>
                    <p>
                      Sources, summaries and project context belong to your
                      workspace. Original media expires within the configured
                      retention window. Source deletion blocks access
                      immediately and schedules cleanup.
                    </p>
                    <a
                      className="secondary"
                      href={`/app/${organizationId}/content-export`}
                    >
                      Export workspace content
                    </a>
                    <Link
                      prefetch={false}
                      className="secondary"
                      href={`/app/${organizationId}/settings`}
                    >
                      Delete workspace
                    </Link>
                    <Link
                      prefetch={false}
                      className="secondary"
                      href="/account"
                    >
                      Account export & deletion
                    </Link>
                  </div>
                  <CookieSettings className="secondary" />
                  <Button
                    busy={busy}
                    onClick={() =>
                      call("preferences", {
                        organizationId,
                        email: false,
                        telegram: false,
                        analytics: false,
                        legalVersion: policyRelease.id,
                      })
                    }
                  >
                    Turn off optional notifications and analytics
                  </Button>
                  <p>
                    No private service-worker cache or cross-workspace content
                    reuse.
                  </p>
                </>
              )}
              {view === "billing" && (
                <>
                  <div className="panel">
                    <h2>Live checkout is disabled</h2>
                    <p>
                      Tax mode: pending evidence. The intended exemption
                      strategy is not a claim about the company's registration.
                      Ordinary VAT, special registration and destination
                      treatment need matching official records.
                    </p>
                    <Link className="secondary" href="/pricing">
                      View six catalogue prices and allowances
                    </Link>
                    <Link
                      prefetch={false}
                      className="secondary"
                      href={`/app/${organizationId}/billing`}
                    >
                      Billing portal and subscription status
                    </Link>
                  </div>
                  <p>
                    Cancellation, refunds and invoice compliance remain
                    server-authorized workflows. A checkout return does not
                    grant credits.
                  </p>
                </>
              )}
              {view === "menu" && (
                <section className="panel" aria-label="All application pages">
                  <h2>Account</h2>
                  <Link prefetch={false} href="/account">
                    Profile and sign out
                  </Link>
                  <AppTheme control />
                  <MotionPreference control />
                  <nav aria-label="All mobile pages" className="form-grid">
                    {nav.slice(3).map(([key, title, Icon]) => (
                      <button key={key} onClick={() => go(key)}>
                        <Icon size={20} aria-hidden="true" />
                        {title}
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    ))}
                  </nav>
                </section>
              )}
            </>
          )}
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.slice(0, 2).map(([key, title, Icon]) => (
            <button
              className={mobileNavigationGroup(view) === key ? "active" : ""}
              aria-current={
                mobileNavigationGroup(view) === key ? "page" : undefined
              }
              key={key}
              onClick={() => go(key)}
            >
              <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
              {title}
            </button>
          ))}
          <button
            type="button"
            className="mobile-save"
            disabled={(readOnly && !demo) || busy || !accessAvailable}
            onClick={() => {
              void openCapture();
            }}
          >
            <Plus size={20} aria-hidden="true" />
            <span>Save</span>
          </button>
          <button
            aria-current={
              mobileNavigationGroup(view) === "projects" ? "page" : undefined
            }
            className={
              mobileNavigationGroup(view) === "projects" ? "active" : ""
            }
            onClick={() => go("projects")}
          >
            <GitBranch size={20} aria-hidden="true" />
            Projects
          </button>
          <AccountMenu
            go={go}
            demo={demo}
            profile={profile}
            mobile
            active={mobileNavigationGroup(view) === "account"}
          />
        </nav>
      </div>
      {captureOpen && (
        <div className="modal-backdrop">
          <motion.dialog
            initial={
              interfaceMotion && pointerInput.current
                ? { opacity: 0, y: 8 }
                : false
            }
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: interfaceMotion ? 0.18 : 0 }}
            ref={captureDialog}
            aria-labelledby="capture-title"
            className="capture-modal"
          >
            <div className="row spread">
              <h2 id="capture-title">Add to your library</h2>
              <Button busy={busy} onClick={() => setCaptureOpen(false)}>
                Close
              </Button>
            </div>
            <CaptureForm
              devices={data.devices ?? []}
              personalEnabled={data.aiPreference?.personalAlphaEnabled}
              linkAnalysisEnabled={data.aiPreference?.linkAnalysisEnabled}
              cloudEnabled={data.aiPreference?.cloudAnalysisEnabled}
              sharedDraft={sharedDraft}
              demo={demo}
              organizationId={organizationId}
              call={call}
              orderedCall={strictCall}
              onDone={(sourceId?: string, savedOnly = false) => {
                setCaptureOpen(false);
                setSharedDraft("");
                if (sourceId)
                  findSource({
                    _id: sourceId,
                    title: "New upload",
                    state: savedOnly ? "saved" : "processing",
                    coverage: "metadata_only",
                  });
              }}
            />
          </motion.dialog>
        </div>
      )}
    </div>
  );
}
// Called only while submitting an approval. UI expiry uses the state timer below.
function checkCaptureCatalogueAtSubmission(expiresAt: number) {
  if (expiresAt <= Date.now())
    throw new Error(
      "Account choices expired. Refresh before approving analysis.",
    );
}

export function CaptureForm({
  demo,
  organizationId,
  call,
  orderedCall = call,
  onDone,
  existingSourceId,
  existingGeneration,
  devices = [],
  personalEnabled = false,
  linkAnalysisEnabled = false,
  cloudEnabled = false,
  sharedDraft,
}: any) {
  const [kind, setKind] = useState(existingSourceId ? "upload" : "url");
  const [saving, setSaving] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [analysisRoute, setAnalysisRoute] = useState(
    personalEnabled ? "personal" : "cloud",
  );
  const eligible = devices.filter(
    (d: any) => d.personalOwned && d.state === "paired" && d.personalOnline,
  );
  const [chosenDevice, setChosenDevice] = useState(
    eligible.length === 1 ? id(eligible[0]) : "",
  );
  const computer = eligible.find((d: any) => id(d) === chosenDevice);
  const [chosenModel, setChosenModel] = useState("");
  const [chosenEffort, setChosenEffort] = useState("");
  const [captureCatalogueTime, setCaptureCatalogueTime] = useState(() =>
    Date.now(),
  );
  const captureCatalogueExpiry = Math.min(
    computer?.subscriptionCapabilities?.expiresAt ?? 0,
    computer?.subscriptionCapabilities?.sessionExpiresAt ?? 0,
  );
  useEffect(() => {
    if (!captureCatalogueExpiry) return;
    const timer = setTimeout(
      () => setCaptureCatalogueTime(Date.now()),
      Math.max(1, captureCatalogueExpiry - Date.now() + 1),
    );
    return () => clearTimeout(timer);
  }, [captureCatalogueExpiry]);
  const captureModels =
    captureCatalogueExpiry > captureCatalogueTime
      ? computer.subscriptionCapabilities.value.models.filter(
          (entry: any) =>
            entry.inputModalities.includes("text") &&
            entry.inputModalities.includes("image"),
        )
      : [];
  const captureModel = captureModels.find(
    (entry: any) => entry.slug === chosenModel,
  );
  const effectiveModel = captureModel?.slug ?? "";
  const captureEfforts: string[] = captureModel?.reasoningEfforts ?? [];
  const effectiveEffort = captureEfforts.includes(chosenEffort)
    ? chosenEffort
    : "";
  const personalAutomatic =
    personalEnabled &&
    analysisRoute === "personal" &&
    autoAnalyze &&
    (kind === "upload" ||
      (linkAnalysisEnabled && ["url", "import"].includes(kind)));
  const cloudAutomatic =
    analysisRoute === "cloud" &&
    cloudEnabled &&
    autoAnalyze &&
    (kind === "upload" ||
      kind === "text" ||
      (linkAnalysisEnabled && ["url", "import"].includes(kind)));
  const automatic = personalAutomatic || cloudAutomatic;
  const approval = {
    deviceId: chosenDevice,
    model: effectiveModel,
    effort: effectiveEffort,
    useOwnPlan: true,
    maxComputeCredits: 10,
  };
  const checkAutomatic = async (f: FormData) => {
    if (cloudAutomatic && f.get("cloudCredits") !== "on")
      throw new Error("Approve the processing-credit maximum before analysis.");
    if (!personalAutomatic) return;
    if (
      !computer ||
      !effectiveModel ||
      !effectiveEffort ||
      f.get("ownPlan") !== "on"
    )
      throw new Error(
        "Choose your online computer and approve using your ChatGPT plan.",
      );
    checkCaptureCatalogueAtSubmission(captureCatalogueExpiry);
    const fresh = await call("checkPersonalSession", { organizationId });
    if (fresh !== true)
      throw new Error(
        "Sign in again before approving analysis. Your import preview is preserved.",
      );
  };
  const [manifest, setManifest] = useState<any>(null);
  const [importError, setImportError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importOffset, setImportOffset] = useState(0);
  const importAbort = useRef<AbortController | null>(null);
  useEffect(() => () => importAbort.current?.abort(), []);
  const sourceTypeChoice = (
    <label>
      Source type
      <ChoiceSelect disabled={importBusy} value={kind} onValueChange={setKind}>
        {!existingSourceId && <option value="url">Video URL</option>}
        {!existingSourceId && (
          <option value="import">Instagram export or link import</option>
        )}
        {!existingSourceId && (
          <option value="ordered">Images, videos or carousel</option>
        )}
        <option value="upload">Single video or audio</option>
        <option value="text">Supplied transcript</option>
      </ChoiceSelect>
    </label>
  );
  if (kind === "ordered")
    return (
      <div className="form-grid">
        {sourceTypeChoice}
        <OrderedFileUpload
          key={organizationId}
          organizationId={organizationId}
          call={orderedCall}
          demo={demo}
          onDone={(sourceId) => onDone(sourceId, true)}
        />
      </div>
    );
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (demo) {
          await call("capture", { synthetic: true });
          onDone();
          return;
        }
        if (kind === "import") {
          if (!preview || importBusy || previewBusy) return;
          setImportBusy(true);
          try {
            setImportError("");
            const { importBatch } =
              await import("../../../packages/instagram-import");
            await checkAutomatic(f);
            const batch = importBatch(
              preview.links,
              importOffset,
              automatic ? 5 : 500,
            );
            if (!batch.count) return;
            const result = await call("importLinks", {
              organizationId,
              key: crypto.randomUUID(),
              format: "json",
              text: batch.text,
              rightsAttested: f.get("rights") === "on",
            });
            if (result) {
              setManifest((previous: any) => ({
                ...result,
                accepted: (previous?.accepted ?? 0) + result.accepted,
                duplicate: (previous?.duplicate ?? 0) + result.duplicate,
                invalid: (previous?.invalid ?? 0) + result.invalid,
                unsupported: (previous?.unsupported ?? 0) + result.unsupported,
                waiting: (previous?.waiting ?? 0) + result.waiting,
                entries: [
                  ...(previous?.entries ?? []),
                  ...result.entries.map((entry: any) => ({
                    ...entry,
                    row: importOffset + entry.row,
                  })),
                ],
              }));
              setImportOffset(importOffset + batch.count);
              if (automatic) {
                const sources = result.entries
                  .filter((entry: any) => entry.accepted && entry.sourceId)
                  .map((entry: any) => ({ id: entry.sourceId, generation: 0 }));
                if (sources.length) {
                  const queued = personalAutomatic
                    ? await call("approvePersonalBatch", {
                        ...approval,
                        sources,
                      })
                    : await call("processBatch", {
                        ids: sources.map((source: any) => source.id),
                        maxCredits: 10,
                      });
                  if (queued === undefined)
                    throw new Error(
                      "Your links were saved. Analysis was not approved; open their status to retry.",
                    );
                }
              }
            }
          } catch (error) {
            setImportError(
              error instanceof Error ? error.message : "Import failed.",
            );
          } finally {
            setImportBusy(false);
          }
          return;
        }
        if (kind === "upload") {
          if (saving) return;
          setSaving(true);
          setImportError("");
          try {
            await checkAutomatic(f);
            const file = f.get("file") as File;
            if (!file?.size || file.size > 250000000)
              throw new Error("Choose a video or audio file up to 250 MB.");
            if (
              personalAutomatic &&
              (!computer || !effectiveModel || f.get("ownPlan") !== "on")
            )
              throw new Error(
                "Choose your online computer and approve using your ChatGPT plan.",
              );
            if (personalAutomatic) {
              const fresh = await call("checkPersonalSession", {
                organizationId,
              });
              if (fresh !== true) {
                onDone();
                return;
              }
            }
            const grantResponse = await fetch("/api/uploads/grant", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                organizationId,
                type: file.type,
                size: file.size,
              }),
            });
            const g = await grantResponse.json();
            if (!grantResponse.ok || g.error)
              throw new Error(g.error || "Upload permission failed.");
            const uploaded = await fetch(g.url, {
              method: "PUT",
              headers: { "Content-Type": file.type },
              body: file,
            });
            if (!uploaded.ok)
              throw new Error("Upload failed. No source was attached.");
            const doneResponse = await fetch("/api/uploads/complete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ organizationId, key: g.key }),
            });
            const done = await doneResponse.json();
            if (!doneResponse.ok || done.error)
              throw new Error(done.error || "Upload verification failed.");
            let sourceId = existingSourceId;
            if (existingSourceId) {
              const attached = await call("attachSource", {
                id: existingSourceId,
                objectKey: g.key,
                rightsAttested: f.get("rights") === "on",
              });
              if (attached === undefined) return;
            } else
              sourceId = await call("capture", {
                organizationId,
                key: crypto.randomUUID(),
                kind,
                title: String(f.get("title") || file.name).slice(0, 160),
                objectKey: g.key,
                rightsAttested: f.get("rights") === "on",
              });
            if (!sourceId) return;
            if (cloudAutomatic) {
              if (f.get("cloudCredits") !== "on")
                throw new Error(
                  "Approve the processing-credit maximum before analysis.",
                );
              await call("process", { id: sourceId, maxCredits: 10 });
            }
            if (personalAutomatic) {
              const approved = await call("approvePersonalAnalysis", {
                id: sourceId,
                generation: existingSourceId ? existingGeneration + 1 : 0,
                deviceId: chosenDevice,
                model: effectiveModel,
                effort: effectiveEffort,
                useOwnPlan: true,
                maxComputeCredits: 10,
              });
              if (approved === undefined) {
                // Open the saved source instead of offering a duplicate upload.
                onDone(sourceId);
                return;
              }
            }
            onDone(sourceId);
          } catch (error) {
            setImportError(
              error instanceof Error
                ? error.message
                : "Upload failed. Try again.",
            );
          } finally {
            setSaving(false);
          }
          return;
        }
        if (saving) return;
        setSaving(true);
        setImportError("");
        try {
          await checkAutomatic(f);
          let sourceId = existingSourceId;
          if (existingSourceId)
            await call("attachSource", {
              id: existingSourceId,
              text: f.get("text"),
              rightsAttested: f.get("rights") === "on",
            });
          else
            sourceId = await call("capture", {
              organizationId,
              key: crypto.randomUUID(),
              kind,
              title: String(f.get("title") || "Saved video"),
              ...(kind === "url"
                ? { url: f.get("url") }
                : { text: f.get("text") }),
              rightsAttested: f.get("rights") === "on",
            });
          if (!sourceId) return;
          if (automatic) {
            const queued = personalAutomatic
              ? await call("approvePersonalBatch", {
                  ...approval,
                  sources: [
                    {
                      id: sourceId,
                      generation: existingSourceId ? existingGeneration + 1 : 0,
                    },
                  ],
                })
              : await call("process", { id: sourceId, maxCredits: 10 });
            if (queued === undefined) {
              onDone(sourceId);
              return;
            }
          }
          onDone(sourceId);
        } catch (error) {
          setImportError(
            error instanceof Error
              ? error.message
              : "The source could not be saved.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      {sourceTypeChoice}
      {!existingSourceId && kind !== "import" && (
        <label>
          Title
          <input
            name="title"
            required={kind === "text"}
            maxLength={160}
            placeholder={
              kind === "upload"
                ? "Uses the filename if empty"
                : "Optional title"
            }
          />
        </label>
      )}
      {kind === "import" ? (
        <div className="form-grid">
          <label>
            Instagram ZIP, Saved JSON or HTML, or CSV links
            <input
              name="import"
              type="file"
              accept=".zip,.csv,.json,.html,.htm,application/zip,text/csv,application/json,text/html"
              required
              disabled={importBusy}
              onChange={async (event) => {
                importAbort.current?.abort();
                const controller = new AbortController();
                importAbort.current = controller;
                setPreview(null);
                setManifest(null);
                setImportOffset(0);
                setImportError("");
                const file = event.currentTarget.files?.[0];
                if (!file) {
                  setPreviewBusy(false);
                  return;
                }
                setPreviewBusy(true);
                try {
                  const { previewLinkFile, SAVED_TEXT_LIMIT } =
                    await import("../../../packages/instagram-import");
                  let next: ImportPreview;
                  if (/\.zip$/i.test(file.name)) {
                    const { previewInstagramZip } =
                      await import("../../../packages/instagram-zip");
                    next = await previewInstagramZip(file, controller.signal);
                  } else {
                    if (file.size > SAVED_TEXT_LIMIT)
                      throw new Error(
                        "Choose Saved metadata within 8 MB. For a larger account export, select its ZIP.",
                      );
                    next = previewLinkFile(
                      new TextDecoder("utf-8", { fatal: true }).decode(
                        await file.arrayBuffer(),
                      ),
                      file.name,
                    );
                  }
                  if (!controller.signal.aborted) {
                    setPreview(next);
                    if (!demo)
                      track("import_previewed", {
                        format: next.format,
                        count: next.links.length,
                      });
                  }
                } catch (error) {
                  if (!controller.signal.aborted)
                    setImportError(
                      error instanceof Error
                        ? error.message
                        : "Cannot read this export.",
                    );
                } finally {
                  if (!controller.signal.aborted) setPreviewBusy(false);
                }
              }}
            />
            <span className="fine">
              The export stays on this device. Only Saved links selected for
              import are sent to your workspace. ZIPs can be up to 3 GB; Saved
              metadata up to 8 MB per file. JSON is preferred. Messages and
              contacts are excluded.
            </span>
          </label>
          {previewBusy && (
            <output>Reading Saved metadata on this device...</output>
          )}
          {preview && (
            <section aria-label="Import preview">
              <h3>Review your import</h3>
              <p>
                {preview.format}: {preview.rows.length} records,{" "}
                {preview.links.length} distinct valid links,{" "}
                {preview.duplicates} repeated links, {preview.invalid} invalid,{" "}
                {preview.unsupported} unsupported.
              </p>
              <p>
                {preview.reels} Reel links; {preview.posts} post links with
                unverified media type. An export does not establish video access
                or complete Saved history. HTML dates are left unknown.
              </p>
              <p className="fine">
                Up to 500 links per batch, within your workspace allowance.{" "}
                {importOffset} of {preview.links.length} links submitted. Saving
                links uses no analysis credits. Permitted media or a transcript
                is still needed before analysis.
              </p>
              <ol>
                {preview.links
                  .slice(importOffset, importOffset + 10)
                  .map((link) => (
                    <li key={link.url}>
                      {link.title || "Saved Instagram link"}
                      <br />
                      <span className="fine">{link.url}</span>
                    </li>
                  ))}
              </ol>
            </section>
          )}
        </div>
      ) : kind === "url" ? (
        <label>
          Source URL
          <input
            name="url"
            type="url"
            defaultValue={sharedDraft ?? ""}
            placeholder="https://..."
            required
          />
        </label>
      ) : kind === "text" ? (
        <label>
          Original supplied text
          <textarea name="text" rows={7} required maxLength={60000} />
        </label>
      ) : (
        <label>
          Video or audio, up to 250 MB and 10 minutes
          <input
            name="file"
            type="file"
            accept="video/mp4,video/webm,audio/mpeg,audio/wav"
            required
          />
        </label>
      )}
      <label className="check">
        <input name="rights" type="checkbox" required />I may submit this
        content for processing
      </label>
      {personalEnabled && cloudEnabled && (
        <label htmlFor="analysis-provider-choice">
          Analysis provider
          <ChoiceSelect
            id="analysis-provider-choice"
            value={analysisRoute}
            onValueChange={(value) => setAnalysisRoute(value)}
          >
            <option value="personal">My ChatGPT plan · paired laptop</option>
            <option value="cloud">Cloud processing · app credits</option>
          </ChoiceSelect>
        </label>
      )}
      {personalEnabled &&
        analysisRoute === "personal" &&
        (kind === "upload" ||
          (linkAnalysisEnabled && ["url", "import"].includes(kind))) && (
          <section
            className="upload-analysis form-grid"
            aria-label="Automatic analysis"
          >
            <label className="check">
              <input
                type="checkbox"
                checked={autoAnalyze}
                onChange={(e) => setAutoAnalyze(e.target.checked)}
              />
              Transcribe and analyze automatically
            </label>
            {autoAnalyze && (
              <>
                <label>
                  Computer
                  <ChoiceSelect
                    value={chosenDevice}
                    onValueChange={(value) => {
                      setChosenDevice(value);
                      setChosenModel("");
                      setChosenEffort("");
                    }}
                  >
                    <option value="">Choose an online computer</option>
                    {eligible.map((d: any) => (
                      <option key={id(d)} value={id(d)}>
                        {d.name}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
                <label>
                  ChatGPT model
                  <ChoiceSelect
                    value={effectiveModel}
                    onValueChange={(value) => {
                      setChosenModel(value);
                      setChosenEffort("");
                    }}
                  >
                    <option value="">
                      Choose an available image-capable model
                    </option>
                    {captureModels.map((m: any) => (
                      <option key={m.slug} value={m.slug}>
                        {m.displayName}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
                <label>
                  Reasoning effort
                  <ChoiceSelect
                    value={effectiveEffort}
                    disabled={!captureModel}
                    onValueChange={setChosenEffort}
                  >
                    <option value="">Choose an available effort</option>
                    {captureEfforts.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
                <label className="check">
                  <input
                    key={`${chosenDevice}:${effectiveModel}:${effectiveEffort}:${computer?.subscriptionCapabilities?.hash ?? ""}`}
                    name="ownPlan"
                    type="checkbox"
                    required
                    disabled={!effectiveModel || !effectiveEffort}
                  />
                  Use my ChatGPT plan with the selected model and reasoning
                  effort. Reserve up to 10 compute credits per video
                  {kind === "import" ? ", up to five videos per batch" : ""}.
                </label>
                {!captureModels.length && (
                  <p className="fine">
                    Current account choices are unavailable or expired. Refresh
                    account status or save without automatic analysis.
                  </p>
                )}
                <p className="fine">
                  Audio is transcribed locally on your laptop. Sampled frames
                  and the transcript go to your connected OpenAI account. No
                  paid AI fallback.
                </p>
              </>
            )}
          </section>
        )}
      {analysisRoute === "cloud" &&
        cloudEnabled &&
        (kind === "upload" ||
          kind === "text" ||
          (linkAnalysisEnabled && ["url", "import"].includes(kind))) && (
          <section
            className="upload-analysis form-grid"
            aria-label="Automatic cloud analysis"
          >
            <label className="check">
              <input
                type="checkbox"
                checked={autoAnalyze}
                onChange={(e) => setAutoAnalyze(e.target.checked)}
              />
              Transcribe and analyze automatically
            </label>
            {autoAnalyze && (
              <label className="check">
                <input name="cloudCredits" type="checkbox" required />
                Use cloud processing, up to 10 credits per source
                {kind === "import" ? ", up to five sources per batch" : ""}. No
                personal-plan or paid AI fallback.
              </label>
            )}
          </section>
        )}
      <p className="fine">
        {cloudAutomatic
          ? "Processing continues in the background. Public links are retrieved when the platform permits access."
          : automatic
            ? "Keep your paired laptop on until analysis finishes. Public links are retrieved when the platform permits access."
            : "Saving does not start analysis. Supplied text has no implied audio or visual coverage."}
      </p>
      <button
        className="primary"
        disabled={
          saving ||
          (kind === "import" &&
            (previewBusy ||
              importBusy ||
              !preview?.links.length ||
              importOffset >= preview.links.length))
        }
      >
        {demo
          ? "Save synthetic demo source"
          : kind === "import"
            ? importBusy
              ? "Importing links..."
              : preview?.links.length && importOffset >= preview.links.length
                ? "Import complete"
                : automatic
                  ? "Import and analyze reviewed links"
                  : importOffset
                    ? "Import next batch"
                    : "Import reviewed links"
            : saving
              ? kind === "upload"
                ? "Uploading..."
                : "Saving..."
              : kind === "upload" && automatic
                ? "Upload and analyze"
                : existingSourceId
                  ? "Attach permitted content"
                  : automatic
                    ? "Add and analyze"
                    : "Save source"}
      </button>
      {importError && (
        <div role="alert" className="form-grid">
          <p>{importError}</p>
          {importError.startsWith("Sign in again") && (
            <a
              className="button"
              href={`/sign-in?reauth=true&returnTo=${encodeURIComponent(`/app?workspace=${organizationId}`)}`}
            >
              Sign in again
            </a>
          )}
        </div>
      )}
      {manifest && (
        <section aria-label="Import manifest">
          <output>
            {manifest.accepted} saved, {manifest.duplicate} duplicates,{" "}
            {manifest.invalid} invalid, {manifest.unsupported} unsupported,{" "}
            {manifest.waiting} waiting. Analysis credits charged:{" "}
            {manifest.analysisCreditsCharged}.
          </output>
          <ol>
            {manifest.entries.map((entry: any) => (
              <li key={entry.row}>
                Row {entry.row}: {entry.status}
                {entry.message ? `. ${entry.message}` : ""}
              </li>
            ))}
          </ol>
        </section>
      )}
    </form>
  );
}
function SourceDetail({
  source,
  sources,
  readOnly,
  busy,
  canSuggestCategories,
  demo,
  org,
  repos,
  devices,
  personalEnabled,
  linkAnalysisEnabled,
  orderedPersonalEnabled,
  cloudEnabled,
  call,
  strictCall,
  onRefresh,
  journey,
  onProposal,
}: any) {
  const [detail, setDetail] = useState(source);
  const [detailLoading, setDetailLoading] = useState(!demo);
  const [excludedInsights, setExcludedInsights] = useState<string[]>([]);
  const [includeProjectSourceContent, setIncludeProjectSourceContent] =
    useState(true);
  const [viewFrame, setViewFrame] = useState<string>();
  const [allFrames, setAllFrames] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const transcript = useRef<HTMLDetailsElement>(null);
  const sourceId = id(source);
  const orderedSource = Boolean(
    detail.personalOrderedInput ||
    detail.orderedPreparation ||
    detail.orderedMedia ||
    detail.serviceIntent,
  );
  const proposalRevision = (source.proposals ?? [])
    .map(
      (proposal: any) =>
        `${id(proposal)}:${proposal.updatedAt}:${proposal.version}:${proposal.review}`,
    )
    .sort()
    .join("|");
  const sourceRevision = `${source.generation}:${source.updatedAt}:${source.personalAnalysis?.state}:${proposalRevision}`;
  const savedFrames = (
    detail.originalMediaEvidence ??
    detail.mediaEvidence ??
    []
  ).filter((e: any) => e.kind === "frame");
  const suppliedMetadata =
    detail.personalOrderedInput?.metadata?.schemaVersion === "provided-media-v1"
      ? detail.personalOrderedInput.metadata
      : detail.orderedMedia?.post?.schemaVersion === "provided-media-v1"
        ? detail.orderedMedia.post
        : null;
  const suppliedReference = (() => {
    if (typeof suppliedMetadata?.originalUrl !== "string") return null;
    try {
      const reference = new URL(suppliedMetadata.originalUrl);
      return reference.protocol === "https:" &&
        !reference.username &&
        !reference.password &&
        !reference.port &&
        !reference.hash
        ? reference.href
        : null;
    } catch {
      return null;
    }
  })();
  const untimedImages =
    detail.coverage === "visual_only" &&
    savedFrames.length > 1 &&
    savedFrames.every((frame: any) => frame.startMs === 0);
  const imageLabel = (frameId: string) => {
    const position = savedFrames.findIndex(
      (frame: any) => frame.id === frameId,
    );
    return position < 0 ? "Image" : `Image ${position + 1}`;
  };
  const insightIds = (detail.analysis?.insights ?? [])
    .map((i: any) => i.id)
    .filter((key: string) => !excludedInsights.includes(key));
  const selection =
    JSON.stringify(detail.repositorySelection?.insightIds) ===
    JSON.stringify(insightIds)
      ? detail.repositorySelection
      : undefined;
  useEffect(() => {
    if (demo) return;
    const abort = new AbortController();
    fetch(`/api/source/${sourceId}?organizationId=${encodeURIComponent(org)}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          throw new Error("Source unavailable");
        const next = await response.json();
        if (!abort.signal.aborted) {
          setDetail(next);
          setDetailLoading(false);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setDetail({
            ...source,
            analysis: undefined,
            text: undefined,
            originalText: undefined,
            summary: undefined,
            mainPoints: undefined,
            mediaEvidence: undefined,
            originalMediaEvidence: undefined,
            repositorySelection: undefined,
            error:
              "Source details are unavailable. Check access before continuing.",
          });
          setDetailLoading(false);
        }
      });
    return () => abort.abort();
    // The workspace projection is a new object after every poll. Reload private
    // evidence only when this source or its linked proposal revision changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, sourceRevision, org, demo]);
  const insights =
    detail.analysis?.insights ??
    (demo
      ? detail.mainPoints?.map((title: string) => ({
          title,
          claim: title,
          evidence: [],
        }))
      : []) ??
    [];
  const summary =
    detail.summary ??
    (["queued", "processing"].includes(detail.state)
      ? "Analysis is underway."
      : "No analysis yet.");
  const overview =
    summary.length > 280
      ? (summary.match(/^.{1,280}[.!?](?:\s|$)/)?.[0]?.trim() ??
        `${summary.slice(0, 280).replace(/\s+\S*$/, "")}…`)
      : summary;
  const citedFrames = new Set(
    insights.flatMap((i: any) =>
      (i.evidence ?? [])
        .filter((e: any) => e.kind === "frame")
        .map((e: any) => e.id),
    ),
  );
  const highlightedFrames = savedFrames.filter((frame: any) =>
    citedFrames.has(frame.id),
  );
  const visibleFrames = allFrames
    ? savedFrames
    : highlightedFrames.length
      ? highlightedFrames.slice(0, 8)
      : savedFrames.slice(0, 4);
  return (
    <>
      {!demo && !detailLoading && (
        <>
          <SourceAcquisitionPanel
            source={detail}
            call={strictCall}
            readOnly={readOnly}
            onAnalyze={() =>
              document
                .getElementById("source-analysis-actions")
                ?.scrollIntoView({ block: "start" })
            }
          />
          <SourceRelationships
            sourceId={sourceId}
            sources={sources}
            call={strictCall}
            readOnly={readOnly}
          />
          {detail.publicImportId ? (
            <SavedPublicSource
              sourceId={sourceId}
              call={strictCall}
              readOnly={readOnly}
              enabled
            />
          ) : (
            canSuggestCategories && (
              <PublicKnowledgePanel
                organizationId={org}
                source={detail}
                call={strictCall}
                readOnly={readOnly}
                enabled
              />
            )
          )}
        </>
      )}
      {!demo && !detailLoading && detail.evidenceRegistry && (
        <section className="panel">
          <h2>Acquired source evidence</h2>
          <p>
            Inspect this retained revision before approving analysis. Retrieval
            and analysis are separate actions.
          </p>
          <TypedSourceEvidence
            evidenceRegistry={detail.evidenceRegistry}
            sourceRevision={detail.sourceRevision}
          />
          <a
            href="/help/first-useful-insight"
            target="_blank"
            rel="noopener noreferrer"
          >
            Evidence and coverage help
          </a>
        </section>
      )}
      {viewFrame && (
        <EvidenceViewer
          key={viewFrame}
          frames={
            savedFrames.some((f: any) => f.id === viewFrame)
              ? savedFrames
              : [
                  {
                    id: viewFrame,
                    startMs:
                      insights
                        .flatMap((i: any) => i.evidence ?? [])
                        .find((e: any) => e.id === viewFrame)?.startMs ?? 0,
                  },
                ]
          }
          initialId={viewFrame}
          untimed={untimedImages}
          onClose={() => setViewFrame(undefined)}
        />
      )}
      {detail.url && (
        <a
          className="panel source-origin"
          href={detail.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open original source: ${detail.title}`}
        >
          <SourceThumbnail source={detail} demo={demo} />
          <span className="source-origin-copy">
            <strong>Original source</strong>
            <span>{detail.url}</span>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </a>
      )}
      {suppliedMetadata && (
        <section className="panel form-grid" aria-label="Provided files">
          <h2>Provided images and videos</h2>
          <p>
            {suppliedMetadata.expectedAssetCount} files saved in your chosen
            order. Creator identity, publication date and post completeness are
            unverified.
          </p>
          {suppliedReference && (
            <a
              href={suppliedReference}
              target="_blank"
              rel="noopener noreferrer"
            >
              Original link supplied by you
            </a>
          )}
          {suppliedMetadata.caption && (
            <div>
              <h3>Your caption or context</h3>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {suppliedMetadata.caption}
              </p>
            </div>
          )}
          <p className="fine">
            Saving these files did not start analysis. Processing status and
            inspected evidence are shown separately.
          </p>
        </section>
      )}
      {!demo &&
        !detailLoading &&
        detail.privateLibrary === true &&
        detail.privateSourceEligibility && (
          <PrivateSourceAnalysis
            privateLibrary
            organizationId={org}
            sourceId={sourceId}
            title={detail.title}
            generation={detail.generation}
            sourceUpdatedAt={detail.updatedAt}
            rightsAttested={detail.rightsAttested === true}
            sourceRetentionUntil={detail.sourceRetentionUntil}
            currentRevisionId={detail.currentRevisionId}
            analysisHash={detail.analysisHash}
            eligibility={detail.privateSourceEligibility}
            repositories={repos
              .filter((repo: any) => repo.enabled && repo.confirmed)
              .map((repo: any) => ({ id: id(repo), name: repo.fullName }))}
            evidenceRegistry={detail.evidenceRegistry}
            sourceRevision={detail.sourceRevision}
            call={strictCall}
            disabled={readOnly}
            onComplete={onRefresh}
            onOpenOriginal={() => setTranscriptOpen(true)}
          />
        )}
      {!demo && detail.state === "ready" && (
        <OwnPlanTaskControls
          organizationId={org}
          call={strictCall}
          source={{ id: sourceId, title: detail.title }}
          sourceContentChoice={{
            include: includeProjectSourceContent,
            onChange: setIncludeProjectSourceContent,
          }}
          privateLibrary={detail.privateLibrary === true}
          repositories={repos
            .filter((repo: any) => repo.enabled && repo.confirmed)
            .map((repo: any) => ({ id: id(repo), name: repo.fullName }))}
          disabled={readOnly}
          onComplete={onRefresh}
        />
      )}
      {detail.assistantIntake && (
        <AssistantIntakeStatus
          key={`${sourceId}:${detail.state}`}
          sourceId={sourceId}
          demo={demo}
          call={call}
        />
      )}
      <div className="panel">
        <span className="coverage">{sourceCoverageLabel(detail.coverage)}</span>
        <h2>AI summary</h2>
        <p>{overview}</p>
        {detail.error && (
          <p className="error" role="alert">
            {detail.error}
          </p>
        )}
        <p className="fine">
          {detail.coverage === "full_sampled"
            ? "Frames are sampled. Automatic transcripts can contain errors."
            : "Review the evidence coverage and analysis notes."}
        </p>
        <details className="source-notes">
          <summary>Full summary and analysis notes</summary>
          {overview !== summary && <p>{summary}</p>}
          {!!detail.analysis?.warnings?.length && (
            <section aria-label="Analysis limitations">
              <h3>Limitations and uncertainty</h3>
              <ul>
                {detail.analysis.warnings.map(
                  (warning: string, index: number) => (
                    <li key={index}>{warning}</li>
                  ),
                )}
              </ul>
            </section>
          )}
          {detail.url && (
            <a href={detail.url} target="_blank" rel="noopener noreferrer">
              Original source
            </a>
          )}
          <p className="fine">
            {detail.createdAt
              ? `Captured ${new Date(detail.createdAt).toLocaleString()}.`
              : "Synthetic example; no real capture date."}
            {detail.originalSavedAt
              ? ` Original save date supplied by the import: ${new Date(detail.originalSavedAt).toLocaleString()}.`
              : " Original save date unknown."}{" "}
            {detail.publishedAt
              ? `Post published ${new Date(detail.publishedAt).toLocaleString()}.`
              : "Post publication date unavailable."}
          </p>
        </details>
      </div>
      <section className="panel">
        <h2>Main points</h2>
        {!demo &&
          !detailLoading &&
          detail.state === "ready" &&
          detail.analysisHash && (
            <AnalysisReview
              key={`${sourceId}:${detail.generation}:${detail.analysisHash}`}
              sourceId={sourceId}
              generation={detail.generation}
              analysisHash={detail.analysisHash}
              initial={detail.analysisReview}
              disabled={readOnly || busy}
              call={call}
              onSaved={(review) =>
                setDetail((current: any) => ({
                  ...current,
                  analysisReview: review,
                }))
              }
            />
          )}
        {!detailLoading && insights.length > 1 && (
          <nav className="insight-index" aria-label="Main points">
            {insights.map((insight: any, index: number) => (
              <a key={insight.id ?? index} href={`#insight-${index}`}>
                {insight.title}
              </a>
            ))}
          </nav>
        )}
        {detailLoading && (
          <output aria-live="polite">
            <Loader2 className="spinner" size={16} aria-hidden="true" /> Loading
            source details…
          </output>
        )}
        {!detailLoading &&
          insights.map((i: any, index: number) => (
            <article
              className="insight"
              id={`insight-${index}`}
              key={i.id ?? i.title}
              tabIndex={-1}
            >
              <h3>{i.title}</h3>
              <p>{i.claim}</p>
              <p>{i.interpretation}</p>
              {(i.confidence || demo) && (
                <span className="status">
                  {i.confidence ?? "Synthetic evidence"}
                </span>
              )}
              {!!i.evidence?.length && (
                <details
                  className="insight-evidence"
                  onToggle={(event) => {
                    if (!demo && event.currentTarget.open)
                      for (const e of i.evidence ?? [])
                        journey?.citation(
                          `${sourceId}:${detail.generation}:${detail.updatedAt}:${i.id}:${e.id}`,
                          e.kind,
                          detail.coverage,
                        );
                  }}
                >
                  <summary>
                    Evidence · {i.evidence.length}{" "}
                    {i.evidence.length === 1 ? "reference" : "references"}
                  </summary>
                  <ul className="evidence-links">
                    {i.evidence?.map((e: any) => (
                      <li key={e.id}>
                        {e.kind === "frame" && !demo && (
                          <button
                            type="button"
                            className="evidence-link"
                            onClick={(event) => {
                              event.currentTarget.focus({
                                preventScroll: true,
                              });
                              setViewFrame(e.id);
                            }}
                          >
                            {untimedImages
                              ? imageLabel(e.id)
                              : `Frame · ${(e.startMs / 1000).toFixed(1)}s`}
                          </button>
                        )}
                        {e.kind === "transcript" && (
                          <a
                            href="#source-transcript"
                            onClick={(event) => {
                              event.preventDefault();
                              setTranscriptOpen(true);
                              const target = transcript.current;
                              if (target) {
                                target.open = true;
                                target.scrollIntoView({ block: "start" });
                                target.focus({ preventScroll: true });
                              }
                            }}
                          >
                            Transcript ·{" "}
                            {e.startMs === null
                              ? "supplied text"
                              : `${(e.startMs / 1000).toFixed(1)}s`}
                          </a>
                        )}
                        {e.kind === "caption" &&
                          detail.acquisition?.description && (
                            <a
                              href="#source-caption"
                              onClick={() => {
                                const target = document.getElementById(
                                  "source-caption",
                                ) as HTMLDetailsElement | null;
                                if (target) {
                                  target.open = true;
                                  target.focus({ preventScroll: true });
                                }
                              }}
                            >
                              Post caption
                            </a>
                          )}
                        {[
                          "github_file",
                          "reddit_post",
                          "reddit_comment",
                          "supplied_text",
                        ].includes(e.kind) && (
                          <span>{label(e.kind)} · see cited excerpt below</span>
                        )}
                        {![
                          "github_file",
                          "reddit_post",
                          "reddit_comment",
                          "supplied_text",
                        ].includes(e.kind) &&
                          e.kind !== "caption" &&
                          e.kind !== "transcript" &&
                          (e.kind !== "frame" || demo) && (
                            <span>
                              {label(e.kind)} ·{" "}
                              {e.startMs === null
                                ? "Supplied text"
                                : `${(e.startMs / 1000).toFixed(1)}s`}
                            </span>
                          )}
                      </li>
                    ))}
                  </ul>
                  {detail.evidenceRegistry && (
                    <TypedSourceEvidence
                      evidenceRegistry={detail.evidenceRegistry.filter(
                        (record: any) =>
                          i.evidence.some((e: any) => e.id === record.id),
                      )}
                      sourceRevision={detail.sourceRevision}
                    />
                  )}
                </details>
              )}
            </article>
          ))}
        {!detailLoading && !insights.length && !detail.error && (
          <p>
            {["processing", "queued"].includes(detail.state)
              ? "Analysis is underway."
              : "No main points yet. Review the source's analysis options."}
          </p>
        )}
        <details
          id="source-transcript"
          ref={transcript}
          tabIndex={-1}
          open={transcriptOpen}
          onToggle={(event) => setTranscriptOpen(event.currentTarget.open)}
        >
          <summary>
            {detail.kind === "text"
              ? "Original supplied text and corrections"
              : "Original transcript and corrections"}
          </summary>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {detail.originalText ??
              detail.text ??
              (detail.kind === "text"
                ? "Original supplied text is unavailable."
                : "Original transcript is unavailable.")}
          </p>
          {detail.originalText && <p>Current user correction: {detail.text}</p>}
          {(detail.originalMediaEvidence ?? detail.mediaEvidence)
            ?.filter((e: any) => e.kind === "transcript")
            .map((e: any) => (
              <p key={e.id} className="fine">
                Original transcript segment: {(e.startMs / 1000).toFixed(1)}–
                {(e.endMs / 1000).toFixed(1)} seconds.
              </p>
            ))}
          {detail.analysis?.correctedText && (
            <p>Confirmed correction: {detail.analysis.correctedText}</p>
          )}
        </details>
      </section>
      {detail.acquisition?.description && (
        <details id="source-caption" className="panel" tabIndex={-1}>
          <summary>Post caption</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {detail.acquisition.description}
          </p>
        </details>
      )}
      {!demo && savedFrames.length > 0 && (
        <section
          className="panel"
          aria-label={untimedImages ? "Image evidence" : "Video evidence"}
        >
          <h2>{untimedImages ? "Image evidence" : "Video evidence"}</h2>
          <div className="evidence-grid">
            {visibleFrames.map((frame: any) => (
              <figure key={frame.id}>
                <button
                  type="button"
                  className="evidence-image-button"
                  onClick={(event) => {
                    event.currentTarget.focus({ preventScroll: true });
                    setViewFrame(frame.id);
                  }}
                >
                  <Image
                    src={`/api/evidence/${encodeURIComponent(frame.id)}?inline=true`}
                    alt={
                      untimedImages
                        ? `Private source ${imageLabel(frame.id).toLowerCase()}`
                        : `Private sampled video frame at ${(frame.startMs / 1000).toFixed(1)} seconds`
                    }
                    width={960}
                    height={540}
                    unoptimized
                    loading="lazy"
                    decoding="async"
                  />
                </button>
                <figcaption>
                  {untimedImages
                    ? imageLabel(frame.id)
                    : `${(frame.startMs / 1000).toFixed(1)}s`}
                </figcaption>
              </figure>
            ))}
          </div>
          {savedFrames.length > visibleFrames.length || allFrames ? (
            <Button onClick={() => setAllFrames(!allFrames)}>
              {allFrames
                ? `Show fewer ${untimedImages ? "images" : "frames"}`
                : `View all ${savedFrames.length} ${untimedImages ? "images" : "frames"}`}
            </Button>
          ) : null}
          <p className="fine">
            {untimedImages
              ? "Images support the analysis. Open one to inspect the evidence."
              : "Selected frames support the analysis. Sampling can miss short scenes."}
          </p>
        </section>
      )}
      {detail.privateLibrary && !demo && !detailLoading && (
        <section
          className="panel source-notes"
          aria-label="Private space filing"
        >
          <h2>File this post</h2>
          <p className="fine">
            Personal and Business are views of your private library. Filing
            never shares this post or runs another analysis.
          </p>
          <div className="row">
            {(["personal", "business"] as const).map((space) => (
              <label key={space} className="check">
                <input
                  type="checkbox"
                  checked={(detail.spaces ?? []).includes(space)}
                  disabled={readOnly || busy}
                  onChange={async (event) => {
                    const spaces = event.target.checked
                      ? [...(detail.spaces ?? []), space]
                      : (detail.spaces ?? []).filter(
                          (s: string) => s !== space,
                        );
                    const result = await call("fileSourceSpaces", {
                      organizationId: org,
                      sourceId,
                      spaces,
                    });
                    if (result)
                      setDetail((old: any) => ({
                        ...old,
                        spaces: result.spaces,
                      }));
                  }}
                />
                {space === "personal" ? "Personal" : "Business"}
              </label>
            ))}
          </div>
        </section>
      )}
      {detail.privateLibrary && !demo && !detailLoading && (
        <TeamKnowledgeSharing
          key={sourceId}
          organizationId={org}
          source={detail}
          call={call}
          readOnly={readOnly}
        />
      )}
      <details
        className="panel source-notes"
        onToggle={(e) => {
          if (e.currentTarget.open)
            setCategoryDraft(
              (detail.categoryNames ?? [])
                .filter(
                  (_: string, index: number) =>
                    !detail.categoryKeys?.[index]?.startsWith("domain_"),
                )
                .join(", "),
            );
        }}
      >
        <summary>
          Categories
          {detail.categoryNames?.length
            ? ` (${detail.categoryNames.length})`
            : ""}
        </summary>
        {!readOnly && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const names = categoryDraft
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const result = await call("assignCategories", {
                id: sourceId,
                names,
              });
              if (result?.saved)
                setDetail({
                  ...detail,
                  categoryNames: result.names,
                  categoryKeys: result.keys,
                });
            }}
          >
            <label>
              Separate categories with commas
              <input
                value={categoryDraft}
                maxLength={400}
                onChange={(e) => setCategoryDraft(e.target.value)}
                placeholder="Music, Reading, Product design"
              />
            </label>
            <button
              type="submit"
              className="secondary"
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? "Saving…" : "Save categories"}
            </button>
          </form>
        )}
        {!demo && canSuggestCategories && !!detail.categoryKeys?.length && (
          <details>
            <summary>Suggest a shared category</summary>
            <p className="fine">
              Only this category name is submitted for review. Your videos and
              insights stay private. Workspace owners and admins can submit.
            </p>
            {detail.categoryKeys.map((key: string, index: number) => (
              <Button
                key={key}
                busy={busy}
                onClick={() =>
                  call("suggestCategory", { organizationId: org, key })
                }
              >
                Suggest {detail.categoryNames[index]}
              </Button>
            ))}
          </details>
        )}
      </details>
      {detail.state === "needs_upload" &&
        !detail.currentRevisionId &&
        !["github_repository", "reddit_thread"].includes(detail.sourceType) && (
          <details className="panel" open={!detail.assistantIntake}>
            <summary>
              {detail.assistantIntake
                ? "Supply content if link retrieval fails"
                : "Supply permitted content"}
            </summary>
            <p>
              {detail.assistantIntake
                ? "Automatic analysis uses your saved link. If retrieval fails, you can attach permitted media or a transcript here."
                : "This saved URL has no verified audiovisual analysis. Attach a permitted upload or supplied transcript to this saved source."}
            </p>
            <CaptureForm
              demo={demo}
              organizationId={org}
              call={call}
              existingSourceId={id(source)}
              existingGeneration={detail.generation}
              devices={devices}
              personalEnabled={personalEnabled}
              linkAnalysisEnabled={linkAnalysisEnabled}
              onDone={() => {}}
            />
          </details>
        )}
      <details className="panel" hidden={Boolean(detail.publicImportId)}>
        <summary>Edit summary, tags and transcript correction</summary>
        <form
          key={`${id(source)}:${detail.updatedAt}`}
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await call("editSource", {
              id: id(source),
              summary: f.get("summary"),
              tags: String(f.get("tags") ?? "")
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
              ...(f.get("correction")
                ? { correctedText: f.get("correction") }
                : {}),
            });
          }}
        >
          <label>
            Summary
            <textarea
              name="summary"
              maxLength={1500}
              defaultValue={detail.summary ?? ""}
            />
          </label>
          <label>
            Tags, separated by commas
            <input name="tags" defaultValue={detail.tags?.join(", ") ?? ""} />
          </label>
          <label
            hidden={Boolean(
              detail.currentRevisionId ||
              detail.publicImportId ||
              ["github_repository", "reddit_thread"].includes(
                detail.sourceType,
              ),
            )}
          >
            Transcript correction, retained beside the original
            <textarea
              name="correction"
              disabled={Boolean(
                detail.currentRevisionId ||
                detail.publicImportId ||
                ["github_repository", "reddit_thread"].includes(
                  detail.sourceType,
                ),
              )}
              maxLength={60000}
              defaultValue={detail.analysis?.correctedText ?? ""}
            />
          </label>
          <button className="primary">Save source edits</button>
        </form>
      </details>
      <section className="panel" id="source-analysis-actions">
        <h2>Applies to your projects</h2>
        <a
          href="/help/evaluate-an-idea-for-a-project"
          target="_blank"
          rel="noopener noreferrer"
        >
          Review project context and alternatives
        </a>
        {detail.analysis?.insights?.length > 0 && (
          <>
            <p>
              Use{" "}
              {insightIds.length === detail.analysis.insights.length
                ? "the whole post"
                : `${insightIds.length} selected main points`}
              .
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={includeProjectSourceContent}
                disabled={busy || readOnly}
                onChange={(event) =>
                  setIncludeProjectSourceContent(event.target.checked)
                }
              />
              Include full transcript and images
            </label>
            <p className="fine">
              On by default. Include the retained transcript, caption and
              available sampled image pixels. Turn this off to use extracted
              insights and citations with less input usage. Missing or expired
              media is reported and is not downloaded again. A post can produce
              up to five distinct proposals per project, each reviewed
              separately.
            </p>
            <details className="point-selection">
              <summary>Advanced · choose main points</summary>
              {detail.analysis.insights.map((insight: any) => (
                <label key={insight.id}>
                  <input
                    type="checkbox"
                    checked={!excludedInsights.includes(insight.id)}
                    onChange={(event) =>
                      setExcludedInsights((old) =>
                        event.target.checked
                          ? old.filter((key) => key !== insight.id)
                          : [...old, insight.id],
                      )
                    }
                  />
                  {insight.title}
                </label>
              ))}
            </details>
            <button
              className="secondary"
              disabled={busy || readOnly || !insightIds.length}
              onClick={() =>
                call("suggestRepositories", {
                  id: id(source),
                  insightIds,
                  maxCredits: 10,
                })
              }
            >
              Find up to five plausible projects, maximum 10 credits
            </button>
            <p className="fine">
              This selection uses confirmed business profiles. It does not
              establish implementation fit or approve coding. Evaluate a project
              separately to inspect repository evidence.
            </p>
            {selection && (
              <div>
                <p>
                  {selection.candidates.length
                    ? "Possible project matches"
                    : "No plausible project match"}
                </p>
                {selection.noFitReason && <p>{selection.noFitReason}</p>}
                {selection.candidates.map((candidate: any) => (
                  <article key={candidate.repositoryId}>
                    <h3>
                      {repos.find(
                        (repo: any) => id(repo) === candidate.repositoryId,
                      )?.fullName ?? "Selected project"}
                    </h3>
                    <p>{candidate.reason}</p>
                    <button
                      className="secondary"
                      disabled={busy || readOnly || !insightIds.length}
                      onClick={() =>
                        call("match", {
                          id: id(source),
                          repositoryId: candidate.repositoryId,
                          insightIds,
                          includeSourceContent: includeProjectSourceContent,
                          multipleProposals: true,
                          maxCredits: 10,
                        })
                      }
                    >
                      Evaluate inspected repository, maximum 10 credits
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
        {detail.matches?.map((m: any) => (
          <article key={m.repositoryId}>
            <h3>{label(m.disposition)}</h3>
            <p>{m.reason}</p>
          </article>
        ))}
        {detail.proposals?.map((p: any) => (
          <button
            className="secondary"
            key={id(p)}
            onClick={() => onProposal(p)}
          >
            {p.title} · {label(p.disposition)}
          </button>
        ))}
        {repos.map((r: any) => (
          <button
            className="secondary"
            key={id(r)}
            disabled={
              busy ||
              readOnly ||
              !insightIds.length ||
              detail.state !== "ready" ||
              !r.enabled ||
              !r.confirmed
            }
            onClick={() =>
              call("match", {
                id: id(source),
                repositoryId: id(r),
                insightIds,
                includeSourceContent: includeProjectSourceContent,
                multipleProposals: true,
                maxCredits: 10,
              })
            }
          >
            Match {r.fullName}, maximum 10 credits
          </button>
        ))}
        {!repos.length && !detail.matches?.length && (
          <p>
            No selected repository yet. Your source can remain useful as a
            reference.
          </p>
        )}
      </section>
      <div className="panel">
        <h2>Processing and retention</h2>
        {detail.localAnalysisReceipt && (
          <p>
            GPT-6.1 Sol · Medium · Your Codex subscription · 0 app credits.{" "}
            {detail.localAnalysisReceipt.frames} sampled frames; video coverage
            is sampled.
          </p>
        )}
        {!detail.localAnalysisReceipt && detail.processingReceipt && (
          <details>
            <summary>
              Cloud · {detail.processingReceipt.chargedCredits} credits ·{" "}
              {Math.round(
                (detail.processingReceipt.completedAt -
                  detail.processingReceipt.startedAt) /
                  1000,
              )}
              s
            </summary>
            <p>
              Model: {detail.processingReceipt.model}. Funded by your VibeScroll
              allowance.
            </p>
            <p>
              Inference estimate:{" "}
              {new Intl.NumberFormat("en", {
                style: "currency",
                currency: "EUR",
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              }).format(detail.processingReceipt.inferenceMicros / 1000000)}
              . This includes a conservative currency and tax provision; it is
              not a provider invoice. Cloud preparation used{" "}
              {detail.processingReceipt.computeCredits} processing credits.
            </p>
            <p>
              {detail.processingReceipt.inputTokens.toLocaleString()} input
              tokens · {detail.processingReceipt.outputTokens.toLocaleString()}{" "}
              output tokens, including thinking.
            </p>
            {detail.processingReceipt.reusedMedia && (
              <p>Previously prepared speech and frames were reused.</p>
            )}
          </details>
        )}
        {detail.speechProvenance && (
          <details>
            <summary>Transcription details</summary>
            <p>
              {detail.speechProvenance.model} ·{" "}
              {detail.speechProvenance.language || "Language uncertain"} ·
              approximate timestamps
            </p>
            {detail.speechProvenance.uncertainty && (
              <p>{detail.speechProvenance.uncertainty}</p>
            )}
          </details>
        )}
        {detail.personalAnalysis?.executor === "work_cloud" && (
          <section
            className="panel"
            aria-label="Work Cloud text analysis status"
          >
            <h3>Work Cloud text analysis</h3>
            <p>
              {label(detail.personalAnalysis.state)}. Requested{" "}
              {detail.personalAnalysis.model}, {detail.personalAnalysis.effort}{" "}
              reasoning. Host execution settings and subscription usage are not
              verified by VibeScroll.
            </p>
            {detail.personalAnalysis.state === "queued" && (
              <>
                <p>
                  In your supported Work chat, explicitly invoke VibeScroll's
                  work_cloud_claim tool for this request, using that chat's
                  actual task ID.
                </p>
                <pre>
                  {JSON.stringify(
                    {
                      sourceId: id(detail),
                      generation: detail.personalAnalysis.generation,
                    },
                    null,
                    2,
                  )}
                </pre>
              </>
            )}
            {["queued", "running"].includes(detail.personalAnalysis.state) && (
              <button
                className="secondary"
                disabled={readOnly || detailLoading || busy}
                onClick={() =>
                  call("cancelPersonalAnalysis", { id: id(detail) })
                }
              >
                Revoke this request's app access
              </button>
            )}
            <p>
              Revocation blocks further input and result return. Stop the host
              task too. VibeScroll cannot confirm that the host stopped or
              restore subscription allowance. No alternate provider starts
              automatically.
            </p>
          </section>
        )}
        {(detail.workCloudTextEnabled || detail.workCloudMediaEnabled) &&
          !orderedSource &&
          !detail.publicImportId &&
          ((detail.workCloudTextEnabled &&
            (detail.kind === "text" || detail.currentRevisionId)) ||
            (detail.workCloudMediaEnabled &&
              detail.kind === "url" &&
              !detail.currentRevisionId)) &&
          !["ready", "queued", "processing"].includes(detail.state) && (
            <WorkCloudText
              sourceId={id(detail)}
              organizationId={org}
              generation={detail.generation}
              revision={detail.updatedAt}
              media={detail.kind === "url" && !detail.currentRevisionId}
              retentionUntil={detail.sourceRetentionUntil}
              call={strictCall}
              disabled={readOnly || detailLoading}
            />
          )}
        {personalEnabled &&
          detail.personalAnalysis?.executor !== "work_cloud" && (
            <PersonalSourceAnalysis
              key={`${id(detail)}:${detail.generation}:${detail.currentRevisionId ?? "legacy"}`}
              source={detail}
              devices={devices}
              linkAnalysisEnabled={linkAnalysisEnabled}
              orderedPersonalEnabled={orderedPersonalEnabled}
              call={strictCall}
              readOnly={readOnly || detailLoading}
            />
          )}
        {detail.error && <p role="alert">{detail.error}</p>}
        {orderedSource && !personalEnabled && detail.state !== "ready" && (
          <p>
            Ordered-media analysis is awaiting its supported route. Legacy video
            and cloud analysis are unavailable for this source.
          </p>
        )}
        {cloudEnabled && !orderedSource && detail.state !== "ready" && (
          <button
            className="primary"
            disabled={
              readOnly ||
              detailLoading ||
              busy ||
              ["queued", "processing"].includes(detail.state)
            }
            onClick={() => call("process", { id: id(source), maxCredits: 10 })}
          >
            Analyze in cloud, up to 10 credits
          </button>
        )}
        <button
          className="secondary"
          onClick={() => {
            if (
              confirm(
                "Delete this source and its private evidence? Existing GitHub PRs remain on GitHub.",
              )
            )
              call("deleteSource", { id: id(source) });
          }}
        >
          Delete source
        </button>
        <p>
          Benefit remains unmeasured. A merged PR does not prove the idea
          worked.
        </p>
      </div>
    </>
  );
}
export function PersonalSourceAnalysis({
  source,
  devices,
  call,
  linkAnalysisEnabled,
  orderedPersonalEnabled = false,
  readOnly = false,
}: any) {
  const controlId = useId();
  const [deviceId, setDeviceId] = useState(""),
    [model, setModel] = useState(""),
    [effort, setEffort] = useState(""),
    [consent, setConsent] = useState(""),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [catalogueTime, setCatalogueTime] = useState(() => Date.now());
  const orderedInput =
    source.personalOrderedInput?.schemaVersion === "ordered-personal-input-v1";
  const eligible = devices.filter(
    (d: any) =>
      d.personalOwned &&
      d.state === "paired" &&
      d.personalOnline &&
      d.personalModels?.length &&
      (!orderedInput ||
        d.personalInputProtocols?.includes("ordered-personal-v1")),
  );
  const device = eligible.find((d: any) => id(d) === deviceId);
  const catalogueExpiry = Math.min(
    device?.subscriptionCapabilities?.expiresAt ?? 0,
    device?.subscriptionCapabilities?.sessionExpiresAt ?? 0,
  );
  useEffect(() => {
    if (!catalogueExpiry) return;
    const timer = setTimeout(
      () => setCatalogueTime(Date.now()),
      Math.max(1, catalogueExpiry - Date.now() + 1),
    );
    return () => clearTimeout(timer);
  }, [catalogueExpiry]);
  const typedSource = Boolean(source.currentRevisionId);
  const orderedSource = Boolean(
    source.orderedPreparation ||
    source.serviceIntent ||
    (source.orderedMedia && !orderedInput),
  );
  const textSource = source.kind === "text" || typedSource;
  const currentCatalogue =
    catalogueExpiry > catalogueTime
      ? device.subscriptionCapabilities.value
      : null;
  const models = currentCatalogue
    ? currentCatalogue.models.filter(
        (entry: any) =>
          entry.inputModalities.includes("text") &&
          (textSource || entry.inputModalities.includes("image")),
      )
    : [];
  const selectedModel = models.find((item: any) => item.slug === model);
  const efforts: string[] = selectedModel ? selectedModel.reasoningEfforts : [];
  const selectionKey = `${id(source)}:${source.generation}:${deviceId}:${model}:${effort}:${device?.subscriptionCapabilities?.hash ?? ""}`;
  const consented = consent === selectionKey;
  const locked = readOnly || busy;
  const typedRequired =
    typedSource ||
    ["github_repository", "reddit_thread"].includes(source.sourceType);
  const running = ["preparing", "queued", "running"].includes(
    source.personalAnalysis?.state,
  );
  return (
    <section aria-label="Personal ChatGPT analysis" className="panel">
      <h3>Use your ChatGPT plan</h3>
      {error && <p role="alert">{error}</p>}
      {running && orderedInput && !orderedSource && (
        <output>
          {source.personalAnalysis.ordered?.phase === "preflight"
            ? "Waiting for your paired computer to check its current account, selected model and local audio tools. Media preparation has not started."
            : source.personalAnalysis.ordered?.phase === "preparing"
              ? "Preparing the supplied files in isolation. Your computer will inspect the available images and transcribe any supported audio."
              : "Your paired computer is inspecting the prepared images and audio, then saving cited insights."}
        </output>
      )}
      {running && !orderedSource && !orderedInput && (
        <ol
          className="processing-steps"
          aria-label="Analysis progress"
          aria-live="polite"
        >
          {(!textSource
            ? [
                "Preparing media",
                "Transcribing audio",
                "Analyzing frames and saving insights",
              ]
            : ["Analyzing text and saving insights"]
          ).map((step, index) => {
            const active = textSource
              ? 0
              : source.personalAnalysis.state === "preparing"
                ? 0
                : source.personalAnalysis.stage === "transcribing"
                  ? 1
                  : 2;
            return (
              <li
                key={step}
                className={
                  index === active
                    ? "current"
                    : index < active
                      ? "complete"
                      : ""
                }
              >
                {index < active ? (
                  <Check size={16} aria-hidden="true" />
                ) : index === active ? (
                  <Loader2 size={16} className="spinner" aria-hidden="true" />
                ) : (
                  <span className="step-dot" />
                )}
                {step}
              </li>
            );
          })}
        </ol>
      )}
      {source.personalAnalysis && (
        <p>
          Personal analysis: {label(source.personalAnalysis.state)} ·{" "}
          {source.personalAnalysis.model} · {source.personalAnalysis.effort}{" "}
          reasoning.{" "}
          {source.personalAnalysis.inputTokens === undefined
            ? "Plan usage is not yet reported."
            : `${source.personalAnalysis.inputTokens} input and ${source.personalAnalysis.outputTokens} output tokens reported.`}
        </p>
      )}
      {running ? (
        <Button
          busy={busy}
          disabled={readOnly}
          onClick={async () => {
            if (locked) return;
            setBusy(true);
            setError("");
            try {
              await call("cancelPersonalAnalysis", { id: id(source) });
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Cancellation was not confirmed. Refresh current status before retrying.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Cancel personal analysis
        </Button>
      ) : orderedSource || (orderedInput && !orderedPersonalEnabled) ? (
        <p>
          Ordered-media analysis is awaiting its supported route. Legacy video
          and cloud analysis are unavailable for this source.
        </p>
      ) : typedRequired && !typedSource ? (
        <p>
          Review and acquire the current permitted source evidence above before
          approving analysis.
        </p>
      ) : !(
          textSource ||
          source.kind === "upload" ||
          (source.kind === "url" && linkAnalysisEnabled)
        ) ? (
        <p>
          Upload the permitted video to start automatic transcription and frame
          analysis.
        </p>
      ) : (
        source.state !== "ready" && (
          <>
            <p>
              {orderedInput
                ? "Your paired computer first checks its actual account, selected image-capable model and local audio tools. Only then can isolated file preparation reserve up to 10 compute credits. It inspects prepared images and transcribes supported audio using your account and local tools."
                : !textSource
                  ? "Your laptop transcribes audio locally, then sends sampled frames and the transcript to your ChatGPT account. Media preparation reserves up to 10 compute credits."
                  : typedSource
                    ? "Your laptop sends only the reviewed file or discussion excerpts to your ChatGPT account. This source uses text citations and no media preparation credits."
                    : "Your laptop sends this text to your ChatGPT account."}{" "}
              No VibeScroll inference credits or paid AI fallback. Your ChatGPT
              limits apply.
            </p>
            {!eligible.length ? (
              <p>
                Start your paired companion and connect your eligible account,
                then refresh account status to see its advertised models.
              </p>
            ) : (
              <>
                <label htmlFor={`${controlId}-computer`}>
                  Computer
                  <ChoiceSelect
                    id={`${controlId}-computer`}
                    disabled={locked}
                    value={deviceId}
                    onValueChange={(value) => {
                      setDeviceId(value);
                      setModel("");
                      setEffort("");
                      setConsent("");
                    }}
                  >
                    <option value="">Choose your computer</option>
                    {eligible.map((d: any) => (
                      <option key={id(d)} value={id(d)}>
                        {d.name}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
                <label htmlFor={`${controlId}-model`}>
                  Account model
                  <ChoiceSelect
                    id={`${controlId}-model`}
                    disabled={locked || !currentCatalogue}
                    value={model}
                    onValueChange={(value) => {
                      setModel(value);
                      setEffort("");
                      setConsent("");
                    }}
                  >
                    <option value="">Choose an available model</option>
                    {models.map((m: any) => (
                      <option key={m.slug} value={m.slug}>
                        {m.displayName}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
                <label htmlFor={`${controlId}-effort`}>
                  Reasoning effort
                  <ChoiceSelect
                    id={`${controlId}-effort`}
                    disabled={locked || !selectedModel}
                    value={effort}
                    onValueChange={(value) => {
                      setEffort(value);
                      setConsent("");
                    }}
                  >
                    <option value="">Choose an available effort</option>
                    {efforts.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={consented}
                    disabled={
                      locked || !selectedModel || !efforts.includes(effort)
                    }
                    onChange={(e) =>
                      setConsent(e.target.checked ? selectionKey : "")
                    }
                  />
                  Use my connected ChatGPT plan for this source with the
                  selected model and reasoning effort.
                </label>
                <Button
                  primary
                  busy={busy}
                  disabled={
                    readOnly ||
                    !consented ||
                    !device ||
                    !model ||
                    !efforts.includes(effort) ||
                    ["queued", "processing"].includes(source.state)
                  }
                  onClick={async () => {
                    if (
                      locked ||
                      !consented ||
                      !device ||
                      !selectedModel ||
                      !efforts.includes(effort) ||
                      catalogueExpiry <= Date.now() ||
                      orderedSource ||
                      (orderedInput && !orderedPersonalEnabled) ||
                      (orderedInput &&
                        !device.personalInputProtocols?.includes(
                          "ordered-personal-v1",
                        ))
                    ) {
                      setError(
                        "Review the current account catalogue, model and effort before approving this source.",
                      );
                      return;
                    }
                    setBusy(true);
                    setError("");
                    try {
                      await call("approvePersonalAnalysis", {
                        id: id(source),
                        generation: source.generation,
                        deviceId,
                        model,
                        effort,
                        useOwnPlan: true,
                        ...(!textSource ? { maxComputeCredits: 10 } : {}),
                      });
                      setConsent("");
                    } catch (failure) {
                      setError(
                        failure instanceof Error
                          ? failure.message
                          : "Analysis approval was not confirmed. Refresh account status before retrying.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {orderedInput
                    ? "Check account and analyze files"
                    : !textSource
                      ? "Transcribe and analyze video"
                      : "Analyze with my plan"}
                </Button>
                <p className="fine">
                  Approval expires after 15 minutes if unclaimed.
                  Reauthentication may be required. There is no automatic model
                  or paid-provider fallback.
                </p>
                {!currentCatalogue && (
                  <p>
                    Current account choices are unavailable or expired.
                    Reconnect your eligible account on the paired companion and
                    refresh status. No model or reasoning effort is assumed.
                  </p>
                )}
              </>
            )}
          </>
        )
      )}
    </section>
  );
}
function ExecutionApproval({ proposal, call, routes, usage, busy }: any) {
  const available = availableProcessingCredits(usage?.pools ?? []);
  const [executor, setExecutor] = useState(
      routes?.execution?.localReady ? "local" : "cloud",
    ),
    [ceiling, setCeiling] = useState(() => Math.min(30, available)),
    [modelId, setModelId] = useState(""),
    [highRisk, setHighRisk] = useState(false);
  const estimate = cloudExecutionEstimate(
    ceiling,
    routes?.execution?.computeReservationCredits,
    routes?.execution?.creditsPerSecond,
  );
  const model = routes?.models.find((m: any) => m.id === modelId);
  const cloud = executor !== "local";
  const saved =
    proposal.review === "accepted" &&
    !!proposal.planHash &&
    !!proposal.plan?.files?.length;
  const ready = cloud
    ? routes?.execution?.cloudReady === true
    : routes?.execution?.localReady === true;
  const reason = !saved
    ? "Review and save a plan version to enable execution approval."
    : !ready
      ? cloud
        ? "Cloud execution is awaiting isolation and funding verification."
        : "Laptop coding is awaiting verified isolation. Your video analysis connection remains separate."
      : undefined;
  return (
    <section className="panel">
      <h2>Separate execution approval</h2>
      <p>Repository: {proposal.repositoryId ?? "Demo Planner"}</p>
      <p>
        Base commit: <code>{proposal.baseSha ?? "Synthetic base"}</code>
      </p>
      <p>
        Plan version: {proposal.version} · Hash:{" "}
        <code>{proposal.planHash ?? "Save a validated plan first"}</code>
      </p>
      <label htmlFor="executor-choice">
        Executor
        <ChoiceSelect
          id="executor-choice"
          value={executor}
          onValueChange={(value) => setExecutor(value)}
        >
          <option value="local" disabled={!routes?.execution?.localReady}>
            Paired laptop, own local Codex session
          </option>
          <option value="cloud" disabled={!routes?.execution?.cloudReady}>
            Metered cloud, managed API
          </option>
          <option
            value="customer"
            disabled={!routes?.execution?.cloudReady || !routes?.models.length}
          >
            Metered cloud, your OpenAI API credential
          </option>
        </ChoiceSelect>
      </label>
      {executor === "customer" && (
        <>
          <label>
            Reviewed model
            <ChoiceSelect
              value={modelId}
              onValueChange={(value) => setModelId(value)}
            >
              <option value="">Choose a verified model</option>
              {routes?.models.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {m.version}
                </option>
              ))}
            </ChoiceSelect>
          </label>
          <p>
            Separate provider ceiling:{" "}
            {model
              ? `USD ${(model.maxProviderUsdCents / 100).toFixed(2)}`
              : "Choose a model"}
            . OpenAI bills your API account directly. Platform credits cover
            isolated compute; they do not pay this provider charge. One
            generation request, no automatic retry or fallback.
          </p>
        </>
      )}
      {cloud && (
        <label>
          Maximum platform credits
          <input
            type="number"
            min={1}
            max={10000}
            value={ceiling}
            onChange={(e) => setCeiling(Number(e.target.value))}
          />
        </label>
      )}
      <p>
        {cloud && estimate
          ? `Up to ${Math.floor(estimate.maximumSeconds / 60)}m ${estimate.maximumSeconds % 60}s within this ceiling, including up to ${estimate.computeCredits} compute credits. ${available} credits available.`
          : "Permitted files come from the reviewed plan."}{" "}
        Publication requires final patch review.
      </p>
      {cloud && (!estimate || ceiling > available) && (
        <output>
          Choose a ceiling your available credits can cover, including isolated
          compute and inference.
        </output>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={highRisk}
          onChange={(event) => setHighRisk(event.target.checked)}
        />
        I explicitly approve protected changes in this exact plan. Owner or
        administrator permission and final patch review are required.
      </label>
      {reason && <p>{reason}</p>}
      <Button
        primary
        busy={busy}
        disabled={
          !saved ||
          !ready ||
          (executor === "customer" && !model) ||
          (cloud && (!estimate || ceiling > available))
        }
        onClick={() =>
          call("approve", {
            id: id(proposal),
            version: proposal.version,
            planHash: proposal.planHash ?? "",
            baseSha: proposal.baseSha ?? "",
            executor: cloud ? "cloud" : "local",
            fundingRoute:
              executor === "local"
                ? "local_codex_subscription"
                : executor === "customer"
                  ? "customer_api_key"
                  : "managed_api",
            ...(executor === "customer"
              ? {
                  modelId: model.id,
                  maxProviderUsdCents: model.maxProviderUsdCents,
                }
              : {}),
            maxCredits: cloud ? ceiling : 0,
            allowedPaths: proposal.plan?.files.map((f: any) => f.path) ?? [],
            highRisk,
          })
        }
      >
        Approve exact scope and funding route
      </Button>
      <p className="fine">
        Missing isolation blocks execution. No automatic paid fallback.
      </p>
    </section>
  );
}
function RunCard({ run, title, call, busy, readOnly }: any) {
  return (
    <article className="panel">
      <span className="status">{label(run.state)}</span>
      <h2>{title ?? "Coding task"}</h2>
      <p>
        {run.executor} · {label(run.fundingRoute)} · Ceiling {run.maxCredits}{" "}
        credits
      </p>
      {run.fundingRoute === "customer_api_key" && (
        <p>
          Customer API model: {run.customerModel?.id}. Provider ceiling USD{" "}
          {((run.maxProviderUsdCents ?? 0) / 100).toFixed(2)}.{" "}
          {!run.providerRequestState
            ? "No provider request was issued."
            : run.providerRequestState === "settled"
              ? `Reported provider usage USD ${(run.providerUsdCents / 100).toFixed(2)}.`
              : `Provider request: ${label(run.providerRequestState ?? "unissued")}. Unknown usage requires reconciliation.`}
        </p>
      )}
      <p>Benefit: not measured</p>
      <ul>
        {run.events?.map((e: string, i: number) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
      {run.error && <p role="alert">{run.error}</p>}
      {/^Exit (?!0\b)\d+:/m.test(run.report ?? "") && (
        <p className="notice">
          Some approved checks failed. Review the report before publishing.
        </p>
      )}
      {run.patch && (
        <details>
          <summary>Review patch and check report</summary>
          <pre>{run.patch}</pre>
          <p>{run.report}</p>
          {run.state === "awaiting_review" && (
            <p className="fine">
              The reviewed patch and title will be shared with the selected
              GitHub repository. Detailed check output and source evidence stay
              private.
            </p>
          )}
          {run.state === "awaiting_review" && (
            <button
              className="primary"
              disabled={busy || readOnly}
              onClick={async () => {
                const hash = await crypto.subtle.digest(
                  "SHA-256",
                  new TextEncoder().encode(run.patch),
                );
                const patchDigest = Array.from(new Uint8Array(hash), (n) =>
                  n.toString(16).padStart(2, "0"),
                ).join("");
                call("publish", {
                  id: id(run),
                  generation: run.generation,
                  patchDigest,
                });
              }}
            >
              Approve this patch for a draft PR
            </button>
          )}
        </details>
      )}
      {run.prUrl && (
        <>
          <a
            className="secondary"
            href={run.prUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {label(run.prState ?? "status unavailable")} · Open GitHub PR
          </a>
          <button
            className="secondary"
            disabled={busy || readOnly}
            onClick={() => call("refreshPR", { id: id(run) })}
          >
            Refresh authoritative PR status
          </button>
          <p>
            Last checked{" "}
            {run.observedAt
              ? new Date(run.observedAt).toLocaleString()
              : "not checked"}
          </p>
          {run.reverted && (
            <p>
              Reverted ·{" "}
              <a
                href={run.reverted.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                View verified reversal
              </a>
              . The original merge remains in its history.
            </p>
          )}
          {["unverified", "search_limited"].includes(run.revertStatus) &&
            !run.reverted && (
              <p className="fine">
                The bounded reversal check is incomplete. The historical merge
                remains recorded.
              </p>
            )}
        </>
      )}
      {!["completed", "canceled", "failed", "publishing"].includes(
        run.state,
      ) && (
        <button
          className="secondary"
          disabled={busy || readOnly}
          onClick={() => call("cancel", { id: id(run) })}
        >
          Cancel pending execution
        </button>
      )}
    </article>
  );
}
