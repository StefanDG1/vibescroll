"use client";
import { useId, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@companynerve/ui";
import { SettingsPanel } from "./settings-panel";
import { projectProposalDraft } from "../../../packages/contracts/project-proposal-draft";
import type { z } from "zod";
import type { saveProjectProposalInput } from "../../../packages/contracts/chat-proposals";

type SaveInput = z.infer<typeof saveProjectProposalInput>;
type Project = { id: string; name: string };
export function ProjectProposalComposer({
  organizationId,
  sourceId,
  analysisVersionId,
  insight,
  projects,
  suggestions,
  disabled,
  call,
  onNavigate,
  onContinue,
}: {
  organizationId: string;
  sourceId: string;
  analysisVersionId: string;
  insight: { id: string; title: string; claim: string };
  projects: Project[];
  suggestions: (Project & { topics: string[] })[];
  disabled: boolean;
  call: (operation: string, args: unknown) => Promise<any>;
  onNavigate?: (url: string) => void | Promise<void>;
  onContinue?: (proposalId: string) => Promise<void>;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(
    suggestions[0]?.id ?? projects[0]?.id ?? "",
  );
  const [title, setTitle] = useState(insight.title.slice(0, 160));
  const [goal, setGoal] = useState("");
  const [change, setChange] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [savedId, setSavedId] = useState<string>();
  const [continuing, setContinuing] = useState(false);
  const [continued, setContinued] = useState(false);
  const pending = useRef<SaveInput | null>(null);
  const flight = useRef(false);
  const locked = submitting || uncertain || !!savedId;
  function choose(id: string) {
    if (!locked) setProjectId(id);
    setOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (flight.current || disabled || savedId) return;
    if (!pending.current && (!title.trim() || !goal.trim())) {
      setError("Add a title and a goal for this proposal.");
      return;
    }
    flight.current = true;
    setSubmitting(true);
    setError("");
    try {
      if (!pending.current) {
        const context = await call("projectPlanningContext", {
          sourceId,
          projectId,
          analysisVersionId,
          insightIds: [insight.id],
        });
        pending.current = await projectProposalDraft({
          sourceId,
          projectId,
          analysisVersionId,
          insightId: insight.id,
          contextHash: context.contextHash,
          title,
          goal,
          change,
        });
      }
      const result = await call("projectProposalSave", pending.current);
      if (!result?.proposalId) throw Error("Save was not confirmed.");
      setSavedId(result.proposalId);
      setUncertain(false);
    } catch (failure) {
      const rejected =
        !!failure &&
        typeof failure === "object" &&
        "outcome" in failure &&
        failure.outcome === "rejected";
      if (rejected) {
        pending.current = null;
        setUncertain(false);
      } else setUncertain(!!pending.current);
      setError(
        pending.current && !rejected
          ? "Save was not confirmed. Retry to check the same request; your draft is preserved."
          : rejected && "code" in failure && failure.code === "APPROVAL_STALE"
            ? "The post or project changed. Your draft is preserved. Review it and save again."
            : failure instanceof Error
              ? failure.message
              : "Could not save this proposal. Your draft is preserved.",
      );
    } finally {
      flight.current = false;
      setSubmitting(false);
    }
  }
  function navigate(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!onNavigate) return;
    event.preventDefault();
    Promise.resolve(onNavigate(event.currentTarget.href)).catch(() =>
      setError(
        "The host did not open the page. Open VibeScroll in your browser to continue.",
      ),
    );
  }
  async function continueInChat() {
    if (!savedId || !onContinue || continuing || continued) return;
    setContinuing(true);
    setError("");
    try {
      await onContinue(savedId);
      setContinued(true);
    } catch {
      setError(
        "The host did not confirm the follow-up. Your proposal is still saved in VibeScroll.",
      );
    } finally {
      setContinuing(false);
    }
  }
  return (
    <div className="insight-project-suggestions">
      {suggestions.length > 0 && (
        <>
          <h4>Suggested projects</h4>
          {suggestions.map((p) => (
            <button
              type="button"
              className="project-choice-row"
              key={p.id}
              disabled={disabled}
              onClick={() => choose(p.id)}
            >
              <span>
                {p.name}
                <small>
                  Topic overlap:{" "}
                  {p.topics.map((t) => t.replaceAll("_", " ")).join(", ")}
                </small>
              </span>
              <span>
                Use insight <ArrowRight size={16} aria-hidden="true" />
              </span>
            </button>
          ))}
        </>
      )}
      {projects.length > 0 ? (
        <button
          type="button"
          className="button"
          disabled={disabled}
          onClick={() => choose(projectId)}
        >
          {suggestions.length ? "Choose another project" : "Use in a project"}
        </button>
      ) : (
        <a
          href={`https://scroll.companynerve.com/app/${organizationId}/projects`}
          onClick={onNavigate ? navigate : undefined}
        >
          Connect a project
        </a>
      )}
      <SettingsPanel
        title="Create proposal"
        triggerLabel="Create proposal"
        trigger={false}
        open={open}
        onOpenChange={setOpen}
      >
        <p className="proposal-source-claim">{insight.claim}</p>
        {savedId ? (
          <section aria-live="polite">
            <h3>Proposal saved</h3>
            <p>Continue refining it in ChatGPT, Codex or VibeScroll.</p>
            {onContinue && (
              <Button
                type="button"
                className="button"
                disabled={continuing || continued}
                aria-busy={continuing}
                onClick={() => {
                  void continueInChat();
                }}
              >
                {continued
                  ? "Sent to chat"
                  : continuing
                    ? "Sending…"
                    : "Continue in chat"}
              </Button>
            )}
            {error && <p role="alert">{error}</p>}
            <a
              className="button"
              href={`https://scroll.companynerve.com/app/${organizationId}/proposals/${savedId}`}
              onClick={onNavigate ? navigate : undefined}
            >
              Open proposal <ArrowRight size={16} aria-hidden="true" />
            </a>
          </section>
        ) : (
          <form className="proposal-composer" onSubmit={save}>
            <label htmlFor={`${uid}-project`}>Project</label>
            <select
              id={`${uid}-project`}
              value={projectId}
              disabled={locked}
              onChange={(e) => setProjectId(e.target.value)}
              required
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label htmlFor={`${uid}-title`}>Title</label>
            <input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              required
              disabled={locked}
            />
            <label htmlFor={`${uid}-goal`}>
              What would you like to improve?
            </label>
            <textarea
              id={`${uid}-goal`}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={2000}
              required
              disabled={locked}
              rows={4}
            />
            <label htmlFor={`${uid}-change`}>
              Proposed change <span className="muted">Optional</span>
            </label>
            <textarea
              id={`${uid}-change`}
              value={change}
              onChange={(e) => setChange(e.target.value)}
              maxLength={4000}
              disabled={locked}
              rows={4}
            />
            <p className="fine">
              Saves a draft with this insight. No analysis credits or
              implementation start here.
            </p>
            {error && <p role="alert">{error}</p>}
            <Button
              type="submit"
              className="button"
              aria-busy={submitting}
              disabled={disabled || submitting || !projectId}
            >
              {uncertain ? "Retry save" : "Save proposal"}
            </Button>
          </form>
        )}
      </SettingsPanel>
    </div>
  );
}
