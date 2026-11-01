import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import type { QueryCtx } from "./_generated/server";
import { ensure, PolicyError } from "../packages/policy";
import {
  currentCloudArtifact,
  currentCloudArtifactHeader,
  catalogConfiguration,
} from "./lib/cloudCatalog";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { limit } from "./lib";
import {
  previewClaim,
  readOnboardingValue,
  starterSelection,
  starterScore,
} from "../packages/onboarding/journey";

export function starterConfiguration() {
  if (process.env.RESTORE_LOCK === "true") return [];
  try {
    const parsed = starterSelection.safeParse(
      JSON.parse(process.env.ONBOARDING_STARTERS_JSON || "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
export async function starterFamily(ctx: QueryCtx, id: string) {
  const selected = starterConfiguration().find((item) => item.familyId === id);
  ensure(
    selected,
    "SOURCE_UNAVAILABLE",
    "Choose a currently available starter post.",
  );
  const familyId = ctx.db.normalizeId("catalogFamilies", id);
  const family = familyId ? await ctx.db.get(familyId) : null;
  ensure(
    family?.state === "active" &&
      family.selectedArtifactId &&
      family.organizationId === catalogConfiguration()?.serviceOrganizationId,
    "SOURCE_UNAVAILABLE",
    "This starter post is no longer available.",
  );
  return { family, selected };
}
async function authority(ctx: QueryCtx, token: string) {
  const claim = previewClaim.safeParse(
    await readOnboardingValue(
      token,
      process.env.ONBOARDING_PREVIEW_SECRET ?? "",
    ),
  );
  ensure(
    claim.success &&
      claim.data.expiresAt > Date.now() &&
      claim.data.expiresAt <= Date.now() + 31 * 86400000,
    "FORBIDDEN",
    "Reopen your starter post to continue.",
  );
  const selected = await starterFamily(ctx, claim.data.familyId);
  return { ...selected, claim: claim.data };
}
const metadata = v.object({
  familyId: v.string(),
  title: v.string(),
  authorName: v.union(v.string(), v.null()),
  canonical: v.string(),
  interests: v.array(v.string()),
  insightCount: v.number(),
  matched: v.number(),
  thumbnailFrameId: v.union(v.string(), v.null()),
});
export const list = query({
  args: { interests: v.array(v.string()) },
  returns: v.array(metadata),
  handler: async (ctx, args) => {
    ctx = knowledgeReadContext(ctx);
    ensure(
      args.interests.length <= 3,
      "INVALID_INPUT",
      "Choose up to three interests.",
    );
    const items = [];
    for (const row of starterConfiguration().slice(0, 18)) {
      try {
        const { family } = await starterFamily(ctx, row.familyId);
        const { artifact } = await currentCloudArtifactHeader(
          ctx,
          family.selectedArtifactId!,
        );
        items.push({
          familyId: row.familyId,
          title: artifact.postMetadata?.title ?? "Saved video",
          authorName: artifact.postMetadata?.authorName ?? null,
          canonical: family.canonical,
          interests: row.interests,
          insightCount: artifact.insightCount,
          matched: starterScore(row.interests, args.interests),
          thumbnailFrameId: artifact.postMetadata?.thumbnailFrameId ?? null,
        });
      } catch (error) {
        if (!(error instanceof PolicyError)) throw error;
      }
    }
    return items.sort((a, b) => b.matched - a.matched).slice(0, 6);
  },
});
export const detail = mutation({
  args: { token: v.string() },
  returns: v.any(),
  handler: async (mutationCtx, args) => {
    const ctx = knowledgeReadContext(mutationCtx);
    const { family, selected, claim } = await authority(ctx, args.token);
    ensure(
      claim.kind === "detail",
      "FORBIDDEN",
      "Open a post to read its insights.",
    );
    await limit(mutationCtx, `onboarding-preview:${claim.session}`, 30);
    const shared = await currentCloudArtifact(ctx, family.selectedArtifactId!);
    return {
      familyId: family._id,
      title: shared.artifact.postMetadata?.title ?? "Saved video",
      authorName: shared.artifact.postMetadata?.authorName ?? null,
      canonical: family.canonical,
      interests: selected.interests,
      analysis: shared.output,
      frames: shared.prepared.frames.map((frame) => ({
        id: frame.id,
        timestampMs: frame.timestampMs,
      })),
      coverage:
        "Already analyzed. Screenshots are sampled from the source video.",
    };
  },
});
export const frame = mutation({
  args: { token: v.string(), frameId: v.string() },
  returns: v.object({
    key: v.string(),
    sha256: v.string(),
    size: v.number(),
    width: v.number(),
    height: v.number(),
  }),
  handler: async (mutationCtx, args) => {
    const ctx = knowledgeReadContext(mutationCtx);
    const { family, claim } = await authority(ctx, args.token);
    await limit(mutationCtx, `onboarding-frame:${claim.session}`, 100);
    const shared = await currentCloudArtifact(ctx, family.selectedArtifactId!);
    const frame = shared.evidence.frames.find(
      (item) => item.frameId === args.frameId,
    );
    ensure(
      claim.kind === "detail" ||
        args.frameId === shared.artifact.postMetadata?.thumbnailFrameId,
      "FORBIDDEN",
      "Only the post thumbnail is available in this preview.",
    );
    ensure(frame, "SOURCE_UNAVAILABLE", "This screenshot is unavailable.");
    return {
      key: frame.key,
      sha256: frame.sha256,
      size: frame.size,
      width: frame.width,
      height: frame.height,
    };
  },
});
