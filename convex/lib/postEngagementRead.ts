import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensure } from "../../packages/policy";
import { sourceRetained } from "./sourceAuthority";
import { cloudSourceFamily, currentCloudArtifactHeader } from "./cloudCatalog";
import {
  engagementCounter,
  engagementRow,
  privatePostKey,
  sharedPostKey,
} from "./postEngagement";

// The caller must establish current membership for source.organizationId first.
export async function readablePostKey(ctx: QueryCtx, source: Doc<"sources">) {
  ensure(
    source.state === "ready" &&
      source.rightsAttested &&
      sourceRetained(source.sourceRetentionUntil),
    "SOURCE_UNAVAILABLE",
    "Post unavailable.",
  );
  if (source.publicImportId) {
    const { family } = await cloudSourceFamily(ctx, source);
    ensure(
      family.selectedArtifactId,
      "SOURCE_UNAVAILABLE",
      "No shared result is selected.",
    );
    const header = await currentCloudArtifactHeader(
      ctx,
      family.selectedArtifactId,
    );
    ensure(
      header.family._id === family._id,
      "SOURCE_UNAVAILABLE",
      "The shared result changed.",
    );
    return sharedPostKey(family._id);
  }
  return privatePostKey(source._id);
}
export async function readPostEngagement(
  ctx: QueryCtx,
  source: Doc<"sources">,
  actor: Id<"users">,
) {
  const key = await readablePostKey(ctx, source),
    counter = engagementCounter();
  const [row, likes, shares] = await Promise.all([
    engagementRow(ctx, actor, key),
    counter.count(ctx, `${key}:likes`),
    counter.count(ctx, `${key}:saves`),
  ]);
  ensure(
    Number.isSafeInteger(likes) &&
      likes >= 0 &&
      Number.isSafeInteger(shares) &&
      shares >= 0,
    "STATE_UNAVAILABLE",
    "Post counts need reconciliation.",
  );
  return {
    sourceId: source._id,
    scopeKey: key,
    likes,
    shares,
    liked: row?.liked ?? false,
    revision: row?.revision ?? 0,
  };
}
