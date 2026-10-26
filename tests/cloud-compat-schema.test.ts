import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { productTables } from "../convex/productSchema";
import { assistantTables } from "../convex/assistantSchema";
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
it("preserves existing tables/config and permits exact Cloud changes plus the bounded widget receipt table", () => {
  // ADR170 adds one application table. This is an additive-schema candidate,
  // not evidence for the prior no-new-table deployment path.
  expect(Object.keys(schema.tables)).toHaveLength(90);
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
  expect(Object.keys(assistantTables).sort()).toEqual(
    [...Object.keys(beforeAssistant), "assistantLibraryCommands"].sort(),
  );
  expect((assistantTables.assistantLibraryCommands as any).export()).toEqual(
    (
      defineTable({
        organizationId: v.id("organizations"),
        actor: v.id("users"),
        clientId: v.string(),
        grantId: v.id("assistantGrants"),
        grantVersion: v.number(),
        key: v.string(),
        inputHash: v.string(),
        topicId: v.id("knowledgeTopics"),
        operation: v.union(
          v.literal("rename"),
          v.literal("pin"),
          v.literal("structure"),
        ),
        topicVersion: v.number(),
        layoutVersion: v.number(),
        createdAt: v.number(),
        expiresAt: v.number(),
      })
        .index("by_request", ["grantId", "grantVersion", "key"])
        .index("by_org", ["organizationId"])
        .index("by_actor", ["actor"])
        .index("by_expiry", ["expiresAt"]) as any
    ).export(),
  );
  for (const [name, table] of Object.entries(assistantTables)) {
    if (name === "assistantLibraryCommands") continue;
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
