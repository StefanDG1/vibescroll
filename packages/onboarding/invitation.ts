// A return destination never grants membership; acceptance still verifies email,
// expiry, current workspace policy and the user's own Pro on the server.
export const onboardingInviteCookie = "vibe-onboarding-invite";
export function invitationPath(token: unknown): string | null {
  return typeof token === "string" &&
    token.length === 64 &&
    /^[a-f0-9]{64}$/.test(token)
    ? `/join/${token}`
    : null;
}
