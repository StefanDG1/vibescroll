import { ensure } from "../policy";

export function proposalGroupSchema(detail: unknown) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "proposals"],
    properties: {
      schemaVersion: { const: "post-project-proposals-v1" },
      proposals: { type: "array", minItems: 1, maxItems: 5, items: detail },
    },
  };
}

export function proposalGroup(input: unknown): unknown[] {
  const value = input as {
    schemaVersion?: unknown;
    proposals?: unknown;
  } | null;
  ensure(
    value !== null &&
      typeof value === "object" &&
      Object.keys(value).length === 2 &&
      value.schemaVersion === "post-project-proposals-v1" &&
      Array.isArray(value.proposals) &&
      value.proposals.length >= 1 &&
      value.proposals.length <= 5,
    "INVALID_EVIDENCE",
    "Return one to five independently reviewable proposals.",
  );
  const proposals = value!.proposals as Record<string, unknown>[];
  const keys = proposals.map((item) => {
    ensure(
      item !== null && typeof item === "object" && !Array.isArray(item),
      "INVALID_EVIDENCE",
      "Invalid proposal group.",
    );
    return String(item.proposedChange ?? item.currentProblem ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  });
  ensure(
    new Set(keys).size === keys.length,
    "INVALID_EVIDENCE",
    "Repeated wording does not create a distinct proposal.",
  );
  return proposals;
}
