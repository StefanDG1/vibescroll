"use client";
import { postTopics } from "@/lib/project-suggestions";
import { ProjectProposalComposer } from "./project-proposal-composer";
import { StandaloneProposal } from "./standalone-proposal";
import { PreparedAnalysisControl } from "./prepared-analysis-control";
import { OriginalCaption, PostMediaCarousel, PostOriginals } from "./post-source-media";
import { PostInsightReader } from "./post-insight-reader";
import { PostInsightStrip } from "./post-insight-strip";
import { feedInsightEvidence, orderedFeedMedia, postTopicName } from "@/lib/home-feed";
import { SettingsPanel } from "./settings-panel";
import { useState, useEffect, useRef, useEffectEvent, useId } from "react";
import { useRouter } from "next/navigation";
import {
  redirectForAuthentication,
  SignInRedirect,
} from "../lib/authentication";
import { usePolling } from "@/lib/use-polling";
import { useSourceLive, usePostsLive } from "@/lib/use-source-live";
import { isCloudObservedMedia } from "../../../packages/social/contracts";
import {
  postDisplayTitle,
  defaultLinkTitle,
} from "../../../packages/sources/display";
import { socialCitation } from "../../../packages/social/analysis";
import {
  WorkCloudText,
  PersistedWorkCloudHandoff,
  workCloudHandoffKey,
} from "./work-cloud-text";
import { AccountConnections } from "./account-connections";
import { AccountComputers } from "./account-computers";
import { AccountOverview } from "./account-overview";
import { AccountBack, AccountSection } from "./account-layout";
import {
  RecordedWorkOutcomes,
  WorkActivity,
  WorkLoading,
  WorkNavigation,
  WorkProjects,
  WorkProposals,
  WorkStatus,
  WorkTasks,
  isWorkView,
} from "./work-screens";
import { workDate } from "../lib/work-presentation";
import { AssistantIntakeStatus } from "./assistant-intake-status";
import { UsageSummary } from "./usage-summary";
import { ProOfferSummary } from "./pro-offer-summary";
import { TrendsDashboard } from "./trends-dashboard";
import { RecentSaveActivity } from "./recent-save-activity";
import { usageOverview } from "../../../packages/billing/usage-overview";
import {
  sourceEvidenceFrames,
  cloudCitationForDisplay,
} from "../../../packages/media/cloud-frames";
import Link from "next/link";
import Image from "next/image";
import {
  Home,
  Library,
  GitBranch,
  Plug,
  Plus,
  Video,
  FileEdit,
} from "./icons/iconoir";
import {
  Inbox,
  FileCheck2,
  GitPullRequest,
  Gauge,
  Laptop,
  ShieldCheck,
  CreditCard,
  Loader2,
  Check,
  ChevronDown,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import {
  AccountMenu,
  ProfileAvatar,
  type AccountProfile,
} from "./account-menu";
import { KnowledgeLibrary, LibrarySections } from "./knowledge-library";
import { CategoryDirectory } from "./category-directory";
import { LibrarySkeleton } from "./library-skeleton";
import { LibraryScan } from "./library-scan";
import { SubscriptionTrials } from "./subscription-trials";
import { Improvements } from "./improvements";
import { NoticeToast } from "./notice-toast";
import { TeamKnowledgeSharing } from "./team-knowledge-sharing";
import { SharedKnowledge } from "./shared-knowledge";
import { PrivateLibrary } from "./private-library";
import { HomeFeed } from "./home-feed";
import { PostThumbnail } from "./post-thumbnail";
import { postThumbnailCandidates } from "../../../packages/sources/thumbnail";
import { motion } from "motion/react";
import { useInterfaceMotion } from "./motion-preference";
import { mobileNavigationGroup } from "@/lib/mobile-navigation";
import { clearLibraryPlaces } from "@/lib/library-place";
import { workspaceReadDenied } from "@/lib/workspace-access";
import {
  libraryPageAfterContext,
  sourceCoverageLabel,
} from "@/lib/library-sources";
import { ProposalTrail } from "./proposal-trail";
import { ProposalWorkObservations } from "./proposal-work-observations";
import { AppTheme } from "./app-theme";
import { MotionPreference } from "./motion-preference";
import { downloadText } from "@/lib/download";
import { RepositoryChecklist, BusinessContext } from "./repository-checklist";
import { PlanEditor } from "./plan-editor";
import { ChoiceSelect } from "./choice-select";
import { policyRelease } from "../../../packages/policy/publication";
import { EvidenceViewer } from "./evidence-viewer";
import { AnalysisReview } from "./analysis-review";
import { AnalysisHistory } from "./analysis-history";
import {
  CloudCatalogContribution,
  CloudCatalogReceipts,
} from "./cloud-catalog-controls";
import { TaskRuntimePicker } from "./task-runtime-picker";
import { SourceAcquisitionPanel } from "./source-acquisition-panel";
import { SourceProgressPanel } from "./source-progress";
import { ErrorState } from "./assistant-elements/error-state";
import {
  sourceProgress,
  sourceProgressDeadline,
} from "../../../packages/sources/progress";
import { TypedSourceEvidence } from "./typed-source-evidence";
import { PublicKnowledgePanel } from "./public-knowledge-panel";
import { SavedPublicSource } from "./saved-public-source";
import { PublicSaveContinuation } from "./public-save-continuation";
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
  workspaceSlice?:
    | "source"
    | "proposal"
    | "library"
    | "activity"
    | "capture"
    | "connections"
    | "usage"
    | "projects"
    | "plans";
  compact?: boolean;
  role?: string;
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
    preparedAnalysisEnabled?: boolean;
    processingRoute?: "local" | "cloud" | "save_only" | "work_cloud" | null;
    workCloud?: {
      available: boolean;
      configured: boolean;
      grantId: string | null;
      grantVersion: number | null;
    } | null;
  };
  sources: any[];
  selectedSource?: any;
  projectSuggestions?: import("../lib/project-suggestions").ProjectSuggestions;
  recentPosts?: import("convex/server").FunctionReturnType<
    typeof import("../../../convex/_generated/api").api.posts.recent
  >;
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
  projects?: { _id: string; name: string; description: string }[];
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
const label = (s: string) =>
  s === "needs_upload" ? "source not retrieved" : s.replaceAll("_", " ");
const calendarDate = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const calendarDateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
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

function SourceThumbnail({
  source,
  demo,
  priority = false,
}: {
  source: any;
  demo: boolean;
  priority?: boolean;
}) {
  return (
    <PostThumbnail
      candidates={postThumbnailCandidates(source)}
      kind={source.kind}
      demo={demo}
      priority={priority}
    />
  );
}

const postsReturnKey = "vibescroll:posts-return";
type PostsReturnPosition = {
  href: string;
  top: number;
  postId: string;
  shown: number;
  restoreFocus: boolean;
  recordedAt: number;
};

function getPostsReturnPosition(): PostsReturnPosition | undefined {
  try {
    const position: PostsReturnPosition | null = JSON.parse(
      sessionStorage.getItem(postsReturnKey) ?? "null",
    );
    if (position && Date.now() - position.recordedAt < 30 * 60_000)
      return position;
  } catch {
    // Session storage can be unavailable in private browsing.
  }
}

