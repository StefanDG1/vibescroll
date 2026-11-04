/* eslint-disable react/set-state-in-effect -- Host results are external navigation; discard superseded authority before accepting a new snapshot. */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useHost } from "./host";
import {
  fetchSource,
  profilesOf,
  sourcesOf,
  type Source,
  type Profile,
} from "./data";
import {
  widgetRoute,
  type ToolRecord,
} from "../../../packages/widget/contracts";
import { observedProcessing } from "../../../packages/reader/processing";
import {
  appendDiscovery,
  discoveryPage,
  type DiscoveryPage,
} from "../../../packages/reader/discovery";
import {
  processingAccountView,
  type ProcessingAccountView,
} from "../../starter/components/processing-account-summary";
import {
  bootstrapProfiles,
  boundedMerge,
  continuationOf,
  isAccessFailure,
  selectedWorkspace,
  type Continuation,
} from "./application-model";

export type CollectionKind = "sources" | "catalog" | "proposals";
export function useApplication() {
  const host = useHost();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [workspace, setWorkspace] = useState<ToolRecord | null>(null);
  const [rows, setRows] = useState<Source[]>([]);
  const [records, setRecords] = useState<ToolRecord[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [job, setJob] = useState<ToolRecord | null>(null);
  const [account, setAccount] = useState<ProcessingAccountView | null>(null);
  const [accountUnavailable, setAccountUnavailable] = useState(false);
  const [next, setNext] = useState<Continuation | null>(null);
  const [coverage, setCoverage] = useState("");
  const [kind, setKind] = useState<CollectionKind>("sources");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [observedAt, setObservedAt] = useState<number>();
  const [search, setSearch] = useState<{
    query: string;
    page: DiscoveryPage | null;
    busy: boolean;
    error: string;
  } | null>(null);
  const [catalogPost, setCatalogPost] = useState<ToolRecord | null>(null);
  const epoch = useRef(0);
  const observationStarted = useRef(0);
  const pollFlight = useRef(false);
  const actions = (workspace?.actions ?? {}) as Record<string, boolean>;
  const progress = observedProcessing(
    job ?? {},
    source?.state ?? "saved",
    observedAt ?? 0,
  );

  function failure(failed: unknown, preserve = false) {
    if (!preserve || isAccessFailure(failed)) {
      setSource(null);
      setRows([]);
      setJob(null);
      setRecords([]);
      setCatalogPost(null);
      setSearch(null);
    }
    if (isAccessFailure(failed)) {
      setAccount(null);
      setWorkspace(null);
    }
    setError(
      failed instanceof Error
        ? failed.message
        : "This view could not be loaded. Refresh or open VibeScroll.",
    );
  }
  async function readAccount(
    state: ToolRecord,
    ticket: number,
    receipt?: ToolRecord | null,
  ) {
    const existing = processingAccountView(receipt?.account);
    if (existing) {
      if (ticket === epoch.current) {
        setAccount(existing);
        setAccountUnavailable(false);
      }
      return;
    }
    if (!(state.actions as Record<string, boolean>)?.analysis) {
      if (ticket === epoch.current) {
        setAccount(null);
        setAccountUnavailable(true);
      }
      return;
    }
    try {
      const balance = processingAccountView(
        await host.call("get_processing_account", {}),
      );
      if (ticket === epoch.current) {
        setAccount(balance);
        setAccountUnavailable(!balance);
      }
    } catch {
      if (ticket === epoch.current) {
        setAccount(null);
        setAccountUnavailable(true);
      }
    }
  }
  async function load(
    selectedProfile?: string,
    selectedSource?: string,
    continuation?: Continuation,
    collection: CollectionKind = "sources",
    bootstrap?: ToolRecord | null,
    receipt?: ToolRecord | null,
  ) {
    const ticket = ++epoch.current;
    setBusy(true);
    setError("");
    setPaused(false);
    setSearch(null);
    if (!continuation) {
      setSource(null);
      setRows([]);
      setJob(null);
      setRecords([]);
      setNext(null);
      setCoverage("");
      setCatalogPost(null);
    }
    try {
      let currentProfiles = profiles;
      let state: ToolRecord;
      if (
        bootstrap &&
        typeof bootstrap.profile_id === "string" &&
        bootstrap.actions
      ) {
        state = bootstrap;
        if (!currentProfiles.length)
          currentProfiles = profilesOf({
            profiles: [{ ...bootstrap, projects: [] }],
          });
      } else {
        const discovery =
          bootstrap && Array.isArray(bootstrap.profiles)
            ? bootstrap
            : await host.call(
                "widget_profiles",
                selectedProfile ? { profileId: selectedProfile } : {},
              );
        currentProfiles = bootstrapProfiles(discovery);
        if (ticket !== epoch.current) return;
        setProfiles(currentProfiles);
        const chosen = selectedWorkspace(
          discovery,
          currentProfiles,
          selectedProfile,
        );
        setProfileId(chosen);
        if (!chosen) {
          setWorkspace(null);
          setCoverage(
            typeof discovery.coverage === "string"
              ? discovery.coverage
              : "Choose a current workspace to continue.",
          );
          return;
        }
        state = await host.call("widget_state", { profileId: chosen });
      }
      if (ticket !== epoch.current) return;
      const chosen = String(state.profile_id);
      setProfiles(currentProfiles);
      setProfileId(chosen);
      setWorkspace(state);
      setKind(collection);
      // Financial access does not block knowledge-only reading.
      void readAccount(state, ticket, receipt);
      if (selectedSource) {
        const raw = receipt?.text
          ? receipt
          : receipt?.data && typeof receipt.data === "object"
            ? (receipt.data as ToolRecord)
            : null;
        const retained =
          raw?.text &&
          String(raw.id).split("~")[0] === selectedSource.split("~")[0]
            ? fetchSource(raw)
            : fetchSource(
                await host.call("fetch", {
                  profileId: chosen,
                  id: selectedSource,
                }),
              );
        if (ticket !== epoch.current) return;
        setSource(retained);
        // Ready incumbent evidence can coexist with a new pending analysis.
        if ((state.actions as Record<string, boolean>)?.jobs) {
          const status = raw?.source_status
            ? raw
            : await host.call("get_job_status", {
                profileId: chosen,
                sourceId: retained.id,
              });
          if (ticket !== epoch.current) return;
          setJob(status);
          setObservedAt(Date.now());
          const balance = processingAccountView(status.account);
          if (balance) setAccount(balance);
        } else setJob({ status: retained.state });
        observationStarted.current = Date.now();
      } else {
        const result = await host.call("widget_browse", {
          profileId: chosen,
          kind: collection,
          ...continuation,
        });
        if (ticket !== epoch.current) return;
        if (collection === "sources")
          setRows((old) =>
            continuation
              ? boundedMerge(old, sourcesOf(result))
              : sourcesOf(result),
          );
        else
          setRecords((old) =>
            continuation
              ? boundedMerge(
                  old as (ToolRecord & { id: string })[],
                  result.items as (ToolRecord & { id: string })[],
                )
              : ((result.items ?? []) as ToolRecord[]),
          );
        setNext(continuationOf(result));
        setCoverage(typeof result.coverage === "string" ? result.coverage : "");
      }
    } catch (failed) {
      if (ticket === epoch.current) failure(failed);
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }
  async function acceptSearch(
    query: string,
    result: ToolRecord,
    append = false,
  ) {
    const page = discoveryPage(result);
    setProfileId(page.profileId);
    const combined =
      append && search?.page ? appendDiscovery(search.page, page) : page;
    setSearch({
      query,
      page: combined,
      busy: false,
      error: "",
    });
    // Paint the returned batch first. Account/navigation metadata is independent.
    const ticket = epoch.current;
    if (!workspace && page.profileId) {
      void host
        .call("widget_state", { profileId: page.profileId })
        .then((state) => {
          if (ticket !== epoch.current) return;
          setWorkspace(state);
          void readAccount(state, ticket);
        })
        .catch(() => {
          if (ticket === epoch.current) setAccountUnavailable(true);
        });
    }
  }
  const initialize = useEffectEvent(() => {
    if (host.error) {
      epoch.current++;
      failure(new Error(host.error));
      setAccount(null);
      setWorkspace(null);
      return;
    }
    if (!host.ready) return;
    const inputQuery =
      typeof host.input?.query === "string" ? host.input.query : "";
    if (inputQuery && host.initialPending) {
      epoch.current++;
      setSource(null);
      setRows([]);
      setJob(null);
      setCatalogPost(null);
      setBusy(false);
      setSearch({ query: inputQuery, page: null, busy: true, error: "" });
      return;
    }
    const payload = host.payload;
    if (
      payload &&
      (Array.isArray(payload.matches) || Array.isArray(payload.results))
    ) {
      epoch.current++;
      setSource(null);
      setJob(null);
      setBusy(false);
      void acceptSearch(inputQuery, payload);
      return;
    }
    if (host.initialPending) return;
    const route = widgetRoute.safeParse(payload?.route ?? host.route ?? {});
    const snapshot =
      payload?.snapshot && typeof payload.snapshot === "object"
        ? (payload.snapshot as ToolRecord)
        : null;
    if (route.success && route.data.view === "search" && route.data.query) {
      void runSearch(route.data.query);
      return;
    }
    void load(
      route.success ? route.data.profileId : undefined,
      route.success ? route.data.sourceId : undefined,
      undefined,
      route.success && route.data.view === "catalog" ? "catalog" : "sources",
      snapshot,
      payload,
    );
  });
  useEffect(() => {
    initialize();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- This is a request generation, not a DOM ref; teardown invalidates every outstanding reply.
      epoch.current++;
    };
  }, [
    host.ready,
    host.error,
    host.payload,
    host.route,
    host.input,
    host.initialPending,
  ]);

  const poll = useEffectEvent(async (resume = false) => {
    if (
      !source ||
      !actions.jobs ||
      document.hidden ||
      pollFlight.current ||
      (!resume && (paused || !progress.active))
    )
      return;
    if (!resume && Date.now() - observationStarted.current >= 300000) {
      setPaused(true);
      return;
    }
    if (resume) {
      observationStarted.current = Date.now();
      setPaused(false);
    }
    pollFlight.current = true;
    const ticket = epoch.current;
    try {
      const status = await host.call("get_job_status", {
        profileId,
        sourceId: source.id,
      });
      if (ticket !== epoch.current) return;
      const current = observedProcessing(status, source.state, Date.now());
      setJob(status);
      setObservedAt(Date.now());
      setError("");
      const balance = processingAccountView(status.account);
      if (balance) setAccount(balance);
      if (
        status.source_status === "ready" &&
        (source.state !== "ready" ||
          (current.versionId && current.versionId !== source.analysisVersionId))
      ) {
        const ready = fetchSource(
          await host.call("fetch", { profileId, id: source.id }),
        );
        if (ticket === epoch.current) setSource(ready);
      }
    } catch (failed) {
      if (ticket === epoch.current) {
        setPaused(true);
        failure(failed, true);
      }
    } finally {
      pollFlight.current = false;
    }
  });
  const sourceId = source?.id;
  useEffect(() => {
    if (!sourceId || !progress.active || paused) return;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const tick = async () => {
      await poll();
      if (!disposed)
        timer = setTimeout(
          tick,
          Date.now() - observationStarted.current < 15000 ? 2000 : 5000,
        );
    };
    timer = setTimeout(tick, 2000);
    const resume = () => {
      if (!document.hidden) void poll(true);
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [sourceId, progress.active, paused]);
  useEffect(() => {
    const resume = () => {
      if (!document.hidden && sourceId && paused) void poll(true);
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [sourceId, paused]);

  async function runSearch(query: string, more = false) {
    const ticket = ++epoch.current;
    const prior = more ? search?.page : null;
    setError("");
    setSource(null);
    setJob(null);
    setCatalogPost(null);
    setSearch((old) => ({
      query,
      page: more ? (old?.page ?? null) : null,
      busy: true,
      error: "",
    }));
    try {
      const result = await host.call("search", {
        ...(profileId ? { profileId } : {}),
        query,
        ...((prior?.mode ??
          (workspace?.scope === "all" ? "ranked_v1" : "legacy")) === "ranked_v1"
          ? { mode: "ranked_v1", target: "insights" }
          : {}),
        ...(prior?.cursor ? { cursor: prior.cursor } : {}),
      });
      if (ticket === epoch.current) await acceptSearch(query, result, more);
    } catch (failed) {
      if (ticket === epoch.current) {
        if (isAccessFailure(failed)) {
          setSearch(null);
          failure(failed);
        } else
          setSearch((old) =>
            old
              ? {
                  ...old,
                  busy: false,
                  error:
                    failed instanceof Error
                      ? failed.message
                      : "Search could not be completed.",
                }
              : old,
          );
      }
    }
  }
  async function openCatalog(record: ToolRecord) {
    const ticket = ++epoch.current;
    setBusy(true);
    setError("");
    setSource(null);
    setJob(null);
    setSearch(null);
    setCatalogPost(null);
    try {
      const post = await host.call("widget_catalog_post", {
        profileId,
        familyId: record.family_id,
        artifactId: record.artifact_id,
      });
      if (ticket === epoch.current) setCatalogPost(post);
    } catch (failed) {
      if (ticket === epoch.current) failure(failed);
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }
  function clearSelection() {
    epoch.current++;
    setSource(null);
    setJob(null);
    setCatalogPost(null);
    setSearch(null);
    setError("");
    setBusy(false);
  }
  return {
    host,
    profiles,
    profileId,
    workspace,
    actions,
    rows,
    records,
    source,
    job,
    account,
    accountUnavailable,
    next,
    coverage,
    kind,
    busy,
    error,
    paused,
    observedAt,
    progress,
    search,
    catalogPost,
    load,
    openCatalog,
    runSearch,
    clearSelection,
    captureScope: () => {
      const ticket = epoch.current;
      return () => ticket === epoch.current;
    },
    refresh: () =>
      source ? poll(true) : load(profileId, undefined, undefined, kind),
    fail: failure,
  };
}
