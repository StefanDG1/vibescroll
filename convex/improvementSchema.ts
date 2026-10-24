import { defineTable } from "convex/server";
import { v } from "convex/values";
import { privateEvaluationOriginValue } from "../packages/contracts/private-evaluation-context";
import { evidenceRef } from "./knowledgeSchema";
const tenant = {
  organizationId: v.id("organizations"),
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const measurement = v.object({
  label: v.string(),
  unit: v.string(),
  before: v.number(),
  after: v.number(),
  baselineStart: v.number(),
  baselineEnd: v.number(),
  observationStart: v.number(),
  observationEnd: v.number(),
  baselineSamples: v.number(),
  observationSamples: v.number(),
  limitations: v.string(),
});
export const improvementTables = {
  improvementPreferences: defineTable({
    ...tenant,
    version: v.number(),
    note: v.string(),
    actor: v.id("users"),
  }).index("by_org", ["organizationId"]),
  improvements: defineTable({
    ...tenant,
    privateEvaluationOrigin: v.optional(privateEvaluationOriginValue),
    repositoryId: v.id("repositories"),
    evaluationId: v.id("knowledgeEvaluations"),
    issueDraftId: v.id("issueDrafts"),
    issueHash: v.string(),
    issueVersion: v.number(),
    references: v.array(evidenceRef),
    title: v.string(),
    goal: v.string(),
    proposalId: v.id("proposals"),
    state: v.string(),
    version: v.number(),
    actor: v.id("users"),
    category: v.string(),
  })
    .index("by_org", ["organizationId"])
    .index("by_issue", ["issueDraftId"])
    .index("by_repo", ["repositoryId"]),
  improvementOutcomes: defineTable({
    ...tenant,
    improvementId: v.id("improvements"),
    references: v.array(evidenceRef),
    actor: v.id("users"),
    version: v.number(),
    verdict: v.string(),
    method: v.string(),
    note: v.string(),
    runId: v.optional(v.id("runs")),
    measurement: v.optional(measurement),
    deployedVersion: v.optional(v.string()),
    deployedUrl: v.optional(v.string()),
  })
    .index("by_org", ["organizationId"])
    .index("by_improvement", ["improvementId"]),
  improvementPolicies: defineTable({
    ...tenant,
    repositoryId: v.id("repositories"),
    actor: v.id("users"),
    version: v.number(),
    selectionVersion: v.number(),
    mode: v.string(),
    monthlyCredits: v.number(),
    perRunCredits: v.number(),
    categories: v.array(v.string()),
    requiredChecks: v.array(v.string()),
    merge: v.boolean(),
    deploy: v.boolean(),
    period: v.string(),
    used: v.number(),
    reserved: v.number(),
    expiresAt: v.number(),
    paused: v.boolean(),
    leaseKey: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    status: v.optional(v.string()),
  })
    .index("by_org", ["organizationId"])
    .index("by_repo", ["repositoryId"]),
};
