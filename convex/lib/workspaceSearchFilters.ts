import { categoryKey } from "../../packages/categories";
import type { WorkspaceSearchResult } from "../../packages/contracts/workspace-search";
import { workspaceSearchFilters } from "../../packages/contracts/workspace-search";
import { projectTopicFit } from "../../packages/contracts/project-fit";
import type { z } from "zod";
export type SearchFilters = z.infer<typeof workspaceSearchFilters>;
export type SearchProject = {
  id: string;
  profileId: string;
  name: string;
  profile: string;
  baseSha: string;
  profileVersion: number;
  selectionVersion: number;
  grantVersion: number;
};
export function sourcePlatform(url: string, kind?: string) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return kind === "text" ? "text" : "other";
  }
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/.test(host)) return "facebook";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)(x\.com|twitter\.com|t\.co)$/.test(host)) return "x";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  return "other";
}
export function insightSearchTopics(value: unknown, includeTopics = true) {
  if (!value || typeof value !== "object") return [];
  const record = value as { categories?: unknown; topics?: unknown };
  const values = [
    ...(Array.isArray(record.categories) ? record.categories.slice(0, 5) : []),
    ...(includeTopics && Array.isArray(record.topics)
      ? record.topics.slice(0, 4)
      : []),
  ];
  const keys: string[] = [];
  for (const value of values)
    if (typeof value === "string" && value.length <= 48) {
      try {
        keys.push(categoryKey(value));
      } catch {
        /* invalid legacy label omitted */
      }
    }
  return [...new Set(keys)].slice(0, 40);
}
export function outputSearchTopics(output: unknown, includeTopics = true) {
  if (
    !output ||
    typeof output !== "object" ||
    !("insights" in output) ||
    !Array.isArray(output.insights)
  )
    return [];
  return [
    ...new Set(
      output.insights
        .slice(0, 128)
        .flatMap((value) => insightSearchTopics(value, includeTopics)),
    ),
  ].slice(0, 40);
}
export function normalizeSearchFilters(value: SearchFilters | undefined) {
  if (!value) return undefined;
  return workspaceSearchFilters.parse({
    ...value,
    ...(value.categoryKeys
      ? { categoryKeys: [...new Set(value.categoryKeys)].sort() }
      : {}),
    ...(value.platforms
      ? { platforms: [...new Set(value.platforms)].sort() }
      : {}),
  });
}
export function metadataMatchesFilters(
  metadata: { platform?: string; categoryKeys?: string[] },
  filters?: SearchFilters,
) {
  return (
    (!filters?.platforms ||
      !metadata.platform ||
      filters.platforms.some((value) => value === metadata.platform)) &&
    (!filters?.categoryKeys ||
      metadata.categoryKeys === undefined ||
      filters.categoryKeys.some((value) =>
        metadata.categoryKeys!.includes(value),
      ))
  );
}
export function fitMatch(
  project: SearchProject | undefined,
  topics: string[],
): WorkspaceSearchResult["matches"][number]["project_fit"] {
  if (!project) return undefined;
  const fit = projectTopicFit(topics, project.profile);
  const criteria = fit.criteria.slice(0, 8);
  const result = {
    ...fit,
    criteria,
    criteria_omitted: fit.criteria.length - criteria.length,
  };
  while (
    criteria.length > 1 &&
    new TextEncoder().encode(JSON.stringify(result)).length > 1800
  ) {
    criteria.pop();
    result.criteria_omitted++;
  }
  return result;
}
