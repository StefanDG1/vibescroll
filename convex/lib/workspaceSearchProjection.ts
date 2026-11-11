import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { PolicyError, ensure } from "../../packages/policy";
import { cloudImport, cloudArtifact } from "./cloudCatalog";
import { postDisplayTitle } from "../../packages/sources/display";
import {
  insightSearchTopics,
  outputSearchTopics,
  sourcePlatform,
} from "./workspaceSearchFilters";
import {
  selectedAnalysis,
  retainedVersion,
  retainedEvidenceContent,
} from "./analysisHistory";
import { sourceRetained } from "./sourceAuthority";
import { exactGrantedSource } from "../knowledgeGrants";
import { normalizeSearchText } from "../../packages/search/ranking";

const maxDocuments = 161;

async function removeSearchDocument(
  ctx: MutationCtx,
  id: Id<"workspaceSearchDocuments">,
) {
  const vector = await ctx.db
    .query("workspaceSearchVectors")
    .withIndex("by_document", (q) => q.eq("documentId", id))
    .unique();
  if (vector) await ctx.db.delete(vector._id);
  await ctx.db.delete(id);
}

export const workspaceSearchEnabled = () =>
  process.env.WORKSPACE_SEARCH_ENABLED === "true";
export const workspaceSearchState = (
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) =>
  ctx.db
    .query("workspaceSearchState")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .unique();

export async function scheduleSearchVectors(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
) {
  if (
    !process.env.WORKSPACE_SEARCH_EMBEDDING_SECRET ||
    process.env.RESTORE_LOCK === "true"
  )
    return;
  const state = await workspaceSearchState(ctx, organizationId);
  if (!state || state.vectorJob) return;
  const pending = await ctx.db
    .query("workspaceSearchVectors")
    .withIndex("by_pending", (q) =>
      q.eq("organizationId", organizationId).eq("pending", true),
    )
    .first();
  if (!pending) return;
  const vectorJob = await ctx.scheduler.runAfter(
    0,
    internal.workspaceSearchActions.index,
    { organizationId, failures: 0 },
  );
  await ctx.db.patch(state._id, { vectorJob });
}

export async function bumpWorkspaceSearch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
) {
  const state = await workspaceSearchState(ctx, organizationId);
  if (state)
    await ctx.db.patch(state._id, {
      revision: state.revision + 1,
      updatedAt: Date.now(),
    });
  else
    await ctx.db.insert("workspaceSearchState", {
      organizationId,
      revision: 1,
      phase: "sources",
      cursor: null,
      shareOffset: 0,
      updatedAt: Date.now(),
    });
}

async function canonicalKey(ctx: QueryCtx, source: Doc<"sources">) {
  const layer = source.publicImportId
    ? await ctx.db.get(source.publicImportId)
    : null;
  return cloudImport(layer) &&
    layer.sourceId === source._id &&
    layer.organizationId === source.organizationId &&
    layer.sourceGeneration === source.generation
    ? `shared:${layer.familyId}`
    : `private:${source._id}`;
}

async function cleanOrphanDocuments(
  ctx: MutationCtx,
  origin: Doc<"workspaceSearchOrigins">,
) {
  const remaining = await ctx.db
    .query("workspaceSearchOrigins")
    .withIndex("by_post", (q) =>
      q
        .eq("organizationId", origin.organizationId)
        .eq("canonicalKey", origin.canonicalKey)
        .eq("analysisKey", origin.analysisKey),
    )
    .first();
  if (remaining) return;
  const docs = await ctx.db
    .query("workspaceSearchDocuments")
    .withIndex("by_post", (q) =>
      q
        .eq("organizationId", origin.organizationId)
        .eq("canonicalKey", origin.canonicalKey)
        .eq("analysisKey", origin.analysisKey),
    )
    .take(maxDocuments + 1);
  ensure(
    docs.length <= maxDocuments,
    "POLICY_BLOCKED",
    "Search projection requires operator review.",
  );
  for (const doc of docs) await removeSearchDocument(ctx, doc._id);
}

export async function removeSearchOrigin(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  pathKey: string,
) {
  const old = await ctx.db
    .query("workspaceSearchOrigins")
    .withIndex("by_path", (q) =>
      q.eq("organizationId", organizationId).eq("pathKey", pathKey),
    )
    .unique();
  if (!old) return false;
  await ctx.db.delete(old._id);
  await cleanOrphanDocuments(ctx, old);
  await bumpWorkspaceSearch(ctx, organizationId);
  return true;
}

