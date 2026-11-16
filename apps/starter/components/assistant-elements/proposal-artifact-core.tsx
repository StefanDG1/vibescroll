"use client";
/* eslint-disable next/no-html-link-for-pages -- Transport-independent fallback anchors use host navigation; the website wrapper injects Next Link. */
// Adapted from assistant-ui ArtifactCard at 3fa379f814dadb02b9f9ad04e31c2d2ba92df094.
// Copyright (c) 2026 AgentbaseAI Inc. MIT; see licenses/assistant-ui-elements-3fa379f.txt.
import {
  useEffect,
  useEffectEvent,
  useId,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  FolderGit2,
  MoreHorizontal,
  Minus,
  Plus,
  Send,
} from "lucide-react";
import type { FeedProposal } from "../../lib/home-feed";
import { projectLabel } from "../../lib/home-feed";
import type { TopicFit } from "../../lib/project-suggestions";
import { ProjectFitBreakdown } from "./project-fit-breakdown";
import { SettingsPanel } from "../settings-panel";
import { useProposalWork } from "../../lib/use-proposal-work";
import type { ProposalDraftStorage } from "../../lib/proposal-draft-memory";
import { ErrorState } from "./error-state";
import { ProposalWorkObservations } from "../proposal-work-observations";
import styles from "./proposal-artifact.module.css";

