import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { PolicyError, ensure } from "../../packages/policy";
import { cloudImport, cloudArtifact } from "./cloudCatalog";
import { postDisplayTitle } from "../../packages/sources/display";
import { selectedAnalysis, retainedVersion } from "./analysisHistory";
import { sourceRetained } from "./sourceAuthority";
import { exactGrantedSource } from "../knowledgeGrants";

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
    .take(130);
  ensure(
    docs.length <= 129,
    "POLICY_BLOCKED",
    "Search projection requires operator review.",
  );
  for (const doc of docs) await ctx.db.delete(doc._id);
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
  title: string;
  excerpt: string;
  searchText: string;
  truncated: boolean;
};
function projectionItems(
  source: Doc<"sources">,
  output: unknown,
  canonicalTitle = postDisplayTitle(source),
  metadataText = "",
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
  return result;
}

function sameFields(row: object, fields: object) {
  const values = row as Record<string, unknown>;
  return Object.entries(fields).every(
    ([key, value]) => key === "updatedAt" || values[key] === value,
  );
}

async function writeSearchProjection(
  ctx: MutationCtx,
  origin: Origin,
  source: Doc<"sources">,
  output: unknown,
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
    .take(130);
  ensure(
    docs.length <= 129,
    "POLICY_BLOCKED",
    "Search projection requires operator review.",
  );
  const existing = new Map(docs.map((d) => [d.itemKey, d]));
  // Shared search text must come from independent canonical metadata, never
  // whichever member's private/custom title happened to refresh most recently.
  let canonicalTitle = postDisplayTitle(source);
  let authorName = source.linkPreview?.authorName?.slice(0, 160) ?? "";
  let publicUrl = source.url ?? "";
  if (origin.canonicalKey.startsWith("shared:")) {
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
  for (const item of projectionItems(
    source,
    output,
    canonicalTitle,
    `${authorName} ${platform}`,
  )) {
    const fields = {
      organizationId: origin.organizationId,
      canonicalKey: origin.canonicalKey,
      analysisKey: origin.analysisKey,
      ...item,
      updatedAt: Date.now(),
    };
    const doc = existing.get(item.itemKey);
    if (doc) {
      if (!sameFields(doc, fields)) {
        await ctx.db.replace(doc._id, fields);
        changed = true;
      }
      existing.delete(item.itemKey);
    } else {
      await ctx.db.insert("workspaceSearchDocuments", fields);
      changed = true;
    }
  }
  for (const doc of existing.values()) {
    await ctx.db.delete(doc._id);
    changed = true;
  }
  if (changed) await bumpWorkspaceSearch(ctx, origin.organizationId);
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
    const selected = reference.analysisVersionId
      ? (await retainedVersion(ctx, source, reference.analysisVersionId))
          .version
      : null;
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
