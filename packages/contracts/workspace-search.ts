import { z } from "zod";

const id = z.string().min(1).max(100);
export const workspaceSearchLimits = {
  candidatesPerPage: 50,
  results: 20,
  responseBytes: 64_000,
  originsPerPost: 20,
  sourceHydrations: 8,
  loadedBytes: 8_000_000,
  insightsPerPost: 128,
} as const;
export const workspaceSearchFilters = z
  .strictObject({
    categoryKeys: z
      .array(z.string().regex(/^[a-z0-9_]{1,48}$/))
      .min(1)
      .max(5)
      .optional(),
    platforms: z
      .array(
        z.enum([
          "instagram",
          "facebook",
          "tiktok",
          "x",
          "youtube",
          "text",
          "other",
        ]),
      )
      .min(1)
      .max(3)
      .optional(),
    addedAfter: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    addedBefore: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    creator: z.string().trim().min(1).max(160).optional(),
  })
  .refine(
    (value) =>
      value.addedAfter === undefined ||
      value.addedBefore === undefined ||
      value.addedAfter <= value.addedBefore,
    { message: "Use an ordered direct-save date range." },
  );
export const workspaceSearchInput = z
  .strictObject({
    query: z.string().trim().max(200),
    profileId: id.optional(),
    review: z.boolean().optional(),
    target: z.enum(["posts", "insights", "both"]).optional(),
    workspaceIds: z.array(id).min(1).max(3).optional(),
    filters: workspaceSearchFilters.optional(),
    projectId: id.optional(),
    cursor: z.string().max(24_576).optional(),
  })
  .refine(
    (value) => !!value.query || (!!value.review && !!value.filters?.creator),
    {
      message: "Enter a query or choose a creator for a complete review.",
    },
  )
  .refine(
    (value) =>
      !value.workspaceIds ||
      (!value.profileId &&
        new Set(value.workspaceIds).size === value.workspaceIds.length),
    { message: "Choose one profile or up to three distinct workspaces." },
  )
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 30_000,
    { message: "Narrow the search to keep its request bounded." },
  );
export const workspaceSearchReference = z.strictObject({
  sourceId: id,
  generation: z.number().int().nonnegative(),
  revision: z.number().nonnegative(),
  analysisVersionId: id.optional(),
  sharedGrantId: id.optional(),
  sharedGrantVersion: z.number().int().positive().optional(),
});
export const workspaceSearchPost = z.strictObject({
  fetch_id: z.string().min(1).max(250),
  id: z.string().max(300),
  title: z.string().max(200),
  url: z.string().url(),
  reference: workspaceSearchReference,
  access_paths: z
    .array(
      z.strictObject({
        profile_id: id,
        grant_version: z.number().int().positive(),
        fetch_id: z.string().max(250),
        url: z.string().url(),
        reference: workspaceSearchReference,
      }),
    )
    .max(3)
    .optional(),
});
export const workspaceSearchProjectFit = z.strictObject({
  rubric: z.literal("topic-coverage-v1"),
  matched: z.number().int().min(0).max(40),
  total: z.number().int().min(0).max(40),
  criteria_omitted: z.number().int().min(0).max(40).optional(),
  criteria: z
    .array(
      z.strictObject({
        category: z.string().max(48),
        matched: z.boolean(),
        terms: z.array(z.string().max(100)).max(10),
      }),
    )
    .max(40),
});
export const workspaceSearchMatch = z.strictObject({
  id: z.string().max(500),
  post_id: z.string().max(300),
  kind: z.enum(["post", "insight"]),
  insight_id: z.string().max(200).optional(),
  evidence_ids: z.array(z.string().max(200)).max(16).optional(),
  title: z.string().max(200),
  excerpt: z.string().max(700),
  project_fit: workspaceSearchProjectFit.optional(),
});
export const workspaceSearchStatus = z.enum([
  "results",
  "no-matches",
  "exact-name-missing",
  "needs-project-record",
  "needs-current-data",
  "index-pending",
]);
export const workspaceSearchFacet = z.strictObject({
  query: z.string().max(200),
  post_id: z.string().max(300).optional(),
  match_id: z.string().max(500).optional(),
});
export const workspaceSearchOutput = z.strictObject({
  mode: z.literal("hybrid"),
  posts: z.array(workspaceSearchPost).max(20),
  matches: z.array(workspaceSearchMatch).max(20),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  exhausted: z.boolean(),
  truncated: z.boolean(),
  coverage: z.string(),
  profile_id: id,
  grant_version: z.number().int().positive(),
  scanned_candidates: z.number().int().nonnegative(),
  loaded_candidates: z.number().int().nonnegative().optional(),
  examined_sources: z.number().int().min(0).max(24),
  loaded_bytes: z.number().int().nonnegative(),
  session_candidates: z.number().int().nonnegative(),
  projection_revision: z.number().int().nonnegative(),
  index_ready: z.boolean(),
  status: workspaceSearchStatus,
  semantic: z.boolean(),
  facets: z.array(workspaceSearchFacet).max(3).optional(),
  workspaces: z
    .array(
      z.strictObject({
        profile_id: id,
        grant_version: z.number().int().positive(),
        projection_revision: z.number().int().nonnegative(),
        index_ready: z.boolean(),
        has_more: z.boolean(),
      }),
    )
    .max(3)
    .optional(),
  project: z
    .strictObject({
      id,
      profile_id: id,
      name: z.string().max(200),
      base_sha: z.string(),
      profile_version: z.number(),
      selection_version: z.number(),
      context_grant_version: z.number(),
    })
    .optional(),
});
export const workspaceSearchMcpOutput = workspaceSearchOutput;
export type WorkspaceSearchResult = z.infer<typeof workspaceSearchOutput>;
