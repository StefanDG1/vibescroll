import { describe, expect, it } from "vitest";
import {
  assertReferences,
  evaluationReference,
  privateVariantReference,
  reference,
  referenceKey,
  synthesis,
} from "../packages/knowledge/contracts";

const canonical = {
  sourceId: "source-one",
  generation: 2,
  revision: 40,
  insightId: "idea-one",
};
const variant = {
  ...canonical,
  schemaVersion: "private-source-reference-v1" as const,
  runId: "earned-run-one",
  privateVersion: 1,
  outputHash: "a".repeat(64),
};

describe("private project references", () => {
  it("keeps canonical references and their cache identity unchanged", () => {
    expect(reference.parse(canonical)).toEqual(canonical);
    expect(evaluationReference.parse(canonical)).toEqual(canonical);
    expect(referenceKey(canonical)).toBe("source-one:2:40:idea-one");
    expect(reference.safeParse(variant).success).toBe(false);
  });

  it("namespaces the actual run, version and output hash", () => {
    const keys = [
      canonical,
      variant,
      { ...variant, runId: "earned-run-two" },
      { ...variant, privateVersion: 2 },
      { ...variant, outputHash: "b".repeat(64) },
    ].map(referenceKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(evaluationReference.parse(variant)).toEqual(variant);
    expect(() =>
      assertReferences([{ references: [variant] }], [canonical]),
    ).toThrow("Unknown or stale source reference");
    expect(() =>
      assertReferences([{ references: [canonical] }], [variant]),
    ).toThrow("Unknown or stale source reference");
    expect(() =>
      assertReferences(
        [{ references: [{ ...variant, outputHash: "b".repeat(64) }] }],
        [variant],
      ),
    ).toThrow("Unknown or stale source reference");
    expect(() =>
      assertReferences([{ references: [variant] }], [variant]),
    ).not.toThrow();
  });

  it("cannot substitute a canonical ID containing the old private suffix", () => {
    const privateRef = { ...variant, insightId: "i", runId: "r" };
    const forgedCanonical = {
      ...canonical,
      insightId: `i:private-source-reference-v1:r:1:${variant.outputHash}`,
    };
    expect(reference.safeParse(forgedCanonical).success).toBe(true);
    expect(referenceKey(forgedCanonical)).not.toBe(referenceKey(privateRef));
    expect(() =>
      assertReferences([{ references: [forgedCanonical] }], [privateRef]),
    ).toThrow("Unknown or stale source reference");
  });

  it("rejects partial, invalid and extra authority fields", () => {
    for (const value of [
      { ...variant, privateVersion: 0 },
      { ...variant, privateVersion: 1.5 },
      { ...variant, outputHash: "not-an-output-hash" },
      { ...variant, runId: "" },
      { ...variant, schemaVersion: "unknown-reference" },
      { ...variant, publicationRights: true },
      { ...canonical, runId: variant.runId },
    ])
      expect(evaluationReference.safeParse(value).success).toBe(false);
    expect(privateVariantReference.safeParse(canonical).success).toBe(false);
  });

  it("does not admit private variants into neutral synthesis", () => {
    const output = {
      explanation: "A neutral source claim",
      claims: [{ text: "A cited claim", references: [canonical] }],
      relations: [],
      uncertainty: "",
    };
    expect(synthesis.safeParse(output).success).toBe(true);
    expect(
      synthesis.safeParse({
        ...output,
        claims: [{ text: "A private claim", references: [variant] }],
      }).success,
    ).toBe(false);
  });
});
