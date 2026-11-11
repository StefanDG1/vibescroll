import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { access, writeAccess, audit } from "./lib";
import { ensure } from "../packages/policy";
import {
  actorCurrent,
  startEvaluationCore,
  memberEvidence,
  startScanSynthesis,
} from "./knowledge";
import { approvePersonalCore } from "./personalAnalysis";
import { personalAllowed } from "./lib/personalAccess";
import { startSource } from "./product";
import { createIssueCore } from "./issues";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
const org = { organizationId: v.id("organizations") };
async function current(ctx: MutationCtx, j: Doc<"libraryScans">) {
  if (
    process.env.RESTORE_LOCK === "true" ||
    process.env.DISABLE_LIBRARY_SCANS === "true" ||
    !(await actorCurrent(ctx, j.organizationId, j.actor, ["owner", "admin"]))
  )
    return false;
  for (const b of j.repositories) {
    const r = await ctx.db.get(b.id);
    if (
      !r?.enabled ||
      !r.confirmed ||
      r.organizationId !== j.organizationId ||
      r.sha !== b.sha ||
      r.profileVersion !== b.profileVersion ||
      (r.selectionVersion ?? 0) !== b.selectionVersion
    )
      return false;
  }
  return true;
}
export const list = query({
  args: org,
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    const rows = await ctx.db
      .query("libraryScans")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .order("desc")
      .take(5);
    return rows.map((j) => ({
      id: j._id,
      version: j.version,
      phase: j.phase,
      state: j.state,
      maximumCredits: j.maximumCredits,
      committedCredits: j.committedCredits,
      sourceCount: j.sourceCount,
      readyCount: j.readyCount,
      pendingCount: j.pendingCount,
      processedCount: j.processedCount,
      skippedCount: j.skippedCount,
      topicCount: j.topicCount,
      gatheredCount: j.gatheredCount ?? 0,
      evaluatedCount: j.evaluatedCount,
      issueCount: j.issueCount,
      noFitCount: j.noFitCount,
      repositoryCount: j.repositories.length,
      reason: j.reason,
      funding: j.funding ?? "managed",
      deviceId: j.personal?.deviceId,
      model: j.personal?.model,
      effort: j.personal?.effort,
    }));
  },
});
export const prepare = mutation({
  args: { ...org, repositoryIds: v.array(v.id("repositories")) },
  handler: async (ctx, a) => {
    const { actor } = await writeAccess(ctx, a.organizationId, [
      "owner",
      "admin",
    ]);
    ensure(
      a.repositoryIds.length > 0 &&
        a.repositoryIds.length <= 1000 &&
        new Set(a.repositoryIds).size === a.repositoryIds.length,
      "INVALID_INPUT",
      "Choose distinct connected projects.",
    );
    const old = await ctx.db
      .query("libraryScans")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .order("desc")
      .take(10);
    ensure(
      !old.some((j) => !["completed", "canceled"].includes(j.state)),
      "SOURCE_BUSY",
      "Finish or cancel the current library scan first.",
    );
    const repositories = [];
    for (const id of a.repositoryIds) {
      const r = await ctx.db.get(id);
      ensure(
        r?.organizationId === a.organizationId &&
          r.enabled &&
          r.confirmed &&
          r.status === "connected",
        "CONTEXT_REQUIRED",
        "Prepare and confirm the selected projects first.",
      );
      repositories.push({
        id,
        sha: r.sha,
        profileVersion: r.profileVersion,
        selectionVersion: r.selectionVersion ?? 0,
      });
    }
    const now = Date.now();
    const id = await ctx.db.insert("libraryScans", {
      organizationId: a.organizationId,
      createdAt: now,
      updatedAt: now,
      actor: actor._id,
      version: 1,
      repositories,
      scope: "saved_links",
      asOf: now,
      phase: "inventory",
      state: "running",
      cursor: null,
      nextCursor: null,
      maximumCredits: 0,
      committedCredits: 0,
      sourceCount: 0,
      readyCount: 0,
      pendingCount: 0,
      processedCount: 0,
      skippedCount: 0,
      topicCount: 0,
      evaluatedCount: 0,
      issueCount: 0,
      noFitCount: 0,
      repositoryIndex: 0,
    });
    await ctx.scheduler.runAfter(0, internal.libraryScanWorker.tick, { id });
    return id;
  },
});
export const approve = mutation({
  args: {
    id: v.id("libraryScans"),
    version: v.number(),
    maximumCredits: v.number(),
    funding: v.union(v.literal("managed"), v.literal("own_plan")),
    deviceId: v.optional(v.id("devices")),
    model: v.optional(v.string()),
    effort: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
  },
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    ensure(j, "FORBIDDEN", "Scan unavailable.");
    const { actor } = await writeAccess(ctx, j.organizationId, [
      "owner",
      "admin",
    ]);
    ensure(
      j.actor === actor._id &&
        j.version === a.version &&
        ["ready", "paused"].includes(j.state) &&
        ![
          "usage_unknown",
          "source_failed",
          "evaluation_unknown",
          "evaluation_failed",
          "context_changed",
          "APPROVAL_STALE",
          "COST_RECONCILIATION_REQUIRED",
        ].includes(j.reason ?? "") &&
        (await current(ctx, j)),
      "APPROVAL_STALE",
      "Review the scan's current context and unresolved work first.",
    );
    ensure(
      Number.isSafeInteger(a.maximumCredits) &&
        a.maximumCredits >= Math.max(10, j.committedCredits + 10) &&
        a.maximumCredits <= 10000,
      "INVALID_INPUT",
      "Choose a maximum that covers the next batch.",
    );
    let personal: Doc<"libraryScans">["personal"] = undefined;
    if (a.funding === "own_plan") {
      const device = a.deviceId ? await ctx.db.get(a.deviceId) : null;
      ensure(
        personalAllowed(actor.subject) &&
          device?.organizationId === j.organizationId &&
          device.owner === actor._id &&
          device.state === "paired" &&
          (device.personalSeenAt ?? 0) > Date.now() - 60000 &&
          /^[a-f0-9]{64}$/.test(device.personalProfileBinding ?? "") &&
          a.model &&
          device.personalModels?.some((m) => m.slug === a.model) &&
          a.effort,
        "SETUP_REQUIRED",
        "Start your own paired runner and choose an advertised account model.",
      );
      personal = {
        deviceId: device._id,
        model: a.model,
        effort: a.effort,
        profileBinding: device.personalProfileBinding!,
        expiresAt: Date.now() + 86400000,
      };
    }
    ensure(
      !j.funding || j.funding === a.funding,
      "APPROVAL_STALE",
      "Keep the approved funding route or start a new scan.",
    );
    await ctx.db.patch(j._id, {
      funding: a.funding,
      personal,
      maximumCredits: a.maximumCredits,
      nextAt: 0,
      lease: undefined,
      state: "running",
      phase: j.phase === "inventory" ? "sources" : j.phase,
      version: j.version + 1,
      reason: undefined,
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      j.organizationId,
      actor._id,
      "library_scan_budget_approved",
      j._id,
    );
    await ctx.scheduler.runAfter(0, internal.libraryScanWorker.tick, {
      id: j._id,
    });
  },
});
export const pause = mutation({
  args: { id: v.id("libraryScans"), cancel: v.boolean() },
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    ensure(j, "FORBIDDEN", "Scan unavailable.");
    await writeAccess(ctx, j.organizationId, ["owner", "admin"]);
    await ctx.db.patch(j._id, {
      state: a.cancel ? "canceled" : "paused",
      lease: undefined,
      version: j.version + 1,
      reason: a.cancel ? "canceled" : "owner_paused",
      updatedAt: Date.now(),
    });
  },
});
export const page = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: (ctx, a) =>
    ctx.db
      .query("libraryScans")
      .withIndex("by_state", (q) => q.eq("state", "running"))
      .paginate({ cursor: a.cursor ?? null, numItems: 20 }),
});
export const claim = internalMutation({
  args: { id: v.id("libraryScans") },
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (!j || j.state !== "running" || (j.nextAt ?? 0) > Date.now())
      return null;
    const lease = crypto.randomUUID();
    await ctx.db.patch(j._id, { lease, nextAt: Date.now() + 60000 });
    return lease;
  },
});
export const release = internalMutation({
  args: { id: v.id("libraryScans"), lease: v.string(), delay: v.number() },
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (j?.lease === a.lease)
      await ctx.db.patch(j._id, {
        lease: undefined,
        nextAt: Date.now() + a.delay,
      });
  },
});
export const blocked = internalMutation({
  args: { id: v.id("libraryScans"), lease: v.string(), reason: v.string() },
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (j?.state === "running" && j.lease === a.lease)
      await ctx.db.patch(j._id, {
        state: "paused",
        lease: undefined,
        reason: a.reason,
        version: j.version + 1,
        updatedAt: Date.now(),
      });
  },
});
// A rejected acquisition approval has rolled back, so no new provider work or
// reservation exists. Advance this one unavailable link without resetting it.
export const skipUnavailable = internalMutation({
  args: { id: v.id("libraryScans"), lease: v.string() },
  handler: async (ctx, a) => {
    const j = await ctx.db.get(a.id);
    if (
      !j ||
      j.state !== "running" ||
      j.phase !== "sources" ||
      j.lease !== a.lease ||
      j.pendingSource ||
      !(await current(ctx, j))
    )
      return false;
    const page = await ctx.db
      .query("sources")
      .withIndex("by_org_created", (q) =>
        q.eq("organizationId", j.organizationId).lte("createdAt", j.asOf),
      )
      .paginate({ cursor: j.cursor, numItems: 1 });
    const s = page.page[0];
    if (
      !s ||
      s.kind !== "url" ||
      ["ready", "queued", "processing", "deleted"].includes(s.state)
    )
      return false;
    const holds = await ctx.db
      .query("reservations")
      .withIndex("by_org", (q) => q.eq("organizationId", j.organizationId))
      .collect();
    if (
      holds.some(
        (r) =>
          r.state === "active" &&
          (r.key.startsWith(`source:${s._id}:`) ||
            r.key.startsWith(`personal-media:${s._id}:`)),
      )
    )
      return false;
    await ctx.db.patch(j._id, {
      cursor: page.isDone ? null : page.continueCursor,
      skippedCount: j.skippedCount + 1,
      updatedAt: Date.now(),
      ...(page.isDone ? { phase: "knowledge", topicCutoff: Date.now() } : {}),
    });
    return true;
  },
});
export const step = internalMutation({
  args: { id: v.id("libraryScans"), lease: v.string() },
  handler: async (ctx, a): Promise<number | null> => {
    const j = await ctx.db.get(a.id);
    if (!j || j.state !== "running" || j.lease !== a.lease) return null;
    if (!(await current(ctx, j))) {
      await ctx.db.patch(j._id, {
        state: "paused",
        reason: "context_changed",
        version: j.version + 1,
      });
      return null;
    }
    const patch = async (fields: any) =>
      ctx.db.patch(j._id, { ...fields, updatedAt: Date.now() });
    if (j.phase === "inventory") {
      const page = await ctx.db
        .query("sources")
        .withIndex("by_org_created", (q) =>
          q.eq("organizationId", j.organizationId).lte("createdAt", j.asOf),
        )
        .paginate({ cursor: j.cursor, numItems: 50 });
      const rows = page.page.filter(
        (s) => s.state !== "deleted" && s.kind === "url" && !!s.url,
      );
      await patch({
        sourceCount: j.sourceCount + rows.length,
        readyCount:
          j.readyCount +
          rows.filter(
            (s) => s.state === "ready" && s.analysis?.insights?.length,
          ).length,
        pendingCount:
          j.pendingCount + rows.filter((s) => s.state !== "ready").length,
        cursor: page.isDone ? null : page.continueCursor,
        ...(page.isDone ? { state: "ready" } : {}),
      });
      return page.isDone ? null : 0;
    }
    if (j.phase === "sources") {
      if (j.pendingSource) {
        const s = await ctx.db.get(j.pendingSource);
        if (s && ["queued", "processing"].includes(s.state)) return 15000;
        if (s && s.generation !== j.pendingGeneration) {
          await patch({ state: "paused", reason: "context_changed" });
          return null;
        }
        if (s?.state === "failed") {
          const hold = await ctx.db
            .query("reservations")
            .withIndex("by_key", (q) =>
              q
                .eq("organizationId", j.organizationId)
                .eq("key", `source:${s._id}:${s.generation}`),
            )
            .unique();
          if (hold?.state === "active") {
            await patch({ state: "paused", reason: "usage_unknown" });
            return null;
          }
          await patch({
            pendingSource: undefined,
            pendingGeneration: undefined,
            skippedCount: j.skippedCount + 1,
            cursor: j.sourcePageDone ? null : j.nextCursor,
            ...(j.sourcePageDone
              ? { phase: "knowledge", topicCutoff: Date.now() }
              : {}),
          });
          return 0;
        }
        await patch({
          pendingSource: undefined,
          pendingGeneration: undefined,
          processedCount: j.processedCount + Number(s?.state === "ready"),
          skippedCount: j.skippedCount + Number(!s || s.state === "deleted"),
          cursor: j.sourcePageDone ? null : j.nextCursor,
          ...(j.sourcePageDone
            ? { phase: "knowledge", topicCutoff: Date.now() }
            : {}),
        });
        return 0;
      }
      const page = await ctx.db
        .query("sources")
        .withIndex("by_org_created", (q) =>
          q.eq("organizationId", j.organizationId).lte("createdAt", j.asOf),
        )
        .paginate({ cursor: j.cursor, numItems: 1 });
      const s = page.page[0];
      if (
        !s ||
        s.kind !== "url" ||
        !s.url ||
        s.state === "deleted" ||
        s.state === "ready" ||
        !s.rightsAttested ||
        (s.kind === "url" && !s.url)
      ) {
        await patch({
          cursor: page.isDone ? null : page.continueCursor,
          skippedCount:
            j.skippedCount +
            Number(
              !!s &&
                s.kind === "url" &&
                s.state !== "ready" &&
                s.state !== "deleted",
            ),
          ...(page.isDone
            ? { phase: "knowledge", topicCutoff: Date.now() }
            : {}),
        });
        return 0;
      }
      if (["queued", "processing"].includes(s.state)) {
        await patch({
          pendingSource: s._id,
          pendingGeneration: s.generation,
          nextCursor: page.continueCursor,
          sourcePageDone: page.isDone,
        });
        return 15000;
      }
      const old = await ctx.db
        .query("reservations")
        .withIndex("by_key", (q) =>
          q
            .eq("organizationId", j.organizationId)
            .eq("key", `source:${s._id}:${s.generation}`),
        )
        .unique();
      ensure(
        old?.state !== "active",
        "COST_RECONCILIATION_REQUIRED",
        "Previous analysis usage needs checking.",
      );
      ensure(
        j.committedCredits + 10 <= j.maximumCredits,
        "BUDGET_EXCEEDED",
        "The scan reached its maximum.",
      );
      const actor = (await ctx.db.get(j.actor))!;
      if (j.funding === "own_plan") {
        ensure(
          j.personal && j.personal.expiresAt > Date.now(),
          "SETUP_REQUIRED",
          "Renew your own-plan scan permission.",
        );
        await approvePersonalCore(
          ctx,
          {
            id: s._id,
            generation: s.generation,
            deviceId: j.personal.deviceId,
            model: j.personal.model,
            effort: j.personal.effort,
            useOwnPlan: true,
            maxComputeCredits: 10,
          },
          { actor, scanId: j._id },
        );
      } else {
        const holds = await ctx.db
          .query("reservations")
          .withIndex("by_org", (q) => q.eq("organizationId", j.organizationId))
          .collect();
        ensure(
          !holds.some(
            (r) =>
              r.state === "active" &&
              r.key.startsWith(`personal-media:${s._id}:`),
          ),
          "COST_RECONCILIATION_REQUIRED",
          "Earlier media usage needs checking.",
        );
        await startSource(ctx, { id: s._id, maxCredits: 10 }, actor);
      }
      const queued = (await ctx.db.get(s._id))!;
      await patch({
        pendingSource: s._id,
        pendingGeneration: queued.generation,
        nextCursor: page.continueCursor,
        sourcePageDone: page.isDone,
        committedCredits: j.committedCredits + 10,
      });
      return 15000;
    }
    if (j.phase === "knowledge") {
      if (j.pendingKnowledge) {
        const k = await ctx.db.get(j.pendingKnowledge);
        if (k && ["queued", "running"].includes(k.state)) return 15000;
        if (!k || k.state !== "ready") {
          await patch({
            state: "paused",
            reason:
              k?.state === "unknown"
                ? "evaluation_unknown"
                : k?.state === "stale"
                  ? "context_changed"
                  : "evaluation_failed",
          });
          return null;
        }
        await patch({
          pendingKnowledge: undefined,
          gatheredCount: (j.gatheredCount ?? 0) + 1,
          evidenceCursor: j.nextEvidenceCursor,
          ...(!j.nextEvidenceCursor
            ? {
                topicId: undefined,
                topicVersion: undefined,
                cursor: j.sourcePageDone ? null : j.nextCursor,
                ...(j.sourcePageDone ? { phase: "topics", cursor: null } : {}),
              }
            : {}),
        });
        return 0;
      }
      if (!j.topicId) {
        const page = await ctx.db
          .query("knowledgeTopics")
          .withIndex("by_org", (q) => q.eq("organizationId", j.organizationId))
          .filter((q) =>
            q.lte(q.field("createdAt"), j.topicCutoff ?? Date.now()),
          )
          .paginate({ cursor: j.cursor, numItems: 1 });
        const topic = page.page[0];
        if (!topic || topic.redirect || !topic.insightCount) {
          await patch({
            cursor: page.isDone ? null : page.continueCursor,
            ...(page.isDone ? { phase: "topics", cursor: null } : {}),
          });
          return 0;
        }
        await patch({
          topicId: topic._id,
          topicVersion: topic.version,
          nextCursor: page.continueCursor,
          sourcePageDone: page.isDone,
          evidenceCursor: undefined,
        });
        return 0;
      }
      const topic = await ctx.db.get(j.topicId);
      ensure(
        topic && topic.version === j.topicVersion && !topic.redirect,
        "APPROVAL_STALE",
        "Topic evidence changed.",
      );
      const page = await ctx.db
        .query("knowledgeMembers")
        .withIndex("by_topic", (q) => q.eq("topicId", topic._id))
        .paginate({ cursor: j.evidenceCursor ?? null, numItems: 12 });
      const evidence = await memberEvidence(ctx, page.page, j.asOf);
      if (!evidence.length) {
        await patch({
          evidenceCursor: page.isDone ? undefined : page.continueCursor,
          ...(page.isDone
            ? {
                topicId: undefined,
                topicVersion: undefined,
                cursor: j.sourcePageDone ? null : j.nextCursor,
                ...(j.sourcePageDone ? { phase: "topics", cursor: null } : {}),
              }
            : {}),
        });
        return 0;
      }
      ensure(
        j.committedCredits + 10 <= j.maximumCredits,
        "BUDGET_EXCEEDED",
        "The scan reached its maximum.",
      );
      const result = await startScanSynthesis(
        ctx,
        j,
        topic,
        page.page,
        page.isDone ? null : page.continueCursor,
        j.evidenceCursor ?? null,
      );
      await patch({
        pendingKnowledge: result.id,
        nextEvidenceCursor: page.isDone ? undefined : page.continueCursor,
        committedCredits: j.committedCredits + (result.cached ? 0 : 10),
      });
      return result.cached ? 0 : 15000;
    }
    if (j.phase === "topics") {
      if (j.pendingEvaluation) {
        const e = await ctx.db.get(j.pendingEvaluation);
        if (e && ["queued", "running"].includes(e.state)) return 15000;
        if (!e || e.state !== "ready") {
          await patch({
            state: "paused",
            reason:
              e?.state === "unknown"
                ? "evaluation_unknown"
                : e?.state === "stale"
                  ? "context_changed"
                  : "evaluation_failed",
          });
          return null;
        }
        let newIssue = 0;
        if (
          e.output?.disposition === "relevant" &&
          !["rejected", "deferred"].includes(e.decision)
        ) {
          const old = await ctx.db
            .query("issueDrafts")
            .withIndex("by_evaluation", (q) => q.eq("evaluationId", e._id))
            .first();
          if (!old) {
            await createIssueCore(
              ctx,
              { id: e._id, followUp: false },
              (await ctx.db.get(j.actor))!,
            );
            newIssue = 1;
          }
        }
        await patch({
          pendingEvaluation: undefined,
          evaluatedCount: j.evaluatedCount + 1,
          issueCount: j.issueCount + newIssue,
          noFitCount:
            j.noFitCount +
            Number(
              e.output?.disposition !== "relevant" ||
                ["rejected", "deferred"].includes(e.decision),
            ),
          evidenceCursor: j.nextEvidenceCursor,
          repositoryIndex: j.nextEvidenceCursor
            ? j.repositoryIndex
            : j.repositoryIndex + 1,
        });
        return 0;
      }
      if (!j.topicId) {
        const page = await ctx.db
          .query("knowledgeTopics")
          .withIndex("by_org", (q) => q.eq("organizationId", j.organizationId))
          .filter((q) =>
            q.lte(q.field("createdAt"), j.topicCutoff ?? Date.now()),
          )
          .paginate({ cursor: j.cursor, numItems: 1 });
        const topic = page.page[0];
        if (!topic || topic.redirect || !topic.insightCount) {
          await patch({
            cursor: page.isDone ? null : page.continueCursor,
            ...(page.isDone ? { state: "completed" } : {}),
          });
          return page.isDone ? null : 0;
        }
        await patch({
          topicId: topic._id,
          topicVersion: topic.version,
          nextCursor: page.continueCursor,
          sourcePageDone: page.isDone,
          repositoryIndex: 0,
          evidenceCursor: undefined,
          topicCount: j.topicCount + 1,
        });
        return 0;
      }
      if (j.repositoryIndex >= j.repositories.length) {
        await patch({
          topicId: undefined,
          topicVersion: undefined,
          cursor: j.sourcePageDone ? null : j.nextCursor,
          ...(j.sourcePageDone ? { state: "completed" } : {}),
        });
        return j.sourcePageDone ? null : 0;
      }
      const topic = await ctx.db.get(j.topicId);
      ensure(
        topic && topic.version === j.topicVersion && !topic.redirect,
        "APPROVAL_STALE",
        "Topic evidence changed.",
      );
      // Empty/excluded member pages still advance. Never silently inspect only the first evidence page.
      const members = await ctx.db
        .query("knowledgeMembers")
        .withIndex("by_topic", (q) => q.eq("topicId", j.topicId!))
        .paginate({ cursor: j.evidenceCursor ?? null, numItems: 12 });
      const usable = await memberEvidence(ctx, members.page, j.asOf);
      if (!usable.length) {
        await patch({
          evidenceCursor: members.isDone ? undefined : members.continueCursor,
          repositoryIndex: members.isDone
            ? j.repositoryIndex + 1
            : j.repositoryIndex,
        });
        return 0;
      }
      ensure(
        j.committedCredits + 10 <= j.maximumCredits,
        "BUDGET_EXCEEDED",
        "The scan reached its maximum.",
      );
      const result = await startEvaluationCore(
        ctx,
        {
          id: j.topicId,
          repositoryId: j.repositories[j.repositoryIndex].id,
          cursor: j.evidenceCursor,
          maxCredits: 10,
          savedLinkCutoff: j.asOf,
        },
        (await ctx.db.get(j.actor))!,
        members,
      );
      await patch({
        pendingEvaluation: result.id,
        nextEvidenceCursor: result.next ?? undefined,
        committedCredits: j.committedCredits + (result.cached ? 0 : 10),
      });
      return result.cached ? 0 : 15000;
    }
    return null;
  },
});
