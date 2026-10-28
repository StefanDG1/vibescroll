// Fresh sign-in is reserved for destructive or externally sensitive changes.
export const highRiskAuthenticationActions = [
  "delete_account",
  "delete_workspace",
  "change_provider_credential",
  "publish_private_edition",
  "publish_public_collection",
  "promote_catalog_recommendation",
] as const;
export type HighRiskAuthenticationAction =
  (typeof highRiskAuthenticationActions)[number];

export function authenticationReviewRequired(value: unknown): boolean {
  if (typeof value === "string")
    return (
      value.startsWith("REAUTH_REQUIRED:") ||
      value.includes("Sign in again before changing a sensitive connection.")
    );
  if (!value || typeof value !== "object") return false;
  const error = value as { code?: unknown; data?: unknown; message?: unknown };
  return (
    error.code === "REAUTH_REQUIRED" ||
    authenticationReviewRequired(error.data) ||
    authenticationReviewRequired(error.message)
  );
}

export function authenticationReturnTo(candidate: string): string {
  return /^(?:\/app|\/account)(?:[/?#]|$)/.test(candidate) &&
    candidate.length <= 4096 &&
    !/[\\\r\n]/.test(candidate)
    ? candidate
    : "/app";
}
export function authenticationSignInPath(
  returnTo: string,
  fresh = true,
): string {
  return `/sign-in?${fresh ? "reauth=true&" : ""}returnTo=${encodeURIComponent(authenticationReturnTo(returnTo))}`;
}
