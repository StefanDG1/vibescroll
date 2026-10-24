import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { productTables } from "../convex/productSchema";
import { sourceType, retrievalState } from "../convex/sourceSchema";
import {
  revertEvidenceValidator,
  revertStatusValidator,
} from "../convex/lib/prObservation";
import { readFileSync } from "node:fs";
const base = "346b718baf91ba9847fbb707be7bbe069df57257";
it("adds no table/index/config and widens only the exact old personal job and private ordered receipt", () => {
  const old = execFileSync("git", ["show", `${base}:convex/productSchema.ts`], {
    encoding: "utf8",
  });
  const evaluate = new Function(
    "defineTable",
    "v",
    "sourceType",
    "retrievalState",
    "revertEvidenceValidator",
    "revertStatusValidator",
    old
      .replace(/^import[\s\S]*?;/gm, "")
      .replace("export const productTables =", "return"),
  );
  const before = evaluate(
    defineTable,
    v,
    sourceType,
    retrievalState,
    revertEvidenceValidator,
    revertStatusValidator,
  );
  expect(Object.keys(productTables)).toEqual(Object.keys(before));
  for (const [name, table] of Object.entries(productTables)) {
    const current = (table as any).export(),
      prior = before[name].export();
    if (name !== "sources") {
      expect(current).toEqual(prior);
      continue;
    }
    const nextFields = current.documentType.value,
      oldFields = prior.documentType.value;
    const union = nextFields.personalAnalysis.fieldType.value;
    const paired = structuredClone(union[0]);
    delete paired.value.executor;
    expect(paired).toEqual(oldFields.personalAnalysis.fieldType);
    expect(union[1].value.executor.fieldType).toEqual({
      type: "literal",
      value: "work_cloud",
    });
    delete nextFields.orderedMedia;
    nextFields.personalAnalysis = oldFields.personalAnalysis;
    expect(current).toEqual(prior);
  }
  for (const file of [
    "schema.ts",
    "assistantSchema.ts",
    "sourceSchema.ts",
    "knowledgeSchema.ts",
    "improvementSchema.ts",
    "libraryScanSchema.ts",
    "dashboardSchema.ts",
    "localLibrarySchema.ts",
    "publicSchema.ts",
    "librarySpacesSchema.ts",
    "pilotPaymentSchema.ts",
    "convex.config.ts",
    "crons.ts",
  ]) {
    expect(readFileSync(`convex/${file}`, "utf8").replace(/\r\n/g, "\n")).toBe(
      execFileSync("git", ["show", `${base}:convex/${file}`], {
        encoding: "utf8",
      }).replace(/\r\n/g, "\n"),
    );
  }
});
