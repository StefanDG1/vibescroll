import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { queryRead } from "./knowledgeReadContext";
import { validateEvidenceRegistry } from "../../packages/sources/evidence";

export function sourceRetained(
  retainUntil: number | undefined,
  now = Date.now(),
) {
  return (
    retainUntil === undefined ||
    (Number.isFinite(retainUntil) && retainUntil > now)
  );
}

export async function cardSourceRetained(
  ctx: QueryCtx,
  card: Doc<"dashboardCards">,
) {
  if (card.kind !== "source" || !card.sourceId) return false;
  if (card.sourceAuthorityVersion === 2)
    return sourceRetained(card.sourceRetentionUntil);
  const source = await ctx.db.get(card.sourceId);
  return (
    !!source &&
    source.organizationId === card.organizationId &&
    sourceRetained(source.sourceRetentionUntil)
  );
}

export async function retainedSourceRevision(
  ctx: QueryCtx,
  revision: Doc<"sourceRevisions">,
) {
  const source = await ctx.db.get(revision.sourceId);
  if (
    revision.state !== "current" ||
    !source ||
    source.state === "deleted" ||
    !source.rightsAttested ||
    source.organizationId !== revision.organizationId ||
    source.currentRevisionId !== revision._id ||
    source.generation !== revision.generation ||
    !sourceRetained(source.sourceRetentionUntil)
  )
    return null;
  try {
    const registry = await validateEvidenceRegistry(
      revision.revision,
      revision.evidence,
    );
    if (
      registry.revision.contentHash !== revision.contentHash ||
      registry.revision.canonical !== source.canonical ||
      (source.sourceType &&
        registry.revision.sourceType !== source.sourceType &&
        registry.revision.sourceType !== "supplied_text") ||
      !sourceRetained(registry.revision.retention?.retainUntil)
    )
      return null;
    return registry;
  } catch {
    return null;
  }
}

// Only versioned cards written by the atomic source trigger are authoritative.
// Legacy/missing cards fall back to the canonical document. Read
// each call's current transaction; never cache across a mutation or request.
export async function sourceAuthority(ctx: QueryCtx, id: Id<"sources">) {
  return queryRead(ctx, `source-authority:${id}`, async () => {
    const card = await ctx.db
      .query("dashboardCards")
      .withIndex("by_entity", (q) => q.eq("entityId", id))
      .unique();
    if (
      card?.kind === "source" &&
      card.sourceId === id &&
      card.sourceAuthorityVersion === 2 &&
      card.generation !== undefined
    )
      return {
        _id: id,
        organizationId: card.organizationId,
        state: card.state,
        generation: card.generation,
        sourceRetentionUntil: card.sourceRetentionUntil,
      };
    const source = await ctx.db.get(id);
    return source
      ? {
          _id: source._id,
          organizationId: source.organizationId,
          state: source.state,
          generation: source.generation,
          sourceRetentionUntil: source.sourceRetentionUntil,
        }
      : null;
  });
}
