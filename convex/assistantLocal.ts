import { internalQuery, type QueryCtx } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { ensure } from "../packages/policy";
import { limit } from "./lib";
import { personalAllowed } from "./lib/personalAccess";
import { workspaceReadable } from "./lib/workspacePrivacy";
import {
  intakeAuthority,
  validateLocalRun,
  checkProjectBindings,
} from "./lib/assistantIntake";
import { evaluationCurrent } from "./knowledge";
import { acquisitionMessage } from "../packages/media/acquisition";
import { capabilitySnapshot } from "./lib/localTaskAuthority";
import { claimLocalTask, localTaskOperation } from "./localLibraryTaskRuntime";
import { admitLocalRuntime, runtimeCurrent } from "./lib/privateSourceAnalysis";
import {
  sourceFingerprint,
  sourcePrepareCore,
  sourceFinishCore,
  frameContextCore,
  recordFrameCore,
  evaluationPrepareCore,
  recordInspectionCore,
  evaluationFinishCore,
} from "./localLibrary";

export async function assistantDevice(
  ctx: QueryCtx,
  hash: string,
  allowMember = false,
) {
  ensure(
    /^[a-f0-9]{64}$/.test(hash) && process.env.RESTORE_LOCK !== "true",
    "FORBIDDEN",
    "Device unavailable.",
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
      personalAllowed(actor.subject) &&
      workspaceReadable(organization, actor._id) &&
      membership &&
      (allowMember
        ? ["owner", "admin", "member"]
        : ["owner", "admin"]
      ).includes(membership.role),
    "FORBIDDEN",
    "Use your own authorized paired computer.",
  );
  return device;
}
async function boundOperation(
  ctx: QueryCtx,
  device: Awaited<ReturnType<typeof assistantDevice>>,
  operation: string,
  a: any,
) {
  const row = [
    "source_prepare",
    "evaluation_prepare",
    "project_work",
    "done",
    "fail",
  ].includes(operation)
    ? null
    : await ctx.db.get(a.id);
  const runId =
    a.runId ??
    (row && "runId" in row
      ? row.runId
      : row && "localRunId" in row
        ? row.localRunId
        : undefined);
  const run = runId ? await ctx.db.get(runId as Id<"localLibraryRuns">) : null;
  ensure(run?.actor === device.owner, "FORBIDDEN", "Local run unavailable.");
  ensure(
    !run.task,
    "FORBIDDEN",
    "Use the exact versioned task operation and lease.",
  );
  const intake = await validateLocalRun(ctx, run, device.owner);
  ensure(
    intake?.deviceId === device._id,
    "FORBIDDEN",
    "This work belongs to another computer.",
  );
}

export const frame = internalQuery({
  args: {
    credentialHash: v.string(),
    id: v.id("localSourceImports"),
    frameId: v.string(),
  },
  handler: async (ctx, a) => {
    const device = await assistantDevice(ctx, a.credentialHash);
    await boundOperation(ctx, device, "frame", a);
    return frameContextCore(ctx, a, device.owner);
  },
});

