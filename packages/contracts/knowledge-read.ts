import { z } from "zod";
import type { socialCitation } from "../social/analysis";
import type { typedCitationSummary } from "../sources/citations";
import type { SourceRevision } from "../sources/types";

export const profileReadDetail = z.enum(["summary", "full"]);
export const knowledgeFetchFormat = z.enum(["legacy", "structured_v1"]);

const id = z.string().min(1).max(100);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const nonnegative = z.number().nonnegative();
// The old library cursor shape remains valid. New cursors can resume matching
// items within the same bounded candidate page without discarding overflow.
export const knowledgeSearchCursor = z.strictObject({
  grant: id,
  version: z.number().int().positive(),
  scope: z.enum(["all", "personal", "business", "selected_sources"]),
  query: z.string().max(200),
  cursor: z.string().nullable(),
  offset: z.number().int().min(0).max(49).optional(),
  resultOffset: z.number().int().min(0).max(640).optional(),
  snapshotHash: hash.optional(),
  scanLimited: z.boolean().optional(),
});
const typedCitationFields = {
  id,
  startMs: z.null(),
  endMs: z.null(),
  canonicalUrl: z.string().url(),
  observedAt: nonnegative,
  excerptHash: hash,
};
const mediaCitationFields = {
  id,
  assetId: id,
  assetIndex: z.number().int().min(0).max(34),
  postRevisionHash: hash,
  textHash: hash,
  uncertainty: z.string().max(500),
};

