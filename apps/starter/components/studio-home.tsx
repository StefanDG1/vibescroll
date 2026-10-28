"use client";
import { useState } from "react";
import { ArrowRight, Bookmark, GitBranch, Link2 } from "lucide-react";
import { Button } from "@companynerve/ui";
import {
  dashboardActions,
  type DashboardItem,
  type NextAction,
} from "../../../packages/knowledge/dashboard";
import { DashboardVisuals } from "./dashboard-visuals";
import { KnowledgePreview } from "./knowledge-preview";
import { DashboardTrace } from "./dashboard-trace";

export function StudioHome({
  sources,
  proposals,
  repositories,
  runs,
  libraryNext,
  draft,
  onDraft,
  onSave,
  onOpenSource,
  onOpenProposal,
  go,
  readOnly,
  busy,
  compact = false,
  organizationId,
  demo = false,
}: {
  sources: DashboardItem[];
  proposals: DashboardItem[];
  repositories: DashboardItem[];
  runs: DashboardItem[];
  libraryNext?: string | null;
  draft: string;
  onDraft: (value: string) => void;
  onSave: () => void;
  onOpenSource: (source: DashboardItem) => void;
  onOpenProposal: (proposal: DashboardItem) => void;
  go: (view: string) => void;
  readOnly: boolean;
  busy: boolean;
  compact?: boolean;
  organizationId?: string;
  demo?: boolean;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [highlightStopped, setHighlightStopped] = useState(false);
  const actions = dashboardActions({ sources, proposals, repositories, runs });
  const next =
    actions.find((a) => !dismissed.includes(a.key)) ?? actions.at(-1)!;
  const open = (action: NextAction) => {
    if (action.destination === "capture") onSave();
    else if (action.destination === "source" && action.target)
      onOpenSource(action.target);
    else if (action.destination === "proposal" && action.target)
      onOpenProposal(action.target);
    else go(action.destination);
  };
  const recent = sources.filter((s) => s.state !== "deleted").slice(0, 3);
  const projects = repositories.filter((r) => r.enabled).slice(0, 3);
  return (
    <div className="studio-home">
      <DashboardVisuals
        sources={sources}
        proposals={proposals}
        repositories={repositories}
        runs={runs}
        go={go}
        compact={compact}
      >
        <section className="studio-welcome" aria-label="Your next useful step">
          <div className="studio-next">
            <h2>{next.title}</h2>
            <p>{next.reason}</p>
            <div className="row">
              <Button
                className={
                  next.destination === "capture" && !highlightStopped
                    ? "studio-cta"
                    : ""
                }
                onPointerEnter={() => setHighlightStopped(true)}
                onPointerDown={() => setHighlightStopped(true)}
                onFocus={() => setHighlightStopped(true)}
                onAnimationEnd={() => setHighlightStopped(true)}
                disabled={busy || (readOnly && next.destination === "capture")}
                onClick={() => open(next)}
              >
                {next.action}
                <ArrowRight size={17} aria-hidden="true" />
              </Button>
              {next.key !== "capture" && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setDismissed((current) => [...current, next.key])
                  }
                >
                  Later
                </Button>
              )}
            </div>
          </div>
        </section>
        <form
          className="capture-composer studio-composer"
          aria-label="Save a post"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <Link2 size={21} aria-hidden="true" />
          <input
            type="url"
            aria-label="Post URL"
            placeholder="Paste a link worth keeping"
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            disabled={readOnly || busy}
          />
          <button
            type="submit"
            className="composer-send"
            aria-label="Save a link"
            disabled={readOnly || busy}
          >
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </form>
        {organizationId && (
          <KnowledgePreview
            organizationId={organizationId}
            demo={demo}
            onOpen={() => go("library")}
          />
        )}
      </DashboardVisuals>
      <DashboardTrace
        sources={sources}
        proposals={proposals}
        runs={runs}
        onOpenSource={onOpenSource}
        onOpenProposal={onOpenProposal}
        go={go}
      />
      <div className="studio-shelves">
        <section aria-labelledby="studio-knowledge">
          <div className="row spread">
            <h2 id="studio-knowledge">Recently added</h2>
            <Button variant="ghost" onClick={() => go("posts")}>
              All posts
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
          {recent.length ? (
            <ul className="studio-list">
              {recent.map((s) => (
                <li key={s._id ?? s.id}>
                  <button type="button" onClick={() => onOpenSource(s)}>
                    <Bookmark size={19} aria-hidden="true" />
                    <span>
                      <strong>{s.title}</strong>
                      <small>
                        {s.state === "ready"
                          ? "Insights ready"
                          : (s.state ?? "Saved").replaceAll("_", " ")}
                      </small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="studio-empty">
              Your saved ideas will live here. Start with one post.
            </p>
          )}
          {recent.length > 0 && (
            <p className="studio-coverage">
              Recent posts from the current page
              {libraryNext ? ". More posts are on the Posts page." : "."} These
              are not full-library totals.
            </p>
          )}
        </section>
        <section aria-labelledby="studio-projects">
          <div className="row spread">
            <h2 id="studio-projects">What you’re building</h2>
            <Button variant="ghost" onClick={() => go("projects")}>
              Projects
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
          {projects.length ? (
            <ul className="studio-list">
              {projects.map((p) => (
                <li key={p._id ?? p.id}>
                  <button type="button" onClick={() => go("projects")}>
                    <GitBranch size={19} aria-hidden="true" />
                    <span>
                      <strong>{p.fullName}</strong>
                      <small>
                        {p.confirmed
                          ? "Context confirmed"
                          : "Context needs your review"}
                      </small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="studio-empty">
              <p>Your library is useful before you connect a project.</p>
              <Button variant="outline" onClick={() => go("projects")}>
                Set up a project
              </Button>
            </div>
          )}
        </section>
      </div>
      <section
        className="studio-review"
        aria-label="Project activity and decisions"
      >
        <h2>Keep the whole story</h2>
        <div className="studio-review-links">
          <Button variant="ghost" onClick={() => go("proposals")}>
            Ideas & plans
          </Button>
          <Button variant="ghost" onClick={() => go("improvements")}>
            Improvements & outcomes
          </Button>
          <Button variant="ghost" onClick={() => go("runs")}>
            Runs & pull requests
          </Button>
          <Button variant="ghost" onClick={() => go("inbox")}>
            Updates
          </Button>
        </div>
        <p>
          Publication, merge, deployment and a useful outcome remain separate
          facts.
        </p>
      </section>
    </div>
  );
}
