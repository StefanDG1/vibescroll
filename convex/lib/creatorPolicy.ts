import { z } from "zod";
import {
  socialRightsSchema,
  requireSocialRights,
} from "../../packages/social/contracts";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { creatorTransportSchema } from "../../packages/providers/creator-transport";

export const creatorBounds = Object.freeze({
  recipients: 20,
  postsPerCheck: 100,
  deliveryPage: 10,
  deliveryPages: 2,
});

// No defaults imply provider selection, funds, collection permission or activation.
const configurationSchema = z.strictObject({
  version: z.literal("creator-provider-v1"),
  provider: z.string().min(1).max(100),
  rights: socialRightsSchema,
  reviewReference: z.string().min(1).max(200),
  expiresAt: z.number().int().positive(),
  budgetKey: z
    .string()
    .regex(/^social-discovery-usd-micros:v1:[a-zA-Z0-9_-]{1,80}$/),
  ceilingUsdMicros: z.number().int().positive().max(2_000_000),
  perCheckUsdMicros: z.number().int().positive(),
  maximumChecks: z.number().int().min(1).max(1000),
  includesMinimumRetriesStorageAndLag: z.literal(true),
  includesDeliveryAndRevocationCleanup: z.literal(true),
  transport: creatorTransportSchema.optional(),
});
export function creatorConfiguration(now = Date.now()) {
  if (
    process.env.CREATOR_FOLLOWING_ENABLED !== "true" ||
    process.env.RESTORE_LOCK === "true" ||
    process.env.DISABLE_CAPTURE === "true"
  )
    return null;
  try {
    const config = configurationSchema.parse(
      JSON.parse(process.env.CREATOR_PROVIDER_CONFIGURATION ?? "null"),
    );
    if (
      config.expiresAt <= now ||
      config.rights.expiresAt <= now ||
      config.rights.provider !== config.provider ||
      config.perCheckUsdMicros > config.ceilingUsdMicros ||
      config.maximumChecks * config.perCheckUsdMicros !==
        config.ceilingUsdMicros ||
      (config.transport !== undefined &&
        (config.provider !== "apify" ||
          config.transport.runMaximumUsdMicros > config.perCheckUsdMicros ||
          config.transport.minimumCheckUsdMicros > config.perCheckUsdMicros))
    )
      return null;
    return config;
  } catch {
    return null;
  }
}
export function creatorPolicyCanonical(
  policy: NonNullable<ReturnType<typeof creatorConfiguration>>,
) {
  return canonicalJson({
    provider: policy.provider,
    rights: policy.rights,
    reviewReference: policy.reviewReference,
    expiresAt: policy.expiresAt,
  });
}
export function creatorRightsCurrent(
  binding: {
    platform: "instagram" | "tiktok";
    creatorId: string;
    provider: string;
    evidenceId: string;
    policyCanonical: string;
    rightsHash: string;
    expiresAt: number;
    deletionWithinMs: number;
  },
  now = Date.now(),
) {
  const policy = creatorPermission(binding.platform, binding.creatorId, now);
  return (
    !!policy &&
    Number.isSafeInteger(binding.expiresAt) &&
    binding.expiresAt > now &&
    binding.expiresAt <= Math.min(policy.expiresAt, policy.rights.expiresAt) &&
    binding.provider === policy.provider &&
    binding.evidenceId === policy.rights.evidenceId &&
    /^[a-f0-9]{64}$/.test(binding.rightsHash) &&
    binding.deletionWithinMs === policy.rights.deletionWithinMs &&
    binding.policyCanonical === creatorPolicyCanonical(policy)
  );
}
export function creatorPermission(
  platform: "instagram" | "tiktok",
  creatorId?: string,
  now = Date.now(),
) {
  const config = creatorConfiguration(now);
  if (!config) return null;
  // This actor accepts profile URLs, not a verified immutable identity input.
  // Output validation happens after collection and cannot enforce a narrower
  // creator-specific collection grant when a handle has been reassigned.
  if (
    platform === "instagram" &&
    config.transport?.actors.some((actor) => actor.platform === platform) &&
    config.rights.creatorScope === "specified"
  )
    return null;
  try {
    requireSocialRights(
      config.rights,
      { provider: config.provider, platform, creatorId, workload: "discovery" },
      now,
    );
    return config;
  } catch {
    return null;
  }
}
