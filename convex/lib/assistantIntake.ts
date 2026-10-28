import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensure } from "../../packages/policy";
import {
  assistantClients,
  assistantGrantActive,
} from "../../packages/policy/assistant";
import { workspaceReadable } from "./workspacePrivacy";
import { personalAllowed } from "./personalAccess";
import { snapshotScopeCurrent } from "../../packages/repositories/scope";
import { sourceWithinAssistantScope } from "./assistantSourceScope";
import { hostedMediaAllowed } from "./hostedMediaAccess";
import { googleConfigured } from "../../packages/providers/google-inference";
import { taskBindingsCurrent } from "./localTaskAuthority";

export function intakeNeedsSourceReview(source: Doc<"sources">) {
  return (
    !!source.currentRevisionId ||
    source.analysis?.schemaVersion === "2.0.0" ||
    source.sourceType === "github_repository" ||
    source.sourceType === "reddit_thread"
  );
}

export async function intakeAuthority(
  ctx: QueryCtx,
  intake: Doc<"assistantIntakes">,
  options: { allowSourceReview?: boolean } = {},
) {
  const grant = await ctx.db.get(intake.grantId);
  const actor = await ctx.db.get(intake.actor);
  const organization = await ctx.db.get(intake.organizationId);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", intake.organizationId).eq("userId", intake.actor),
    )
    .unique();
  const client = assistantClients().find((c) => c.id === intake.clientId);
  ensure(
    process.env.MCP_ENABLED === "true" &&
      process.env.RESTORE_LOCK !== "true" &&
      grant &&
      assistantGrantActive(grant, Date.now()) &&
      grant.version === intake.grantVersion &&
      grant.actor === intake.actor &&
      grant.organizationId === intake.organizationId &&
      grant.clientId === intake.clientId &&
      grant.intakePolicy === "explicit_links" &&
      grant.scopes.includes("analysis:request") &&
      client?.scopes.includes("analysis:request") &&
      actor?.status === "active" &&
      workspaceReadable(organization, actor._id) &&
      membership &&
      ["owner", "admin"].includes(membership.role),
    "APPROVAL_STALE",
    "Assistant processing preferences or access changed. Review Connections.",
  );
  const source = await ctx.db.get(intake.sourceId);
  ensure(
    await sourceWithinAssistantScope(
      ctx,
      grant,
      organization!,
      actor._id,
      source,
    ),
    "FORBIDDEN",
    "This source is outside the current permitted library scope.",
  );
  ensure(
    options.allowSourceReview || (source && !intakeNeedsSourceReview(source)),
    "SOURCE_REVIEW_REQUIRED",
    "Review typed source retrieval, analysis and project work in the source page. Media defaults do not apply.",
  );
  return { grant, actor, organization: organization! };
}

export async function validateLocalRun(
  ctx: QueryCtx,
  run: Doc<"localLibraryRuns">,
  actorId: Id<"users">,
) {
  if (run.task) {
    await taskBindingsCurrent(ctx, run, actorId);
    return null;
  }
  const intake = run.assistantIntakeId
    ? await ctx.db.get(run.assistantIntakeId)
    : null;
  ensure(
    intake &&
      intake.actor === actorId &&
      intake.runId === run._id &&
      intake.queueState === "local" &&
      run.assistantGrantVersion === intake.grantVersion,
    "APPROVAL_STALE",
    "Local assistant work is no longer active.",
  );
  const authority = await intakeAuthority(ctx, intake);
  await checkProjectBindings(ctx, authority.grant, run.repositories);
  const device = intake.deviceId ? await ctx.db.get(intake.deviceId) : null;
  ensure(
    authority.grant.analysisDefaults?.enabled &&
      device?.state === "paired" &&
      device.owner === actorId &&
      device.organizationId === run.organizationId &&
      device.assistantProfileBinding ===
        authority.grant.analysisDefaults.profileBinding &&
      personalAllowed(authority.actor.subject),
    "APPROVAL_STALE",
    "The paired account or computer changed.",
  );
  return intake;
}
export async function checkProjectBindings(
  ctx: QueryCtx,
  grant: Doc<"assistantGrants">,
  repositories: Id<"repositories">[],
) {
  for (const id of repositories) {
    const binding = grant.repositories?.find((r) => r.repositoryId === id);
    const repo = await ctx.db.get(id);
    ensure(
      binding &&
        repo?.organizationId === grant.organizationId &&
        repo.enabled &&
        repo.confirmed &&
        snapshotScopeCurrent(repo) &&
        repo.sha === binding.baseSha &&
        repo.profileVersion === binding.profileVersion &&
        (repo.selectionVersion ?? 0) === binding.selectionVersion,
      "CONTEXT_REQUIRED",
      "Selected project context changed. Review Connections before evaluating.",
    );
  }
}