// Exact current projections from typedCitationSummary/socialCitation and the
// legacy timestamp-only branch. None permits excerpts or asset capabilities.
export const knowledgeReadCitationOutput = z.union([
  z.strictObject({
    kind: z.string().max(64),
    startMs: z.number().optional(),
    endMs: z.number().optional(),
  }),
  z.strictObject({
    ...typedCitationFields,
    kind: z.literal("github_file"),
    repositoryId: z.number().int().positive(),
    repository: z.string(),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/),
    path: z.string(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
  z.strictObject({
    ...typedCitationFields,
    kind: z.literal("supplied_text"),
    originalUrl: z.string().url().nullable(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    provenance: z.literal("user_supplied_unverified"),
  }),
  z.strictObject({
    ...typedCitationFields,
    kind: z.enum(["reddit_post", "reddit_comment"]),
    postId: z.string(),
    itemId: z.string(),
    parentId: z.string().nullable(),
    author: z.string(),
    role: z.enum(["op", "commenter"]),
    availability: z.enum(["available", "deleted", "removed"]),
    createdAt: nonnegative.nullable(),
    editedAt: nonnegative.nullable(),
  }),
  z.strictObject({
    ...mediaCitationFields,
    kind: z.literal("image_observation"),
    startMs: z.null(),
    endMs: z.null(),
    basis: z.enum(["visible", "ocr"]),
    crop: z
      .strictObject({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      })
      .optional(),
  }),
  z.strictObject({
    ...mediaCitationFields,
    kind: z.literal("video_observation"),
    startMs: nonnegative,
    endMs: nonnegative,
    basis: z.enum(["transcript", "visible", "ocr"]),
  }),
]);
export const knowledgeReadReferenceOutput = z.strictObject({
  sourceId: id,
  generation: nonnegative,
  revision: nonnegative,
  analysisVersionId: id.optional(),
  insightId: z.string().optional(),
});
export const knowledgeReadAnalysisOutput = z.strictObject({
  state: z.string(),
  coverage: z.string(),
  insights: z
    .array(
      z.strictObject({
        id: z.string().max(200),
        title: z.string().max(200),
        claim: z.string().max(2000),
        reference: knowledgeReadReferenceOutput,
        evidence: z.array(knowledgeReadCitationOutput).max(10),
      }),
    )
    .max(20),
  sourceRevisionId: id.nullable().optional(),
  sourceContentHash: hash.optional(),
  sourceCoverage: z
    .strictObject({
      method: z.string(),
      retrieved: nonnegative,
      omitted: nonnegative,
      omissions: z.array(z.string()),
    })
    .optional(),
});
const fetchFields = {
  id: z.string().max(300),
  title: z.string(),
  text: z.string(),
  url: z.string().url(),
  profile_id: id,
  grant_version: z.number().int().positive(),
  more_ideas: z.boolean(),
  scope_notice: z.string(),
};
export const knowledgeFetchLegacyOutput = z.strictObject(fetchFields);
export const knowledgeFetchStructuredOutput = z.strictObject({
  ...fetchFields,
  format: z.literal("structured_v1"),
  analysis: knowledgeReadAnalysisOutput,
});
export const knowledgeFetchOutput = z.union([
  knowledgeFetchLegacyOutput,
  knowledgeFetchStructuredOutput,
]);

// MCP output schemas require an object root. Keep both existing response
// shapes, while rejecting a format marker without its matching analysis.
export const knowledgeFetchMcpOutput = z
  .strictObject({
    ...fetchFields,
    format: z.literal("structured_v1").optional(),
    analysis: knowledgeReadAnalysisOutput.optional(),
  })
  .refine((value) => knowledgeFetchOutput.safeParse(value).success, {
    message: "Use the complete legacy or structured_v1 response shape.",
  });

// These are the existing public citation projections, never evidence bodies.
export type KnowledgeReadCitation =
  | ReturnType<typeof socialCitation>
  | ReturnType<typeof typedCitationSummary>
  | { kind: string; startMs?: number; endMs?: number };

export type KnowledgeReadAnalysis = {
  state: string;
  coverage: string;
  insights: {
    id: string;
    title: string;
    claim: string;
    reference: {
      sourceId: string;
      generation: number;
      revision: number;
      analysisVersionId?: string;
      insightId?: string;
    };
    evidence: KnowledgeReadCitation[];
  }[];
  sourceRevisionId?: string | null;
  sourceContentHash?: string;
  sourceCoverage?: SourceRevision["coverage"];
};

export const knowledgeSearchCoverage = z.strictObject({
  // Current authorized posts whose title/insights were inspected on this page.
  scanned_posts: z.number().int().min(0).max(5),
  matched_items: z.number().int().min(0).max(20),
  // next_cursor resumes remaining matches or advances to a later candidate page.
  has_more: z.boolean(),
  // No remaining cursor and no per-post scan limit anywhere in this cursor chain.
  // This is not a semantic no-fit claim or a snapshot of future library changes.
  exhausted: z.boolean(),
  // The result cap left matches for next_cursor, or a per-post scan bound applied.
  truncated: z.boolean(),
  match_limit_reached: z.boolean(),
});
export type KnowledgeSearchCoverage = z.infer<typeof knowledgeSearchCoverage>;

export const knowledgeSearchOutput = knowledgeSearchCoverage.extend({
  results: z
    .array(
      z.union([
        z.strictObject({
          id: z.string(),
          title: z.string().max(200),
          url: z.string().url(),
          excerpt: z.string().max(600),
          reference: knowledgeReadReferenceOutput,
        }),
        z.strictObject({
          id,
          title: z.string(),
          url: z.string().url(),
          state: z.string(),
        }),
      ]),
    )
    .max(20),
  next_offset: z.number().int().nonnegative().nullable(),
  next_cursor: z.string().nullable(),
  profile_id: id,
  grant_version: z.number().int().positive(),
  coverage: z.string(),
});

export const profileReadOutput = z.strictObject({
  profiles: z
    .array(
      z.strictObject({
        profile_id: id,
        name: z.string().max(200),
        grant_version: z.number().int().positive(),
        expires_at: z.number().nullable(),
        automatic_analysis: z.boolean(),
        cloud_request_policy: z.literal("explicit_per_source_v1").nullable(),
        intake_setup_required: z.boolean(),
        default_output: z.literal("extraction_and_organization"),
        selected_project_count: z.number().int().min(0).max(5),
        project_scope: z.enum(["selected", "all_confirmed"]),
        projects: z
          .array(
            z.union([
              z.strictObject({
                project_id: id,
                context_changed: z.literal(true),
              }),
              z.strictObject({
                project_id: id,
                name: z.string().max(200),
                base_sha: z.string(),
                profile_version: z.number(),
                selection_version: z.number(),
                context: z.string().optional(),
                evaluations: z
                  .array(
                    z.strictObject({
                      evaluation_id: id,
                      evaluation_hash: hash,
                      title: z.string(),
                      disposition: z.string(),
                    }),
                  )
                  .max(5)
                  .optional(),
                context_changed: z.literal(false),
              }),
            ]),
          )
          .max(5),
        context: z
          .strictObject({
            goal: z.string().max(500),
            interests: z.array(z.string().max(80)).max(20),
            role: z.string().max(160),
          })
          .optional(),
        context_changed: z.boolean(),
      }),
    )
    .max(10),
  next_cursor: z.string().nullable(),
  coverage: z.string(),
});
