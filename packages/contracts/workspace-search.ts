import { z } from "zod";
import { knowledgeSearchOutput } from "./knowledge-read";

const id = z.string().min(1).max(100);
export const workspaceSearchLimits = {
  candidatesPerPage: 50,
  candidatesPerSession: 200,
  results: 20,
  responseBytes: 64_000,
  originsPerPost: 20,
  sourceHydrations: 8,
  loadedBytes: 8_000_000,
  insightsPerPost: 128,
} as const;
export const workspaceSearchInput = z.strictObject({
  query: z.string().trim().min(1).max(200),
  profileId: id.optional(),
  mode: z.literal("ranked_v1"),
  target: z.enum(["posts", "insights", "both"]).optional(),
  cursor: z.string().max(4096).optional(),
});
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
});
export const workspaceSearchMatch = z.strictObject({
  id: z.string().max(500),
  post_id: z.string().max(300),
  kind: z.enum(["post", "insight"]),
  insight_id: z.string().max(200).optional(),
  title: z.string().max(200),
  excerpt: z.string().max(700),
});
export const workspaceSearchOutput = z.strictObject({
  mode: z.literal("ranked_v1"),
  posts: z.array(workspaceSearchPost).max(20),
  matches: z.array(workspaceSearchMatch).max(20),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  exhausted: z.boolean(),
  truncated: z.boolean(),
  coverage: z.string(),
  profile_id: id,
  grant_version: z.number().int().positive(),
  scanned_candidates: z.number().int().min(0).max(50),
  examined_sources: z.number().int().min(0).max(8),
  loaded_bytes: z.number().int().nonnegative(),
  session_candidates: z.number().int().min(0).max(200),
  projection_revision: z.number().int().nonnegative(),
  index_ready: z.boolean(),
});
// SDK output schemas need an object root; retain both exact response formats.
export const workspaceSearchMcpOutput = z
  .strictObject({
    ...knowledgeSearchOutput.partial().shape,
    ...workspaceSearchOutput.partial().shape,
    profile_id: id,
    grant_version: z.number().int().positive(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
    exhausted: z.boolean(),
    truncated: z.boolean(),
    coverage: z.string(),
  })
  .refine(
    (value) =>
      value.mode === "ranked_v1"
        ? workspaceSearchOutput.safeParse(value).success
        : knowledgeSearchOutput.safeParse(value).success,
    { message: "Use one complete legacy or ranked_v1 search response." },
  );
export const workspaceSearchCursor = z.strictObject({
  version: z.literal(1),
  profileId: id,
  grantId: id,
  grantVersion: z.number().int().positive(),
  projectionRevision: z.number().int().nonnegative(),
  query: z.string().max(200),
  target: z.enum(["posts", "insights", "both"]),
  page: z.string().nullable(),
  offset: z.number().int().min(0).max(50),
  visited: z.number().int().min(0).max(200),
  incomplete: z.boolean(),
});
export type WorkspaceSearchResult = z.infer<typeof workspaceSearchOutput>;
