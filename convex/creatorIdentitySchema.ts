import { v } from "convex/values";

export const postAuthorProofValue = v.object({
  version: v.literal("public-post-author-v1"),
  postKey: v.string(),
  creatorKey: v.string(),
  handle: v.string(),
  observedAt: v.number(),
  method: v.union(
    v.literal("instagram_embed"),
    v.literal("tiktok_page"),
    v.literal("x_public_api"),
  ),
  inputCanonical: v.optional(v.string()),
  resolvedCanonical: v.optional(v.string()),
});
