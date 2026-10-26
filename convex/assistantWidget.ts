import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { selectedProfile, sourceFor } from "./assistant";
import { postDisplayTitle } from "../packages/sources/display";
import { assistantGrant, assistantPrincipal } from "./lib/assistantPrincipal";
import { workspaceReadable } from "./lib/workspacePrivacy";
import { assistantGrantActive } from "../packages/policy/assistant";
import { assistantProject } from "./lib/assistantProject";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { draftCurrent } from "./issues";
import { ensure } from "../packages/policy";

const profile = { profileId: v.optional(v.id("organizations")) };
const url = (org: string, suffix = "") =>
  `https://scroll.companynerve.com/app/${org}${suffix}`;
type Authorized = Awaited<ReturnType<typeof assistantGrant>>;

function cursorFor(a: Authorized, kind: string, cursor: string | null) {
  return cursor
    ? JSON.stringify({
        grant: a.grant._id,
        version: a.grant.version,
        kind,
        cursor,
      })
    : null;
}
function readCursor(a: Authorized, kind: string, value?: string | null) {
  if (!value) return null;
  ensure(value.length <= 4096, "INVALID_INPUT", "Invalid widget page.");
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    ensure(false, "INVALID_INPUT", "Invalid widget page.");
  }
  ensure(
    parsed?.grant === a.grant._id &&
      parsed.version === a.grant.version &&
      parsed.kind === kind &&
      typeof parsed.cursor === "string",
    "APPROVAL_STALE",
    "Access changed. Reload this view.",
  );
  return parsed.cursor as string;
}

function sourceSummary(
  source: Doc<"sources">,
  org: string,
  onlyInsight?: string,
) {
  const insights =
    source.state === "ready"
      ? (source.analysis?.insights ?? []).slice(0, 128)
      : [];
  return {
    id: source._id,
    title: postDisplayTitle(source).slice(0, 200),
    state: source.state,
    kind: source.sourceType ?? source.kind,
    generation: source.generation,
    revision: source.updatedAt,
    coverage: source.coverage ?? null,
    url: url(org, `/library/${source._id}`),
    insights: insights
      .map(
        (
          idea: { id?: string; title?: string; claim?: string },
          index: number,
        ) => ({
          id: String(idea.id ?? index).slice(0, 200),
          fetch_id: `${source._id}~${index}`,
          title: String(idea.title ?? source.title).slice(0, 200),
          claim: String(idea.claim ?? "").slice(0, 600),
          reference: {
            sourceId: source._id,
            generation: source.generation,
            revision: source.updatedAt,
            insightId: String(idea.id ?? index).slice(0, 200),
          },
        }),
      )
      .filter((idea: { id: string }) => !onlyInsight || idea.id === onlyInsight)
      .slice(0, onlyInsight ? 1 : 4),
    more_ideas: (source.analysis?.insights?.length ?? 0) > 4,
  };
}

async function authorizedDraft(
  ctx: QueryCtx,
  a: Authorized,
  id: Id<"issueDrafts">,
) {
  const draft = await ctx.db.get(id);
  ensure(
    draft && draft.organizationId === a.organization._id,
    "FORBIDDEN",
    "Draft unavailable.",
  );
  await assistantGrant(ctx, a.organization._id, "context:read");
  await assistantProject(ctx, a, draft.repositoryId);
  ensure(
    await draftCurrent(ctx, draft),
    "APPROVAL_STALE",
    "Draft evidence or project context changed.",
  );
  ensure(
    draft.references.length <= 128,
    "FORBIDDEN",
    "Review this draft in VibeScroll.",
  );
  for (const ref of draft.references)
    ensure(
      await sourceFor(ctx, a, ref.sourceId),
      "FORBIDDEN",
      "Draft evidence is no longer available.",
    );
  return draft;
}

