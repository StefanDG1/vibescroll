import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { sourceFor } from "./assistant";
import { postDisplayTitle } from "../packages/sources/display";
import { assistantGrant } from "./lib/assistantPrincipal";
import { assistantProject } from "./lib/assistantProject";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { draftCurrent } from "./issues";
import { ensure } from "../packages/policy";
import { automaticAnalysisEnabled } from "./lib/workCloudSave";
import {
  widgetAccess,
  widgetDiscovery,
  widgetWorkspaceKind,
} from "./lib/assistantWidgetSelection";
import { fullCatalogEntitled } from "./lib/fullCatalogAccess";
import { catalogConfiguration } from "./lib/cloudCatalog";
import {
  catalogMetadataPage,
  catalogPostDetail,
  catalogFrameLocation,
} from "./lib/catalogBrowse";

const profile = { profileId: v.optional(v.id("organizations")) };
const url = (org: string, suffix = "") =>
  `https://scroll.companynerve.com/app/${org}${suffix}`;
type Authorized = Awaited<ReturnType<typeof assistantGrant>>;

async function catalogStatus(ctx: QueryCtx, a: Authorized) {
  const scope = a.grant.libraryScope === "all";
  const entitled = scope && (await fullCatalogEntitled(ctx, a.actor));
  const enabled = entitled && a.actor.fullCatalogEnabled === true;
  const available = scope && !!catalogConfiguration();
  return {
    entitled,
    enabled,
    available,
    allowed: enabled && available,
    source: entitled ? a.actor.fullCatalogGrant!.source : null,
    review_url: url(a.organization._id, "/privacy"),
  };
}

function requireCatalogScope(a: Authorized) {
  ensure(
    a.grant.libraryScope === "all",
    "FORBIDDEN",
    "Catalog browsing requires the reviewed full-library knowledge scope.",
  );
}

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
  args: profile,
  returns: v.any(),
  handler: async (ctx, args) => {
    ctx = knowledgeReadContext(ctx);
    const discovery = await widgetDiscovery(ctx, args.profileId);
    return {
      profiles: discovery.available.map((a) => ({
        profile_id: a.organization._id,
        name: a.organization.name.slice(0, 200),
        grant_version: a.grant.version,
        expires_at: a.grant.expiresAt,
        projects: [],
        kind: widgetWorkspaceKind(a),
        is_default: a.actor.defaultWorkspaceId === a.organization._id,
        selected: discovery.selected?.organization._id === a.organization._id,
      })),
      selected_profile_id: discovery.selected?.organization._id ?? null,
      selection_reason: discovery.reason,
      truncated: discovery.truncated,
      coverage:
        "Up to fifty current knowledge-readable workspace grants. Service workspaces are omitted. Explicit selection, a current saved default, or an eligible personal workspace takes precedence. No project context or source content is disclosed.",
    };
  },
});

