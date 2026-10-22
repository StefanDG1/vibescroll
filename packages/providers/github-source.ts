import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { containsSecret } from "../policy/secrets.mjs";
import {
  createEvidence,
  registryHash,
  validateEvidenceRegistry,
} from "../sources/evidence";
import {
  acquisitionFailure,
  SourceAdapterError,
  SourceRequestBudget,
  sourceLimits,
} from "../sources/limits";
import {
  githubBlobUrl,
  githubSourceUrl,
  safeSourcePath,
} from "../sources/urls";
import type {
  AcquisitionResult,
  AdapterContext,
  EvidenceRecord,
  SourceRevision,
} from "../sources/types";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const metadata = z.object({
  id: z.number().int().positive(),
  private: z.literal(false),
  full_name: z.string().max(140),
  default_branch: z.string().min(1).max(250),
});
const commit = z.object({ sha, commit: z.object({ tree: z.object({ sha }) }) });
const tree = z.object({
  sha,
  truncated: z.boolean(),
  tree: z
    .array(
      z.object({
        path: z.string().max(1000),
        mode: z.string(),
        type: z.string(),
        sha,
        size: z.number().int().nonnegative().optional(),
      }),
    )
    .max(20000),
});
const blob = z.object({
  sha,
  encoding: z.literal("base64"),
  size: z.number().int().nonnegative().max(sourceLimits.github.fileBytes),
  content: z.string().max(sourceLimits.github.fileBytes * 2),
});
export type GithubSourceSelection = {
  canonical: string;
  repositoryId: number;
  repository: string;
  commit: string;
  files: { path: string; blobSha: string; size: number }[];
  omissions: string[];
};
function regularText(path: string) {
  return (
    safeSourcePath(path) &&
    /(?:^|\/)(?:readme|licen[cs]e|notice|copying)(?:\.[A-Za-z0-9]+)?$|\.(?:md|mdx|txt|rst|json|ya?ml|toml|ini|csv|ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|swift|c|h|cpp|hpp|css|scss|html|vue|svelte|sql|sh|rb|ex|exs|xml)$/i.test(
      path,
    )
  );
}
async function inspect(
  input: { url: string; commit?: string },
  budget: SourceRequestBudget,
): Promise<GithubSourceSelection> {
  const source = githubSourceUrl(input.url);
  if (input.commit !== undefined && !/^[a-f0-9]{40}$/.test(input.commit))
    throw Error("INVALID_COMMIT");
  const api = `https://api.github.com/repos/${source.repository}`;
  const repo = metadata.parse(await budget.json(api, 32768));
  if (repo.full_name.toLowerCase() !== source.repository.toLowerCase())
    throw new SourceAdapterError("unavailable", "repository_identity_changed");
  const pinned = commit.parse(
    await budget.json(
      `${api}/commits/${encodeURIComponent(input.commit ?? repo.default_branch)}`,
      131072,
    ),
  );
  if (input.commit && pinned.sha !== input.commit) throw Error("STALE_COMMIT");
  const listing = tree.parse(
    await budget.json(
      `${api}/git/trees/${pinned.commit.tree.sha}?recursive=1`,
      262144,
    ),
  );
  if (listing.sha !== pinned.commit.tree.sha) throw Error("INVALID_TREE");
  const eligible = listing.tree.filter(
    (entry) =>
      entry.type === "blob" &&
      ["100644", "100755"].includes(entry.mode) &&
      regularText(entry.path) &&
      entry.size !== undefined &&
      entry.size > 0 &&
      entry.size <= sourceLimits.github.fileBytes,
  );
  const paths = new Set(eligible.map((entry) => entry.path));
  if (paths.size !== eligible.length) throw Error("DUPLICATE_TREE_PATH");
  return {
    canonical: `https://github.com/${repo.full_name}`,
    repositoryId: repo.id,
    repository: repo.full_name,
    commit: pinned.sha,
    files: eligible
      .slice(0, sourceLimits.github.listing)
      .map((e) => ({ path: e.path, blobSha: e.sha, size: e.size! })),
    omissions: [
      ...(listing.truncated ? ["repository_tree_truncated"] : []),
      ...(eligible.length > sourceLimits.github.listing
        ? ["file_listing_limit"]
        : []),
    ],
  };
}
export async function inspectGithubSource(
  input: { url: string; commit?: string },
  context: AdapterContext,
): Promise<GithubSourceSelection> {
  return inspect(input, new SourceRequestBudget(context, "github"));
}
export async function acquireGithubSource(
  input: {
    url: string;
    commit: string;
    repositoryId: number;
    selectedPaths: string[];
    rightsBasis: string;
  },
  context: AdapterContext,
): Promise<AcquisitionResult> {
  try {
    if (
      !input.rightsBasis.trim() ||
      input.rightsBasis.length > 500 ||
      containsSecret(input.rightsBasis) ||
      input.selectedPaths.length === 0 ||
      input.selectedPaths.length > sourceLimits.github.files ||
      new Set(input.selectedPaths).size !== input.selectedPaths.length ||
      !input.selectedPaths.every(regularText)
    )
      throw Error("INVALID_FILE_SELECTION");
    const budget = new SourceRequestBudget(context, "github");
    // Re-resolve server-side at the selected commit. Client file metadata is not authority.
    const selection = await inspect(
      { url: input.url, commit: input.commit },
      budget,
    );
    if (selection.repositoryId !== input.repositoryId)
      throw Error("STALE_REPOSITORY");
    const chosen = input.selectedPaths.map((path) => {
      const entry = selection.files.find((f) => f.path === path);
      if (!entry) throw Error("UNSELECTABLE_FILE");
      return entry;
    });
    if (
      chosen.reduce((sum, e) => sum + e.size, 0) >
      sourceLimits.github.totalBytes
    )
      throw Error("FILE_SELECTION_BYTE_LIMIT");
    const evidence: EvidenceRecord[] = [];
    const omissions = [...selection.omissions];
    const observedAt = budget.now();
    let textLength = 0;
    for (const entry of chosen) {
      const data = blob.parse(
        await budget.json(
          `https://api.github.com/repos/${selection.repository}/git/blobs/${entry.blobSha}`,
          sourceLimits.github.fileBytes * 2,
        ),
      );
      const encoded = data.content.replace(/\n/g, "");
      if (
        data.sha !== entry.blobSha ||
        data.size !== entry.size ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          encoded,
        )
      )
        throw Error("INVALID_BLOB");
      const bytes = Buffer.from(encoded, "base64");
      if (
        bytes.byteLength !== data.size ||
        bytes.toString("base64") !== encoded ||
        createHash("sha1")
          .update(`blob ${bytes.byteLength}\0`)
          .update(bytes)
          .digest("hex") !== entry.blobSha
      )
        throw Error("INVALID_BLOB_HASH");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (
        // oxlint-disable-next-line no-control-regex -- A quoted text blob must not contain binary control bytes.
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) ||
        text.startsWith("version https://git-lfs.github.com/spec/v1") ||
        containsSecret(text)
      ) {
        omissions.push("selected_file_failed_content_policy");
        continue;
      }
      if (!text.trim()) {
        omissions.push("empty_selected_file");
        continue;
      }
      // Preserve complete lines and report the remainder. Do not invent line ranges.
      const available =
        sourceLimits.textCharacters - textLength - (evidence.length ? 1 : 0);
      let excerpt = text;
      if (excerpt.length > available) {
        const end = excerpt.lastIndexOf("\n", available - 1);
        excerpt = end >= 0 ? excerpt.slice(0, end) : "";
        omissions.push("extraction_text_limit");
      }
      if (!excerpt.trim()) continue;
      textLength += excerpt.length + (evidence.length ? 1 : 0);
      evidence.push(
        await createEvidence({
          kind: "github_file",
          repositoryId: selection.repositoryId,
          repository: selection.repository,
          commitSha: selection.commit,
          path: entry.path,
          startLine: 1,
          endLine: excerpt.split("\n").length,
          excerpt,
          canonicalUrl: githubBlobUrl(
            selection.repository,
            selection.commit,
            entry.path,
          ),
          observedAt,
        }),
      );
    }
    if (!evidence.length)
      return { status: "unavailable", reason: "no_permitted_selected_text" };
    const revision: SourceRevision = {
      schemaVersion: "1.0.0",
      sourceType: "github_repository",
      canonical: selection.canonical,
      providerIdentity: `github:${selection.repositoryId}:${selection.commit}`,
      contentHash: await registryHash(evidence),
      adapterVersion: "github-source-v1",
      observedAt,
      rightsBasis: input.rightsBasis,
      coverage: {
        method: "explicit_selected_files_at_commit",
        retrieved: evidence.length,
        omitted: chosen.length - evidence.length,
        omissions: [...new Set(omissions)],
      },
    };
    await validateEvidenceRegistry(revision, evidence);
    return {
      status: omissions.length ? "partial" : "ready",
      revision,
      evidence,
      text: evidence.map((e) => e.excerpt).join("\n"),
    };
  } catch (error) {
    return acquisitionFailure(error);
  }
}
