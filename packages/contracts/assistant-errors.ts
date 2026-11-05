import { chatProposalFailure } from "./chat-proposals";

const failures = {
  AUTH_REQUIRED: [
    "authentication",
    "after_user_action",
    "Sign in again through the existing official connection.",
  ],
  FORBIDDEN: [
    "authorization",
    "after_user_action",
    "The current connection does not permit this action. Review its current workspace access.",
  ],
  PROFILE_SELECTION_REQUIRED: [
    "setup",
    "after_user_action",
    "Choose a current VibeScroll workspace with get_profile and repeat this action with its profileId. Keep the existing connection; no new sign-in or Cloud setup is needed.",
  ],
  INVALID_INPUT: [
    "validation",
    "after_user_action",
    "Check the bounded inputs for this action.",
  ],
  UNSUPPORTED_SOURCE: [
    "validation",
    "after_user_action",
    "Save a supported YouTube, Instagram, TikTok or Vimeo link, an exact GitHub repository URL, or a Reddit discussion URL. Other sources need an upload or supplied text in VibeScroll.",
  ],
  POLICY_BLOCKED: [
    "authorization",
    "after_user_action",
    "Current policy does not permit this action. Review the requested action in VibeScroll.",
  ],
  SETUP_REQUIRED: [
    "setup",
    "after_user_action",
    "This route needs current setup. Review the selected route in VibeScroll; keep your existing connection.",
  ],
  PERSONAL_FUNDING_REQUIRED: [
    "funding",
    "after_user_action",
    "Use your own verified Pro credit account for this work.",
  ],
  INSUFFICIENT_CREDITS: [
    "funding",
    "after_user_action",
    "The available personal credits cannot cover this work. Review your credit balance.",
  ],
  BUDGET_EXCEEDED: [
    "funding",
    "after_user_action",
    "The current processing allowance cannot cover this work. Review capacity before starting work.",
  ],
  APPROVAL_STALE: [
    "state",
    "after_user_action",
    "Read the current saved version and reconcile changes before repeating this action.",
  ],
  STALE_APPROVAL: [
    "state",
    "after_user_action",
    "Access or saved evidence changed. Read the current state before repeating this action.",
  ],
  BASE_CHANGED: [
    "state",
    "after_user_action",
    "The repository base changed. Refresh the selected project before reviewing publication again.",
  ],
  IDEMPOTENCY_CONFLICT: [
    "state",
    "after_user_action",
    "This operation key identifies different content. Read the saved operation before making an intentional change.",
  ],
  QUOTE_CHANGED: [
    "funding",
    "after_user_action",
    "Read the current state and request a new quote before starting paid work.",
  ],
  SOURCE_UNAVAILABLE: [
    "authorization",
    "after_user_action",
    "The requested source is unavailable under current access or retention. Choose currently accessible saved evidence.",
  ],
  QUOTA_EXCEEDED: [
    "funding",
    "after_user_action",
    "The current processing policy limit was reached. Review capacity before starting work.",
  ],
  SOURCE_BUSY: [
    "state",
    "reconcile_first",
    "Existing work is active or uncertain. Read its status; do not start replacement work.",
  ],
  COST_RECONCILIATION_REQUIRED: [
    "funding",
    "reconcile_first",
    "Existing usage is uncertain. Reconcile the original operation before starting replacement work.",
  ],
  LIMIT_REACHED: [
    "state",
    "after_user_action",
    "The current operation limit was reached. Open the existing saved work or retry later.",
  ],
  ISSUES_PERMISSION_REQUIRED: [
    "setup",
    "after_user_action",
    "Review Issues permission for the selected project. Preserve the existing publication operation.",
  ],
  GITHUB_UNAVAILABLE: [
    "provider",
    "retry_existing",
    "GitHub is unavailable for this action. Preserve and reconcile the existing publication operation before retrying it.",
  ],
  UNAVAILABLE: [
    "transport",
    "reconcile_first",
    "This action is temporarily unavailable. Read the existing state before retrying; preserve uncertain work.",
  ],
} as const;
export type AssistantErrorCode = keyof typeof failures;
type FailureDefinition = (typeof failures)[AssistantErrorCode];
export type SafeAssistantFailure = {
  code: AssistantErrorCode;
  error: string;
  stage: FailureDefinition[0];
  retryability: FailureDefinition[1];
  correlation_id: string;
  app_review_url: "https://scroll.companynerve.com/app";
  next_action:
    | { tool: "get_profile"; args: Record<string, never> }
    | {
        action:
          | "review_connection"
          | "review_access"
          | "check_inputs"
          | "review_setup"
          | "review_funding"
          | "read_current"
          | "reconcile_existing"
          | "retry_existing";
      };
};

export function assistantErrorCode(
  value: unknown,
): AssistantErrorCode | undefined {
  return typeof value === "string" && Object.hasOwn(failures, value)
    ? (value as AssistantErrorCode)
    : undefined;
}

// Extract only an allowlisted code. Exception messages never cross this boundary.
export function assistantExceptionCode(
  error: unknown,
): AssistantErrorCode | undefined {
  if (!(error instanceof Error)) return undefined;
  const match = error.message.match(/\b([A-Z][A-Z_]{1,63}):/);
  return assistantErrorCode(match?.[1]);
}

export function safeAssistantFailure(
  code: unknown,
  options: { status?: number; proposal?: boolean; correlationId?: string } = {},
): SafeAssistantFailure {
  const selected =
    options.status === 401
      ? "AUTH_REQUIRED"
      : assistantErrorCode(code) === "AUTH_REQUIRED"
        ? "UNAVAILABLE"
        : (assistantErrorCode(code) ??
          (options.status === 403 ? "FORBIDDEN" : "UNAVAILABLE"));
  const [stage, retryability, error] = failures[selected];
  // Correlation IDs are generated locally, never copied from arguments/exception text.
  const correlation_id = options.correlationId ?? crypto.randomUUID();
  return {
    code: selected,
    error:
      options.proposal && selected !== "AUTH_REQUIRED"
        ? (chatProposalFailure(selected)?.error ?? error)
        : error,
    stage,
    retryability,
    correlation_id,
    app_review_url: "https://scroll.companynerve.com/app",
    next_action:
      selected === "PROFILE_SELECTION_REQUIRED"
        ? { tool: "get_profile", args: {} }
        : {
            action:
              stage === "authentication"
                ? "review_connection"
                : retryability === "reconcile_first"
                  ? "reconcile_existing"
                  : retryability === "retry_existing"
                    ? "retry_existing"
                    : stage === "authorization"
                      ? "review_access"
                      : stage === "validation"
                        ? "check_inputs"
                        : stage === "setup"
                          ? "review_setup"
                          : stage === "funding"
                            ? "review_funding"
                            : "read_current",
          },
  };
}

export function assistantFailureStatus(code: AssistantErrorCode): number {
  if (code === "AUTH_REQUIRED") return 401;
  if (code === "FORBIDDEN" || code === "POLICY_BLOCKED") return 403;
  if (
    [
      "APPROVAL_STALE",
      "STALE_APPROVAL",
      "IDEMPOTENCY_CONFLICT",
      "PROFILE_SELECTION_REQUIRED",
      "BASE_CHANGED",
    ].includes(code)
  )
    return 409;
  return code === "UNAVAILABLE" ? 503 : 400;
}