export const state = internalQuery({
  args: profile,
  returns: v.any(),
  handler: async (ctx, args) => {
    const { a, reason } = await widgetAccess(ctx, args.profileId);
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
    const catalog = await catalogStatus(ctx, a);
    return {
      schema_version: "vibescroll-widget-v1",
      profile_id: a.organization._id,
      selected_profile_id: a.organization._id,
      selection_reason: reason,
      kind: widgetWorkspaceKind(a),
      is_default: a.actor.defaultWorkspaceId === a.organization._id,
      catalog,
      name: a.organization.name.slice(0, 200),
      role: a.membership.role,
      grant_version: a.grant.version,
      expires_at: a.grant.expiresAt,
      scope: a.grant.libraryScope ?? "selected_sources",
      automatic_analysis: await automaticAnalysisEnabled(
        ctx,
        a.actor,
        a.organization,
        a.grant,
      ),
      cloud_request_policy: a.grant.cloudRequestPolicy ?? null,
      processing_route:
        setup?.actor === a.actor._id ? (setup.processingRoute ?? null) : null,
      actions: {
        catalog: catalog.allowed,
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
      v.literal("catalog"),
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
    const { a } = await widgetAccess(ctx, args.profileId);
    const base = {
      profile_id: a.organization._id,
      grant_version: a.grant.version,
    };
    ensure(
      args.offset === undefined ||
        (Number.isSafeInteger(args.offset) &&
          args.offset >= 0 &&
          args.offset < 50),
      "INVALID_INPUT",
      "Invalid page.",
    );
    const sourceOffsets =
      !a.grant.libraryScope && ["sources", "jobs"].includes(args.kind);
    ensure(
      sourceOffsets || !args.offset,
      "INVALID_INPUT",
      "This collection uses cursors, not source offsets.",
    );
    if (args.kind === "catalog") {
      requireCatalogScope(a);
      const page = await catalogMetadataPage(
        ctx,
        a.organization._id,
        readCursor(a, "catalog", args.cursor),
        10,
      );
      return {
        ...base,
        items: page.items.map((item) => ({
          id: item.familyId,
          family_id: item.familyId,
          artifact_id: item.artifactId,
          version_id: item.versionId,
          kind: "catalog",
          state: "ready",
          canonical: item.canonical,
          title: item.title,
          author_name: item.authorName,
          duration_seconds: item.durationSeconds,
          insight_count: item.insightCount,
          updated_at: item.updatedAt,
          thumbnail_reference: item.thumbnailReference,
          url: url(a.organization._id, "/explore"),
        })),
        next_cursor: cursorFor(a, "catalog", page.next),
        next_offset: null,
        coverage:
          "Up to ten canonical catalog candidates per page. Only metadata for current selected versions is returned; unavailable candidates are omitted within this page. Browsing saves no personal post and starts no processing. Continue only when you choose to load more.",
      };
    }
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
      coverage: sourceOffsets
        ? "Up to five explicit source references per page. Hidden and stale references are omitted within this slice. Continue with next_offset; no complete-library coverage is implied."
        : "Up to five saved-source candidates per page. Hidden and stale candidates are omitted within this page. Continue with next_cursor only when you choose to load more. This list does not browse the shared catalog.",
    };
  },
});

export const catalogPost = internalQuery({
  args: {
    ...profile,
    familyId: v.id("catalogFamilies"),
    artifactId: v.optional(v.id("publicArtifacts")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    ctx = knowledgeReadContext(ctx);
    const { a } = await widgetAccess(ctx, args.profileId);
    requireCatalogScope(a);
    const post = await catalogPostDetail(
      ctx,
      a.organization._id,
      args.familyId,
      args.artifactId,
    );
    return {
      profile_id: a.organization._id,
      grant_version: a.grant.version,
      family_id: post.familyId,
      artifact_id: post.artifactId,
      version_id: post.versionId,
      canonical: post.canonical,
      title: post.title,
      author_name: post.authorName,
      analysis: post.analysis,
      transcript: post.transcript,
      provenance: post.provenance,
      frames: post.frames,
      coverage:
        "The current selected catalog version and its retained evidence. No personal association, analysis, credit charge or publication is created by this read.",
    };
  },
});

// This private locator must stay inside the server-side image handler. Using a
// mutation rechecks current grant/entitlement/time for every byte disclosure.
export const catalogFrame = internalMutation({
  args: {
    ...profile,
    familyId: v.id("catalogFamilies"),
    artifactId: v.id("publicArtifacts"),
    frameId: v.string(),
  },
  returns: v.object({
    key: v.string(),
    size: v.number(),
    sha256: v.string(),
    width: v.number(),
    height: v.number(),
    profileId: v.id("organizations"),
    grantId: v.id("assistantGrants"),
    grantVersion: v.number(),
  }),
  handler: async (ctx, args) => {
    const { a } = await widgetAccess(ctx, args.profileId);
    requireCatalogScope(a);
    ensure(
      args.frameId.length > 0 && args.frameId.length <= 200,
      "INVALID_INPUT",
      "Invalid screenshot reference.",
    );
    const location = await catalogFrameLocation(ctx, {
      organizationId: a.organization._id,
      familyId: args.familyId,
      artifactId: args.artifactId,
      frameId: args.frameId,
    });
    return {
      ...location,
      profileId: a.organization._id,
      grantId: a.grant._id,
      grantVersion: a.grant.version,
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
    const { a } = await widgetAccess(ctx, args.profileId);
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
    const { a } = await widgetAccess(ctx, args.profileId);
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
