import { query } from "./_generated/server";
import { internalMutation, mutation } from "./lib/projectedMutations";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { access, writeAccess, limit, audit } from "./lib";
import { insightProposalStatus } from "../packages/knowledge/proposal-status";
import { categoryName } from "../packages/categories";
import { ensure, containsSecret } from "../packages/policy";
import {
  referencesCurrent,
  memberEvidence,
  evaluationCurrent,
} from "./knowledge";
import type { Reference } from "../packages/knowledge/contracts";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { filing } from "./librarySpaces";
import { organizeTopicAutomatically } from "./lib/topicHierarchy";

const referenceKey = (r: Reference) =>
  JSON.stringify([r.sourceId, r.generation, r.revision, r.insightId]);
const scopeValue = v.union(
  v.literal("workspace"),
  v.literal("personal"),
  v.literal("business"),
  v.literal("connected"),
);
const scopeArgs = {
  organizationId: v.id("organizations"),
  scope: v.optional(scopeValue),
};
// Bounded explicit organization, never a write hidden inside a read query.
export const autoOrganize = mutation({
  args: {
    organizationId: v.id("organizations"),
    topicIds: v.array(v.id("knowledgeTopics")),
  },
  handler: async (ctx, a) => {
    const { actor } = await writeAccess(ctx, a.organizationId);
    ensure(
      a.topicIds.length <= 20,
      "INVALID_INPUT",
      "Organize up to twenty topics at once.",
    );
    await limit(ctx, `explore-layout:${a.organizationId}`, 20);
    let changed = 0;
    for (const id of new Set(a.topicIds)) {
      const topic = await ctx.db.get(id);
      ensure(
        topic && topic.organizationId === a.organizationId && !topic.redirect,
        "FORBIDDEN",
        "Topic unavailable.",
      );
      if (await organizeTopicAutomatically(ctx, topic)) changed++;
    }
    if (changed)
      await audit(
        ctx,
        a.organizationId,
        actor._id,
        "topic_categories_created",
        a.organizationId,
      );
    return { changed };
  },
});
export const organize = mutation({
  args: {
    topicId: v.id("knowledgeTopics"),
    layoutVersion: v.number(),
    parentId: v.optional(v.union(v.id("knowledgeTopics"), v.null())),
    aliases: v.array(v.string()),
  },
  handler: async (ctx, a) => {
    const topic = await ctx.db.get(a.topicId);
    ensure(topic && !topic.redirect, "FORBIDDEN", "Topic unavailable.");
    const { actor } = await writeAccess(ctx, topic.organizationId);
    await limit(ctx, `explore-layout:${topic.organizationId}`, 20);
    ensure(
      (topic.layoutVersion ?? 0) === a.layoutVersion,
      "APPROVAL_STALE",
      "Topic structure changed. Reload before saving.",
    );
    ensure(a.aliases.length <= 8, "INVALID_INPUT", "Use up to eight aliases.");
    const aliases = [...new Set(a.aliases.map(categoryName))];
    ensure(
      !aliases.some(containsSecret),
      "POLICY_BLOCKED",
      "Do not include credentials in topic names.",
    );
    let parentId = a.parentId ?? null;
    const seen = new Set<string>([topic._id]);
    for (let depth = 0; parentId; depth++) {
      ensure(
        depth < 12 && !seen.has(parentId),
        "INVALID_INPUT",
        "Choose a parent without a cycle, within twelve levels.",
      );
      seen.add(parentId);
      const parent = await ctx.db.get(parentId);
      ensure(
        parent &&
          parent.organizationId === topic.organizationId &&
          !parent.redirect,
        "FORBIDDEN",
        "Parent topic unavailable.",
      );
      parentId = parent.parentId ?? null;
    }
    await ctx.db.patch(topic._id, {
      ...(a.parentId === undefined
        ? {}
        : { parentId: a.parentId ?? undefined }),
      aliases,
      searchText: [topic.name, ...aliases].join(" "),
      layoutVersion: a.layoutVersion + 1,
    });
    await audit(
      ctx,
      topic.organizationId,
      actor._id,
      "topic_structure_corrected",
      topic._id,
    );
    return { layoutVersion: a.layoutVersion + 1 };
  },
});
// Add an alias-search projection without replaying classification or analysis.
export const backfillSearch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    ensure(
      process.env.RESTORE_LOCK !== "true",
      "POLICY_BLOCKED",
      "Recovery is in progress.",
    );
    const page = await ctx.db
      .query("knowledgeTopics")
      .paginate({ cursor: a.cursor ?? null, numItems: 10 });
    for (const topic of page.page)
      if (topic.searchText === undefined)
        await ctx.db.patch(topic._id, {
          searchText: [topic.name, ...(topic.aliases ?? [])].join(" "),
        });
    return {
      done: page.isDone,
      cursor: page.isDone ? null : page.continueCursor,
      visited: page.page.length,
    };
  },
});
// Authority is recomputed in every query. Labels and previously returned data grant nothing.
export async function exploreScope(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  requested?: "workspace" | "personal" | "business" | "connected",
  metadataOnly = false,
) {
  const { organization } = await access(ctx, organizationId);
  const setup = organization.privateOwnerId
    ? await ctx.db
        .query("librarySetup")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .unique()
    : null;
  const scopes = organization.privateOwnerId
    ? [
        "personal",
        "business",
        ...(setup?.confirmed && setup.connectSpaces ? ["connected"] : []),
      ]
    : ["workspace"];
  const scope =
    requested ??
    (organization.privateOwnerId
      ? (setup?.focus[0] ?? "personal")
      : "workspace");
  ensure(
    scopes.includes(scope),
    "FORBIDDEN",
    "This library view is unavailable. Review your current space setup.",
  );
  const filed = new Map<string, Promise<string[]>>();
  const cards = new Map<string, Promise<Doc<"dashboardCards"> | null>>();
  const permitted = async (refs: Reference[]) => {
    if (
      refs.some((ref) => "schemaVersion" in ref) ||
      !refs.length ||
      refs.length > 128 ||
      (!metadataOnly && !(await referencesCurrent(ctx, organizationId, refs)))
    )
      return false;
    if (metadataOnly)
      for (const ref of refs) {
        let read = cards.get(ref.sourceId);
        if (!read) {
          read = ctx.db
            .query("dashboardCards")
            .withIndex("by_entity", (q) => q.eq("entityId", ref.sourceId))
            .unique();
          cards.set(ref.sourceId, read);
        }
        const card = await read;
        if (
          !card ||
          card.organizationId !== organizationId ||
          card.kind !== "source" ||
          card.state !== "ready" ||
          !card.rightsAttested ||
          card.generation !== ref.generation ||
          card.updatedAt !== ref.revision ||
          !card.insightIds?.includes(ref.insightId)
        )
          return false;
      }
    if (scope === "workspace") return true;
    for (const ref of refs) {
      let result = filed.get(ref.sourceId);
      if (!result) {
        result = filing(ctx, ref.sourceId as Id<"sources">);
        filed.set(ref.sourceId, result);
      }
      const spaces = await result;
      if (
        scope === "connected"
          ? !spaces.some((s) => s === "personal" || s === "business")
          : !spaces.includes(scope)
      )
        return false;
    }
    return true;
  };
  return { scope, scopes, permitted };
}
export const topics = query({
  args: {
    ...scopeArgs,
    cursor: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    const scope = await exploreScope(ctx, a.organizationId, a.scope, true);
    const migration = await ctx.db
      .query("dashboardMigrations")
      .withIndex("by_name", (q) => q.eq("name", "dashboard-v1"))
      .unique();
    if (!migration?.complete)
      return {
        items: [],
        next: null,
        scope: scope.scope,
        scopes: scope.scopes,
        coverage:
          "Library metadata is updating. Individual saved posts remain available. No inference is started by this view.",
      };
    const page = a.search?.trim()
      ? await ctx.db
          .query("knowledgeTopics")
          .withSearchIndex("search_explore", (q) =>
            q
              .search("searchText", a.search!.trim().slice(0, 120))
              .eq("organizationId", a.organizationId),
          )
          .paginate({ cursor: a.cursor ?? null, numItems: 10 })
      : await ctx.db
          .query("knowledgeTopics")
          .withIndex("by_org_leaf", (q) =>
            q
              .eq("organizationId", a.organizationId)
              .eq("autoCategory", undefined),
          )
          .order("desc")
          .paginate({ cursor: a.cursor ?? null, numItems: 10 });
    const items = [];
    for (const topic of page.page) {
      if (topic.redirect || topic.autoCategory) continue;
      const members = await ctx.db
        .query("knowledgeMembers")
        .withIndex("by_topic", (q) => q.eq("topicId", topic._id))
        .take(21);
      const visible = [];
      for (const member of members.slice(0, 20)) {
        const reference = {
          sourceId: member.sourceId,
          generation: member.generation,
          revision: member.revision,
          insightId: member.insightId,
        };
        if (
          !member.excluded &&
          member.organizationId === a.organizationId &&
          (await scope.permitted([reference]))
        )
          visible.push({ reference });
      }
      // Do not expose names or global counts of topics with no permitted evidence in this page.
      if (!visible.length) continue;
      items.push({
        id: topic._id,
        name: topic.name,
        version: topic.version,
        pinned: topic.pinned,
        parentId: topic.parentId,
        aliases: topic.aliases ?? [],
        layoutVersion: topic.layoutVersion ?? 0,
        ideas: visible.length,
        posts: new Set(visible.map((e) => e.reference.sourceId)).size,
        moreEvidence: members.length > 20,
      });
    }
    // Generic authored ancestors appear ONLY through an already permitted leaf.
    // No descendant scan, memberships copied to parents, or global count exposure.
    const ancestors = new Map<
      string,
      {
        id: Id<"knowledgeTopics">;
        name: string;
        parentId?: Id<"knowledgeTopics">;
        version: number;
        pinned: boolean;
        aliases: string[];
        layoutVersion: number;
        ideas: number;
        posts: number;
        moreEvidence: boolean;
        autoCategory: boolean;
      }
    >();
    for (const item of items) {
      let id = item.parentId;
      const seen = new Set<string>([item.id]);
      for (
        let depth = 0;
        id && depth < 12 && !seen.has(id) && ancestors.size < 30;
        depth++
      ) {
        seen.add(id);
        if (ancestors.has(id)) break;
        const parent = await ctx.db.get(id);
        if (
          !parent ||
          parent.organizationId !== a.organizationId ||
          parent.redirect ||
          !parent.autoCategory
        )
          break;
        ancestors.set(id, {
          id: parent._id,
          name: parent.name,
          parentId: parent.parentId,
          version: parent.version,
          pinned: parent.pinned,
          aliases: parent.aliases ?? [],
          layoutVersion: parent.layoutVersion ?? 0,
          ideas: 0,
          posts: 0,
          moreEvidence: false,
          autoCategory: true,
        });
        id = parent.parentId;
      }
    }
    const all = [...ancestors.values(), ...items];
    const visibleIds = new Set(all.map((item) => item.id));
    return {
      items: all.map((item) => ({
        ...item,
        parentId:
          item.parentId && visibleIds.has(item.parentId)
            ? item.parentId
            : undefined,
      })),
      next: page.isDone ? null : page.continueCursor,
      scope: scope.scope,
      scopes: scope.scopes,
      coverage:
        "Up to 10 topics and the first 20 memberships per topic. Counts describe current permitted evidence on these pages, not whole-library totals. Topics can overlap.",
    };
  },
});
export const detail = query({
  args: {
    ...scopeArgs,
    topicId: v.id("knowledgeTopics"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    const scope = await exploreScope(ctx, a.organizationId, a.scope);
    const topic = await ctx.db.get(a.topicId);
    ensure(
      topic && topic.organizationId === a.organizationId && !topic.redirect,
      "FORBIDDEN",
      "Topic unavailable.",
    );
    const page = await ctx.db
      .query("knowledgeMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", a.topicId))
      .paginate({ cursor: a.cursor ?? null, numItems: 20 });
    const members = [];
    for (const member of page.page) {
      const evidence = (await memberEvidence(ctx, [member]))[0];
      if (evidence && (await scope.permitted([evidence.reference])))
        members.push({
          _id: member._id,
          evidence: {
            reference: evidence.reference,
            title: evidence.title,
            insight: {
              title: evidence.insight.title,
              icon: evidence.insight.icon,
              categories: evidence.insight.categories,
              claim: evidence.insight.claim,
              evidence: evidence.insight.evidence,
            },
          },
        });
    }
    const jobs = await ctx.db
      .query("knowledgeJobs")
      .withIndex("by_topic", (q) => q.eq("topicId", a.topicId))
      .order("desc")
      .take(20);
    const keys = new Set(
      members.map((m) => referenceKey(m.evidence.reference)),
    );
    const summaries = [];
    for (const job of jobs) {
      if (
        job.version !== topic.version ||
        job.state !== "ready" ||
        !job.output ||
        !job.references.every((ref) => keys.has(referenceKey(ref))) ||
        !(await scope.permitted(job.references))
      )
        continue;
      const relations = (job.output.relations ?? []).filter(
        (r: any) =>
          r.references.length >= 2 &&
          r.references.every((ref: Reference) => keys.has(referenceKey(ref))),
      );
      if (relations.length)
        summaries.push({ id: job._id, output: { relations } });
    }
    return {
      topic: members.length
        ? {
            _id: topic._id,
            name: topic.name,
            version: topic.version,
            layoutVersion: topic.layoutVersion ?? 0,
            aliases: topic.aliases ?? [],
          }
        : null,
      members,
      summaries,
      next: page.isDone ? null : page.continueCursor,
      coverage:
        "Current permitted evidence on this page. Connections reuse exact-version cited summaries; missing connections do not establish disagreement or agreement.",
    };
  },
});
export const journey = query({
  args: {
    ...scopeArgs,
    topicId: v.id("knowledgeTopics"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    const scope = await exploreScope(ctx, a.organizationId, a.scope);
    const topic = await ctx.db.get(a.topicId);
    ensure(
      topic && topic.organizationId === a.organizationId && !topic.redirect,
      "FORBIDDEN",
      "Topic unavailable.",
    );
    const page = await ctx.db
      .query("knowledgeEvaluations")
      .withIndex("by_topic", (q) => q.eq("topicId", a.topicId))
      .order("desc")
      .paginate({ cursor: a.cursor ?? null, numItems: 10 });
    const items = [];
    for (const evaluation of page.page) {
      if (
        evaluation.organizationId !== a.organizationId ||
        !(await scope.permitted(evaluation.references))
      )
        continue;
      const repository = await ctx.db.get(evaluation.repositoryId);
      if (repository?.organizationId !== a.organizationId) continue;
      const current = await evaluationCurrent(ctx, evaluation);
      const sources = [];
      for (const sourceId of new Set(
        evaluation.references.map((ref) => ref.sourceId),
      )) {
        const source = await ctx.db.get(sourceId as Id<"sources">);
        if (source)
          sources.push({
            id: source._id,
            title: source.title,
            insights: evaluation.references
              .filter((r) => r.sourceId === sourceId)
              .map((r) => r.insightId),
          });
      }
      const drafts = await ctx.db
        .query("issueDrafts")
        .withIndex("by_evaluation", (q) => q.eq("evaluationId", evaluation._id))
        .take(5);
      const steps = [];
      for (const draft of drafts) {
        if (
          draft.organizationId !== a.organizationId ||
          draft.repositoryId !== evaluation.repositoryId ||
          draft.state === "deleted" ||
          !(await scope.permitted(draft.references))
        )
          continue;
        const attempts = await ctx.db
          .query("issueAttempts")
          .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
          .order("desc")
          .take(5);
        const publication = attempts.find(
          (p) =>
            p.state === "published" &&
            p.hash === draft.hash &&
            p.draftVersion === draft.version,
        );
        const improvement = await ctx.db
          .query("improvements")
          .withIndex("by_issue", (q) => q.eq("issueDraftId", draft._id))
          .unique();
        let run, outcome;
        if (
          improvement &&
          improvement.organizationId === a.organizationId &&
          improvement.evaluationId === evaluation._id &&
          improvement.repositoryId === draft.repositoryId &&
          improvement.state !== "deleted" &&
          improvement.issueHash === draft.hash &&
          improvement.issueVersion === draft.version &&
          (await scope.permitted(improvement.references))
        ) {
          const proposal = await ctx.db.get(improvement.proposalId);
          if (
            proposal?.organizationId === a.organizationId &&
            proposal.improvementId === improvement._id
          ) {
            const runs = await ctx.db
              .query("runs")
              .withIndex("by_proposal", (q) =>
                q.eq("proposalId", improvement.proposalId),
              )
              .order("desc")
              .take(10);
            const observed = runs.find(
              (r) =>
                r.organizationId === a.organizationId &&
                r.repositoryId === improvement.repositoryId,
            );
            if (observed)
              run = {
                state: observed.state,
                prUrl: observed.prUrl,
                prState: observed.prState,
                mergedAt: observed.mergedAt,
                observedAt: observed.observedAt,
                deployment: observed.deployment,
              };
            const result = await ctx.db
              .query("improvementOutcomes")
              .withIndex("by_improvement", (q) =>
                q.eq("improvementId", improvement._id),
              )
              .order("desc")
              .first();
            if (
              result?.organizationId === a.organizationId &&
              result.runId === observed?._id &&
              (await scope.permitted(result.references))
            )
              outcome = {
                verdict: result.verdict,
                method: result.method,
                note: result.note,
                measurement: result.measurement,
                deployedVersion: result.deployedVersion,
                createdAt: result.createdAt,
              };
          }
        }
        steps.push({
          id: draft._id,
          title: draft.title,
          description: draft.body.slice(0, 500),
          references: draft.references,
          state: draft.state,
          issueUrl: publication?.url,
          issueState: publication?.externalState,
          run,
          outcome,
        });
      }
      items.push({
        id: evaluation._id,
        ...(evaluation.privateEvaluationOrigin
          ? { privateEvaluationOrigin: evaluation.privateEvaluationOrigin }
          : {}),
        sources,
        repository: repository.fullName,
        current,
        state: current ? evaluation.state : "stale",
        disposition: evaluation.output?.disposition,
        decision: evaluation.decision,
        baseSha: evaluation.baseSha,
        steps,
      });
    }
    return {
      items,
      next: page.isDone ? null : page.continueCursor,
      coverage:
        "Up to 10 recorded evaluations and five issue drafts each. A merge or deployment is not a measured benefit. No record means no completed step is claimed.",
    };
  },
});
export const helped = query({
  args: {
    ...scopeArgs,
    cursor: v.optional(v.string()),
    method: v.optional(
      v.union(v.literal("judgment"), v.literal("measurement")),
    ),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    const scope = await exploreScope(ctx, a.organizationId, a.scope);
    const page = await ctx.db
      .query("improvementOutcomes")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .order("desc")
      .paginate({ cursor: a.cursor ?? null, numItems: 20 });
    const items = [];
    for (const outcome of page.page) {
      if (
        (a.method === "judgment" && outcome.method !== "judgment") ||
        (a.method === "measurement" && !outcome.measurement) ||
        !(await scope.permitted(outcome.references))
      )
        continue;
      const improvement = await ctx.db.get(outcome.improvementId);
      if (
        !improvement ||
        improvement.organizationId !== a.organizationId ||
        improvement.state === "deleted" ||
        !(await scope.permitted(improvement.references))
      )
        continue;
      const evaluation = await ctx.db.get(improvement.evaluationId);
      if (
        !evaluation ||
        evaluation.organizationId !== a.organizationId ||
        !(await scope.permitted(evaluation.references))
      )
        continue;
      const topic = evaluation.topicId
        ? await ctx.db.get(evaluation.topicId)
        : null;
      if (!topic || topic.organizationId !== a.organizationId || topic.redirect)
        continue;
      const sourceIds = new Set(outcome.references.map((r) => r.sourceId));
      const sources = [];
      for (const id of sourceIds) {
        const source = await ctx.db.get(id as Id<"sources">);
        if (source) sources.push({ id: source._id, title: source.title });
      }
      items.push({
        id: outcome._id,
        topicId: evaluation.topicId,
        title: improvement.title,
        verdict: outcome.verdict,
        method: outcome.method,
        note: outcome.note,
        measurement: outcome.measurement,
        deployedVersion: outcome.deployedVersion,
        createdAt: outcome.createdAt,
        sources,
      });
    }
    return {
      items,
      next: page.isDone ? null : page.continueCursor,
      scope: scope.scope,
      scopes: scope.scopes,
      coverage:
        "Up to 20 recorded outcomes per page. Reported comparisons retain their sampling windows and limitations; they do not establish causation.",
    };
  },
});

// One indexed page per browse request. Never claim a capped page as a total.
export const proposalBadges = query({
  args: { ...scopeArgs, cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    const scope = await exploreScope(ctx, a.organizationId, a.scope);
    const page = await ctx.db
      .query("issueDrafts")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .paginate({ cursor: a.cursor ?? null, numItems: 5 });
    const items = [];
    let complete = true;
    for (const draft of page.page) {
      if (["deleted", "rejected"].includes(draft.state)) continue;
      // Large legacy citations require a separate bounded proof, not a larger read.
      if (draft.references.length > 16) {
        complete = false;
        continue;
      }
      const evaluation = await ctx.db.get(draft.evaluationId);
      if (evaluation && evaluation.references.length > 16) {
        complete = false;
        continue;
      }
      if (
        !evaluation ||
        evaluation.organizationId !== a.organizationId ||
        evaluation.repositoryId !== draft.repositoryId ||
        evaluation.topicId !== draft.topicId ||
        evaluation.topicVersion !== draft.topicVersion ||
        evaluation.baseSha !== draft.baseSha ||
        evaluation.profileVersion !== draft.profileVersion ||
        (evaluation.selectionVersion ?? 0) !== (draft.selectionVersion ?? 0) ||
        !(await evaluationCurrent(ctx, evaluation)) ||
        !(await scope.permitted(draft.references)) ||
        !draft.references.every((ref) =>
          evaluation.references.some(
            (cited) => referenceKey(cited) === referenceKey(ref),
          ),
        )
      )
        continue;
      const repository = await ctx.db.get(draft.repositoryId);
      if (repository?.organizationId !== a.organizationId) continue;
      const observedPublication = await ctx.db
        .query("issueAttempts")
        .withIndex("by_current_publication", (q) =>
          q
            .eq("draftId", draft._id)
            .eq("state", "published")
            .eq("hash", draft.hash)
            .eq("draftVersion", draft.version),
        )
        .order("desc")
        .first();
      const publication =
        observedPublication?.organizationId === a.organizationId &&
        observedPublication.repositoryId === draft.repositoryId
          ? observedPublication
          : null;
      const improvement = await ctx.db
        .query("improvements")
        .withIndex("by_issue", (q) => q.eq("issueDraftId", draft._id))
        .unique();
      let run;
      if (
        improvement &&
        improvement.organizationId === a.organizationId &&
        improvement.repositoryId === draft.repositoryId &&
        improvement.evaluationId === evaluation._id &&
        improvement.issueHash === draft.hash &&
        improvement.issueVersion === draft.version &&
        improvement.state !== "deleted" &&
        (await scope.permitted(improvement.references))
      ) {
        const proposal = await ctx.db.get(improvement.proposalId);
        if (
          proposal?.organizationId === a.organizationId &&
          proposal.improvementId === improvement._id
        ) {
          const observed = await ctx.db
            .query("runs")
            .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
            .order("desc")
            .first();
          if (
            observed?.organizationId === a.organizationId &&
            observed.repositoryId === draft.repositoryId
          )
            run = { prState: observed.prState, mergedAt: observed.mergedAt };
        }
      }
      const status = insightProposalStatus({
        state: draft.state,
        issueState: publication?.externalState,
        run,
      });
      if (!status.known) complete = false;
      if (!status.open) continue;
      const topicIds = new Set<string>();
      for (const ref of draft.references) {
        const memberships = await ctx.db
          .query("knowledgeMembers")
          .withIndex("by_reference", (q) =>
            q
              .eq("organizationId", a.organizationId)
              .eq("sourceId", ref.sourceId as Id<"sources">)
              .eq("generation", ref.generation)
              .eq("revision", ref.revision)
              .eq("insightId", ref.insightId),
          )
          .take(21);
        if (memberships.length > 20) complete = false;
        for (const member of memberships.slice(0, 20)) {
          if (member.excluded) continue;
          let id: Id<"knowledgeTopics"> | undefined = member.topicId;
          const seen = new Set<string>();
          for (let depth = 0; id && depth < 12; depth++) {
            if (seen.has(id)) {
              complete = false;
              break;
            }
            seen.add(id);
            const topic: Doc<"knowledgeTopics"> | null = await ctx.db.get(id);
            if (
              !topic ||
              topic.organizationId !== a.organizationId ||
              topic.redirect
            )
              break;
            topicIds.add(topic._id);
            id = topic.parentId;
          }
          if (id) complete = false;
        }
      }
      items.push({
        id: draft._id,
        title: draft.title,
        description: draft.body.slice(0, 500),
        repository: repository.fullName,
        state: draft.state,
        issueState: publication?.externalState,
        run,
        references: draft.references,
        topicIds: [...topicIds],
      });
    }
    return {
      items,
      next: page.isDone ? null : page.continueCursor,
      complete,
      scope: scope.scope,
    };
  },
});
