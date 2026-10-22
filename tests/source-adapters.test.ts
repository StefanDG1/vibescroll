import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { expect, it, vi } from "vitest";
import {
  acquireGithubSource,
  inspectGithubSource,
} from "../packages/providers/github-source";
import { acquireRedditSource } from "../packages/providers/reddit-source";
import {
  createEvidence,
  registryHash,
  validateEvidenceRegistry,
  assertEvidenceReferences,
} from "../packages/sources/evidence";
import {
  SourceRequestBudget,
  reserveProviderRequest,
  providerRetryAt,
} from "../packages/sources/limits";
import {
  githubSourceUrl,
  redditSourceUrl,
  safeSourcePath,
} from "../packages/sources/urls";
import type {
  AdapterContext,
  RedditEligibility,
  SourceTransport,
} from "../packages/sources/types";

const now = 1800000000000,
  commit = "a".repeat(40),
  tree = "b".repeat(40);
function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return {
    status,
    headers: { "content-type": "application/json", ...headers },
    body: (async function* () {
      yield bytes;
    })(),
  };
}
function githubFixture(
  text = "# Example\nA bounded source.",
  extras: Record<string, unknown>[] = [],
) {
  const sha = createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex");
  const transport = vi.fn<SourceTransport>(async ({ url }) => {
    const path = new URL(url).pathname;
    if (path === "/repos/example/project")
      return json({
        id: 42,
        private: false,
        full_name: "example/project",
        default_branch: "main",
      });
    if (
      path === `/repos/example/project/commits/${commit}` ||
      path === "/repos/example/project/commits/main"
    )
      return json({ sha: commit, commit: { tree: { sha: tree } } });
    if (path === `/repos/example/project/git/trees/${tree}`)
      return json({
        sha: tree,
        truncated: false,
        tree: [
          {
            path: "README.md",
            mode: "100644",
            type: "blob",
            sha,
            size: Buffer.byteLength(text),
          },
          ...extras,
        ],
      });
    if (path === `/repos/example/project/git/blobs/${sha}`)
      return json({
        sha,
        size: Buffer.byteLength(text),
        encoding: "base64",
        content: Buffer.from(text).toString("base64"),
      });
    throw Error("Unexpected fixture request");
  });
  return {
    transport,
    context: { transport, now: () => now } satisfies AdapterContext,
    input: {
      url: "https://github.com/example/project",
      commit,
      repositoryId: 42,
      selectedPaths: ["README.md"],
      rightsBasis: "fixture_owner_permission",
    },
    sha,
  };
}
const eligibility: RedditEligibility = {
  status: "verified",
  evidenceId: "fixture-only-no-live-permission",
  expiresAt: now + 60000,
  authentication: "oauth",
  workloads: ["selected_thread_read", "private_summary", "citation_export"],
  retention: { maxAgeMs: 86400000, deletionWithinMs: 3600000 },
};
const threadUrl = "https://www.reddit.com/r/example/comments/abc123/";
function listing(children: unknown[]) {
  return { kind: "Listing", data: { children } };
}
function comment(
  id: string,
  parent = "t3_abc123",
  body = `Comment ${id}`,
  replies: unknown = "",
  created = 100,
) {
  return {
    kind: "t1",
    data: {
      id,
      parent_id: parent,
      body,
      author: "reader",
      created_utc: created,
      edited: false,
      replies,
    },
  };
}
function redditFixture(children: unknown[]) {
  const response = [
    listing([
      {
        kind: "t3",
        data: {
          id: "abc123",
          subreddit: "example",
          title: "Discussion",
          selftext: "Original claim",
          author: "writer",
          created_utc: 99,
          edited: false,
        },
      },
    ]),
    listing(children),
  ];
  const transport = vi.fn<SourceTransport>(async () => json(response));
  return {
    response,
    transport,
    context: { transport, now: () => now } satisfies AdapterContext,
  };
}
it("classifies only canonical source roots and rejects hostile paths before normalization", () => {
  expect(
    githubSourceUrl("https://github.com/example/project?utm_source=test#readme")
      .url,
  ).toBe("https://github.com/example/project");
  expect(
    redditSourceUrl(
      "https://old.reddit.com/r/example/comments/abc123/a_title/?share_id=x",
    ).url,
  ).toBe(threadUrl);
  for (const url of [
    "http://github.com/example/project",
    "https://github.com.evil.test/example/project",
    "https://user@github.com/example/project",
    "https://github.com:444/example/project",
    "https://github.com/example/project/issues",
    "https://github.com/example/../project",
    "https://github.com/example/%2e%2e/project",
    "https://github.com/example%2fproject",
    "https://github.com/example\\project",
    "https://github.com/example/project%00",
  ])
    expect(() => githubSourceUrl(url), url).toThrow();
  for (const url of [
    "https://redd.it/abc123",
    "https://www.reddit.com/r/example/s/short",
    "https://www.reddit.com/r/example/comments/abc123/title/def456/",
    "https://reddit.com.evil.test/r/example/comments/abc123/",
  ])
    expect(() => redditSourceUrl(url), url).toThrow();
  for (const path of [
    ".env",
    ".env.production",
    "docs/../../secret.md",
    "docs\\file.md",
    "secrets/key.txt",
    ".npmrc",
    "id_rsa",
    "file%2fsecret.md",
  ])
    expect(safeSourcePath(path), path).toBe(false);
});
it("selects only pinned regular text blobs and creates verifiable file citations without destination authority", async () => {
  const f = githubFixture(undefined, [
    { path: "link.md", mode: "120000", type: "blob", sha: commit, size: 10 },
    { path: "module", mode: "160000", type: "commit", sha: commit },
    { path: ".env", mode: "100644", type: "blob", sha: commit, size: 10 },
    { path: "photo.png", mode: "100644", type: "blob", sha: commit, size: 10 },
  ]);
  const selection = await inspectGithubSource({ url: f.input.url }, f.context);
  expect(selection.files.map((e) => e.path)).toEqual(["README.md"]);
  const result = await acquireGithubSource(f.input, f.context);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw Error("Expected acquisition");
  expect(result.evidence[0]).toMatchObject({
    kind: "github_file",
    commitSha: commit,
    startLine: 1,
    endLine: 2,
    repositoryId: 42,
  });
  await expect(
    validateEvidenceRegistry(result.revision, result.evidence),
  ).resolves.toBeDefined();
  expect(
    f.transport.mock.calls.every(
      ([request]) =>
        request.provider === "github" &&
        Object.keys(request).sort().join(",") === "provider,signal,url",
    ),
  ).toBe(true);
  expect(
    (
      await acquireGithubSource(
        { ...f.input, selectedPaths: ["link.md"] },
        f.context,
      )
    ).status,
  ).toBe("unavailable");
  expect(
    (await acquireGithubSource({ ...f.input, repositoryId: 99 }, f.context))
      .status,
  ).toBe("unavailable");
});
it("rejects secret, LFS and binary text rather than treating public visibility as content permission", async () => {
  for (const text of [
    "version https://git-lfs.github.com/spec/v1\noid sha256:abc",
    "visible\u0000binary",
    `token ghp_${"a".repeat(30)}`,
  ]) {
    const f = githubFixture(text);
    expect(await acquireGithubSource(f.input, f.context)).toMatchObject({
      status: "unavailable",
      reason: "no_permitted_selected_text",
    });
  }
  const f = githubFixture();
  expect(
    (
      await acquireGithubSource(
        { ...f.input, selectedPaths: Array(21).fill("README.md") },
        f.context,
      )
    ).status,
  ).toBe("unavailable");
});
it("refuses forged blob bytes and does not follow renamed/private/deleted provider responses", async () => {
  const f = githubFixture();
  const original = f.transport.getMockImplementation()!;
  f.transport.mockImplementation(async (request) =>
    request.url.includes("/git/blobs/")
      ? json({ sha: f.sha, size: 5, encoding: "base64", content: "!!!!!" })
      : original(request),
  );
  expect((await acquireGithubSource(f.input, f.context)).status).toBe(
    "unavailable",
  );
  for (const status of [301, 302, 403, 404]) {
    f.transport.mockResolvedValue(json({}, status));
    expect((await acquireGithubSource(f.input, f.context)).status).toBe(
      "unavailable",
    );
  }
  f.transport.mockResolvedValue(json({}, 429, { "retry-after": "60" }));
  expect(await acquireGithubSource(f.input, f.context)).toMatchObject({
    status: "rate_limited",
    retryAt: now + 60000,
  });
});
it("requires current explicit Reddit workload and retention evidence before any transport call", async () => {
  const f = redditFixture([]);
  for (const grant of [
    undefined,
    { ...eligibility, expiresAt: now },
    { ...eligibility, workloads: ["selected_thread_read"] },
    { ...eligibility, retention: undefined },
    { ...eligibility, fabricatedPermission: true },
  ])
    expect(
      await acquireRedditSource(
        { url: threadUrl, eligibility: grant },
        f.context,
      ),
    ).toEqual({
      status: "needs_supplied_text",
      reason: "reddit_permission_required",
    });
  expect(f.transport).not.toHaveBeenCalled();
});
it("preserves Reddit OP/comment attribution, parent context, removed markers and declared omissions", async () => {
  const child = comment("child", "t1_parent", "A disagreement", "", 50);
  const f = redditFixture([
    comment("parent", "t3_abc123", "[deleted]", listing([child]), 100),
    { kind: "more", data: { count: 8 } },
  ]);
  const result = await acquireRedditSource(
    { url: threadUrl, eligibility },
    f.context,
  );
  expect(result.status).toBe("partial");
  if (result.status !== "partial") throw Error("Expected partial acquisition");
  expect(result.evidence.map((e) => e.kind)).toEqual([
    "reddit_post",
    "reddit_comment",
    "reddit_comment",
  ]);
  expect(result.evidence[1]).toMatchObject({
    itemId: "parent",
    availability: "deleted",
  });
  expect(result.evidence[2]).toMatchObject({
    itemId: "child",
    parentId: "t1_parent",
    role: "commenter",
  });
  expect(result.revision.coverage).toMatchObject({
    retrieved: 3,
    omitted: 8,
    omissions: expect.arrayContaining([
      "provider_more_branches_not_fetched",
      "deleted_comment_marker",
    ]),
  });
  expect(f.transport.mock.calls[0][0].url).toContain("oauth.reddit.com");
  await expect(
    validateEvidenceRegistry(result.revision, result.evidence),
  ).resolves.toBeDefined();
});
it("bounds deterministic Reddit sampling and rejects mismatched ancestry, expired permission and blocked retrieval", async () => {
  const f = redditFixture(
    Array.from({ length: 70 }, (_, i) =>
      comment(`c${i}`, "t3_abc123", `Evidence ${i}`, "", i + 100),
    ),
  );
  const result = await acquireRedditSource(
    { url: threadUrl, eligibility },
    f.context,
  );
  expect(result.status).toBe("partial");
  if (result.status !== "partial") throw Error("Expected partial acquisition");
  expect(result.evidence).toHaveLength(51);
  expect(result.revision.coverage.omitted).toBe(20);
  const bad = redditFixture([comment("wrong", "t1_missing")]);
  expect(
    (await acquireRedditSource({ url: threadUrl, eligibility }, bad.context))
      .status,
  ).toBe("unavailable");
  f.transport.mockResolvedValue(json({}, 403));
  expect(
    (await acquireRedditSource({ url: threadUrl, eligibility }, f.context))
      .status,
  ).toBe("needs_supplied_text");
  let clock = now;
  const expired = redditFixture([]);
  expired.transport.mockImplementation(async () => {
    clock = now + 1000;
    return json(expired.response);
  });
  expect(
    await acquireRedditSource(
      { url: threadUrl, eligibility: { ...eligibility, expiresAt: now + 500 } },
      { ...expired.context, now: () => clock },
    ),
  ).toMatchObject({ reason: "reddit_permission_expired" });
});
it("strictly validates immutable evidence hashes, canonical provenance and cited IDs", async () => {
  const f = githubFixture();
  const result = await acquireGithubSource(f.input, f.context);
  if (result.status !== "ready") throw Error("Expected fixture acquisition");
  for (const evidence of [
    [{ ...result.evidence[0], excerpt: "forged" }],
    [{ ...result.evidence[0], canonicalUrl: "https://evil.test" }],
    [{ ...result.evidence[0], secretField: "x" }],
    [result.evidence[0], result.evidence[0]],
  ])
    await expect(
      validateEvidenceRegistry(result.revision, evidence),
    ).rejects.toThrow();
  expect(() => assertEvidenceReferences(["forged"], result.evidence)).toThrow();
  expect(() =>
    assertEvidenceReferences([result.evidence[0].id], result.evidence),
  ).not.toThrow();
  const supplied = await createEvidence({
    kind: "supplied_text",
    originalUrl: threadUrl,
    canonicalUrl: threadUrl,
    startOffset: 0,
    endOffset: 8,
    excerpt: "Supplied",
    observedAt: now,
    provenance: "user_supplied_unverified",
  });
  await expect(
    validateEvidenceRegistry(
      {
        ...result.revision,
        sourceType: "supplied_text",
        canonical: threadUrl,
        providerIdentity: "supplied:fixture",
        contentHash: await registryHash([supplied]),
        coverage: {
          method: "user_supplied",
          retrieved: 1,
          omitted: 0,
          omissions: [],
        },
      },
      [supplied],
    ),
  ).resolves.toBeDefined();
});
it("bounds streamed response bytes, deadline, malformed JSON and shared provider fairness", async () => {
  const oversized: SourceTransport = async () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: (async function* () {
      yield new Uint8Array(100);
      yield new Uint8Array(100);
    })(),
  });
  await expect(
    new SourceRequestBudget(
      { transport: oversized, now: () => now },
      "github",
    ).json("https://api.github.com/repos/example/project", 150),
  ).rejects.toThrow("response_byte_limit");
  const malformed: SourceTransport = async () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: (async function* () {
      yield new TextEncoder().encode("{");
    })(),
  });
  await expect(
    new SourceRequestBudget(
      { transport: malformed, now: () => now },
      "github",
    ).json("https://api.github.com/repos/example/project", 150),
  ).rejects.toThrow("malformed_provider_json");
  const f = githubFixture();
  const context = {
    ...f.context,
    claimProviderRequest: vi.fn(async () => ({
      allowed: false,
      retryAt: now + 1000,
    })),
  };
  expect(await acquireGithubSource(f.input, context)).toMatchObject({
    status: "rate_limited",
    reason: "shared_provider_budget",
  });
  expect(f.transport).not.toHaveBeenCalled();
  const state = {
    remaining: 5,
    resetAt: now + 3600000,
    blockedUntil: 0,
    lastScope: "scope_a",
    consecutive: 3,
  };
  expect(reserveProviderRequest(state, "scope_a", now, true)).toMatchObject({
    allowed: false,
    reason: "fairness",
  });
  expect(reserveProviderRequest(state, "scope_b", now, true)).toMatchObject({
    allowed: true,
    state: { remaining: 4, consecutive: 1 },
  });
  expect(providerRetryAt({ "retry-after": "9999999999" }, now)).toBeUndefined();
});
it("keeps evidence IDs stable for the same immutable content and rejects forged line/offset provenance", async () => {
  const input = {
    kind: "github_file" as const,
    repositoryId: 42,
    repository: "example/project",
    commitSha: commit,
    path: "README.md",
    startLine: 1,
    endLine: 2,
    excerpt: "One\nTwo",
    canonicalUrl: `https://github.com/example/project/blob/${commit}/README.md`,
    observedAt: now,
  };
  const first = await createEvidence(input),
    later = await createEvidence({ ...input, observedAt: now + 1000 });
  expect(first.id).toBe(later.id);
  expect(await registryHash([first])).toBe(await registryHash([later]));
  const f = githubFixture(),
    result = await acquireGithubSource(f.input, f.context);
  if (result.status !== "ready") throw Error("Expected fixture acquisition");
  const forged = await createEvidence({ ...input, endLine: 99 });
  await expect(
    validateEvidenceRegistry(
      { ...result.revision, contentHash: await registryHash([forged]) },
      [forged],
    ),
  ).rejects.toThrow("INVALID_GITHUB_PROVENANCE");
  const supplied = await createEvidence({
    kind: "supplied_text",
    originalUrl: "javascript:alert(1)",
    canonicalUrl: "javascript:alert(1)",
    startOffset: 0,
    endOffset: 3,
    excerpt: "abc",
    observedAt: now,
    provenance: "user_supplied_unverified",
  });
  await expect(
    validateEvidenceRegistry(
      {
        ...result.revision,
        sourceType: "supplied_text",
        canonical: "javascript:alert(1)",
        contentHash: await registryHash([supplied]),
      },
      [supplied],
    ),
  ).rejects.toThrow();
});
it("rejects cyclic comment ancestry even when all excerpt hashes and IDs are recomputed", async () => {
  const f = redditFixture([comment("c1")]);
  const result = await acquireRedditSource(
    { url: threadUrl, eligibility },
    f.context,
  );
  if (result.status !== "ready") throw Error("Expected fixture acquisition");
  const old = result.evidence[1];
  if (old.kind !== "reddit_comment") throw Error("Expected comment");
  const cyclic = await createEvidence({ ...old, parentId: "t1_c1" });
  const evidence = [result.evidence[0], cyclic];
  await expect(
    validateEvidenceRegistry(
      { ...result.revision, contentHash: await registryHash(evidence) },
      evidence,
    ),
  ).rejects.toThrow("MISSING_COMMENT_ANCESTOR");
});
