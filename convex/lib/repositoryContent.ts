import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { repositoryManifest } from "./repositoryManifest";

type Content = Pick<
  Doc<"repositories">,
  "context" | "contextTree" | "contextExcerpts"
>;

export async function repositoryContent(
  ctx: QueryCtx,
  repo: Doc<"repositories"> | null,
) {
  repo = await repositoryManifest(ctx, repo);
  if (!repo || !repo.contentStored) return repo;
  const content = await ctx.db
    .query("repositoryContent")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repo._id))
    .unique();
  return content &&
    content.organizationId === repo.organizationId &&
    content.sha === repo.sha
    ? {
        ...repo,
        context: content.context,
        contextTree: content.contextTree,
        contextExcerpts: content.contextExcerpts,
      }
    : repo;
}

export async function storeRepositoryContent(
  ctx: MutationCtx,
  repo: Doc<"repositories">,
  content: Content,
) {
  const old = await ctx.db
    .query("repositoryContent")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repo._id))
    .unique();
  const fields = {
    organizationId: repo.organizationId,
    repositoryId: repo._id,
    sha: repo.sha,
    ...content,
  };
  if (old) await ctx.db.replace(old._id, fields);
  else await ctx.db.insert("repositoryContent", fields);
  await ctx.db.patch(repo._id, {
    contentStored: true,
    context: "",
    contextTree: undefined,
    contextExcerpts: undefined,
    contextEvidence: content.contextExcerpts?.map(
      ({ path, startLine, endLine }) => ({ path, startLine, endLine }),
    ),
  });
}

export async function clearRepositoryContent(
  ctx: MutationCtx,
  id: Id<"repositories">,
) {
  const old = await ctx.db
    .query("repositoryContent")
    .withIndex("by_repository", (q) => q.eq("repositoryId", id))
    .unique();
  if (old) await ctx.db.delete(old._id);
  await ctx.db.patch(id, {
    contentStored: undefined,
    contextEvidence: undefined,
  });
}
