import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { assistantGrant } from "./assistantPrincipal";
import { ensure, containsSecret } from "../../packages/policy";
import { snapshotScopeCurrent } from "../../packages/repositories/scope";
export async function currentPlanningProject(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  id: Id<"repositories">,
) {
  const repository = await ctx.db.get(id);
  ensure(
    repository &&
      repository.organizationId === organizationId &&
      repository.enabled &&
      repository.confirmed &&
      snapshotScopeCurrent(repository) &&
      repository.profile.length <= 8000 &&
      !containsSecret(repository.profile),
    "APPROVAL_STALE",
    "Review the current project context and snapshot before planning.",
  );
  return repository;
}

export async function assistantProject(
  ctx: QueryCtx,
  a: Awaited<ReturnType<typeof assistantGrant>>,
  id: Id<"repositories">,
) {
  const binding = a.grant.repositories?.find((r) => r.repositoryId === id);
  const repository = await currentPlanningProject(ctx, a.organization._id, id);
  ensure(
    (binding || a.grant.contextScope === "all_confirmed") &&
      (a.grant.contextScope === "all_confirmed" ||
        (binding &&
          repository.sha === binding.baseSha &&
          repository.profileVersion === binding.profileVersion &&
          (repository.selectionVersion ?? 0) === binding.selectionVersion)),
    "APPROVAL_STALE",
    "Review the current selected project context and snapshot before using it in your assistant.",
  );
  return repository;
}
