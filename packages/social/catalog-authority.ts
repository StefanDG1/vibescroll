import { z } from "zod";
import { socialRightsSchema } from "./contracts";
import { orderedDiagnostics } from "./diagnostics";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
// Minted only after the managed producer verifies neutral input and settlement.
// The origin IDs are durable moderation/lineage references, not account ownership.
export const serviceCatalogAuthority = z.strictObject({
  version: z.literal("global-service-authority-v1"),
  contract: z.strictObject({
    pipelineVersion: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
    language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/),
    route: z.literal("managed_api"),
    promptHash: hash,
    settingsHash: hash,
  }),
  rights: socialRightsSchema,
  policyExpiresAt: z.number().int().positive(),
  diagnostics: orderedDiagnostics,
  moderation: z.strictObject({
    organizationId: z.string().min(1).max(100),
    publisher: z.string().min(1).max(100),
    canonicalHash: hash,
  }),
});

// Missing reasons retain the old fail-closed canonical-removal behavior.
export const serviceInvalidationReasons = [
  "association_remove",
  "personal_retention",
  "rights",
  "privacy",
  "moderation",
  "canonical_expiry",
  "unspecified",
] as const;
export type ServiceInvalidationReason =
  (typeof serviceInvalidationReasons)[number];
export function preservesServiceArtifact(reason: ServiceInvalidationReason) {
  return reason === "association_remove" || reason === "personal_retention";
}
