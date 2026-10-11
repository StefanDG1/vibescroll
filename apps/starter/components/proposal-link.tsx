import { FileText, ChevronRight } from "lucide-react";
import { insightProposalStatus } from "@/lib/insight-project-links";
import { proposalTopicLabels } from "../../../packages/knowledge/proposal-badges";
export function ProposalLink({
  step,
  demo,
  organizationId,
  topics,
}: {
  step: any;
  demo: boolean;
  organizationId: string;
  topics?: { id: string; name: string; parentId?: string }[];
}) {
  const status = insightProposalStatus(step);
  return (
    <a
      className="hybrid-proposal-link"
      data-open={status.open}
      href={
        demo
          ? `/demo?view=projects&proposal=${encodeURIComponent(step.id)}`
          : `/app/${organizationId}/projects?proposal=${encodeURIComponent(step.id)}`
      }
    >
      <FileText size={18} aria-hidden="true" />
      <div>
        <strong>{step.title}</strong>
        <small>
          {step.repository} ·{" "}
          <span className="hybrid-proposal-state">{status.label}</span>
        </small>
        {step.description && (
          <p>
            {step.description.replace(/^[#>*\s]+/gm, "").replace(/\s+/g, " ")}
          </p>
        )}
        {topics && (
          <ul className="hybrid-proposal-topics" aria-label="Related topics">
            {proposalTopicLabels(step, topics).map((topic) => (
              <li key={topic.id}>{topic.name}</li>
            ))}
          </ul>
        )}
      </div>
      <ChevronRight size={17} aria-hidden="true" />
    </a>
  );
}
