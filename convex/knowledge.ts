import {
  evaluationReferencesCurrent,
  variantOrigin,
} from "./lib/privateProjectVariant";
import type { PrivateEvaluationOrigin } from "../packages/contracts/private-evaluation-context";
import { workspaceReadable } from "./lib/workspacePrivacy";
import { projectApplicationContent } from "./lib/projectApplication";
import { repositoryContent } from "./lib/repositoryContent";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { access, writeAccess, limit, audit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import { reserve, settle, digest } from "./product";
import { categoryKey, categoryName } from "../packages/categories";
import { snapshotScopeCurrent } from "../packages/repositories/scope";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { sourceRetained } from "./lib/sourceAuthority";
import { retainedSourceRevision } from "./lib/sourceAuthority";
import { sourcePolicyCurrent } from "./lib/sourcePolicy";
import { sharedTypedCitations } from "./lib/sourceCitations";
import {
  privateEvaluationTaskCurrent,
  samePrivateEvaluationOrigin,
} from "./lib/privateEvaluationContext";
import { organizeTopicAutomatically } from "./lib/topicHierarchy";
import {
  assertReferences,
  limits,
  processingVersion,
  synthesis,
  evaluation,
  type Reference,
  type EvaluationReference,
} from "../packages/knowledge/contracts";
const org = { organizationId: v.id("organizations") };
const month = () => new Date().toISOString().slice(0, 7);
type WorkTable = "knowledgeJobs" | "knowledgeEvaluations";
async function running(
  ctx: QueryCtx,
  table: WorkTable,
  organizationId: Id<"organizations">,
) {
  return ctx.db
    .query(table)
    .withIndex("by_org_state", (q) =>
      q.eq("organizationId", organizationId).eq("state", "running"),
    )
    .first();
}
async function dispatchNext(
  ctx: MutationCtx,
  table: WorkTable,
  organizationId: Id<"organizations">,
) {
  if (!workersEnabled()) return;
  const next = await ctx.db
    .query(table)
    .withIndex("by_org_state", (q) =>
      q.eq("organizationId", organizationId).eq("state", "queued"),
    )
    .first();
  if (!next) return;
  if ("policyVersion" in next)
    await ctx.scheduler.runAfter(0, internal.knowledgeActions.organize, {
      id: next._id,
    });
  else
    await ctx.scheduler.runAfter(0, internal.knowledgeActions.evaluate, {
      id: next._id,
    });
}
export function workersEnabled() {
  return (
    process.env.RESTORE_LOCK !== "true" &&
    process.env.DISABLE_KNOWLEDGE !== "true" &&
    process.env.DISABLE_INFERENCE !== "true"
  );
}
export async function actorCurrent(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  actorId: Id<"users">,
  roles = ["owner", "admin", "member"],
) {
  const organization = await ctx.db.get(organizationId),
    actor = await ctx.db.get(actorId);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", organizationId).eq("userId", actorId),
    )
    .unique();
  return (
    workspaceReadable(organization, actorId) &&
    actor?.status === "active" &&
    !!membership &&
    roles.includes(membership.role)
  );
}
export async function referencesCurrent(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  refs: EvaluationReference[],
  origin?: PrivateEvaluationOrigin,
): Promise<boolean> {
  if (refs.some((ref) => "schemaVersion" in ref))
    return (
      !!variantOrigin(origin) &&
      evaluationReferencesCurrent(ctx, organizationId, refs, origin)
    );
  for (const r of refs) {
    const s = await ctx.db.get(r.sourceId as Id<"sources">);
    if (
      !s ||
      s.organizationId !== organizationId ||
      s.state !== "ready" ||
      !sourceRetained(s) ||
      !s.rightsAttested ||
      s.generation !== r.generation ||
      s.updatedAt !== r.revision ||
      !s.analysis?.insights?.some((i: any) => i.id === r.insightId)
    )
      return false;
    if (s.orderedMedia || s.analysis?.schemaVersion === "3.0.0") {
      try {
        if (!(await sharedTypedCitations(ctx, s))) return false;
      } catch {
        return false;
      }
    } else if (
      s.currentRevisionId ||
      ["github_repository", "reddit_thread"].includes(s.sourceType ?? "") ||
      s.analysis?.schemaVersion === "2.0.0"
    ) {
      const row = s.currentRevisionId
        ? await ctx.db.get(s.currentRevisionId)
        : null;
      const registry = row ? await retainedSourceRevision(ctx, row) : null;
      if (
        !row ||
        !registry ||
        !sourcePolicyCurrent(registry.revision) ||
        s.analysis?.schemaVersion !== "2.0.0" ||
        s.analysis.sourceRevisionId !== row._id ||
        s.analysis.sourceContentHash !== row.contentHash
      )
        return false;
    }
  }
  return true;
}
export async function memberEvidence(
  ctx: QueryCtx,
  members: Doc<"knowledgeMembers">[],
  savedLinkCutoff?: number,
) {
  const result: {
    reference: Reference & { sourceId: Id<"sources"> };
    title: string;
    insight: any;
  }[] = [];
  for (const m of members) {
    const ref = {
      sourceId: m.sourceId,
      generation: m.generation,
      revision: m.revision,
      insightId: m.insightId,
    };
    if (
      m.excluded ||
      m.retainedHistory ||
      !(await referencesCurrent(ctx, m.organizationId, [ref]))
    )
      continue;
    const source = (await ctx.db.get(m.sourceId))!;
    if (
      savedLinkCutoff !== undefined &&
      (source.kind !== "url" ||
        !source.url ||
        source.createdAt > savedLinkCutoff)
    )
      continue;
    result.push({
      reference: ref,
      title: source.title,
      insight: source.analysis.insights.find((i: any) => i.id === m.insightId),
    });
  }
  return result;
}
// Recount only one source's bounded memberships, maintaining full-topic totals.
async function sourceMembers(
  ctx: QueryCtx,
  topicId: Id<"knowledgeTopics">,
  sourceId: Id<"sources">,
) {
  return ctx.db
    .query("knowledgeMembers")
    .withIndex("by_topic_source", (q) =>
      q.eq("topicId", topicId).eq("sourceId", sourceId),
    )
    .filter((q) => q.neq(q.field("retainedHistory"), true))
    .collect();
}
async function updateCounts(
  ctx: MutationCtx,
  topicId: Id<"knowledgeTopics">,
  sourceId: Id<"sources">,
  before: number,
) {
  const t = await ctx.db.get(topicId);
  if (!t) return;
  const after = (await sourceMembers(ctx, topicId, sourceId)).filter(
    (m) => !m.excluded,
  ).length;
  await ctx.db.patch(topicId, {
    sourceCount: Math.max(
      0,
      (t.sourceCount ?? 0) + Number(after > 0) - Number(before > 0),
    ),
    insightCount: Math.max(0, (t.insightCount ?? 0) + after - before),
  });
}
async function touch(
  ctx: MutationCtx,
  topicId: Id<"knowledgeTopics">,
  enqueue = true,
) {
  const topic = await ctx.db.get(topicId);
  if (!topic || topic.redirect) return;
  await ctx.db.patch(topicId, {
    version: topic.version + 1,
    state: "pending",
    resumeCursor: undefined,
    updatedAt: Date.now(),
  });
  if (enqueue)
    await ctx.scheduler.runAfter(0, internal.knowledgeActions.enqueueSafe, {
      topicId,
    });
}
// Classification reuses approved analysis. No new media processing or charge occurs here.
function topicNames(source: Doc<"sources">, point: any): string[] {
  const candidates =
    source.categoryOverride ??
    (point?.topics?.length ? point.topics : (point?.categories ?? []));
  const names = candidates.flatMap((name: string) => {
    try {
      const normalized = categoryName(name);
      return containsSecret(normalized) ? [] : [normalized];
    } catch {
      return [];
    }
  });
  return names.length ? names : ["Unsorted ideas"];
}
export async function syncKnowledge(
  ctx: MutationCtx,
  source: Doc<"sources">,
  options: { enqueue?: boolean; preserveManualHistory?: boolean } = {},
) {
  if (process.env.RESTORE_LOCK === "true") return;
  const old = await ctx.db
    .query("knowledgeMembers")
    .withIndex("by_source", (q) => q.eq("sourceId", source._id))
    .collect();
  const touched = new Set<Id<"knowledgeTopics">>();
  const points =
    source.state === "ready" && source.rightsAttested && sourceRetained(source)
      ? (source.analysis?.insights ?? [])
          .filter((i: any) => typeof i.id === "string")
          .slice(0, 20)
      : [];
  const active = new Set(points.map((i: any) => i.id));
  const before = new Map<Id<"knowledgeTopics">, number>();
  for (const m of old)
    before.set(
      m.topicId,
      (before.get(m.topicId) ?? 0) + Number(!m.excluded && !m.retainedHistory),
    );
  const inserted = new Set<string>();
  const historical = new Set<string>();
  for (const m of old) {
    const preserve =
      source.state !== "deleted" &&
      (m.retainedHistory ||
        (options.preserveManualHistory &&
          (m.manual || m.excluded) &&
          (!active.has(m.insightId) ||
            m.generation !== source.generation ||
            m.revision !== source.updatedAt)));
    if (preserve) {
      historical.add(m._id);
      if (!m.retainedHistory || m.sourceTitle !== undefined) {
        await ctx.db.patch(m._id, {
          retainedHistory: true,
          sourceTitle: undefined,
          updatedAt: Math.max(Date.now(), m.updatedAt + 1),
        });
        touched.add(m.topicId);
      }
      continue;
    }
    const point = points.find((i: any) => i.id === m.insightId);
    const topic = await ctx.db.get(m.topicId);
    const names = topicNames(source, point);
    const keys = names.flatMap((name: string) => {
      try {
        return [categoryKey(categoryName(name))];
      } catch {
        return [];
      }
    });
    if (
      !active.has(m.insightId) ||
      (!m.manual && topic && !topic.redirect && !keys.includes(topic.key))
    ) {
      await ctx.db.delete(m._id);
      touched.add(m.topicId);
    } else if (
      m.generation !== source.generation ||
      m.revision !== source.updatedAt ||
      m.sourceTitle !== source.title
    ) {
      await ctx.db.patch(m._id, {
        generation: source.generation,
        revision: source.updatedAt,
        sourceTitle: source.title,
        updatedAt: Date.now(),
      });
      touched.add(m.topicId);
    }
  }
  for (const point of points) {
    const names = topicNames(source, point);
    for (const name of names.slice(0, limits.topicsPerSource)) {
      let normalized: string;
      try {
        normalized = categoryName(name);
      } catch {
        continue;
      }
      if (containsSecret(normalized)) continue;
      const key = categoryKey(normalized);
      let topic = await ctx.db
        .query("knowledgeTopics")
        .withIndex("by_key", (q) =>
          q.eq("organizationId", source.organizationId).eq("key", key),
        )
        .unique();
      if (!topic) {
        const id = await ctx.db.insert("knowledgeTopics", {
          organizationId: source.organizationId,
          key,
          name: normalized,
          searchText: normalized,
          pinned: false,
          version: 1,
          state: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        topic = (await ctx.db.get(id))!;
        await organizeTopicAutomatically(ctx, topic);
      }
      // Merge redirects are durable. A manual exclusion in either topic remains authoritative.
      const target = topic.redirect ? await ctx.db.get(topic.redirect) : topic;
      if (!target || target.redirect) continue;
      const previous = old.find(
        (m) =>
          !m.retainedHistory &&
          !historical.has(m._id) &&
          (m.topicId === topic!._id || m.topicId === target._id) &&
          m.insightId === point.id,
      );
      const membershipKey = `${target._id}:${point.id}`;
      if (previous || inserted.has(membershipKey)) continue;
      inserted.add(membershipKey);
      await ctx.db.insert("knowledgeMembers", {
        organizationId: source.organizationId,
        topicId: target._id,
        sourceId: source._id,
        generation: source.generation,
        revision: source.updatedAt,
        insightId: point.id,
        sourceTitle: source.title,
        excluded: false,
        manual: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      touched.add(target._id);
    }
  }
  for (const topicId of touched) {
    await updateCounts(ctx, topicId, source._id, before.get(topicId) ?? 0);
    await touch(ctx, topicId, options.enqueue !== false);
  }
}
export const policy = query({
  args: org,
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    return ctx.db
      .query("knowledgePolicies")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
  },
});
export const pauseTopic = internalMutation({
  args: { id: v.id("knowledgeTopics") },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const t = await ctx.db.get(a.id);
    if (t && !t.redirect) await ctx.db.patch(t._id, { state: "budget_paused" });
  },
});
export const configure = mutation({
  args: { ...org, enabled: v.boolean(), ceiling: v.number() },
  handler: async (ctx, a) => {
    const { actor } = await writeAccess(ctx, a.organizationId, [
      "owner",
      "admin",
    ]);
    ensure(
      Number.isSafeInteger(a.ceiling) && a.ceiling >= 10 && a.ceiling <= 200,
      "INVALID_INPUT",
      "Choose a monthly organization ceiling of 10 to 200 credits. Existing provider limits still apply.",
    );
    const old = await ctx.db
      .query("knowledgePolicies")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    const fields = {
      ...a,
      actor: actor._id,
      version: (old?.version ?? 0) + 1,
      used: old?.period === month() ? old.used : 0,
      period: month(),
      state: a.enabled ? "ready" : "paused",
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.patch(old._id, fields);
    else
      await ctx.db.insert("knowledgePolicies", {
        ...fields,
        createdAt: Date.now(),
      });
    if (a.enabled)
      await ctx.scheduler.runAfter(0, internal.knowledge.resume, {
        organizationId: a.organizationId,
        cursor: null,
      });
  },
});
export const resume = internalMutation({
  args: { ...org, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, a) => {
    if (!workersEnabled()) return;
    const page = await ctx.db
      .query("knowledgeTopics")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .paginate({ cursor: a.cursor, numItems: 20 });
    for (const t of page.page)
      if (!t.redirect && ["pending", "budget_paused"].includes(t.state))
        await ctx.scheduler.runAfter(0, internal.knowledgeActions.enqueueSafe, {
          topicId: t._id,
        });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.knowledge.resume, {
        ...a,
        cursor: page.continueCursor,
      });
  },
});
export const backfill = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const page = await ctx.db
      .query("sources")
      .paginate({ cursor: a.cursor ?? null, numItems: 10 });
    for (const source of page.page) await syncKnowledge(ctx, source);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.knowledge.backfill, {
        cursor: page.continueCursor,
      });
    return {
      done: page.isDone,
      cursor: page.continueCursor,
      visited: page.page.length,
    };
  },
});
export const list = query({
  args: {
    ...org,
    cursor: v.optional(v.string()),
    search: v.optional(v.string()),
    sourceSearch: v.optional(v.string()),
    readiness: v.optional(v.string()),
    repositoryId: v.optional(v.id("repositories")),
    updatedSince: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    await access(ctx, a.organizationId);
    const selectedRepo = a.repositoryId
      ? await ctx.db.get(a.repositoryId)
      : null;
    if (a.repositoryId) {
      const repo = selectedRepo;
      ensure(
        repo?.organizationId === a.organizationId && repo.enabled,
        "FORBIDDEN",
        "Project unavailable.",
      );
    }
    const pagination = { cursor: a.cursor ?? null, numItems: limits.page };
    const page = a.sourceSearch?.trim()
      ? await ctx.db
          .query("knowledgeMembers")
          .withSearchIndex("search_title", (q) =>
            q
              .search("sourceTitle", a.sourceSearch!.slice(0, 120))
              .eq("organizationId", a.organizationId),
          )
          .paginate(pagination)
      : a.search?.trim()
        ? await ctx.db
            .query("knowledgeTopics")
            .withSearchIndex("search_name", (q) => {
              const selected = q
                .search("name", a.search!.trim().slice(0, 120))
                .eq("organizationId", a.organizationId);
              return a.readiness ? selected.eq("state", a.readiness) : selected;
            })
            .paginate(pagination)
        : await ctx.db
            .query("knowledgeTopics")
            .withIndex("by_org_leaf", (q) =>
              q
                .eq("organizationId", a.organizationId)
                .eq("autoCategory", undefined),
            )
            .order("desc")
            .paginate(pagination);
    const items = [];
    const seen = new Set<string>();
    for (const row of page.page) {
      if ("excluded" in row && (row.excluded || row.retainedHistory)) continue;
      const t = "topicId" in row ? await ctx.db.get(row.topicId) : row;
      if (!t || seen.has(t._id)) continue;
      seen.add(t._id);
      if (
        t.redirect ||
        t.autoCategory ||
        (a.sourceSearch &&
          a.search &&
          !t.name
            .toLowerCase()
            .includes(a.search.toLowerCase().slice(0, 120))) ||
        (a.readiness && t.state !== a.readiness) ||
        (a.updatedSince !== undefined && t.updatedAt < a.updatedSince)
      )
        continue;
      if (a.repositoryId) {
        const applications = await ctx.db
          .query("knowledgeEvaluations")
          .withIndex("by_topic_repo", (q) =>
            q.eq("topicId", t._id).eq("repositoryId", a.repositoryId!),
          )
          .order("desc")
          .take(10);
        if (
          !applications.some(
            (e) =>
              e.repositoryId === a.repositoryId &&
              e.topicVersion === t.version &&
              e.state === "ready" &&
              e.baseSha === selectedRepo?.sha &&
              e.profileVersion === selectedRepo?.profileVersion &&
              ["relevant", "already_implemented"].includes(
                e.output?.disposition,
              ),
          )
        )
          continue;
      }
      const jobs = await ctx.db
        .query("knowledgeJobs")
        .withIndex("by_topic", (q) => q.eq("topicId", t._id))
        .order("desc")
        .take(20);
      let current;
      for (const j of jobs)
        if (
          j.version === t.version &&
          j.output &&
          j.state === "ready" &&
          (await referencesCurrent(ctx, t.organizationId, j.references))
        ) {
          current = j;
          break;
        }
      items.push({
        ...t,
        explanation:
          current?.output.explanation ??
          "Saved ideas in this topic are ready to inspect. Combined explanation is pending.",
        coverage:
          "Summary count covers the latest 20 batches; topic source and insight counts cover all memberships.",
        covered: jobs
          .filter((j) => j.version === t.version && j.state === "ready")
          .reduce((n, j) => n + j.references.length, 0),
        conflicts:
          current?.output.relations.filter((r: any) => r.kind === "conflicting")
            .length ?? 0,
        updatedAt: t.updatedAt,
      });
    }
    return {
      items,
      next: page.isDone ? null : page.continueCursor,
      coverage:
        "This page shows up to 30 topics. Continue to inspect the full workspace library.",
    };
  },
});
export const detail = query({
  args: {
    id: v.id("knowledgeTopics"),
    cursor: v.optional(v.string()),
    summaryCursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    const topic = await ctx.db.get(a.id);
    ensure(topic, "FORBIDDEN", "Topic unavailable.");
    await access(ctx, topic.organizationId);
    const page = await ctx.db
      .query("knowledgeMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", a.id))
      .paginate({ cursor: a.cursor ?? null, numItems: limits.evidence });
    const key = `knowledge:${topic._id}:${topic.version}:${await digest(a.cursor ?? "first")}`;
    const j = await ctx.db
      .query("knowledgeJobs")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const current =
      j?.output &&
      j.state === "ready" &&
      (await referencesCurrent(ctx, topic.organizationId, j.references))
        ? [
            {
              id: j._id,
              output: j.output,
              covered: j.references.length,
              model: j.model,
              processingVersion: j.processingVersion,
            },
          ]
        : [];
    const members = [];
    for (const m of page.page) {
      if (m.retainedHistory) continue;
      const evidence = await memberEvidence(ctx, [m]);
      members.push({ ...m, evidence: evidence[0] ?? null });
    }
    return {
      topic,
      members,
      jobState: j?.state ?? "pending",
      summaries: current,
      next: page.isDone ? null : page.continueCursor,
      summaryNext: null,
      coverage:
        "Each explanation covers its cited evidence batch. Other batches and excluded, deleted or pending evidence are not claimed as reviewed.",
    };
  },
});
export const correct = mutation({
  args: {
    id: v.id("knowledgeTopics"),
    version: v.number(),
    name: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    memberId: v.optional(v.id("knowledgeMembers")),
    excluded: v.optional(v.boolean()),
    destination: v.optional(v.id("knowledgeTopics")),
    splitName: v.optional(v.string()),
    mergeInto: v.optional(v.id("knowledgeTopics")),
  },
  handler: async (ctx, a) => {
    const t = await ctx.db.get(a.id);
    ensure(t && !t.redirect, "FORBIDDEN", "Topic unavailable.");
    await writeAccess(ctx, t.organizationId);
    ensure(
      t.version === a.version,
      "APPROVAL_STALE",
      "Topic changed. Review the current version.",
    );
    await limit(ctx, `knowledge-correct:${t.organizationId}`);
    if (a.name !== undefined) {
      const name = categoryName(a.name);
      ensure(
        !containsSecret(name),
        "POLICY_BLOCKED",
        "Do not include secrets.",
      );
      await ctx.db.patch(t._id, {
        name,
        searchText: [name, ...(t.aliases ?? [])].join(" "),
      });
    }
    if (a.pinned !== undefined) await ctx.db.patch(t._id, { pinned: a.pinned });
    if (a.memberId) {
      const m = await ctx.db.get(a.memberId);
      ensure(
        m &&
          !m.retainedHistory &&
          m.topicId === t._id &&
          m.organizationId === t.organizationId,
        "FORBIDDEN",
        "Evidence unavailable.",
      );
      const before = (await sourceMembers(ctx, t._id, m.sourceId)).filter(
        (e) => !e.excluded,
      ).length;
      let dest = a.destination;
      if (a.splitName) {
        const name = categoryName(a.splitName);
        ensure(
          !containsSecret(name),
          "POLICY_BLOCKED",
          "Do not include secrets.",
        );
        dest = await ctx.db.insert("knowledgeTopics", {
          organizationId: t.organizationId,
          name,
          searchText: name.toLocaleLowerCase(),
          key: `manual_${crypto.randomUUID()}`,
          version: 1,
          state: "pending",
          pinned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      if (dest) {
        const d = await ctx.db.get(dest);
        ensure(
          d &&
            d.organizationId === t.organizationId &&
            !d.redirect &&
            d._id !== t._id,
          "FORBIDDEN",
          "Destination unavailable.",
        );
        const destBefore = (await sourceMembers(ctx, dest, m.sourceId)).filter(
          (e) => !e.excluded,
        ).length;
        const existing = await ctx.db
          .query("knowledgeMembers")
          .withIndex("by_source", (q) => q.eq("sourceId", m.sourceId))
          .collect();
        const match = existing.find(
          (e) =>
            !e.retainedHistory &&
            e.topicId === dest &&
            e.insightId === m.insightId,
        );
        if (match)
          await ctx.db.patch(match._id, { manual: true, excluded: false });
        else {
          const { _id: _ignored, _creationTime: _time, ...fields } = m;
          await ctx.db.insert("knowledgeMembers", {
            ...fields,
            topicId: dest,
            excluded: false,
            manual: true,
            updatedAt: Date.now(),
          });
        }
        await ctx.db.patch(m._id, { excluded: true, manual: true });
        await updateCounts(ctx, dest, m.sourceId, destBefore);
        await touch(ctx, dest);
      } else
        await ctx.db.patch(m._id, {
          excluded: a.excluded ?? m.excluded,
          manual: true,
          updatedAt: Date.now(),
        });
      await updateCounts(ctx, t._id, m.sourceId, before);
    }
    if (a.mergeInto) {
      const d = await ctx.db.get(a.mergeInto);
      ensure(
        d &&
          d.organizationId === t.organizationId &&
          !d.redirect &&
          d._id !== t._id,
        "FORBIDDEN",
        "Destination unavailable.",
      );
      await ctx.db.patch(t._id, { redirect: d._id, state: "merged" });
      await ctx.scheduler.runAfter(0, internal.knowledge.mergePage, {
        id: t._id,
        destination: d._id,
        cursor: null,
      });
    }
    await touch(ctx, t._id);
  },
});
export const mergePage = internalMutation({
  args: {
    id: v.id("knowledgeTopics"),
    destination: v.id("knowledgeTopics"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const t = await ctx.db.get(a.id),
      d = await ctx.db.get(a.destination);
    if (
      !t ||
      !d ||
      t.organizationId !== d.organizationId ||
      t.redirect !== d._id
    )
      return;
    const page = await ctx.db
      .query("knowledgeMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", t._id))
      .paginate({ cursor: a.cursor, numItems: 20 });
    for (const m of page.page) {
      if (m.retainedHistory) continue;
      const before = (await sourceMembers(ctx, d._id, m.sourceId)).filter(
        (e) => !e.excluded,
      ).length;
      const old = await ctx.db
        .query("knowledgeMembers")
        .withIndex("by_source", (q) => q.eq("sourceId", m.sourceId))
        .collect();
      const match = old.find(
        (e) =>
          !e.retainedHistory &&
          e.topicId === d._id &&
          e.insightId === m.insightId,
      );
      if (match) {
        if (m.excluded && m.manual)
          await ctx.db.patch(match._id, { excluded: true, manual: true });
      } else {
        const { _id: _ignored, _creationTime: _time, ...fields } = m;
        await ctx.db.insert("knowledgeMembers", {
          ...fields,
          topicId: d._id,
          manual: true,
        });
      }
      await updateCounts(ctx, d._id, m.sourceId, before);
    }
    if (page.isDone) await touch(ctx, d._id);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.knowledge.mergePage, {
        ...a,
        cursor: page.continueCursor,
      });
  },
});
export const enqueue = internalMutation({
  args: { topicId: v.id("knowledgeTopics"), cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (!workersEnabled()) return;
    const topic = await ctx.db.get(a.topicId);
    if (!topic || topic.redirect) return;
    const policy = await ctx.db
      .query("knowledgePolicies")
      .withIndex("by_org", (q) => q.eq("organizationId", topic.organizationId))
      .unique();
    if (
      !policy?.enabled ||
      !(await actorCurrent(ctx, topic.organizationId, policy.actor, [
        "owner",
        "admin",
      ]))
    )
      return;
    const cursor = a.cursor ?? topic.resumeCursor;
    const key = `knowledge:${topic._id}:${topic.version}:${await digest(cursor ?? "first")}`;
    const old = await ctx.db
      .query("knowledgeJobs")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (old) return;
    const page = await ctx.db
      .query("knowledgeMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", topic._id))
      .paginate({ cursor: cursor ?? null, numItems: limits.evidence });
    const evidence = await memberEvidence(ctx, page.page);
    const used = policy.period === month() ? policy.used : 0;
    if (used + limits.credits > policy.ceiling) {
      await ctx.db.patch(topic._id, { state: "budget_paused" });
      await ctx.db.patch(policy._id, { state: "budget_paused" });
      return;
    }
    await reserve(ctx, topic.organizationId, key, limits.credits);
    await ctx.db.patch(policy._id, {
      period: month(),
      used: used + limits.credits,
    });
    const id = await ctx.db.insert("knowledgeJobs", {
      organizationId: topic.organizationId,
      topicId: topic._id,
      actor: policy.actor,
      version: topic.version,
      policyVersion: policy.version,
      cursor: cursor ?? null,
      next: page.isDone ? null : page.continueCursor,
      done: page.isDone,
      key,
      state: "queued",
      references: evidence.map((e) => e.reference),
      processingVersion,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.knowledgeActions.organize, { id });
  },
});
async function synthesisGrantCurrent(
  ctx: QueryCtx,
  j: Doc<"knowledgeJobs">,
  p: Doc<"knowledgePolicies"> | null,
) {
  if (!j.libraryScanId) return !!p?.enabled && p.version === j.policyVersion;
  const scan = await ctx.db.get(j.libraryScanId);
  if (
    !scan ||
    scan.organizationId !== j.organizationId ||
    scan.actor !== j.actor ||
    scan.scope !== "saved_links" ||
    !scan.funding ||
    scan.maximumCredits < 10
  )
    return false;
  for (const ref of j.references) {
    const source = await ctx.db.get(ref.sourceId);
    if (source?.kind !== "url" || !source.url || source.createdAt > scan.asOf)
      return false;
  }
  return true;
}
export async function startScanSynthesis(
  ctx: MutationCtx,
  scan: Doc<"libraryScans">,
  topic: Doc<"knowledgeTopics">,
  members: Doc<"knowledgeMembers">[],
  next: string | null,
  cursor: string | null,
) {
  ensure(
    workersEnabled() &&
      scan.state === "running" &&
      scan.maximumCredits >= scan.committedCredits + 10 &&
      scan.scope === "saved_links" &&
      topic.organizationId === scan.organizationId &&
      (await actorCurrent(ctx, scan.organizationId, scan.actor, [
        "owner",
        "admin",
      ])),
    "APPROVAL_STALE",
    "Review the current knowledge grant.",
  );
  const evidence = await memberEvidence(ctx, members, scan.asOf);
  ensure(
    evidence.length,
    "CONTEXT_REQUIRED",
    "No included saved-link evidence in this batch.",
  );
  const references = evidence.map((e) => e.reference),
    key = `knowledge-scan:${processingVersion}:${topic._id}:${topic.version}:${await digest(JSON.stringify(references))}`;
  const old = await ctx.db
    .query("knowledgeJobs")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (old) return { id: old._id, cached: true };
  await reserve(ctx, scan.organizationId, key, 10);
  const id = await ctx.db.insert("knowledgeJobs", {
    organizationId: scan.organizationId,
    topicId: topic._id,
    actor: scan.actor,
    version: topic.version,
    policyVersion: 0,
    libraryScanId: scan._id,
    cursor,
    next,
    done: !next,
    key,
    state: "queued",
    references,
    processingVersion,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.knowledgeActions.organize, { id });
  return { id, cached: false };
}
export const claim = internalMutation({
  args: { id: v.id("knowledgeJobs") },
  handler: async (ctx, a) => {
    if (!workersEnabled()) return null;
    const j = await ctx.db.get(a.id);
    if (!j || j.state !== "queued") return null;
    if (await running(ctx, "knowledgeJobs", j.organizationId)) return null;
    const t = await ctx.db.get(j.topicId),
      p = await ctx.db
        .query("knowledgePolicies")
        .withIndex("by_org", (q) => q.eq("organizationId", j.organizationId))
        .unique();
    if (
      !t ||
      t.version !== j.version ||
      !(await synthesisGrantCurrent(ctx, j, p)) ||
      !(await actorCurrent(ctx, j.organizationId, j.actor, [
        "owner",
        "admin",
      ])) ||
      !(await referencesCurrent(ctx, j.organizationId, j.references))
    ) {
      await settle(ctx, j.organizationId, j.key, 0);
      await ctx.db.patch(j._id, { state: "stale" });
      await dispatchNext(ctx, "knowledgeJobs", j.organizationId);
      return null;
    }
    await ctx.db.patch(j._id, {
      state: "running",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(j.topicId, { state: "updating" });
    const evidence = [];
    for (const ref of j.references) {
      const source = (await ctx.db.get(ref.sourceId))!;
      evidence.push({
        reference: ref,
        title: source.title,
        insight: source.analysis.insights.find(
          (i: any) => i.id === ref.insightId,
        ),
      });
    }
    return { job: j, topic: t, evidence };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("knowledgeJobs"),
    output: v.optional(v.any()),
    credits: v.number(),
    retainReservation: v.optional(v.boolean()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const j = await ctx.db.get(a.id);
    if (!j || j.state !== "running") return;
    ensure(
      Number.isSafeInteger(a.credits) &&
        a.credits >= 0 &&
        a.credits <= limits.credits,
      "BUDGET_EXCEEDED",
      "Usage exceeds the approved organization quote.",
    );
    const t = await ctx.db.get(j.topicId),
      p = await ctx.db
        .query("knowledgePolicies")
        .withIndex("by_org", (q) => q.eq("organizationId", j.organizationId))
        .unique();
    const current =
      workersEnabled() &&
      t?.version === j.version &&
      !t.redirect &&
      (await synthesisGrantCurrent(ctx, j, p)) &&
      (await actorCurrent(ctx, j.organizationId, j.actor, [
        "owner",
        "admin",
      ])) &&
      (await referencesCurrent(ctx, j.organizationId, j.references));
    const output =
      a.output === undefined ? undefined : synthesis.parse(a.output);
    if (output) {
      assertReferences([...output.claims, ...output.relations], j.references);
      ensure(
        !containsSecret(JSON.stringify(output)),
        "POLICY_BLOCKED",
        "Synthesis contains credentials.",
      );
    }
    if (!a.retainReservation)
      await settle(ctx, j.organizationId, j.key, a.credits);
    const state = a.retainReservation
      ? "unknown"
      : !current
        ? "stale"
        : output
          ? "ready"
          : "failed";
    await ctx.db.patch(j._id, {
      state,
      output: current ? output : undefined,
      credits: a.credits,
      model: a.model,
      updatedAt: Date.now(),
    });
    await dispatchNext(ctx, "knowledgeJobs", j.organizationId);
    if (current && !output) await ctx.db.patch(j.topicId, { state });
    if (current && output) {
      await ctx.db.patch(j.topicId, {
        state: j.done ? "ready" : "updating",
        resumeCursor: j.next ?? undefined,
      });
      if (j.next && !j.libraryScanId)
        await ctx.scheduler.runAfter(0, internal.knowledgeActions.enqueueSafe, {
          topicId: j.topicId,
          cursor: j.next,
        });
    }
  },
});
const evaluationArgs = {
  savedLinkCutoff: v.optional(v.number()),
  id: v.id("knowledgeTopics"),
  repositoryId: v.id("repositories"),
  cursor: v.optional(v.string()),
  maxCredits: v.number(),
};
export async function startEvaluationCore(
  ctx: MutationCtx,
  a: import("convex/values").ObjectType<typeof evaluationArgs>,
  authorizedActor?: Doc<"users">,
  preparedPage?: {
    page: Doc<"knowledgeMembers">[];
    isDone: boolean;
    continueCursor: string;
  },
) {
  ensure(
    workersEnabled() && a.maxCredits === limits.credits,
    "QUOTE_CHANGED",
    "Review the 10-credit evaluation quote.",
  );
  const topic = await ctx.db.get(a.id),
    repo = await ctx.db.get(a.repositoryId);
  ensure(
    topic &&
      !topic.redirect &&
      repo &&
      repo.organizationId === topic.organizationId &&
      repo.enabled &&
      repo.confirmed &&
      snapshotScopeCurrent(repo),
    "CONTEXT_REQUIRED",
    "Choose a selected repository with confirmed context.",
  );
  const { actor } = authorizedActor
    ? { actor: authorizedActor }
    : await writeAccess(ctx, topic.organizationId);
  await limit(ctx, `knowledge-evaluation:${topic.organizationId}`, 10);
  const page =
    preparedPage ??
    (await ctx.db
      .query("knowledgeMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", topic._id))
      .paginate({ cursor: a.cursor ?? null, numItems: limits.evidence }));
  const evidence = await memberEvidence(ctx, page.page, a.savedLinkCutoff);
  ensure(
    evidence.length,
    "CONTEXT_REQUIRED",
    "No current evidence in this batch.",
  );
  const references = evidence.map((e) => e.reference),
    sourceSetHash = await digest(JSON.stringify(references));
  const preference = await ctx.db
    .query("improvementPreferences")
    .withIndex("by_org", (q) => q.eq("organizationId", topic.organizationId))
    .unique();
  const preferenceVersion = preference?.version ?? 0;
  const key = `knowledge-evaluation:${processingVersion}:${topic._id}:${topic.version}:${repo._id}:${repo.sha}:${repo.profileVersion}:${repo.selectionVersion ?? 0}:${sourceSetHash}:${preferenceVersion}`;
  const old = await ctx.db
    .query("knowledgeEvaluations")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (old)
    return {
      id: old._id,
      cached: true,
      next: page.isDone ? null : page.continueCursor,
    };
  await reserve(ctx, topic.organizationId, key, limits.credits);
  const id = await ctx.db.insert("knowledgeEvaluations", {
    organizationId: topic.organizationId,
    topicId: topic._id,
    repositoryId: repo._id,
    actor: actor._id,
    topicVersion: topic.version,
    baseSha: repo.sha,
    profileVersion: repo.profileVersion,
    selectionVersion: repo.selectionVersion ?? 0,
    references,
    sourceSetHash,
    preferenceVersion,
    key,
    state: "queued",
    decision: "new",
    covered: evidence.length,
    omitted: !page.isDone || !!a.cursor,
    processingVersion,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.knowledgeActions.evaluate, { id });
  return {
    id,
    cached: false,
    next: page.isDone ? null : page.continueCursor,
  };
}
export const startEvaluation = mutation({
  args: evaluationArgs,
  handler: (ctx, a) => startEvaluationCore(ctx, a),
});
export const evaluationCurrent = async (
  ctx: QueryCtx,
  e: Doc<"knowledgeEvaluations">,
) => {
  if (e.localRunId) {
    const run = await ctx.db.get(e.localRunId);
    if (run?.task?.schemaVersion === "4.0.0") {
      try {
        await projectApplicationContent(ctx, run);
      } catch {
        return false;
      }
    }
  }
  if (e.privateEvaluationOrigin) {
    const run = e.localRunId ? await ctx.db.get(e.localRunId) : null;
    if (
      !run?.task ||
      run.task.workload !== "project_evaluation" ||
      run.organizationId !== e.organizationId ||
      run.actor !== e.actor ||
      e.actor !== e.privateEvaluationOrigin.ownerId ||
      !samePrivateEvaluationOrigin(
        e.privateEvaluationOrigin,
        run.task.privateEvaluationOrigin,
      ) ||
      (e.state === "ready" && e.model !== e.privateEvaluationOrigin.model) ||
      !(await privateEvaluationTaskCurrent(ctx, run))
    )
      return false;
  }
  const t = e.topicId ? await ctx.db.get(e.topicId) : null,
    r = await ctx.db.get(e.repositoryId);
  const preference = await ctx.db
    .query("improvementPreferences")
    .withIndex("by_org", (q) => q.eq("organizationId", e.organizationId))
    .unique();
  for (const binding of e.topicBindings ?? []) {
    const topic = await ctx.db.get(binding.id);
    if (
      topic?.organizationId !== e.organizationId ||
      topic.redirect ||
      topic.version !== binding.version
    )
      return false;
  }
  return (
    (e.preferenceVersion ?? 0) === (preference?.version ?? 0) &&
    !!r?.enabled &&
    r.confirmed &&
    snapshotScopeCurrent(r) &&
    r.organizationId === e.organizationId &&
    r.sha === e.baseSha &&
    r.profileVersion === e.profileVersion &&
    (r.selectionVersion ?? 0) === (e.selectionVersion ?? 0) &&
    (variantOrigin(e.privateEvaluationOrigin)
      ? e.topicId === undefined &&
        e.topicVersion === undefined &&
        !e.topicBindings?.length
      : !!t && t.version === e.topicVersion && !t.redirect) &&
    (await referencesCurrent(
      ctx,
      e.organizationId,
      e.references,
      e.privateEvaluationOrigin,
    ))
  );
};
export const claimEvaluation = internalMutation({
  args: { id: v.id("knowledgeEvaluations") },
  handler: async (ctx, a) => {
    if (!workersEnabled()) return null;
    const e = await ctx.db.get(a.id);
    if (!e || e.state !== "queued" || e.privateEvaluationOrigin) return null;
    if (await running(ctx, "knowledgeEvaluations", e.organizationId))
      return null;
    if (
      !(await evaluationCurrent(ctx, e)) ||
      !(await actorCurrent(ctx, e.organizationId, e.actor))
    ) {
      await settle(ctx, e.organizationId, e.key, 0);
      await ctx.db.patch(e._id, { state: "stale" });
      await dispatchNext(ctx, "knowledgeEvaluations", e.organizationId);
      return null;
    }
    await ctx.db.patch(e._id, { state: "running", updatedAt: Date.now() });
    const evidence = [];
    for (const r of e.references) {
      const s = (await ctx.db.get(r.sourceId))!;
      evidence.push({
        reference: r,
        title: s.title,
        insight: s.analysis.insights.find((i: any) => i.id === r.insightId),
      });
    }
    const previous = await ctx.db
      .query("knowledgeEvaluations")
      .withIndex("by_topic_repo", (q) =>
        q.eq("topicId", e.topicId).eq("repositoryId", e.repositoryId),
      )
      .order("desc")
      .take(20);
    const reviewHistory = [];
    for (const old of previous) {
      if (
        old._id !== e._id &&
        old.state === "ready" &&
        old.output &&
        !old.privateEvaluationOrigin &&
        ["rejected", "deferred"].includes(old.decision) &&
        (await referencesCurrent(ctx, e.organizationId, old.references))
      )
        reviewHistory.push({
          decision: old.decision,
          disposition: old.output.disposition,
          rationale: old.output.rationale,
          problem: old.output.problem,
          baseSha: old.baseSha,
        });
      if (reviewHistory.length === 10) break;
    }
    return {
      evaluation: e,
      reviewHistory,
      preference:
        (
          await ctx.db
            .query("improvementPreferences")
            .withIndex("by_org", (q) =>
              q.eq("organizationId", e.organizationId),
            )
            .unique()
        )?.note ?? "",
      repo: (await repositoryContent(ctx, await ctx.db.get(e.repositoryId)))!,
      evidence,
    };
  },
});
export const finishEvaluation = internalMutation({
  args: {
    id: v.id("knowledgeEvaluations"),
    output: v.optional(v.any()),
    inspected: v.optional(v.any()),
    credits: v.number(),
    retainReservation: v.optional(v.boolean()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const e = await ctx.db.get(a.id);
    if (!e || e.state !== "running") return;
    ensure(
      Number.isSafeInteger(a.credits) &&
        a.credits >= 0 &&
        a.credits <= limits.credits,
      "BUDGET_EXCEEDED",
      "Evaluation exceeded its approved quote.",
    );
    const current =
      workersEnabled() &&
      (await evaluationCurrent(ctx, e)) &&
      (await actorCurrent(ctx, e.organizationId, e.actor));
    const output =
      a.output === undefined ? undefined : evaluation.parse(a.output);
    if (output) {
      assertReferences([output], e.references);
      ensure(
        !containsSecret(JSON.stringify(output)),
        "POLICY_BLOCKED",
        "Evaluation contains credentials.",
      );
      for (const ref of output.repositoryEvidence)
        ensure(
          a.inspected?.some(
            (p: any) =>
              p.path === ref.path &&
              p.startLine <= ref.startLine &&
              p.endLine >= ref.endLine,
          ),
          "INVALID_EVIDENCE",
          "Repository citation is outside inspected evidence.",
        );
    }
    if (!a.retainReservation)
      await settle(ctx, e.organizationId, e.key, a.credits);
    await ctx.db.patch(e._id, {
      state: a.retainReservation
        ? "unknown"
        : !current
          ? "stale"
          : output
            ? "ready"
            : "failed",
      output: current ? output : undefined,
      inspected: current ? a.inspected : undefined,
      credits: a.credits,
      model: a.model,
      updatedAt: Date.now(),
    });
    await dispatchNext(ctx, "knowledgeEvaluations", e.organizationId);
  },
});
export const evaluations = query({
  args: {
    ...org,
    repositoryId: v.optional(v.id("repositories")),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    await access(ctx, a.organizationId);
    if (a.repositoryId) {
      const r = await ctx.db.get(a.repositoryId);
      ensure(
        r?.organizationId === a.organizationId,
        "FORBIDDEN",
        "Project unavailable.",
      );
    }
    const page = a.repositoryId
      ? await ctx.db
          .query("knowledgeEvaluations")
          .withIndex("by_repo", (q) => q.eq("repositoryId", a.repositoryId!))
          .order("desc")
          .paginate({ cursor: a.cursor ?? null, numItems: limits.page })
      : await ctx.db
          .query("knowledgeEvaluations")
          .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
          .order("desc")
          .paginate({ cursor: a.cursor ?? null, numItems: limits.page });
    const items = [];
    for (const e of page.page) {
      const surviving = await referencesCurrent(
        ctx,
        e.organizationId,
        e.references,
        e.privateEvaluationOrigin,
      );
      items.push({
        ...e,
        ...(!surviving
          ? {
              output: undefined,
              opportunityGroup: undefined,
              inspected: undefined,
            }
          : {}),
        state: (await evaluationCurrent(ctx, e)) ? e.state : "stale",
      });
    }
    return { items, next: page.isDone ? null : page.continueCursor };
  },
});
export const decide = mutation({
  args: {
    id: v.id("knowledgeEvaluations"),
    decision: v.union(
      v.literal("rejected"),
      v.literal("deferred"),
      v.literal("accepted"),
    ),
  },
  handler: async (ctx, a) => {
    const e = await ctx.db.get(a.id);
    ensure(e, "FORBIDDEN", "Idea unavailable.");
    await writeAccess(ctx, e.organizationId);
    await ctx.db.patch(e._id, { decision: a.decision, updatedAt: Date.now() });
  },
});
// Existing audit records are the durable operator handoff; no automatic retry
// restarts a chain once its finite lock or page budget has been exhausted.
export async function recordRetentionAttention(
  ctx: MutationCtx,
  a: {
    organizationId: Id<"organizations">;
    sourceId: Id<"sources">;
    maxGeneration?: number;
    section?: string;
  },
  reason: "restore_deferrals_exhausted" | "page_budget_exhausted",
) {
  const organization = await ctx.db.get(a.organizationId);
  if (!organization) return;
  await audit(
    ctx,
    a.organizationId,
    organization.privateOwnerId ?? organization.createdBy,
    "source_retention.manual_cleanup_required",
    `${a.sourceId}:${a.maxGeneration ?? "all"}:${a.section ?? "source"}:${reason}`,
  );
}
export const redactDerived = internalMutation({
  args: {
    ...org,
    sourceId: v.id("sources"),
    maxGeneration: v.optional(v.number()),
    deferredAttempt: v.optional(v.number()),
    pagesRemaining: v.optional(v.number()),
    section: v.union(
      v.literal("knowledgeJobs"),
      v.literal("knowledgeEvaluations"),
      v.literal("issueDrafts"),
      v.literal("improvements"),
      v.literal("improvementOutcomes"),
      v.literal("runs"),
      v.literal("proposals"),
    ),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    ensure(
      a.maxGeneration === undefined ||
        (Number.isSafeInteger(a.maxGeneration) && a.maxGeneration >= 0),
      "INVALID_INPUT",
      "Invalid source generation cleanup bound.",
    );
    const attempt = a.deferredAttempt ?? 0;
    ensure(
      Number.isSafeInteger(attempt) &&
        attempt >= 0 &&
        attempt <= 2 &&
        (a.pagesRemaining === undefined ||
          (Number.isSafeInteger(a.pagesRemaining) &&
            a.pagesRemaining >= 0 &&
            a.pagesRemaining <= 32)),
      "INVALID_INPUT",
      "Invalid finite retention cleanup budget.",
    );
    if (a.pagesRemaining === 0) {
      await recordRetentionAttention(ctx, a, "page_budget_exhausted");
      return;
    }
    if (process.env.RESTORE_LOCK === "true") {
      // One global deferral allowance travels through every page and section.
      if (attempt < 2)
        await ctx.scheduler.runAfter(60000, internal.knowledge.redactDerived, {
          ...a,
          deferredAttempt: attempt + 1,
        });
      else
        await recordRetentionAttention(ctx, a, "restore_deferrals_exhausted");
      return;
    }
    const page = await ctx.db
      .query(a.section)
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .paginate({
        cursor: a.cursor,
        numItems: a.section === "runs" || a.section === "proposals" ? 10 : 30,
        maximumBytesRead: 512 * 1024,
      });
    const affected = (proposal: Doc<"proposals">) =>
      proposal.organizationId === a.organizationId &&
      proposal.sourceId === a.sourceId &&
      (proposal.detail?.schemaVersion === "2.0.0" ||
        proposal.opportunityIndex !== undefined ||
        !!variantOrigin(proposal.privateEvaluationOrigin)) &&
      proposal.references?.some(
        (ref) =>
          ref.sourceId === a.sourceId &&
          (a.maxGeneration === undefined || ref.generation <= a.maxGeneration),
      );
    for (const r of page.page) {
      if (a.section === "runs") {
        const run = r as Doc<"runs">;
        const proposal = await ctx.db.get(run.proposalId);
        if (!proposal || !affected(proposal)) continue;
        const notice =
          "Source evidence unavailable; generated content removed. Outstanding usage requires reconciliation.";
        const receipts = run.events.filter(
          (event) =>
            /^Isolated sandbox started: [A-Za-z0-9_-]{1,200}$/.test(event) ||
            /^Teardown confirmed; service credits settled: \d{1,5}\.$/.test(
              event,
            ),
        );
        if (
          run.events.includes(notice) &&
          !run.patch &&
          run.changes === undefined &&
          !run.report &&
          !run.aiReview &&
          !run.error &&
          run.checksPassed === undefined
        )
          continue;
        const published = !!(run.prNumber || run.prUrl);
        await ctx.db.patch(run._id, {
          patch: undefined,
          changes: undefined,
          report: undefined,
          aiReview: undefined,
          checksPassed: undefined,
          error: undefined,
          events: [...receipts, notice],
          state:
            !published && run.state !== "completed" ? "canceled" : run.state,
          generation:
            run.state === "canceled" ? run.generation : run.generation + 1,
          ...(!published
            ? { leaseUntil: 0, expiresAt: Math.min(Date.now(), run.expiresAt) }
            : {}),
          updatedAt: Math.max(Date.now(), run.updatedAt + 1),
        });
        continue;
      }
      if (a.section === "proposals") {
        const proposal = r as Doc<"proposals">;
        if (!affected(proposal)) continue;
        if (
          proposal.detail?.sourceRetentionRedacted &&
          !proposal.plan &&
          !proposal.planDraft &&
          !proposal.planHash &&
          !proposal.planDraftKey &&
          !proposal.planDraftActor &&
          proposal.planDraftVersion === undefined &&
          proposal.review === "needs_context"
        )
          continue;
        await ctx.db.patch(proposal._id, {
          title: "Unavailable source proposal",
          detail: { schemaVersion: "2.0.0", sourceRetentionRedacted: true },
          // Keep opaque reference generations so delayed run cleanup cannot
          // erase a fresh recovery or lose its old-generation authority fence.
          plan: undefined,
          planDraft: undefined,
          planHash: undefined,
          planDraftVersion: undefined,
          planDraftKey: undefined,
          planDraftActor: undefined,
          review: "needs_context",
          version: proposal.version + 1,
          updatedAt: Math.max(Date.now(), proposal.updatedAt + 1),
        });
        continue;
      }
      if (
        "references" in r &&
        r.references?.some(
          (ref) =>
            ref.sourceId === a.sourceId &&
            (a.maxGeneration === undefined ||
              ref.generation <= a.maxGeneration),
        )
      ) {
        if ("body" in r)
          await ctx.db.patch(r._id, {
            title: "Deleted private draft",
            body: "",
            references: [],
            state: "deleted",
            updatedAt: Date.now(),
          });
        else
          await ctx.db.patch(r._id, {
            ...("goal" in r
              ? { title: "Unavailable improvement", goal: "" }
              : "note" in r
                ? { note: "", measurement: undefined, deployedUrl: undefined }
                : {
                    output: undefined,
                    ...("opportunityGroup" in r
                      ? { opportunityGroup: undefined }
                      : {}),
                  }),
            references: [],
            ...("state" in r ? { state: "deleted" } : {}),
            ...("inspected" in r ? { inspected: undefined } : {}),
            updatedAt: Date.now(),
          });
      }
    }
    const continuation = {
      ...a,
      ...(a.pagesRemaining === undefined
        ? {}
        : { pagesRemaining: a.pagesRemaining - 1 }),
    };
    if ((!page.isDone || a.section !== "proposals") && a.pagesRemaining === 1) {
      await recordRetentionAttention(ctx, a, "page_budget_exhausted");
      return;
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.knowledge.redactDerived, {
        ...continuation,
        cursor: page.continueCursor,
      });
    else if (a.section !== "proposals")
      await ctx.scheduler.runAfter(0, internal.knowledge.redactDerived, {
        ...continuation,
        section:
          a.section === "knowledgeJobs"
            ? "knowledgeEvaluations"
            : a.section === "knowledgeEvaluations"
              ? "issueDrafts"
              : a.section === "issueDrafts"
                ? "improvements"
                : a.section === "improvements"
                  ? "improvementOutcomes"
                  : a.section === "improvementOutcomes"
                    ? "runs"
                    : "proposals",
        cursor: null,
      });
  },
});
export const recoverPage = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    state: v.optional(v.union(v.literal("running"), v.literal("queued"))),
    asOf: v.optional(v.number()),
    section: v.optional(
      v.union(v.literal("knowledgeJobs"), v.literal("knowledgeEvaluations")),
    ),
  },
  handler: async (ctx, a) => {
    if (!workersEnabled()) return;
    const section = a.section ?? "knowledgeJobs";
    const state = a.state ?? "running";
    const asOf = a.asOf ?? Date.now();
    ensure(
      Number.isSafeInteger(asOf) && asOf > 0 && asOf <= Date.now(),
      "INVALID_INPUT",
      "Invalid recovery checkpoint.",
    );
    const active = (table: WorkTable, status: "running" | "queued") =>
      ctx.db
        .query(table)
        .withIndex("by_state_updated", (q) =>
          status === "running"
            ? q.eq("state", status).lt("updatedAt", asOf - limits.timeoutMs)
            : q.eq("state", status).lte("updatedAt", asOf),
        );
    // A pre-upgrade continuation has an unindexed history cursor. Restart it
    // against active work instead of reusing that cursor in the new index.
    const page = await active(section, state).paginate({
      cursor: a.state ? (a.cursor ?? null) : null,
      numItems: 20,
      maximumBytesRead: 512 * 1024,
    });
    for (const row of page.page) {
      if (
        row.state === "running" &&
        Date.now() - row.updatedAt > limits.timeoutMs
      ) {
        await ctx.db.patch(row._id, {
          state: "unknown",
          updatedAt: Date.now(),
        });
        if ("policyVersion" in row) {
          const topic = await ctx.db.get(row.topicId);
          if (topic?.version === row.version)
            await ctx.db.patch(topic._id, { state: "unknown" });
        }
      } else if (row.state === "queued") {
        if ("policyVersion" in row)
          await ctx.scheduler.runAfter(0, internal.knowledgeActions.organize, {
            id: row._id,
          });
        else
          await ctx.scheduler.runAfter(0, internal.knowledgeActions.evaluate, {
            id: row._id,
          });
      }
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.knowledge.recoverPage, {
        section,
        state,
        asOf,
        cursor: page.continueCursor,
      });
    else {
      const phases = [
        { section: "knowledgeJobs", state: "running" },
        { section: "knowledgeJobs", state: "queued" },
        { section: "knowledgeEvaluations", state: "running" },
        { section: "knowledgeEvaluations", state: "queued" },
      ] as const;
      const position = phases.findIndex(
        (p) => p.section === section && p.state === state,
      );
      // Empty phases need no scheduled invocation. One idle cron reads only
      // four empty index ranges, regardless of retained job history.
      for (const next of phases.slice(position + 1))
        if (await active(next.section, next.state).first()) {
          await ctx.scheduler.runAfter(0, internal.knowledge.recoverPage, {
            ...next,
            asOf,
          });
          break;
        }
    }
  },
});
