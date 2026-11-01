export type ProcessingRecovery = {
  title: string;
  detail: string;
  action: "refresh_quote" | "refresh_status" | "billing" | "review_access";
  confirmedRejection: boolean;
};
const rejectedCodes = new Set([
  "INSUFFICIENT_CREDITS",
  "PERSONAL_FUNDING_REQUIRED",
  "BUDGET_EXCEEDED",
  "PROVIDER_LIMIT",
  "OPERATOR_BUDGET_REACHED",
  "QUOTE_CHANGED",
  "APPROVAL_STALE",
  "STALE_APPROVAL",
  "INVALID_INPUT",
  "SETUP_REQUIRED",
  "FORBIDDEN",
  "POLICY_BLOCKED",
]);
export function confirmedProcessingRejection(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "outcome" in error &&
    error.outcome === "rejected" &&
    "code" in error &&
    typeof error.code === "string" &&
    rejectedCodes.has(error.code)
  );
}
export function processingRecovery(
  error: unknown,
  phase: "quote" | "start",
): ProcessingRecovery {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const confirmedRejection = confirmedProcessingRejection(error);
  if (phase === "start" && !confirmedRejection)
    return {
      title: "Check the existing work",
      detail:
        "The previous request or its usage needs confirmation. Refresh its saved status before starting more work. Existing holds remain until reconciled.",
      action: "refresh_status",
      confirmedRejection: false,
    };
  const base = { confirmedRejection };
  if (code === "INSUFFICIENT_CREDITS" || code === "PERSONAL_FUNDING_REQUIRED")
    return {
      ...base,
      title: "Review your personal credits",
      detail:
        "Your own Pro credit account cannot cover this quote. Review billing and the recorded balance, then request a fresh quote. No other funding route was selected.",
      action: "billing",
    };
  if (
    ["BUDGET_EXCEEDED", "PROVIDER_LIMIT", "OPERATOR_BUDGET_REACHED"].includes(
      String(code),
    )
  )
    return {
      ...base,
      title: "Processing budget unavailable",
      detail:
        "The provider allowance or reviewed processing limit cannot cover this request. Buying more personal credits does not resolve provider capacity. Check the saved status and refresh the quote after capacity is available.",
      action: "refresh_quote",
    };
  if (
    ["AUTH_REQUIRED", "FORBIDDEN", "POLICY_BLOCKED", "SETUP_REQUIRED"].includes(
      String(code),
    )
  )
    return {
      ...base,
      title: "Review this route's access",
      detail:
        "This processing route needs current account, project or worker setup. Review the selected route in Connections; a missing worker does not require a new OAuth connection.",
      action: "review_access",
    };
  return {
    ...base,
    title: phase === "quote" ? "Quote unavailable" : "Review the current quote",
    detail:
      phase === "quote"
        ? "No work starts while getting a quote. Refresh the quote or check the saved post's status."
        : "The request was rejected before admission. Read current context and refresh the quote before choosing to start again.",
    action: "refresh_quote",
  };
}

export function productReadError(body: unknown, status?: number) {
  const code =
    status === 401
      ? "AUTH_REQUIRED"
      : body &&
          typeof body === "object" &&
          "code" in body &&
          typeof body.code === "string"
        ? body.code
        : status === 403
          ? "FORBIDDEN"
          : "UNCLASSIFIED";
  return Object.assign(
    new Error("The current processing read is unavailable."),
    { code, outcome: "rejected" as const },
  );
}

type BillingSnapshot = {
  subscriptionId?: string;
  status: string;
  periodEnd: number;
  checkoutKey?: string;
  checkoutExpires?: number;
};
export function billingRecovery(
  input: {
    billing?: BillingSnapshot | null;
    wallet?: { tier: string; periodEnd: number } | null;
    pools: {
      kind?: string;
      key?: string;
      expiresAt?: number;
      granted: number;
      revoked?: number;
    }[];
    checkoutReturned: boolean;
  },
  now = Date.now(),
) {
  const billing = input.billing;
  if (billing && ["past_due", "unpaid", "paused"].includes(billing.status))
    return {
      state: "payment_due",
      title: "Payment needs attention",
      detail:
        "Use the existing billing portal to resolve payment, then reconcile provider status. Do not open another subscription to replace it.",
    } as const;
  if (billing?.status === "incomplete")
    return {
      state: "awaiting_payment",
      title: "Awaiting payment confirmation",
      detail:
        "The existing subscription is incomplete. Finish its payment or review it in the billing portal, then reconcile. A checkout return alone grants no credits.",
    } as const;
  const included =
    billing?.subscriptionId &&
    billing.periodEnd > now &&
    input.wallet?.tier === "pro" &&
    input.wallet.periodEnd > now &&
    input.wallet.periodEnd <= billing.periodEnd &&
    input.pools.some(
      (pool) =>
        pool.kind === "included" &&
        pool.key?.startsWith(`${billing.subscriptionId}:`) &&
        pool.expiresAt === input.wallet!.periodEnd &&
        pool.granted > (pool.revoked ?? 0),
    );
  if (billing?.status === "active" && !included)
    return {
      state: "awaiting_wallet",
      title: "Waiting for verified credits",
      detail:
        "The provider subscription is active, but its current paid-period allowance is not recorded here. Reconcile provider status before starting paid work or another checkout.",
    } as const;
  if (input.checkoutReturned && !included)
    return {
      state: "checkout_returned",
      title: "Check payment and credit delivery",
      detail:
        "Checkout returned, but this page has not confirmed payment or a current allowance. Reconcile the existing provider record before opening another checkout.",
    } as const;
  if (billing?.checkoutKey && (billing.checkoutExpires ?? 0) > now)
    return {
      state: "checkout_open",
      title: "Existing checkout needs confirmation",
      detail:
        "A checkout request is still open. Finish the existing checkout or reconcile provider status before choosing another purchase.",
    } as const;
  return null;
}
