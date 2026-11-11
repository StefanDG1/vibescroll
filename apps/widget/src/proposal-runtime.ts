import { proposalLoopInputs } from "../../../packages/contracts/proposal-loop";
import type { ToolRecord } from "../../../packages/widget/contracts";

const operations = {
  proposalDiscussion: "get_proposal_discussion",
  proposalComment: "add_proposal_message",
  proposalReply: "reply_to_project_plan",
  proposalPlanQuote: "quote_project_plan",
  proposalPlanStart: "start_project_plan",
  proposalIssuePreview: "preview_project_issue",
  proposalIssueApprove: "approve_project_issue",
  proposalIssueRetry: "retry_project_issue",
} as const;

/** Translate the shared plan controller's semantic operations into existing tools. */
export function proposalRuntime(
  call: (name: string, args: ToolRecord) => Promise<ToolRecord>,
  profileId: string,
) {
  return async (operation: string, args: unknown) => {
    const name = operations[operation as keyof typeof operations];
    if (!name) throw Error("This plan action is unavailable in this view.");
    const input = proposalLoopInputs[name].parse({
      ...(args as ToolRecord),
      profileId,
    });
    return call(name, input);
  };
}
