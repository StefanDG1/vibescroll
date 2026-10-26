import { v } from "convex/values";

export const cloudSaveDefaults = v.object({
  version: v.literal("app-save-cloud-v1"),
  model: v.string(),
  effort: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("xhigh"),
  ),
  retentionMs: v.number(),
});

export const cloudSaveIntent = v.object({
  version: v.literal("app-save-cloud-v1"),
  id: v.string(),
  actor: v.id("users"),
  grantId: v.id("assistantGrants"),
  grantVersion: v.number(),
  clientId: v.string(),
  generation: v.number(),
  revision: v.number(),
  sourceHash: v.string(),
  defaultsHash: v.string(),
  policyHash: v.string(),
  model: v.string(),
  effort: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("xhigh"),
  ),
  retainUntil: v.number(),
  createdAt: v.number(),
  expiresAt: v.number(),
  analysisGeneration: v.optional(v.number()),
});
