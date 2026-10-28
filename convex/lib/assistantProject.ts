import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { assistantGrant } from "./assistantPrincipal";
import { ensure, containsSecret } from "../../packages/policy";
import { snapshotScopeCurrent } from "../../packages/repositories/scope";
export async function assistantProject(
  ctx: QueryCtx,
  a: Awaited<ReturnType<typeof assistantGrant>>,
  id: Id<"repositories">,
) {
  const binding = a.grant.repositories?.find((r) => r.repositoryId === id);
  const repository = await ctx.db.get(id);
  ensure(
    (binding || a.grant.contextScope === "all_confirmed") &&
      repository &&
      repository.organizationId === a.organization._id &&
      repository.enabled &&
      repository.confirmed &&
      snapshotScopeCurrent(repository) &&
      (a.grant.contextScope === "all_confirmed" ||
        (binding &&
          repository.sha === binding.baseSha &&
          repository.profileVersion === binding.profileVersion &&
          (repository.selectionVersion ?? 0) === binding.selectionVersion)) &&
      repository.profile.length <= 8000 &&
      !containsSecret(repository.profile),
    "APPROVAL_STALE",
    "Review the current selected project context and snapshot before using it in your assistant.",
  );
  return repository;
}
