import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { productTables } from "../convex/productSchema";
import { assistantTables } from "../convex/assistantSchema";
import { publicTables } from "../convex/publicSchema";
import { cloudCatalogTables } from "../convex/cloudCatalogSchema";
import schema from "../convex/schema";
import { librarySpacesTables } from "../convex/librarySpacesSchema";
import {
  cloudSaveDefaults,
  cloudSaveIntent,
} from "../convex/workCloudSaveSchema";
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
  expect(Object.keys(schema.tables)).toHaveLength(95);
  expect(
    Object.values(schema.tables).reduce((total, table) => {
      const row = (
        table as unknown as {
          export(): {
            indexes: unknown[];
            searchIndexes: unknown[];
            vectorIndexes: unknown[];
          };
        }
      ).export();
      return (
        total +
        row.indexes.length +
        row.searchIndexes.length +
        row.vectorIndexes.length
      );
    }, 0),
  ).toBe(263);
  expect(Object.keys(cloudCatalogTables).sort()).toEqual([
    "catalogAliases",
    "catalogContributions",
    "catalogFamilies",
  ]);
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
    expect(nextFields.workCloudSaveIntent).toEqual({
      fieldType: (defineTable({ value: cloudSaveIntent }) as any).export()
        .documentType.value.value.fieldType,
      optional: true,
    });
    delete nextFields.workCloudSaveIntent;
    for (const field of [
      "cloudRetryReceipts",
      "catalogStatus",
      "catalogPolicy",
      "catalogWait",
      "resultRetention",
      "selectedAnalysisVersionId",
      "analysisSelectionRevision",
      "pendingAnalysisAttemptId",
      "pendingAnalysisAttemptState",
      "nextAnalysisVersionNumber",
      "selectedAnalysisSummary",
      "selectedAnalysisInsightCount",
      "selectedAnalysisMainPoints",
    ]) {
      expect(nextFields[field]?.optional).toBe(true);
      delete nextFields[field];
    }
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
    "pilotPaymentSchema.ts",
    "convex.config.ts",
    "crons.ts",
  ]) {
    const content = readFileSync(`convex/${file}`, "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(
      file === "schema.ts"
        ? content
            .replace(
              'import { analysisHistoryTables } from "./analysisHistorySchema";\n',
              "",
            )
            .replace("  ...analysisHistoryTables,\n", "")
            .replace(
              'import { cloudCatalogTables } from "./cloudCatalogSchema";\n',
              "",
            )
            .replace("  ...cloudCatalogTables,\n", "")
        : content,
    ).toBe(
      execFileSync("git", ["show", `${base}:convex/${file}`], {
        encoding: "utf8",
      }).replace(/\r\n/g, "\n"),
    );
  }
  const oldPublic = execFileSync(
    "git",
    ["show", `${base}:convex/publicSchema.ts`],
    { encoding: "utf8" },
  );
  const beforePublic = new Function(
    "defineTable",
    "v",
    oldPublic.replace(/^import[\s\S]*?;/gm, "").replace(/^export /gm, "") +
      ";return publicTables;",
  )(defineTable, v);
  expect(Object.keys(publicTables)).toEqual(Object.keys(beforePublic));
  for (const [name, table] of Object.entries(publicTables)) {
    const current = (table as any).export(),
      prior = beforePublic[name].export();
    if (name === "publicArtifacts" || name === "publicImports") {
      expect(current.documentType.type).toBe("union");
      expect(current.documentType.value).toHaveLength(2);
      expect(current.documentType.value[0]).toEqual(prior.documentType);
      expect(current.documentType.value[1].value.origin.fieldType).toEqual({
        type: "literal",
        value: "cloud",
      });
      current.documentType = prior.documentType;
    }
    expect(current).toEqual(prior);
  }
  const oldLibrary = execFileSync(
    "git",
    ["show", `${base}:convex/librarySpacesSchema.ts`],
    { encoding: "utf8" },
  );
  const priorLibrary = new Function(
    "defineTable",
    "v",
    oldLibrary.replace(/^import[\s\S]*?;/gm, "").replace(/^export /gm, "") +
      "; return librarySpacesTables;",
  )(defineTable, v);
  expect(Object.keys(librarySpacesTables)).toEqual(Object.keys(priorLibrary));
  for (const [name, table] of Object.entries(librarySpacesTables)) {
    const current = (table as any).export(),
      prior = priorLibrary[name].export();
    if (name === "librarySetup") {
      const oldRoute = prior.documentType.value.processingRoute;
      expect(current.documentType.value.processingRoute).toEqual({
        ...oldRoute,
        fieldType: {
          ...oldRoute.fieldType,
          value: [
            ...oldRoute.fieldType.value,
            { type: "literal", value: "work_cloud" },
          ],
        },
      });
      current.documentType.value.processingRoute = oldRoute;
    }
    expect(current).toEqual(prior);
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
      expect(current.documentType.value.cloudSaveDefaults).toEqual({
        fieldType: (defineTable({ value: cloudSaveDefaults }) as any).export()
          .documentType.value.value.fieldType,
        optional: true,
      });
      expect(current.documentType.value.contextScope).toEqual({
        fieldType: { type: "literal", value: "all_confirmed" },
        optional: true,
      });
      delete current.documentType.value.contextScope;
      delete current.documentType.value.cloudSaveDefaults;
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
        waiting.value.analysisAttemptId = {
          fieldType: { type: "id", tableName: "analysisAttempts" },
          optional: true,
        };
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
