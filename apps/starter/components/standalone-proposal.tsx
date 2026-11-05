"use client";
import { ProposalArtifact } from "./assistant-elements/proposal-artifact";
import type { TopicFit } from "../lib/project-suggestions";
import styles from "./standalone-proposal.module.css";

export function StandaloneProposal({
  proposal,
  organizationId,
  fit,
  call,
  readOnly,
  demo,
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
  demo: boolean;
}) {
  return (
    <section className={styles.reader} aria-label="Project plan and discussion">
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
          currentProblem: proposal.detail.currentProblem,
          proposedChange: proposal.detail.proposedChange ?? undefined,
          steps: proposal.detail.steps,
          insightIds: proposal.detail.insightIds,
          acceptanceCriteria: proposal.detail.acceptanceCriteria,
        }}
        href={`/app/${organizationId}/proposals/${proposal._id}`}
        fit={fit}
        initiallyOpen
        enabled={!demo}
        call={call}
        readOnly={readOnly}
      />
    </section>
  );
}
