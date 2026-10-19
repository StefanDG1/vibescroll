"use node";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { randomUUID, createHash } from "node:crypto";
import { signedObject, objectMetadata } from "../packages/providers/storage";
import { exactArrayBuffer } from "../packages/providers/binary";
import { authorizeRepository } from "./lib/githubAuthorization";
import { retrieveContext } from "../packages/providers/github";
import { knowledgeRetrievalFocus } from "../packages/repositories/retrieval";
import { ensure } from "../packages/policy";
export const frame = action({
  args: {
    id: v.id("localSourceImports"),
    frameId: v.string(),
    data: v.string(),
  },
  handler: async (ctx, a): Promise<{ assetId: string }> => {
    const c = await ctx.runQuery(internal.localLibrary.frameContext, {
      id: a.id,
      frameId: a.frameId,
    });
    return uploadLocalFrame(ctx, a, c, async (args: any) =>
      ctx.runMutation(internal.localLibrary.recordFrame, args),
    );
  },
});
export async function uploadLocalFrame(
  ctx: ActionCtx,
  a: { id: any; frameId: string; data: string },
  c: any,
  record: (args: any) => Promise<any>,
) {
  const bytes = Buffer.from(a.data, "base64");
  ensure(
    a.data.length <= 800000 &&
      bytes.length === c.frame.size &&
      bytes.length <= 600000 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes.at(-2) === 0xff &&
      bytes.at(-1) === 0xd9 &&
      createHash("sha256").update(bytes).digest("hex") === c.frame.sha256,
    "INVALID_EVIDENCE",
    "Frame bytes do not match the approved decoded evidence.",
  );
  if (c.frame.assetId) return { assetId: c.frame.assetId };
  const key = `${c.run.organizationId}/local-${randomUUID()}`;
  try {
    const response = await fetch(signedObject(key, "PUT", 120), {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: exactArrayBuffer(bytes),
      signal: AbortSignal.timeout(30000),
    });
    ensure(
      response.ok,
      "STORAGE_UNAVAILABLE",
      "Private frame storage unavailable.",
    );
    const meta = await objectMetadata(key);
    ensure(
      meta.size === bytes.length && meta.type === "image/jpeg",
      "INVALID_EVIDENCE",
      "Private storage changed frame metadata.",
    );
    const assetId = await ctx.runMutation(internal.assets.registerEvidence, {
      sourceId: c.s._id,
      generation: c.s.generation,
      key,
      size: meta.size,
      etag: meta.etag ?? "",
    });
    ensure(
      assetId,
      "APPROVAL_STALE",
      "Source changed before frame registration.",
    );
    await record({
      id: a.id,
      frameId: a.frameId,
      assetId,
      sha256: c.frame.sha256,
    });
    return { assetId };
  } catch (error) {
    await ctx.runMutation(internal.assets.queueEvidenceDeletion, { key });
    throw error;
  }
}
export const evaluationBundle = action({
  args: {
    runId: v.id("localLibraryRuns"),
    topicId: v.id("knowledgeTopics"),
    repositoryId: v.id("repositories"),
    cursor: v.optional(v.string()),
    members: v.optional(v.array(v.id("knowledgeMembers"))),
  },
  handler: async (ctx, a): Promise<any> => {
    const c = await ctx.runMutation(api.localLibrary.evaluationPrepare, a);
    return localEvaluationBundle(ctx, c, async (args: any) =>
      ctx.runMutation(internal.localLibrary.recordInspection, args),
    );
  },
});
export async function localEvaluationBundle(
  ctx: ActionCtx,
  c: any,
  record: (args: any) => Promise<any>,
) {
  if (c.cached) return { id: c.id, cached: true, next: c.next };
  await authorizeRepository(ctx, c.repo, c.repo.sha);
  const inspected = await retrieveContext(
    c.repo,
    knowledgeRetrievalFocus(
      c.repo.profile,
      c.evidence.map((e: any) => ({
        title: e.insight.title,
        claim: e.insight.claim,
        interpretation: e.insight.interpretation,
      })),
    ),
    [],
    "knowledge",
  );
  await authorizeRepository(ctx, c.repo, c.repo.sha);
  await record({
    id: c.id,
    inspected: inspected.excerpts.map((e: any) => ({
      path: e.path,
      startLine: e.startLine,
      endLine: e.endLine,
    })),
  });
  return {
    id: c.id,
    cached: false,
    next: c.next,
    evidence: c.evidence,
    repository: c.repo.fullName,
    baseSha: c.repo.sha,
    profile: c.repo.profile,
    preference: c.preference,
    reviewHistory: c.reviewHistory,
    excerpts: inspected.excerpts,
    tree: inspected.tree,
    coverage:
      "Only these bounded pinned excerpts were inspected; omitted files are not claimed as reviewed.",
    inspectionVersion: "insight-first-project-context-v3",
  };
}