type Origin = Omit<Doc<"workspaceSearchOrigins">, "_id" | "_creationTime">;
type ProjectedItem = {
  itemKey: string;
  kind: "post" | "insight";
  insightId?: string;
  evidenceIds?: string[];
  title: string;
  excerpt: string;
  searchText: string;
  truncated: boolean;
  categoryKeys: string[];
};
function projectionItems(
  source: Doc<"sources">,
  output: unknown,
  canonicalTitle = postDisplayTitle(source),
  metadataText = "",
  evidence: { title: string; text: string; id?: string }[] = [],
): ProjectedItem[] {
  const analysis =
    output && typeof output === "object"
      ? (output as { insights?: unknown; summary?: unknown })
      : {};
  const all = Array.isArray(analysis.insights) ? analysis.insights : [];
  const title = canonicalTitle.slice(0, 200);
  const summary = typeof analysis.summary === "string" ? analysis.summary : "";
  const result: ProjectedItem[] = [
    {
      itemKey: "post",
      categoryKeys: outputSearchTopics(output, false),
      kind: "post",
      title,
      excerpt: summary.slice(0, 700),
      searchText: `${title} ${summary.slice(0, 700)} ${metadataText.slice(0, 320)}`,
      truncated:
        canonicalTitle.length > 200 || summary.length > 700 || all.length > 128,
    },
  ];
  const seen = new Set<string>();
  for (const raw of all.slice(0, 128)) {
    if (!raw || typeof raw !== "object") continue;
    const insight = raw as {
      id?: unknown;
      title?: unknown;
      claim?: unknown;
      categories?: unknown;
      topics?: unknown;
    };
    if (
      typeof insight.id !== "string" ||
      typeof insight.title !== "string" ||
      typeof insight.claim !== "string"
    )
      continue;
    const insightId = insight.id.slice(0, 200);
    if (seen.has(insightId)) {
      result[0].truncated = true;
      continue;
    }
    seen.add(insightId);
    result.push({
      itemKey: `insight:${insightId}`,
      categoryKeys: insightSearchTopics(insight, false),
      kind: "insight",
      insightId,
      title: insight.title.slice(0, 200),
      excerpt: insight.claim.slice(0, 700),
      searchText: `${insight.title.slice(0, 200)} ${insight.claim.slice(0, 700)} ${
        Array.isArray(insight.categories)
          ? insight.categories
              .slice(0, 5)
              .filter((value: unknown) => typeof value === "string")
              .map((value: string) => value.slice(0, 48))
              .join(" ")
          : ""
      } ${
        Array.isArray(insight.topics)
          ? insight.topics
              .slice(0, 4)
              .filter((value: unknown) => typeof value === "string")
              .map((value: string) => value.slice(0, 48))
              .join(" ")
          : ""
      }`,
      truncated:
        insight.title.length > 200 ||
        insight.claim.length > 700 ||
        insight.id.length > 200,
    });
  }
  const passages: ProjectedItem[] = [];
  for (const unit of evidence) {
    let remaining = unit.text.trim();
    while (remaining && passages.length < 32) {
      const wordBoundary = remaining.lastIndexOf(" ", 700);
      const end =
        remaining.length <= 700
          ? remaining.length
          : wordBoundary >= 400
            ? wordBoundary
            : 700;
      const excerpt = remaining.slice(0, end);
      const previous = passages.at(-1);
      if (
        previous?.title === unit.title &&
        previous.excerpt.length + excerpt.length < 700 &&
        (previous.evidenceIds?.length ?? 0) < 16
      ) {
        previous.excerpt += ` ${excerpt}`;
        previous.searchText += ` ${excerpt}`;
        if (unit.id && !previous.evidenceIds?.includes(unit.id))
          (previous.evidenceIds ??= []).push(unit.id);
      } else
        passages.push({
          itemKey: `passage:${passages.length}`,
          kind: "post",
          title: unit.title,
          excerpt,
          searchText: excerpt,
          categoryKeys: result[0].categoryKeys,
          ...(unit.id ? { evidenceIds: [unit.id] } : {}),
          truncated: false,
        });
      remaining = remaining.slice(end).trimStart();
    }
    if (remaining) result[0].truncated = true;
  }
  result.push(...passages);
  return result;
}

function sameFields(row: object, fields: object) {
  const values = row as Record<string, unknown>;
  return Object.entries(fields).every(
    ([key, value]) =>
      key === "updatedAt" ||
      JSON.stringify(values[key]) === JSON.stringify(value),
  );
}

