import { resultRetained } from "../../packages/contracts/result-retention";
import type { MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { queueDeletion } from "../assets";
import { internal } from "../_generated/api";
import { cloudArtifact } from "./cloudCatalog";

export async function withdrawCatalogContribution(
  ctx: MutationCtx,
  row: Doc<"catalogContributions">,
) {
  if (row.state === "withdrawn") return;
  await ctx.db.patch(row._id, { state: "withdrawn", updatedAt: Date.now() });
  const independent = await ctx.db
    .query("catalogContributions")
    .withIndex("by_artifact_retention", (q) =>
      q.eq("artifactId", row.artifactId).eq("state", "published"),
    )
    .take(201);
  if (independent.length < 201 && !independent.some((c) => resultRetained(c)))
    await retireCloudArtifact(ctx, row.artifactId);
}

export async function retireCloudArtifact(
  ctx: MutationCtx,
  id: Id<"publicArtifacts">,
) {
  const artifact = await ctx.db.get(id);
  if (!cloudArtifact(artifact)) return;
  if (artifact.state === "blocked" && !artifact.copyTokenHash) return;
  const evidence = await ctx.db.get(artifact.evidenceId),
    version = await ctx.db.get(artifact.versionId),
    family = await ctx.db.get(artifact.familyId);
  await ctx.db.patch(artifact._id, {
    state: "blocked",
    compatibilityKey: `${artifact.compatibilityKey}:blocked:${artifact._id}`,
    copyTokenHash: undefined,
    copyExpiresAt: undefined,
    updatedAt: Date.now(),
  });
  if (version)
    await ctx.db.patch(version._id, {
      state: "removed",
      output: undefined,
      summary: "",
      insightCount: 0,
    });
  let sharedReference = false;
  if (family && evidence)
    for (const member of family.members) {
      if (
        member.artifactId === artifact._id ||
        member.evidenceId !== evidence._id
      )
        continue;
      const peer = await ctx.db.get(member.artifactId);
      if (
        cloudArtifact(peer) &&
        peer.state === "eligible" &&
        resultRetained(peer)
      ) {
        sharedReference = true;
        break;
      }
    }
  if (evidence && !sharedReference) {
    for (const frame of evidence.frames) await queueDeletion(ctx, frame.key);
    await ctx.db.patch(evidence._id, {
      state: "removed",
      retainUntil: Math.min(evidence.retainUntil, Date.now()),
      resultRetention: undefined,
      frames: [],
      prepared: { removed: true },
    });
    await ctx.scheduler.runAfter(0, internal.analysisVersions.expireEvidence, {
      evidenceId: evidence._id,
    });
  }
  if (family?.selectedArtifactId === artifact._id)
    await ctx.db.patch(family._id, {
      selectedArtifactId: undefined,
      selectionRevision: family.selectionRevision + 1,
      updatedAt: Date.now(),
    });
}
