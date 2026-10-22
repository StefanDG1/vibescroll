import { z } from "zod";

export type SourceType =
  "media" | "github_repository" | "reddit_thread" | "supplied_text";

export type SourceRequest = {
  provider: "github" | "reddit";
  url: string;
  signal: AbortSignal;
};
// Production transports bind DNS to the connection and never follow redirects.
// A Reddit transport supplies its own narrowly scoped OAuth authorization.
export type SourceTransport = (request: SourceRequest) => Promise<{
  status: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
}>;
export type AdapterContext = {
  transport: SourceTransport;
  now?: () => number;
  claimProviderRequest?: (
    provider: SourceRequest["provider"],
    now: number,
  ) => Promise<{ allowed: boolean; retryAt?: number }>;
  observeProviderResponse?: (
    provider: SourceRequest["provider"],
    headers: Record<string, string | undefined>,
    now: number,
  ) => Promise<void>;
  recordResponseBytes?: (
    provider: SourceRequest["provider"],
    bytes: number,
  ) => Promise<void>;
};

type EvidenceBase = {
  id: string;
  excerpt: string;
  excerptHash: string;
  canonicalUrl: string;
  observedAt: number;
};
export type GithubEvidence = EvidenceBase & {
  kind: "github_file";
  repositoryId: number;
  repository: string;
  commitSha: string;
  path: string;
  startLine: number;
  endLine: number;
};
export type RedditEvidence = EvidenceBase & {
  kind: "reddit_post" | "reddit_comment";
  postId: string;
  itemId: string;
  parentId: string | null;
  author: string;
  role: "op" | "commenter";
  availability: "available" | "deleted" | "removed";
  createdAt: number | null;
  editedAt: number | null;
};
export type SuppliedEvidence = EvidenceBase & {
  kind: "supplied_text";
  originalUrl: string | null;
  startOffset: number;
  endOffset: number;
  provenance: "user_supplied_unverified";
};
export type EvidenceRecord = GithubEvidence | RedditEvidence | SuppliedEvidence;
export type SourceRevision = Readonly<{
  schemaVersion: "1.0.0";
  sourceType: Exclude<SourceType, "media">;
  canonical: string;
  providerIdentity: string;
  contentHash: string;
  adapterVersion: string;
  observedAt: number;
  rightsBasis: string;
  retention?: {
    retainUntil: number;
    deletionWithinMs: number;
    policyEvidenceId: string;
  };
  coverage: {
    method: string;
    retrieved: number;
    omitted: number;
    omissions: string[];
  };
}>;
export type AcquisitionResult =
  | {
      status: "ready" | "partial";
      revision: SourceRevision;
      evidence: EvidenceRecord[];
      text: string;
    }
  | {
      status: "needs_supplied_text" | "unavailable" | "rate_limited";
      reason: string;
      retryAt?: number;
    };

export type RedditEligibility = {
  status: "verified";
  evidenceId: string;
  expiresAt: number;
  authentication: "oauth";
  workloads: ("selected_thread_read" | "private_summary" | "citation_export")[];
  retention: { maxAgeMs: number; deletionWithinMs: number };
};
export const redditEligibilitySchema = z.strictObject({
  status: z.literal("verified"),
  evidenceId: z.string().min(1).max(200),
  expiresAt: z.number().int().positive(),
  authentication: z.literal("oauth"),
  workloads: z
    .array(
      z.enum(["selected_thread_read", "private_summary", "citation_export"]),
    )
    .min(3)
    .max(3),
  retention: z.strictObject({
    maxAgeMs: z.number().int().positive().max(31536000000),
    deletionWithinMs: z.number().int().positive().max(31536000000),
  }),
});
export function redditEligibilityCurrent(
  input: unknown,
  now: number,
): input is RedditEligibility {
  const result = redditEligibilitySchema.safeParse(input);
  return (
    result.success &&
    result.data.expiresAt > now &&
    new Set(result.data.workloads).size === 3
  );
}
