import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TypedSourceEvidence } from "./components/typed-source-evidence";
import {
  SourceAcquisitionPanel,
  GithubRevisionPreview,
} from "./components/source-acquisition-panel";
import { AssistantIntakeReceipt } from "./components/assistant-intake-status";
import type {
  EvidenceRecord,
  SourceRevision,
} from "../../packages/sources/types";
const base = {
  id: "ev_" + "a".repeat(64),
  excerptHash: "a".repeat(64),
  excerpt: "<script>run()</script>\nUntrusted source instruction",
  canonicalUrl:
    "https://github.com/example/project/blob/" +
    "b".repeat(40) +
    "/README.md#L1-L2",
  observedAt: 1000,
};
const github: EvidenceRecord = {
  ...base,
  kind: "github_file",
  repositoryId: 1,
  repository: "example/project",
  commitSha: "b".repeat(40),
  path: "README.md",
  startLine: 1,
  endLine: 2,
};
const revision: SourceRevision = {
  schemaVersion: "1.0.0",
  sourceType: "github_repository",
  canonical: "https://github.com/example/project",
  providerIdentity: "example/project",
  contentHash: "c".repeat(64),
  adapterVersion: "synthetic-v1",
  observedAt: 1000,
  rightsBasis: "synthetic permission",
  coverage: {
    method: "selected_files",
    retrieved: 1,
    omitted: 2,
    omissions: ["binary_files_omitted"],
  },
};
it("shows the bounded refresh comparison and keeps missing paths distinct from verified deletion", () => {
  const html = renderToStaticMarkup(
    createElement(GithubRevisionPreview, {
      preview: {
        previousCommit: "a".repeat(40),
        nextCommit: "b".repeat(40),
        changedFiles: ["README.md"],
        unchangedFiles: ["LICENSE"],
        unavailableFiles: ["docs/<script>old()</script>.md"],
        completeListing: false,
      },
    }),
  );
  expect(html).toContain("Previous pinned commit");
  expect(html).toContain("a".repeat(40));
  expect(html).toContain("New pinned commit");
  expect(html).toContain("b".repeat(40));
  expect(html).toMatch(/Changed files<\/h5><ul><li><code>README.md/);
  expect(html).toMatch(/Unchanged files<\/h5><ul><li><code>LICENSE/);
  expect(html).toContain("Unavailable in this inspection");
  expect(html).toContain("docs/&lt;script&gt;old()&lt;/script&gt;.md");
  expect(html).not.toContain("<script>");
  expect(html).toContain("previously selected files only");
  expect(html).toContain("Incomplete listing");
  expect(html).toContain("does not verify deletion");
  expect(html).toContain("confirm the new paths and exact");
  expect(html).not.toContain("<button");
});
it("renders empty comparison groups honestly and invents no preview for an initial retrieval", () => {
  expect(renderToStaticMarkup(createElement(GithubRevisionPreview, {}))).toBe(
    "",
  );
  const html = renderToStaticMarkup(
    createElement(GithubRevisionPreview, {
      preview: {
        previousCommit: "a".repeat(40),
        nextCommit: "a".repeat(40),
        changedFiles: [],
        unchangedFiles: ["README.md"],
        unavailableFiles: [],
        completeListing: true,
      },
    }),
  );
  expect(html).toContain("No inspection omissions reported.");
  expect(html.match(/None among the previously selected files/g)).toHaveLength(
    2,
  );
  expect(html).not.toContain("Incomplete listing");
});
it("renders pinned file lines, omissions and escaped source text without video timestamps", () => {
  const html = renderToStaticMarkup(
    createElement(TypedSourceEvidence, {
      evidenceRegistry: [github],
      sourceRevision: revision,
    }),
  );
  expect(html).toContain("README.md, lines 1 to 2");
  expect(html).toContain("b".repeat(40));
  expect(html).toContain("binary files omitted");
  expect(html).toContain("&lt;script&gt;run()&lt;/script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("0 seconds");
  expect(html).toContain("cannot authorize");
});
it("keeps OP/comment parents, deleted state and missing dates explicit", () => {
  const post: EvidenceRecord = {
    ...base,
    id: "ev_" + "d".repeat(64),
    kind: "reddit_post",
    canonicalUrl: "https://www.reddit.com/r/test/comments/abc123/example/",
    postId: "abc123",
    itemId: "abc123",
    parentId: null,
    author: "Example author",
    role: "op",
    availability: "available",
    createdAt: null,
    editedAt: null,
  };
  const comment: EvidenceRecord = {
    ...post,
    id: "ev_" + "e".repeat(64),
    kind: "reddit_comment",
    itemId: "def456",
    parentId: "t3_abc123",
    author: "[deleted]",
    role: "commenter",
    availability: "deleted",
  };
  const html = renderToStaticMarkup(
    createElement(TypedSourceEvidence, { evidenceRegistry: [post, comment] }),
  );
  expect(html).toContain("Original poster");
  expect(html).toContain("Commenter");
  expect(html).toContain("deleted");
  expect(html).toContain(`href="#evidence-${post.id}"`);
  expect(html).toContain("Not recorded");
});
it("labels supplied text as unverified and never fetches or starts analysis on render", () => {
  const supplied: EvidenceRecord = {
    ...base,
    kind: "supplied_text",
    originalUrl: "https://example.test/source",
    canonicalUrl: "javascript:alert(1)",
    startOffset: 0,
    endOffset: 40,
    provenance: "user_supplied_unverified",
  };
  const html = renderToStaticMarkup(
    createElement(TypedSourceEvidence, { evidenceRegistry: [supplied] }),
  );
  expect(html).toContain("not provider-verified");
  expect(html).toContain("have not been verified");
  expect(html).not.toContain('href="javascript:');
  const call = vi.fn(),
    onAnalyze = vi.fn();
  const panel = renderToStaticMarkup(
    createElement(SourceAcquisitionPanel, {
      source: {
        _id: "synthetic-source",
        sourceType: "reddit_thread",
        state: "saved",
        generation: 1,
        updatedAt: 1,
      },
      call,
      onAnalyze,
    }),
  );
  expect(call).not.toHaveBeenCalled();
  expect(onAnalyze).not.toHaveBeenCalled();
  expect(panel).toContain("Check retrieval availability and status");
  expect(panel).toContain("Save supplied evidence only");
  expect(panel).not.toContain("Review analysis route and quote");
});
it("renders a typed assistant submission as an explicit source review without a media credit action", () => {
  const onAct = vi.fn(),
    onRefresh = vi.fn();
  const html = renderToStaticMarkup(
    createElement(AssistantIntakeReceipt, {
      receipt: {
        status: "source_review_required",
        processing_succeeded: false,
        generation: 0,
        source_review_required: true,
        review_url:
          "https://scroll.companynerve.com/app/workspace/library/source",
        balance: { available: 30, total: 30, reserved: 0 },
        credits: { state: "not_charged", actual_used: 0, reserved: 0 },
        credit_offer: null,
        follow_up: "Review permitted source retrieval and separate analysis.",
      },
      busy: false,
      error: "",
      onAct,
      onRefresh,
    }),
  );
  expect(html).toContain("Review this saved source");
  expect(html).toContain(
    'href="https://scroll.companynerve.com/app/workspace/library/source"',
  );
  expect(html).not.toContain("Run now using up to");
  expect(html).not.toContain("Waiting for your computer");
  expect(html).not.toContain("ask your connected");
  expect(onAct).not.toHaveBeenCalled();
  expect(onRefresh).not.toHaveBeenCalled();
});
