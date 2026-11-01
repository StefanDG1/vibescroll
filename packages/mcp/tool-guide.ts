// Editorial metadata only. Discovery supplies schemas, scopes and annotations.
// Funding describes the possible operation, not a user's current authority.
// no_ai means no model generation; infrastructure and account costs still apply.
export const toolGroups = [
  {
    id: "connect",
    title: "Connect and choose a workspace",
    description: "Discover approved workspaces and selected project context.",
    audience: "general",
  },
  {
    id: "knowledge",
    title: "Find and read knowledge",
    description: "Search saved posts and retrieve current cited insights.",
    audience: "general",
  },
  {
    id: "save",
    title: "Save and estimate preparation",
    description:
      "Save a supplied link or review a preparation and analysis quote.",
    audience: "general",
  },
  {
    id: "analysis",
    title: "Analyze and track progress",
    description: "Start an authorized route and read its observed state.",
    audience: "general",
  },
  {
    id: "versions",
    title: "Versions, selection and retry",
    description:
      "Read, compare and explicitly select retained analysis versions.",
    audience: "general",
  },
  {
    id: "proposals",
    title: "Projects and saved proposals",
    description:
      "Read project context and keep a private proposal across chats.",
    audience: "general",
  },
  {
    id: "discussion",
    title: "Discussion and plan generation",
    description:
      "Persist plan discussion or explicitly choose credit-funded generation.",
    audience: "general",
  },
  {
    id: "handoff",
    title: "Approval and GitHub handoff",
    description:
      "Preview and approve one exact issue, then reconcile its publication.",
    audience: "general",
  },
  {
    id: "feedback",
    title: "Feedback and outcomes",
    description:
      "Record explicit judgments and distinguish reports from verified outcomes.",
    audience: "general",
  },
  {
    id: "worker",
    title: "Advanced: native worker",
    description: "Operate an exact authorized Cloud or evidence-repair lease.",
    audience: "worker",
  },
  {
    id: "embedded",
    title: "Advanced: embedded-view adapters",
    description:
      "Open authorized views, cards and read-only snapshots in supported hosts.",
    audience: "embedded",
  },
] as const;

export type ToolGroupId = (typeof toolGroups)[number]["id"];
export type ToolGuideEntry = {
  group: ToolGroupId;
  skills: readonly string[];
  funding: "no_ai" | "quote" | "credits" | "host_worker" | "conditional";
  purpose: string;
  result: string;
  flow: string;
};

const find = "/docs/workflows/find-save";
const analyze = "/docs/workflows/analyze";
const reanalyze = "/docs/workflows/reanalyze";
const proposals = "/docs/workflows/proposals";
const discussion = "/docs/workflows/discussion";
const handoff = "/docs/workflows/handoff";
const skills = "/docs/mcp/skills";