export function ProposalArtifactCore({
  proposal: initialProposal,
  fit,
  href,
  initiallyOpen = false,
  open: controlled,
  onOpenChange,
  call,
  enabled = false,
  readOnly = false,
  presentation = "inline",
  transport = "web",
  renderBrandIcon,
  renderLink,
  onNavigate,
  draftStorage,
}: {
  proposal: FeedProposal;
  call?: (operation: string, args: unknown) => Promise<any>;
  enabled?: boolean;
  readOnly?: boolean;
  presentation?: "inline" | "reader" | "feed";
  fit?: TopicFit;
  href: string;
  initiallyOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  transport?: "web" | "mcp";
  renderBrandIcon?: (size: number) => ReactNode;
  renderLink?: (href: string, children: ReactNode) => ReactNode;
  onNavigate?: (href: string) => void;
  draftStorage?: ProposalDraftStorage;
}) {
  const [localOpen, setLocalOpen] = useState(initiallyOpen);
  const contentId = useId();
  const reader = presentation === "reader";
  const feed = presentation === "feed";
  const open = reader || (controlled ?? localOpen);
  const work = useProposalWork(
    initialProposal.id,
    enabled && open,
    call,
    transport,
    draftStorage,
  );
  const live = work.snapshot;
  const proposal: FeedProposal = live
    ? {
        ...initialProposal,
        ...live.body,
        proposedChange: live.body.proposedChange ?? undefined,
        version: live.version,
        review: live.review,
      }
    : initialProposal;
  const writable = enabled && !readOnly && !!live && live.current;
  const generating =
    live?.operation &&
    ["queued", "running", "unknown"].includes(live.operation.state);
  const issuePending =
    live?.issueOperation &&
    ["queued", "running", "unknown"].includes(live.issueOperation.state);
  const issue = live?.handoff?.publication ?? live?.handoff?.githubIssue;
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const preview = useEffectEvent(() => void work.previewIssue());
  const canPreview =
    enabled &&
    open &&
    !!live?.current &&
    live.body.disposition === "relevant" &&
    !live.handoff &&
    !generating;
  const previewVersion = live?.version;
  useEffect(() => {
    if (canPreview) preview();
  }, [canPreview, previewVersion]);
  const ready =
    proposal.disposition === "relevant" &&
    !!proposal.proposedChange &&
    proposal.acceptanceCriteria.length > 0;
  const name = projectLabel(proposal.projectName);
  const score =
    fit && fit.total > 0 ? Math.round((100 * fit.matched) / fit.total) : null;
  function toggle() {
    setLocalOpen(!open);
    onOpenChange?.(!open);
  }
  if (live === null)
    return (
      <ErrorState
        title="Plan unavailable"
        detail="Your access changed. Reopen this plan from your current workspace."
      />
    );
  return (
    <article
      className={styles.artifact}
      data-slot="artifact-card"
      data-proposal-id={proposal.id}
      data-expanded={open}
      data-presentation={presentation}
      onClickCapture={
        onNavigate
          ? (event) => {
              const anchor = (event.target as Element).closest("a");
              if (anchor && event.currentTarget.contains(anchor)) {
                event.preventDefault();
                onNavigate(anchor.getAttribute("href") ?? href);
              }
            }
          : undefined
      }
    >
      <header className={styles.header}>
        {reader ? (
          <div className={styles.readerIdentity}>
            <span className={styles.icon}>
              {name === "VibeScroll" && renderBrandIcon ? (
                renderBrandIcon(30)
              ) : (
                <FolderGit2 size={21} aria-hidden="true" />
              )}
            </span>
            <span className={styles.label}>
              <strong title={proposal.projectName}>{name}</strong>
              <small>Version {proposal.version}</small>
            </span>
          </div>
        ) : (
          <button
            type="button"
            className={styles.expand}
            aria-expanded={open}
            aria-controls={contentId}
            aria-label={`${open ? "Collapse" : "Expand"} ${feed ? proposal.title : `plan for ${name}`}`}
            onClick={toggle}
          >
            <span className={styles.icon}>
              {name === "VibeScroll" && renderBrandIcon ? (
                renderBrandIcon(30)
              ) : (
                <FolderGit2 size={21} aria-hidden="true" />
              )}
            </span>
            <span className={styles.label}>
              <strong title={feed ? proposal.title : proposal.projectName}>
                {feed ? proposal.title : name}
              </strong>
              {feed ? <small>{name}</small> : !ready && <small>Draft plan</small>}
            </span>
            {feed && (open
              ? <Minus className={styles.feedDisclosure} size={16} aria-hidden="true" />
              : <Plus className={styles.feedDisclosure} size={16} aria-hidden="true" />
            )}
          </button>
        )}
        {reader ? (
          <span className={styles.status}>
            {proposal.review === "unreviewed"
              ? "Needs review"
              : proposal.review.replaceAll("_", " ")}
          </span>
        ) : (
          ready && <span className={styles.status}>Ready</span>
        )}
        {!reader && !feed && (
          <button
            type="button"
            className={styles.collapse}
            aria-label={`${open ? "Collapse" : "Expand"} ${proposal.title}`}
            aria-expanded={open}
            aria-controls={contentId}
            onClick={toggle}
          >
            <ChevronDown
              className={open ? styles.rotated : undefined}
              size={18}
              aria-hidden="true"
            />
          </button>
        )}
        {!reader && !feed && (
          <div className={styles.options}>
            <SettingsPanel
              title="Plan options"
              triggerLabel={`Plan options for ${name}`}
              trigger={<MoreHorizontal size={21} aria-hidden="true" />}
            >
              <h3>{proposal.title}</h3>
              <p>
                Version {proposal.version} ·{" "}
                {proposal.review.replaceAll("_", " ")}
              </p>
              {proposal.currentProblem && (
                <>
                  <h4>Goal</h4>
                  <p>{proposal.currentProblem}</p>
                </>
              )}
              <a className="button" href={href}>
                Open full plan
              </a>
              <p className="fine">
                Uses all retained post insights and the current project profile.
                Approving creates an issue; coding starts separately.
              </p>
            </SettingsPanel>
          </div>
        )}
        {!feed && ready && score !== null && fit && (
          <div className={styles.fit}>
            <SettingsPanel
              title={`Topic fit for ${name}`}
              triggerLabel={`Topic fit for ${name}: ${score} out of 100. Show breakdown`}
              trigger={
                <span>
                  Topic fit <strong>{score}/100</strong>
                  <ChevronDown size={13} aria-hidden="true" />
                </span>
              }
            >
              <ProjectFitBreakdown
                fit={fit}
                projectName={proposal.projectName}
              />
            </SettingsPanel>
          </div>
        )}
      </header>
      <div id={contentId} hidden={!open} className={styles.body}>
        <div className={styles.readArea}>
          {reader ? <h2>{proposal.title}</h2> : !feed && <h3>{proposal.title}</h3>}
          {reader && proposal.currentProblem && proposal.proposedChange && (
            <section>
              <h3>Goal</h3>
              <p>{proposal.currentProblem}</p>
            </section>
          )}
          {(!feed || proposal.proposedChange || proposal.currentProblem) && (
            <section>
              {reader ? (
                <h3>{proposal.proposedChange ? "Proposed change" : "Goal"}</h3>
              ) : (
                <h4>{proposal.proposedChange ? "Change" : "Goal"}</h4>
              )}
              <p>{proposal.proposedChange ?? proposal.currentProblem ?? "—"}</p>
            </section>
          )}
          {feed &&
            !proposal.proposedChange &&
            !proposal.currentProblem &&
            !proposal.steps?.length &&
            !proposal.acceptanceCriteria.length && (
              <p>No proposal details yet.</p>
            )}
          {((!reader && !feed) || !!proposal.steps?.length) && (
            <section>
              {reader ? <h3>Steps</h3> : <h4>Steps</h4>}
              {proposal.steps?.length ? (
                <ol>
                  {proposal.steps.map((step, index) => (
                    <li key={index}>
                      {step.replace(/^\s*(?:\d+[.)]|[-*])\s+/, "")}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.placeholder}>—</p>
              )}
            </section>
          )}
          {((!reader && !feed) || proposal.acceptanceCriteria.length > 0) && (
            <section>
              {reader ? <h3>Acceptance checks</h3> : <h4>Checks</h4>}
              {proposal.acceptanceCriteria.length ? (
                <ul>
                  {proposal.acceptanceCriteria.map((criterion, index) => (
                    <li key={index}>{criterion}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.placeholder}>—</p>
              )}
            </section>
          )}
          <ProposalWorkObservations handoff={live?.handoff} />
          {((!reader && !feed) || enabled || !!proposal.discussion?.length) && (
            <div className={styles.discussion} aria-label="Plan discussion">
              {(enabled ? work.messages : proposal.discussion)?.map(
                (message) => (
                  <div className={styles.message} key={message.id}>
                    <span className={styles.avatar}>
                      {message.role === "assistant"
                        ? (renderBrandIcon?.(29) ?? (
                            <FolderGit2 size={21} aria-hidden="true" />
                          ))
                        : message.author.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{message.author}</strong>
                      <p>{message.body}</p>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
        {enabled && (
          <>
            {work.uncertain && !work.error && (
              <ErrorState
                title="Confirm the previous action"
                detail="The exact request key is saved. Refresh this plan's status or recover that same request before starting another action."
                action={
                  <>
                    <button type="button" onClick={() => void work.refresh()}>
                      Refresh plan status
                    </button>
                    <button
                      type="button"
                      onClick={() => void work.retryPending()}
                    >
                      Recover same request
                    </button>
                  </>
                }
              />
            )}
            {work.error && (
              <ErrorState
                title={work.recovery?.title ?? "Plan action needs attention"}
                detail={work.error}
                action={
                  work.uncertain ? (
                    <>
                      <button type="button" onClick={() => void work.refresh()}>
                        Refresh plan status
                      </button>
                      <button
                        type="button"
                        onClick={() => void work.retryPending()}
                      >
                        Recover same request
                      </button>
                    </>
                  ) : work.recovery?.action === "billing" ? (
                    renderLink ? (
                      renderLink(
                        "/app?view=billing&tier=pro",
                        "Review personal billing",
                      )
                    ) : (
                      <a href="/app?view=billing&tier=pro">
                        Review personal billing
                      </a>
                    )
                  ) : work.recovery?.action === "review_access" ? (
                    renderLink ? (
                      renderLink(
                        href.replace(
                          /\/proposals\/[^/?#]+(?:[?#].*)?$/,
                          "/connections",
                        ),
                        "Review Connections",
                      )
                    ) : (
                      <a
                        href={href.replace(
                          /\/proposals\/[^/?#]+(?:[?#].*)?$/,
                          "/connections",
                        )}
                      >
                        Review Connections
                      </a>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void (work.recovery?.action === "refresh_quote"
                          ? work.getQuote()
                          : work.refresh())
                      }
                    >
                      {work.recovery?.action === "refresh_quote"
                        ? "Refresh plan and quote"
                        : "Refresh plan status"}
                    </button>
                  )
                }
              />
            )}
            {live?.operation && (
              <output className={styles.progress}>
                {live.operation.state === "queued"
                  ? "Plan queued"
                  : live.operation.state === "running"
                    ? "Writing your plan…"
                    : live.operation.state === "unknown"
                      ? "Provider usage needs confirmation. No second request was started."
                      : live.operation.state === "stale"
                        ? "Your context changed. The saved plan was preserved."
                        : live.operation.state === "failed"
                          ? "Plan generation stopped. Your draft is preserved."
                          : "Plan ready"}
              </output>
            )}
            {live?.generatedVersion ? (
              <p className={styles.target}>
                AI reply · up to {work.quote?.maximumCredits ?? 3} credits
              </p>
            ) : work.quote ? (
              <button
                className={styles.secondary}
                type="button"
                disabled={
                  work.busy || work.uncertain || !writable || !!generating
                }
                title="GLM Flash with no-training routing. Only confirmed provider usage is charged; unused reserved credits return to your account."
                onClick={() => void work.generate()}
              >
                Generate plan · up to {work.quote.maximumCredits} credits
              </button>
            ) : (
              <button
                className={styles.secondary}
                type="button"
                disabled={
                  work.busy ||
                  work.uncertain ||
                  !writable ||
                  !!generating ||
                  !!issuePending
                }
                onClick={() => void work.getQuote()}
              >
                {proposal.steps?.length
                  ? "Update plan with credits"
                  : "Generate plan with credits"}
              </button>
            )}
          </>
        )}
        {!feed && (!reader || enabled) && (
          <div className={styles.composer}>
            <textarea
              aria-label={
                enabled
                  ? "Plan discussion"
                  : "Proposal discussion, not connected yet"
              }
              placeholder="Suggest a change…"
              rows={1}
              maxLength={4000}
              disabled={!writable || work.busy || work.uncertain}
              value={work.draft}
              onChange={(event) => work.updateDraft(event.target.value)}
            />
            <button
              type="button"
              aria-label={
                live?.generatedVersion ? "Send and update plan" : "Save message"
              }
              title={
                live?.generatedVersion
                  ? "Save this message and generate a revised plan within the displayed credit limit."
                  : "Save feedback. Generating a plan uses the separate credit quote."
              }
              disabled={
                !writable ||
                work.busy ||
                work.uncertain ||
                !work.draft.trim() ||
                (!!live?.generatedVersion && (!!generating || !work.quote))
              }
              onClick={() => void work.send()}
            >
              <Send size={19} aria-hidden="true" />
            </button>
          </div>
        )}
        {enabled && work.hasOlder && (
          <button
            className={styles.secondary}
            type="button"
            disabled={work.busy}
            onClick={() => void work.loadOlder()}
          >
            Earlier messages
          </button>
        )}
        {feed ? (
          <div className={styles.feedFooter}>
            {renderLink ? (
              renderLink(href, "Open full proposal")
            ) : (
              <a href={href}>Open full proposal</a>
            )}
          </div>
        ) : issue ? (
          <div className={styles.issueActions}>
            <a
              className={styles.approve}
              href={issue.url}
              target="_blank"
              rel="noreferrer"
            >
              Open issue
            </a>
            <button
              className={styles.secondary}
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(
                    `Work on ${issue.url}. Read its exact VibeScroll proposal and handoff instructions, inspect the repository, implement the requested change, and report the actual outcome through report_project_outcome. Do not claim tests or benefit without evidence.`,
                  )
                  .then(() => setCopied(true))
                  .catch(() => {
                    setCopied(false);
                    setCopyFailed(true);
                  })
              }
            >
              {copied ? "Copied" : "Copy work prompt"}
            </button>
            {copyFailed && (
              <label>
                Copy this work prompt
                <textarea
                  readOnly
                  rows={5}
                  value={`Work on ${issue.url}. Read its exact VibeScroll proposal and handoff instructions, inspect the repository, implement the requested change, and report the actual outcome through report_project_outcome. Do not claim tests or benefit without evidence.`}
                />
              </label>
            )}
          </div>
        ) : live?.handoff ? (
          <>
            <output className={styles.progress}>
              {live.issueOperation?.state === "complete"
                ? "Issue published"
                : live.issueOperation?.state === "queued"
                  ? "Issue queued"
                  : live.issueOperation?.state === "running"
                    ? "Creating issue…"
                    : live.issueOperation?.state === "failed" &&
                        live.issueOperation.errorCode === "BASE_CHANGED"
                      ? "Repository changed. Refresh its snapshot and review a new plan."
                      : "Publication needs confirmation or GitHub setup."}
            </output>
            {live.issueOperation &&
              !(
                live.issueOperation.state === "failed" &&
                live.issueOperation.errorCode === "BASE_CHANGED"
              ) &&
              ["failed", "unknown"].includes(live.issueOperation.state) && (
                <button
                  className={styles.secondary}
                  type="button"
                  disabled={work.busy || work.uncertain || !writable}
                  onClick={() => void work.retryIssue()}
                >
                  {live.issueOperation.state === "unknown"
                    ? "Check existing publication"
                    : "Retry issue publication"}
                </button>
              )}
          </>
        ) : reader && !enabled ? (
          <p className={styles.readerUnavailable}>
            Plan discussion and issue actions are unavailable.
          </p>
        ) : (
          <>
            {work.issuePreview && (
              <p className={styles.target}>
                {work.issuePreview.visibility === "public"
                  ? "Public"
                  : "Private"}{" "}
                issue · {work.issuePreview.repository}
              </p>
            )}
            <button
              type="button"
              className={styles.approve}
              title={
                !enabled
                  ? "Issue creation from this view is not available in the demo"
                  : undefined
              }
              disabled={
                !writable ||
                !ready ||
                work.busy ||
                work.uncertain ||
                !!generating ||
                !work.issuePreview ||
                work.issuePreview.version !== live?.version
              }
              onClick={() => void work.approve()}
            >
              <Check size={19} aria-hidden="true" />
              Approve &amp; create issue
            </button>
          </>
        )}
      </div>
    </article>
  );
}
