import { expect, it } from "vitest";
import {
  apiModels,
  apiModelSelection,
  apiTokenCost,
  modelAnalysisCredits,
} from "../packages/contracts/api-models";

it("keeps exact curated model and supported reasoning choices separate from execution permission", () => {
  expect(apiModelSelection("gpt-6-luna")).toMatchObject({
    id: "gpt-6-luna",
    effort: "max",
    provider: "openai_responses",
    creditMultiplier: 3,
  });
  expect(
    apiModelSelection("meta/muse-spark-1.3-contributor").creditMultiplier,
  ).toBe(1);
  for (const id of ["constructor", "__proto__", "gpt-5.5", "invented"])
    expect(() => apiModelSelection(id)).toThrow("MODEL_UNAVAILABLE");
  expect(() => apiModelSelection("gpt-6.1-sol", "none")).toThrow(
    "MODEL_EFFORT_UNAVAILABLE",
  );
  expect(() =>
    apiModelSelection("meta/muse-spark-1.3-contributor", "max"),
  ).toThrow("MODEL_EFFORT_UNAVAILABLE");
  expect(apiModels["gpt-6-luna"]).not.toHaveProperty("enabled");
});

it("keeps fractional token prices in integer nanodollars and distinguishes unclassified cache-write ceilings", () => {
  expect(apiTokenCost("gpt-6-luna", 1, 1)).toEqual({
    nominalNanoUsd: 600,
    ceilingNanoUsd: 625,
  });
  expect(apiTokenCost("gpt-6-luna", 10000, 2000, 4000)).toEqual({
    nominalNanoUsd: 1640000,
    ceilingNanoUsd: 1790000,
  });
  expect(apiTokenCost("gpt-6.1-sol", 50000, 12000)).toEqual({
    nominalNanoUsd: 220000000,
    ceilingNanoUsd: 245000000,
  });
  for (const args of [
    [NaN, 1, 0],
    [-1, 1, 0],
    [1, 1, 2],
    [272001, 1, 0],
    [1, 1.5, 0],
  ])
    expect(() =>
      apiTokenCost("gpt-6-luna", ...(args as [number, number, number])),
    ).toThrow();
});

it("charges disclosed started-minute model bands without rounding the duration or intermediate provider amounts early", () => {
  expect(modelAnalysisCredits(1, "gpt-6-luna")).toBe(3);
  expect(modelAnalysisCredits(60000, "gpt-6-luna")).toBe(3);
  expect(modelAnalysisCredits(60001, "gpt-6-luna")).toBe(6);
  expect(modelAnalysisCredits(600000, "gpt-6.1-sol")).toBe(500);
  expect(() => modelAnalysisCredits(0, "gpt-6-luna")).toThrow(
    "INVALID_DURATION",
  );
  expect(() => modelAnalysisCredits(600001, "gpt-6-luna")).toThrow(
    "INVALID_DURATION",
  );
});
