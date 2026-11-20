function errorMessage(error: unknown) {
  return error && typeof error === "object" && "data" in error &&
    typeof error.data === "string"
      ? error.data
      : error instanceof Error ? error.message : "";
}

export function workspaceAccessLost(error: unknown) {
  const message = errorMessage(error);
  return [
    "Sign in to continue.",
    "Account unavailable. Complete account setup first.",
    "Organization unavailable.",
    "Recovery is in progress. Private access is paused.",
    "Your own active Pro subscription is required.",
  ].some((detail) => message.includes(detail));
}

export function sourceUnavailable(error: unknown) {
  return /Source unavailable\.|\bSOURCE_UNAVAILABLE:/.test(errorMessage(error));
}

export function workspaceReadDenied(response: Response) {
  return response.redirected || response.status === 401 || response.status === 403;
}
