import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { productTables } from "../convex/productSchema";
import { assistantTables } from "../convex/assistantSchema";
import schema from "../convex/schema";
import { sourceType, retrievalState } from "../convex/sourceSchema";
import {
  revertEvidenceValidator,
  revertStatusValidator,
} from "../convex/lib/prObservation";
import { readFileSync } from "node:fs";
const base = "346b718baf91ba9847fbb707be7bbe069df57257";
it("preserves all tables/config and permits only the exact Cloud validators and one C2 delivery index", () => {
  // The application exports 89 tables. The deployment's 131-table inventory
  // also includes component tables; their configuration is byte-checked below.
  expect(Object.keys(schema.tables)).toHaveLength(89);
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
    if (name === "assets") {
      expect(current.documentType.value.sourceGeneration).toEqual({
        fieldType: { type: "number" },
        optional: true,
      });
      delete current.documentType.value.sourceGeneration;
    }
    if (name !== "sources") {
      expect(current).toEqual(prior);
      continue;
    }
    const nextFields = current.documentType.value,
      oldFields = prior.documentType.value;
    for (const [field, type] of [
      ["title", "string"],
      ["authorName", "string"],
      ["durationSeconds", "number"],
    ]) {
      expect(nextFields.linkPreview.fieldType.value[field]).toEqual({
        fieldType: { type },
        optional: true,
      });
      delete nextFields.linkPreview.fieldType.value[field];
    }
    expect(nextFields.linkPreview.fieldType.value.origin).toEqual({
      fieldType: {
        type: "union",
        value: [
          { type: "literal", value: "page" },
          { type: "literal", value: "extractor" },
        ],
      },
      optional: true,
    });
    delete nextFields.linkPreview.fieldType.value.origin;
    const union = nextFields.personalAnalysis.fieldType.value;
    const paired = structuredClone(union[0]);
    delete paired.value.executor;
    expect(paired).toEqual(oldFields.personalAnalysis.fieldType);
    expect(union[1].value.executor.fieldType).toEqual({
      type: "literal",
      value: "work_cloud",
    });
    const media = union[1].value.cloud.fieldType.value[1].value;
    expect(media.schemaVersion.fieldType).toEqual({
      type: "union",
      value: [
        { type: "literal", value: "work-cloud-media-v2" },
        { type: "literal", value: "work-cloud-media-v3" },
      ],
    });
    const repair = media.media.fieldType.value.evidenceRepair;
    expect(repair.optional).toBe(true);
    expect(Object.keys(repair.fieldType.value)).toEqual([
      "state",
      "actor",
      "grantId",
      "grantVersion",
      "preparationHash",
      "approvedAt",
      "expiresAt",
      "leaseUntil",
      "rawMediaDeleteBy",
      "taskId",
      "leaseTokenHash",
      "consentId",
    ]);
    delete nextFields.orderedMedia;
    nextFields.personalAnalysis = oldFields.personalAnalysis;
    expect(current).toEqual(prior);
  }
  for (const file of [
    "schema.ts",
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
  const oldAssistant = execFileSync(
    "git",
    ["show", `${base}:convex/assistantSchema.ts`],
    { encoding: "utf8" },
  );
  const beforeAssistant = new Function(
    "defineTable",
    "v",
    oldAssistant.replace(/^import[\s\S]*?;/gm, "").replace(/^export /gm, "") +
      "; return assistantTables;",
  )(defineTable, v);
  expect(Object.keys(assistantTables)).toEqual(Object.keys(beforeAssistant));
  for (const [name, table] of Object.entries(assistantTables)) {
    const current = (table as any).export(),
      prior = beforeAssistant[name].export();
    if (name === "assistantGrants") {
      expect(current.documentType.value.cloudRequestPolicy).toEqual({
        fieldType: { type: "literal", value: "explicit_per_source_v1" },
        optional: true,
      });
      expect(current.documentType.value.cloudRequestPolicyHash).toEqual({
        fieldType: { type: "string" },
        optional: true,
      });
      delete current.documentType.value.cloudRequestPolicy;
      delete current.documentType.value.cloudRequestPolicyHash;
    }
    if (name === "assistantSubscriptions" || name === "assistantDeliveries") {
      const literal = (value: string) => ({ type: "literal", value });
      const eventField = (value: string, optional = false) => ({
        fieldType: literal(value),
        optional,
      });
      const legacy = structuredClone(prior.documentType);
      legacy.value.eventName = eventField("analysis_completed", true);
      const profile = structuredClone(prior.documentType);
      delete profile.value.sourceId;
      delete profile.value.generation;
      if (name === "assistantSubscriptions") {
        delete profile.value.revision;
        profile.value.eventName = {
          fieldType: {
            type: "union",
            value: [
              literal("work_cloud_waiting"),
              literal("work_cloud_connection_verified"),
              literal("video_link_saved"),
            ],
          },
          optional: false,
        };
        expect(current.documentType).toEqual({
          type: "union",
          value: [legacy, profile],
        });
      } else {
        const waiting = structuredClone(prior.documentType);
        waiting.value.eventName = {
          fieldType: {
            type: "union",
            value: [literal("work_cloud_waiting"), literal("video_link_saved")],
          },
          optional: false,
        };
        profile.value.eventName = eventField("work_cloud_connection_verified");
        expect(current.documentType).toEqual({
          type: "union",
          value: [legacy, waiting, profile],
        });
        const added = current.indexes.filter(
          (index: { indexDescriptor: string }) =>
            index.indexDescriptor === "by_source_occurrence",
        );
        expect(added).toEqual([
          {
            indexDescriptor: "by_source_occurrence",
            fields: [
              "subscriptionId",
              "sourceId",
              "generation",
              "completedRevision",
            ],
          },
        ]);
        current.indexes = current.indexes.filter(
          (index: { indexDescriptor: string }) =>
            index.indexDescriptor !== "by_source_occurrence",
        );
      }
      // Normalize only the exact, asserted C2 changes. Every legacy field,
      // existing index and other exported table setting must still match.
      current.documentType = prior.documentType;
    }
    expect(current).toEqual(prior);
  }
});
