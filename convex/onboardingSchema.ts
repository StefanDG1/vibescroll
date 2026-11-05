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
  customTopic: v.optional(v.string()),
  pendingUrl: v.optional(v.string()),
  team: v.optional(v.boolean()),
  workStage: v.optional(
    v.union(
      v.literal("existing"),
      v.literal("new"),
      v.literal("team"),
      v.literal("exploring"),
    ),
  ),
  obstacle: v.optional(
    v.union(
      v.literal("lost"),
      v.literal("forgotten"),
      v.literal("apply"),
      v.literal("overload"),
      v.literal("unsure"),
    ),
  ),
  projectDescription: v.optional(v.string()),
  assistantChoice: v.optional(
    v.union(v.literal("later"), v.literal("check"), v.literal("connected")),
  ),
  assistantConnection: v.optional(
    v.object({
      clientId: v.string(),
      grantId: v.id("assistantGrants"),
      grantVersion: v.number(),
      checkedAt: v.number(),
    }),
  ),
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
