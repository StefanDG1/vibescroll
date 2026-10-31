import { defineTable } from "convex/server";
import { v } from "convex/values";
export const postEngagementTables = {
  postEngagement: defineTable({
    userId: v.id("users"),
    key: v.string(),
    liked: v.boolean(),
    saved: v.boolean(),
    savedAt: v.optional(v.number()),
    revision: v.number(),
    likeUpdatedAt: v.number(),
    lastKey: v.optional(v.string()),
    lastExpectedRevision: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_key", ["userId", "key"])
    .index("by_key", ["key"])
    .index("by_user", ["userId"])
    .index("by_key_like_time", ["key", "liked", "likeUpdatedAt"])
    .index("by_key_save_time", ["key", "savedAt"]),
};