export const operation = internalMutation({
  args: { credentialHash: v.string(), operation: v.string(), args: v.any() },
  handler: async (ctx, input): Promise<any> => {
    const a = input.args;
    const versioned =
      (input.operation === "hello" && !!a.capabilities) ||
      (input.operation === "claim" &&
        ["1.0.0", "2.0.0", "3.0.0"].includes(a.taskProtocolVersion)) ||
      input.operation.startsWith("task_");
    const device = await assistantDevice(ctx, input.credentialHash, versioned);
    const now = Date.now();
    if (input.operation.startsWith("task_")) {
      await limit(ctx, `subscription-task-device:${device._id}`, 120);
      return localTaskOperation(ctx, device, input.operation, a);
    }
    if (input.operation === "hello") {
      if (a.capabilities) {
        await limit(ctx, `subscription-catalogue:${device._id}`, 12);
        const snapshot = await capabilitySnapshot(
          ctx,
          device,
          a.capabilities,
          a.profileBinding,
          a.expiresAt,
        );
        const localRuntime = await admitLocalRuntime(
          ctx,
          device,
          a.localTaskRuntime,
          a.profileBinding,
          a.expiresAt,
        );
        const legacy = snapshot.value.models.some(
          (m: any) =>
            m.slug === "gpt-6.1-sol" && m.reasoningEfforts.includes("medium"),
        );
        if (legacy && a.model === "gpt-6.1-sol")
          await ctx.db.patch(device._id, {
            assistantSeenAt: now,
            assistantProfileBinding: a.profileBinding,
            assistantSessionExpiresAt: a.expiresAt,
          });
        return {
          workspaceId: device.organizationId,
          taskProtocolVersion: "1.0.0",
          ...(localRuntime
            ? {
                sourceTaskProtocolVersion: "2.0.0",
                ...(localRuntime.value.features.includes(
                  "project_private_variant_v1",
                )
                  ? { projectPrivateVariantProtocolVersion: "3.0.0" }
                  : {}),
                localRuntimeHash: localRuntime.hash,
              }
            : {}),
          legacySupported: legacy && a.model === "gpt-6.1-sol",
        };
      }
      await admitLocalRuntime(
        ctx,
        device,
        undefined,
        a.profileBinding,
        a.expiresAt,
      );
      ensure(
        /^[a-f0-9]{64}$/.test(a.profileBinding ?? "") &&
          a.model === "gpt-6.1-sol" &&
          Number.isSafeInteger(a.expiresAt) &&
          a.expiresAt > now &&
          a.expiresAt <= now + 4 * 3600000,
        "SETUP_REQUIRED",
        "Use the supported official-client model and account.",
      );
      // Only the small device row changes; ordinary dashboard projections are not rewritten.
      if (
        (device.assistantSeenAt ?? 0) < now - 240000 ||
        device.assistantProfileBinding !== a.profileBinding ||
        device.assistantSessionExpiresAt !== a.expiresAt
      )
        await ctx.db.patch(device._id, {
          assistantSeenAt: now,
          assistantProfileBinding: a.profileBinding,
          assistantSessionExpiresAt: a.expiresAt,
        });
      return { workspaceId: device.organizationId };
    }
    if (input.operation === "claim") {
      const runtimeHash = ["2.0.0", "3.0.0"].includes(a.taskProtocolVersion)
        ? a.localRuntimeHash
        : undefined;
      ensure(
        !["2.0.0", "3.0.0"].includes(a.taskProtocolVersion) ||
          (typeof runtimeHash === "string" &&
            runtimeCurrent(device, runtimeHash)),
        "APPROVAL_STALE",
        "Reconnect the current local source runtime before claiming.",
      );
      ensure(
        a.taskProtocolVersion !== "3.0.0" ||
          device.localTaskRuntime?.value.features.includes(
            "project_private_variant_v1",
          ),
        "APPROVAL_STALE",
        "Reconnect the private project runtime.",
      );
      if (
        ["1.0.0", "2.0.0", "3.0.0"].includes(a.taskProtocolVersion) &&
        a.preferTasks !== false
      ) {
        const task = await claimLocalTask(
          ctx,
          device,
          runtimeHash,
          a.taskProtocolVersion === "3.0.0",
        );
        if (task) return task;
      }
      if (
        versioned &&
        ((device.assistantSeenAt ?? 0) <= now - 360000 ||
          !device.subscriptionCapabilities?.value.models.some(
            (m) =>
              m.slug === "gpt-6.1-sol" && m.reasoningEfforts.includes("medium"),
          ))
      )
        return (
          (await claimLocalTask(
            ctx,
            device,
            runtimeHash,
            a.taskProtocolVersion === "3.0.0",
          )) ?? { job: null }
        );
      ensure(
        (device.assistantSeenAt ?? 0) > now - 360000,
        "SETUP_REQUIRED",
        "Announce the current official-client account first.",
      );
      const active = await ctx.db
        .query("assistantIntakes")
        .withIndex("by_device_state", (q) =>
          q.eq("deviceId", device._id).eq("queueState", "local"),
        )
        .first();
      if (active) {
        const run = active.runId ? await ctx.db.get(active.runId) : null;
        if (run?.state === "active" && run.expiresAt > now)
          return { job: null, busy: true };
        await ctx.db.patch(active._id, {
          queueState: "failed",
          error:
            "The local session ended. Review before retrying; no paid fallback ran.",
          updatedAt: now,
        });
      }
      if ((device.assistantSessionExpiresAt ?? 0) < now + 45 * 60000)
        return { job: null, rotate: true };
      if (!device.assistantPending)
        return versioned
          ? ((await claimLocalTask(
              ctx,
              device,
              runtimeHash,
              a.taskProtocolVersion === "3.0.0",
            )) ?? { job: null })
          : { job: null };
      const waiting = await ctx.db
        .query("assistantIntakes")
        .withIndex("by_device_state", (q) =>
          q.eq("deviceId", device._id).eq("queueState", "waiting"),
        )
        .take(5);
      for (const intake of waiting) {
        let authority;
        try {
          authority = await intakeAuthority(ctx, intake);
        } catch {
          await ctx.db.patch(intake._id, {
            queueState: "cancelled",
            error: "Connection access changed.",
            updatedAt: now,
          });
          continue;
        }
        const s = await ctx.db.get(intake.sourceId);
        const settings = authority.grant.analysisDefaults;
        if (
          !settings?.enabled ||
          settings.deviceId !== device._id ||
          settings.profileBinding !== device.assistantProfileBinding ||
          !s ||
          s.state === "deleted" ||
          ["queued", "processing"].includes(s.state) ||
          s.generation !== intake.generation ||
          s.updatedAt !== intake.revision
        ) {
          await ctx.db.patch(intake._id, {
            queueState: "cancelled",
            error:
              "Source or local preferences changed. Review before retrying.",
            updatedAt: now,
          });
          continue;
        }
        const repositories = intake.repositories ?? [];
        await checkProjectBindings(ctx, authority.grant, repositories);
        const siblings = await ctx.db
          .query("assistantIntakes")
          .withIndex("by_source", (q) => q.eq("sourceId", s._id))
          .take(11);
        if (
          siblings.some((i) => i._id !== intake._id && i.queueState === "local")
        )
          continue;
        const expiresAt = Math.min(
          now + 4 * 3600000,
          device.assistantSessionExpiresAt!,
        );
        const runId = await ctx.db.insert("localLibraryRuns", {
          organizationId: s.organizationId,
          actor: device.owner,
          sources: [s._id],
          repositories,
          assistantIntakeId: intake._id,
          assistantGrantVersion: intake.grantVersion,
          model: "gpt-6.1-sol",
          effort: "medium",
          expiresAt,
          state: "active",
          jobs: 0,
          completed: 0,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(intake._id, {
          queueState: "local",
          runId,
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(
          expiresAt - now,
          internal.localLibrary.expire,
          { runId },
        );
        return {
          job: {
            intakeId: intake._id,
            runId,
            sourceId: s._id,
            url: s.url,
            generation: s.generation,
            revision: s.updatedAt,
            inputHash: await sourceFingerprint(s),
            extract: s.state !== "ready",
            repositories,
            profileBinding: device.assistantProfileBinding,
            expiresAt,
          },
        };
      }
      if (!waiting.length)
        await ctx.db.patch(device._id, { assistantPending: false });
      return versioned
        ? ((await claimLocalTask(
            ctx,
            device,
            runtimeHash,
            a.taskProtocolVersion === "3.0.0",
          )) ?? { job: null })
        : { job: null };
    }
    await boundOperation(ctx, device, input.operation, a);
    if (input.operation === "source_prepare")
      return sourcePrepareCore(ctx, a, device.owner);
    if (input.operation === "source_finish")
      return sourceFinishCore(ctx, a, device.owner);
    if (input.operation === "record_frame")
      return recordFrameCore(ctx, a, device.owner);
    if (input.operation === "evaluation_prepare")
      return evaluationPrepareCore(ctx, a, device.owner);
    if (input.operation === "record_inspection")
      return recordInspectionCore(ctx, a, device.owner);
    if (input.operation === "evaluation_finish")
      return evaluationFinishCore(ctx, a, device.owner);
    const run = await ctx.db.get(a.runId as Id<"localLibraryRuns">);
    ensure(
      run?.actor === device.owner && run.expiresAt > now,
      "APPROVAL_STALE",
      "Local work ended.",
    );
    const intake = await validateLocalRun(ctx, run, device.owner);
    ensure(intake, "FORBIDDEN", "Use the versioned task contract.");
    if (input.operation === "project_work") {
      const memberships = await ctx.db
        .query("knowledgeMembers")
        .withIndex("by_source", (q) => q.eq("sourceId", intake.sourceId))
        .take(101);
      const distinct = new Map<string, (typeof memberships)[number]>();
      for (const m of memberships)
        if (!m.excluded && !distinct.has(`${m.sourceId}:${m.insightId}`))
          distinct.set(`${m.sourceId}:${m.insightId}`, m);
      const included = [...distinct.values()].slice(0, 12);
      return {
        members: included.map((m) => m._id),
        topicId: included[0]?.topicId,
        repositories: run.repositories,
        omitted: memberships.length > 12,
      };
    }
    if (input.operation === "done" || input.operation === "fail") {
      if (input.operation === "done") {
        const source = await ctx.db.get(intake.sourceId);
        ensure(
          source?.state === "ready",
          "INVALID_EVIDENCE",
          "Source extraction did not complete.",
        );
        const ids = Array.isArray(a.evaluations) ? a.evaluations : [];
        if (a.noEvidence) {
          const members = await ctx.db
            .query("knowledgeMembers")
            .withIndex("by_source", (q) => q.eq("sourceId", intake.sourceId))
            .take(101);
          ensure(
            !members.some((m) => !m.excluded),
            "INVALID_EVIDENCE",
            "Included project evidence exists.",
          );
        }
        ensure(
          ids.length === (a.noEvidence ? 0 : run.repositories.length),
          "INVALID_EVIDENCE",
          "Complete each requested project evaluation.",
        );
        const covered = new Set();
        for (const id of ids) {
          const e = await ctx.db.get(id as Id<"knowledgeEvaluations">);
          ensure(
            e &&
              "repositoryId" in e &&
              "localRunId" in e &&
              "state" in e &&
              e.state === "ready" &&
              e.organizationId === run.organizationId &&
              (await evaluationCurrent(ctx, e)) &&
              run.repositories.includes(e.repositoryId as any) &&
              (e.localRunId === run._id ||
                ("references" in e &&
                  (e.references as any[]).some(
                    (r) => r.sourceId === intake.sourceId,
                  ))),
            "INVALID_EVIDENCE",
            "Project evaluation is unavailable.",
          );
          covered.add(e.repositoryId);
        }
        ensure(
          covered.size === (a.noEvidence ? 0 : run.repositories.length),
          "INVALID_EVIDENCE",
          "Duplicate project evaluation.",
        );
      }
      const deferred =
        input.operation === "done" && !!intake.queuedRepositories?.length;
      const source = (await ctx.db.get(intake.sourceId))!;
      await ctx.db.patch(intake._id, {
        ...(deferred
          ? {
              repositories: intake.queuedRepositories,
              queuedRepositories: undefined,
              runId: undefined,
              generation: source.generation,
              revision: source.updatedAt,
            }
          : {}),
        queueState:
          input.operation === "done"
            ? deferred
              ? "waiting"
              : a.noEvidence
                ? "completed_no_evidence"
                : "completed"
            : "failed",
        error:
          input.operation === "fail"
            ? [
                "needs_auth",
                "rate_limited",
                "unavailable",
                "unsupported",
                "over_limit",
                "failed",
              ].includes(a.mediaStatus)
              ? `${acquisitionMessage(a.mediaStatus)} No AI analysis or processing-credit charge started.`
              : "Local analysis stopped. No paid fallback was used; review before retrying."
            : undefined,
        updatedAt: now,
      });
      await ctx.db.patch(run._id, {
        state: input.operation === "done" ? "completed" : "failed",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.localLibrary.cleanPending, {
        runId: run._id,
        cursor: null,
      });
      if (deferred) await ctx.db.patch(device._id, { assistantPending: true });
      if (input.operation === "done")
        await ctx.db.insert("notifications", {
          organizationId: intake.organizationId,
          key: `assistant:${intake._id}:${run._id}`,
          message: intake.projectRequest
            ? "Source insights and requested project review are ready in your library."
            : "Source insights are ready. Name a project in your assistant, or ask for best project matches, to continue.",
          read: false,
          createdAt: now,
          updatedAt: now,
        });
      return { accepted: true };
    }
    throw Error("Unsupported local assistant operation.");
  },
});
