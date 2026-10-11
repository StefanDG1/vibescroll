import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ensure } from "../../packages/policy";

type Manifest = Pick<Doc<"repositories">, "manifest" | "manifestEntries">;

// Full paths are needed for snapshot reuse and evidence checks, not ordinary
// list/currentness/PR-status reads. Bind side data to the exact workspace/SHA.
export async function repositoryManifest(
  ctx: QueryCtx,
  repo: Doc<"repositories"> | null,
) {
  if (!repo?.manifestStored) return repo;
  const stored = await ctx.db
    .query("repositoryManifests")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repo._id))
    .unique();
  ensure(
    stored &&
      stored.organizationId === repo.organizationId &&
      stored.sha === repo.sha,
    "INVALID_EVIDENCE",
    "Repository manifest is unavailable for this snapshot.",
  );
  return {
    ...repo,
    manifest: stored.manifest,
    manifestEntries: stored.manifestEntries,
  };
}

export async function storeRepositoryManifest(
  ctx: MutationCtx,
  repo: Doc<"repositories">,
  manifest: Manifest,
) {
  const old = await ctx.db
    .query("repositoryManifests")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repo._id))
    .unique();
  const fields = {
    organizationId: repo.organizationId,
    repositoryId: repo._id,
    sha: repo.sha,
    ...manifest,
  };
  if (old) await ctx.db.replace(old._id, fields);
  else await ctx.db.insert("repositoryManifests", fields);
  await ctx.db.patch(repo._id, {
    manifestStored: true,
    manifest: [],
    manifestEntries: undefined,
  });
}

export async function clearRepositoryManifest(
  ctx: MutationCtx,
  id: Id<"repositories">,
) {
  const old = await ctx.db
    .query("repositoryManifests")
    .withIndex("by_repository", (q) => q.eq("repositoryId", id))
    .unique();
  if (old) await ctx.db.delete(old._id);
  await ctx.db.patch(id, {
    manifestStored: undefined,
    manifest: [],
    manifestEntries: undefined,
  });
}
