import { workspaceReadable } from "./lib/workspacePrivacy";
import {
  repositoryManifest,
  storeRepositoryManifest,
  clearRepositoryManifest,
} from "./lib/repositoryManifest";
import {
  repositoryContent,
  storeRepositoryContent,
  clearRepositoryContent,
} from "./lib/repositoryContent";
import { RETRIEVAL_VERSION } from "../packages/repositories/retrieval";
import { selectedInsights } from "../packages/insights/scope";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import {
  contentExportSections,
  exportRecord,
} from "../packages/privacy/export";
import type { Doc, Id } from "./_generated/dataModel";
import { sourceRetained, retainedSourceRevision } from "./lib/sourceAuthority";
import { sourcePolicyCurrent } from "./lib/sourcePolicy";
import { sharedTypedCitations } from "./lib/sourceCitations";
import {
  editionCurrent,
  publicEdition,
  reusableArtifact,
} from "./lib/publicKnowledge";
import { internal } from "./_generated/api";
import { workflow } from "./workflows";
import { actorCurrent, referencesCurrent } from "./knowledge";
import { improvementCurrent, runPolicyCurrent } from "./lib/improvementContext";
import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, fail, writeAccess, recentAuthentication } from "./lib";
import {
  customerModels,
  customerQuote,
  currentCustomerModel,
} from "../packages/providers/customerAi";
import { ensure, validatePaths, containsSecret } from "../packages/policy";
import {
  reserve,
  settle,
  digest,
  wallet,
  currentMatchingProposal,
} from "./product";
import { repositoryAllowance } from "./lib/repositoryAllowance";
import { cloudExecutionAllowed } from "./lib/cloudAccess";
import { trialCurrent } from "./subscriptionTrials";
import {
  revertEvidenceValidator,
  revertStatusValidator,
} from "./lib/prObservation";
const org = { organizationId: v.id("organizations") };
async function approvalActive(
  ctx: import("./_generated/server").QueryCtx,
  run: import("./_generated/dataModel").Doc<"runs">,
) {
  if (process.env.RESTORE_LOCK === "true") return false;
  const organization = await ctx.db.get(run.organizationId);
  const actor = await ctx.db.get(run.approvedBy);
  const repository = await ctx.db.get(run.repositoryId);
  const proposal = await ctx.db.get(run.proposalId);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", run.organizationId).eq("userId", run.approvedBy),
    )
    .unique();
  return (
    workspaceReadable(organization, run.approvedBy) &&
    actor?.status === "active" &&
    repository?.organizationId === run.organizationId &&
    proposal?.organizationId === run.organizationId &&
    proposal.repositoryId === run.repositoryId &&
    (await improvementCurrent(ctx, proposal)) &&
    (await runPolicyCurrent(ctx, run)) &&
    !!membership &&
    ["owner", "admin", "member"].includes(membership.role)
  );
}