async function writeSearchProjection(
  ctx: MutationCtx,
  origin: Origin,
  source: Doc<"sources">,
  output: unknown,
  evidence?: Doc<"analysisEvidence">,
) {
  const old = await ctx.db
    .query("workspaceSearchOrigins")
    .withIndex("by_path", (q) =>
      q
        .eq("organizationId", origin.organizationId)
        .eq("pathKey", origin.pathKey),
    )
    .unique();
  let changed = !old || !sameFields(old, origin);
  if (old) {
    if (changed) await ctx.db.replace(old._id, origin);
  } else await ctx.db.insert("workspaceSearchOrigins", origin);
  if (
    old &&
    (old.canonicalKey !== origin.canonicalKey ||
      old.analysisKey !== origin.analysisKey)
  )
    await cleanOrphanDocuments(ctx, old);
  const docs = await ctx.db
    .query("workspaceSearchDocuments")
    .withIndex("by_post", (q) =>
      q
        .eq("organizationId", origin.organizationId)
        .eq("canonicalKey", origin.canonicalKey)
        .eq("analysisKey", origin.analysisKey),
    )
    .take(maxDocuments + 1);
  ensure(
    docs.length <= maxDocuments,
    "POLICY_BLOCKED",
    "Search projection requires operator review.",
  );
  const existing = new Map(docs.map((d) => [d.itemKey, d]));
  // Shared search text must come from independent canonical metadata, never
  // whichever member's private/custom title happened to refresh most recently.
  let canonicalTitle = postDisplayTitle(source);
  let authorName = source.linkPreview?.authorName?.slice(0, 160) ?? "";
  let publicUrl = source.url ?? "";
  const canonicalShared = origin.canonicalKey.startsWith("shared:");
  if (canonicalShared) {
    const familyId = ctx.db.normalizeId(
      "catalogFamilies",
      origin.canonicalKey.slice(7),
    );
    const family = familyId ? await ctx.db.get(familyId) : null;
    const member = family?.members.find(
      (item) => item.versionId === origin.analysisVersionId,
    );
    const artifact = member ? await ctx.db.get(member.artifactId) : null;
    authorName = cloudArtifact(artifact)
      ? (artifact.postMetadata?.authorName?.slice(0, 160) ?? "")
      : "";
    publicUrl = family?.canonical ?? "";
    canonicalTitle =
      (cloudArtifact(artifact) ? artifact.postMetadata?.title : null) ??
      family?.canonical ??
      "Saved post";
  }
  let platform = "";
  try {
    platform = new URL(publicUrl).hostname.replace(/^www\./, "");
  } catch {
    /* supplied text has no platform */
  }
  const retained = evidence ? retainedEvidenceContent(evidence) : undefined;
  const passages: { title: string; text: string; id?: string }[] = [];
  if (source.text && !canonicalShared)
    passages.push({ title: "Saved source text", text: source.text });
  for (const observation of retained?.observations ?? []) {
    if (observation.basis === "transcript") continue;
    passages.push({
      title:
        observation.basis === "caption"
          ? "Source caption"
          : "Visual observation",
      text: observation.text,
      id: observation.id,
    });
  }
  for (const segment of retained?.transcript ?? [])
    passages.push({
      title: "Transcript passage",
      text: segment.text,
      id: segment.id,
    });
  const creator = authorName.trim() || undefined;
  const creatorKey = creator
    ? normalizeSearchText(creator).replace(/^@/, "")
    : undefined;
  const spaces = !origin.grantId
    ? await ctx.db
        .query("sourceSpaces")
        .withIndex("by_source", (q) => q.eq("sourceId", source._id))
        .take(2)
    : [];
  for (const item of projectionItems(
    source,
    output,
    canonicalTitle,
    `${authorName} ${platform}`,
    passages,
  )) {
    const fields = {
      organizationId: origin.organizationId,
      canonicalKey: origin.canonicalKey,
      analysisKey: origin.analysisKey,
      ...item,
      ...(creator ? { creator, creatorKey } : {}),
      ...(spaces.some(({ space }) => space === "personal")
        ? { personal: true }
        : {}),
      ...(spaces.some(({ space }) => space === "business")
        ? { business: true }
        : {}),
      ...(item.itemKey === "post"
        ? {
            normalizedTitle: normalizeSearchText(canonicalTitle).slice(0, 200),
            ...(publicUrl ? { canonicalUrl: publicUrl } : {}),
          }
        : {}),
      metadataVersion: 2 as const,
      platform: sourcePlatform(publicUrl, source.kind),
      updatedAt: Date.now(),
    };
    const doc = existing.get(item.itemKey);
    let documentId: Id<"workspaceSearchDocuments">;
    let documentRevision: number;
    if (doc) {
      const same =
        sameFields(doc, fields) &&
        (!doc.personal || !!fields.personal) &&
        (!doc.business || !!fields.business);
      if (!same) {
        fields.updatedAt = Math.max(fields.updatedAt, doc.updatedAt + 1);
        await ctx.db.replace(doc._id, fields);
        changed = true;
      }
      documentId = doc._id;
      documentRevision = same ? doc.updatedAt : fields.updatedAt;
      existing.delete(item.itemKey);
    } else {
      documentId = await ctx.db.insert("workspaceSearchDocuments", fields);
      documentRevision = fields.updatedAt;
      changed = true;
    }
    const vector = await ctx.db
      .query("workspaceSearchVectors")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .unique();
    const vectorFields = {
      organizationId: origin.organizationId,
      documentId,
      documentRevision,
      pending: true,
    };
    if (!vector) await ctx.db.insert("workspaceSearchVectors", vectorFields);
    else if (vector.documentRevision !== documentRevision)
      await ctx.db.replace(vector._id, vectorFields);
  }
  for (const doc of existing.values()) {
    await removeSearchDocument(ctx, doc._id);
    changed = true;
  }
  if (changed) await bumpWorkspaceSearch(ctx, origin.organizationId);
  await scheduleSearchVectors(ctx, origin.organizationId);
}

