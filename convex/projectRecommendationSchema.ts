import { defineTable } from "convex/server";
import { v } from "convex/values";
export const projectPriority = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
);
export const projectRecommendationTables = {
  projectRecommendationPreferences: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    repositoryId: v.id("repositories"),
    priority: projectPriority,
    revision: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pair", ["organizationId", "userId", "repositoryId"])
    .index("by_user", ["userId"])
    .index("by_org", ["organizationId"]),
};
