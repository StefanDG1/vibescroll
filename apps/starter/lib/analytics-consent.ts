export const analyticsConsentRevision = 2;

export function cookieAllowsAnalytics(cookies: string): boolean {
  try {
    const value = cookies
      .split("; ")
      .find((cookie) => cookie.startsWith("vs_consent="))
      ?.slice("vs_consent=".length);
    if (!value || value.length > 4096) return false;
    const consent = JSON.parse(decodeURIComponent(value));
    return (
      consent.revision === analyticsConsentRevision &&
      Array.isArray(consent.categories) &&
      consent.categories.includes("analytics")
    );
  } catch {
    return false;
  }
}
