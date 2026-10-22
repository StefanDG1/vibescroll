import { z } from "zod";
import { containsSecret } from "../policy/secrets.mjs";
import {
  githubBlobUrl,
  githubSourceUrl,
  redditSourceUrl,
  safeSourcePath,
  suppliedSourceUrl,
} from "./urls";
import type { EvidenceRecord, SourceRevision } from "./types";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const base = {
  id: z.string().regex(/^ev_[a-f0-9]{64}$/),
  excerpt: z.string().min(1).max(60000),
  excerptHash: hash,
  canonicalUrl: z.string().max(2048),
  observedAt: z.number().int().nonnegative(),
};
const reddit = {
  ...base,
  postId: z.string().regex(/^[a-z0-9]{3,10}$/),
  itemId: z.string().regex(/^[a-z0-9]{1,10}$/),
  parentId: z
    .string()
    .regex(/^t[13]_[a-z0-9]{1,10}$/)
    .nullable(),
  author: z.string().min(1).max(100),
  role: z.enum(["op", "commenter"]),
  availability: z.enum(["available", "deleted", "removed"]),
  createdAt: z.number().int().nonnegative().nullable(),
  editedAt: z.number().int().nonnegative().nullable(),
};
export const evidenceRecordSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("github_file"),
    repositoryId: z.number().int().positive(),
    repository: z.string().max(140),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/),
    path: z.string().refine(safeSourcePath),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
  z.strictObject({ ...reddit, kind: z.literal("reddit_post") }),
  z.strictObject({ ...reddit, kind: z.literal("reddit_comment") }),
  z.strictObject({
    ...base,
    kind: z.literal("supplied_text"),
    originalUrl: z.string().max(2048).nullable(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    provenance: z.literal("user_supplied_unverified"),
  }),
]);
export const sourceRevisionSchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  sourceType: z.enum(["github_repository", "reddit_thread", "supplied_text"]),
  canonical: z.string().min(1).max(2048),
  providerIdentity: z.string().min(1).max(240),
  contentHash: hash,
  adapterVersion: z.string().min(1).max(100),
  observedAt: z.number().int().nonnegative(),
  rightsBasis: z.string().min(1).max(500),
  retention: z
    .strictObject({
      retainUntil: z.number().int().positive(),
      deletionWithinMs: z.number().int().positive(),
      policyEvidenceId: z.string().min(1).max(200),
    })
    .optional(),
  coverage: z.strictObject({
    method: z.string().min(1).max(200),
    retrieved: z.number().int().nonnegative(),
    omitted: z.number().int().nonnegative(),
    omissions: z.array(z.string().max(200)).max(100),
  }),
});
export async function excerptHash(text: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function identity(record: EvidenceInput | EvidenceRecord) {
  if (record.kind === "github_file")
    return [
      record.kind,
      record.repositoryId,
      record.commitSha,
      record.path,
      record.startLine,
      record.endLine,
    ];
  if (record.kind === "supplied_text")
    return [
      record.kind,
      record.originalUrl,
      record.startOffset,
      record.endOffset,
    ];
  return [
    record.kind,
    record.postId,
    record.itemId,
    record.parentId,
    record.author,
    record.role,
    record.availability,
    record.createdAt,
    record.editedAt,
  ];
}
type EvidenceInput = EvidenceRecord extends infer E
  ? E extends EvidenceRecord
    ? Omit<E, "id" | "excerptHash">
    : never
  : never;
export async function createEvidence(
  record: EvidenceInput,
): Promise<EvidenceRecord> {
  const content = await excerptHash(record.excerpt);
  return evidenceRecordSchema.parse({
    ...record,
    excerptHash: content,
    id: `ev_${await excerptHash(JSON.stringify([...identity(record), content]))}`,
  });
}
export async function registryHash(evidence: readonly EvidenceRecord[]) {
  return excerptHash(
    JSON.stringify(
      evidence
        .map((e) => [e.id, e.excerptHash])
        .sort((a, b) => a[0].localeCompare(b[0])),
    ),
  );
}
export async function validateEvidenceRegistry(
  revisionInput: unknown,
  recordsInput: unknown,
) {
  const revision = sourceRevisionSchema.parse(revisionInput);
  const records = z
    .array(evidenceRecordSchema)
    .min(1)
    .max(51)
    .parse(recordsInput);
  if (
    new Set(records.map((e) => e.id)).size !== records.length ||
    revision.coverage.retrieved !== records.length ||
    records.reduce(
      (sum, record) => sum + record.excerpt.length,
      records.length - 1,
    ) > 60000 ||
    (revision.sourceType === "github_repository" && records.length > 20) ||
    (revision.sourceType === "supplied_text" && records.length !== 1)
  )
    throw Error("INVALID_EVIDENCE_REGISTRY");
  for (const record of records) {
    const rebuilt = await createEvidence(record);
    if (
      record.id !== rebuilt.id ||
      record.excerptHash !== rebuilt.excerptHash ||
      record.observedAt !== revision.observedAt ||
      containsSecret(record.excerpt)
    )
      throw Error("INVALID_EVIDENCE_HASH");
    if (record.kind === "github_file") {
      const source = githubSourceUrl(revision.canonical);
      if (
        revision.sourceType !== "github_repository" ||
        source.repository !== record.repository ||
        revision.providerIdentity !==
          `github:${record.repositoryId}:${record.commitSha}` ||
        record.canonicalUrl !==
          githubBlobUrl(record.repository, record.commitSha, record.path) ||
        record.endLine !==
          record.startLine + record.excerpt.split("\n").length - 1
      )
        throw Error("INVALID_GITHUB_PROVENANCE");
    } else if (record.kind === "supplied_text") {
      if (
        revision.sourceType !== "supplied_text" ||
        suppliedSourceUrl(record.originalUrl) !== record.originalUrl ||
        revision.canonical !== (record.originalUrl ?? "supplied:text") ||
        record.endOffset - record.startOffset !== record.excerpt.length ||
        record.canonicalUrl !== (record.originalUrl ?? "supplied:text")
      )
        throw Error("INVALID_SUPPLIED_PROVENANCE");
    } else {
      const source = redditSourceUrl(revision.canonical);
      const permalink =
        record.kind === "reddit_post"
          ? source.url
          : `${source.url}${record.itemId}/`;
      if (
        revision.sourceType !== "reddit_thread" ||
        revision.providerIdentity !== `reddit:${source.postId}` ||
        record.postId !== source.postId ||
        record.canonicalUrl !== permalink ||
        !revision.retention ||
        revision.retention.retainUntil <= revision.observedAt ||
        revision.rightsBasis !==
          `verified_reddit_contract:${revision.retention.policyEvidenceId}` ||
        (record.createdAt !== null && record.createdAt > record.observedAt) ||
        (record.editedAt !== null &&
          (record.editedAt > record.observedAt ||
            (record.createdAt !== null &&
              record.editedAt < record.createdAt))) ||
        (record.availability === "deleted" && record.excerpt !== "[deleted]") ||
        (record.availability === "removed" && record.excerpt !== "[removed]") ||
        (record.availability === "available" &&
          ["[deleted]", "[removed]"].includes(record.excerpt)) ||
        (record.kind === "reddit_post" &&
          (record.itemId !== record.postId ||
            record.parentId !== null ||
            record.role !== "op" ||
            record.availability !== "available"))
      )
        throw Error("INVALID_REDDIT_PROVENANCE");
    }
  }
  if (revision.contentHash !== (await registryHash(records)))
    throw Error("INVALID_REVISION_HASH");
  const redditPost = records.find((e) => e.kind === "reddit_post");
  const redditComments = records.filter((e) => e.kind === "reddit_comment");
  if (
    revision.sourceType === "reddit_thread" &&
    (records.filter((e) => e.kind === "reddit_post").length !== 1 ||
      redditComments.length > 50 ||
      new Set(redditComments.map((e) => e.itemId)).size !==
        redditComments.length)
  )
    throw Error("INVALID_REDDIT_REGISTRY");
  for (const record of redditComments) {
    if (
      redditPost?.kind !== "reddit_post" ||
      record.role !==
        (record.author === redditPost.author && record.author !== "[deleted]"
          ? "op"
          : "commenter")
    )
      throw Error("INVALID_COMMENT_ATTRIBUTION");
    let parent = record.parentId,
      depth = 1;
    const seen = new Set([record.itemId]);
    while (parent !== `t3_${record.postId}`) {
      const ancestor = redditComments.find((e) => `t1_${e.itemId}` === parent);
      if (!ancestor || seen.has(ancestor.itemId) || ++depth > 3)
        throw Error("MISSING_COMMENT_ANCESTOR");
      seen.add(ancestor.itemId);
      parent = ancestor.parentId;
    }
  }
  return {
    revision: revision as SourceRevision,
    evidence: records as EvidenceRecord[],
  };
}
export function assertEvidenceReferences(
  ids: readonly string[],
  evidence: readonly EvidenceRecord[],
) {
  const allowed = new Set(evidence.map((e) => e.id));
  if (ids.some((id) => !allowed.has(id)))
    throw Error("UNKNOWN_EVIDENCE_REFERENCE");
}