export const toolGuide: Record<string, ToolGuideEntry> = {
  get_profile: {
    group: "connect",
    skills: ["vibescroll-setup", "vibescroll-project-review"],
    funding: "no_ai",
    purpose: "Discover approved workspace IDs and selected project context.",
    result:
      "A bounded workspace page with grant state and, for a selected workspace, permitted project profiles.",
    flow: "/docs/mcp/first-workflow",
  },
  search: {
    group: "knowledge",
    skills: ["vibescroll-find"],
    funding: "no_ai",
    purpose:
      "Find ranked posts/insights in the active authorized workspace, or use compatible legacy search.",
    result:
      "Compact post records with fetch_id, exact own/shared references and referring matches; signed ranked continuation and index coverage. Legacy results retain their cursor/offset.",
    flow: find,
  },
  fetch: {
    group: "knowledge",
    skills: ["vibescroll-find", "vibescroll-compare"],
    funding: "no_ai",
    purpose:
      "Read an exact current granted result and its protected citations.",
    result:
      "Cited insight summaries, or explicit retained post context with paginated transcript/observations, insights and one screenshot manifest.",
    flow: find,
  },
  read_post_frame: {
    group: "knowledge",
    skills: ["vibescroll-find", "vibescroll-compare"],
    funding: "no_ai",
    purpose:
      "Inspect an actual retained screenshot for an explicitly referenced post.",
    result:
      "One verified native JPEG and exact frame/version metadata, with current access checks and no worker job or acknowledgment.",
    flow: find,
  },
  search_mentions: {
    group: "knowledge",
    skills: ["vibescroll-find"],
    funding: "no_ai",
    purpose:
      "Find authorized saved-source mentions for a supported host's mention picker.",
    result:
      "Up to eight resource links from authorized search or source browsing.",
    flow: find,
  },
  save_link: {
    group: "save",
    skills: ["vibescroll-save"],
    funding: "conditional",
    purpose:
      "Save a user-supplied supported link using the reviewed connection defaults or save-only choice.",
    result:
      "A durable source receipt, current state and supported next action; configured automatic analysis may be queued.",
    flow: find,
  },
  quote_video_analysis: {
    group: "save",
    skills: ["vibescroll-save"],
    funding: "quote",
    purpose:
      "Review the supported preparation and video-analysis route before starting work.",
    result:
      "A quote with maximum credits, route, model and cache or retained-evidence reuse information; no reservation.",
    flow: analyze,
  },
  start_video_analysis: {
    group: "analysis",
    skills: ["vibescroll-save", "vibescroll-status"],
    funding: "conditional",
    purpose:
      "Start the accepted quote with its exact route, maximum and stable request key.",
    result:
      "Source, run and version references for existing or admitted work, preserving prior results.",
    flow: analyze,
  },
  video_analysis_status: {
    group: "analysis",
    skills: ["vibescroll-status"],
    funding: "no_ai",
    purpose: "Read the observed state of server-prepared video work.",
    result:
      "Preparation and analysis stages, reserved or charged credits, safe failure details and saved-version links.",
    flow: analyze,
  },
  get_job_status: {
    group: "analysis",
    skills: ["vibescroll-status"],
    funding: "no_ai",
    purpose:
      "Read the exact saved source's current job and Cloud request state.",
    result:
      "Generation, revision, grant version and supported setup or recovery information without private logs.",
    flow: analyze,
  },
  request_analysis: {
    group: "analysis",
    skills: ["vibescroll-save", "vibescroll-status"],
    funding: "conditional",
    purpose:
      "Continue the reviewed analysis route or an explicitly chosen supported mode.",
    result:
      "The existing or requested work state, setup guidance or app review destination; uncertain work is preserved.",
    flow: analyze,
  },
  analysis_history: {
    group: "versions",
    skills: ["vibescroll-status", "vibescroll-compare"],
    funding: "no_ai",
    purpose: "Read retained analysis versions and the current selection.",
    result:
      "Bounded version metadata, selection revision and pending attempt information.",
    flow: reanalyze,
  },
  analysis_version: {
    group: "versions",
    skills: ["vibescroll-find", "vibescroll-compare"],
    funding: "no_ai",
    purpose: "Read an exact retained analysis version or the selected version.",
    result:
      "The permitted version's analysis and provenance without raw transcripts or image URLs.",
    flow: reanalyze,
  },
  compare_analysis_versions: {
    group: "versions",
    skills: ["vibescroll-compare"],
    funding: "no_ai",
    purpose:
      "Compare two retained analyses without generating another analysis.",
    result: "Deterministic differences, rather than a model-quality judgment.",
    flow: reanalyze,
  },
  select_analysis_version: {
    group: "versions",
    skills: ["vibescroll-compare"],
    funding: "no_ai",
    purpose: "Explicitly select or roll back to a retained private version.",
    result: "The acknowledged selection and revision without new analysis.",
    flow: reanalyze,
  },
  request_analysis_version: {
    group: "versions",
    skills: ["vibescroll-save", "vibescroll-compare"],
    funding: "host_worker",
    purpose:
      "Queue an explicitly requested native analysis of retained evidence.",
    result:
      "A fresh attempt ID bound to current selection authority while preserving the incumbent.",
    flow: reanalyze,
  },
  cancel_waiting_analysis_version: {
    group: "versions",
    skills: ["vibescroll-status"],
    funding: "no_ai",
    purpose:
      "Cancel an explicitly selected retained-evidence request that has not been claimed.",
    result:
      "Cancellation of eligible waiting work with the selected analysis preserved; running or unknown work is not reset.",
    flow: reanalyze,
  },
  get_project_application_context: {
    group: "proposals",
    skills: ["vibescroll-project-review"],
    funding: "no_ai",
    purpose:
      "Read retained post insights alongside one current granted project profile.",
    result:
      "Version-bound insights, citations, project revision and context hash; repository code is not included.",
    flow: proposals,
  },
  draft_project_suggestion: {
    group: "proposals",
    skills: ["vibescroll-project-review"],
    funding: "no_ai",
    purpose:
      "Prepare or reopen a private draft from an exact current server evaluation.",
    result:
      "A saved cited draft or existing draft with manual edits preserved.",
    flow: proposals,
  },
  save_project_proposal: {
    group: "proposals",
    skills: ["vibescroll-project-review"],
    funding: "no_ai",
    purpose:
      "Persist a chat-written private proposal using current context and version bindings.",
    result:
      "A saved proposal ID, version, citations and review link; stale edits require reconciliation.",
    flow: proposals,
  },
  get_project_proposal: {
    group: "proposals",
    skills: ["vibescroll-project-review"],
    funding: "no_ai",
    purpose:
      "Resume one saved chat-created proposal with current access checks.",
    result: "Its body, version, review state and refreshed context hash.",
    flow: proposals,
  },
  list_project_proposals: {
    group: "proposals",
    skills: ["vibescroll-project-review"],
    funding: "no_ai",
    purpose:
      "Find saved proposals in the selected workspace, optionally for one project.",
    result:
      "Bounded proposal metadata and continuation; an empty filtered page does not establish absence.",
    flow: proposals,
  },
  get_proposal_discussion: {
    group: "discussion",
    skills: ["vibescroll-project-review", "vibescroll-work-review"],
    funding: "no_ai",
    purpose: "Read the current saved plan and discussion across chats.",
    result:
      "Paginated messages, current version, generation and publication states, and a confirmed issue when available.",
    flow: discussion,
  },
  add_proposal_message: {
    group: "discussion",
    skills: ["vibescroll-project-review"],
    funding: "no_ai",
    purpose:
      "Persist requested feedback or a chat-written response without model generation.",
    result:
      "An acknowledged discussion message bound to the current proposal version and stable key.",
    flow: discussion,
  },
  quote_project_plan: {
    group: "discussion",
    skills: ["vibescroll-project-review"],
    funding: "quote",
    purpose:
      "Review the cost of explicitly chosen hosted plan generation or refinement.",
    result:
      "A bounded credit quote using retained insights, project context and discussion; no generation or charge.",
    flow: discussion,
  },
  start_project_plan: {
    group: "discussion",
    skills: ["vibescroll-project-review"],
    funding: "credits",
    purpose: "Start the exact credit-funded plan quote the user chose.",
    result:
      "The existing or queued plan operation, readable through the saved discussion.",
    flow: discussion,
  },
  reply_to_project_plan: {
    group: "discussion",
    skills: ["vibescroll-project-review"],
    funding: "credits",
    purpose:
      "Save a requested message and atomically start its approved credit-funded refinement.",
    result:
      "The saved reply and revised-plan operation tied to the exact quote and stable key.",
    flow: discussion,
  },
  prepare_project_issue: {
    group: "handoff",
    skills: ["vibescroll-project-review", "vibescroll-work-review"],
    funding: "no_ai",
    purpose: "Freeze a private issue handoff when the user requests it.",
    result:
      "Reviewed issue text and authenticated completion-report instructions; preparation does not publish.",
    flow: handoff,
  },
  preview_project_issue: {
    group: "handoff",
    skills: ["vibescroll-project-review", "vibescroll-work-review"],
    funding: "no_ai",
    purpose: "Check the exact proposal's GitHub destination before approval.",
    result:
      "Current repository, visibility, proposal version and context hash for explicit issue approval.",
    flow: handoff,
  },
  approve_project_issue: {
    group: "handoff",
    skills: ["vibescroll-project-review", "vibescroll-work-review"],
    funding: "no_ai",
    purpose:
      "Approve and queue one exact issue after the user's explicit approval.",
    result:
      "A frozen publication operation whose confirmed outcome appears in the discussion; coding is not started.",
    flow: handoff,
  },
  retry_project_issue: {
    group: "handoff",
    skills: ["vibescroll-work-review"],
    funding: "no_ai",
    purpose:
      "Resume the same approved issue publication or reconcile an uncertain dispatch.",
    result:
      "The existing operation's state without replacing it or issuing a second publication after dispatch.",
    flow: handoff,
  },
  record_feedback: {
    group: "feedback",
    skills: ["vibescroll-feedback"],
    funding: "no_ai",
    purpose:
      "Record or correct an explicit judgment about current source evidence.",
    result:
      "The saved judgment and correction version, separate from measured benefit or execution approval.",
    flow: handoff,
  },
  report_project_outcome: {
    group: "feedback",
    skills: ["vibescroll-work-review", "vibescroll-feedback"],
    funding: "no_ai",
    purpose:
      "Report completed, blocked or failed work for the exact saved handoff.",
    result:
      "A durable authenticated report with same-repository links and actual commit or null, distinct from verified CI or benefit.",
    flow: handoff,
  },
  work_cloud_claim: {
    group: "worker",
    skills: ["vibescroll-save"],
    funding: "host_worker",
    purpose:
      "Claim one exact approved native analysis request or retained-evidence attempt.",
    result:
      "A once-returned lease token and bound request authority; a lost claim is not retried.",
    flow: skills,
  },
  work_cloud_input: {
    group: "worker",
    skills: ["vibescroll-save"],
    funding: "host_worker",
    purpose:
      "Read the input and restrictions for the exact approved analysis lease.",
    result:
      "Versioned text, media or retained-evidence input, requested settings, policy and deadline.",
    flow: skills,
  },
  work_cloud_heartbeat: {
    group: "worker",
    skills: ["vibescroll-status"],
    funding: "host_worker",
    purpose:
      "Check and renew the exact active analysis lease within its deadline.",
    result:
      "Current lease authority or a denial requiring host execution to stop.",
    flow: skills,
  },
  work_cloud_metadata: {
    group: "worker",
    skills: ["vibescroll-save"],
    funding: "host_worker",
    purpose:
      "Return inspected native post metadata under an active media-v3 lease.",
    result:
      "An acknowledgement for bounded title, author and dates without a completion claim.",
    flow: skills,
  },
  work_cloud_prepare: {
    group: "worker",
    skills: ["vibescroll-save"],
    funding: "host_worker",
    purpose:
      "Bind observed transcript and frame metadata before media analysis completion.",
    result:
      "An accepted immutable preparation binding and hashes, without uploaded frame bytes.",
    flow: skills,
  },
  work_cloud_frame: {
    group: "worker",
    skills: ["vibescroll-save"],
    funding: "host_worker",
    purpose:
      "Upload one actual JPEG matching an accepted preparation or approved exact-pixel repair.",
    result:
      "A receipt for matching stored bytes; visual accuracy remains a separate judgment.",
    flow: skills,
  },
  work_cloud_retained_frame: {
    group: "worker",
    skills: ["vibescroll-save", "vibescroll-compare"],
    funding: "host_worker",
    purpose:
      "Read an actual retained frame for the active retained-evidence attempt.",
    result:
      "A native MCP JPEG attachment and bounded frame metadata for visual inspection.",
    flow: skills,
  },
  work_cloud_complete: {
    group: "worker",
    skills: ["vibescroll-save"],
    funding: "host_worker",
    purpose:
      "Submit bounded analysis JSON for the exact approved lease and evidence binding.",
    result:
      "The completion acknowledgement under its versioned contract; host model claims remain unverified.",
    flow: skills,
  },
  work_cloud_fail: {
    group: "worker",
    skills: ["vibescroll-status"],
    funding: "host_worker",
    purpose: "Relinquish the exact Cloud lease after stopping execution.",
    result:
      "A recorded uncertain outcome without automatic requeue, funding switch or proof of provider cancellation.",
    flow: skills,
  },
  work_cloud_repair_claim: {
    group: "worker",
    skills: ["vibescroll-status"],
    funding: "no_ai",
    purpose:
      "Claim one owner-approved exact-pixel repair for a completed result.",
    result:
      "A separate short repair lease that does not reopen analysis or authorize new preparation.",
    flow: skills,
  },
  work_cloud_repair_input: {
    group: "worker",
    skills: ["vibescroll-status"],
    funding: "no_ai",
    purpose:
      "Read the original preparation and exact-pixel repair restrictions.",
    result:
      "Bounded repair input and original JPEG hashes; changed pixels are not accepted.",
    flow: skills,
  },
  work_cloud_repair_heartbeat: {
    group: "worker",
    skills: ["vibescroll-status"],
    funding: "no_ai",
    purpose:
      "Renew an active exact-pixel repair lease within its fixed approval deadline.",
    result:
      "Current repair authority or denial, without reviving an expired permission.",
    flow: skills,
  },
  work_cloud_repair_complete: {
    group: "worker",
    skills: ["vibescroll-status"],
    funding: "no_ai",
    purpose:
      "Acknowledge attachment of all exact prepared pixels under the repair lease.",
    result:
      "A repair acknowledgement preserving the original analysis, preparation and generation.",
    flow: skills,
  },
  open_vibescroll: {
    group: "embedded",
    skills: ["vibescroll-library", "vibescroll-setup"],
    funding: "no_ai",
    purpose:
      "Open the current authorized workspace in a supported embedded host.",
    result:
      "An embedded workspace view for saved sources, insights, topics or approved projects.",
    flow: find,
  },
  open_vibescroll_export: {
    group: "embedded",
    skills: ["vibescroll-library"],
    funding: "no_ai",
    purpose: "View a deliberately opened VibeScroll export snapshot.",
    result:
      "A read-only snapshot viewer; opening it neither imports records nor grants live access.",
    flow: find,
  },
  render_vibescroll_card: {
    group: "embedded",
    skills: ["vibescroll-save", "vibescroll-status"],
    funding: "no_ai",
    purpose: "Refresh a compact card for an exact authorized source.",
    result:
      "A current cited result or job receipt loaded from permitted records, rather than model-supplied claims.",
    flow: find,
  },
  widget_profiles: {
    group: "embedded",
    skills: ["vibescroll-setup", "vibescroll-library"],
    funding: "no_ai",
    purpose: "Discover knowledge-readable workspaces for the embedded view.",
    result:
      "Current permitted workspace grants without selected project context.",
    flow: skills,
  },
  widget_state: {
    group: "embedded",
    skills: ["vibescroll-library"],
    funding: "no_ai",
    purpose:
      "Read the selected embedded workspace's current access and actions.",
    result: "Authorized workspace state and available actions.",
    flow: skills,
  },
  widget_browse: {
    group: "embedded",
    skills: ["vibescroll-library"],
    funding: "no_ai",
    purpose: "Browse a bounded page of current authorized workspace records.",
    result:
      "Permitted sources, topics, work or private proposal summaries and pagination.",
    flow: skills,
  },
  widget_topic: {
    group: "embedded",
    skills: ["vibescroll-library"],
    funding: "no_ai",
    purpose: "Read the current evidence in one authorized topic.",
    result: "A bounded topic evidence page with current access checks.",
    flow: skills,
  },
  widget_proposal: {
    group: "embedded",
    skills: ["vibescroll-work-review"],
    funding: "no_ai",
    purpose: "Open an exact current private proposal in the embedded view.",
    result: "Permitted proposal content and its protected review destination.",
    flow: skills,
  },
};

export function guideForTool(name: string): ToolGuideEntry | undefined {
  return Object.hasOwn(toolGuide, name) ? toolGuide[name] : undefined;
}
