/* eslint-disable react/set-state-in-effect -- Host payloads and route changes are external navigation; clear earlier authority before reading. */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useHost } from "./host";
import {
  fetchSource,
  profilesOf,
  sourcesOf,
  reauthorizeSources,
  evidenceLabel,
  type Source,
  type Profile,
} from "./data";
import {
  widgetRoute,
  jobPresentation,
  appOrigin,
  type ToolRecord,
} from "../../../packages/widget/contracts";
import { PostInsightReader } from "../../starter/components/post-insight-reader";
import { InsightCardControl } from "../../starter/components/insight-card-control";
import { SettingsPanel } from "../../starter/components/settings-panel";
import { ProjectProposalComposer } from "../../starter/components/project-proposal-composer";
import { insightPresentation } from "../../../packages/insights/presentation";
import { suggestProjects } from "../../starter/lib/project-suggestions";

export function CompactApp() {
  const host = useHost();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [rows, setRows] = useState<Source[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [job, setJob] = useState<ToolRecord | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const pollFlight = useRef(false);
  const originalJobStarted = useRef(0);
  const profile = profiles.find((p) => p.profile_id === profileId);
  const projectRows = (profile?.projects ?? []).flatMap((p) => {
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
  });
  const suggestions = source
    ? suggestProjects(
        {
          analysisVersion: { id: source.analysisVersionId },
          analysis: { insights: source.insights },
        },
        projectRows.map((p) => ({
          _id: p.id,
          fullName: p.name,
          profile: p.profile,
          enabled: true,
          confirmed: true,
          status: "connected",
        })),
      ).items
    : [];
  const status = jobPresentation(job ?? { status: source?.state });
  const webUrl = profileId
    ? `${appOrigin}/app/${profileId}`
    : `${appOrigin}/app`;
  function failed(failure: unknown) {
    setSource(null);
    setRows([]);
    setJob(null);
    setError(
      failure instanceof Error
        ? failure.message
        : "This view could not be loaded. Retry or open VibeScroll.",
    );
  }
  async function load(
    selectedProfile?: string,
    selectedSource?: string,
    next?: string,
  ) {
    const ticket = ++epoch.current;
    setBusy(true);
    setError("");
    if (!next) {
      setSource(null);
      setRows([]);
      setJob(null);
      setExpanded(null);
    }
    try {
      const current = profilesOf(
        await host.call(
          "get_profile",
          selectedProfile ? { profileId: selectedProfile } : {},
        ),
      );
      if (ticket !== epoch.current) return;
      setProfiles(current);
      const chosen =
        selectedProfile && current.some((p) => p.profile_id === selectedProfile)
          ? selectedProfile
          : current.length === 1
            ? current[0].profile_id
            : "";
      setProfileId(chosen);
      if (!chosen) return;
      if (selectedSource) {
        if (!selectedProfile) {
          const detailed = profilesOf(
            await host.call("get_profile", { profileId: chosen }),
          );
          if (ticket !== epoch.current) return;
          setProfiles(detailed);
        }
        const result = fetchSource(
          await host.call("fetch", { profileId: chosen, id: selectedSource }),
        );
        const state =
          result.state === "ready"
            ? { status: "ready" }
            : await host.call("get_job_status", {
                profileId: chosen,
                sourceId: result.id,
              });
        if (ticket !== epoch.current) return;
        originalJobStarted.current = Date.now();
        setSource(result);
        setJob(state);
      } else {
        const result = await host.call("widget_browse", {
          profileId: chosen,
          kind: "sources",
          ...(next ? { cursor: next } : {}),
        });
        if (ticket !== epoch.current) return;
        setRows((old) =>
          next ? [...old, ...sourcesOf(result)] : sourcesOf(result),
        );
        setCursor(
          typeof result.next_cursor === "string" ? result.next_cursor : null,
        );
      }
    } catch (failure) {
      if (ticket === epoch.current) failed(failure);
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }
  const cancel = useEffectEvent(() => {
    epoch.current++;
  });
  const initialize = useEffectEvent(() => {
    if (!host.ready || host.error) return;
    const route = widgetRoute.safeParse(
      host.payload?.route ?? host.route ?? {},
    );
    void load(
      route.success ? route.data.profileId : undefined,
      route.success ? route.data.sourceId : undefined,
    );
  });
  useEffect(() => {
    initialize();
    return () => cancel();
  }, [host.ready, host.error, host.payload, host.route]);
  const poll = useEffectEvent(async () => {
    if (
      !source ||
      !status.active ||
      document.hidden ||
      pollFlight.current ||
      Date.now() - originalJobStarted.current > 300000
    )
      return;
    pollFlight.current = true;
    const ticket = epoch.current;
    try {
      const next = await host.call("get_job_status", {
        profileId,
        sourceId: source.id,
      });
      if (ticket !== epoch.current) return;
      setJob(next);
      if (
        !jobPresentation(next).active &&
        next.source_status === "ready" &&
        source.state !== "ready"
      ) {
        const ready = fetchSource(
          await host.call("fetch", { profileId, id: source.id }),
        );
        if (ticket === epoch.current) setSource(ready);
      }
    } catch (failure) {
      if (ticket === epoch.current) failed(failure);
    } finally {
      pollFlight.current = false;
    }
  });
  const sourceId = source?.id;
  useEffect(() => {
    if (!sourceId || !status.active) return;
    const timer = setInterval(() => {
      void poll();
    }, 5000);
    return () => clearInterval(timer);
  }, [sourceId, status.active]);
  async function saveLink(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !profileId) return;
    const ticket = ++epoch.current;
    setBusy(true);
    setError("");
    try {
      const saved = await host.call("save_link", {
        url: url.trim(),
        profileId,
      });
      if (ticket !== epoch.current) return;
      if (typeof saved.source_id !== "string")
        throw Error(
          "Save was not confirmed. Open VibeScroll to check before retrying.",
        );
      setUrl("");
      await load(profileId, saved.source_id);
    } catch (failure) {
      if (ticket === epoch.current) failed(failure);
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }
  async function open(url: string) {
    try {
      await host.open(url);
    } catch {
      setError(
        "The host did not open the page. Open VibeScroll in your browser to continue.",
      );
    }
  }
  async function continueProposal(proposalId: string) {
    await host.call("get_project_proposal", { profileId, proposalId });
    await host.message(
      `Continue my VibeScroll proposal ${proposalId} in profile ${profileId}. Use get_project_proposal to read its exact current draft, then review the selected insight and project context. Ask focused questions where context is missing and propose a concrete plan. Saving a draft does not authorize coding, spending or publication.`,
    );
  }
  async function proposalCall(operation: string, args: unknown) {
    if (!source) throw Error("Open a saved source first.");
    if (operation === "projectPlanningContext")
      await reauthorizeSources(host.call, profileId, [source]);
    const name =
      operation === "projectPlanningContext"
        ? "get_project_application_context"
        : operation === "projectProposalSave"
          ? "save_project_proposal"
          : null;
    if (!name) throw Error("This compact action is unavailable.");
    return host.call(name, { ...(args as ToolRecord), profileId });
  }
  return (
    <main className="compact-root" data-theme={host.theme}>
      <header className="compact-header">
        <strong>VibeScroll</strong>
        <button
          className="compact-open"
          onClick={() => {
            void open(webUrl);
          }}
        >
          Open app <ExternalLink size={15} aria-hidden="true" />
        </button>
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
            onClick={() => {
              void open(`${appOrigin}/app`);
            }}
          >
            Continue in VibeScroll
          </button>
        </section>
      ) : !host.ready ? (
        <output>Connecting to VibeScroll…</output>
      ) : (
        <>
          {profiles.length > 1 && (
            <label className="compact-workspace">
              Workspace
              <select
                value={profileId}
                onChange={(e) => {
                  void load(e.target.value);
                }}
              >
                <option value="">Choose workspace</option>
                {profiles.map((p) => (
                  <option key={p.profile_id} value={p.profile_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <section role="alert">
              <p>{error}</p>
              <button
                className="button"
                onClick={() => {
                  void load(profileId || undefined);
                }}
              >
                Retry loading
              </button>
              <button
                className="compact-open"
                onClick={() => {
                  void open(webUrl);
                }}
              >
                Open app
              </button>
            </section>
          )}
          {busy && <output className="compact-loading">Loading…</output>}
          {source ? (
            <>
              <button
                className="compact-back"
                onClick={() => {
                  void load(profileId);
                }}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Recent posts
              </button>
              <div className="compact-post-title">
                <h1>{source.title}</h1>
                <button
                  aria-label="Refresh this post"
                  className="icon-button"
                  disabled={busy}
                  onClick={() => {
                    void load(profileId, source.id);
                  }}
                >
                  <RefreshCw size={17} aria-hidden="true" />
                </button>
              </div>
              {(status.active || source.state !== "ready") && (
                <section className="compact-progress" aria-live="polite">
                  <strong>{status.label}</strong>
                  {status.active && <progress aria-label={status.label} />}
                  <button
                    className="compact-open"
                    onClick={() => {
                      void open(source.url);
                    }}
                  >
                    View progress in app{" "}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </section>
              )}
              <PostInsightReader>
                {source.insights.map((insight) => (
                  <article
                    className="post-insight-card"
                    key={insight.id}
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
                            {insight.evidence.map((ref, index) => (
                              <li key={index}>{evidenceLabel(ref)}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>Open the post to inspect its retained evidence.</p>
                        )}
                        <button
                          className="button"
                          onClick={() => {
                            void open(source.url);
                          }}
                        >
                          Open full evidence{" "}
                          <ExternalLink size={15} aria-hidden="true" />
                        </button>
                      </SettingsPanel>
                    </InsightCardControl>
                    {expanded === insight.id && (
                      <div className="post-insight-detail">
                        <p>{insight.claim}</p>
                        {source.analysisVersionId && (
                          <ProjectProposalComposer
                            organizationId={profileId}
                            sourceId={source.id}
                            analysisVersionId={source.analysisVersionId}
                            insight={insight}
                            projects={projectRows}
                            suggestions={suggestions}
                            disabled={busy}
                            call={proposalCall}
                            onNavigate={host.open}
                            onContinue={
                              host.canMessage ? continueProposal : undefined
                            }
                          />
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </PostInsightReader>
              <button
                className="compact-open"
                onClick={() => {
                  void open(source.url);
                }}
              >
                {source.more_ideas
                  ? "See all insights in VibeScroll"
                  : "Open post in VibeScroll"}
                <ExternalLink size={15} aria-hidden="true" />
              </button>
            </>
          ) : (
            profileId &&
            !error && (
              <>
                <form className="compact-save" onSubmit={saveLink}>
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
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={busy}
                  />
                  <button
                    type="submit"
                    disabled={busy || !url.trim()}
                    aria-label="Save link"
                  >
                    <Plus size={20} aria-hidden="true" />
                  </button>
                </form>
                <h1>Recent posts</h1>
                <div className="compact-recent">
                  {rows.map((row) => (
                    <button
                      key={row.id}
                      onClick={() => {
                        void load(profileId, row.id);
                      }}
                    >
                      <span>
                        <strong>{row.title}</strong>
                        <small>
                          {jobPresentation({ status: row.state }).label}
                        </small>
                      </span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                {!busy && !rows.length && <p>Save a link to get started.</p>}
                {cursor && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      void load(profileId, undefined, cursor);
                    }}
                  >
                    Load more
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
