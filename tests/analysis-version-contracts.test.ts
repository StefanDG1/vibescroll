import { expect, it } from "vitest";
import {
  compareVersionOutputs,
  reusableEvidenceIdentity,
  validateVersionOutput,
} from "../packages/contracts/analysis-versions";

const hash = "a".repeat(64);
const evidence = [
  {
    id: "segment_1",
    kind: "video_observation" as const,
    startMs: 0,
    endMs: 1000,
  },
];
const binding = {
  sourceId: "source-a",
  attemptId: "attempt-2",
  evidenceHash: hash,
  postRevisionHash: hash,
  evidence,
};
const insight = {
  id: "idea_1",
  kind: "idea" as const,
  title: "Explain the source",
  claim: "The source explains a process.",
  interpretation: "Use the demonstrated process where applicable.",
  categories: ["other" as const],
  evidence,
  confidence: "uncertain" as const,
  verificationNeeds: ["Verify applicability."],
};
const output = {
  schemaVersion: "analysis-version-output-v1",
  ...binding,
  evidence: undefined,
  summary: "A cited analysis.",
  warnings: [],
  insights: [insight],
};
function valid() {
  const { evidence: _evidence, ...value } = output;
  return value;
}

it("binds a new attempt to retained evidence without replaying extraction identity", () => {
  expect(validateVersionOutput(valid(), binding).attemptId).toBe("attempt-2");
  for (const field of [
    "sourceId",
    "attemptId",
    "evidenceHash",
    "postRevisionHash",
  ] as const) {
    expect(() =>
      validateVersionOutput(
        {
          ...valid(),
          [field]: field.endsWith("Hash") ? "b".repeat(64) : "another",
        },
        binding,
      ),
    ).toThrow();
  }
});
it("rejects invented citation times, duplicate insights and unreviewed output fields", () => {
  expect(() =>
    validateVersionOutput(
      {
        ...valid(),
        insights: [{ ...insight, evidence: [{ ...evidence[0], endMs: 999 }] }],
      },
      binding,
    ),
  ).toThrow();
  expect(() =>
    validateVersionOutput(
      { ...valid(), insights: [insight, insight] },
      binding,
    ),
  ).toThrow();
  expect(() =>
    validateVersionOutput({ ...valid(), paidFallback: true }, binding),
  ).toThrow();
});
it("comparison never awards quality because a version is newer or longer", () => {
  const result = compareVersionOutputs(valid(), {
    ...valid(),
    summary: "A newer summary.",
    insights: [{ ...insight, title: "Changed title" }],
  });
  expect(result).toMatchObject({
    summaryChanged: true,
    changed: ["idea_1"],
    added: [],
    removed: [],
    qualityVerdict: "review_required",
  });
});
it("evidence reuse excludes task, grant and retention identities but changes with actual content", () => {
  const post = {
    canonical: "https://www.instagram.com/reel/fixture/",
    assets: [{ contentHash: hash }],
    captionHash: hash,
    segments: [{ text: "Actual speech", startMs: 0, endMs: 1000 }],
    frames: [{ sha256: hash, timestampMs: 0 }],
    toolchainHash: hash,
    taskId: "first-task",
    retainUntil: 1000,
  };
  const secondPost = { ...post, taskId: "second-task", retainUntil: 2000 };
  expect(reusableEvidenceIdentity({ post })).toBe(
    reusableEvidenceIdentity({ post: secondPost }),
  );
  const observations = [
    {
      ...evidence[0],
      text: "Actual speech",
      basis: "transcript",
      uncertainty: "",
      postRevisionHash: hash,
    },
  ];
  expect(reusableEvidenceIdentity({ post, evidence: observations })).toBe(
    reusableEvidenceIdentity({
      post: secondPost,
      evidence: [{ ...observations[0], postRevisionHash: "b".repeat(64) }],
    }),
  );
  expect(reusableEvidenceIdentity({ post, evidence: observations })).not.toBe(
    reusableEvidenceIdentity({
      post,
      evidence: [{ ...observations[0], uncertainty: "Text is unclear." }],
    }),
  );
  expect(reusableEvidenceIdentity({ post })).not.toBe(
    reusableEvidenceIdentity({
      post: {
        ...post,
        segments: [{ text: "Changed speech", startMs: 0, endMs: 1000 }],
      },
    }),
  );
});