export async function chooseIntakeProjects(
  ctx: QueryCtx,
  grant: Doc<"assistantGrants">,
  project?: string,
  bestProjects = false,
) {
  ensure(
    !project || !bestProjects,
    "INVALID_INPUT",
    "Choose a named project or best matches.",
  );
  if (!project && !bestProjects) return [];
  ensure(
    grant.scopes.includes("context:read"),
    "CONTEXT_REQUIRED",
    "Approve project context in Connections first.",
  );
  const eligible: Doc<"repositories">[] = [];
  for (const binding of grant.repositories ?? []) {
    const repo = await ctx.db.get(binding.repositoryId);
    if (
      repo?.organizationId === grant.organizationId &&
      repo.enabled &&
      repo.confirmed &&
      snapshotScopeCurrent(repo) &&
      repo.sha === binding.baseSha &&
      repo.profileVersion === binding.profileVersion &&
      (repo.selectionVersion ?? 0) === binding.selectionVersion
    )
      eligible.push(repo);
  }
  if (project) {
    const name = project.trim().toLowerCase();
    const exact = eligible.filter(
      (r) => r._id === project || r.fullName.toLowerCase() === name,
    );
    const matches = exact.length
      ? exact
      : eligible.filter(
          (r) => r.fullName.split("/").at(-1)?.toLowerCase() === name,
        );
    ensure(
      matches.length === 1,
      "CONTEXT_REQUIRED",
      "Name one unambiguous approved current project, or review Connections.",
    );
    return [matches[0]._id];
  }
  ensure(
    eligible.length > 0,
    "CONTEXT_REQUIRED",
    "Select current project context in Connections first.",
  );
  return eligible.map((r) => r._id);
}

export async function enqueueIntake(
  ctx: MutationCtx,
  intake: Doc<"assistantIntakes">,
  repositories: Id<"repositories">[] = [],
) {
  const { grant, actor } = await intakeAuthority(ctx, intake);
  const settings = grant.analysisDefaults;
  ensure(
    settings?.enabled && personalAllowed(actor.subject),
    "SETUP_REQUIRED",
    "Enable automatic local analysis in Connections.",
  );
  const source = await ctx.db.get(intake.sourceId);
  const device = await ctx.db.get(settings.deviceId);
  ensure(
    source &&
      source.state !== "deleted" &&
      device?.state === "paired" &&
      device.owner === actor._id &&
      device.organizationId === source.organizationId &&
      device.assistantProfileBinding === settings.profileBinding,
    "SETUP_REQUIRED",
    "Reconnect the selected computer and account.",
  );
  const oldRun = intake.runId ? await ctx.db.get(intake.runId) : null;
  const expiredLocal =
    intake.queueState === "local" &&
    (!oldRun || oldRun.expiresAt <= Date.now() || oldRun.state !== "active");
  if (
    !expiredLocal &&
    ["waiting", "local", "credits"].includes(intake.queueState ?? "")
  ) {
    if (repositories.length)
      await ctx.db.patch(
        intake._id,
        intake.queueState === "local"
          ? {
              queuedRepositories: repositories,
              projectRequest: true,
              updatedAt: Date.now(),
            }
          : { repositories, projectRequest: true, updatedAt: Date.now() },
      );
    return;
  }
  if (source.state === "ready" && !repositories.length) return;
  ensure(
    !["processing", "queued"].includes(source.state),
    "SOURCE_BUSY",
    "This source already has active work.",
  );
  await ctx.db.patch(intake._id, {
    queueState: "waiting",
    deviceId: device._id,
    repositories,
    projectRequest: repositories.length > 0,
    generation: source.generation,
    revision: source.updatedAt,
    error: undefined,
    runId: undefined,
    queuedRepositories: undefined,
    updatedAt: Date.now(),
  });
  if (!device.assistantPending)
    await ctx.db.patch(device._id, { assistantPending: true });
}

export async function creditBalance(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  const pools = await ctx.db
    .query("creditPools")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .take(101);
  ensure(
    pools.length <= 100,
    "BALANCE_UNAVAILABLE",
    "Review the current balance in Usage.",
  );
  const now = Date.now();
  const valid = pools.filter(
    (p) => p.expiresAt === undefined || p.expiresAt > now,
  );
  if (!pools.length) {
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .unique();
    const total =
      wallet?.tier === "trial" && wallet.periodEnd > now ? wallet.granted : 0;
    return {
      available: Math.max(
        0,
        total - (wallet?.spent ?? 0) - (wallet?.reserved ?? 0),
      ),
      total,
      reserved: wallet?.reserved ?? 0,
      observed_at: now,
      unit: "VibeScroll processing credits",
    };
  }
  return {
    total: valid.reduce(
      (n, p) => n + Math.max(0, p.granted - (p.revoked ?? 0)),
      0,
    ),
    available: valid.reduce(
      (n, p) =>
        n + Math.max(0, p.granted - (p.revoked ?? 0) - p.spent - p.reserved),
      0,
    ),
    reserved: valid.reduce((n, p) => n + p.reserved, 0),
    observed_at: now,
    unit: "VibeScroll processing credits",
  };
}

