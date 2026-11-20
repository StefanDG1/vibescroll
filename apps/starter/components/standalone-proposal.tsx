"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { FileText, FolderGit2 } from "lucide-react";
import { ProposalArtifact } from "./assistant-elements/proposal-artifact";
import type { TopicFit } from "../lib/project-suggestions";
import styles from "./standalone-proposal.module.css";

export function StandaloneProposal({
  proposal,
  organizationId,
  fit,
  call,
  readOnly,
  discussionEnabled,
  showReferences = true,
  children,
}: {
  proposal: {
    _id: string;
    sourceId: string;
    repositoryId: string;
    title: string;
    version: number;
    review: string;
    disposition: string;
    repo: { fullName: string };
    detail: {
      currentProblem?: string;
      reason?: string;
      proposedChange?: string | null;
      steps?: string[];
      insightIds?: string[];
      acceptanceCriteria: string[];
    };
  };
  organizationId: string;
  fit?: TopicFit;
  call: (operation: string, args: unknown) => Promise<any>;
  readOnly: boolean;
  discussionEnabled: boolean;
  showReferences?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={styles.reader} aria-label="Project plan and discussion">
      {showReferences && (
        <nav className={styles.references} aria-label="Proposal references">
          <Link
            href={`/app/${organizationId}/projects/${proposal.repositoryId}`}
            prefetch={false}
          >
            <FolderGit2 size={16} aria-hidden="true" /> Project
          </Link>
          <Link
            href={`/app/${organizationId}/posts/${proposal.sourceId}`}
            prefetch={false}
          >
            <FileText size={16} aria-hidden="true" /> Saved post
          </Link>
        </nav>
      )}
      <ProposalArtifact
        key={proposal._id}
        proposal={{
          id: proposal._id,
          projectId: proposal.repositoryId,
          projectName: proposal.repo.fullName,
          title: proposal.title,
          version: proposal.version,
          review: proposal.review,
          disposition: proposal.disposition,
          currentProblem:
            proposal.detail?.currentProblem ?? proposal.detail?.reason,
          proposedChange: proposal.detail?.proposedChange ?? undefined,
          steps: proposal.detail?.steps,
          insightIds: proposal.detail?.insightIds,
          acceptanceCriteria: proposal.detail?.acceptanceCriteria ?? [],
        }}
        href={`/app/${organizationId}/proposals/${proposal._id}`}
        fit={fit}
        initiallyOpen
        presentation="reader"
        enabled={discussionEnabled}
        call={call}
        readOnly={readOnly}
      />
      {children}
    </section>
  );
}
