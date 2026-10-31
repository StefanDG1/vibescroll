import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { z } from "zod";
import { access } from "../lib";
import { assistantGrant } from "./assistantPrincipal";
import { readAuthorized } from "../assistantProposals";
import { isAssistantIdentity } from "../../packages/policy/assistant";
import { ensure, containsSecret } from "../../packages/policy";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { socialHash } from "../../packages/social/contracts";
import { proposalPlanTariff } from "../../packages/contracts/proposal-loop";
import { preparedServiceConfiguration } from "./preparedServicePolicy";

export async function proposalPrincipal(
  ctx: QueryCtx,
  id: Id<"proposals">,
  write = false,
) {
  const proposal = await ctx.db.get(id);
  ensure(proposal, "FORBIDDEN", "Proposal unavailable.");
  const identity = await ctx.auth.getUserIdentity();
  const assistant = isAssistantIdentity(identity);
  const principal = assistant
    ? await assistantGrant(
        ctx,
        proposal.organizationId,
        write ? "suggestions:draft" : "knowledge:read",
      )
    : {
        ...(await access(
          ctx,
          proposal.organizationId,
          write ? ["owner", "admin"] : undefined,
        )),
        client: { id: "vibescroll_web" },
      };
  if (write)
    ensure(
      ["owner", "admin"].includes(principal.membership.role),
      "FORBIDDEN",
      "This role cannot edit project proposals.",
    );
  const read = await readAuthorized(ctx, proposal);
  return { ...principal, ...read, proposal, assistant };
}
export function currentProposal(
  p: Awaited<ReturnType<typeof proposalPrincipal>>,
) {
  const b = p.detail._chat.binding;
  return (
    p.proposal.baseSha === p.context.project.baseSha &&
    p.proposal.profileVersion === p.context.project.profileVersion &&
    b.selectionVersion === p.context.project.selectionVersion &&
    b.sourceGeneration === p.context.source.generation &&
    b.sourceRevision === p.context.source.sourceRevision
  );
}
export const safeProposalText = (text: string) =>
  !containsSecret(text) &&
  !/(?:X-Amz-|X-Goog-|[?&](?:token|sig|signature|key)=|\/api\/evidence\/|data:image)/i.test(
    text,
  );
export const proposalHash = (value: unknown) =>
  socialHash(canonicalJson(value));

export async function proposalOperation(
  ctx: QueryCtx,
  proposalId: Id<"proposals">,
  kind: "message" | "generation" | "issue",
  key: string,
) {
  return ctx.db
    .query("proposalOperations")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("kind", kind).eq("key", key),
    )
    .unique();
}
export async function proposalFunding(
  ctx: QueryCtx,
  p: Awaited<ReturnType<typeof proposalPrincipal>>,
) {
  const candidates = await ctx.db
    .query("organizations")
    .withIndex("by_private_owner", (q) => q.eq("privateOwnerId", p.actor._id))
    .take(2);
  const personal = candidates.find((o) => o.status === "active");
  if (personal) {
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", personal._id).eq("userId", p.actor._id),
      )
      .unique();
    ensure(
      member?.role === "owner",
      "PERSONAL_FUNDING_REQUIRED",
      "Your personal credit account is unavailable.",
    );
    return personal._id;
  }
  const legacy = preparedServiceConfiguration(p.actor.subject, true);
  ensure(
    legacy?.legacyOwnerFundingOrganizationId === p.proposal.organizationId &&
      p.organization.createdBy === p.actor._id &&
      p.organization.memberSubscriptionPolicy !== "individual_pro_v1",
    "PERSONAL_FUNDING_REQUIRED",
    "Use your personal credit account for project planning.",
  );
  return p.proposal.organizationId;
}
const serviceConfiguration = z.strictObject({
  version: z.literal("proposal-service-v1"),
  id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  enabled: z.literal(true),
  subjects: z
    .array(z.string().regex(/^user_[A-Za-z0-9]{20,80}$/))
    .min(1)
    .max(100),
  model: z.literal(proposalPlanTariff.model),
  maximumApiUsd: z.literal(proposalPlanTariff.maximumApiUsd),
  maximumTotalJobs: z.number().int().positive().max(1000),
  privateProjectContextAllowed: z.literal(true),
  permissionReference: z.string().min(10).max(2000),
});
export function proposalServiceAllowed(subject: string) {
  let parsed;
  try {
    parsed = serviceConfiguration.safeParse(
      JSON.parse(process.env.PROPOSAL_SERVICE_CONFIGURATION_JSON ?? "null"),
    );
  } catch {
    parsed = null;
  }
  ensure(
    parsed?.success &&
      parsed.data.subjects.includes(subject) &&
      process.env.RESTORE_LOCK !== "true",
    "SETUP_REQUIRED",
    "Credit-funded plan generation is not enabled for this account yet.",
  );
  return parsed.data;
}
export async function proposalQuote(
  ctx: QueryCtx,
  p: Awaited<ReturnType<typeof proposalPrincipal>>,
) {
  ensure(
    currentProposal(p),
    "APPROVAL_STALE",
    "Refresh the project and source context before planning.",
  );
  proposalServiceAllowed(p.actor.subject);
  const fundingOrganizationId = await proposalFunding(ctx, p);
  const binding = {
    proposalId: p.proposal._id,
    version: p.proposal.version,
    contextHash: p.context.contextHash,
    discussionRevision: p.detail.work?.revision ?? 0,
    fundingOrganizationId,
    tariff: proposalPlanTariff.version,
    actorId: p.actor._id,
    expiresAt: Math.floor(Date.now() / 600000) * 600000 + 600000,
  };
  return {
    ...binding,
    quoteId: await proposalHash(binding),
    maximumCredits: proposalPlanTariff.maximumCredits,
    model: proposalPlanTariff.model,
    maximumApiUsd: proposalPlanTariff.maximumApiUsd,
  };
}

/** Deliberate field replacement leaves historical agent messages and handoff intact. */
export async function patchProposalWork(
  ctx: MutationCtx,
  p: Awaited<ReturnType<typeof proposalPrincipal>>,
  work: NonNullable<typeof p.detail.work>,
) {
  await ctx.db.patch(p.proposal._id, {
    detail: { ...p.detail, work },
    updatedAt: Date.now(),
  });
}
