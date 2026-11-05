import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { resolvePostContext } from "./lib/postContext";
import { ensure } from "../packages/policy";

export const frameContext = internalQuery({
  args: {
    profileId: v.optional(v.id("organizations")),
    sourceId: v.id("sources"),
    analysisVersionId: v.id("analysisVersions"),
    frameId: v.string(),
    expectedEvidenceHash: v.string(),
    sharedGrantId: v.optional(v.id("teamKnowledgeGrants")),
    sharedGrantVersion: v.optional(v.number()),
  },
  returns: v.object({
    key: v.string(),
    size: v.number(),
    sha256: v.string(),
    width: v.number(),
    height: v.number(),
    timestampMs: v.number(),
    frameId: v.string(),
    sourceId: v.id("sources"),
    analysisVersionId: v.id("analysisVersions"),
    evidenceHash: v.string(),
    accessBinding: v.string(),
  }),
  handler: async (ctx, args) => {
    const c = await resolvePostContext(ctx, args);
    ensure(
      args.expectedEvidenceHash === c.evidence.evidenceHash,
      "APPROVAL_STALE",
      "This retained evidence changed.",
    );
    const frame = c.evidence.frames.find(
      (entry) => entry.frameId === args.frameId,
    );
    ensure(
      frame && frame.size <= 150000,
      "SOURCE_UNAVAILABLE",
      "Choose a screenshot from this exact post context.",
    );
    return {
      key: frame.key,
      size: frame.size,
      sha256: frame.sha256,
      width: frame.width,
      height: frame.height,
      timestampMs: frame.timestampMs,
      frameId: frame.frameId,
      sourceId: c.source._id,
      analysisVersionId: c.version._id,
      evidenceHash: c.evidence.evidenceHash,
      accessBinding: JSON.stringify([
        c.organization._id,
        c.actor._id,
        c.grant._id,
        c.grant.version,
        c.sharedVersion,
        c.source.generation,
        c.source.updatedAt,
        c.version.outputHash,
      ]),
    };
  },
});
