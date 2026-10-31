import { expect, it } from "vitest";
import { preferredCatalogCandidate } from "../packages/contracts/catalog-recommendation";
const incumbent = {
  requestedModel: "model-a",
  requestedEffort: "high",
  reportedModel: null,
  reportedEffort: null,
};
it("uses only the configured model order and effort, retaining equal or weaker versions", () => {
  const newer = { ...incumbent, requestedModel: "model-b" };
  expect(preferredCatalogCandidate(newer, incumbent)).toBe(false);
  expect(
    preferredCatalogCandidate(newer, incumbent, ["model-b", "model-a"]),
  ).toBe(true);
  expect(preferredCatalogCandidate(incumbent, incumbent, ["model-a"])).toBe(
    false,
  );
  expect(
    preferredCatalogCandidate(
      { ...incumbent, requestedEffort: "xhigh" },
      incumbent,
      ["model-a"],
    ),
  ).toBe(true);
  expect(
    preferredCatalogCandidate(
      { ...newer, reportedModel: "model-a" },
      incumbent,
      ["model-b", "model-a"],
    ),
  ).toBe(false);
  expect(
    preferredCatalogCandidate(
      { ...incumbent, requestedEffort: "xhigh", reportedEffort: "low" },
      incumbent,
      ["model-a"],
    ),
  ).toBe(false);
});