export const profiles = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const p = await assistantPrincipal(ctx, "knowledge:read");
    const grants = await ctx.db
      .query("assistantGrants")
      .withIndex("by_actor_client", (q) =>
        q.eq("actor", p.actor._id).eq("clientId", p.client.id),
      )
      .take(51);
    const profiles = [];
    for (const grant of grants.slice(0, 50)) {
      if (
        !assistantGrantActive(grant) ||
        !grant.scopes.includes("knowledge:read")
      )
        continue;
      const org = await ctx.db.get(grant.organizationId);
      const member = await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q
            .eq("organizationId", grant.organizationId)
            .eq("userId", p.actor._id),
        )
        .unique();
      if (org && member && workspaceReadable(org, p.actor._id))
        profiles.push({
          profile_id: org._id,
          name: org.name.slice(0, 200),
          grant_version: grant.version,
          expires_at: grant.expiresAt,
          projects: [],
        });
    }
    return {
      profiles,
      truncated: grants.length > 50,
      coverage:
        "Up to fifty current knowledge-readable workspace grants. No project context or source content is disclosed by discovery.",
    };
  },
});

export const state = internalQuery({
  args: profile,
  returns: v.any(),
  handler: async (ctx, args) => {
    const a = await assistantGrant(
      ctx,
      await selectedProfile(ctx, args.profileId),
      "knowledge:read",
    );
    const allowed = (scope: string) =>
      a.scopes.includes(scope) &&
      a.client.scopes.includes(scope as never) &&
      a.grant.scopes.includes(scope);
    const setup =
      a.organization.privateOwnerId === a.actor._id
        ? await ctx.db
            .query("librarySetup")
            .withIndex("by_org", (q) =>
              q.eq("organizationId", a.organization._id),
            )
            .unique()
        : null;
    return {
      schema_version: "vibescroll-widget-v1",
      profile_id: a.organization._id,
      name: a.organization.name.slice(0, 200),
      role: a.membership.role,
      grant_version: a.grant.version,
      expires_at: a.grant.expiresAt,
      scope: a.grant.libraryScope ?? "selected_sources",
      automatic_analysis: a.grant.analysisDefaults?.enabled ?? false,
      cloud_request_policy: a.grant.cloudRequestPolicy ?? null,
      processing_route:
        setup?.actor === a.actor._id ? (setup.processingRoute ?? null) : null,
      actions: {
        jobs: allowed("jobs:read"),
        context: allowed("context:read"),
        save: a.membership.role !== "viewer" && allowed("links:save"),
        feedback: a.membership.role !== "viewer" && allowed("feedback:write"),
        analysis: a.membership.role !== "viewer" && allowed("analysis:request"),
        cloud:
          a.membership.role !== "viewer" &&
          a.grant.cloudRequestPolicy === "explicit_per_source_v1" &&
          allowed("analysis:request") &&
          allowed("analysis:execute"),
        draft:
          ["owner", "admin"].includes(a.membership.role) &&
          allowed("suggestions:draft") &&
          allowed("context:read"),
        events: allowed("events:subscribe"),
      },
      links: {
        home: url(a.organization._id),
        connections: url(a.organization._id, "/connections"),
        projects: url(a.organization._id, "/projects"),
        usage: url(a.organization._id, "/usage"),
        privacy: url(a.organization._id, "/privacy"),
        account: url(a.organization._id, "/account"),
      },
      notice:
        "Widget access uses your existing reviewed grant. Settings, repository consent and protected approvals remain in the authenticated application.",
    };
  },
});

