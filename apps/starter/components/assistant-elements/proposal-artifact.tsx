"use client";
// Adapted from assistant-ui ArtifactCard at 3fa379f814dadb02b9f9ad04e31c2d2ba92df094.
// Copyright (c) 2026 AgentbaseAI Inc. MIT; see licenses/assistant-ui-elements-3fa379f.txt.
// Adds native disclosure semantics around the existing versioned VibeScroll proposal.
import { useId, useState } from "react";
import { ArrowUpRight, ChevronDown, FolderGit2 } from "lucide-react";
import type { FeedProposal } from "@/lib/home-feed";
import type { TopicFit } from "@/lib/project-suggestions";
import { ProjectFitBreakdown } from "./project-fit-breakdown";
import styles from "./proposal-artifact.module.css";

export function ProposalArtifact({
  proposal,
  fit,
  href,
  initiallyOpen = false,
}: {
  proposal: FeedProposal;
  fit?: TopicFit;
  href: string;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const contentId = useId();
  const ready = proposal.disposition === "relevant";
  return (
    <article className={styles.artifact} data-slot="artifact-card">
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.icon}>
          <FolderGit2 size={20} aria-hidden="true" />
        </span>
        <span className={styles.label}>
          <strong>{proposal.projectName}</strong>
          <small>{proposal.title}</small>
        </span>
        <span className={styles.status}>{ready ? "Plan" : "Draft"}</span>
        <ChevronDown
          className={open ? styles.rotated : undefined}
          size={17}
          aria-hidden="true"
        />
      </button>
      {ready && fit && (
        <div className={styles.fit}>
          <ProjectFitBreakdown fit={fit} projectName={proposal.projectName} />
        </div>
      )}
      <div id={contentId} hidden={!open} className={styles.body}>
        <h3>{proposal.title}</h3>
        {proposal.currentProblem && <p>{proposal.currentProblem}</p>}
        {proposal.proposedChange && (
          <section>
            <h4>Change</h4>
            <p>{proposal.proposedChange}</p>
          </section>
        )}
        {proposal.acceptanceCriteria.length > 0 && (
          <section>
            <h4>Checks</h4>
            <ul>
              {proposal.acceptanceCriteria.map((criterion, index) => (
                <li key={index}>{criterion}</li>
              ))}
            </ul>
          </section>
        )}
        <footer>
          <span>
            Version {proposal.version} · {proposal.review.replaceAll("_", " ")}
          </span>
          <a href={href}>
            Open plan <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </article>
  );
}
