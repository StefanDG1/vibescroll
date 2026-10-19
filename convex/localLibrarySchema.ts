import { defineTable } from "convex/server";
import { v } from "convex/values";
const tenant = {
  organizationId: v.id("organizations"),
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const localLibraryTables = {
  localLibraryRuns: defineTable({
    ...tenant,
    actor: v.id("users"),
    assistantIntakeId: v.optional(v.id("assistantIntakes")),
    assistantGrantVersion: v.optional(v.number()),
    sources: v.array(v.id("sources")),
    repositories: v.array(v.id("repositories")),
    model: v.literal("gpt-6.1-sol"),
    effort: v.literal("medium"),
    expiresAt: v.number(),
    state: v.string(),
    jobs: v.number(),
    completed: v.number(),
  }).index("by_org", ["organizationId"]),
  localSourceImports: defineTable({
    ...tenant,
    runId: v.id("localLibraryRuns"),
    sourceId: v.id("sources"),
    generation: v.number(),
    revision: v.number(),
    inputHash: v.string(),
    transcript: v.any(),
    acquisition: v.optional(v.any()),
    coverage: v.string(),
    frames: v.array(
      v.object({
        id: v.string(),
        timestampMs: v.number(),
        sha256: v.string(),
        size: v.number(),
        assetId: v.optional(v.id("assets")),
      }),
    ),
    state: v.string(),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_run_source", ["runId", "sourceId"]),
};
