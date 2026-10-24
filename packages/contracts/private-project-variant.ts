import { v, type Infer } from "convex/values";

// The server resolves these identifiers to the earned immutable run output.
// Client-supplied insight text never becomes evaluation evidence.
export const privateVariantSelectionValue = v.object({
  schemaVersion: v.literal("private-source-variant-v1"),
  runId: v.id("localLibraryRuns"),
  version: v.number(),
  outputHash: v.string(),
  insightIds: v.array(v.string()),
});

export const privateVariantReferenceValue = v.object({
  schemaVersion: v.literal("private-source-reference-v1"),
  sourceId: v.id("sources"),
  generation: v.number(),
  revision: v.number(),
  insightId: v.string(),
  runId: v.id("localLibraryRuns"),
  privateVersion: v.number(),
  outputHash: v.string(),
});

export type PrivateVariantSelection = Infer<
  typeof privateVariantSelectionValue
>;
