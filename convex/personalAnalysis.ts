import { presentAnalysis } from "../packages/insights/presentation";
import { workspaceReadable } from "./lib/workspacePrivacy";
import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { access, writeAccess, recentAuthentication, limit, audit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import { insightOutput, sourceInsightOutput } from "../packages/contracts";
import { retainedSourceRevision, sourceRetained } from "./lib/sourceAuthority";
import { sourcePolicyCurrent } from "./lib/sourcePolicy";
import { syncKnowledge } from "./knowledge";
import { reserve, settle } from "./product";
import { personalAllowed } from "./lib/personalAccess";
import { releaseUnstarted } from "./personalMediaState";
import { syncCategories, vocabulary } from "./categories";
import { acquisitionPolicy } from "../packages/media/acquisition";
import { workflow } from "./workflows";
import { subscriptionCapabilitiesValue } from "./localLibrarySchema";
import { capabilitySnapshot } from "./lib/localTaskAuthority";
import { safeEffort } from "../packages/runner/subscription-capabilities.mjs";
import { reusablePersonalPreparation } from "./lib/personalPreparation";
import {
  orderedInput,
  orderedInputHash,
  orderedPrepared,
  orderedCompletion,
  reusablePersonalOrderedPreparation,
  reconciledOrderedCompute,
} from "./lib/personalOrdered";
import { socialHash } from "../packages/social/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { personalOrderedInputSchema } from "../packages/social/ordered-intake";
import { pairedPersonalJob } from "./personalAnalysisSchema";

export const personalApprovalFields = {
  deviceId: v.id("devices"),
  model: v.string(),
  effort: v.string(),
  useOwnPlan: v.boolean(),
  maxComputeCredits: v.optional(v.number()),
};
export type PersonalApproval = {
  id: Id<"sources">;
  generation: number;
  deviceId: Id<"devices">;
  model: string;
  effort: string;
  useOwnPlan: boolean;
  maxComputeCredits?: number;
};

export function sourceCapabilityCurrent(
  device: Doc<"devices">,
  model: string,
  effort: string,
  profileBinding: string,
  needsImage: boolean,
  capabilityHash?: string,
) {
  const snapshot = device.subscriptionCapabilities;
  if (!snapshot)
    return !capabilityHash && ["low", "medium", "high"].includes(effort);
  return (
    safeEffort(effort) &&
    snapshot.expiresAt > Date.now() &&
    snapshot.sessionExpiresAt > Date.now() &&
    snapshot.profileBinding === profileBinding &&
    (!capabilityHash || snapshot.hash === capabilityHash) &&
    snapshot.value.models.some(
      (entry) =>
        entry.slug === model &&
        entry.reasoningEfforts.includes(effort) &&
        entry.inputModalities.includes("text") &&
        (!needsImage || entry.inputModalities.includes("image")),
    )
  );
}

export async function typedSource(
  ctx: QueryCtx,
  source: Doc<"sources">,
  bound: Doc<"sources">["personalAnalysis"] | null = source.personalAnalysis ??
    null,
) {
  const required =
    !!source.currentRevisionId ||
    ["github_repository", "reddit_thread"].includes(source.sourceType ?? "") ||
    source.analysis?.schemaVersion === "2.0.0" ||
    !!bound?.sourceRevisionId;
  ensure(
    !source.publicImportId && source.rightsAttested && sourceRetained(source),
    "SOURCE_UNAVAILABLE",
    "Source rights or retained evidence changed.",
  );
  if (!required) return null;
  const row = source.currentRevisionId
    ? await ctx.db.get(source.currentRevisionId)
    : null;
  const registry = row ? await retainedSourceRevision(ctx, row) : null;
  ensure(
    row &&
      row.sourceId === source._id &&
      row.organizationId === source.organizationId &&
      row.generation === source.generation &&
      registry &&
      sourcePolicyCurrent(registry.revision) &&
      (!bound ||
        (bound.sourceRevisionId === row._id &&
          bound.sourceContentHash === row.contentHash)),
    "INVALID_EVIDENCE",
    "Review the exact current retained source evidence.",
  );
  ensure(
    registry.evidence.map((record) => record.excerpt).join("\n").length <=
      60000,
    "INVALID_EVIDENCE",
    "Source excerpts exceed the approved text bound.",
  );
  return {
    id: row._id,
    revision: registry.revision,
    evidence: registry.evidence,
  };
}

// A personal alpha is explicitly bound to verified WorkOS subjects. Email or
// a saved preference cannot activate subscription permission for hosted users.
async function authorizedDevice(ctx: QueryCtx, hash: string) {
  ensure(
    process.env.RESTORE_LOCK !== "true",
    "FORBIDDEN",
    "Recovery is in progress.",
  );
  ensure(
    /^[a-f0-9]{64}$/.test(hash),
    "FORBIDDEN",
    "Invalid device credential.",
  );
  const device = await ctx.db
    .query("devices")
    .withIndex("by_credential", (q) => q.eq("credentialHash", hash))
    .unique();
  const actor = device ? await ctx.db.get(device.owner) : null;
  const organization = device ? await ctx.db.get(device.organizationId) : null;
  const membership = device
    ? await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q
            .eq("organizationId", device.organizationId)
            .eq("userId", device.owner),
        )
        .unique()
    : null;
  ensure(
    device?.state === "paired" &&
      actor?.status === "active" &&
      workspaceReadable(organization, actor._id) &&
      membership &&
      ["owner", "admin", "member"].includes(membership.role) &&
      personalAllowed(actor.subject),
    "FORBIDDEN",
    "Personal analysis is unavailable for this device or account.",
  );
  return device;
}
// Check the sensitive authorization before uploading bytes. Approval still
// repeats this check, because a long upload can outlast the fresh session.
export const checkSession = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const { actor } = await access(ctx, a.organizationId, [
      "owner",
      "admin",
      "member",
    ]);
    await recentAuthentication(ctx);
    ensure(
      personalAllowed(actor.subject),
      "FORBIDDEN",
      "Personal analysis is unavailable for this account.",
    );
    return true;
  },
});
export const approve = mutation({
  args: {
    id: v.id("sources"),
    generation: v.number(),
    ...personalApprovalFields,
  },
  handler: approvePersonal,
});
export const approveBatch = mutation({
  args: {
    sources: v.array(v.object({ id: v.id("sources"), generation: v.number() })),
    ...personalApprovalFields,
  },
  handler: async (ctx, a) => {
    ensure(
      a.sources.length > 0 &&
        a.sources.length <= 5 &&
        new Set(a.sources.map((s) => s.id)).size === a.sources.length,
      "INVALID_INPUT",
      "Approve up to five distinct sources per batch.",
    );
    const started: Id<"sources">[] = [];
    for (const item of a.sources) {
      const source = await ctx.db.get(item.id);
      ensure(source, "FORBIDDEN", "Source unavailable.");
      // Authorization precedes the duplicate check, including already-ready rows.
      await writeAccess(ctx, source.organizationId);
      if (["ready", "queued", "processing"].includes(source.state)) continue;
      await approvePersonal(ctx, {
        ...item,
        deviceId: a.deviceId,
        model: a.model,
        effort: a.effort,
        useOwnPlan: a.useOwnPlan,
        maxComputeCredits: a.maxComputeCredits,
      });
      started.push(item.id);
    }
    return { started };
  },
});
export async function approvePersonal(ctx: MutationCtx, a: PersonalApproval) {
  return approvePersonalCore(ctx, a);
}
export async function approvePersonalCore(
  ctx: MutationCtx,
  a: PersonalApproval,
  authorization?: { actor: Doc<"users">; scanId: Id<"libraryScans"> },
) {
  const source = await ctx.db.get(a.id);
  ensure(
    source && source.state !== "deleted",
    "FORBIDDEN",
    "Source unavailable.",
  );
  const { actor } =
    authorization ?? (await writeAccess(ctx, source.organizationId));
  if (authorization) {
    const scan = await ctx.db.get(authorization.scanId);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", source.organizationId).eq("userId", actor._id),
      )
      .unique();
    const organization = await ctx.db.get(source.organizationId);
    ensure(
      actor.status === "active" &&
        workspaceReadable(organization, actor._id) &&
        membership &&
        ["owner", "admin"].includes(membership.role) &&
        process.env.RESTORE_LOCK !== "true" &&
        scan?.organizationId === source.organizationId &&
        scan.actor === actor._id &&
        scan.state === "running" &&
        scan.funding === "own_plan" &&
        scan.personal &&
        scan.personal.expiresAt > Date.now() &&
        scan.personal.deviceId === a.deviceId &&
        scan.personal.model === a.model &&
        scan.personal.effort === a.effort &&
        scan.scope === "saved_links" &&
        source.kind === "url" &&
        source.createdAt <= scan.asOf,
      "APPROVAL_STALE",
      "Review the current scan authorization.",
    );
  } else await recentAuthentication(ctx);
  await limit(ctx, `personal-approval:${actor._id}`, 6);
  const device = await ctx.db.get(a.deviceId);
  ensure(
    personalAllowed(actor.subject) &&
      a.useOwnPlan &&
      device?.state === "paired" &&
      device.owner === actor._id &&
      device.organizationId === source.organizationId,
    "FORBIDDEN",
    "Use your own paired computer and explicit plan permission.",
  );
  ensure(
    source.generation === a.generation &&
      !["queued", "processing", "ready"].includes(source.state),
    "APPROVAL_STALE",
    "Review the current source state before approving.",
  );
  ensure(
    !source.personalOrderedInput || !authorization,
    "POLICY_BLOCKED",
    "Ordered media requires its own explicit source approval.",
  );
  if (source.personalOrderedInput) {
    const { input, rows } = await orderedInput(ctx, source);
    const retained = await reusablePersonalOrderedPreparation(ctx, source);
    ensure(
      device.subscriptionCapabilities &&
        device.personalInputProtocols?.includes("ordered-personal-v1") &&
        (device.personalSeenAt ?? 0) > Date.now() - 60000 &&
        /^[a-f0-9]{64}$/.test(device.personalProfileBinding ?? "") &&
        sourceCapabilityCurrent(
          device,
          a.model,
          a.effort,
          device.personalProfileBinding!,
          true,
        ),
      "SETUP_REQUIRED",
      "Connect the current ordered-media runner and choose an available image-capable model and effort.",
    );
    ensure(
      a.maxComputeCredits === 10 &&
        process.env.MEDIA_VERIFIED === "true" &&
        process.env.ORDERED_MEDIA_VERIFIED === "true",
      "SETUP_REQUIRED",
      "Approve the verified ordered media worker's maximum 10 compute credits.",
    );
    const rate = Number(process.env.SANDBOX_CREDITS_PER_SECOND);
    ensure(
      Number.isFinite(rate) && rate > 0 && Math.ceil(300 * rate) <= 10,
      "QUOTE_CHANGED",
      "The bounded compute quote is unavailable.",
    );
    const prior =
      source.personalAnalysis &&
      (await ctx.db
        .query("reservations")
        .withIndex("by_key", (q) =>
          q
            .eq("organizationId", source.organizationId)
            .eq(
              "key",
              `personal-media:${source._id}:${source.personalAnalysis!.generation}`,
            ),
        )
        .unique());
    ensure(
      prior?.state !== "active",
      "COST_RECONCILIATION_REQUIRED",
      "Reconcile earlier compute before retrying.",
    );
    const generation = source.generation + 1,
      now = Date.now();
    await reserve(
      ctx,
      source.organizationId,
      `source:${source._id}:${generation}`,
      0,
    );
    for (const row of rows)
      await ctx.db.patch(row._id, { sourceGeneration: generation });
    const inputBinding = await orderedInputHash(
      source,
      input,
      rows.map((row) => ({ ...row, sourceGeneration: generation })),
      generation,
    );
    const reusedMedia = retained
      ? { ...retained, generation, inputBinding }
      : undefined;
    if (retained)
      for (const object of retained.objects) {
        const id = ctx.db.normalizeId("assets", object.assetId)!;
        await ctx.db.patch(id, { sourceGeneration: generation });
      }
    await ctx.db.patch(source._id, {
      generation,
      state: "queued",
      managedAnalysisActor: undefined,
      personalMedia: reusedMedia,
      orderedMedia: undefined,
      analysis: undefined,
      summary: undefined,
      error: undefined,
      personalAnalysis: {
        deviceId: device._id,
        actor: actor._id,
        generation,
        model: a.model,
        profileBinding: device.personalProfileBinding!,
        effort: a.effort,
        capabilityHash: device.subscriptionCapabilities.hash,
        state: "queued",
        approvedAt: now,
        expiresAt: now + 900000,
        leaseUntil: 0,
        deadline: 0,
        stage: "preflight",
        ordered: {
          schemaVersion: "ordered-personal-v1",
          phase: "preflight",
          inputBinding,
          ...(reusedMedia
            ? { preparedHash: await socialHash(canonicalJson(reusedMedia)) }
            : {}),
        },
      },
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(900000, internal.personalMediaState.expire, {
      id: source._id,
      generation,
    });
    await audit(
      ctx,
      source.organizationId,
      actor._id,
      "personal_ordered_approved",
      `${source._id}:${generation}`,
    );
    return;
  }
  ensure(
    !source.orderedMedia && !source.orderedPreparation && !source.serviceIntent,
    "POLICY_BLOCKED",
    "This ordered source needs its reviewed own-subscription route. No legacy video or paid fallback was used.",
  );
  const registry = await typedSource(ctx, source, null);
  ensure(
    (registry ||
      (source.kind === "text" && source.text) ||
      (source.kind === "upload" && source.objectKey) ||
      (source.kind === "url" &&
        source.url &&
        process.env.ACQUISITION_VERIFIED === "true")) &&
      source.rightsAttested,
    "UPLOAD_REQUIRED",
    "The link downloader is unavailable. Save this link or attach permitted media.",
  );
  ensure(
    (device.personalSeenAt ?? 0) > Date.now() - 60000 &&
      /^[a-f0-9]{64}$/.test(device.personalProfileBinding ?? "") &&
      device.personalModels?.some((m) => m.slug === a.model),
    "SETUP_REQUIRED",
    "Start the personal analysis runner and choose an available account model.",
  );
  if (authorization) {
    const scan = await ctx.db.get(authorization.scanId);
    ensure(
      device.personalProfileBinding === scan?.personal?.profileBinding,
      "APPROVAL_STALE",
      "The connected account changed.",
    );
  }
  const generation = source.generation + 1;
  const media = source.kind !== "text" && !registry;
  const reusedPreparation = media
    ? await reusablePersonalPreparation(ctx, source)
    : null;
  const prepareMedia = media && !reusedPreparation;
  ensure(
    sourceCapabilityCurrent(
      device,
      a.model,
      a.effort,
      device.personalProfileBinding!,
      media,
    ),
    "APPROVAL_STALE",
    "Reconnect your account and select a currently advertised model, effort and input type.",
  );
  if (source.kind === "url" && !registry) acquisitionPolicy(source.url!);
  if (prepareMedia) {
    const unresolved = await ctx.db
      .query("reservations")
      .withIndex("by_org", (q) => q.eq("organizationId", source.organizationId))
      .collect();
    ensure(
      !unresolved.some(
        (r) =>
          r.key.startsWith(`personal-media:${source._id}:`) &&
          r.state === "active",
      ),
      "COST_RECONCILIATION_REQUIRED",
      "Reconcile the earlier media compute reservation before retrying.",
    );
    ensure(
      a.maxComputeCredits === 10 && process.env.MEDIA_VERIFIED === "true",
      "SETUP_REQUIRED",
      "Approve the verified media worker's maximum 10 compute credits.",
    );
    if (source.kind === "upload") {
      const asset = await ctx.db
        .query("assets")
        .withIndex("by_key", (q) => q.eq("key", source.objectKey!))
        .unique();
      ensure(
        asset?.state === "complete" &&
          asset.sourceId === source._id &&
          asset.organizationId === source.organizationId &&
          (asset.expiresAt === undefined || asset.expiresAt > Date.now()),
        "UPLOAD_INVALID",
        "The original media is unavailable.",
      );
    }
    await reserve(
      ctx,
      source.organizationId,
      `personal-media:${source._id}:${generation}`,
      10,
    );
  }
  await reserve(
    ctx,
    source.organizationId,
    `source:${source._id}:${generation}`,
    0,
  );
  await ctx.db.patch(source._id, {
    generation,
    state: prepareMedia ? "processing" : "queued",
    managedAnalysisActor: undefined,
    personalMedia: reusedPreparation ?? undefined,
    error: undefined,
    personalAnalysis: {
      deviceId: device._id,
      actor: actor._id,
      generation,
      model: a.model,
      profileBinding: device.personalProfileBinding!,
      ...(registry
        ? {
            sourceRevisionId: registry.id,
            sourceContentHash: registry.revision.contentHash,
          }
        : {}),
      effort: a.effort,
      ...(device.subscriptionCapabilities
        ? { capabilityHash: device.subscriptionCapabilities.hash }
        : {}),
      state: prepareMedia ? "preparing" : "queued",
      approvedAt: Date.now(),
      expiresAt: Date.now() + 900000,
      leaseUntil: 0,
      deadline: 0,
      stage: prepareMedia ? "preparing" : "analyzing",
    },
    updatedAt: Date.now(),
  });
  if (registry) await ctx.db.patch(registry.id, { generation });
  if (prepareMedia)
    await workflow.start(
      ctx,
      internal.workflows.personalPreparation,
      { id: source._id, generation },
      {
        onComplete: internal.workflows.completed,
        context: null,
        startAsync: true,
      },
    );
  if (prepareMedia)
    await ctx.scheduler.runAfter(900000, internal.personalMediaState.expire, {
      id: source._id,
      generation,
    });
  await audit(
    ctx,
    source.organizationId,
    actor._id,
    "personal_analysis_approved",
    `${source._id}:${generation}`,
  );
}
export const cancel = mutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const source = await ctx.db.get(id);
    ensure(
      source && source.personalAnalysis,
      "FORBIDDEN",
      "Personal analysis unavailable.",
    );
    const { actor } = await writeAccess(ctx, source.organizationId);
    ensure(
      source.personalAnalysis.actor === actor._id,
      "FORBIDDEN",
      "Only the approving account may cancel its plan request.",
    );
    if (
      !["preparing", "queued", "running"].includes(
        source.personalAnalysis.state,
      )
    )
      return;
    await releaseUnstarted(
      ctx,
      source.organizationId,
      source._id,
      source.personalAnalysis.generation,
    );
    await settle(
      ctx,
      source.organizationId,
      `source:${id}:${source.personalAnalysis.generation}`,
      0,
    );
    if (source.personalAnalysis.ordered && source.personalOrderedInput) {
      // Cancellation fences execution immediately, while an explicit later
      // approval may still review the same retained original private objects.
      const input = personalOrderedInputSchema.parse(
        source.personalOrderedInput,
      );
      for (const item of input.assets) {
        const row = await ctx.db
          .query("assets")
          .withIndex("by_key", (q) => q.eq("key", item.key))
          .unique();
        if (
          row?.organizationId === source.organizationId &&
          row.sourceId === source._id &&
          row.sourceGeneration === source.generation
        )
          await ctx.db.patch(row._id, {
            sourceGeneration: source.generation + 1,
          });
      }
    }
    if (source.personalAnalysis.ordered) {
      const d = await ctx.db.get(source.personalAnalysis.deviceId);
      if (d?.activePersonalSource === id)
        await ctx.db.patch(d._id, { activePersonalSource: undefined });
    }
    await ctx.db.patch(id, {
      state: "failed",
      generation: source.generation + 1,
      personalAnalysis: { ...source.personalAnalysis, state: "canceled" },
      error:
        "Personal analysis was canceled. Your plan may have counted work already started.",
      updatedAt: Date.now(),
    });
    if (
      source.personalAnalysis.sourceRevisionId &&
      source.currentRevisionId === source.personalAnalysis.sourceRevisionId
    ) {
      const row = await ctx.db.get(source.currentRevisionId);
      if (
        row?.organizationId === source.organizationId &&
        row.sourceId === source._id &&
        row.generation === source.generation &&
        row.state === "current"
      )
        await ctx.db.patch(row._id, { generation: source.generation + 1 });
    }
  },
});
export const dispatch = internalMutation({
  args: {
    credentialHash: v.string(),
    operation: v.union(
      v.literal("hello"),
      v.literal("poll"),
      v.literal("heartbeat"),
      v.literal("complete"),
      v.literal("fail"),
      v.literal("ordered_preflight"),
    ),
    models: v.optional(
      v.array(v.object({ slug: v.string(), displayName: v.string() })),
    ),
    profileBinding: v.optional(v.string()),
    capabilities: v.optional(subscriptionCapabilitiesValue),
    sessionExpiresAt: v.optional(v.number()),
    inputProtocols: v.optional(v.array(v.literal("ordered-personal-v1"))),
    claimToken: v.optional(v.string()),
    localAsrReady: v.optional(v.boolean()),
    orderedEvidence: v.optional(v.any()),
    id: v.optional(v.id("sources")),
    generation: v.optional(v.number()),
    output: v.optional(v.any()),
    transcript: v.optional(v.any()),
    stage: v.optional(
      v.union(v.literal("transcribing"), v.literal("analyzing")),
    ),
    usage: v.optional(
      v.object({ inputTokens: v.number(), outputTokens: v.number() }),
    ),
  },
  handler: async (ctx, a) => {
    const device = await authorizedDevice(ctx, a.credentialHash);
    await limit(ctx, `personal-device:${device._id}`, 24);
    const now = Date.now();
    if (a.operation === "hello") {
      ensure(
        a.models &&
          a.models.length > 0 &&
          a.models.length <= 50 &&
          /^[a-f0-9]{64}$/.test(a.profileBinding ?? "") &&
          a.models.every(
            (m) =>
              /^[a-zA-Z0-9_.:-]{1,100}$/.test(m.slug) &&
              m.displayName.length <= 120,
          ) &&
          new Set(a.models.map((m) => m.slug)).size === a.models.length,
        "INVALID_INPUT",
        "Invalid model catalogue.",
      );
      if (a.capabilities) {
        ensure(
          a.capabilities.models.length === a.models!.length &&
            a.capabilities.models.every((entry) =>
              a.models!.some((model) => model.slug === entry.slug),
            ),
          "INVALID_INPUT",
          "The announced model catalogue changed.",
        );
        await capabilitySnapshot(
          ctx,
          device,
          a.capabilities,
          a.profileBinding!,
          a.sessionExpiresAt!,
        );
      }
      await ctx.db.patch(device._id, {
        personalModels: a.models,
        personalProfileBinding: a.profileBinding,
        personalSeenAt: now,
        personalInputProtocols:
          a.capabilities && a.inputProtocols?.length === 1
            ? a.inputProtocols
            : undefined,
      });
      return {
        online: true,
        workspaceId: device.organizationId,
        ...(a.capabilities ? { capabilityProtocolVersion: "1.0.0" } : {}),
      };
    }
    await ctx.db.patch(device._id, { personalSeenAt: now });
    if (a.operation === "poll") {
      if (device.activePersonalSource) {
        const active = await ctx.db.get(device.activePersonalSource);
        if (
          active?.personalAnalysis?.state === "running" &&
          active.personalAnalysis.leaseUntil <= now
        ) {
          await ctx.db.patch(active._id, {
            state: "failed",
            error:
              "The laptop lease expired. Usage is uncertain; review before approving another request.",
            personalAnalysis: { ...active.personalAnalysis, state: "expired" },
            updatedAt: now,
          });
          await settle(
            ctx,
            device.organizationId,
            `source:${active._id}:${active.personalAnalysis.generation}`,
            0,
          );
        }
        return {
          job: null,
          reconcile: {
            id: device.activePersonalSource,
            generation: active?.personalAnalysis?.generation ?? null,
            ...(active?.personalAnalysis?.ordered
              ? {
                  inputKind: "ordered-personal-v1",
                  claimToken: active.personalAnalysis.ordered.leaseToken,
                }
              : {}),
          },
        };
      }
      const queued = await ctx.db
        .query("sources")
        .withIndex("by_personal_device_state", (q) =>
          q
            .eq("personalAnalysis.deviceId", device._id)
            .eq("personalAnalysis.state", "queued"),
        )
        .take(20);
      for (const source of queued) {
        const job = source.personalAnalysis!;
        if (!pairedPersonalJob(job)) continue;
        let registry;
        try {
          registry = await typedSource(ctx, source);
        } catch {
          registry = undefined;
        }
        if (
          registry === undefined ||
          job.expiresAt <= now ||
          source.state !== "queued" ||
          source.generation !== job.generation ||
          job.actor !== device.owner ||
          job.profileBinding !== device.personalProfileBinding ||
          source.organizationId !== device.organizationId ||
          !sourceCapabilityCurrent(
            device,
            job.model,
            job.effort,
            job.profileBinding,
            !!job.ordered || !!source.personalMedia?.frames?.length,
            job.capabilityHash,
          ) ||
          !device.personalModels?.some((m) => m.slug === job.model) ||
          (!!job.ordered &&
            (!device.personalInputProtocols?.includes("ordered-personal-v1") ||
              !job.capabilityHash))
        ) {
          await ctx.db.patch(source._id, {
            personalAnalysis: { ...job, state: "expired" },
            state: "failed",
            error: "Personal approval expired or changed. Review it again.",
            updatedAt: now,
          });
          await settle(
            ctx,
            source.organizationId,
            `source:${source._id}:${job.generation}`,
            0,
          );
          continue;
        }
        const leaseUntil = now + 40000,
          deadline = Math.min(
            job.expiresAt,
            now +
              (job.ordered?.phase === "preflight"
                ? 180000
                : source.kind !== "text" && !registry
                  ? 900000
                  : 180000),
          );
        const claimToken = job.ordered ? crypto.randomUUID() : undefined;
        if (job.ordered) {
          const bound = await orderedInput(ctx, source);
          ensure(
            job.ordered.inputBinding ===
              (await orderedInputHash(source, bound.input, bound.rows)),
            "APPROVAL_STALE",
            "Ordered input changed.",
          );
          if (job.ordered.phase === "analysis")
            await orderedPrepared(ctx, source);
        }
        await ctx.db.patch(source._id, {
          state: "processing",
          personalAnalysis: {
            ...job,
            state: "running",
            stage:
              source.kind !== "text" && !registry
                ? "transcribing"
                : "analyzing",
            leaseUntil,
            deadline,
            ...(job.ordered
              ? { ordered: { ...job.ordered, leaseToken: claimToken } }
              : {}),
          },
          updatedAt: now,
        });
        await ctx.db.patch(device._id, { activePersonalSource: source._id });
        if (job.ordered) {
          const bound = await orderedInput(ctx, source);
          return {
            job: {
              inputKind: "ordered-personal-v1",
              phase: job.ordered.phase,
              id: source._id,
              generation: job.generation,
              model: job.model,
              effort: job.effort,
              profileBinding: job.profileBinding,
              capabilityHash: job.capabilityHash,
              claimToken,
              inputBinding: job.ordered.inputBinding,
              needsAudio: bound.input.assets.some(
                (asset) => asset.kind === "video",
              ),
              ...(job.ordered.phase === "analysis"
                ? { media: source.personalMedia }
                : {}),
              leaseUntil,
              deadline,
            },
          };
        }
        return {
          job: {
            id: source._id,
            generation: job.generation,
            model: job.model,
            effort: job.effort,
            profileBinding: job.profileBinding,
            ...(job.capabilityHash
              ? { capabilityHash: job.capabilityHash }
              : {}),
            ...(registry
              ? { sourceRevisionRegistry: registry }
              : { text: source.text }),
            ...(!registry && source.acquisition?.description
              ? { caption: source.acquisition.description }
              : {}),
            categoryVocabulary: (
              await vocabulary(ctx, source.organizationId)
            ).map((c) => c.name),
            coverage: registry
              ? "source_text"
              : source.kind !== "text"
                ? source.personalMedia?.coverage
                : "caption_only",
            ...(source.kind !== "text" && !registry
              ? { media: source.personalMedia }
              : {}),
            leaseUntil,
            deadline,
          },
        };
      }
      return { job: null };
    }
    // A duplicate confirmed preflight ACK can observe its own committed handoff,
    // but cannot schedule another preparation or affect a later analysis claim.
    if (a.operation === "ordered_preflight" && a.id) {
      const prior = await ctx.db.get(a.id),
        j = prior?.personalAnalysis;
      if (
        prior &&
        prior.generation === a.generation &&
        prior.organizationId === device.organizationId &&
        j?.deviceId === device._id &&
        j.actor === device.owner &&
        (j.ordered?.phase === "preparing" ||
          (j.ordered?.phase === "analysis" &&
            prior.personalMedia?.preparation)) &&
        j.ordered.preflightHash &&
        typeof a.claimToken === "string"
      ) {
        const candidate = await socialHash(
          canonicalJson({
            id: prior._id,
            generation: j.generation,
            claimToken: a.claimToken,
            inputBinding: j.ordered.inputBinding,
            capabilityHash: j.capabilityHash,
            profileBinding: j.profileBinding,
            model: j.model,
            effort: j.effort,
          }),
        );
        const input = await orderedInput(ctx, prior);
        if (j.ordered.phase === "analysis") await orderedPrepared(ctx, prior);
        ensure(
          candidate === j.ordered.preflightHash &&
            j.ordered.inputBinding ===
              (await orderedInputHash(prior, input.input, input.rows)),
          "APPROVAL_STALE",
          "The preflight handoff changed.",
        );
        return { accepted: true, deferred: true };
      }
    }
    ensure(
      a.id && device.activePersonalSource === a.id,
      "APPROVAL_STALE",
      "No matching active job.",
    );
    const source = await ctx.db.get(a.id);
    const job = source?.personalAnalysis;
    ensure(
      !job?.ordered ||
        (["preflight", "analysis"].includes(job.ordered.phase) &&
          ["running", "expired"].includes(job.state) &&
          a.claimToken === job.ordered.leaseToken &&
          typeof a.claimToken === "string" &&
          source?.generation === a.generation),
      "APPROVAL_STALE",
      "The ordered phase lease changed.",
    );
    if (a.operation === "fail") {
      ensure(
        !source ||
          !job ||
          (job.deviceId === device._id && job.generation === a.generation),
        "APPROVAL_STALE",
        "Wrong job generation.",
      );
      if (source && job?.state === "running") {
        await settle(
          ctx,
          device.organizationId,
          `source:${source._id}:${job.generation}`,
          0,
        );
        await ctx.db.patch(source._id, {
          state: "failed",
          personalAnalysis: { ...job, state: "failed" },
          error:
            "The personal model request did not complete. No alternate provider was used. Review plan usage before retrying.",
          updatedAt: now,
        });
      }
      ensure(
        device.activePersonalSource === a.id &&
          (!job || job.generation === a.generation),
        "APPROVAL_STALE",
        "The active device job changed.",
      );
      await ctx.db.patch(device._id, { activePersonalSource: undefined });
      return { stopped: true };
    }
    let currentDevice = device;
    if (
      ["heartbeat", "ordered_preflight"].includes(a.operation) &&
      a.capabilities &&
      job?.capabilityHash &&
      job.deviceId === device._id &&
      job.generation === a.generation &&
      job.profileBinding === device.personalProfileBinding &&
      device.subscriptionCapabilities
    ) {
      const snapshot = await capabilitySnapshot(
        ctx,
        device,
        a.capabilities,
        job.profileBinding,
        device.subscriptionCapabilities.sessionExpiresAt,
      );
      currentDevice = { ...device, subscriptionCapabilities: snapshot };
    }
    ensure(
      source &&
        source.organizationId === device.organizationId &&
        ["text", "upload", "url"].includes(source.kind) &&
        source.state === "processing" &&
        job?.deviceId === device._id &&
        job.actor === device.owner &&
        job.profileBinding === device.personalProfileBinding &&
        sourceCapabilityCurrent(
          currentDevice,
          job.model,
          job.effort,
          job.profileBinding,
          !!job.ordered || !!source.personalMedia?.frames?.length,
          job.capabilityHash,
        ) &&
        device.personalModels?.some((entry) => entry.slug === job.model) &&
        job.state === "running" &&
        source.generation === a.generation &&
        job.generation === a.generation &&
        job.leaseUntil > now &&
        job.deadline > now,
      "APPROVAL_STALE",
      "Personal lease was canceled, expired or changed.",
    );
    const registry = await typedSource(ctx, source);
    if (job.ordered) {
      const bound = await orderedInput(ctx, source);
      ensure(
        job.ordered.inputBinding ===
          (await orderedInputHash(source, bound.input, bound.rows)) &&
          device.personalInputProtocols?.includes("ordered-personal-v1"),
        "APPROVAL_STALE",
        "Ordered input or runner changed.",
      );
      if (a.operation === "ordered_preflight") {
        ensure(
          job.ordered.phase === "preflight" &&
            a.capabilities &&
            a.profileBinding === job.profileBinding &&
            a.localAsrReady === true &&
            currentDevice.subscriptionCapabilities?.hash === job.capabilityHash,
          "APPROVAL_STALE",
          "The selected actual account catalogue or local ASR changed.",
        );
        const rate = Number(process.env.SANDBOX_CREDITS_PER_SECOND);
        ensure(
          process.env.MEDIA_VERIFIED === "true" &&
            process.env.ORDERED_MEDIA_VERIFIED === "true" &&
            Number.isFinite(rate) &&
            rate > 0 &&
            Math.ceil(300 * rate) <= 10,
          "SETUP_REQUIRED",
          "Verified ordered preparation is unavailable.",
        );
        const preflightHash = await socialHash(
          canonicalJson({
            id: source._id,
            generation: job.generation,
            claimToken: a.claimToken,
            inputBinding: job.ordered.inputBinding,
            capabilityHash: job.capabilityHash,
            profileBinding: job.profileBinding,
            model: job.model,
            effort: job.effort,
          }),
        );
        if (source.personalMedia?.preparation && job.ordered.preparedHash) {
          await reconciledOrderedCompute(ctx, source, true);
          await orderedPrepared(ctx, source);
          await ctx.db.patch(source._id, {
            state: "queued",
            personalAnalysis: {
              ...job,
              state: "queued",
              stage: "analyzing",
              leaseUntil: 0,
              deadline: 0,
              ordered: {
                ...job.ordered,
                phase: "analysis",
                leaseToken: undefined,
                preflightHash,
              },
            },
            updatedAt: now,
          });
          await ctx.db.patch(device._id, { activePersonalSource: undefined });
          return { accepted: true, deferred: true };
        }
        await reserve(
          ctx,
          source.organizationId,
          `personal-media:${source._id}:${job.generation}`,
          10,
        );
        await ctx.db.patch(source._id, {
          personalAnalysis: {
            ...job,
            state: "preparing",
            stage: "preparing",
            leaseUntil: 0,
            deadline: 0,
            ordered: {
              ...job.ordered,
              phase: "preparing",
              leaseToken: undefined,
              preflightHash,
            },
          },
          updatedAt: now,
        });
        await ctx.db.patch(device._id, { activePersonalSource: undefined });
        await workflow.start(
          ctx,
          internal.workflows.personalPreparation,
          { id: source._id, generation: job.generation, ordered: true },
          {
            onComplete: internal.workflows.completed,
            context: null,
            startAsync: true,
          },
        );
        return { accepted: true, deferred: true };
      }
      ensure(
        a.operation === "heartbeat" || job.ordered.phase === "analysis",
        "APPROVAL_STALE",
        "Finish fresh preflight before analysing.",
      );
      if (job.ordered.phase === "analysis") await orderedPrepared(ctx, source);
      if (a.operation === "complete") {
        const validated = await orderedCompletion(
            ctx,
            source,
            a.orderedEvidence,
            a.output,
          ),
          output = validated.analysis;
        ensure(
          !a.usage ||
            [a.usage.inputTokens, a.usage.outputTokens].every(
              (n) => Number.isSafeInteger(n) && n >= 0 && n <= 10000000,
            ),
          "INVALID_INPUT",
          "Invalid plan usage.",
        );
        await settle(
          ctx,
          source.organizationId,
          `source:${source._id}:${job.generation}`,
          0,
        );
        await ctx.db.patch(source._id, {
          state: "ready",
          orderedMedia: validated.prepared,
          analysis: output,
          analysisPipelineVersion: "official-personal-ordered-v1",
          summary: output.summary,
          coverage: "ordered_media",
          personalAnalysis: { ...job, state: "completed", ...a.usage },
          error: undefined,
          updatedAt: now,
        });
        await syncCategories(ctx, (await ctx.db.get(source._id))!, output);
        await syncKnowledge(ctx, (await ctx.db.get(source._id))!, {
          enqueue: false,
        });
        await ctx.db.patch(device._id, { activePersonalSource: undefined });
        return { accepted: true };
      }
    } else
      ensure(
        a.orderedEvidence === undefined && a.operation !== "ordered_preflight",
        "INVALID_INPUT",
        "Ordered evidence requires its own approved protocol.",
      );
    if (a.operation === "heartbeat") {
      ensure(
        !registry || a.stage !== "transcribing",
        "INVALID_EVIDENCE",
        "Typed text sources have no audiovisual processing stage.",
      );
      await ctx.db.patch(source._id, {
        personalAnalysis: {
          ...job,
          ...(a.stage ? { stage: a.stage } : {}),
          leaseUntil: Math.min(now + 40000, job.deadline),
        },
      });
      return { valid: true, deadline: job.deadline };
    }
    await completePersonalSource(ctx, source, job, a, registry, now);
    await ctx.db.patch(device._id, { activePersonalSource: undefined });
    return { accepted: true };
  },
});

