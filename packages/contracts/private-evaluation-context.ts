import { v, type Infer } from "convex/values";

// Server-authored provenance. The raw brief stays on its private approved task.
const privateBriefOriginValue = v.object({
  schemaVersion: v.literal("1.0.0"),
  kind: v.literal("private_evaluation_brief"),
  ownerId: v.id("users"),
  briefHash: v.string(),
  model: v.string(),
  effort: v.string(),
});

export const privateEvaluationOriginValue = v.union(
  privateBriefOriginValue,
  v.object({
    schemaVersion: v.literal("2.0.0"),
    kind: v.literal("private_source_variant"),
    ownerId: v.id("users"),
    sourceId: v.id("sources"),
    runId: v.id("localLibraryRuns"),
    version: v.number(),
    outputHash: v.string(),
    baseHash: v.string(),
    briefHash: v.null(),
    model: v.string(),
    effort: v.string(),
    insightIds: v.array(v.string()),
  }),
);

export type PrivateEvaluationOrigin = Infer<
  typeof privateEvaluationOriginValue
>;
