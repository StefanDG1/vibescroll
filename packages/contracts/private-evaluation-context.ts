import { v, type Infer } from "convex/values";

// Server-authored provenance. The raw brief stays on its private approved task.
export const privateEvaluationOriginValue = v.object({
  schemaVersion: v.literal("1.0.0"),
  kind: v.literal("private_evaluation_brief"),
  ownerId: v.id("users"),
  briefHash: v.string(),
  model: v.string(),
  effort: v.string(),
});

export type PrivateEvaluationOrigin = Infer<
  typeof privateEvaluationOriginValue
>;