export const authorizeOwner = query({
  args: org,
  handler: (ctx, a) => access(ctx, a.organizationId, ["owner", "admin"]),
});
export const authorizeCredential = query({
  args: org,
  handler: async (ctx, a) => {
    const actor = await access(ctx, a.organizationId, ["owner"]);
    await recentAuthentication(ctx);
    return actor.actor._id;
  },
});
export const customerRoutes = query({
  args: org,
  handler: async (ctx, a) => {
    const { actor } = await access(ctx, a.organizationId);
    const key = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) =>
        q.eq("organizationId", a.organizationId).eq("provider", "openai"),
      )
      .unique();
    return {
      status: key?.status ?? "disconnected",
      execution: {
        localReady:
          process.env.LOCAL_ISOLATION_VERIFIED === "true" &&
          process.env.DISABLE_LOCAL !== "true",
        cloudReady: cloudExecutionAllowed(actor.subject),
        computeReservationCredits: Number(
          process.env.CLOUD_COMPUTE_RESERVE_CREDITS ?? "10000",
        ),
        creditsPerSecond: Number(process.env.SANDBOX_CREDITS_PER_SECOND ?? "1"),
      },
      models:
        key?.status === "verified"
          ? customerModels()
              .filter((m) => key.availableModels?.includes(m.id))
              .map((m) => ({ ...m, maxProviderUsdCents: customerQuote(m) }))
          : [],
    };
  },
});
export const saveRepository = internalMutation({
  args: {
    ...org,
    selectionVersion: v.optional(v.number()),
    snapshotActor: v.optional(v.id("users")),
    installationId: v.number(),
    providerId: v.number(),
    fullName: v.string(),
    sha: v.string(),
    branch: v.string(),
    manifest: v.array(v.string()),
    manifestEntries: v.optional(
      v.array(
        v.object({
          path: v.string(),
          blobSha: v.string(),
          mode: v.string(),
          size: v.number(),
        }),
      ),
    ),
    context: v.string(),
    contextTree: v.optional(v.string()),
    snapshotSummary: v.optional(v.any()),
    snapshotDelta: v.optional(v.any()),
    extractionVersion: v.optional(v.string()),
    contextFiles: v.optional(v.array(v.string())),
    contextExcerpts: v.optional(
      v.array(
        v.object({
          path: v.string(),
          startLine: v.number(),
          endLine: v.number(),
          content: v.string(),
          blobSha: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, a) => {
    const old = await ctx.db
      .query("repositories")
      .withIndex("by_provider", (q) =>
        q.eq("organizationId", a.organizationId).eq("providerId", a.providerId),
      )
      .unique();
    if (old) {
      if (a.selectionVersion !== undefined)
        ensure(
          old.enabled &&
            old.selectionVersion === a.selectionVersion &&
            !!a.snapshotActor &&
            (await actorCurrent(ctx, a.organizationId, a.snapshotActor, [
              "owner",
              "admin",
            ])),
          "APPROVAL_STALE",
          "Repository selection or access changed while preparing its snapshot.",
        );
      const {
        snapshotActor: _actor,
        context: _context,
        contextTree: _tree,
        contextExcerpts: _excerpts,
        manifest: _manifest,
        manifestEntries: _manifestEntries,
        ...fields
      } = a;
      await ctx.db.patch(old._id, {
        ...fields,
        status: "connected",
        snapshotAt: Date.now(),
        updatedAt: Date.now(),
      });
      await storeRepositoryContent(ctx, (await ctx.db.get(old._id))!, {
        context: a.context,
        contextTree: a.contextTree,
        contextExcerpts: a.contextExcerpts,
      });
      await storeRepositoryManifest(ctx, (await ctx.db.get(old._id))!, {
        manifest: a.manifest,
        manifestEntries: a.manifestEntries,
      });
      return old._id;
    }
    const entitlement = await wallet(ctx, a.organizationId);
    const connected = await ctx.db
      .query("repositories")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
    const organization = await ctx.db.get(a.organizationId);
    const owner = organization
      ? await ctx.db.get(organization.createdBy)
      : null;
    ensure(
      connected.filter((repo) => repo.enabled).length <
        repositoryAllowance(entitlement.tier, owner?.subject ?? ""),
      "REPOSITORY_LIMIT",
      "Your repository allowance is full. Disconnect a repository before adding another.",
    );
    const id = await ctx.db.insert("repositories", {
      ...(Object.fromEntries(
        Object.entries(a).filter(
          ([key]) =>
            ![
              "snapshotActor",
              "context",
              "contextTree",
              "contextExcerpts",
              "manifest",
              "manifestEntries",
            ].includes(key),
        ),
      ) as Omit<typeof a, "snapshotActor">),
      context: "",
      manifest: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      enabled: true,
      profile:
        "Describe purpose, audience, goals, constraints and non-goals before matching.",
      profileVersion: 1,
      confirmed: false,
      status: "connected",
      snapshotAt: Date.now(),
    });
    await storeRepositoryContent(ctx, (await ctx.db.get(id))!, {
      context: a.context,
      contextTree: a.contextTree,
      contextExcerpts: a.contextExcerpts,
    });
    await storeRepositoryManifest(ctx, (await ctx.db.get(id))!, {
      manifest: a.manifest,
      manifestEntries: a.manifestEntries,
    });
    return id;
  },
});
export const secret = internalQuery({
  args: { ...org, provider: v.string() },
  handler: (ctx, a) =>
    ctx.db
      .query("connections")
      .withIndex("by_provider", (q) =>
        q.eq("organizationId", a.organizationId).eq("provider", a.provider),
      )
      .unique(),
});
export const previousSnapshot = internalQuery({
  args: { ...org, providerId: v.number() },
  handler: async (ctx, a) => {
    const repo = await ctx.db
      .query("repositories")
      .withIndex("by_provider", (q) =>
        q.eq("organizationId", a.organizationId).eq("providerId", a.providerId),
      )
      .unique();
    const content = await repositoryContent(ctx, repo);
    return repo?.enabled
      ? {
          updatedAt: repo.snapshotAt ?? repo.updatedAt,
          extractionVersion: repo.extractionVersion,
          profileVersion: repo.profileVersion,
          contextExcerpts: content?.contextExcerpts,
          manifestEntries: content?.manifestEntries,
        }
      : null;
  },
});
export const rotationPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: (ctx, a) =>
    ctx.db.query("connections").paginate({ cursor: a.cursor, numItems: 25 }),
});
export const rotateCiphertext = internalMutation({
  args: {
    id: v.id("connections"),
    previous: v.string(),
    ciphertext: v.string(),
    keyVersion: v.string(),
  },
  handler: async (ctx, a) => {
    const old = await ctx.db.get(a.id);
    if (!old || old.ciphertext !== a.previous) return false;
    await ctx.db.patch(a.id, {
      ciphertext: a.ciphertext,
      keyVersion: a.keyVersion,
    });
    return true;
  },
});
export const storeSecret = internalMutation({
  args: {
    ...org,
    provider: v.string(),
    ciphertext: v.string(),
    keyVersion: v.string(),
    actorId: v.optional(v.id("users")),
  },
  handler: async (ctx, a) => {
    if (a.provider === "openai") {
      ensure(a.actorId, "FORBIDDEN", "Credential owner required.");
      const actor = await ctx.db.get(a.actorId);
      const organization = await ctx.db.get(a.organizationId);
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q.eq("organizationId", a.organizationId).eq("userId", a.actorId!),
        )
        .unique();
      ensure(
        actor?.status === "active" &&
          workspaceReadable(organization, a.actorId!) &&
          membership?.role === "owner",
        "FORBIDDEN",
        "Credential owner access changed.",
      );
      const active = await ctx.db
        .query("runs")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .collect();
      for (const run of active)
        if (
          run.fundingRoute === "customer_api_key" &&
          !["completed", "canceled", "failed"].includes(run.state)
        )
          await ctx.db.patch(run._id, {
            state: "canceled",
            generation: run.generation + 1,
            updatedAt: Date.now(),
          });
    }
    const { actorId: _actorId, ...stored } = a;
    const old = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) =>
        q.eq("organizationId", a.organizationId).eq("provider", a.provider),
      )
      .unique();
    if (old)
      await ctx.db.patch(old._id, {
        ...stored,
        revision: crypto.randomUUID(),
        refreshLeaseKey: undefined,
        refreshLeaseExpiresAt: undefined,
        availableModels: [],
        status: a.provider === "openai" ? "stored" : "connected",
        updatedAt: Date.now(),
      });
    else
      await ctx.db.insert("connections", {
        ...stored,
        revision: crypto.randomUUID(),
        availableModels: [],
        status: a.provider === "openai" ? "stored" : "connected",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  },
});
export const verifiedCredential = internalMutation({
  args: {
    ...org,
    actorId: v.id("users"),
    revision: v.string(),
    models: v.array(v.string()),
  },
  handler: async (ctx, a) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", a.organizationId).eq("userId", a.actorId),
      )
      .unique();
    const actor = await ctx.db.get(a.actorId),
      organization = await ctx.db.get(a.organizationId);
    ensure(
      actor?.status === "active" &&
        workspaceReadable(organization, a.actorId) &&
        membership?.role === "owner",
      "FORBIDDEN",
      "Connection owner access changed.",
    );
    const key = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) =>
        q.eq("organizationId", a.organizationId).eq("provider", "openai"),
      )
      .unique();
    ensure(
      key?.revision === a.revision,
      "APPROVAL_STALE",
      "Credential changed during verification.",
    );
    const models = a.models.filter((id) =>
      customerModels().some((m) => m.id === id),
    );
    await ctx.db.patch(key._id, {
      status: "verified",
      availableModels: models,
      updatedAt: Date.now(),
    });
    return { verified: true, availableModels: models.length };
  },
});
export const connections = query({
  args: org,
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    const rows = await ctx.db
      .query("connections")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
    return rows.map(({ provider, status, updatedAt }) => ({
      provider,
      status,
      updatedAt,
    }));
  },
});
export const revoke = mutation({
  args: { ...org, provider: v.string() },
  handler: async (ctx, a) => {
    await writeAccess(ctx, a.organizationId, ["owner"]);
    const rows = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) =>
        q.eq("organizationId", a.organizationId).eq("provider", a.provider),
      )
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
    for (const r of runs)
      if (
        (a.provider === "github" ||
          (a.provider === "openai" && r.fundingRoute === "customer_api_key")) &&
        !["completed", "canceled"].includes(r.state)
      ) {
        await ctx.db.patch(r._id, {
          state: "canceled",
          generation: r.generation + 1,
        }); /* Preserve outstanding usage reservation until worker teardown is reconciled. */
      }
    if (a.provider === "github") {
      const repos = await ctx.db
        .query("repositories")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .collect();
      for (const repo of repos) {
        await clearRepositoryContent(ctx, repo._id);
        await clearRepositoryManifest(ctx, repo._id);
        await ctx.db.patch(repo._id, {
          enabled: false,
          status: "revoked",
          context: "",
          contextTree: "",
          contextFiles: [],
          contextExcerpts: [],
          manifest: [],
          manifestEntries: [],
          snapshotSummary: undefined,
          snapshotDelta: undefined,
        });
      }
    }
  },
});
export const reserveMatch = mutation({
  args: {
    id: v.id("sources"),
    repositoryId: v.id("repositories"),
    maxCredits: v.number(),
    insightIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id),
      repo = await repositoryContent(ctx, await ctx.db.get(a.repositoryId));
    if (
      !source ||
      source.state !== "ready" ||
      !repo ||
      source.organizationId !== repo.organizationId
    )
      fail("Matching context unavailable.");
    const { actor } = await writeAccess(ctx, source.organizationId);
    ensure(
      source.rightsAttested && sourceRetained(source.sourceRetentionUntil),
      "SOURCE_CHANGED",
      "Source evidence is no longer available.",
    );
    const typedRevision = source.currentRevisionId
      ? await ctx.db.get(source.currentRevisionId)
      : null;
    const registry = typedRevision
      ? await retainedSourceRevision(ctx, typedRevision)
      : null;
    const typedRequired =
      !!source.currentRevisionId ||
      ["github_repository", "reddit_thread"].includes(
        source.sourceType ?? "",
      ) ||
      source.analysis?.schemaVersion === "2.0.0";
    ensure(
      !typedRequired ||
        (!!typedRevision &&
          !!registry &&
          sourcePolicyCurrent(registry.revision) &&
          source.analysis?.schemaVersion === "2.0.0" &&
          source.analysis.sourceRevisionId === typedRevision._id &&
          source.analysis.sourceContentHash === typedRevision.contentHash),
      "SOURCE_CHANGED",
      "Analyze the current retained source revision before matching.",
    );
    if (typedRequired) await sharedTypedCitations(ctx, source);
    const sourceRevisionRegistry =
      typedRevision && registry
        ? {
            id: typedRevision._id,
            revision: registry.revision,
            evidence: registry.evidence,
          }
        : null;
    ensure(
      repo.enabled && repo.confirmed,
      "CONTEXT_REQUIRED",
      "Confirm an enabled repository's business profile first.",
    );
    ensure(
      a.maxCredits === 10,
      "QUOTE_CHANGED",
      "Review the current 10-credit quote.",
    );
    const insights = selectedInsights(
      source.analysis?.insights ?? [],
      a.insightIds,
    );
    const scopedSource = {
      ...source,
      analysis: { ...source.analysis, insights },
    };
    const suffix =
      insights.length === source.analysis.insights.length
        ? ""
        : `:scope:${await digest(JSON.stringify(insights.map((i: any) => i.id)))}`;
    const semanticKey = `match:${RETRIEVAL_VERSION}:${source._id}:${source.generation}:${source.updatedAt}:${repo._id}:${repo.sha}:${repo.profileVersion}${suffix}`;
    const old = await ctx.db
      .query("matchingJobs")
      .withIndex("by_key", (q) => q.eq("key", semanticKey))
      .unique();
    if (
      old?.proposalId &&
      (await currentMatchingProposal(ctx, old, source, repo, actor._id))
    )
      return {
        source: scopedSource,
        repo,
        key: old.reservationKey,
        semanticKey,
        cached: true,
        sourceRevisionRegistry,
      };
    ensure(
      old?.state !== "pending",
      "SOURCE_BUSY",
      "A matching job is already processing this context.",
    );
    const attempt = (old?.attempt ?? 0) + 1;
    ensure(
      attempt <= 3,
      "RETRY_LIMIT",
      "Matching reached its bounded retry limit. Review provider and repository context.",
    );
    const key = `${semanticKey}:attempt:${attempt}`;
    await reserve(ctx, source.organizationId, key, 10);
    if (old)
      await ctx.db.patch(old._id, {
        state: "pending",
        attempt,
        reservationKey: key,
        proposalId: undefined,
        insightIds: insights.map((i: any) => i.id),
        actor: actor._id,
        sourceGeneration: source.generation,
        sourceRevision: source.updatedAt,
        sourceRevisionId: typedRevision?._id,
        sourceContentHash: typedRevision?.contentHash,
        updatedAt: Date.now(),
      });
    else
      await ctx.db.insert("matchingJobs", {
        organizationId: source.organizationId,
        key: semanticKey,
        sourceId: source._id,
        repositoryId: repo._id,
        state: "pending",
        attempt,
        reservationKey: key,
        insightIds: insights.map((i: any) => i.id),
        actor: actor._id,
        sourceGeneration: source.generation,
        sourceRevision: source.updatedAt,
        sourceRevisionId: typedRevision?._id,
        sourceContentHash: typedRevision?.contentHash,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    return {
      source: scopedSource,
      repo,
      key,
      semanticKey,
      cached: false,
      sourceRevisionRegistry,
    };
  },
});
export const finishMatch = internalMutation({
  args: {
    ...org,
    key: v.string(),
    credits: v.number(),
    retainReservation: v.optional(v.boolean()),
    semanticKey: v.optional(v.string()),
    proposalId: v.optional(v.id("proposals")),
  },
  handler: async (ctx, a) => {
    if (!a.retainReservation)
      await settle(ctx, a.organizationId, a.key, a.credits);
    if (a.semanticKey) {
      const job = await ctx.db
        .query("matchingJobs")
        .withIndex("by_key", (q) => q.eq("key", a.semanticKey!))
        .unique();
      if (job && job.reservationKey === a.key)
        await ctx.db.patch(job._id, {
          state: (a.proposalId ?? job.proposalId) ? "completed" : "failed",
          proposalId: a.proposalId ?? job.proposalId,
          updatedAt: Date.now(),
        });
    }
  },
});
const approvalArgs = {
  id: v.id("proposals"),
  version: v.number(),
  planHash: v.string(),
  baseSha: v.string(),
  executor: v.string(),
  fundingRoute: v.string(),
  maxCredits: v.number(),
  allowedPaths: v.array(v.string()),
  highRisk: v.boolean(),
  modelId: v.optional(v.string()),
  maxProviderUsdCents: v.optional(v.number()),
};
export async function approveCore(
  ctx: import("./_generated/server").MutationCtx,
  a: import("convex/values").ObjectType<typeof approvalArgs>,
  authorization: {
    actor: import("./_generated/dataModel").Doc<"users">;
    membership: { role: string };
  },
) {
  const p = await ctx.db.get(a.id);
  if (!p) fail("Proposal unavailable.");
  const actor = authorization;
  ensure(
    await improvementCurrent(ctx, p),
    "APPROVAL_STALE",
    "Improvement evidence changed before execution.",
  );
  const repo = await ctx.db.get(p.repositoryId);
  ensure(
    repo?.organizationId === p.organizationId,
    "FORBIDDEN",
    "Repository unavailable.",
  );
  ensure(
    repo &&
      repo.enabled &&
      repo.confirmed &&
      repo.sha === a.baseSha &&
      p.baseSha === a.baseSha &&
      repo.profileVersion === p.profileVersion,
    "BASE_CHANGED",
    "Refresh and review the repository context.",
  );
  ensure(
    p.review === "accepted" &&
      p.plan &&
      p.version === a.version &&
      p.planHash === a.planHash,
    "APPROVAL_STALE",
    "Review the current plan version.",
  );
  ensure(
    ["local", "cloud"].includes(a.executor),
    "INVALID_INPUT",
    "Choose an executor.",
  );
  ensure(
    a.executor === "local"
      ? a.fundingRoute === "local_codex_subscription"
      : ["managed_api", "customer_api_key"].includes(a.fundingRoute),
    "FUNDING_REQUIRED",
    "Choose an explicit funding route.",
  );
  ensure(
    a.executor !== "cloud" || cloudExecutionAllowed(actor.actor.subject),
    "ISOLATION_UNAVAILABLE",
    "Cloud execution is waiting for its isolation and billing verification.",
  );
  ensure(
    a.executor !== "local" || process.env.LOCAL_ISOLATION_VERIFIED === "true",
    "ISOLATION_UNAVAILABLE",
    "Local execution is waiting for its Windows isolation verification.",
  );
  ensure(
    process.env[a.executor === "cloud" ? "DISABLE_CLOUD" : "DISABLE_LOCAL"] !==
      "true",
    "POLICY_BLOCKED",
    "Execution is paused.",
  );
  const planPaths = p.plan.files.map((f: any) => f.path);
  ensure(
    JSON.stringify(planPaths) === JSON.stringify(a.allowedPaths),
    "APPROVAL_STALE",
    "Permitted files differ from the plan.",
  );
  validatePaths(a.allowedPaths, a.allowedPaths, a.highRisk);
  ensure(
    !a.highRisk || ["owner", "admin"].includes(actor.membership.role),
    "FORBIDDEN",
    "Protected changes require explicit owner or administrator review.",
  );
  ensure(
    a.executor !== "local" || a.maxCredits === 0,
    "QUOTE_CHANGED",
    "Local subscription execution has no invented platform inference cost.",
  );
  const now = Date.now();
  let customerModel, credentialRevision;
  if (a.fundingRoute === "customer_api_key") {
    customerModel = customerModels().find((m) => m.id === a.modelId);
    const key = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) =>
        q.eq("organizationId", p.organizationId).eq("provider", "openai"),
      )
      .unique();
    ensure(
      customerModel &&
        key?.status === "verified" &&
        key.revision &&
        key.availableModels?.includes(customerModel.id),
      "SETUP_REQUIRED",
      "Verify the customer credential and model first.",
    );
    ensure(
      a.maxProviderUsdCents === customerQuote(customerModel),
      "QUOTE_CHANGED",
      "Review the current separate provider quote.",
    );
    credentialRevision = key.revision;
  } else {
    ensure(
      a.modelId === undefined && a.maxProviderUsdCents === undefined,
      "INVALID_INPUT",
      "Provider fields require the customer-key route.",
    );
  }
  const priorRuns = await ctx.db
    .query("runs")
    .withIndex("by_proposal", (q) => q.eq("proposalId", p._id))
    .collect();
  const unresolved = priorRuns.find(
    (run) => run.providerRequestState === "started",
  );
  ensure(
    !unresolved,
    "COST_RECONCILIATION_REQUIRED",
    "A previous customer-provider request needs usage reconciliation before another execution approval.",
  );
  const previous = priorRuns.find(
    (run) =>
      !["failed", "canceled"].includes(run.state) &&
      (run.state !== "completed" || run.planHash === a.planHash),
  );
  if (previous) {
    ensure(
      previous.planHash === a.planHash &&
        previous.baseSha === a.baseSha &&
        previous.version === a.version &&
        previous.executor === a.executor &&
        previous.fundingRoute === a.fundingRoute &&
        previous.maxCredits === a.maxCredits &&
        previous.highRisk === a.highRisk &&
        JSON.stringify(previous.allowedPaths) ===
          JSON.stringify(a.allowedPaths) &&
        previous.customerModel?.id === a.modelId &&
        previous.maxProviderUsdCents === a.maxProviderUsdCents,
      "SOURCE_BUSY",
      "An existing execution or publication must be reconciled before changing its scope or funding.",
    );
    return previous._id;
  }
  const runId = await ctx.db.insert("runs", {
    organizationId: p.organizationId,
    createdAt: now,
    updatedAt: now,
    proposalId: p._id,
    repositoryId: p.repositoryId,
    approvedBy: actor.actor._id,
    planHash: a.planHash,
    baseSha: a.baseSha,
    version: a.version,
    selectionVersion: repo.selectionVersion ?? 0,
    executor: a.executor,
    fundingRoute: a.fundingRoute,
    customerModel,
    credentialRevision,
    maxProviderUsdCents: a.maxProviderUsdCents,
    providerRequestState: customerModel ? "reserved" : undefined,
    maxCredits: a.maxCredits,
    allowedPaths: a.allowedPaths,
    highRisk: a.highRisk,
    state: a.executor === "local" ? "waiting_for_laptop" : "queued",
    generation: 1,
    expiresAt: now + 86400000,
    leaseUntil: 0,
    events: ["Exact plan and execution budget approved."],
  });
  await reserve(ctx, p.organizationId, `run:${runId}`, a.maxCredits);
  if (a.executor === "cloud")
    await workflow.start(
      ctx,
      internal.workflows.coding,
      {
        id: runId,
        generation: 1,
      },
      { onComplete: internal.workflows.completed, context: null },
    );
  return runId;
}
export const approve = mutation({
  args: approvalArgs,
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.id);
    ensure(p, "FORBIDDEN", "Proposal unavailable.");
    return approveCore(ctx, a, await writeAccess(ctx, p.organizationId));
  },
});
export const run = query({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r) fail("Run unavailable.");
    await access(ctx, r.organizationId);
    const repo = await ctx.db.get(r.repositoryId),
      proposal = await ctx.db.get(r.proposalId);
    if (
      !repo ||
      !proposal ||
      repo.organizationId !== r.organizationId ||
      proposal.organizationId !== r.organizationId ||
      proposal.repositoryId !== r.repositoryId
    )
      fail("Run unavailable.");
    return {
      ...r,
      repo,
      proposal,
    };
  },
});
export const cancel = mutation({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r) fail("Run unavailable.");
    await writeAccess(ctx, r.organizationId);
    if (r.state === "canceled") return;
    ensure(
      !["publishing", "completed"].includes(r.state),
      "PUBLICATION_IN_PROGRESS",
      "Reconcile publication before cancellation.",
    );
    await ctx.db.patch(r._id, {
      state: "canceled",
      generation: r.generation + 1,
      events: [
        ...r.events,
        "Cancellation requested; stale results are rejected.",
      ],
      updatedAt: Date.now(),
    }); /* Funding stays reserved until worker termination and usage are reconciled. */
  },
});
const publicationArgs = {
  id: v.id("runs"),
  generation: v.number(),
  patchDigest: v.string(),
  reviewNote: v.optional(v.string()),
};
export async function publicationCore(
  ctx: import("./_generated/server").MutationCtx,
  a: import("convex/values").ObjectType<typeof publicationArgs>,
  automatic = false,
) {
  const r = await ctx.db.get(a.id);
  if (!r) fail("Run unavailable.");
  if (!automatic) await writeAccess(ctx, r.organizationId);
  else
    ensure(
      r.aiReview?.status === "passed" &&
        r.aiReview.generation === r.generation &&
        r.aiReview.patchDigest === a.patchDigest &&
        r.aiReview.policyVersion === r.automationPolicyVersion &&
        r.checksPassed &&
        !r.highRisk,
      "POLICY_BLOCKED",
      "Independent review and passing checks are required.",
    );
  ensure(
    await approvalActive(ctx, r),
    "FORBIDDEN",
    "The original execution approval is no longer authorized. Review a new plan approval.",
  );
  ensure(
    process.env.DISABLE_PUBLICATION !== "true",
    "POLICY_BLOCKED",
    "Publication is paused.",
  );
  ensure(
    ["awaiting_review", "publishing"].includes(r.state) &&
      r.generation === a.generation &&
      r.patch &&
      r.changes,
    "APPROVAL_STALE",
    "Review the current patch.",
  );
  ensure(
    (await digest(r.patch)) === a.patchDigest,
    "APPROVAL_STALE",
    "Patch changed after review.",
  );
  const p = await ctx.db.get(r.proposalId),
    repo = await ctx.db.get(r.repositoryId);
  const actor = await ctx.db.get(r.approvedBy);
  ensure(
    r.executor !== "cloud" || (actor && cloudExecutionAllowed(actor.subject)),
    "POLICY_BLOCKED",
    "Cloud execution is unavailable for this account.",
  );
  ensure(
    p &&
      repo &&
      p.organizationId === r.organizationId &&
      repo.organizationId === r.organizationId &&
      p.repositoryId === r.repositoryId &&
      repo.enabled &&
      p.planHash === r.planHash &&
      (repo.selectionVersion ?? 0) === (r.selectionVersion ?? 0) &&
      repo.sha === r.baseSha,
    "BASE_CHANGED",
    "Approval context changed.",
  );
  validatePaths(
    r.changes.map((f: any) => f.path),
    r.allowedPaths,
    r.highRisk,
  );
  ensure(
    !containsSecret(r.patch),
    "POLICY_BLOCKED",
    "Patch contains a credential.",
  );
  ensure(
    !a.reviewNote ||
      (a.reviewNote.length <= 2000 && !containsSecret(a.reviewNote)),
    "POLICY_BLOCKED",
    "Publication notes must be bounded and contain no credentials.",
  );
  const report = a.reviewNote
    ? `${r.report ?? ""}\n\nReviewer publication note: ${a.reviewNote}`
    : r.report;
  await ctx.db.patch(r._id, {
    state: "publishing",
    publicationGeneration: r.generation,
    report,
    updatedAt: Date.now(),
  });
  return {
    ...r,
    repo,
    title: p.plan?.scope?.startsWith("Synthetic staging")
      ? `Synthetic staging: ${p.title}`.slice(0, 160)
      : p.title,
    report,
    changes: r.changes as { path: string; content: string | null }[],
  };
}
export const authorizePublication = mutation({
  args: publicationArgs,
  handler: (ctx, a) => publicationCore(ctx, a),
});
export const recordPR = internalMutation({
  args: {
    id: v.id("runs"),
    generation: v.number(),
    number: v.number(),
    url: v.string(),
    state: v.string(),
    mergedAt: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r) return;
    if (r.prNumber === a.number && r.prUrl === a.url) return;
    if (!(
      r.publicationGeneration === a.generation ||
      (r.generation === a.generation && r.state === "publishing")
    ))
      return;
    const repo = await ctx.db.get(r.repositoryId);
    ensure(
      repo &&
        Number.isSafeInteger(a.number) &&
        a.number > 0 &&
        a.url === `https://github.com/${repo.fullName}/pull/${a.number}` &&
        !r.prNumber,
      "INVALID_EVIDENCE",
      "Publication receipt does not match this authorized repository.",
    );
    await ctx.db.patch(a.id, {
      state: "completed",
      prNumber: a.number,
      prUrl: a.url,
      prState: a.state,
      mergedAt: a.mergedAt,
      events:
        r.generation !== a.generation || r.state !== "publishing"
          ? [
              ...r.events,
              "An already authorized publication completed after cancellation or access changed. Its PR receipt was retained; no new publication was started.",
            ]
          : r.events,
      observedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
export const projectPR = internalMutation({
  args: {
    id: v.id("runs"),
    state: v.string(),
    mergedAt: v.optional(v.string()),
    mergeCommitSha: v.optional(v.string()),
    reverted: v.optional(revertEvidenceValidator),
    revertStatus: v.optional(revertStatusValidator),
    revertProbeHead: v.optional(v.string()),
    observedAt: v.number(),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r || !r.prNumber || (r.observedAt ?? 0) > a.observedAt) return;
    ensure(
      Number.isFinite(a.observedAt) &&
        a.observedAt >= 0 &&
        (!a.mergeCommitSha || /^[a-f0-9]{40}$/.test(a.mergeCommitSha)) &&
        (!a.revertProbeHead || /^[a-f0-9]{40}$/.test(a.revertProbeHead)),
      "INVALID_EVIDENCE",
      "Invalid authoritative PR observation.",
    );
    if (a.reverted) {
      const repo = await ctx.db.get(r.repositoryId);
      ensure(
        (a.mergedAt ?? r.mergedAt) &&
          a.reverted.mergeCommitSha ===
            (a.mergeCommitSha ?? r.mergeCommitSha) &&
          /^[a-f0-9]{40}$/.test(a.reverted.revertCommitSha) &&
          a.reverted.url ===
            `https://github.com/${repo?.fullName}/commit/${a.reverted.revertCommitSha}` &&
          Number.isFinite(a.reverted.observedAt) &&
          a.reverted.observedAt >= 0 &&
          a.reverted.observedAt <= a.observedAt,
        "INVALID_EVIDENCE",
        "Revert evidence does not match this historical merge.",
      );
    }
    await ctx.db.patch(a.id, {
      prState: a.state,
      mergedAt: a.mergedAt ?? r.mergedAt,
      ...(a.mergedAt && r.mergeIntent
        ? { mergeIntent: { ...r.mergeIntent, state: "confirmed" } }
        : {}),
      mergeCommitSha: a.mergeCommitSha ?? r.mergeCommitSha,
      reverted: a.reverted ?? r.reverted,
      revertStatus: a.revertStatus ?? r.revertStatus,
      revertProbeHead: a.revertProbeHead ?? r.revertProbeHead,
      observedAt: a.observedAt,
    });
  },
});
export const prRuns = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const rows = await ctx.db
      .query("runs")
      .withIndex("by_state", (q) => q.eq("state", "completed"))
      .paginate({ cursor: a.cursor ?? null, numItems: 50 });
    const out = [];
    for (const r of rows.page) {
      const repo = await ctx.db.get(r.repositoryId);
      if (repo && r.prNumber) out.push({ ...r, repo });
    }
    return {
      page: out,
      isDone: rows.isDone,
      continueCursor: rows.continueCursor,
    };
  },
});
export const prRun = internalQuery({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    const run = await ctx.db.get(a.id);
    if (!run?.prNumber) return null;
    const repo = await ctx.db.get(run.repositoryId);
    return repo ? { ...run, repo } : null;
  },
});
export const runFailure = internalMutation({
  args: { id: v.id("runs"), generation: v.number(), error: v.string() },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (r && r.generation === a.generation)
      await ctx.db.patch(a.id, { error: a.error, updatedAt: Date.now() });
  },
});
// Every page rechecks ownership. Small pages bound Convex's read/response budget.
export const exportPage = query({
  args: {
    ...org,
    section: v.union(
      ...contentExportSections.map((section) => v.literal(section)),
    ),
    cursor: v.union(v.string(), v.null()),
    asOf: v.number(),
  },
  handler: async (ctx, a) => {
    const { actor } = await access(ctx, a.organizationId, ["owner"]);
    ensure(
      Number.isSafeInteger(a.asOf) && a.asOf <= Date.now(),
      "INVALID_INPUT",
      "Invalid export timestamp.",
    );
    const rows = await ctx.db
      .query(a.section)
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .paginate({ cursor: a.cursor, numItems: 5 });
    const permitted = [];
    for (const row of rows.page) {
      if (
        ["analysisEvidence", "analysisVersions", "analysisAttempts"].includes(
          a.section,
        )
      ) {
        const history = row as
          | Doc<"analysisEvidence">
          | Doc<"analysisVersions">
          | Doc<"analysisAttempts">;
        const source = history.sourceId
          ? await ctx.db.get(history.sourceId)
          : null;
        const evidence =
          "evidenceId" in history
            ? await ctx.db.get(history.evidenceId)
            : (history as Doc<"analysisEvidence">);
        if (
          !source ||
          source.organizationId !== a.organizationId ||
          source.state === "deleted" ||
          !source.rightsAttested ||
          !sourceRetained(source.sourceRetentionUntil) ||
          !evidence ||
          source.state !== "ready" ||
          source.generation !== evidence.extractionGeneration ||
          evidence.owner !== "private" ||
          evidence.organizationId !== source.organizationId ||
          evidence.sourceId !== source._id ||
          evidence.state !== "retained" ||
          evidence.retainUntil <= Date.now() ||
          evidence.canonical !== source.canonical
        )
          continue;
      }
      if (
        (a.section === "publicImports" || a.section === "publicGeography") &&
        "actor" in row &&
        row.actor !== actor._id
      )
        continue;
      if (
        a.section === "sourceRevisions" &&
        "evidence" in row &&
        "revision" in row &&
        "sourceId" in row
      ) {
        const registry = await retainedSourceRevision(
          ctx,
          row as Doc<"sourceRevisions">,
        );
        if (registry && sourcePolicyCurrent(registry.revision))
          permitted.push({
            ...row,
            revision: registry.revision,
            evidence: registry.evidence,
            text: registry.evidence.map((e) => e.excerpt).join("\n"),
          });
        continue;
      }
      if (
        a.section === "publicArtifacts" &&
        !(await reusableArtifact(ctx, row._id as Id<"publicArtifacts">))
      )
        continue;
      if (
        a.section === "publicEditions" &&
        "payload" in row &&
        (!(await editionCurrent(ctx, row as Doc<"publicEditions">)) ||
          row.payloadHash !== (await digest(canonicalJson(row.payload))))
      ) {
        permitted.push({ ...row, payload: undefined, payloadHash: undefined });
        continue;
      }
      if (a.section === "publicCollections" && "bindings" in row) {
        let current =
          row.state === "published" &&
          row.bindings.length === row.editions.length;
        for (const binding of row.bindings) {
          const edition = await publicEdition(ctx, binding.id);
          if (
            !edition ||
            edition.version !== binding.version ||
            edition.payloadHash !== binding.hash ||
            edition.payloadHash !==
              (await digest(canonicalJson(edition.payload)))
          )
            current = false;
        }
        if (!current) {
          permitted.push({
            ...row,
            title: "Unavailable collection",
            description: "",
            editions: [],
            bindings: [],
            reviewedHash: undefined,
          });
          continue;
        }
      }
      if (
        a.section === "sources" &&
        "generation" in row &&
        "rightsAttested" in row
      ) {
        if (row.state === "deleted") continue;
        const revision = row.currentRevisionId
          ? await ctx.db.get(row.currentRevisionId)
          : null;
        const registryRequired =
          row.sourceType === "github_repository" ||
          row.sourceType === "reddit_thread" ||
          row.analysis?.schemaVersion === "2.0.0";
        const registry = revision
          ? await retainedSourceRevision(ctx, revision)
          : null;
        let orderedCurrent = true;
        if (row.orderedMedia || row.analysis?.schemaVersion === "3.0.0") {
          try {
            orderedCurrent =
              row.state === "ready" && !!(await sharedTypedCitations(ctx, row));
          } catch {
            orderedCurrent = false;
          }
        }
        const registryCurrent = row.currentRevisionId
          ? !!registry && sourcePolicyCurrent(registry.revision)
          : !registryRequired;
        if (
          !row.rightsAttested ||
          !sourceRetained(row.sourceRetentionUntil) ||
          !registryCurrent ||
          !orderedCurrent
        ) {
          permitted.push({
            ...row,
            state: "needs_upload",
            coverage: "metadata_only",
            text: undefined,
            originalText: undefined,
            summary: undefined,
            selectedAnalysisSummary: undefined,
            selectedAnalysisMainPoints: undefined,
            selectedAnalysisInsightCount: undefined,
            analysis: undefined,
            mediaEvidence: undefined,
            originalMediaEvidence: undefined,
            personalMedia: undefined,
            orderedMedia: undefined,
            acquisition: undefined,
            searchable: undefined,
            repositorySelection: undefined,
          });
          continue;
        }
      }
      if (
        a.section === "subscriptionTrials" &&
        "actor" in row &&
        row.actor !== actor._id
      )
        continue;
      if (
        a.section === "subscriptionTrials" &&
        !(await trialCurrent(
          ctx,
          row as import("./_generated/dataModel").Doc<"subscriptionTrials">,
        ))
      ) {
        permitted.push({ ...row, input: { sources: [] }, results: undefined });
        continue;
      }
      if (
        "references" in row &&
        row.references !== undefined &&
        !(await referencesCurrent(ctx, a.organizationId, row.references))
      ) {
        permitted.push({
          ...row,
          output: undefined,
          ...("goal" in row
            ? { title: "Unavailable improvement", goal: "" }
            : {}),
          ...("note" in row
            ? { note: "", measurement: undefined, deployedUrl: undefined }
            : {}),
          ...("detail" in row
            ? {
                title: "Unavailable proposal",
                detail: undefined,
                plan: undefined,
                planDraft: undefined,
              }
            : {}),
          ...("body" in row
            ? { title: "Unavailable private draft", body: "" }
            : {}),
        });
      } else
        permitted.push(
          a.section === "repositories" && "manifest" in row
            ? (await repositoryManifest(ctx, row))!
            : row,
        );
    }
    return {
      page: permitted
        .filter(
          (row) =>
            Math.floor(row._creationTime) <= a.asOf &&
            !("state" in row && row.state === "deleted"),
        )
        .map((row) => exportRecord(a.section, row)),
      isDone: rows.isDone,
      continueCursor: rows.continueCursor,
    };
  },
});

