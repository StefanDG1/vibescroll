import { defineTable } from "convex/server";
import { v } from "convex/values";
import { privateEvaluationOriginValue } from "../packages/contracts/private-evaluation-context";
import { privateVariantReferenceValue } from "../packages/contracts/private-project-variant";
const tenant = {
  organizationId: v.id("organizations"),
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const evidenceRef = v.object({
  sourceId: v.id("sources"),
  generation: v.number(),
  revision: v.number(),
  insightId: v.string(),
});
export const evaluationEvidenceRef = v.union(
  evidenceRef,
  privateVariantReferenceValue,
);
export const knowledgeTables = {
  knowledgePolicies: defineTable({
    ...tenant,
    enabled: v.boolean(),
    ceiling: v.number(),
    used: v.number(),
    period: v.string(),
    actor: v.id("users"),
    version: v.number(),
    state: v.string(),
  }).index("by_org", ["organizationId"]),
  knowledgeTopics: defineTable({
    ...tenant,
    key: v.string(),
    name: v.string(),
    aliases: v.optional(v.array(v.string())),
    searchText: v.optional(v.string()),
    parentId: v.optional(v.id("knowledgeTopics")),
    layoutVersion: v.optional(v.number()),
    autoCategory: v.optional(v.boolean()),
    pinned: v.boolean(),
    sourceCount: v.optional(v.number()),
    insightCount: v.optional(v.number()),
    version: v.number(),
    state: v.string(),
    resumeCursor: v.optional(v.string()),
    redirect: v.optional(v.id("knowledgeTopics")),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_priority", ["organizationId", "pinned", "insightCount"])
    .index("by_org_leaf", [
      "organizationId",
      "autoCategory",
      "pinned",
      "insightCount",
    ])
    .index("by_key", ["organizationId", "key"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["organizationId", "state"],
    })
    .searchIndex("search_explore", {
      searchField: "searchText",
      filterFields: ["organizationId", "state"],
    }),
  knowledgeMembers: defineTable({
    ...tenant,
    topicId: v.id("knowledgeTopics"),
    sourceId: v.id("sources"),
    generation: v.number(),
    revision: v.number(),
    insightId: v.string(),
    sourceTitle: v.optional(v.string()),
    excluded: v.boolean(),
    manual: v.boolean(),
    retainedHistory: v.optional(v.boolean()),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_topic", ["topicId"])
    .index("by_topic_source", ["topicId", "sourceId"])
    .index("by_reference", [
      "organizationId",
      "sourceId",
      "generation",
      "revision",
      "insightId",
    ])
    .searchIndex("search_title", {
      searchField: "sourceTitle",
      filterFields: ["organizationId"],
    }),
  knowledgeJobs: defineTable({
    ...tenant,
    localRunId: v.optional(v.id("localLibraryRuns")),
    topicId: v.id("knowledgeTopics"),
    actor: v.id("users"),
    version: v.number(),
    policyVersion: v.number(),
    libraryScanId: v.optional(v.id("libraryScans")),
    cursor: v.union(v.string(), v.null()),
    next: v.union(v.string(), v.null()),
    done: v.boolean(),
    state: v.string(),
    key: v.string(),
    credits: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    references: v.array(evidenceRef),
    output: v.optional(v.any()),
    processingVersion: v.string(),
    model: v.optional(v.string()),
  })
    .index("by_state_updated", ["state", "updatedAt"])
    .index("by_org", ["organizationId"])
    .index("by_org_state", ["organizationId", "state"])
    .index("by_topic", ["topicId"])
    .index("by_key", ["key"]),
  knowledgeEvaluations: defineTable({
    ...tenant,
    privateEvaluationOrigin: v.optional(privateEvaluationOriginValue),
    topicBindings: v.optional(
      v.array(v.object({ id: v.id("knowledgeTopics"), version: v.number() })),
    ),
    localRunId: v.optional(v.id("localLibraryRuns")),
    topicId: v.optional(v.id("knowledgeTopics")),
    repositoryId: v.id("repositories"),
    actor: v.id("users"),
    topicVersion: v.optional(v.number()),
    baseSha: v.string(),
    profileVersion: v.number(),
    selectionVersion: v.optional(v.number()),
    references: v.array(evaluationEvidenceRef),
    sourceSetHash: v.string(),
    preferenceVersion: v.optional(v.number()),
    key: v.string(),
    state: v.string(),
    decision: v.string(),
    output: v.optional(v.any()),
    credits: v.optional(v.number()),
    processingVersion: v.string(),
    model: v.optional(v.string()),
    inspected: v.optional(v.any()),
    covered: v.number(),
    omitted: v.boolean(),
  })
    .index("by_state_updated", ["state", "updatedAt"])
    .index("by_org", ["organizationId"])
    .index("by_org_state", ["organizationId", "state"])
    .index("by_topic", ["topicId"])
    .index("by_topic_repo", ["topicId", "repositoryId"])
    .index("by_repo", ["repositoryId"])
    .index("by_key", ["key"]),
  issueDrafts: defineTable({
    ...tenant,
    privateEvaluationOrigin: v.optional(privateEvaluationOriginValue),
    evaluationId: v.id("knowledgeEvaluations"),
    repositoryId: v.id("repositories"),
    topicId: v.optional(v.id("knowledgeTopics")),
    topicVersion: v.optional(v.number()),
    baseSha: v.string(),
    profileVersion: v.number(),
    selectionVersion: v.optional(v.number()),
    references: v.array(evaluationEvidenceRef),
    title: v.string(),
    body: v.string(),
    hash: v.string(),
    version: v.number(),
    marker: v.string(),
    state: v.string(),
    visibility: v.optional(v.string()),
    permissionCheckedAt: v.optional(v.number()),
    sensitive: v.boolean(),
    followUp: v.boolean(),
  })
    .index("by_org", ["organizationId"])
    .index("by_repo", ["repositoryId"])
    .index("by_evaluation", ["evaluationId"]),
  issueAttempts: defineTable({
    ...tenant,
    draftId: v.id("issueDrafts"),
    repositoryId: v.id("repositories"),
    actor: v.id("users"),
    hash: v.string(),
    draftVersion: v.number(),
    marker: v.string(),
    state: v.string(),
    visibility: v.string(),
    number: v.optional(v.number()),
    url: v.optional(v.string()),
    observedAt: v.optional(v.number()),
    externalState: v.optional(v.string()),
    externalEdited: v.optional(v.boolean()),
  })
    .index("by_org", ["organizationId"])
    .index("by_draft", ["draftId"])
    .index("by_current_publication", [
      "draftId",
      "state",
      "hash",
      "draftVersion",
    ])
    .index("by_repo", ["repositoryId"]),
};
