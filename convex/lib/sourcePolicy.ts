import {
  redditEligibilityCurrent,
  type SourceRevision,
} from "../../packages/sources/types";
function directSourcesEnabled() {
  return (
    process.env.DIRECT_SOURCES_ENABLED === "true" &&
    process.env.RESTORE_LOCK !== "true" &&
    process.env.DISABLE_CAPTURE !== "true"
  );
}
export function redditSourceEligibility(now = Date.now()) {
  if (!directSourcesEnabled() || process.env.REDDIT_SOURCES_ENABLED !== "true")
    return null;
  try {
    const eligibility: unknown = JSON.parse(
      process.env.REDDIT_SOURCE_ELIGIBILITY_JSON ?? "null",
    );
    if (
      !process.env.REDDIT_SOURCE_OAUTH_TOKEN ||
      !redditEligibilityCurrent(eligibility, now)
    )
      return null;
    return eligibility;
  } catch {
    return null;
  }
}
export function directSourceEnabled(
  provider: "github" | "reddit",
  now = Date.now(),
) {
  if (!directSourcesEnabled()) return false;
  if (provider === "github")
    return process.env.GITHUB_SOURCES_ENABLED === "true";
  return provider === "reddit" && !!redditSourceEligibility(now);
}
export function sourcePolicyCurrent(
  revision: SourceRevision,
  now = Date.now(),
) {
  if (revision.retention && revision.retention.retainUntil <= now) return false;
  if (revision.sourceType === "supplied_text") return true;
  if (revision.sourceType === "github_repository")
    return directSourceEnabled("github", now);
  const eligibility = redditSourceEligibility(now);
  return (
    !!eligibility &&
    revision.sourceType === "reddit_thread" &&
    !!revision.retention &&
    revision.retention.policyEvidenceId === eligibility.evidenceId &&
    revision.retention.retainUntil <=
      Math.min(
        eligibility.expiresAt,
        revision.observedAt + eligibility.retention.maxAgeMs,
      )
  );
}