export function Console({
  profile,
  compactHomePreview = false,
  localSnapshot = false,
  demo = false,
  readOnly = false,
  canSuggestCategories = false,
  canRepairEvidence = false,
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
  localSnapshot?: boolean;
  demo?: boolean;
  readOnly?: boolean;
  canSuggestCategories?: boolean;
  canRepairEvidence?: boolean;
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
  const captureDraft = useRef<string | null>(null);
  const [capturePreparing, setCapturePreparing] = useState(false);
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
    [busy, setBusy] = useState(false),
    [loadingView, setLoadingView] = useState(false),
    [viewError, setViewError] = useState(false),
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
    [libraryPreferencesOpen, setLibraryPreferencesOpen] = useState(false);
  const [homeData, setHomeData] = useState<Initial | null>(
    initialView === "home" ? initial : null,
  );
  const viewGeneration = useRef(0);
  const homePreview = useRef(compactHomePreview);
  const firstView = useRef(true);
  const loadedView = useRef(view);
  const visitedViews = useRef(new Map<string, Initial>());
  const seenNotifications = useRef(new Set(initial.notifications.map(id)));
  const captureDialog = useRef<HTMLDialogElement>(null);
  const [sharedDraft, setSharedDraft] = useState(initialSharedDraft);
  const [analysisSettingsOpen, setAnalysisSettingsOpen] = useState(false);
  const libraryRequest = useRef(0);
  const expandedLibrary = useRef(false);
  const libraryAbort = useRef<AbortController | null>(null);
  const libraryPage = useRef<{
    query: string;
    sources: Initial["sources"];
    libraryNext: Initial["libraryNext"];
  } | null>(null);
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
  const showingPosts =
    view === "posts" || (view === "library" && librarySection === "posts");
  const libraryQuery = new URLSearchParams({
    q: search, state: filter, category, sort,
  }).toString();
  const hasLibraryPage = libraryPage.current?.query === libraryQuery;
  function updatePostsQuery(key: string, value: string) {
    const url = new URL(location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    history.replaceState(null, "", url);
  }
  function clearPostsFilters() {
    setSearch("");
    setFilter("");
    setCategory("");
    setSort("newest");
    const url = new URL(location.href);
    for (const key of ["q", "state", "category", "sort"])
      url.searchParams.delete(key);
    history.replaceState(null, "", url);
  }
  async function loadLibrary(append = false) {
    if (demo) {
      setLibraryError("");
      return;
    }
    if (append && !data.libraryNext) return;
    expandedLibrary.current = append;
    const generation = ++libraryRequest.current;
    libraryAbort.current?.abort();
    const abort = new AbortController();
    libraryAbort.current = abort;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      const q = new URLSearchParams(libraryQuery);
      if (append && data.libraryNext) q.set("cursor", data.libraryNext);
      const response = await fetch(`/api/library/${organizationId}?${q}`, {
        cache: "no-store",
        signal: abort.signal,
      });
      if (workspaceReadDenied(response)) {
        if (generation === libraryRequest.current) clearAccess();
        throw new Error("Your library could not be loaded. Sign in again.");
      }
      if (!response.ok)
        throw new Error("Your library could not be loaded. Try again.");
      const result = await response.json();
      if (generation !== libraryRequest.current) return;
      const previous = libraryPage.current;
      const nextPage = {
        query: libraryQuery,
        sources: append && previous?.query === libraryQuery
          ? [
              ...previous.sources,
              ...result.items.filter(
                (item: any) =>
                  !previous.sources.some((old) => id(old) === id(item)),
              ),
            ]
          : result.items,
        libraryNext: result.next,
      };
      libraryPage.current = nextPage;
      setData((current) => ({
        ...current,
        sources: nextPage.sources,
        libraryNext: nextPage.libraryNext,
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
    if (demo || !showingPosts) return;
    if (expandedLibrary.current && libraryPage.current?.query === libraryQuery)
      return;
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
    showingPosts,
    libraryQuery,
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
              ".rail-save, .mobile-save",
            ),
          ].find(available);
      target?.focus();
      captureOrigin.current = null;
    };
  }, [captureOpen]);
  function applyData(next: Initial, requestView = view) {
    captureAccess.current = true;
    setAccessAvailable(true);
    if (next.workspaceSlice === "capture") {
      setData((current) => ({
        ...current,
        devices: next.devices,
        aiPreference: next.aiPreference,
      }));
      return;
    }
    if (next.workspaceSlice === "library") {
      loadedView.current = requestView;
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
    if (requestView === "home") setHomeData(next);
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
    loadedView.current = requestView;
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
    libraryPage.current = null;
    visitedViews.current.clear();
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
      if (next && showingPosts && !expandedLibrary.current) await loadLibrary();
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
      applyData(next, requestView);
      return next as Initial;
    } else if (workspaceReadDenied(response)) {
      if (generation !== viewGeneration.current) return;
      clearAccess();
    } else if (generation === viewGeneration.current) {
      throw new Error("This view could not be loaded.");
    }
  }
  const refreshView = useEffectEvent(async () => {
    const generation = viewGeneration.current;
    try {
      if (refreshFlight.current) await refreshFlight.current;
      if (generation !== viewGeneration.current) return;
      await refreshWorkspace();
    } catch {
      if (generation === viewGeneration.current) setViewError(true);
    } finally {
      if (generation === viewGeneration.current) setLoadingView(false);
    }
  });
  useEffect(() => {
    viewGeneration.current++;
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (!demo) void refreshView();
  }, [view, demo]);
  async function openCapture() {
    if ((readOnly && !demo) || !captureAccess.current || capturePreparing) return;
    // Preparing the form can disable Save and move focus to the page body.
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
    if (!demo) {
      setCapturePreparing(true);
      try {
        if (!captureAccess.current || generation !== viewGeneration.current) {
          forgetOrigin();
          return;
        }
        const next = await refreshWorkspace("capture");
        if (!captureAccess.current || generation !== viewGeneration.current) {
          forgetOrigin();
          return;
        }
        if (!next || next.workspaceSlice !== "capture")
          throw new Error("Capture options could not be loaded. Try again.");
        if (next.role === "viewer")
          throw new Error("Your workspace role allows reading posts only.");
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
        setCapturePreparing(false);
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
        `/api/workspace/${organizationId}?view=proposal&proposalId=${encodeURIComponent(proposalId)}`,
        { cache: "no-store" },
      );
      if (generation !== viewGeneration.current) return;
      if (workspaceReadDenied(response))
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
      applyData(next, "proposal");
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
  const [visitedHome, setVisitedHome] = useState(view === "home");
  const homeScroll = useRef(0);
  if (view === "home" && !visitedHome) setVisitedHome(true);
  useEffect(() => {
    if (view !== "home") return;
    const frame = requestAnimationFrame(() => {
      if (homeScroll.current > 0)
        window.scrollTo({ top: homeScroll.current, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [view, organizationId]);
  const livePostIds = home.sources.slice(0, 20).map(id);
  usePostsLive(
    organizationId,
    livePostIds,
    !demo && ["home", "posts", "library"].includes(view),
    (posts) => {
      if (!posts) {
        void refreshData().catch(() =>
          setNotice("Post updates are temporarily unavailable."),
        );
        return;
      }
      const metadata = new Map<string, any>(posts.map((p: any) => [p._id, p]));
      const merge = (current: Initial) => ({
        ...current,
        sources: current.sources.flatMap((source: any) => {
          const next = metadata.get(id(source));
          if (!next) return livePostIds.includes(id(source)) ? [] : [source];
          return [
            {
              ...source,
              ...next,
              personalMedia: next.personalMedia
                ? { ...source.personalMedia, ...next.personalMedia }
                : source.personalMedia,
            },
          ];
        }),
      });
      setData(merge);
      setHomeData((current) => (current ? merge(current) : null));
    },
  );
  const processing =
    (view === "source" &&
      selected &&
      (["queued", "processing"].includes(selected.state) ||
        (!selected.personalAnalysis &&
          selected.workCloudSaveIntent?.analysisGeneration === undefined &&
          selected.workCloudSaveIntent?.generation === selected.generation &&
          selected.workCloudSaveIntent?.expiresAt > Date.now()))) ||
    data.sources.some(
      (s) =>
        ["queued", "processing"].includes(s.state) ||
        ["queued", "running"].includes(s.pendingAnalysisAttemptState),
    ) ||
    data.repositories.some((r) =>
      ["preparing", "drafting_context"].includes(r.status),
    ) ||
    data.runs.some((r) =>
      ["queued", "running", "publishing"].includes(r.state),
    );
  usePolling(
    refreshData,
    processing
      ? 15000
      : view === "source"
        ? selected?.sharedCloud
          ? 60000
          : null
        : 60000,
    !demo && view !== "connections",
    view === "source"
      ? `${organizationId}:source:${selected ? id(selected) : ""}`
      : organizationId,
    view !== "source" && !showingPosts,
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
        "proposalDiscussion",
        "setupJourney",
        "acquisitionStatus",
        "publicOwn",
        "savedPublicDetail",
        "sourceRelationships",
        "postTrends",
        "postEngagementRead",
        "projectRecommendations",
      ].includes(operation)
    ) {
      setNotice(
        "Your viewer role allows reading. Ask a workspace owner to change your role before making changes.",
      );
      if (strict)
        throw new Error("Your current role cannot perform this operation.");
      return;
    }
    const inline =
      operation === "setPostLike" ||
      operation === "postEngagementRead" ||
      operation === "projectPlanningContext" ||
      operation === "projectProposalSave" ||
      operation.startsWith("proposal") && [
        "proposalDiscussion",
        "proposalComment",
        "proposalReply",
        "proposalPlanQuote",
        "proposalPlanStart",
        "proposalIssuePreview",
        "proposalIssueApprove",
        "proposalIssueRetry",
      ].includes(operation);
    if (!inline) {
      setBusy(true);
      setNoticeKind("info");
      setNotice("");
    }
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
        signal:
          operation === "setPostLike" ? AbortSignal.timeout(8000)
            : operation === "postEngagementRead" ? AbortSignal.timeout(4000)
            : operation === "proposalComment" || operation === "proposalReply"
              ? AbortSignal.timeout(12000) : undefined,
      });
      const sessionLost = () => {
        clearAccess();
        throw new Error(
          "Your session or access changed. Sign in again to continue.",
        );
      };
      if (res.redirected || res.status === 401) sessionLost();
      if (!res.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "The application host is temporarily unavailable. No success was confirmed. Check the inbox before retrying this action.",
        );
      const body = await res.json();
      if (!res.ok) {
        if (body.code === "ACCESS_LOST") sessionLost();
        if (body.code === "REAUTH_REQUIRED") redirectForAuthentication();
        if (!demo)
          track("operation_failed", {
            operation,
            code: body.code ?? "UNKNOWN",
          });
        throw Object.assign(new Error(body.error), {
          code: body.code,
          outcome: "rejected",
        });
      }
      if (
        [
          "proposalDiscussion",
          "proposalComment",
          "proposalReply",
          "proposalPlanQuote",
          "proposalPlanStart",
          "proposalIssuePreview",
          "proposalIssueApprove",
          "proposalIssueRetry",
          "projectPlanningContext",
          "projectProposalSave",
          "workCloudTextPreview",
          "workCloudTextApprove",
          "checkPersonalSession",
          "subscriptionTrialList",
          "subscriptionTrialBundle",
          "setupJourney",
          "acquisitionStatus",
          "publicOwn",
          "savedPublicDetail",
          "sourceRelationships",
          "setPostLike",
          "postEngagementRead",
          "postTrends",
          "projectRecommendations",
          "setProjectPriority",
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
      await refreshData().catch(() =>
        setNotice("Saved. Refresh the page to see the update."),
      );
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
      if (!inline && !(e instanceof SignInRedirect)) {
        setNoticeKind("error");
        setNotice(e instanceof Error ? e.message : "The action failed.");
      }
      if (strict) throw e;
    } finally {
      if (!inline) setBusy(false);
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
  useEffect(() => {
    if (view !== "projects" || loadingView) return;
    const revealRepository = () => {
      const anchor = location.hash.slice(1);
      if (!anchor.startsWith("repository-")) return;
      const repository = document.getElementById(anchor);
      const settings =
        document.querySelector<HTMLDetailsElement>("#work-project-settings");
      if (!repository || !settings?.contains(repository)) return;
      settings.open = true;
      if (repository instanceof HTMLDetailsElement) repository.open = true;
      repository.scrollIntoView({ block: "start", behavior: "instant" });
    };
    revealRepository();
    window.addEventListener("hashchange", revealRepository);
    return () => window.removeEventListener("hashchange", revealRepository);
  }, [view, loadingView]);
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
  function prepareNavigation(destination: string, postsQuery = libraryQuery) {
    if (demo || view === destination) return;
    viewGeneration.current++;
    libraryRequest.current++;
    libraryAbort.current?.abort();
    if (loadedView.current === view && !["source", "proposal", "shared"].includes(view)) {
      visitedViews.current.set(view, data);
    }
    const cached = visitedViews.current.get(destination);
    const usesPostList = destination === "posts" || destination === "library";
    if (cached && !["home", "menu"].includes(destination)) {
      loadedView.current = destination;
      const page = libraryPage.current;
      setData(usesPostList
        ? { ...cached, sources: page?.query === postsQuery ? page.sources : [],
            libraryNext: page?.query === postsQuery ? page.libraryNext : null }
        : cached);
    }
    if (usesPostList) {
      setLibraryLoading(libraryPage.current?.query !== postsQuery);
      setLibraryError("");
    }
    setViewError(false);
    setLoadingView(!cached && destination !== "home" && destination !== "menu");
  }
  const prepareHistoryNavigation = useEffectEvent(prepareNavigation);
  const go = (v: string) => {
    if (!demo && v === "billing") {
      router.push(`/app/${organizationId}/billing`);
      return;
    }
    prepareNavigation(v);
    if (view === "home" && v !== view) homeScroll.current = window.scrollY;
    setView(v);
    setSelected(null);
    if (!demo) {
      track("workspace_viewed", { view: v });
      const query = new URLSearchParams();
      if (v === "home" && homePreview.current) query.set("homeMode", "compact");
      if (v === "posts" || v === "library") {
        for (const [key, value] of Object.entries({
          q: search,
          state: filter,
          category,
          sort,
        })) {
          if (value && (key !== "sort" || value !== "newest"))
            query.set(key, value);
        }
      }
      history.pushState(
        history.state,
        "",
        `/app/${organizationId}${v === "home" ? "" : v === "menu" ? "/account" : `/${v}`}${query.size ? `?${query}` : ""}`,
      );
    }
    if (view !== v) window.scrollTo({ top: 0, behavior: "instant" });
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
          "trends",
          "posts",
          "shared",
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
        const query = new URLSearchParams(location.search);
        if (target === "posts" || target === "library") {
          setSearch(query.get("q") ?? "");
          setFilter(query.get("state") ?? "");
          setCategory(query.get("category") ?? "");
          setSort(query.get("sort") ?? "newest");
          if (
            target === "library" &&
            ["q", "state", "category"].some((key) => Boolean(query.get(key)))
          )
            setLibrarySection("posts");
        }
        const destination = target === "account" ? "menu" : target;
        if (destination !== view) {
          prepareHistoryNavigation(destination, new URLSearchParams({
            q: query.get("q") ?? "",
            state: query.get("state") ?? "",
            category: query.get("category") ?? "",
            sort: query.get("sort") ?? "newest",
          }).toString());
          setView(destination);
        }
        setSelected(null);
      }
    };
    // The router may restore a cached list rendered before its URL filters changed.
    const restore = requestAnimationFrame(recover);
    window.addEventListener("popstate", recover);
    return () => {
      cancelAnimationFrame(restore);
      window.removeEventListener("popstate", recover);
    };
  }, [demo, organizationId, view]);
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
  const restoreMorePosts = useEffectEvent(() => void loadLibrary(true));
  useEffect(() => {
    if (demo || !showingPosts || libraryLoading || libraryError) return;
    const position = getPostsReturnPosition();
    const href = location.pathname + location.search;
    if (position?.href !== href) return;

    const frame = requestAnimationFrame(() => {
      if (location.pathname + location.search !== href) return;
      const target = document.querySelector<HTMLElement>(
        `[data-post-id="${CSS.escape(position.postId)}"] .source-hitarea`,
      );
      if (!target) {
        if (data.libraryNext && data.sources.length < position.shown)
          restoreMorePosts();
        return;
      }
      window.scrollTo({ top: position.top, behavior: "instant" });
      if (position.restoreFocus) target.focus({ preventScroll: true });
      try {
        sessionStorage.removeItem(postsReturnKey);
      } catch {
        // Keep the result visible when storage is blocked.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    demo,
    showingPosts,
    libraryLoading,
    libraryError,
    data.libraryNext,
    data.sources.length,
  ]);

  function findSource(s: any) {
    if (!demo) {
      if (showingPosts) {
        try {
          const position: PostsReturnPosition = {
            href: location.pathname + location.search,
            top: window.scrollY,
            postId: id(s),
            shown: data.sources.length,
            restoreFocus:
              document.activeElement?.matches(".source-hitarea:focus-visible") ??
              false,
            recordedAt: Date.now(),
          };
          sessionStorage.setItem(postsReturnKey, JSON.stringify(position));
        } catch {
          // Opening a post does not depend on browser storage.
        }
      }
      track("source_viewed", {
        kind: s.kind,
        state: s.state,
        coverage: s.coverage,
      });
    }
    if (s.searchHref && !demo) {
      const link = new URL(s.searchHref);
      router.push(link.pathname + link.search);
      return;
    }
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
        `/app/${organizationId}/posts/${encodeURIComponent(id(s))}${query.size ? `?${query}` : ""}`,
      );
    }
  }
  const accountView = ["menu", "usage", "runners", "connections", "privacy", "billing"].includes(view);
  const openAccountView = (destination: string) => {
    go(destination);
    if (destination === "billing" && !demo) return;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("main [data-account-heading]")?.focus({ preventScroll: true });
    });
  };
  const nav = [
    ["home", "Home", Home],
    ["posts", "Posts", Library],
    ["trends", "Trends", Gauge],
    ["save", "Save", Plus],
    ["library", "Knowledge", Video],
    ["projects", "Work", GitBranch],
    ["improvements", "Improvements", FileCheck2],
    ["inbox", "Activity", Inbox],
    ["runs", "Runs & PRs", GitPullRequest],
    ["proposals", "Proposals", FileEdit],
    ["usage", "Usage", Gauge],
    ["connections", "Connections", Plug],
    ["runners", "Computers", Laptop],
    ["privacy", "Privacy", ShieldCheck],
    ["billing", "Billing", CreditCard],
  ] as const;
  return (
    <div
      className={`product-shell atlas-shell quiet-shell redesigned-shell ${view === "trends" ? "trends-view" : ""} ${view === "home" ? `feed-view ${demo ? "feed-demo" : ""}` : ""}`}
    >
      <AppTheme />
      <aside className="product-rail">
        <Link
          className="desktop-rail-brand"
          href={demo ? "/demo" : `/app/${organizationId}`}
          prefetch={false}
          aria-label="VibeScroll Home"
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            go("home");
          }}
        >
          <Image src="/icon.svg" alt="" width={30} height={30} />
        </Link>
        <nav aria-label="Application">
          {nav
            .filter(([key]) =>
              ["home", "posts", "save", "projects"].includes(key),
            )
            .map(([key, title, Icon]) => (
              <button
                type="button"
                key={key}
                aria-current={
                  mobileNavigationGroup(view) ===
                  (key === "posts" ? "library" : key)
                    ? "page"
                    : undefined
                }
                className={
                  key === "save"
                    ? "rail-save"
                    : mobileNavigationGroup(view) ===
                        (key === "posts" ? "library" : key)
                      ? "active"
                      : ""
                }
                disabled={
                  key === "save" &&
                  ((readOnly && !demo) || busy || capturePreparing || !accessAvailable)
                }
                aria-busy={key === "save" && capturePreparing ? true : undefined}
                onClick={() => (key === "save" ? void openCapture() : go(key))}
              >
                {key === "save" && capturePreparing ? (
                  <Loader2 className="spinner" size={19} aria-hidden="true" />
                ) : (
                  <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                )}
                {title}
              </button>
            ))}
        </nav>
        <div className="rail-bottom">
          <AccountMenu
            go={go}
            demo={demo}
            profile={profile}
            active={mobileNavigationGroup(view) === "account"}
          />
        </div>
      </aside>
      <div className="product-body">
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
        <main id="main" className="product-main" data-app-view={view}>
          {view === "home" ? (
            <h1 className="sr-only">Home</h1>
          ) : (
            <div
              className={`page-heading ${view === "source" || view === "proposal" ? "detail-heading" : ""} ${view === "source" ? "source-heading" : ""}`}
            >
              <div>
                {!demo && accountView && view !== "menu" && (
                  <AccountBack href={`/app/${organizationId}/account`} label="Account" />
                )}
                <h1
                  data-account-heading={accountView ? "" : undefined}
                  tabIndex={accountView ? -1 : undefined}
                  className={
                    view === "source" || view === "proposal" ? "sr-only" : undefined
                  }
                >
                  {view === "source"
                    ? selected
                      ? postDisplayTitle(selected)
                      : "Source unavailable"
                    : view === "proposal"
                      ? selected?.title
                      : view === "menu"
                        ? "Account"
                        : view === "projects"
                          ? "Projects"
                          : view === "runs"
                            ? "Tasks"
                            : view === "shared"
                              ? "Shared knowledge"
                              : (nav.find((n) => n[0] === view)?.[1] ??
                                "Review plan")}
                </h1>
              </div>
              {selected && (
                <Button
                  busy={busy}
                  onClick={() => go(view === "source" ? "posts" : "proposals")}
                >
                  {view === "source" ? "Back to posts" : "Back to proposals"}
                </Button>
              )}
            </div>
          )}
          {isWorkView(view) && (
            <WorkNavigation
              organizationId={organizationId}
              active={view}
              unread={data.notifications.some((notification) => !notification.read)}
              onNavigate={go}
            />
          )}
          <NoticeToast
            message={captureOpen ? "" : notice}
            kind={noticeKind}
            onDismiss={() => setNotice("")}
          />
          {["posts", "library", "trends", "shared"].includes(view) && (
            <nav className="posts-sections" aria-label="Saved posts">
              {[
                ["posts", "Posts"],
                ["library", "Knowledge"],
                ["trends", "Trends"],
                ...(!data.privateLibrary && !demo || view === "shared"
                  ? [["shared", "Shared"]]
                  : []),
              ].map(([destination, title]) => (
                <button
                  key={destination}
                  type="button"
                  aria-current={view === destination ? "page" : undefined}
                  onClick={() => go(destination)}
                >
                  {title}
                </button>
              ))}
            </nav>
          )}
          {accessAvailable && visitedHome && !loadingView && view === "home" && !demo && publicEdition && publicVersion && (
            <PublicSaveContinuation
              slug={publicEdition}
              version={publicVersion}
              organizationId={organizationId}
              call={strictCall}
              disabled={readOnly}
            />
          )}
          {accessAvailable && visitedHome && (
            <div hidden={view !== "home"}>
              <HomeFeed
                key={organizationId}
                organizationId={organizationId}
                initialPage={home.recentPosts}
                visible={view === "home"}
                demo={demo}
                readOnly={readOnly}
                call={strictCall}
                onSave={() => void openCapture()}
                onPosts={() => go("posts")}
              />
            </div>
          )}
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
          ) : viewError && view !== "home" && loadedView.current !== view ? (
            <ErrorState
              title="This page could not load"
              detail="Try loading this page again."
              onRetry={() => {
                setViewError(false);
                setLoadingView(true);
                void refreshData()
                  .catch(() => setViewError(true))
                  .finally(() => setLoadingView(false));
              }}
            />
          ) : loadingView ||
            (data.compact && view !== "home" && view !== "menu") ? (
            isWorkView(view) ? <WorkLoading view={view} /> : (
              <section aria-busy="true" className="studio-empty">
                <LibrarySkeleton kind={view === "posts" ? "posts" : "page"} rows={3} />
              </section>
            )
          ) : (
            <>
              {viewError && view !== "home" && (
                <output className="fine">
                  Could not refresh this page.{" "}
                  <button type="button" onClick={() => {
                    void refreshData().then(() => setViewError(false)).catch(() => {});
                  }}>Retry</button>
                </output>
              )}
              {view === "shared" && (
                <SharedKnowledge
                  key={`${organizationId}:${JSON.stringify([data.sharedKnowledge, data.selectedSharedKnowledge, data.sharedKnowledgeError])}`}
                  organizationId={organizationId}
                  initial={data.sharedKnowledge}
                  initialDetail={data.selectedSharedKnowledge}
                  initialError={data.sharedKnowledgeError}
                />
              )}
              {view === "improvements" && localSnapshot && (
                <RecordedWorkOutcomes
                  runs={data.runs}
                  repositories={data.repositories}
                  proposals={data.proposals}
                />
              )}
              {view === "improvements" && !localSnapshot && (
                <Improvements
                  key={organizationId}
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
                  onOpenIssues={() => {
                    setProjectEvidenceSection("issues");
                    setProjectEvidenceOpen(true);
                    go("projects");
                  }}
                  onOpenRuns={() => go("runs")}
                  computeReservationCredits={
                    data.customerRoutes?.execution?.computeReservationCredits
                  }
                  creditsPerSecond={
                    data.customerRoutes?.execution?.creditsPerSecond
                  }
                />
              )}
              {view === "trends" && (
                <>
                  <RecentSaveActivity
                    organizationId={organizationId}
                    recent={data.recentPosts}
                    onSave={() => void openCapture()}
                  />
                  {!localSnapshot && (
                    <TrendsDashboard
                      organizationId={organizationId}
                      call={strictCall}
                      demo={demo}
                    />
                  )}
                </>
              )}
              {view === "library" && (
                <>
                  <details
                    className="library-secondary"
                    open={librarySection !== "topics"}
                  >
                    <summary>Library tools</summary>
                    <a
                      href="/help/organize-your-library"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Library and filing help
                    </a>
                    {!localSnapshot && (
                      <LibrarySections
                        active={librarySection}
                        onSelect={setLibrarySection}
                        posts
                      />
                    )}
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
                    {librarySection === "topics" && (
                      <CategoryDirectory
                        key={`categories:${organizationId}`}
                        organizationId={organizationId}
                        categories={data.categories ?? []}
                      />
                    )}
                    {!localSnapshot && (
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
                    )}
                  </div>
                </>
              )}
              {view === "home" && (
                <>
                  {data.privateLibrary && !demo && (
                    <details
                      id="library-purpose"
                      className="quiet-overview"
                      onToggle={(event) =>
                        setLibraryPreferencesOpen(event.currentTarget.open)
                      }
                    >
                      <summary>Library preferences</summary>
                      {libraryPreferencesOpen && (
                        <PrivateLibrary
                          key={organizationId}
                          organizationId={organizationId}
                          call={call}
                          readOnly={readOnly}
                          onOpenSource={findSource}
                          onSave={() => void openCapture()}
                          onProjects={() => go("projects")}
                        />
                      )}
                    </details>
                  )}
                </>
              )}
              {showingPosts && (
                <>
                  <search
                    className="library-tools"
                    aria-label="Search and filter posts"
                  >
                    <div className="posts-search-field">
                      <Search size={18} aria-hidden="true" />
                      <input
                        aria-label="Search posts"
                        type="search"
                        value={search}
                        placeholder="Search posts"
                        onChange={(e) => {
                          setSearch(e.target.value);
                          updatePostsQuery("q", e.target.value);
                        }}
                      />
                      {search && (
                        <button
                          type="button"
                          aria-label="Clear search"
                          className="asset-icon-button"
                          onClick={() => {
                            setSearch("");
                            updatePostsQuery("q", "");
                          }}
                        >
                          <X size={18} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <label>
                      <span className="sr-only">Filter sources</span>
                      <ChoiceSelect
                        aria-label="Filter sources"
                        value={filter}
                        onValueChange={(value) => {
                          setFilter(value);
                          updatePostsQuery("state", value);
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
                          updatePostsQuery("category", value);
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
                          updatePostsQuery("sort", value === "newest" ? "" : value);
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
                      <Button busy={busy} onClick={clearPostsFilters}>
                        Reset filters
                      </Button>
                    )}
                  </search>
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
                  {!libraryError && (
                    <output className="posts-result-status">
                      {libraryLoading && (filtered.length || hasLibraryPage)
                        ? "Updating results…"
                        : filtered.length
                          ? `${filtered.length} ${filtered.length === 1 ? "post shown" : "posts shown"}`
                          : ""}
                    </output>
                  )}
                  <div className="source-list" aria-busy={libraryLoading}>
                    {libraryLoading && !filtered.length && !hasLibraryPage ? (
                      <LibrarySkeleton kind="posts" rows={5} />
                    ) : filtered.length ? (
                      filtered.map((s) => (
                        <article
                          key={id(s)}
                          className="source-card"
                          data-post-id={id(s)}
                        >
                          <button
                            type="button"
                            className="source-hitarea"
                            onClick={() => findSource(s)}
                            aria-label={`Open ${s.title}`}
                          />
                          <SourceThumbnail source={s} demo={demo} />
                          <div className="source-card-body">
                            <h2>{postDisplayTitle(s)}</h2>
                            <div className="source-card-meta">
                              {s.linkPreview?.authorName && (
                                <span>{s.linkPreview.authorName}</span>
                              )}
                              <span className="coverage">
                                {sourceCoverageLabel(s.coverage)}
                              </span>
                              {!demo && s.state !== "ready" && (
                                <span className="source-state">
                                  {label(s.state ?? "ready")}
                                </span>
                              )}
                            </div>
                            <p>
                              {s.summary ??
                                (s.state === "needs_upload"
                                  ? "Source media has not been retrieved. Open the post for details."
                                  : ["processing", "queued"].includes(s.state)
                                    ? "Transcribing and analyzing your source…"
                                    : s.state === "failed"
                                      ? "Analysis stopped. Open for details."
                                      : "Ready for analysis.")}
                            </p>
                            <div className="row wrap source-card-details">
                              {s.createdAt && (
                                <time
                                  className="fine"
                                  dateTime={new Date(s.createdAt).toISOString()}
                                >
                                  Added {calendarDate.format(s.createdAt)}
                                </time>
                              )}
                              {sort === "published" && (
                                <span className="fine">
                                  {s.publishedAt
                                    ? `Published ${calendarDate.format(s.publishedAt)}`
                                    : "Publication date unavailable"}
                                </span>
                              )}
                              {sort === "saved" && (
                                <span className="fine">
                                  {s.originalSavedAt
                                    ? `Saved ${calendarDate.format(s.originalSavedAt)}`
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
                              {(s.categoryNames?.length ? s.categoryNames : s.categoryKeys?.map(postTopicName) ?? s.tags)
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
                            : "Save a supported post link."}
                        </p>
                        <Button
                          busy={busy}
                          primary
                          onClick={() =>
                            search || filter || category
                              ? clearPostsFilters()
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
                      busy={libraryLoading}
                      onClick={() => void loadLibrary(true)}
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
                  authoritative={
                    data.workspaceSlice === "source" &&
                    data.selectedSource === selected
                  }
                  readOnly={readOnly}
                  busy={busy}
                  canSuggestCategories={canSuggestCategories}
                  canRepairEvidence={canRepairEvidence}
                  demo={demo}
                  org={organizationId}
                  repos={data.repositories}
                  projectSuggestions={data.projectSuggestions}
                  devices={data.devices ?? []}
                  personalEnabled={
                    !demo && data.aiPreference?.personalAlphaEnabled === true
                  }
                  linkAnalysisEnabled={data.aiPreference?.linkAnalysisEnabled}
                  cloudEnabled={data.aiPreference?.cloudAnalysisEnabled}
                  preparedEnabled={data.aiPreference?.preparedAnalysisEnabled}
                  call={call}
                  strictCall={strictCall}
                  onRefresh={() => {
                    void refreshWorkspace().catch(() => setViewError(true));
                  }}
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
                  <WorkProjects
                    organizationId={organizationId}
                    repositories={data.repositories}
                    projects={data.projects}
                    proposals={data.proposals}
                    canCreate={!readOnly && !demo && ["owner", "admin"].includes(data.role ?? "")}
                    onOpenProposal={demo ? (proposalId) => void openProposal(proposalId) : undefined}
                    onManage={() => {
                      const settings = document.querySelector<HTMLDetailsElement>("#work-project-settings");
                      if (!settings) return;
                      settings.open = true;
                      settings.querySelector("summary")?.focus();
                    }}
                  />
                  <details
                    id="work-project-settings"
                    className="panel atlas-project-settings work-project-settings"
                    open={!data.repositories.some((r) => r.enabled)}
                  >
                    <summary>Project connections and context</summary>
                    <RepositoryChecklist
                      key={`selection:${organizationId}`}
                      organizationId={organizationId}
                      repositories={data.repositories}
                      choices={data.githubChoices ?? []}
                      call={call}
                      readOnly={readOnly || localSnapshot}
                      demo={demo}
                    />
                    {data.repositories.length > 0 && (
                      <section className="work-context-list" aria-label="Saved project context">
                        <h2>Project context</h2>
                        {data.repositories.map((r) => (
                          <BusinessContext
                            key={`${id(r)}:${r.profileVersion}:${r.selectionVersion ?? 0}:${r.profileDraftSha ?? ""}`}
                            repo={r}
                            call={call}
                            readOnly={readOnly || demo || localSnapshot}
                          />
                        ))}
                      </section>
                    )}
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
                <WorkProposals
                  organizationId={organizationId}
                  proposals={data.proposals}
                  repositories={data.repositories}
                  onOpenProposal={demo ? (proposalId) => void openProposal(proposalId) : undefined}
                  onOpenPosts={() => go("posts")}
                />
              )}
              {view === "proposal" && selected && (
                <StandaloneProposal
                  proposal={
                    selected.repo
                      ? selected
                      : {
                          ...selected,
                          repo: {
                            fullName:
                              data.repositories.find(
                                (repo) => id(repo) === selected.repositoryId,
                              )?.fullName ?? "Project",
                          },
                        }
                  }
                  organizationId={organizationId}
                  showReferences={!demo}
                  fit={
                    data.projectSuggestions?.items.find(
                      (project) => project.id === selected.repositoryId,
                    )?.fit
                  }
                  call={strictCall}
                  readOnly={readOnly}
                  discussionEnabled={
                    selected.detail?.schemaVersion === "chat-project-proposal-v1" &&
                    !demo &&
                    !localSnapshot
                  }
                >
                  {selected.detail?.schemaVersion !== "chat-project-proposal-v1" && (
                    <div className="work-proposal-support">
                      <section className="work-detail-card work-review-summary">
                        <h3>Assessment</h3>
                        <WorkStatus value={selected.disposition} />
                        {selected.reviewerCorrection && (
                          <p>
                            Changed from {label(selected.reviewerCorrection.from)} to{" "}
                            {label(selected.reviewerCorrection.to)}.{" "}
                            {selected.reviewerCorrection.reason}
                          </p>
                        )}
                        {selected.detail?.benefitHypothesis && (
                          <div>
                            <h4>Expected benefit</h4>
                            <p>{selected.detail.benefitHypothesis}</p>
                          </div>
                        )}
                        {!!selected.detail?.risks?.length && (
                          <div>
                            <h4>Risks</h4>
                            <ul>
                              {selected.detail.risks.map((risk: string) => (
                                <li key={risk}>{risk}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {!localSnapshot && (!readOnly || demo) && (
                          <div className="work-review-actions">
                            {([
                              ["accepted", "Accept proposal"],
                              ["rejected", "Reject"],
                              ["deferred", "Defer"],
                            ] as const).map(([decision, action]) => (
                              <Button
                                busy={busy}
                                key={decision}
                                primary={decision === "accepted"}
                                disabled={
                                  decision === "accepted" &&
                                  selected.disposition !== "relevant"
                                }
                                onClick={async () => {
                                  await call("decide", {
                                    id: id(selected),
                                    version: selected.version,
                                    decision,
                                    note: "",
                                  });
                                  if (demo)
                                    setSelected({ ...selected, review: decision });
                                }}
                              >
                                {action}
                              </Button>
                            ))}
                          </div>
                        )}
                      </section>
                      <ProposalTrail
                        proposal={selected}
                        runs={data.runs.filter(
                          (run) => run.proposalId === id(selected),
                        )}
                      />
                      {(selected.detail?.sourceEvidence ||
                        selected.detail?.repositoryEvidence) && (
                        <details className="work-detail-card work-review-detail">
                          <summary>Source and repository evidence</summary>
                          <pre>
                            {JSON.stringify(
                              {
                                source: selected.detail.sourceEvidence,
                                repository: selected.detail.repositoryEvidence,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      )}
                      {!demo && !readOnly && !localSnapshot && (
                        <details className="work-detail-card work-review-detail">
                          <summary>Correct the assessment</summary>
                          <form
                            className="form-grid"
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
                            <button
                              className="button primary"
                              disabled={busy}
                              type="submit"
                            >
                              {busy
                                ? "Saving assessment…"
                                : "Accept reviewed relevant proposal"}
                            </button>
                          </form>
                        </details>
                      )}
                      {!localSnapshot && (!readOnly || demo) && (
                        <>
                          <details className="work-detail-card work-review-detail">
                            <summary>Plan editor and export</summary>
                            <div className="form-grid">
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
                                Draft editable plan · up to 10 credits
                              </Button>
                              {selected.planDraft &&
                                selected.planDraftVersion === selected.version && (
                                  <details>
                                    <summary>Unconfirmed plan draft</summary>
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
                                      Copy draft into editor
                                    </Button>
                                  </details>
                                )}
                              <p>
                                Save a new plan version before requesting execution.
                                Existing files must appear in the repository snapshot.
                              </p>
                              <PlanEditor
                                value={planText}
                                onChange={setPlanText}
                                disabled={busy || readOnly}
                              />
                              <div className="work-review-actions">
                                <Button
                                  primary
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
                              </div>
                            </div>
                          </details>
                          <details className="work-detail-card work-review-detail">
                            <summary>Execution approval</summary>
                            <ExecutionApproval
                              proposal={selected}
                              call={call}
                              routes={data.customerRoutes}
                              usage={data.usage}
                              busy={busy}
                            />
                          </details>
                        </>
                      )}
                    </div>
                  )}
                </StandaloneProposal>
              )}
              {view === "runs" && (
                <WorkTasks
                  runs={data.runs}
                  onOpenProposals={() => go("proposals")}
                  render={(run) => {
                    const proposal = data.proposals.find((p) => id(p) === run.proposalId);
                    const repository = data.repositories.find((p) => id(p) === run.repositoryId);
                    return (
                      <RunCard
                        key={id(run)}
                        run={run}
                        title={proposal?.title}
                        repository={repository?.fullName}
                        handoff={proposal?.detail?.handoff}
                        call={call}
                        busy={busy}
                        readOnly={readOnly || localSnapshot}
                      />
                    );
                  }}
                />
              )}
              {view === "inbox" && (
                <WorkActivity
                  organizationId={organizationId}
                  notifications={data.notifications}
                  proposals={data.proposals}
                  connections={data.connections}
                  onOpenProposal={demo ? (proposalId) => void openProposal(proposalId) : undefined}
                  onConnections={() => go("connections")}
                  onProposals={() => go("proposals")}
                  settings={
                    <details className="panel activity-settings">
                    <summary>Notification settings</summary>
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
                  </details>
                  }
                />
              )}
              {view === "usage" && (
                <UsageSummary
                  usage={
                    data.workspaceSlice === "usage"
                      ? data.usage
                      : usageOverview(data.usage)
                  }
                  organizationId={organizationId}
                  retry={localSnapshot ? undefined : refreshData}
                />
              )}
              {view === "connections" && (
                <AccountConnections
                  organizationId={organizationId}
                  canLoad={!localSnapshot}
                  canViewLaunchChecks={
                    !demo && (data.role === "owner" || data.role === "admin")
                  }
                  githubConnected={Boolean(
                    data.connections?.some(
                      (connection) =>
                        connection.provider === "github" &&
                        connection.status === "connected",
                    ),
                  )}
                  providerStatus={data.customerRoutes?.status}
                  reviewedModels={data.customerRoutes?.models.length ?? 0}
                  readOnly={readOnly}
                  role={data.role}
                  demo={demo}
                  busy={busy}
                  call={call}
                  openProjects={() => go("projects")}
                />
              )}
              {view === "runners" && (
                <AccountComputers
                  key={organizationId}
                  organizationId={organizationId}
                  devices={data.devices ?? []}
                  canPair={
                    !demo &&
                    !localSnapshot &&
                    !readOnly &&
                    (data.role === "owner" || data.role === "admin")
                  }
                  canRevoke={
                    !demo && !localSnapshot && !readOnly && data.role === "owner"
                  }
                  busy={busy}
                  call={call}
                />
              )}
              {view === "privacy" && (
                <div className="account-content">
                  <AccountSection
                    title="Your data"
                    icon={ShieldCheck}
                    description="Sources, summaries and project context belong to your workspace. Original media expires under your workspace retention policy."
                  >
                    <div className="account-actions">
                      {!localSnapshot && <a className="secondary" href={`/app/${organizationId}/content-export`}>
                        Export workspace content
                      </a>}
                      <Link prefetch={false} className="secondary" href={`/account?workspace=${organizationId}`}>
                        Account data and deletion
                      </Link>
                      {data.role === "owner" && (
                        <Link prefetch={false} className="secondary" href={`/app/${organizationId}/settings`}>
                          Workspace settings
                        </Link>
                      )}
                    </div>
                  </AccountSection>
                  <div className="account-grid">
                    <AccountSection title="Cookies and notifications">
                      <div className="account-actions">
                        <CookieSettings className="secondary" />
                        {!localSnapshot && (
                          <Button
                            busy={busy}
                            disabled={readOnly}
                            onClick={() => call("preferences", {
                              organizationId,
                              email: false,
                              telegram: false,
                              analytics: false,
                              legalVersion: policyRelease.id,
                            })}
                          >
                            Turn off optional notifications and analytics
                          </Button>
                        )}
                      </div>
                    </AccountSection>
                    <AccountSection title="Accessibility">
                      <MotionPreference control />
                    </AccountSection>
                  </div>
                  {!demo && !localSnapshot && (
                    <CloudCatalogReceipts
                      key={organizationId}
                      organizationId={organizationId}
                      disabled={readOnly || busy}
                      call={(operation, args) => call(operation, args, true)}
                    />
                  )}
                </div>
              )}
              {view === "billing" && (
                <div className="account-content">
                  <section className="account-section account-billing-offer">
                    <ProOfferSummary />
                    <Link className="button secondary" href="/pricing" prefetch={false}>
                      Compare renewal options
                    </Link>
                  </section>
                </div>
              )}
              {view === "menu" && (
                <AccountOverview
                  avatar={
                    <ProfileAvatar
                      profile={
                        profile ?? (demo ? { firstName: "Demo" } : undefined)
                      }
                    />
                  }
                  name={
                    profile?.name ||
                    profile?.firstName ||
                    (demo ? "Demo account" : "Your profile")
                  }
                  workspace={data.workspaceName ?? (demo ? "Demo workspace" : "Current workspace")}
                  organizationId={organizationId}
                  role={data.role}
                  privateLibrary={data.privateLibrary}
                  demo={demo}
                  go={openAccountView}
                />
              )}
            </>
          )}
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.slice(0, 2).map(([key, title, Icon]) => (
            <button
              className={
                mobileNavigationGroup(view) ===
                (key === "posts" ? "library" : key)
                  ? "active"
                  : ""
              }
              aria-current={
                mobileNavigationGroup(view) ===
                (key === "posts" ? "library" : key)
                  ? "page"
                  : undefined
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
            disabled={(readOnly && !demo) || busy || capturePreparing || !accessAvailable}
            aria-busy={capturePreparing || undefined}
            onClick={() => {
              void openCapture();
            }}
          >
            {capturePreparing ? (
              <Loader2 className="spinner" size={20} aria-hidden="true" />
            ) : (
              <Plus size={20} aria-hidden="true" />
            )}
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
            Work
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
            <div className="capture-heading">
              <h2 id="capture-title">Save a post</h2>
              <button
                type="button"
                className="asset-icon-button"
                aria-label="Close save dialog"
                onClick={() => setCaptureOpen(false)}
              >
                <X size={21} aria-hidden="true" />
              </button>
            </div>
            {noticeKind === "error" && notice && (
              <ErrorState title="Save needs attention" detail={notice} />
            )}
            <CaptureForm
              devices={data.devices ?? []}
              personalEnabled={data.aiPreference?.personalAlphaEnabled}
              linkAnalysisEnabled={data.aiPreference?.linkAnalysisEnabled}
              cloudEnabled={data.aiPreference?.cloudAnalysisEnabled}
              preparedEnabled={data.aiPreference?.preparedAnalysisEnabled}
              preferredRoute={data.aiPreference?.processingRoute}
              workCloud={data.aiPreference?.workCloud}
              onSetupNavigate={() => setCaptureOpen(false)}
              sharedDraft={captureDraft.current ?? sharedDraft}
              onDraftChange={(url: string) => {
                captureDraft.current = url;
              }}
              demo={demo}
              organizationId={organizationId}
              call={call}
              onDone={(sourceId?: string) => {
                setCaptureOpen(false);
                setSharedDraft("");
                captureDraft.current = null;
                if (sourceId)
                  findSource({
                    _id: sourceId,
                    title: "Saved post",
                    state: "processing",
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
export function CaptureForm({
  demo,
  organizationId,
  call,
  onDone,
  devices = [],
  personalEnabled = false,
  linkAnalysisEnabled = false,
  cloudEnabled = false,
  preparedEnabled = false,
  preferredRoute,
  workCloud = null,
  onSetupNavigate,
  sharedDraft,
  onDraftChange,
}: any) {
  const kindId = useId();
  const [kind, setKind] = useState("url");
  const [saving, setSaving] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(
    preferredRoute !== "save_only",
  );
  const [analysisRoute, setAnalysisRoute] = useState(
    preferredRoute === "local"
      ? "personal"
      : preferredRoute === "work_cloud"
        ? "work_cloud"
        : preferredRoute === "cloud"
          ? "cloud"
          : preferredRoute === "save_only"
            ? ""
            : workCloud?.configured
              ? "work_cloud"
              : personalEnabled
                ? "personal"
                : cloudEnabled || preparedEnabled
                  ? "cloud"
                  : "",
  );
  const paired = devices.filter(
    (d: any) => d.personalOwned && d.state === "paired",
  );
  const eligible = paired.filter(
    (d: any) => d.personalOnline && d.personalModels?.length,
  );
  const [chosenDevice, setChosenDevice] = useState(
    eligible.length === 1 ? id(eligible[0]) : "",
  );
  const computer = eligible.find((d: any) => id(d) === chosenDevice);
  const [chosenModel, setChosenModel] = useState("");
  const effectiveModel =
    chosenModel ||
    computer?.personalModels.find(
      (m: any) => m.slug === "gpt-6.1-sol" || m.slug === "gpt-5.6-sol",
    )?.slug ||
    computer?.personalModels[0]?.slug ||
    "";
  const personalAutomatic =
    personalEnabled &&
    analysisRoute === "personal" &&
    autoAnalyze &&
    linkAnalysisEnabled;
  const cloudAutomatic =
    analysisRoute === "cloud" &&
    (cloudEnabled || (preparedEnabled && kind === "url")) &&
    autoAnalyze &&
    (linkAnalysisEnabled || (preparedEnabled && kind === "url"));
  const workCloudAutomatic =
    analysisRoute === "work_cloud" &&
    kind === "url" &&
    workCloud?.available;
  const automatic = personalAutomatic || cloudAutomatic || workCloudAutomatic;
  const approval = {
    deviceId: chosenDevice,
    model: effectiveModel,
    effort: "medium",
    useOwnPlan: true,
    maxComputeCredits: 10,
  };
  const checkAutomatic = async (f: FormData) => {
    if (
      analysisRoute === "work_cloud" &&
      (!workCloudAutomatic || !workCloud?.grantId || !workCloud?.grantVersion)
    )
      throw new Error(
        "Finish ChatGPT setup for this post link, or save without analysis. Cloud will not switch to another task location.",
      );
    if (cloudAutomatic && f.get("cloudCredits") !== "on")
      throw new Error("Approve the processing-credit maximum before analysis.");
    if (!personalAutomatic) return;
    if (!computer || !effectiveModel || f.get("ownPlan") !== "on")
      throw new Error(
        "Choose your online computer and approve using your ChatGPT plan.",
      );
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
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const saveOnly =
          (e.nativeEvent as SubmitEvent | undefined)?.submitter?.getAttribute(
            "name",
          ) === "saveOnly";
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
        if (saving) return;
        setSaving(true);
        setImportError("");
        try {
          if (!saveOnly) await checkAutomatic(f);
          if (workCloudAutomatic && !saveOnly) {
            const result = await call("captureWorkCloud", {
              organizationId,
              key: crypto.randomUUID(),
              title: String(f.get("title") || defaultLinkTitle),
              url: f.get("url"),
              rightsAttested: f.get("rights") === "on",
              grantId: workCloud.grantId,
              grantVersion: workCloud.grantVersion,
            });
            if (result?.sourceId) onDone(result.sourceId, true);
            return;
          }
          const sourceId = await call("capture", {
            organizationId,
            key: crypto.randomUUID(),
            kind: "url",
            title: String(f.get("title") || defaultLinkTitle),
            url: f.get("url"),
            rightsAttested: f.get("rights") === "on",
          });
          if (!sourceId) return;
          if (automatic && !saveOnly) {
            const queued = personalAutomatic
              ? await call("approvePersonalBatch", {
                  ...approval,
                  sources: [
                    {
                      id: sourceId,
                      generation: 0,
                    },
                  ],
                })
              : preparedEnabled && kind === "url"
                ? await (async () => {
                    const quote = await call("preparedAnalysisQuote", {
                      sourceId,
                      executor: "gateway",
                    });
                    if (!quote || quote.maximumCredits > 11)
                      throw new Error(
                        "Review the current processing credit maximum.",
                      );
                    return call("preparedAnalysisStart", {
                      sourceId,
                      executor: "gateway",
                      key: `app-save-${sourceId}-${quote.generation}`,
                      quoteHash: quote.quoteHash,
                      maximumCredits: quote.maximumCredits,
                    });
                  })()
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
      <div className="capture-kind">
        <label htmlFor={kindId}>Post type</label>
        <ChoiceSelect
          id={kindId}
          aria-label="Post type"
          disabled={importBusy}
          value={kind}
          onValueChange={(value) => setKind(value)}
        >
          <option value="url">Link</option>
          <option value="import">Import Instagram saves</option>
        </ChoiceSelect>
      </div>
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
      ) : (
        <label>
          Post link
          <input
            name="url"
            type="url"
            defaultValue={sharedDraft ?? ""}
            onChange={(event) => onDraftChange?.(event.target.value)}
            placeholder="Paste a link"
            required
          />
        </label>
      )}
      {kind !== "import" && (
        <label>
          Title (optional)
          <input name="title" maxLength={160} />
        </label>
      )}
      <label className="check">
        <input name="rights" type="checkbox" required />I may submit this
        content for processing
      </label>
      <details className="capture-analysis" open={automatic || undefined}>
        <summary>Analysis options</summary>
        <TaskRuntimePicker
        organizationId={organizationId}
        value={
          analysisRoute === "personal"
            ? "local"
            : analysisRoute === "cloud"
              ? "cloud"
              : analysisRoute === "work_cloud"
                ? "work_cloud"
                : undefined
        }
        onChange={(value) => {
          if (value === "local") setAnalysisRoute("personal");
          if (value === "cloud") setAnalysisRoute("cloud");
          if (value === "work_cloud") setAnalysisRoute("work_cloud");
        }}
        serverAvailable={cloudEnabled || (preparedEnabled && kind === "url")}
        workCloudAvailable={
          !!workCloud?.available && kind === "url"
        }
        workCloudConfigured={workCloud?.configured}
        localAvailable={personalEnabled}
        localConfigured={paired.length > 0}
        localStatus={
          eligible.length
            ? "check_before_running"
            : paired.some((device: any) => device.personalOnline)
              ? "setup_required"
              : paired.length
                ? "offline"
                : "setup_required"
        }
        disabled={saving || importBusy}
        onSetupNavigate={onSetupNavigate}
        />
      </details>
      {personalEnabled &&
        analysisRoute === "personal" &&
        linkAnalysisEnabled && (
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
                    onValueChange={(value) => setChosenModel(value)}
                  >
                    {!computer && (
                      <option value="">Connect your computer first</option>
                    )}
                    {computer?.personalModels.map((m: any) => (
                      <option key={m.slug} value={m.slug}>
                        {m.displayName}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
                <label className="check">
                  <input name="ownPlan" type="checkbox" required />
                  Use my ChatGPT plan with medium reasoning. Reserve up to 10
                  compute credits per video
                  {kind === "import" ? ", up to five videos per batch" : ""}.
                </label>
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
        (cloudEnabled || (preparedEnabled && kind === "url")) &&
        (linkAnalysisEnabled || (preparedEnabled && kind === "url")) && (
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
                Use cloud processing, up to{" "}
                {preparedEnabled && kind === "url" ? 11 : 10} credits per source
                {kind === "import" ? ", up to five sources per batch" : ""}. No
                personal-plan or paid AI fallback.
              </label>
            )}
          </section>
        )}
      <p className="fine">
        {workCloudAutomatic
          ? "ChatGPT receives this link and checks its runtime before analysis. Your computer can be off. No VibeScroll processing credits or paid API fallback."
          : cloudAutomatic
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
              ? "Saving..."
              : automatic
                ? "Save and analyze"
                : "Save link"}
      </button>
      {analysisRoute === "work_cloud" && kind === "url" && (
          <button
            type="submit"
            name="saveOnly"
            className="secondary"
            disabled={saving}
          >
            Save only
          </button>
        )}
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
export function SourceDetail({
  source,
  authoritative = false,
  readOnly,
  busy,
  canSuggestCategories,
  canRepairEvidence = false,
  onRefresh,
  demo,
  org,
  repos,
  projectSuggestions,
  devices,
  personalEnabled,
  linkAnalysisEnabled,
  cloudEnabled,
  call,
  strictCall,
  journey,
  onProposal,
}: any) {
  const [detail, setDetail] = useState(source);
  const [detailLoading, setDetailLoading] = useState(!demo && !authoritative);
  const [excludedInsights, setExcludedInsights] = useState<string[]>([]);
  const [viewFrame, setViewFrame] = useState<string>();
  const [allFrames, setAllFrames] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [manualCloudOpen, setManualCloudOpen] = useState(false);
  const [publicationMounted, setPublicationMounted] = useState(false);
  const [postSettingsOpen, setPostSettingsOpen] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);
  const [cloudRequestError, setCloudRequestError] = useState("");
  const transcript = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const anchor = window.location.hash.slice(1);
    if (!["post-settings", "post-settings-evidence", "source-transcript"].includes(anchor)) return;
    setSettingsAnchor(anchor === "post-settings" ? null : anchor);
    setPostSettingsOpen(true);
    if (anchor === "source-transcript") setTranscriptOpen(true);
  }, []);
  function openPostSettings(anchor: string) {
    setSettingsAnchor(anchor);
    setPostSettingsOpen(true);
    if (anchor === "source-transcript") setTranscriptOpen(true);
  }
  useEffect(() => {
    if (!postSettingsOpen || !settingsAnchor) return;
    const timer = setTimeout(() => {
      const target = document.getElementById(settingsAnchor);
      if (target) {
        if (target instanceof HTMLDetailsElement) target.open = true;
        target.scrollIntoView({ block: "start" });
        target.focus({ preventScroll: true });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [postSettingsOpen, settingsAnchor]);

  const cloudSpeechSegments =
    detail.preparedService?.transcript ??
    (isCloudObservedMedia(detail.orderedMedia?.post)
      ? detail.orderedMedia.post.segments
      : (detail.sharedCloud?.transcript ?? null));
  const sourceId = id(source);
  const liveVersion = useRef<string | undefined>(undefined);
  useSourceLive(sourceId, !demo, (next) => {
    if (!next) {
      setDetail({
        _id: sourceId,
        state: "deleted",
        error: "This post is unavailable.",
      });
      void onRefresh?.();
      return;
    }
    setDetail((previous: any) =>
      previous._id === next._id
        ? {
            ...previous,
            ...next,
            personalMedia: next.personalMedia
              ? { ...previous.personalMedia, ...next.personalMedia }
              : previous.personalMedia,
          }
        : previous,
    );
    const version = `${next.selectedAnalysisVersionId}:${next.personalMedia?.versionId}`;
    if (liveVersion.current !== undefined && liveVersion.current !== version)
      void onRefresh?.();
    liveVersion.current = version;
  });
  const proposalRevision = (source.proposals ?? [])
    .map(
      (proposal: any) =>
        `${id(proposal)}:${proposal.updatedAt}:${proposal.version}:${proposal.review}`,
    )
    .sort()
    .join("|");
  const sourceRevision = `${source.generation}:${source.updatedAt}:${source.linkPreview?.updatedAt}:${source.personalAnalysis?.state}:${source.personalAnalysis?.stage}:${source.personalAnalysis?.leaseUntil}:${source.workCloudSaveIntent?.expiresAt}:${source.analysisSelectionRevision}:${source.personalMedia?.versionId}:${source.pendingAnalysisAttemptId}:${source.pendingAnalysisAttemptState}:${source.sharedCloud?.recommendationRevision}:${source.sharedCloud?.notesUpdatedAt}:${source.analysisVersion?.id}:${proposalRevision}:${workCloudHandoffKey(source.workCloudHandoff)}`;
  const [retentionTime, setRetentionTime] = useState(Date.now);
  const progressSource =
    source.generation > detail.generation ||
    source.updatedAt > detail.updatedAt ||
    (source.generation === detail.generation &&
      source.updatedAt === detail.updatedAt &&
      source.state !== detail.state)
      ? source
      : detail;
  const retentionDeadline = Math.min(
    source.sourceRetentionUntil ?? Infinity,
    detail.sourceRetentionUntil ?? Infinity,
  );
  const statusDeadline = Math.min(
    retentionDeadline,
    sourceProgressDeadline(progressSource),
  );
  useEffect(() => {
    if (demo || !Number.isFinite(statusDeadline)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      if (!active) return;
      const remaining = statusDeadline - Date.now();
      if (remaining > 0)
        timer = setTimeout(check, Math.min(remaining, 2147483647));
      else setRetentionTime(Date.now());
    };
    check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [demo, statusDeadline]);
  const savedFrames = sourceEvidenceFrames(detail, retentionTime);
  const orderedSlides = orderedFeedMedia(detail);
  const showCarousel = orderedSlides.length > 1 || orderedSlides.some((s) => s.kind === "image");
  const untimedImages =
    (savedFrames.length > 0 &&
      savedFrames.every((frame: any) => frame.mediaKind === "image")) ||
    (detail.coverage === "visual_only" &&
      savedFrames.length > 1 &&
      savedFrames.every((frame: any) => frame.startMs === 0));
  const imageLabel = (frameId: string) => {
    const position = savedFrames.findIndex(
      (frame: any) => frame.id === frameId,
    );
    return position < 0 ? "Image" : `Image ${position + 1}`;
  };
  const frameLabel = (frame: any) =>
    frame.sourceAssetId
      ? `Attachment ${frame.sourceAssetIndex + 1} · ${frame.mediaKind === "image" ? "Image" : `${(frame.startMs / 1000).toFixed(1)}s`}`
      : untimedImages
        ? imageLabel(frame.id)
        : `${(frame.startMs / 1000).toFixed(1)}s`;
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
    if (authoritative) {
      setDetail(source);
      setDetailLoading(false);
      return;
    }
    const abort = new AbortController();
    fetch(`/api/source/${sourceId}?organizationId=${encodeURIComponent(org)}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (abort.signal.aborted) return;
        if (workspaceReadDenied(response) || response.status === 404) {
          setDetail({ _id: sourceId, state: "deleted", error: "This post is unavailable." });
          return;
        }
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          throw new Error("Source unavailable");
        const next = await response.json();
        if (!abort.signal.aborted) setDetail(next);
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setDetail((current: any) => ({
            ...current,
            error: "Could not refresh this post. Try again in a moment.",
          }));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setDetailLoading(false);
      });
    return () => abort.abort();
    // The workspace projection is a new object after every poll. Reload private
    // evidence only when this source or its linked proposal revision changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, sourceRevision, org, demo, authoritative]);
  const sourceInsights =
    detail.analysis?.insights ??
    (demo
      ? detail.mainPoints?.map((title: string) => ({
          title,
          claim: title,
          evidence: [],
        }))
      : []) ??
    [];
  const insights = sourceInsights.map((insight: any) => ({
    ...insight,
    evidence: (insight.evidence ?? []).map((ref: any) =>
      cloudCitationForDisplay(detail, ref, retentionTime),
    ),
  }));
  const summary =
    detail.summary ??
    (["queued", "processing"].includes(detail.state)
      ? "Analysis is underway."
      : "No analysis yet.");
  const displayedCategories = detail.categoryNames?.length
    ? detail.categoryNames
    : (detail.categoryKeys?.length ? detail.categoryKeys : postTopics(detail))
        .map(postTopicName);
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
  if (!demo && retentionDeadline <= Math.max(retentionTime, Date.now()))
    return (
      <section className="panel">
        <p>This source is unavailable or its retained evidence has expired.</p>
      </section>
    );
  const postTools = (
    <div className="post-reader-tools">
      <SettingsPanel
        title="Advanced settings"
        triggerLabel="Advanced settings"
        variant="post"
        showTriggerLabel
        open={postSettingsOpen}
        onOpenChange={(open) => {
          setPostSettingsOpen(open);
          if (!open) setSettingsAnchor(null);
        }}
      >
        <section className="post-settings-group" aria-label="Analysis and history">
          <h3>Analysis and history</h3>
          {!demo && !detailLoading && detail.kind === "url" && (
            <PreparedAnalysisControl
              key={sourceId}
              sourceId={sourceId}
              ready={detail.state === "ready"}
              revision={sourceRevision}
              disabled={
                readOnly ||
                busy ||
                ["processing", "queued"].includes(detail.state)
              }
              call={strictCall ?? call}
              onChange={() => onRefresh?.()}
            />
          )}
          {!demo &&
            !detailLoading &&
            detail.state === "ready" &&
            (isCloudObservedMedia(detail.orderedMedia?.post) ||
              detail.preparedService ||
              detail.sharedCloud) && (
              <AnalysisHistory
                key={sourceId}
                sourceId={sourceId}
                revision={sourceRevision}
                disabled={readOnly || busy}
                reanalysisDisabled={!detail.workCloudMediaEnabled}
                recommendationMode={detail.sharedCloud?.selectionMode}
                call={strictCall ?? call}
                onChange={() => onRefresh?.()}
              />
            )}
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
          </details>{" "}
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
          {!demo &&
            canRepairEvidence &&
            !readOnly &&
            detail.personalAnalysis?.executor === "work_cloud" &&
            detail.personalAnalysis.state === "completed" &&
            isCloudObservedMedia(detail.orderedMedia?.post) &&
            detail.orderedMedia.post.frames.length > savedFrames.length && (
              <details className="source-notes">
                <summary>Restore missing screenshots</summary>
                <p>
                  Restore the exact retained screenshots while preserving this
                  analysis. A connected Cloud task must perform the bounded
                  repair.
                </p>
                {detail.personalAnalysis.cloud.media?.evidenceRepair ? (
                  <p>
                    Evidence repair:{" "}
                    {detail.personalAnalysis.cloud.media.evidenceRepair.state}.
                    Review that attempt before starting another.
                  </p>
                ) : (
                  <Button
                    busy={busy}
                    onClick={async () => {
                      const result = await call(
                        "workCloudEvidenceRepairApprove",
                        {
                          sourceId,
                          generation: detail.generation,
                          preparationHash:
                            detail.personalAnalysis.cloud.media.preparationHash,
                          acknowledged: true,
                        },
                      );
                      if (result) await onRefresh?.();
                    }}
                  >
                    Approve screenshot repair
                  </Button>
                )}
              </details>
            )}
        </section>
        <section className="post-settings-group" aria-label="Evidence">
          <h3>Evidence</h3>
          <span id="post-settings-evidence" tabIndex={-1} />
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
            {cloudSpeechSegments ? (
              cloudSpeechSegments.length ? (
                cloudSpeechSegments.map((segment: any) => (
                  <div key={segment.id}>
                    <p className="fine">
                      Original transcript segment:{" "}
                      {(segment.startMs / 1000).toFixed(1)}–
                      {(segment.endMs / 1000).toFixed(1)} seconds.
                    </p>
                    <p style={{ whiteSpace: "pre-wrap" }}>{segment.text}</p>
                  </div>
                ))
              ) : (
                <p>Original transcript is unavailable.</p>
              )
            ) : (
              <>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {detail.originalText ??
                    detail.text ??
                    (detail.kind === "text"
                      ? "Original supplied text is unavailable."
                      : "Original transcript is unavailable.")}
                </p>
                {detail.originalText && (
                  <p>Current user correction: {detail.text}</p>
                )}
              </>
            )}
            {!cloudSpeechSegments &&
              (detail.originalMediaEvidence ?? detail.mediaEvidence)
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
          {(detail.preparedService?.post?.text ||
            detail.acquisition?.description) && (
            <details id="source-caption" className="panel" tabIndex={-1}>
              <summary>Post caption</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {detail.preparedService?.post?.text ??
                  detail.acquisition.description}
              </p>
            </details>
          )}
          {!demo && savedFrames.length > 0 && (
            <section
              className="panel"
              aria-label={
                detail.preparedService?.post
                  ? "Attachment evidence"
                  : untimedImages
                    ? "Image evidence"
                    : "Video evidence"
              }
            >
              <h2>
                {detail.preparedService?.post
                  ? "Attachment evidence"
                  : untimedImages
                    ? "Image evidence"
                    : "Video evidence"}
              </h2>
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
                        alt={`Private source evidence: ${frameLabel(frame)}`}
                        width={960}
                        height={540}
                        unoptimized
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                    <figcaption>{frameLabel(frame)}</figcaption>
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
        </section>
        <section className="post-settings-group" aria-label="Post and library">
          <h3>Post and library</h3>
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
            !["github_repository", "reddit_thread"].includes(
              detail.sourceType,
            ) && (
              <p className="fine">
                The original link is saved. Complete source media has not
                been retrieved.
              </p>
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
          {detail.catalogContributionAvailable && (
            <CloudCatalogContribution
              key={`${sourceId}:${detail.analysisVersion.id}`}
              sourceId={sourceId}
              versionId={detail.analysisVersion.id}
              disabled={readOnly || busy}
              call={strictCall ?? call}
            />
          )}
        </section>
        <section className="post-settings-group" aria-label="Project tools">
          <h3>Project tools</h3>
          <section className="panel" aria-label="Advanced project evaluation">
            <h2>Applies to your projects</h2>
            {detail.analysisVersion &&
              detail.analysisVersion.provenance !== "legacy_recorded" && (
                <p>
                  Project actions below remain bound to the original analysis.
                  Existing project reviews keep their original evidence. Select
                  the original analysis before starting a new project evaluation.
                </p>
              )}
            <fieldset
              disabled={
                readOnly ||
                busy ||
                (detail.analysisVersion &&
                  detail.analysisVersion.provenance !== "legacy_recorded")
              }
              style={{ border: 0, padding: 0, minWidth: 0 }}
            >
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
                    establish implementation fit or approve coding. Evaluate a
                    project separately to inspect repository evidence.
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
            </fieldset>
          </section>
        </section>
        <section className="post-settings-group" aria-label="Processing and retention">
          <h3>Processing and retention</h3>
          <div className="panel" id="post-processing-options" tabIndex={-1}>

            {detail.localAnalysisReceipt && (
              <p>
                GPT-6.1 Sol · Medium · Your Codex subscription · 0 app credits.{" "}
                {detail.localAnalysisReceipt.frames} sampled frames; video
                coverage is sampled.
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
                  Model: {detail.processingReceipt.model}. Funded by your
                  VibeScroll allowance.
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
                  tokens ·{" "}
                  {detail.processingReceipt.outputTokens.toLocaleString()} output
                  tokens, including thinking.
                </p>
                {detail.processingReceipt.reusedMedia && (
                  <p>Previously prepared speech and frames were reused.</p>
                )}
              </details>
            )}
            {isCloudObservedMedia(detail.orderedMedia?.post) && (
              <section className="panel">
                <h3>Private host-reported media observations</h3>
                <p>
                  Partial sampled video evidence reported by the connected host.
                  Retained screenshots can be opened through their citations.
                  Source acquisition, model settings and raw-media deletion remain
                  host-reported.
                </p>
                <p>
                  App result retained until{" "}
                  {new Date(
                    detail.orderedMedia.post.retainUntil,
                  ).toLocaleString()}
                  .
                </p>
                {detail.orderedMedia.post.caption && (
                  <p>{detail.orderedMedia.post.caption}</p>
                )}
              </section>
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
            {detail.workCloudPrivateLibraryRequired && !readOnly && (
              <section className="card">
                <h3>Work Cloud needs your private library</h3>
                <p>
                  This older workspace still uses team access. Review whether it
                  can become your private library while keeping these posts and
                  links in place.
                </p>
                <Link prefetch={false} href={`/app/${org}/team#private-library`}>
                  Review private-library setup
                </Link>
              </section>
            )}
            {(detail.workCloudTextEnabled || detail.workCloudMediaEnabled) &&
              !detail.publicImportId &&
              ((detail.workCloudTextEnabled &&
                (detail.kind === "text" || detail.currentRevisionId)) ||
                (detail.workCloudMediaEnabled &&
                  detail.kind === "url" &&
                  !detail.currentRevisionId)) &&
              !["ready", "processing"].includes(detail.state) &&
              (detail.state !== "queued" || detail.workCloudRetryEligible) && (
                <>
                  {detail.kind === "url" && detail.workCloudLinkSetup && (
                    <section className="panel">
                      <h3>My own Cloud Work</h3>
                      <p>
                        {detail.workCloudLinkSetup?.chatLinksEnabled
                          ? "New supported links sent to VibeScroll in ChatGPT or added with Cloud selected use your saved Cloud defaults. No per-post app review is needed."
                          : "Complete automatic app and ChatGPT link setup once in Connections. After setup, supported links use your own Cloud Work without per-post review."}
                      </p>
                      {detail.workCloudLinkSetup?.monitorReady &&
                      (detail.workCloudRetryEligible ||
                        (detail.generation === 0 &&
                          !detail.personalAnalysis &&
                          !detail.workCloudSaveIntent)) ? (
                        <button
                          className="primary"
                          disabled={readOnly || detailLoading || busy}
                          onClick={async () => {
                            setCloudRequestError("");
                            try {
                              await strictCall(
                                detail.workCloudRetryEligible
                                  ? "retrySavedWorkCloud"
                                  : "analyzeSavedWorkCloud",
                                detail.workCloudRetryEligible
                                  ? {
                                      sourceId,
                                      generation: detail.generation,
                                      revision: detail.updatedAt,
                                      key: crypto.randomUUID(),
                                    }
                                  : { sourceId },
                              );
                              onRefresh?.();
                            } catch {
                              setCloudRequestError(
                                "The Cloud request was not confirmed. Check setup and the existing post before trying again.",
                              );
                            }
                          }}
                        >
                          {detail.workCloudRetryEligible
                            ? detail.workCloudLinkSetup.serverPrepared
                              ? "Retry with subscription (up to 1 credit)"
                              : "Retry using Cloud defaults"
                            : "Analyze using Cloud defaults"}
                        </button>
                      ) : (
                        <Link prefetch={false} href={`/app/${org}/connections`}>
                          Complete or resume Cloud setup
                        </Link>
                      )}
                      {cloudRequestError && (
                        <p role="alert">{cloudRequestError}</p>
                      )}
                    </section>
                  )}
                  {!detail.workCloudLinkSetup && (
                    <details
                      className="panel"
                      onToggle={(event) =>
                        setManualCloudOpen(event.currentTarget.open)
                      }
                    >
                      <summary>Advanced: manual Cloud handoff</summary>
                      <p>
                        Use this only for a deliberate diagnostic. Normal
                        automatic links do not need this review.
                      </p>
                      {manualCloudOpen && (
                        <WorkCloudText
                          sourceId={id(detail)}
                          organizationId={org}
                          generation={detail.generation}

                          revision={detail.updatedAt}
                          media={
                            detail.kind === "url" && !detail.currentRevisionId
                          }

                          retentionUntil={detail.sourceRetentionUntil}
                          call={strictCall}
                          disabled={readOnly || detailLoading}
                        />
                      )}
                    </details>
                  )}
                </>
              )}

            {!demo &&
              !readOnly &&
              !detailLoading &&
              detail.state === "queued" &&
              source.state === "queued" &&
              id(detail) === sourceId &&
              detail.generation === source.generation &&
              detail.updatedAt === source.updatedAt &&
              detail.organizationId === org &&
              detail.workCloudHandoff &&
              source.workCloudHandoff !== null &&
              (source.workCloudHandoff === undefined ||
                workCloudHandoffKey(source.workCloudHandoff) ===
                  workCloudHandoffKey(detail.workCloudHandoff)) &&
              (detail.workCloudHandoff.media
                ? source.workCloudMediaEnabled !== false
                : source.workCloudTextEnabled !== false) &&
              (detail.workCloudHandoff.media
                ? detail.workCloudMediaEnabled
                : detail.workCloudTextEnabled) && (
                <PersistedWorkCloudHandoff
                  receipt={detail.workCloudHandoff}
                  sourceId={sourceId}
                  organizationId={org}
                  generation={detail.generation}
                  revision={detail.updatedAt}
                />
              )}
            {detail.personalAnalysis?.executor === "work_cloud" && (
              <section className="panel">
                <h3>Private Work Cloud request</h3>

                <p>
                  State: {detail.personalAnalysis.state}. Funding: your own
                  subscription; API allowance 0 USD.
                </p>

                <p>
                  Host execution, model settings, subscription usage and raw-media
                  retention are unverified. The task ID is a client correlation
                  UUID, not host attestation.
                </p>

                {["queued", "running"].includes(
                  detail.personalAnalysis.state,
                ) && (
                  <button
                    className="secondary"
                    disabled={readOnly || detailLoading || busy}
                    onClick={() =>
                      call("cancelPersonalAnalysis", { id: id(detail) })
                    }
                  >
                    Revoke app access to this request
                  </button>
                )}

                <p>
                  Stop the host task separately. Revocation does not confirm host
                  cancellation or restore allowance. No alternate provider starts
                  automatically.
                </p>
              </section>
            )}

            {personalEnabled &&
              detail.personalAnalysis?.executor !== "work_cloud" && (
                <PersonalSourceAnalysis
                  key={`${id(detail)}:${detail.generation}:${detail.currentRevisionId ?? "legacy"}`}

                  source={detail}

                  devices={devices}

                  linkAnalysisEnabled={linkAnalysisEnabled}

                  call={call}
                />
              )}

            {detail.error && <p role="alert">{detail.error}</p>}
            {cloudEnabled && detail.state !== "ready" && (
              <button
                className="primary"
                disabled={busy || ["queued", "processing"].includes(detail.state)}
                onClick={() =>
                  call("process", { id: id(source), maxCredits: 10 })
                }
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
        </section>
        {!demo &&
          !detailLoading &&
          canSuggestCategories &&
          !(detail.publicImportId && !detail.sharedCloud) && (
            <details
              className="panel"
              onToggle={(event) => {
                if (event.currentTarget.open) setPublicationMounted(true);
              }}
            >
              <summary>Advanced privacy and publication</summary>
              {publicationMounted && (
                <PublicKnowledgePanel
                  organizationId={org}
                  source={detail}
                  call={strictCall}
                  readOnly={readOnly}
                  enabled
                />
              )}
            </details>
          )}
      </SettingsPanel>
    </div>
  );
  return (
    <>
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
      <PostInsightReader
        sourceAction={null}
        sourcePreview={
          <div
            className="panel source-origin"
            data-ordered-media={showCarousel}
            data-has-thumbnail={demo || showCarousel || postThumbnailCandidates(detail).length > 0}
          >
            {showCarousel
              ? <PostMediaCarousel key={id(detail)} slides={orderedSlides} original={detail.url} />
              : <SourceThumbnail source={detail} demo={demo} priority />}
            <div className="source-origin-copy">
              <strong>{postDisplayTitle(detail)}</strong>
              {detail.linkPreview?.authorName && (
                detail.creator?.generation === detail.generation
                  ? <Link href={`/app/${org}/creators/${encodeURIComponent(detail.creator.key)}`}>
                      {detail.linkPreview.authorName}
                    </Link>
                  : <span>{detail.linkPreview.authorName}</span>
              )}
              {detail.preparedService?.post?.text ? <OriginalCaption caption={detail.preparedService.post.text} /> : null}
              {!!displayedCategories?.length && (
                <ul
                  className="source-reader-categories"
                  aria-label="Categories"
                >
                  {displayedCategories.slice(0, 6).map((name: string) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}
              {detail.url && (
                <PostOriginals urls={detail.originalLinks ?? [detail.url]} />
              )}
            </div>
          </div>
        }
      >
        {!demo && !detailLoading && (
          <SourceProgressPanel
            source={progressSource}
            now={Math.max(retentionTime, Date.now())}
            organizationId={org}
            onReviewAnalysis={() => openPostSettings("post-processing-options")}
          />
        )}
        {!demo && !detailLoading && (
          <>
            <SourceAcquisitionPanel
              source={detail}
              call={strictCall}
              readOnly={readOnly}
              onAnalyze={() => openPostSettings("post-processing-options")}
            />
            {detail.publicImportId && !detail.sharedCloud ? (
              <SavedPublicSource
                sourceId={sourceId}
                call={strictCall}
                readOnly={readOnly}
                enabled
              />
            ) : null}
          </>
        )}
        {detail.assistantIntake && (
          <AssistantIntakeStatus
            key={`${sourceId}:${detail.state}`}
            sourceId={sourceId}
            demo={demo}
            call={call}
          />
        )}
        <div className="post-overview">
          {detail.summary && <p>{overview}</p>}
          {detail.error &&
            !sourceProgress(
              progressSource,
              Math.max(retentionTime, Date.now()),
            ) && (
              <ErrorState
                title="Analysis needs attention"
                detail="The analysis could not finish. Your post is saved. Review the processing options to continue."
                action={
                  <a
                    href="#post-processing-options"
                    onClick={(event) => {
                      event.preventDefault();
                      openPostSettings("post-processing-options");
                    }}
                  >
                    Review analysis options
                  </a>
                }
              />
            )}
        </div>
        <section className="post-insights">
          <h2>Insights</h2>
          {detailLoading && (
            <output aria-live="polite">
              <Loader2 className="spinner" size={16} aria-hidden="true" />{" "}
              Loading source details…
            </output>
          )}
          {!detailLoading && insights.length > 0 && (
            <PostInsightStrip
              insights={insights.map((i: any) => ({
                id: i.id,
                title: i.title,
                claim: i.claim,
                ...feedInsightEvidence(detail, i.evidence, retentionTime),
                frame: (() => {
                  const frame = i.evidence?.find(
                    (e: any) =>
                      e.kind === "frame" &&
                      savedFrames.some((saved: any) => saved.id === e.id),
                  );
                  return frame
                    ? { id: frame.id, timeMs: frame.startMs }
                    : undefined;
                })(),
              }))}
              selected={
                expandedInsight === null
                  ? undefined
                  : insights[expandedInsight]?.id
              }
              onSelect={(selectedId) => {
                const index = insights.findIndex(
                  (item: any) => item.id === selectedId,
                );
                const i = insights[index];
                if (index < 0) return;
                setExpandedInsight(expandedInsight === index ? null : index);
                if (index !== expandedInsight && !demo)
                  for (const e of i.evidence ?? [])
                    journey?.citation(
                      `${sourceId}:${detail.generation}:${detail.updatedAt}:${i.id}:${e.id}`,
                      e.kind,
                      detail.coverage,
                    );
              }}
              renderFrame={(frameId) => (
                <PostThumbnail
                  candidates={[frameId]}
                  kind="upload"
                  demo={demo}
                />
              )}
              evidence={(selected) => {
                const i = insights.find((item: any) => item.id === selected.id);
                if (!i) return null;
                return (
                  <section className="insight-evidence">
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
                                openPostSettings("source-transcript");
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
                                onClick={(event) => {
                                  event.preventDefault();
                                  openPostSettings("source-caption");
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
                            <span>
                              {label(e.kind)} · see cited excerpt below
                            </span>
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
                    {detail.orderedMedia &&
                      !isCloudObservedMedia(detail.orderedMedia.post) && (
                        <ul>
                          {i.evidence.map((ref: any) => {
                            const citation = socialCitation(
                              ref,
                              detail.orderedMedia.evidence,
                            );

                            const record = detail.orderedMedia.evidence.find(
                              (e: any) =>
                                e.id === ref.id && e.kind === ref.kind,
                            );

                            return (
                              <li key={ref.id}>
                                <p>
                                  Observed video - {ref.kind} -{" "}
                                  {ref.startMs === null
                                    ? "untimed"
                                    : `${(ref.startMs / 1000).toFixed(1)}s`}{" "}
                                  - {citation.basis}
                                </p>
                                <p>{record?.text}</p>
                                {citation.uncertainty && (
                                  <p>{citation.uncertainty}</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    {detail.sharedCloud && (
                      <ul>
                        {i.evidence.map((ref: any) => {
                          const observation =
                            detail.sharedCloud.observations.find(
                              (entry: any) => entry.id === ref.id,
                            );
                          return (
                            <li key={ref.id}>
                              <blockquote>
                                {observation?.text ??
                                  "Observation unavailable."}
                              </blockquote>
                              <p className="fine">
                                {observation?.basis}
                                {observation?.uncertainty
                                  ? `. ${observation.uncertainty}`
                                  : ""}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {detail.evidenceRegistry && (
                      <TypedSourceEvidence
                        evidenceRegistry={detail.evidenceRegistry.filter(
                          (record: any) =>
                            i.evidence?.some((e: any) => e.id === record.id),
                        )}
                        sourceRevision={detail.sourceRevision}
                      />
                    )}
                  </section>
                );
              }}
            />
          )}
          {!detailLoading && !insights.length && !detail.error && (
            <p className="post-empty-insights">
              {["processing", "queued"].includes(detail.state)
                ? "Insights will appear here as soon as analysis finishes."
                : "Insights appear here after a post is analyzed."}
            </p>
          )}
        </section>
        <div className="post-reader-actions">
          <section className="post-project-choices" id="source-analysis-actions">
            <h2>Apply to a project</h2>
            {insights[0] &&
            detail.analysisVersion?.id &&
            repos.some(
              (r: any) => r.enabled && r.confirmed && r.status === "connected",
            ) ? (
              <ProjectProposalComposer
                key={`${sourceId}:${detail.analysisVersion.id}`}
                organizationId={org}
                sourceId={sourceId}
                analysisVersionId={detail.analysisVersion.id}
                insight={{
                  id: insights[0].id,
                  title: insights[0].title || insights[0].claim,
                  claim: insights[0].claim,
                }}
                insights={detail.analysis.insights}
                sourceTitle={detail.title}
                projects={repos
                  .filter(
                    (r: any) =>
                      r.enabled && r.confirmed && r.status === "connected",
                  )
                  .map((r: any) => ({ id: id(r), name: r.fullName }))}
                compactProjects={repos.map((r: any) => ({
                  id: id(r),
                  name: r.fullName,
                }))}
                suggestions={
                  projectSuggestions?.versionId === detail.analysisVersion.id
                    ? projectSuggestions.items
                    : []
                }
                aiFirst={!demo}
                disabled={readOnly || !canSuggestCategories || demo}
                call={strictCall}
                onSaved={onRefresh}
              />
            ) : (
              <Link prefetch={false} href={`/app/${org}/projects`}>
                {repos.length ? "Manage projects" : "Connect a project"}
              </Link>
            )}
          </section>
          <section className="post-project-choices">
            <h2>Proposals</h2>
            {detail.proposals?.length ? (
              detail.proposals.map((proposal: any) => (
                <Link
                  key={id(proposal)}
                  className="project-choice-row"
                  href={
                    demo
                      ? `/demo?proposal=${id(proposal)}`
                      : `/app/${org}/proposals/${id(proposal)}`
                  }
                >
                  <span>{proposal.title}</span>
                </Link>
              ))
            ) : (
              <p>No proposals yet.</p>
            )}
          </section>
          <section className="post-project-choices">
            <h2>Source evidence</h2>
            <button
              type="button"
              className="button"
              onClick={() => openPostSettings("post-settings-evidence")}
            >
              View source evidence
            </button>
          </section>
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
          {postTools}
        </div>
      </PostInsightReader>
    </>
  );
}
function PersonalSourceAnalysis({
  source,
  devices,
  call,
  linkAnalysisEnabled,
}: any) {
  const [deviceId, setDeviceId] = useState(""),
    [model, setModel] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false);
  const eligible = devices.filter(
    (d: any) =>
      d.personalOwned &&
      d.state === "paired" &&
      d.personalOnline &&
      d.personalModels?.length,
  );
  const device = eligible.find((d: any) => id(d) === deviceId);
  const typedSource = Boolean(source.currentRevisionId);
  const typedRequired =
    typedSource ||
    ["github_repository", "reddit_thread"].includes(source.sourceType);
  const textSource = source.kind === "text" || typedSource;
  const running = ["preparing", "queued", "running"].includes(
    source.personalAnalysis?.state,
  );
  return (
    <section aria-label="Personal ChatGPT analysis" className="panel">
      <h3>Use your ChatGPT plan</h3>
      {running && (
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
          onClick={async () => {
            setBusy(true);
            try {
              await call("cancelPersonalAnalysis", { id: id(source) });
            } finally {
              setBusy(false);
            }
          }}
        >
          Cancel personal analysis
        </Button>
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
          Automatic analysis is unavailable for this link.
        </p>
      ) : (
        source.state !== "ready" && (
          <>
            <p>
              {!textSource
                ? "Your laptop transcribes audio locally, then sends sampled frames and the transcript to your ChatGPT account. Media preparation reserves up to 10 compute credits."
                : typedSource
                  ? "Your laptop sends only the reviewed file or discussion excerpts to your ChatGPT account. This source uses text citations and no media preparation credits."
                  : "Your laptop sends this text to your ChatGPT account."}{" "}
              No VibeScroll inference credits or paid AI fallback. Your ChatGPT
              limits apply.
            </p>
            {!eligible.length ? (
              <p>
                Start the personal runner on your paired laptop to see its
                available models.
              </p>
            ) : (
              <>
                <label>
                  Computer
                  <ChoiceSelect
                    value={deviceId}
                    onValueChange={(value) => {
                      setDeviceId(value);
                      setModel("");
                      setConsent(false);
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
                <label>
                  Account model
                  <ChoiceSelect
                    value={model}
                    onValueChange={(value) => {
                      setModel(value);
                      setConsent(false);
                    }}
                  >
                    <option value="">Choose an available model</option>
                    {device?.personalModels.map((m: any) => (
                      <option key={m.slug} value={m.slug}>
                        {m.displayName}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  Use my connected ChatGPT plan for this source with medium
                  reasoning.
                </label>
                <Button
                  primary
                  busy={busy}
                  disabled={
                    !consent ||
                    !device ||
                    !model ||
                    ["queued", "processing"].includes(source.state)
                  }
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await call("approvePersonalAnalysis", {
                        id: id(source),
                        generation: source.generation,
                        deviceId,
                        model,
                        effort: "medium",
                        useOwnPlan: true,
                        ...(!textSource ? { maxComputeCredits: 10 } : {}),
                      });
                      setConsent(false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {!textSource
                    ? "Transcribe and analyze video"
                    : "Analyze with my plan"}
                </Button>
                <p className="fine">
                  Approval expires after 15 minutes if unclaimed.
                  Reauthentication may be required. There is no automatic model
                  or paid-provider fallback.
                </p>
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
      <p>Repository: {proposal.repo?.fullName ?? proposal.repositoryId ?? "Demo Planner"}</p>
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
function RunCard({ run, title, repository, handoff, call, busy, readOnly }: any) {
  const pullRequest = run.prNumber ? `Pull request #${run.prNumber}` : "Pull request";
  const taskTitle =
    title ??
    (run.prUrl ? pullRequest : run.state === "canceled" ? "Canceled execution" : "Coding task");
  const status = run.reverted ? "reverted" : run.prState ?? run.state;
  const date = workDate(run.updatedAt ?? run.createdAt);
  const canCancel = !["completed", "canceled", "failed", "publishing"].includes(run.state);
  const checkFailed = /^Exit (?!0\b)\d+:/m.test(run.report ?? "");
  return (
    <article className="work-task">
      <header className="work-task-heading">
        <span className="work-record-icon"><GitPullRequest size={18} aria-hidden="true" /></span>
        <div className="work-record-body">
          <h2>{taskTitle}</h2>
          <div className="work-task-byline">
            {repository && <span>{repository}</span>}
            {date && <span>{date}</span>}
          </div>
        </div>
        <WorkStatus value={status} />
      </header>
      {run.error && <p role="alert">{run.error}</p>}
      {checkFailed && (
        <p className="notice">Some approved checks failed. Review the report before publishing.</p>
      )}
      <div className="work-task-actions">
      {(run.prUrl || run.reverted || canCancel) && (
        <div className="work-task-links">
          {run.prUrl && (
            <a className="work-inline-action" href={run.prUrl} target="_blank" rel="noopener noreferrer">
              Open on GitHub <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
          {run.reverted && (
            <a className="work-inline-action" href={run.reverted.url} target="_blank" rel="noopener noreferrer">
              View reversal <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
          {canCancel && (
            <button
              type="button"
              className="secondary"
              disabled={busy || readOnly}
              onClick={() => call("cancel", { id: id(run) })}
            >
              Cancel execution
            </button>
          )}
        </div>
      )}
      <details className="work-task-details" open={run.state === "awaiting_review" ? true : undefined}>
        <summary><ChevronDown size={16} aria-hidden="true" /> Execution details</summary>
        <div>
          <p>
            {[
              run.executor && label(run.executor),
              run.fundingRoute && label(run.fundingRoute),
              typeof run.maxCredits === "number" && `Ceiling ${run.maxCredits} credits`,
            ].filter(Boolean).join(" · ") || "Execution details unavailable"}
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
          <p>Benefit has not been measured.</p>
          <ProposalWorkObservations handoff={handoff} />
          {run.events?.length > 0 && (
            <ul>
              {run.events.map((event: string, index: number) => <li key={index}>{event}</li>)}
            </ul>
          )}
          {run.patch && (
            <details>
              <summary>Review patch and check report</summary>
              <pre>{run.patch}</pre>
              <p>{run.report}</p>
              {run.state === "awaiting_review" && (
                <>
                  <p className="fine">
                    The reviewed patch and title will be shared with the selected
                    GitHub repository. Detailed check output and source evidence stay private.
                  </p>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || readOnly}
                    onClick={async () => {
                      const hash = await crypto.subtle.digest(
                        "SHA-256",
                        new TextEncoder().encode(run.patch),
                      );
                      const patchDigest = Array.from(new Uint8Array(hash), (byte) =>
                        byte.toString(16).padStart(2, "0"),
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
                </>
              )}
            </details>
          )}
          {run.prUrl && (
            <>
              <p className="work-task-meta">
                {run.observedAt
                  ? `Last checked ${calendarDateTime.format(run.observedAt)} UTC`
                  : "GitHub status has not been checked."}
              </p>
              <button
                type="button"
                className="secondary"
                disabled={busy || readOnly}
                onClick={() => call("refreshPR", { id: id(run) })}
              >
                Refresh GitHub status
              </button>
              {["unverified", "search_limited"].includes(run.revertStatus) && !run.reverted && (
                <p className="fine">The reversal check is incomplete. The historical merge remains recorded.</p>
              )}
            </>
          )}
        </div>
      </details>
      </div>
    </article>
  );
}