export const browse = internalQuery({
  args: {
    ...profile,
    kind: v.union(
      v.literal("sources"),
      v.literal("topics"),
      v.literal("jobs"),
      v.literal("proposals"),
      v.literal("usage"),
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
    offset: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    ctx = knowledgeReadContext(ctx);
    const a = await assistantGrant(
      ctx,
      await selectedProfile(ctx, args.profileId),
      "knowledge:read",
    );
    const base = {
      profile_id: a.organization._id,
      grant_version: a.grant.version,
    };
    if (args.kind === "jobs")
      await assistantGrant(ctx, a.organization._id, "jobs:read");
    if (args.kind === "usage")
      return {
        ...base,
        items: [],
        next_cursor: null,
        review_url: url(a.organization._id, "/usage"),
        coverage:
          "Usage requires the account's protected billing view. Library read permission does not disclose financial records.",
      };
    if (args.kind === "proposals") {
      await assistantGrant(ctx, a.organization._id, "context:read");
      const page = await ctx.db
        .query("issueDrafts")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organization._id))
        .order("desc")
        .paginate({
          cursor: readCursor(a, "proposals", args.cursor),
          numItems: 5,
        });
      const items = [];
      for (const draft of page.page) {
        try {
          await authorizedDraft(ctx, a, draft._id);
          items.push({
            id: draft._id,
            title: draft.title.slice(0, 200),
            state: draft.state,
            version: draft.version,
            repository_id: draft.repositoryId,
            evaluation_id: draft.evaluationId,
            url: url(
              a.organization._id,
              `/projects?proposal=${encodeURIComponent(draft._id)}`,
            ),
          });
        } catch {
          /* Skip records outside the exact currently granted project/evidence. */
        }
      }
      return {
        ...base,
        items,
        next_cursor: cursorFor(
          a,
          "proposals",
          page.isDone ? null : page.continueCursor,
        ),
        coverage:
          "Up to five current draft candidates per page. Unavailable or ungranted drafts are omitted.",
      };
    }
    if (args.kind === "topics") {
      if (a.grant.libraryScope !== "all")
        return {
          ...base,
          items: [],
          next_cursor: null,
          coverage:
            "Topic labels can combine sources outside a restricted grant. Browse your permitted sources or review full-library access in Connections.",
          review_url: url(a.organization._id, "/connections"),
        };
      const page = await ctx.db
        .query("knowledgeTopics")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organization._id))
        .paginate({
          cursor: readCursor(a, "topics", args.cursor),
          numItems: 10,
        });
      const items = [];
      for (const topic of page.page) {
        if (topic.redirect || topic.state === "deleted") continue;
        const members = await ctx.db
          .query("knowledgeMembers")
          .withIndex("by_topic", (q) => q.eq("topicId", topic._id))
          .take(6);
        let visible = false;
        for (const member of members) {
          const source = await sourceFor(ctx, a, member.sourceId);
          if (
            !member.excluded &&
            !member.retainedHistory &&
            source &&
            source.generation === member.generation &&
            source.updatedAt === member.revision
          ) {
            visible = true;
            break;
          }
        }
        if (visible)
          items.push({
            id: topic._id,
            name: topic.name.slice(0, 160),
            parent_id: topic.parentId ?? null,
            pinned: topic.pinned,
            version: topic.version,
          });
      }
      return {
        ...base,
        items,
        next_cursor: cursorFor(
          a,
          "topics",
          page.isDone ? null : page.continueCursor,
        ),
        coverage:
          "Ten topic candidates per page; visible current evidence is required. No whole-library counts are implied.",
      };
    }
    let ids: Id<"sources">[] = [];
    let next: string | null = null;
    let nextOffset: number | null = null;
    if (a.grant.libraryScope === "all") {
      const page = await ctx.db
        .query("dashboardCards")
        .withIndex("by_org_kind_updated", (q) =>
          q.eq("organizationId", a.organization._id).eq("kind", "source"),
        )
        .order("desc")
        .paginate({
          cursor: readCursor(a, args.kind, args.cursor),
          numItems: 5,
        });
      ids = page.page.flatMap((card) => {
        const sourceId = ctx.db.normalizeId("sources", card.entityId);
        return sourceId ? [sourceId] : [];
      });
      next = cursorFor(a, args.kind, page.isDone ? null : page.continueCursor);
    } else if (a.grant.libraryScope) {
      const page = await ctx.db
        .query("sourceSpaces")
        .withIndex("by_space", (q) =>
          q
            .eq("organizationId", a.organization._id)
            .eq("space", a.grant.libraryScope as "personal" | "business"),
        )
        .order("desc")
        .paginate({
          cursor: readCursor(a, args.kind, args.cursor),
          numItems: 5,
        });
      ids = page.page.map((row) => row.sourceId);
      next = cursorFor(a, args.kind, page.isDone ? null : page.continueCursor);
    } else {
      ensure(
        !args.cursor,
        "INVALID_INPUT",
        "Use source offsets for this grant.",
      );
      const offset = args.offset ?? 0;
      ensure(
        Number.isSafeInteger(offset) && offset >= 0 && offset < 50,
        "INVALID_INPUT",
        "Invalid page.",
      );
      ids = a.grant.sources
        .slice(offset, offset + 5)
        .map((ref) => ref.sourceId);
      nextOffset = offset + 5 < a.grant.sources.length ? offset + 5 : null;
    }
    const items = [];
    for (const id of new Set(ids)) {
      const source = await sourceFor(ctx, a, id);
      if (!source) continue;
      if (args.kind === "jobs") {
        const cloud =
          source.personalAnalysis?.executor === "work_cloud" &&
          source.personalAnalysis.generation === source.generation
            ? source.personalAnalysis
            : null;
        items.push({
          id: source._id,
          source_id: source._id,
          title: postDisplayTitle(source).slice(0, 200),
          status: cloud?.state ?? source.state,
          generation: source.generation,
          revision: source.updatedAt,
          processing: cloud
            ? {
                executor: "work_cloud",
                state: cloud.state,
                stage: cloud.stage ?? null,
              }
            : null,
          url: url(a.organization._id, `/library/${source._id}`),
        });
      } else items.push(sourceSummary(source, a.organization._id));
    }
    return {
      ...base,
      items,
      next_cursor: next,
      next_offset: nextOffset,
      coverage:
        "Up to five permitted sources per page. Hidden and stale records are omitted. Continue only when you choose to load more.",
    };
  },
});

