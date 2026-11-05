import { expect, it } from "vitest";
import { preferredCatalogCandidate } from "../packages/contracts/catalog-recommendation";

it("orders supported maximum and no-reasoning levels only within the operator's chosen model list", () => {
  const base = {
    requestedModel: "gpt-6-luna",
    requestedEffort: "high",
    reportedModel: "gpt-6-luna",
    reportedEffort: "high",
  };
  expect(
    preferredCatalogCandidate(
      { ...base, requestedEffort: "max", reportedEffort: "max" },
      base,
      ["gpt-6-luna"],
    ),
  ).toBe(true);
  expect(
    preferredCatalogCandidate(
      { ...base, requestedEffort: "max", reportedEffort: "none" },
      base,
      ["gpt-6-luna"],
    ),
  ).toBe(false);
  expect(
    preferredCatalogCandidate(
      { ...base, requestedEffort: "max", reportedEffort: "max" },
      base,
    ),
  ).toBe(false);
});
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
