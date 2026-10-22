import {
  redditEligibilityCurrent,
  type SourceRevision,
} from "../../packages/sources/types";
export function directSourceEligibility() {
  try {
    const eligibility: unknown = JSON.parse(
      process.env.REDDIT_SOURCE_ELIGIBILITY_JSON ?? "null",
    );
    if (
      process.env.DIRECT_SOURCES_ENABLED !== "true" ||
      process.env.RESTORE_LOCK === "true" ||
      process.env.DISABLE_CAPTURE === "true" ||
      !process.env.REDDIT_SOURCE_OAUTH_TOKEN ||
      !redditEligibilityCurrent(eligibility, Date.now())
    )
      return null;
    return eligibility;
  } catch {
    return null;
  }
}
export function sourcePolicyCurrent(
  revision: SourceRevision,
  now = Date.now(),
) {
  if (revision.retention && revision.retention.retainUntil <= now) return false;
  if (revision.sourceType === "supplied_text") return true;
  const eligibility = directSourceEligibility();
  return (
    !!eligibility &&
    (revision.sourceType !== "reddit_thread" ||
      (!!revision.retention &&
        revision.retention.policyEvidenceId === eligibility.evidenceId &&
        revision.retention.retainUntil <=
          Math.min(
            eligibility.expiresAt,
            revision.observedAt + eligibility.retention.maxAgeMs,
          )))
  );
}