export const topic = internalQuery({
  args: {
    ...profile,
    topicId: v.id("knowledgeTopics"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    ctx = knowledgeReadContext(ctx);
    const a = await assistantGrant(
      ctx,
      await selectedProfile(ctx, args.profileId),
      "knowledge:read",
    );
    ensure(
      a.grant.libraryScope === "all",
      "FORBIDDEN",
      "Topic browsing requires the reviewed full-library scope.",
    );
    const topic = await ctx.db.get(args.topicId);
    ensure(
      topic &&
        topic.organizationId === a.organization._id &&
        !topic.redirect &&
        topic.state !== "deleted",
      "FORBIDDEN",
      "Topic unavailable.",
    );
    const kind = `topic:${topic._id}`;
    const page = await ctx.db
      .query("knowledgeMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", topic._id))
      .paginate({ cursor: readCursor(a, kind, args.cursor), numItems: 5 });
    const items = [];
    for (const member of page.page) {
      if (member.excluded || member.retainedHistory) continue;
      const source = await sourceFor(ctx, a, member.sourceId);
      if (
        !source ||
        source.generation !== member.generation ||
        source.updatedAt !== member.revision
      )
        continue;
      const summary = sourceSummary(
        source,
        a.organization._id,
        member.insightId,
      );
      summary.insights = summary.insights.filter(
        (idea: { id: string }) => idea.id === member.insightId,
      );
      if (summary.insights.length) items.push(summary);
    }
    return {
      profile_id: a.organization._id,
      grant_version: a.grant.version,
      topic: {
        id: topic._id,
        name: topic.name.slice(0, 160),
        version: topic.version,
      },
      items,
      next_cursor: cursorFor(a, kind, page.isDone ? null : page.continueCursor),
      coverage:
        "Five current membership candidates per page. No total coverage is implied.",
    };
  },
});

export const proposal = internalQuery({
  args: { ...profile, proposalId: v.id("issueDrafts") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const a = await assistantGrant(
      ctx,
      await selectedProfile(ctx, args.profileId),
      "knowledge:read",
    );
    const draft = await authorizedDraft(ctx, a, args.proposalId);
    return {
      id: draft._id,
      title: draft.title.slice(0, 200),
      body: draft.body.slice(0, 20000),
      state: draft.state,
      version: draft.version,
      hash: draft.hash,
      references: draft.references,
      repository_id: draft.repositoryId,
      base_sha: draft.baseSha,
      review_url: url(
        a.organization._id,
        `/projects?proposal=${encodeURIComponent(draft._id)}`,
      ),
      editable_in_app: true,
      publication_started: false,
      coding_started: false,
      note: "Review and editing use the existing protected project workflow. Reading this draft starts no action.",
    };
  },
});