export async function intakeReceipt(
  ctx: QueryCtx,
  intake: Doc<"assistantIntakes">,
  source: Doc<"sources">,
) {
  const generation = intake.analysisGeneration ?? source.generation;
  const sourceReview = intakeNeedsSourceReview(source);
  const reviewUrl = `https://scroll.companynerve.com/app/${source.organizationId}/posts/${source._id}`;
  const reservations = (
    await Promise.all(
      [
        `source:${source._id}:${generation}`,
        `personal-media:${source._id}:${generation}`,
      ].map((key) =>
        ctx.db
          .query("reservations")
          .withIndex("by_key", (q) =>
            q.eq("organizationId", source.organizationId).eq("key", key),
          )
          .unique(),
      ),
    )
  ).filter((r) => r !== null);
  const holds = reservations.filter((r) => r.state === "active");
  const completed = source.state === "ready";
  const local = intake.runId ? await ctx.db.get(intake.runId) : null;
  const localComplete =
    source.localAnalysisReceipt?.runId === intake.runId && completed;
  const localExpired =
    intake.queueState === "local" &&
    (!local || local.expiresAt <= Date.now() || local.state !== "active") &&
    !localComplete;
  const actor = await ctx.db.get(intake.actor);
  const creditRouteAvailable =
    actor &&
    hostedMediaAllowed(actor.subject) &&
    process.env.ACQUISITION_VERIFIED === "true" &&
    process.env.MEDIA_VERIFIED === "true" &&
    (process.env.MANAGED_INFERENCE_ROUTE === "cloudflare_free" ||
      (process.env.MANAGED_INFERENCE_ROUTE === "google_metered" &&
        googleConfigured()));
  return {
    source_id: source._id,
    generation: source.generation,
    status:
      sourceReview && !intake.queueState && !completed
        ? "source_review_required"
        : intake.queueState === "waiting"
          ? "waiting_for_computer"
          : ["failed", "cancelled"].includes(intake.queueState ?? "")
            ? intake.queueState
            : localExpired
              ? "needs_review"
              : intake.queueState === "local" && !localComplete
                ? "processing_locally"
                : source.state,
    processing_succeeded:
      completed && (intake.queueState !== "local" || localComplete),
    error:
      intake.error ??
      (localExpired
        ? "The local session ended. Review the source and ChatGPT usage before requesting another run."
        : undefined) ??
      (source.state === "failed"
        ? "Processing failed. Review the source before retrying."
        : undefined),
    balance: await creditBalance(ctx, source.organizationId),
    credits: {
      state: holds.length
        ? "reserved_or_reconciling"
        : reservations.length
          ? "settled"
          : localComplete
            ? "settled"
            : "not_charged",
      reserved: holds.reduce((n, r) => n + r.max, 0),
      actual_used: holds.length
        ? null
        : reservations.reduce((n, r) => n + r.settled, 0),
    },
    credit_offer:
      !sourceReview &&
      creditRouteAvailable &&
      intake.queueState === "waiting" &&
      source.state !== "ready"
        ? {
            max_credits: 10,
            generation: source.generation,
            instruction:
              "Keep waiting, or explicitly ask to run this source now using up to 10 VibeScroll credits.",
          }
        : null,
    credit_route_note:
      !sourceReview && intake.queueState === "waiting" && !creditRouteAvailable
        ? "Cloud credits are unavailable for this account or source route. Your link will keep waiting for the local computer."
        : null,
    project_evaluation_requested: intake.projectRequest ?? false,
    project_status:
      local?.state === "active" && intake.projectRequest
        ? "pending"
        : intake.projectRequest
          ? intake.queueState
          : "not_requested",
    follow_up: sourceReview
      ? "Open this source in VibeScroll to review current evidence and separately approve retrieval, analysis or project work."
      : completed && !intake.projectRequest
        ? "Want to check how these insights apply to a project? Name one, or say find the best project matches."
        : null,
    source_review_required: sourceReview,
    review_url: sourceReview ? reviewUrl : null,
    url: reviewUrl,
  };
}
