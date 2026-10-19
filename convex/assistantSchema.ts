import { defineTable } from "convex/server";
import { v } from "convex/values";
export const assistantRepositoryBinding = v.object({
  repositoryId: v.id("repositories"),
  baseSha: v.string(),
  profileVersion: v.number(),
  selectionVersion: v.number(),
});
export const assistantAnalysisDefaults = v.object({
  enabled: v.boolean(),
  deviceId: v.id("devices"),
  profileBinding: v.string(),
});
export const assistantTables = {
  assistantSubscriptions: defineTable({
    organizationId: v.id("organizations"),
    actor: v.id("users"),
    clientId: v.string(),
    consentId: v.string(),
    grantId: v.id("assistantGrants"),
    grantVersion: v.number(),
    sourceId: v.id("sources"),
    generation: v.number(),
    revision: v.number(),
    externalId: v.string(),
    ciphertext: v.string(),
    keyVersion: v.string(),
    previousCiphertext: v.optional(v.string()),
    previousKeyVersion: v.optional(v.string()),
    previousSecretExpiresAt: v.optional(v.number()),
    callbackVerifiedAt: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    state: v.union(v.literal("active"), v.literal("cancelled")),
  })
    .index("by_external", ["externalId"])
    .index("by_grant", ["grantId"])
    .index("by_previous_expiry", ["previousSecretExpiresAt"])
    .index("by_source", ["sourceId"])
    .index("by_org", ["organizationId"])
    .index("by_actor", ["actor"])
    .index("by_actor_client", ["actor", "clientId"])
    .index("by_expiry", ["expiresAt"]),
  assistantDeliveries: defineTable({
    organizationId: v.id("organizations"),
    subscriptionId: v.id("assistantSubscriptions"),
    sourceId: v.id("sources"),
    generation: v.number(),
    completedRevision: v.number(),
    state: v.union(
      v.literal("pending"),
      v.literal("delivering"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    attempts: v.number(),
    dueAt: v.number(),
    lease: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    receivedAt: v.optional(v.number()),
    httpStatus: v.optional(v.number()),
  })
    .index("by_occurrence", [
      "subscriptionId",
      "generation",
      "completedRevision",
    ])
    .index("by_subscription", ["subscriptionId"])
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_state_due", ["state", "dueAt"])
    .index("by_state_updated", ["state", "updatedAt"])
    .index("by_updated", ["updatedAt"]),
  assistantIntakes: defineTable({
    organizationId: v.id("organizations"),
    actor: v.id("users"),
    clientId: v.string(),
    grantId: v.id("assistantGrants"),
    grantVersion: v.number(),
    sourceId: v.id("sources"),
    generation: v.number(),
    revision: v.number(),
    permissionBasis: v.optional(v.literal("connection_explicit_links")),
    deviceId: v.optional(v.id("devices")),
    queueState: v.optional(v.string()),
    runId: v.optional(v.id("localLibraryRuns")),
    repositories: v.optional(v.array(v.id("repositories"))),
    queuedRepositories: v.optional(v.array(v.id("repositories"))),
    projectRequest: v.optional(v.boolean()),
    analysisGeneration: v.optional(v.number()),
    error: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_source", ["sourceId"])
    .index("by_org", ["organizationId"])
    .index("by_actor", ["actor"])
    .index("by_device_state", ["deviceId", "queueState"])
    .index("by_pair", ["actor", "clientId", "sourceId"]),
  assistantGrants: defineTable({
    organizationId: v.id("organizations"),
    actor: v.id("users"),
    clientId: v.string(),
    sources: v.array(
      v.object({
        sourceId: v.id("sources"),
        generation: v.number(),
        revision: v.number(),
      }),
    ),
    scopes: v.array(v.string()),
    libraryScope: v.optional(
      v.union(v.literal("all"), v.literal("personal"), v.literal("business")),
    ),
    contextVersion: v.optional(v.number()),
    repositories: v.optional(v.array(assistantRepositoryBinding)),
    intakeSpace: v.optional(
      v.union(v.literal("personal"), v.literal("business")),
    ),
    intakePolicy: v.optional(v.literal("explicit_links")),
    analysisDefaults: v.optional(assistantAnalysisDefaults),
    version: v.number(),
    state: v.union(v.literal("active"), v.literal("revoked")),
    expiresAt: v.union(v.number(), v.null()),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_actor_client", ["actor", "clientId"])
    .index("by_actor_org", ["actor", "organizationId"])
    .index("by_pair", ["organizationId", "actor", "clientId"]),
};
