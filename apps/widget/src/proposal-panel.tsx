import { useEffect, useState } from "react";
import { chatProposalReadOutput } from "../../../packages/contracts/chat-proposals";
import type { ToolRecord } from "../../../packages/widget/contracts";
import { ProposalArtifactCore } from "../../starter/components/assistant-elements/proposal-artifact-core";
import { proposalRuntime } from "./proposal-runtime";
import { isAccessFailure } from "./application-model";
import type { ProposalDraftStorage } from "../../starter/lib/proposal-draft-memory";

export function ProposalPanel({
  proposalId,
  profileId,
  call,
  onNavigate,
  onBack,
  readOnly = false,
  draftStorage,
}: {
  proposalId: string;
  profileId: string;
  call: (name: string, args: ToolRecord) => Promise<ToolRecord>;
  onNavigate: (url: string) => void;
  onBack?: () => void;
  readOnly?: boolean;
  draftStorage?: ProposalDraftStorage;
}) {
  const [record, setRecord] =
    useState<ReturnType<typeof chatProposalReadOutput.parse>>();
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void call("get_project_proposal", { profileId, proposalId })
      .then((value) => {
        const data = chatProposalReadOutput.parse(value);
        if (data.profileId !== profileId || data.proposalId !== proposalId)
          throw Error("The returned plan belongs to a different view.");
        if (current) {
          setRecord(data);
          setError("");
        }
      })
      .catch((failure) => {
        if (current) {
          setRecord(undefined);
          setError(
            isAccessFailure(failure)
              ? "This plan is no longer available through your current connection."
              : "The saved plan could not be loaded. Open VibeScroll to check its current state.",
          );
        }
      });
    return () => {
      current = false;
    };
    // The host adapter changes identity on theme/capability updates. Scope IDs own this read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, proposalId]);
  return (
    <section className="widget-proposal-panel" aria-label="Saved project plan">
      {onBack && (
        <button className="compact-back" onClick={onBack}>
          Back to work
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {!record && !error && <output>Loading the current saved plan…</output>}
      {record && (
        <ProposalArtifactCore
          key={`${profileId}:${proposalId}`}
          proposal={{
            ...record.body,
            id: record.proposalId,
            projectId: record.projectId,
            projectName: "Saved project plan",
            version: record.version,
            review: record.review,
            proposedChange: record.body.proposedChange ?? undefined,
          }}
          href={record.reviewUrl}
          enabled
          readOnly={readOnly}
          transport="mcp"
          draftStorage={draftStorage}
          initiallyOpen
          call={proposalRuntime(call, profileId)}
          onNavigate={onNavigate}
        />
      )}
    </section>
  );
}