// Both executors commit through this validator. It does not grant execution
// authority; the caller must hold the exact current source lease.
export function validatePersonalTextOutput(
  source: Doc<"sources">,
  value: unknown,
  registry: Awaited<ReturnType<typeof typedSource>>,
  processingRunId: string,
) {
  const output: any = presentAnalysis(
    (registry ? sourceInsightOutput : insightOutput).parse(value) as any,
  );
  ensure(
    JSON.stringify(output).length <= 120000 &&
      !containsSecret(JSON.stringify(output)) &&
      output.sourceId === source._id &&
      output.processingRunId === processingRunId &&
      output.coverage === (registry ? "source_text" : "caption_only"),
    "INVALID_EVIDENCE",
    "Invalid personal source output.",
  );
  ensure(
    !registry ||
      (output.sourceRevisionId === registry.id &&
        output.sourceContentHash === registry.revision.contentHash),
    "INVALID_EVIDENCE",
    "Output is bound to a different retained revision.",
  );
  const allowed = registry
    ? registry.evidence.map((record) => ({
        kind: record.kind,
        id: record.id,
        startMs: null,
        endMs: null,
      }))
    : [
        { kind: "user_note", id: "supplied_text", startMs: null, endMs: null },
        ...(source.acquisition?.description
          ? [
              {
                kind: "caption",
                id: "post_caption",
                startMs: null,
                endMs: null,
              },
            ]
          : []),
      ];
  for (const insight of output.insights) {
    ensure(
      !registry || insight.evidence.length > 0,
      "INVALID_EVIDENCE",
      "Each typed claim needs current source evidence.",
    );
    for (const evidence of insight.evidence)
      ensure(
        allowed.some(
          (e) =>
            e.kind === evidence.kind &&
            e.id === evidence.id &&
            e.startMs === evidence.startMs &&
            e.endMs === evidence.endMs,
        ),
        "INVALID_EVIDENCE",
        "Unverified evidence reference.",
      );
  }
  return output;
}
export async function completePersonalSource(
  ctx: MutationCtx,
  source: Doc<"sources">,
  job: NonNullable<Doc<"sources">["personalAnalysis"]>,
  a: {
    output?: unknown;
    transcript?: unknown;
    usage?: { inputTokens: number; outputTokens: number };
  },
  registry: Awaited<ReturnType<typeof typedSource>>,
  now: number,
  pipelineVersion?: string,
) {
  const media = source.kind !== "text" && !registry;
  const output: any = media
    ? presentAnalysis(
        (registry ? sourceInsightOutput : insightOutput).parse(a.output) as any,
      )
    : validatePersonalTextOutput(
        source,
        a.output,
        registry,
        `${source._id}:${job.generation}`,
      );
  if (media)
    output.warnings = [
      ...new Set([
        "Video frames are sampled; short scenes can be missed. Automatic transcription can contain errors.",
        ...output.warnings,
      ]),
    ].slice(0, 20);
  ensure(
    JSON.stringify(output).length <= 120000 &&
      !containsSecret(JSON.stringify(output)) &&
      output.sourceId === source._id &&
      output.processingRunId === `${source._id}:${job.generation}` &&
      output.coverage ===
        (registry
          ? "source_text"
          : media
            ? source.personalMedia?.coverage
            : "caption_only"),
    "INVALID_EVIDENCE",
    "Invalid personal source output.",
  );
  ensure(
    !registry ||
      (output.sourceRevisionId === registry.id &&
        output.sourceContentHash === registry.revision.contentHash),
    "INVALID_EVIDENCE",
    "Output is bound to a different retained revision.",
  );
  const transcript = media
    ? validateTranscript(a.transcript, source.personalMedia)
    : [];
  const evidenceList = registry
    ? registry.evidence.map((record) => ({
        kind: record.kind,
        id: record.id,
        startMs: null,
        endMs: null,
      }))
    : media
      ? [
          ...transcript.map((s: any) => ({
            kind: "transcript",
            id: s.id,
            startMs: s.startMs,
            endMs: s.endMs,
          })),
          ...source.personalMedia.frames.map((f: any) => ({
            kind: "frame",
            id: f.assetId,
            startMs: f.timestampMs,
            endMs: f.timestampMs,
          })),
        ]
      : [
          {
            kind: "user_note",
            id: "supplied_text",
            startMs: null,
            endMs: null,
          },
        ];
  if (!registry && source.acquisition?.description)
    evidenceList.push({
      kind: "caption",
      id: "post_caption",
      startMs: null,
      endMs: null,
    });
  if (media)
    for (const frame of source.personalMedia.frames) {
      const assetId = ctx.db.normalizeId("assets", frame.assetId);
      const asset = assetId ? await ctx.db.get(assetId) : null;
      ensure(
        asset?.sourceId === source._id &&
          asset.organizationId === source.organizationId &&
          asset.state === "complete" &&
          asset.kind === "evidence",
        "INVALID_EVIDENCE",
        "Frame evidence is unavailable.",
      );
    }
  for (const insight of output.insights) {
    ensure(
      !registry || insight.evidence.length > 0,
      "INVALID_EVIDENCE",
      "Each typed claim needs current source evidence.",
    );
    for (const evidence of insight.evidence)
      ensure(
        evidenceList.some(
          (e: any) =>
            e.kind === evidence.kind &&
            e.id === evidence.id &&
            e.startMs === evidence.startMs &&
            e.endMs === evidence.endMs,
        ),
        "INVALID_EVIDENCE",
        "Unverified evidence reference.",
      );
  }
  ensure(
    !a.usage ||
      [a.usage.inputTokens, a.usage.outputTokens].every(
        (n) => Number.isSafeInteger(n) && n >= 0 && n <= 10000000,
      ),
    "INVALID_INPUT",
    "Invalid plan usage.",
  );
  await settle(
    ctx,
    source.organizationId,
    `source:${source._id}:${job.generation}`,
    0,
  );
  await ctx.db.patch(source._id, {
    state: "ready",
    analysis: output,
    analysisPipelineVersion:
      pipelineVersion ??
      (registry
        ? "official-personal-cited-source-v2"
        : "official-personal-media-text-v1"),
    ...(media
      ? {
          text: transcript.map((s: any) => s.text).join(" "),
          mediaCoverage: output.coverage,
          mediaEvidence: evidenceList,
          originalMediaEvidence: evidenceList,
        }
      : {}),
    summary: output.summary,
    coverage: output.coverage,
    tags: [
      ...new Set([
        ...source.tags,
        ...output.insights.flatMap((i: any) => i.categories),
      ]),
    ].slice(0, 20),
    searchable: [
      source.title,
      source.text,
      ...transcript.map((s: any) => s.text),
      output.summary,
      ...source.tags,
      ...output.insights.flatMap((i: any) => i.categories),
    ].join(" "),
    personalAnalysis: { ...job, state: "completed", ...a.usage },
    error: undefined,
    updatedAt: now,
  });
  await syncCategories(ctx, (await ctx.db.get(source._id))!, output);
  await syncKnowledge(ctx, (await ctx.db.get(source._id))!, {
    enqueue: false,
  });
  if (media)
    await ctx.scheduler.runAfter(0, internal.assets.expireOriginal, {
      sourceId: source._id,
      generation: source.generation,
    });
  await ctx.db.insert("notifications", {
    organizationId: source.organizationId,
    key: `source:${source._id}:${job.generation}`,
    message: "A source summary is ready.",
    read: false,
    createdAt: now,
    updatedAt: now,
  });
  return { accepted: true };
}

