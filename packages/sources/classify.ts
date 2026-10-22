import { safeSourceUrl } from "../policy";
import { githubSourceUrl, redditSourceUrl } from "./urls";
export function classifySourceUrl(value: string) {
  try {
    return { sourceType: "media" as const, canonical: safeSourceUrl(value) };
  } catch {
    /* Try other exact allowlisted source classes. */
  }
  try {
    return {
      sourceType: "github_repository" as const,
      canonical: githubSourceUrl(value).url,
    };
  } catch {
    /* Require a canonical Reddit discussion. */
  }
  return {
    sourceType: "reddit_thread" as const,
    canonical: redditSourceUrl(value).url,
  };
}