export const workerRun = internalQuery({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    const run = await ctx.db.get(a.id);
    if (!run) return null;
    if (!(await approvalActive(ctx, run))) return null;
    return run;
  },
});
async function customerCredential(
  ctx: import("./_generated/server").QueryCtx,
  id: import("./_generated/dataModel").Id<"runs">,
  generation: number,
) {
  const run = await ctx.db.get(id);
  ensure(
    run &&
      run.generation === generation &&
      run.state === "running" &&
      run.leaseUntil > Date.now() &&
      run.fundingRoute === "customer_api_key" &&
      (await approvalActive(ctx, run)),
    "APPROVAL_STALE",
    "Customer-funded execution authorization changed.",
  );
  const key = await ctx.db
    .query("connections")
    .withIndex("by_provider", (q) =>
      q.eq("organizationId", run.organizationId).eq("provider", "openai"),
    )
    .unique();
  ensure(
    key?.status === "verified" &&
      key.revision === run.credentialRevision &&
      key.availableModels?.includes(run.customerModel?.id),
    "FORBIDDEN",
    "Approved credential was revoked or replaced.",
  );
  ensure(
    currentCustomerModel(run.customerModel),
    "QUOTE_CHANGED",
    "Model pricing or capability verification changed.",
  );
  return { run, key };
}
export const customerRequestActive = internalQuery({
  args: { id: v.id("runs"), generation: v.number() },
  handler: async (ctx, a) => {
    try {
      await customerCredential(ctx, a.id, a.generation);
      return true;
    } catch {
      return false;
    }
  },
});
export const startCustomerRequest = internalMutation({
  args: { id: v.id("runs"), generation: v.number() },
  handler: async (ctx, a) => {
    const { run, key } = await customerCredential(ctx, a.id, a.generation);
    ensure(
      run.providerRequestState === "reserved",
      "COST_RECONCILIATION_REQUIRED",
      "An earlier provider request may have consumed this authorization. No automatic retry.",
    );
    await ctx.db.patch(run._id, {
      providerRequestState: "started",
      updatedAt: Date.now(),
    });
    return {
      ciphertext: key.ciphertext,
      keyVersion: key.keyVersion,
      organizationId: run.organizationId,
      model: run.customerModel,
      maxUsdCents: run.maxProviderUsdCents!,
    };
  },
});
export const recordCustomerUsage = internalMutation({
  args: { id: v.id("runs"), generation: v.number(), cents: v.number() },
  handler: async (ctx, a) => {
    const run = await ctx.db.get(a.id);
    ensure(
      run?.fundingRoute === "customer_api_key" &&
        Number.isSafeInteger(a.cents) &&
        a.cents >= 0 &&
        a.cents <= run.maxProviderUsdCents!,
      "COST_RECONCILIATION_REQUIRED",
      "Invalid customer-provider usage receipt.",
    );
    // A cancellation can race an already issued request. Preserve its receipt, never revive the run.
    if (
      run.providerRequestState === "started" &&
      (run.generation === a.generation || run.state === "canceled")
    )
      await ctx.db.patch(run._id, {
        providerUsdCents: a.cents,
        providerRequestState: "settled",
        updatedAt: Date.now(),
      });
  },
});
export const claimCloud = internalMutation({
  args: { id: v.id("runs") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (
      !r ||
      r.state !== "queued" ||
      r.executor !== "cloud" ||
      r.expiresAt < Date.now() ||
      process.env.CLOUD_VERIFIED !== "true" ||
      process.env.DISABLE_CLOUD === "true"
    )
      return null;
    const p = await ctx.db.get(r.proposalId),
      repo = await ctx.db.get(r.repositoryId);
    const actor = await ctx.db.get(r.approvedBy);
    ensure(
      actor && cloudExecutionAllowed(actor.subject),
      "POLICY_BLOCKED",
      "Cloud execution is unavailable for this account.",
    );
    ensure(
      p?.planHash === r.planHash &&
        repo?.sha === r.baseSha &&
        repo.enabled &&
        (repo.selectionVersion ?? 0) === (r.selectionVersion ?? 0),
      "APPROVAL_STALE",
      "Execution context changed.",
    );
    ensure(
      await approvalActive(ctx, r),
      "FORBIDDEN",
      "The approving member no longer has execution permission.",
    );
    const computeReserve = Math.min(
      Number(process.env.CLOUD_COMPUTE_RESERVE_CREDITS ?? "10000"),
      Math.floor(r.maxCredits - 1),
    );
    const rate = Number(process.env.SANDBOX_CREDITS_PER_SECOND ?? "1");
    if (r.fundingRoute === "customer_api_key") {
      const key = await ctx.db
        .query("connections")
        .withIndex("by_provider", (q) =>
          q.eq("organizationId", r.organizationId).eq("provider", "openai"),
        )
        .unique();
      ensure(
        key?.status === "verified" &&
          key.revision === r.credentialRevision &&
          currentCustomerModel(r.customerModel),
        "APPROVAL_STALE",
        "Customer credential or model configuration changed.",
      );
    }
    ensure(
      Number.isFinite(rate) &&
        rate > 0 &&
        Number.isSafeInteger(computeReserve) &&
        computeReserve >= Math.ceil(30 * rate) &&
        computeReserve < r.maxCredits,
      "INSUFFICIENT_CREDITS",
      "Review a quote that covers the full bounded compute reservation.",
    );
    const maxSeconds = Math.min(1200, Math.floor(computeReserve / rate));
    await ctx.db.patch(r._id, {
      state: "running",
      leaseUntil: Date.now() + maxSeconds * 1000,
      updatedAt: Date.now(),
    });
    return {
      ...r,
      repo,
      plan: p.plan,
      computeReserve,
      maxSeconds,
      computeRate: rate,
    };
  },
});
export const sandboxStarted = internalMutation({
  args: { id: v.id("runs"), generation: v.number(), sandboxId: v.string() },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (r && r.generation === a.generation)
      await ctx.db.patch(a.id, {
        events: [...r.events, `Isolated sandbox started: ${a.sandboxId}`],
        updatedAt: Date.now(),
      });
  },
});
export const isolatedChecksStarted = internalMutation({
  args: { id: v.id("runs"), generation: v.number() },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    ensure(
      r?.state === "running" &&
        r.generation === a.generation &&
        (await approvalActive(ctx, r)),
      "APPROVAL_STALE",
      "Execution was canceled before checks.",
    );
    await ctx.db.patch(r._id, {
      events: [...r.events, "Isolated checks running."],
      updatedAt: Date.now(),
    });
  },
});
export const reconcileTerminatedCloud = internalMutation({
  args: {
    id: v.id("runs"),
    generation: v.number(),
    sandboxId: v.string(),
    credits: v.number(),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r) return;
    ensure(
      r.executor === "cloud" &&
        ((r.state === "failed" && r.generation === a.generation) ||
          (r.state === "canceled" && r.generation > a.generation)) &&
        r.events.includes(`Isolated sandbox started: ${a.sandboxId}`),
      "APPROVAL_STALE",
      "Termination does not match the dispatched worker.",
    );
    ensure(
      Number.isSafeInteger(a.credits) &&
        a.credits >= 0 &&
        a.credits <= r.maxCredits,
      "BUDGET_EXCEEDED",
      "Termination usage exceeds its approved reservation.",
    );
    const receipt = `Teardown confirmed; service credits settled: ${a.credits}.`;
    const previous = r.events.find((event) =>
      event.startsWith("Teardown confirmed; service credits settled:"),
    );
    if (previous) {
      ensure(
        previous === receipt,
        "COST_RECONCILIATION_REQUIRED",
        "The recorded termination settlement differs.",
      );
      return;
    }
    await settle(ctx, r.organizationId, `run:${r._id}`, a.credits);
    await ctx.db.patch(r._id, {
      events: [...r.events, receipt],
      updatedAt: Date.now(),
    });
  },
});
export const completeCloud = internalMutation({
  args: {
    id: v.id("runs"),
    generation: v.number(),
    patch: v.string(),
    changes: v.any(),
    report: v.string(),
    checksPassed: v.optional(v.boolean()),
    credits: v.number(),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (
      !r ||
      r.generation !== a.generation ||
      r.state !== "running" ||
      r.leaseUntil < Date.now()
    )
      return false;
    ensure(
      await approvalActive(ctx, r),
      "FORBIDDEN",
      "The original execution approval is no longer authorized.",
    );
    ensure(
      a.credits <= r.maxCredits,
      "BUDGET_EXCEEDED",
      "Measured usage exceeds approval; operator reconciliation required.",
    );
    validatePaths(
      a.changes.map((f: any) => f.path),
      r.allowedPaths,
      r.highRisk,
    );
    ensure(
      !containsSecret(a.patch) && !containsSecret(a.report),
      "POLICY_BLOCKED",
      "Artifact contains credential material.",
    );
    await settle(ctx, r.organizationId, `run:${r._id}`, a.credits);
    await ctx.db.patch(a.id, {
      patch: a.patch,
      changes: a.changes,
      report: a.report,
      checksPassed: a.checksPassed,
      state: "awaiting_review",
      updatedAt: Date.now(),
    });
    return true;
  },
});
export const failCloud = internalMutation({
  args: {
    id: v.id("runs"),
    generation: v.number(),
    credits: v.number(),
    error: v.string(),
    beforeSandboxCreation: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r) return;
    if (a.beforeSandboxCreation) {
      ensure(
        r.executor === "cloud" &&
          a.credits === 0 &&
          ((r.generation === a.generation &&
            ["running", "failed"].includes(r.state)) ||
            (r.state === "canceled" && r.generation === a.generation + 1)) &&
          !r.events.some((event) =>
            event.startsWith("Isolated sandbox started:"),
          ) &&
          (!r.providerRequestState || r.providerRequestState === "reserved"),
        "COST_RECONCILIATION_REQUIRED",
        "Zero-usage failure does not match an unstarted execution.",
      );
      await settle(ctx, r.organizationId, `run:${r._id}`, 0);
      const notice =
        "Authorization stopped before sandbox creation or model use; unused reservation released.";
      await ctx.db.patch(r._id, {
        state: r.state === "canceled" ? "canceled" : "failed",
        error: a.error,
        providerRequestState:
          r.fundingRoute === "customer_api_key"
            ? undefined
            : r.providerRequestState,
        events: r.events.includes(notice) ? r.events : [...r.events, notice],
        updatedAt: Date.now(),
      });
      return;
    }
    // Unknown creation or request exposure retains its hold. A late failure
    // cannot erase an accepted artifact or completed publication receipt.
    if (r.generation === a.generation && r.state === "running")
      await ctx.db.patch(a.id, {
        state: "failed",
        error: a.error,
        updatedAt: Date.now(),
      });
  },
});
// Operator-only staging support adjustment. Customer permissions cannot call this.
export const waiveStagingFailure = internalMutation({
  args: { id: v.id("runs"), reason: v.string() },
  handler: async (ctx, a) => {
    const run = await ctx.db.get(a.id);
    ensure(
      run &&
        run.state === "failed" &&
        run.organizationId === process.env.STAGING_TEST_ORGANIZATION_ID &&
        !run.prNumber,
      "FORBIDDEN",
      "Only the configured failed staging test is eligible.",
    );
    ensure(
      a.reason.length >= 20 &&
        a.reason.length <= 1000 &&
        !containsSecret(a.reason),
      "INVALID_INPUT",
      "Record a bounded support reason.",
    );
    const key = `run:${run._id}`;
    const reservation = await ctx.db
      .query("reservations")
      .withIndex("by_key", (q) =>
        q.eq("organizationId", run.organizationId).eq("key", key),
      )
      .unique();
    if (!reservation || reservation.state !== "active") return;
    // Keep operator cost capacity reserved until provider reconciliation.
    await ctx.db.patch(reservation._id, { operatorKeys: [] });
    await settle(ctx, run.organizationId, key, 0);
    await ctx.db.patch(reservation._id, {
      operatorKeys: reservation.operatorKeys,
    });
    await ctx.db.insert("costEntries", {
      organizationId: run.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      key: `operator-unreconciled:${key}`,
      credits: 0,
      provider: "staging_support_adjustment",
      units: reservation.max,
      unitType: "reserved_service_credit_ceiling",
      costCeilingEur: reservation.max * 0.01,
      costStatus: "unreconciled_operator_hold",
    });
    await ctx.db.patch(run._id, {
      events: [
        ...run.events,
        `Staging service charge waived: ${a.reason}. Operator cost reservation remains held.`,
      ],
      updatedAt: Date.now(),
    });
  },
});

export const enqueuePR = internalMutation({
  args: {
    delivery: v.string(),
    installationId: v.number(),
    repositoryId: v.number(),
    prNumber: v.number(),
  },
  handler: async (ctx, a) => {
    const seen = await ctx.db
      .query("webhookReceipts")
      .withIndex("by_key", (q) =>
        q.eq("provider", "github").eq("key", a.delivery),
      )
      .unique();
    if (seen) return;
    const repos = await ctx.db
      .query("repositories")
      .withIndex("by_github", (q) =>
        q
          .eq("installationId", a.installationId)
          .eq("providerId", a.repositoryId),
      )
      .collect();
    for (const repo of repos) {
      for (const run of await ctx.db
        .query("runs")
        .withIndex("by_pr", (q) =>
          q.eq("repositoryId", repo._id).eq("prNumber", a.prNumber),
        )
        .collect()) {
        await ctx.scheduler.runAfter(0, internal.integrations.reconcilePRRun, {
          id: run._id,
        });
      }
    }
    await ctx.db.insert("webhookReceipts", {
      provider: "github",
      key: a.delivery,
      at: Date.now(),
      state: "queued",
    });
  },
});
