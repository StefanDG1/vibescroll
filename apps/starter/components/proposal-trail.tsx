import { Check, Circle } from "lucide-react";
import { proposalTrail } from "@/lib/proposal-trail";
import { ProposalWorkObservations } from "./proposal-work-observations";
export function ProposalTrail({
  proposal,
  runs,
}: {
  proposal: Parameters<typeof proposalTrail>[0];
  runs: Parameters<typeof proposalTrail>[1];
}) {
  return (
    <section
      className="panel atlas-proposal-trail"
      aria-label="Proposal progress"
    >
      <h2>From saved post to change</h2>
      <ol>
        {proposalTrail(proposal, runs).map((stage) => (
          <li key={stage.label} data-state={stage.state}>
            <span className="atlas-stage-icon">
              {stage.state === "recorded" ? (
                <Check size={18} aria-hidden="true" />
              ) : (
                <Circle size={16} aria-hidden="true" />
              )}
            </span>
            <div>
              <strong>{stage.label}</strong>
              <p>{stage.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <ProposalWorkObservations handoff={proposal.detail?.handoff} />
    </section>
  );
}
