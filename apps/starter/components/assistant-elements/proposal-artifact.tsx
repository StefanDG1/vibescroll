"use client";
// Adapted from assistant-ui ArtifactCard at 3fa379f814dadb02b9f9ad04e31c2d2ba92df094.
// Copyright (c) 2026 AgentbaseAI Inc. MIT; see licenses/assistant-ui-elements-3fa379f.txt.
import { useId, useState } from "react";
import Image from "next/image";
import {
  Check,
  ChevronDown,
  FolderGit2,
  MoreHorizontal,
  Send,
} from "lucide-react";
import type { FeedProposal } from "@/lib/home-feed";
import { projectLabel } from "@/lib/home-feed";
import type { TopicFit } from "@/lib/project-suggestions";
import { ProjectFitBreakdown } from "./project-fit-breakdown";
import { SettingsPanel } from "../settings-panel";
import styles from "./proposal-artifact.module.css";

export function ProposalArtifact({
  proposal,
  fit,
  href,
  initiallyOpen = false,
  open: controlled,
  onOpenChange,
}: {
  proposal: FeedProposal;
  fit?: TopicFit;
  href: string;
  initiallyOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(initiallyOpen);
  const contentId = useId();
  const open = controlled ?? localOpen;
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
  return (
    <article
      className={styles.artifact}
      data-slot="artifact-card"
      data-proposal-id={proposal.id}
      data-expanded={open}
    >
      <header className={styles.header}>
        <button
          type="button"
          className={styles.expand}
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={`${open ? "Collapse" : "Expand"} plan for ${name}`}
          onClick={toggle}
        >
          <span className={styles.icon}>
            {name === "VibeScroll" ? (
              <Image src="/icon.svg" alt="" width={30} height={30} />
            ) : (
              <FolderGit2 size={21} aria-hidden="true" />
            )}
          </span>
          <span className={styles.label}>
            <strong title={proposal.projectName}>{name}</strong>
            {!ready && <small>Draft plan</small>}
          </span>
        </button>
        {ready && <span className={styles.status}>Ready</span>}
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
              Discussion and issue creation from this view are not connected
              yet.
            </p>
          </SettingsPanel>
        </div>
        {ready && score !== null && fit && (
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
          <h3>{proposal.title}</h3>
          <section>
            <h4>{proposal.proposedChange ? "Change" : "Goal"}</h4>
            <p>{proposal.proposedChange ?? proposal.currentProblem ?? "—"}</p>
          </section>
          <section>
            <h4>Steps</h4>
            {proposal.steps?.length ? (
              <ol>
                {proposal.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            ) : (
              <p className={styles.placeholder}>—</p>
            )}
          </section>
          <section>
            <h4>Checks</h4>
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
          <div className={styles.discussion} aria-label="Plan discussion">
            {proposal.discussion?.map((message) => (
              <div className={styles.message} key={message.id}>
                <span className={styles.avatar}>
                  {message.role === "assistant" ? (
                    <Image src="/icon.svg" alt="" width={29} height={29} />
                  ) : (
                    message.author.slice(0, 1)
                  )}
                </span>
                <div>
                  <strong>{message.author}</strong>
                  <p>{message.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          className={styles.composer}
          title="Proposal discussion is not connected yet"
        >
          <textarea
            aria-label="Proposal discussion, not connected yet"
            placeholder="Ask a question or suggest a change…"
            rows={1}
            disabled
          />
          <button type="button" aria-label="Send message" disabled>
            <Send size={19} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className={styles.approve}
          disabled
          title="Issue creation from this view is not available yet"
        >
          <Check size={19} aria-hidden="true" />
          Approve &amp; create issue
        </button>
      </div>
    </article>
  );
}
