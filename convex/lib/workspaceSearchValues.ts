import { v } from "convex/values";

export const targetValue = v.union(
  v.literal("posts"),
  v.literal("insights"),
  v.literal("both"),
);
export const filterValue = v.object({
  categoryKeys: v.optional(v.array(v.string())),
  platforms: v.optional(v.array(v.string())),
  addedAfter: v.optional(v.number()),
  addedBefore: v.optional(v.number()),
  creator: v.optional(v.string()),
});
export const assistantSearchArgs = {
  profileId: v.optional(v.id("organizations")),
  workspaceIds: v.optional(v.array(v.id("organizations"))),
  query: v.string(),
  review: v.optional(v.boolean()),
  target: v.optional(targetValue),
  filters: v.optional(filterValue),
  projectId: v.optional(v.id("repositories")),
  cursor: v.optional(v.string()),
};
export const scopeValue = v.object({
  organizationId: v.id("organizations"),
  actorId: v.id("users"),
  key: v.string(),
  version: v.number(),
  revision: v.number(),
  ready: v.boolean(),
  narrow: v.boolean(),
  semantic: v.boolean(),
});
export const projectValue = v.object({
  id: v.string(),
  profileId: v.string(),
  name: v.string(),
  profile: v.string(),
  baseSha: v.string(),
  profileVersion: v.number(),
  selectionVersion: v.number(),
  grantVersion: v.number(),
});
export const vectorResultValue = v.object({
  query: v.string(),
  ids: v.array(v.id("workspaceSearchVectors")),
});