export async function refreshDirectSearchSource(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  sourceId: Id<"sources">,
) {
  const source = await ctx.db.get(sourceId);
  const pathKey = `direct:${sourceId}`;
  if (
    !source ||
    source.organizationId !== organizationId ||
    source.state === "deleted" ||
    !source.rightsAttested ||
    !sourceRetained(source.sourceRetentionUntil)
  ) {
    await removeSearchOrigin(ctx, organizationId, pathKey);
    return false;
  }
  try {
    const selected =
      source.state === "ready" ? await selectedAnalysis(ctx, source) : null;
    const versionId = selected?.metadata.id;
    await writeSearchProjection(
      ctx,
      {
        organizationId,
        pathKey,
        canonicalKey: await canonicalKey(ctx, source),
        analysisKey:
          versionId ??
          `legacy:${source._id}:${source.generation}:${source.updatedAt}`,
        sourceId,
        generation: source.generation,
        revision: source.updatedAt,
        ...(versionId ? { analysisVersionId: versionId } : {}),
        updatedAt: Date.now(),
      },
      source,
      selected?.output ?? (source.state === "ready" ? source.analysis : null),
      selected
        ? ((await ctx.db.get(selected.evidenceId)) ?? undefined)
        : undefined,
    );
    return true;
  } catch (error) {
    if (
      !(error instanceof PolicyError) ||
      ![
        "FORBIDDEN",
        "APPROVAL_STALE",
        "SOURCE_UNAVAILABLE",
        "STALE_APPROVAL",
      ].includes(error.code)
    )
      throw error;
    await removeSearchOrigin(ctx, organizationId, pathKey);
    return false;
  }
}

export async function refreshSharedSearchSource(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  grantId: Id<"teamKnowledgeGrants">,
  sourceId: Id<"sources">,
) {
  const pathKey = `share:${grantId}:${sourceId}`;
  try {
    const { grant, source, reference } = await exactGrantedSource(
      ctx,
      organizationId,
      grantId,
      sourceId,
    );
    const retained = reference.analysisVersionId
      ? await retainedVersion(ctx, source, reference.analysisVersionId)
      : null;
    const selected = retained?.version;
    await writeSearchProjection(
      ctx,
      {
        organizationId,
        pathKey,
        canonicalKey: await canonicalKey(ctx, source),
        analysisKey:
          selected?._id ??
          `legacy:${source._id}:${source.generation}:${source.updatedAt}`,
        sourceId,
        generation: source.generation,
        revision: source.updatedAt,
        ...(selected ? { analysisVersionId: selected._id } : {}),
        grantId,
        grantVersion: grant.version,
        updatedAt: Date.now(),
      },
      source,
      selected?.output ?? source.analysis,
      retained?.evidence,
    );
    return true;
  } catch (error) {
    if (
      !(error instanceof PolicyError) ||
      ![
        "FORBIDDEN",
        "APPROVAL_STALE",
        "SOURCE_UNAVAILABLE",
        "STALE_APPROVAL",
      ].includes(error.code)
    )
      throw error;
    await removeSearchOrigin(ctx, organizationId, pathKey);
    return false;
  }
}