export function validateTranscript(value: unknown, media: any): any[] {
  ensure(
    Array.isArray(value) &&
      value.length <= 200 &&
      (media.audio || value.length === 0),
    "INVALID_EVIDENCE",
    "Invalid automatic transcript.",
  );
  let chars = 0;
  for (let i = 0; i < value.length; i++) {
    const s = value[i];
    ensure(
      s &&
        Object.keys(s).every((k) =>
          ["id", "text", "startMs", "endMs"].includes(k),
        ) &&
        s.id === `segment-${i}` &&
        typeof s.text === "string" &&
        s.text.length <= 4000 &&
        Number.isSafeInteger(s.startMs) &&
        Number.isSafeInteger(s.endMs) &&
        s.startMs >= 0 &&
        s.endMs >= s.startMs &&
        s.endMs <= media.durationMs,
      "INVALID_EVIDENCE",
      "Invalid transcript timing or identity.",
    );
    chars += s.text.length;
  }
  ensure(
    chars <= 60000 && !containsSecret(JSON.stringify(value)),
    "INVALID_EVIDENCE",
    "Transcript exceeded its safe bound.",
  );
  return value;
}

export const mediaLease = internalQuery({
  args: {
    credentialHash: v.string(),
    id: v.id("sources"),
    generation: v.number(),
  },
  handler: async (ctx, a) => {
    const device = await authorizedDevice(ctx, a.credentialHash);
    const source = await ctx.db.get(a.id),
      job = source?.personalAnalysis;
    ensure(
      device.activePersonalSource === a.id &&
        source?.organizationId === device.organizationId &&
        source.rightsAttested &&
        sourceRetained(source) &&
        source.generation === a.generation &&
        source.state === "processing" &&
        job?.deviceId === device._id &&
        job.profileBinding === device.personalProfileBinding &&
        job.state === "running" &&
        job.leaseUntil > Date.now() &&
        job.deadline > Date.now(),
      "APPROVAL_STALE",
      "Media lease is unavailable.",
    );
    ensure(
      source.personalMedia,
      "INVALID_EVIDENCE",
      "Prepared media is missing.",
    );
    for (const b of [
      ...source.personalMedia.frames,
      ...(source.personalMedia.audio ? [source.personalMedia.audio] : []),
    ]) {
      const assetId = ctx.db.normalizeId("assets", b.assetId),
        asset = assetId ? await ctx.db.get(assetId) : null;
      ensure(
        asset?.sourceId === source._id &&
          asset.organizationId === source.organizationId &&
          asset.key === b.key &&
          asset.size === b.size &&
          asset.state === "complete" &&
          (asset.expiresAt === undefined || asset.expiresAt > Date.now()),
        "INVALID_EVIDENCE",
        "Private media expired or changed.",
      );
    }
    return {
      ...source.personalMedia,
      sourceAuthority: {
        sourceRetentionUntil: source.sourceRetentionUntil,
        creatorRights: source.creatorRights,
      },
    };
  },
});
export const orderedMediaLease = internalQuery({
  args: {
    credentialHash: v.string(),
    id: v.id("sources"),
    generation: v.number(),
    claimToken: v.string(),
  },
  handler: async (ctx, a) => {
    const device = await authorizedDevice(ctx, a.credentialHash),
      source = await ctx.db.get(a.id),
      j = source?.personalAnalysis;
    ensure(
      source &&
        device.activePersonalSource === source._id &&
        source.organizationId === device.organizationId &&
        source.state === "processing" &&
        source.generation === a.generation &&
        j?.state === "running" &&
        j.deviceId === device._id &&
        j.actor === device.owner &&
        j.profileBinding === device.personalProfileBinding &&
        j.ordered?.phase === "analysis" &&
        j.ordered.leaseToken === a.claimToken &&
        j.leaseUntil > Date.now() &&
        j.deadline > Date.now() &&
        j.capabilityHash &&
        device.personalInputProtocols?.includes("ordered-personal-v1") &&
        sourceCapabilityCurrent(
          device,
          j.model,
          j.effort,
          j.profileBinding,
          true,
          j.capabilityHash,
        ),
      "APPROVAL_STALE",
      "Ordered media lease changed.",
    );
    return (await orderedPrepared(ctx, source)).media;
  },
});
