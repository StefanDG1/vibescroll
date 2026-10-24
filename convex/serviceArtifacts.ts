import { v } from "convex/values";
import { internalMutation, mutation } from "./lib/projectedMutations";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { access, limit } from "./lib";
import { ensure } from "../packages/policy";
import { captureAuthorized } from "./product";
import {
  commitServiceArtifact,
  expireServiceArtifact,
  invalidateServicePolicy,
  invalidateServiceSource,
  serviceArtifactCurrent,
  serviceArtifactDto,
  serviceArtifactSnapshot,
  requireProCatalogAccess,
  scrubServiceArtifactCopies,
  sweepRetainedServiceArtifactCopies,
} from "./lib/serviceArtifacts";

export const commit = internalMutation({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    compatibilityKey: v.string(),
    result: v.any(),
  },
  handler: commitServiceArtifact,
});
export const expire = internalMutation({
  args: { id: v.id("publicArtifacts"), retainUntil: v.number() },
  handler: expireServiceArtifact,
});
export const invalidatePolicy = internalMutation({
  args: { rightsHash: v.string() },
  handler: (ctx, args) => invalidateServicePolicy(ctx, args.rightsHash),
});
export const invalidateSource = internalMutation({
  args: { sourceId: v.id("sources"), maxGeneration: v.number() },
  handler: (ctx, a) =>
    invalidateServiceSource(ctx, a.sourceId, a.maxGeneration),
});
export const scrubCopies = internalMutation({
  args: {
    artifactId: v.id("publicArtifacts"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: scrubServiceArtifactCopies,
});
export const sweepCopies = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: (ctx, a) => sweepRetainedServiceArtifactCopies(ctx, a.cursor),
});

const importArgs = {
  organizationId: v.id("organizations"),
  artifactId: v.id("publicArtifacts"),
  expectedCompatibilityKey: v.string(),
};
type ImportArgs = {
  organizationId: Id<"organizations">;
  artifactId: Id<"publicArtifacts">;
  expectedCompatibilityKey: string;
};
async function privateOwner(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  const authorization = await access(ctx, organizationId, ["owner"]);
  ensure(
    authorization.organization.privateOwnerId === authorization.actor._id,
    "FORBIDDEN",
    "Save shared analysis in your own private library.",
  );
  return authorization;
}
export const preview = query({
  args: importArgs,
  handler: async (ctx, a) => {
    await privateOwner(ctx, a.organizationId);
    await requireProCatalogAccess(ctx, a.organizationId);
    const current = await serviceArtifactCurrent(
      ctx,
      await ctx.db.get(a.artifactId),
    );
    return current?.artifact.compatibilityKey === a.expectedCompatibilityKey
      ? serviceArtifactDto(current)
      : null;
  },
});
export async function saveServiceArtifactCore(ctx: MutationCtx, a: ImportArgs) {
  const authorization = await privateOwner(ctx, a.organizationId);
  await requireProCatalogAccess(ctx, a.organizationId);
  await limit(ctx, `service-artifact-save:${authorization.actor._id}`, 30);
  const base = await serviceArtifactCurrent(
    ctx,
    await ctx.db.get(a.artifactId),
  );
  ensure(
    base && base.artifact.compatibilityKey === a.expectedCompatibilityKey,
    "SOURCE_UNAVAILABLE",
    "This shared analysis is unavailable for reuse.",
  );
  const previous = await ctx.db
    .query("publicImports")
    .withIndex("by_actor_artifact", (q) =>
      q.eq("actor", authorization.actor._id).eq("artifactId", a.artifactId),
    )
    .take(30);
  const same = previous.find(
    (row) =>
      row.origin === "service" && row.organizationId === a.organizationId,
  );
  if (same?.origin === "service") {
    const source = await ctx.db.get(same.sourceId);
    ensure(
      source &&
        source.organizationId === a.organizationId &&
        source.state !== "deleted" &&
        source.publicImportId === same._id &&
        same.compatibilityKey === a.expectedCompatibilityKey,
      "SOURCE_UNAVAILABLE",
      "The removed saved source cannot be recreated.",
    );
    if (!same.snapshot)
      await ctx.db.patch(same._id, {
        snapshot: await serviceArtifactSnapshot(base),
        updatedAt: Math.max(Date.now(), same.updatedAt + 1),
      });
    return {
      sourceId: source._id,
      reused: true as const,
      chargedCredits: 0,
      processingStarted: false,
    };
  }
  const sourceId = await captureAuthorized(
    ctx,
    {
      organizationId: a.organizationId,
      key: `service:${authorization.actor._id}:${a.artifactId}`,
      kind: "text",
      title: "Saved shared analysis",
      text: `Saved insight copy ${a.artifactId} for ${authorization.actor._id}.`,
      rightsAttested: true,
    },
    authorization,
    false,
    true,
  );
  const source = await ctx.db.get(sourceId);
  ensure(
    source && source.state !== "deleted" && !source.publicImportId,
    "SOURCE_UNAVAILABLE",
    "This saved source is unavailable.",
  );
  const now = Date.now();
  const layerId = await ctx.db.insert("publicImports", {
    origin: "service",
    organizationId: a.organizationId,
    actor: authorization.actor._id,
    sourceId,
    artifactId: a.artifactId,
    compatibilityKey: a.expectedCompatibilityKey,
    snapshot: await serviceArtifactSnapshot(base),
    privateNote: "",
    corrections: [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(sourceId, { publicImportId: layerId });
  return {
    sourceId,
    reused: true as const,
    chargedCredits: 0,
    processingStarted: false,
  };
}
export const save = mutation({
  args: importArgs,
  handler: saveServiceArtifactCore,
});
