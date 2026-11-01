import { v } from "convex/values";
export const onboardingState = v.object({
  version: v.literal(1),
  stage: v.union(
    v.literal("quiz"),
    v.literal("github"),
    v.literal("paywall"),
    v.literal("complete"),
  ),
  goal: v.string(),
  interests: v.array(v.string()),
  team: v.optional(v.boolean()),
  importRequested: v.optional(v.boolean()),
  interval: v.optional(
    v.union(v.literal("monthly"), v.literal("annual"), v.literal("weekly")),
  ),
  selectedFamilyId: v.optional(v.id("catalogFamilies")),
  repository: v.optional(
    v.object({
      id: v.number(),
      fullName: v.string(),
      installationId: v.number(),
    }),
  ),
  sourceId: v.optional(v.id("sources")),
  updatedAt: v.number(),
});
