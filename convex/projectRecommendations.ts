import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { access, limit } from "./lib";
import { ensure, PolicyError } from "../packages/policy";
import { historySource, selectedAnalysis } from "./lib/analysisHistory";
import { currentPlanningProject } from "./lib/assistantProject";
import { readablePostKey } from "./lib/postEngagementRead";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { samePostPlans } from "./lib/projectRecommendationHistory";
import { projectPriority } from "./projectRecommendationSchema";
import {
  compareProjectRecommendations,
  projectTopicFit,
} from "../packages/contracts/project-fit";
import { socialHash } from "../packages/social/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";

const unavailable = (error: unknown) =>
  error instanceof PolicyError || error instanceof ConvexError;

export const read = query({
  args: { organizationId: v.id("organizations"), sourceId: v.id("sources") },
  returns: v.any(),
  handler: async (raw, { organizationId, sourceId }) => {
    const ctx = knowledgeReadContext(raw);
    // This aggregate is for the normal website session. The MCP context tool
    // supplies same-post hints only after its narrower source/project grants.
    const { actor } = await access(ctx, organizationId);
    const { source } = await historySource(ctx, sourceId);
    ensure(
      source.organizationId === organizationId,
      "FORBIDDEN",
      "Post unavailable.",
    );
    await readablePostKey(ctx, source);
    const selected = await selectedAnalysis(ctx, source);
    const topics = [
      ...new Set<string>(
        selected?.output.insights.flatMap(
          (i: { categories?: string[] }) => i.categories ?? [],
        ) ??
          source.categoryKeys ??
          [],
      ),
    ].slice(0, 40);
    const projects = await ctx.db
      .query("repositories")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .take(21);
    const cards = await ctx.db
      .query("dashboardCards")
      .withIndex("by_org_kind_updated", (q) =>
        q.eq("organizationId", organizationId).eq("kind", "proposal"),
      )
      .order("desc")
      .take(41);
    const history = cards.slice(0, 40);
    const categorySets = new Map<string, string[]>();
    const inspected = new Set<string>();
    for (const card of history) {
      if (
        !card.sourceId ||
        card.sourceId === sourceId ||
        inspected.has(card.sourceId)
      )
        continue;
      if (inspected.size >= 8) break;
      inspected.add(card.sourceId);
      try {
        const prior = (await historySource(ctx, card.sourceId)).source;
        if (prior.organizationId !== organizationId) continue;
        await readablePostKey(ctx, prior);
        const categories = await ctx.db
          .query("sourceCategories")
          .withIndex("by_source", (q) => q.eq("sourceId", prior._id))
          .take(40);
        categorySets.set(
          prior._id,
          categories.map((c) => c.categoryKey),
        );
      } catch (error) {
        if (!unavailable(error)) throw error;
      }
    }
    const items = [];
    for (const repository of projects.slice(0, 20)) {
      if (
        !repository.enabled ||
        !repository.confirmed ||
        repository.status !== "connected"
      )
        continue;
      try {
        await currentPlanningProject(ctx, organizationId, repository._id);
      } catch (error) {
        if (unavailable(error)) continue;
        throw error;
      }
      const fit = projectTopicFit(topics, repository.profile);
      const preference = await ctx.db
        .query("projectRecommendationPreferences")
        .withIndex("by_pair", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("userId", actor._id)
            .eq("repositoryId", repository._id),
        )
        .unique();
      const own = history.filter((p) => p.repositoryId === repository._id);
      const related = own.filter(
        (p) =>
          p.sourceId &&
          p.sourceId !== sourceId &&
          categorySets.get(p.sourceId)?.some((t) => topics.includes(t)),
      );
      const samePost = await samePostPlans(
        ctx,
        source,
        repository,
        selected?.metadata.id ?? null,
      );
      items.push({
        id: repository._id,
        name: repository.fullName,
        topics: fit.criteria.filter((c) => c.matched).map((c) => c.category),
        fit,
        recommended: fit.matched > 0,
        priority: preference?.priority ?? ("normal" as const),
        priorityRevision: preference?.revision ?? 0,
        projectRevision: {
          baseSha: repository.sha,
          profileVersion: repository.profileVersion,
          selectionVersion: repository.selectionVersion ?? 0,
        },
        history: {
          samePost: samePost.items,
          samePostLimited: samePost.limited,
          relatedPosts: new Set(related.map((p) => p.sourceId)).size,
          relatedAccepted: related.filter((p) => p.review === "accepted")
            .length,
          relatedRejected: related.filter((p) => p.review === "rejected")
            .length,
          lastPlanActivityAt: own.reduce<number | null>(
            (at, p) => Math.max(at ?? 0, p.updatedAt),
            null,
          ),
          measuredOutcomes: null,
        },
      });
    }
    items.sort(compareProjectRecommendations);
    const rubric = "topic-history-priority-v2";
    const versionId = selected?.metadata.id ?? null;
    const snapshot = {
      rubric,
      versionId,
      sourceGeneration: source.generation,
      sourceRevision: source.updatedAt,
      items,
      historyCards: history.map((p) => [
        p.entityId,
        p.version ?? 0,
        p.updatedAt,
      ]),
      inspectedPostCount: inspected.size,
    };
    return {
      versionId,
      rubric,
      fingerprint: await socialHash(canonicalJson(snapshot)),
      items,
      sample: {
        projects: Math.min(projects.length, 20),
        projectsLimited: projects.length > 20,
        proposalCards: history.length,
        proposalCardsLimited: cards.length > 40,
        inspectedHistoricalPosts: inspected.size,
        historicalPostLimit: 8,
      },
      creditsSpent: 0,
      analysisStarted: false,
    };
  },
});

export const setPriority = mutation({
  args: {
    organizationId: v.id("organizations"),
    repositoryId: v.id("repositories"),
    priority: projectPriority,
    expectedRevision: v.number(),
  },
  returns: v.object({ priority: projectPriority, revision: v.number() }),
  handler: async (ctx, args) => {
    const { actor } = await access(ctx, args.organizationId, [
      "owner",
      "admin",
      "member",
    ]);
    await currentPlanningProject(ctx, args.organizationId, args.repositoryId);
    const row = await ctx.db
      .query("projectRecommendationPreferences")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", actor._id)
          .eq("repositoryId", args.repositoryId),
      )
      .unique();
    ensure(
      Number.isSafeInteger(args.expectedRevision) &&
        args.expectedRevision >= 0 &&
        (row?.revision ?? 0) === args.expectedRevision,
      "APPROVAL_STALE",
      "Your project priority changed. Refresh before trying again.",
    );
    if (row?.priority === args.priority)
      return { priority: row.priority, revision: row.revision };
    await limit(ctx, `project-priority:${actor._id}`, 30);
    const fields = {
      priority: args.priority,
      revision: (row?.revision ?? 0) + 1,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, fields);
    else
      await ctx.db.insert("projectRecommendationPreferences", {
        organizationId: args.organizationId,
        userId: actor._id,
        repositoryId: args.repositoryId,
        ...fields,
      });
    return { priority: fields.priority, revision: fields.revision };
  },
});
