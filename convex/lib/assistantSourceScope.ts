import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { sourceRetained } from "./sourceAuthority";
import { sharedTypedCitations } from "./sourceCitations";

/** Call only after the current actor, membership and grant have been authorized. */
export async function sourceWithinAssistantScope(
  ctx: QueryCtx,
  grant: Doc<"assistantGrants">,
  organization: Doc<"organizations">,
  actor: Id<"users">,
  source: Doc<"sources"> | null,
  checkRevision = true,
) {
  if (
    !source ||
    source.organizationId !== organization._id ||
    source.state === "deleted" ||
    !source.rightsAttested ||
    !sourceRetained(source)
  )
    return false;
  let granted = grant.libraryScope === "all";
  if (grant.libraryScope && grant.libraryScope !== "all") {
    if (organization.privateOwnerId !== actor) return false;
    const rows = await ctx.db
      .query("sourceSpaces")
      .withIndex("by_source", (q) => q.eq("sourceId", source._id))
      .take(3);
    granted = rows.some(
      (row) =>
        row.organizationId === organization._id &&
        row.actor === actor &&
        row.space === grant.libraryScope,
    );
  } else if (!grant.libraryScope)
    granted = grant.sources.some(
      (ref) =>
        ref.sourceId === source._id &&
        ref.generation === source.generation &&
        (!checkRevision || ref.revision === source.updatedAt),
    );
  if (!granted) return false;
  try {
    await sharedTypedCitations(ctx, source);
    return true;
  } catch {
    return false;
  }
}
