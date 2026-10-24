import { workspaceReadable } from "./lib/workspacePrivacy";
import { repositoryContent } from "./lib/repositoryContent";
import { validateInspectedContext } from "../packages/repositories/retrieval";
import {
  inspectedContextValidator,
  inspectionManifestValidator,
} from "../packages/repositories/context";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { writeAccess, fail } from "./lib";
import {
  ensure,
  containsSecret,
  safePath,
  validatePaths,
} from "../packages/policy";
import { planInput } from "../packages/contracts";
import { reserve, settle } from "./product";
import { validateGeneratedPackageChecks } from "../packages/plans/repository-checks";
import { improvementCurrent } from "./lib/improvementContext";
import type { Doc } from "./_generated/dataModel";
export function validateDraftPlan(
  raw: unknown,
  repo: Pick<Doc<"repositories">, "manifest" | "contextExcerpts">,
  inspectedContext?: any[],
  inspectionManifest?: any[],
) {
  if (inspectedContext)
    validateInspectedContext(inspectedContext, inspectionManifest ?? []);
  const plan = planInput.parse(raw);
  validateGeneratedPackageChecks(
    plan.tests,
    inspectedContext ?? repo.contextExcerpts ?? [],
  );
  validatePaths(
    plan.files.map((f) => f.path),
    plan.files.map((f) => f.path),
    true,
  );
  ensure(
    !containsSecret(JSON.stringify(plan)) &&
      plan.files.every(
        (f) =>
          safePath(f.path) &&
          (f.isNew
            ? !repo.manifest.includes(f.path)
            : (inspectedContext ?? repo.contextExcerpts)?.some(
                (e) => e.path === f.path,
              )),
      ),
    "INVALID_EVIDENCE",
    "A generated plan must use inspected existing files or explicitly new safe paths.",
  );
  return plan;
}
export const start = mutation({
  args: {
    id: v.id("proposals"),
    version: v.number(),
    maxCredits: v.number(),
    key: v.string(),
  },
  handler: async (ctx, a) => {
    const proposal = await ctx.db.get(a.id);
    if (!proposal) fail("Proposal unavailable.");
    const { actor } = await writeAccess(ctx, proposal.organizationId);
    ensure(
      await improvementCurrent(ctx, proposal),
      "APPROVAL_STALE",
      "Improvement evidence changed before planning.",
    );
    const repo = await repositoryContent(
        ctx,
        await ctx.db.get(proposal.repositoryId),
      ),
      source = await ctx.db.get(proposal.sourceId);
    ensure(
      repo?.organizationId === proposal.organizationId &&
        source?.organizationId === proposal.organizationId,
      "FORBIDDEN",
      "Proposal context unavailable.",
    );
    ensure(
      proposal.review === "accepted" &&
        proposal.version === a.version &&
        repo?.enabled &&
        repo.confirmed &&
        repo.sha === proposal.baseSha &&
        repo.profileVersion === proposal.profileVersion &&
        source &&
        source.state !== "deleted",
      "APPROVAL_STALE",
      "Accept the current proposal and refresh its evidence before drafting a plan.",
    );
    ensure(
      a.maxCredits === 10 && /^[a-zA-Z0-9_-]{12,80}$/.test(a.key),
      "QUOTE_CHANGED",
      "Review the 10-credit plan quote.",
    );
    if (proposal.planDraft && proposal.planDraftVersion === proposal.version)
      return { cached: true, proposal, repo, key: "" };
    ensure(
      !proposal.planDraftKey && !proposal.localPlanRunId,
      "SOURCE_BUSY",
      "A plan draft is already pending. Interrupted usage needs reconciliation.",
    );
    const key = `plan:${proposal._id}:${a.key}`;
    await reserve(ctx, proposal.organizationId, key, 10);
    await ctx.db.patch(proposal._id, {
      planDraftKey: key,
      planDraftActor: actor._id,
    });
    return { cached: false, proposal, repo, key };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("proposals"),
    organizationId: v.id("organizations"),
    key: v.string(),
    version: v.number(),
    baseSha: v.string(),
    plan: v.optional(v.any()),
    inspectedContext: v.optional(inspectedContextValidator),
    inspectionManifest: v.optional(inspectionManifestValidator),
    credits: v.number(),
    retainReservation: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const proposal = await ctx.db.get(a.id);
    // Source deletion removes the proposal. Settle known usage without reviving it.
    if (!proposal) {
      if (!a.retainReservation)
        await settle(ctx, a.organizationId, a.key, a.credits);
      return;
    }
    if (
      proposal.organizationId !== a.organizationId ||
      proposal.planDraftKey !== a.key
    )
      return;
    ensure(
      Number.isSafeInteger(a.credits) && a.credits >= 0 && a.credits <= 10,
      "BUDGET_EXCEEDED",
      "Plan usage exceeds its quote.",
    );
    const repo = await repositoryContent(
        ctx,
        await ctx.db.get(proposal.repositoryId),
      ),
      source = await ctx.db.get(proposal.sourceId);
    const actor =
      proposal.planDraftActor && (await ctx.db.get(proposal.planDraftActor));
    const membership =
      actor &&
      (await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q
            .eq("organizationId", proposal.organizationId)
            .eq("userId", actor._id),
        )
        .unique());
    const organization = await ctx.db.get(proposal.organizationId);
    const valid =
      (await improvementCurrent(ctx, proposal)) &&
      proposal.review === "accepted" &&
      proposal.version === a.version &&
      repo?.organizationId === proposal.organizationId &&
      source?.organizationId === proposal.organizationId &&
      repo?.enabled &&
      repo.confirmed &&
      repo.sha === a.baseSha &&
      repo.sha === proposal.baseSha &&
      repo.profileVersion === proposal.profileVersion &&
      source &&
      source.state !== "deleted" &&
      actor?.status === "active" &&
      workspaceReadable(organization, actor._id) &&
      membership &&
      ["owner", "admin", "member"].includes(membership.role);
    let plan;
    if (a.plan && valid) {
      plan = validateDraftPlan(
        a.plan,
        repo,
        a.inspectedContext,
        a.inspectionManifest ?? repo.manifestEntries ?? [],
      );
    }
    if (!a.retainReservation)
      await settle(ctx, proposal.organizationId, a.key, a.credits);
    await ctx.db.patch(proposal._id, {
      planDraftKey: undefined,
      planDraftActor: undefined,
      ...(plan ? { planDraft: plan, planDraftVersion: proposal.version } : {}),
    });
  },
});
