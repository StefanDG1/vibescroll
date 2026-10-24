import { defineTable } from "convex/server";
import { personalAnalysisValue } from "./personalAnalysisSchema";
import { v } from "convex/values";
import { allowancePolicyValue } from "../packages/billing/allowance-policy";
import { sourceType, retrievalState } from "./sourceSchema";
import { subscriptionCapabilitiesValue } from "./localLibrarySchema";
import { creatorRightsValue } from "./creatorSchema";
import {
  revertEvidenceValidator,
  revertStatusValidator,
} from "./lib/prObservation";
const tenant = {
  organizationId: v.id("organizations"),
  createdAt: v.number(),
  updatedAt: v.number(),
};
const sourceState = v.union(
  ...[
    "saved",
    "needs_upload",
    "queued",
    "processing",
    "ready",
    "failed",
    "deleted",
  ].map((s) => v.literal(s)),
);
export const productTables = {
  subscriptionTrials: defineTable({
    ...tenant,
    actor: v.id("users"),
    route: v.union(v.literal("local"), v.literal("codex_cloud")),
    model: v.string(),
    effort: v.string(),
    state: v.string(),
    input: v.any(),
    bundleHash: v.string(),
    expiresAt: v.number(),
    results: v.optional(v.any()),
  })
    .index("by_org", ["organizationId"])
    .index("by_actor", ["organizationId", "actor"]),
  sandboxToolSnapshots: defineTable({
    kind: v.union(v.literal("media"), v.literal("coding")),
    snapshotId: v.string(),
    parentSnapshotId: v.optional(v.string()),
    projectId: v.string(),
    teamId: v.string(),
    expiresAt: v.number(),
    updatedAt: v.number(),
    lease: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    retryAfter: v.optional(v.number()),
    lastError: v.optional(v.string()),
    computeSeconds: v.optional(v.number()),
  }).index("by_kind", ["kind"]),
  categoryVocabulary: defineTable({
    key: v.string(),
    name: v.string(),
    aliases: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  workspaceCategories: defineTable({
    ...tenant,
    key: v.string(),
    name: v.string(),
    aliases: v.array(v.string()),
    count: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_key", ["organizationId", "key"]),
  categorySuggestions: defineTable({
    ...tenant,
    key: v.string(),
    name: v.string(),
    state: v.string(),
  })
    .index("by_state", ["state"])
    .index("by_org", ["organizationId"])
    .index("by_org_key", ["organizationId", "key"]),
  sourceCategories: defineTable({
    searchable: v.optional(v.string()),
    ...tenant,
    sourceId: v.id("sources"),
    categoryKey: v.string(),
    title: v.string(),
    sourceCreatedAt: v.number(),
    sourceUpdatedAt: v.number(),
    publishedAt: v.optional(v.number()),
    savedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_category_created", [
      "organizationId",
      "categoryKey",
      "sourceCreatedAt",
    ])
    .index("by_category_title", ["organizationId", "categoryKey", "title"])
    .index("by_category_updated", [
      "organizationId",
      "categoryKey",
      "sourceUpdatedAt",
    ])
    .index("by_category_saved", ["organizationId", "categoryKey", "savedAt"])
    .index("by_category_published", [
      "organizationId",
      "categoryKey",
      "publishedAt",
    ])
    .searchIndex("category_search", {
      searchField: "searchable",
      filterFields: ["organizationId", "categoryKey"],
    }),
  mediaStages: defineTable({
    ...tenant,
    sourceId: v.id("sources"),
    generation: v.number(),
    objectKey: v.string(),
    etag: v.string(),
    pipelineVersion: v.string(),
    artifactHash: v.string(),
    payload: v.any(),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_updated", ["updatedAt"]),
  sourceCounts: defineTable({
    organizationId: v.id("organizations"),
    active: v.number(),
    lifetime: v.number(),
  }).index("by_org", ["organizationId"]),
  matchingJobs: defineTable({
    ...tenant,
    key: v.string(),
    sourceId: v.id("sources"),
    repositoryId: v.id("repositories"),
    state: v.string(),
    attempt: v.number(),
    reservationKey: v.string(),
    proposalId: v.optional(v.id("proposals")),
    insightIds: v.optional(v.array(v.string())),
    actor: v.optional(v.id("users")),
    sourceGeneration: v.optional(v.number()),
    sourceRevision: v.optional(v.number()),
    sourceRevisionId: v.optional(v.id("sourceRevisions")),
    sourceContentHash: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_org", ["organizationId"]),
  inferenceReservations: defineTable({
    key: v.string(),
    budgetKey: v.string(),
    max: v.number(),
    state: v.string(),
    createdAt: v.number(),
    payloadDigest: v.optional(v.string()),
    brokerConsumedAt: v.optional(v.number()),
    settledMicros: v.optional(v.number()),
  }).index("by_key", ["key"]),
  operatorBudgets: defineTable({
    key: v.string(),
    ceiling: v.number(),
    reserved: v.number(),
    spent: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  trialClaims: defineTable({
    identityHash: v.string(),
    organizationId: v.id("organizations"),
    createdAt: v.number(),
  }).index("by_identity", ["identityHash"]),
  objectDeletions: defineTable({
    key: v.string(),
    rechecksScheduledAt: v.optional(v.number()),
    state: v.string(),
    attempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_state", ["state"]),
  githubLinks: defineTable({
    ...tenant,
    actor: v.id("users"),
    stateHash: v.string(),
    expiresAt: v.number(),
    consumed: v.boolean(),
  })
    .index("by_state", ["stateHash"])
    .index("by_org", ["organizationId"]),
  githubBindings: defineTable({
    ...tenant,
    githubUserId: v.number(),
    installationId: v.number(),
    repositories: v.array(v.object({ id: v.number(), fullName: v.string() })),
    status: v.string(),
  }).index("by_org", ["organizationId"]),
  creditPools: defineTable({
    ...tenant,
    key: v.string(),
    kind: v.string(),
    granted: v.number(),
    spent: v.number(),
    reserved: v.number(),
    revoked: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_org", ["organizationId"])
    .index("by_key", ["key"]),
  taxConfigurations: defineTable({
    domestic: v.string(),
    target: v.string(),
    special317: v.boolean(),
    evidence: v.optional(v.string()),
    effectiveAt: v.optional(v.number()),
    registrations: v.array(v.string()),
    countries: v.array(v.string()),
    oss: v.boolean(),
    reviewed: v.boolean(),
    updatedAt: v.number(),
  }),
  legalAcceptances: defineTable({
    ...tenant,
    actor: v.id("users"),
    termsVersion: v.string(),
    immediateService: v.boolean(),
    checkoutKey: v.optional(v.string()),
    checkoutCustomerId: v.optional(v.string()),
    providerAccountId: v.optional(v.string()),
    providerMode: v.optional(v.union(v.literal("test"), v.literal("live"))),
    allowancePolicy: v.optional(allowancePolicyValue),
    paidSubscriptionId: v.optional(v.string()),
  }).index("by_org", ["organizationId"]),
  refundRequests: defineTable({
    ...tenant,
    invoiceId: v.string(),
    invoiceCreatedAt: v.number(),
    status: v.string(),
  }).index("by_org", ["organizationId"]),
  storageUsage: defineTable({
    organizationId: v.id("organizations"),
    bytes: v.number(),
  }).index("by_org", ["organizationId"]),
  assets: defineTable({
    ...tenant,
    key: v.string(),
    sourceId: v.optional(v.id("sources")),
    sourceGeneration: v.optional(v.number()),
    size: v.number(),
    type: v.string(),
    state: v.string(),
    etag: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    kind: v.optional(v.string()),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_source", ["organizationId", "sourceId"])
    .index("by_key", ["key"])
    .index("by_expiry", ["expiresAt"]),
  sources: defineTable({
    ...tenant,
    sourceType: v.optional(sourceType),
    currentRevisionId: v.optional(v.id("sourceRevisions")),
    socialIdentity: v.optional(
      v.object({
        platform: v.union(v.literal("instagram"), v.literal("tiktok")),
        postKey: v.string(),
      }),
    ),
    retrievalState: v.optional(retrievalState),
    publicImportId: v.optional(v.id("publicImports")),
    analysisPipelineVersion: v.optional(v.string()),
    sourceRetentionUntil: v.optional(v.number()),
    creatorRights: v.optional(creatorRightsValue),
    typedAnalysisActor: v.optional(v.id("users")),
    localAnalysisReceipt: v.optional(v.any()),
    processingStartedAt: v.optional(v.number()),
    processingReceipt: v.optional(v.any()),
    speechProvenance: v.optional(v.any()),
    linkPreview: v.optional(
      v.object({
        state: v.union(
          v.literal("queued"),
          v.literal("loading"),
          v.literal("ready"),
          v.literal("unavailable"),
        ),
        assetId: v.optional(v.id("assets")),
        updatedAt: v.number(),
      }),
    ),
    acquisition: v.optional(
      v.object({
        basis: v.literal("permitted_public_fetch"),
        status: v.string(),
        downloaderVersion: v.string(),
        extractor: v.string(),
        title: v.string(),
        description: v.string(),
        durationSeconds: v.optional(v.number()),
        publishedAt: v.optional(v.number()),
        byteLength: v.optional(v.number()),
        acquiredAt: v.number(),
      }),
    ),
    personalMedia: v.optional(v.any()),
    personalOrderedInput: v.optional(v.any()),
    orderedMedia: v.optional(v.any()),
    orderedPreparation: v.optional(
      v.object({
        schemaVersion: v.literal("ordered-preparation-v1"),
        generation: v.number(),
        bindingHash: v.string(),
        language: v.string(),
        pipelineVersion: v.string(),
        phase: v.union(
          v.literal("queued"),
          v.literal("preparing"),
          v.literal("prepared"),
          v.literal("inference"),
        ),
        deadline: v.number(),
        metadata: v.any(),
        assets: v.any(),
        computeCreditsPerSecond: v.number(),
        computeCredits: v.number(),
        inferenceMicros: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        usageUnconfirmed: v.boolean(),
        warnings: v.array(v.string()),
        omissions: v.array(
          v.object({
            id: v.string(),
            index: v.number(),
            reason: v.literal("decode_unavailable"),
          }),
        ),
        inferenceDispatchedAt: v.optional(v.number()),
      }),
    ),
    serviceIntent: v.optional(
      v.object({
        schemaVersion: v.literal("service-social-v1"),
        generation: v.number(),
        pipelineVersion: v.string(),
        model: v.string(),
        language: v.string(),
        route: v.literal("managed_api"),
        promptHash: v.string(),
        settingsHash: v.string(),
        postRevisionHash: v.string(),
        evidenceHash: v.string(),
        rightsHash: v.string(),
        compatibilityKey: v.string(),
      }),
    ),
    managedAnalysisActor: v.optional(v.id("users")),
    personalAnalysis: v.optional(personalAnalysisValue),
    repositorySelection: v.optional(v.any()),
    selectionPendingKey: v.optional(v.string()),
    selectionActor: v.optional(v.id("users")),
    key: v.string(),
    canonical: v.string(),
    kind: v.string(),
    title: v.string(),
    categoryKeys: v.optional(v.array(v.string())),
    domainKeys: v.optional(v.array(v.string())),
    publishedAt: v.optional(v.number()),
    categoryNames: v.optional(v.array(v.string())),
    categoryOverride: v.optional(v.array(v.string())),
    url: v.optional(v.string()),
    originalSavedAt: v.optional(v.number()),
    text: v.optional(v.string()),
    objectKey: v.optional(v.string()),
    state: sourceState,
    coverage: v.string(),
    summary: v.optional(v.string()),
    searchable: v.optional(v.string()),
    analysis: v.optional(v.any()),
    mediaEvidence: v.optional(
      v.array(
        v.object({
          kind: v.string(),
          id: v.string(),
          startMs: v.union(v.number(), v.null()),
          endMs: v.union(v.number(), v.null()),
        }),
      ),
    ),
    mediaCoverage: v.optional(v.string()),
    originalText: v.optional(v.string()),
    originalMediaEvidence: v.optional(v.any()),
    correctionAuthor: v.optional(v.id("users")),
    tags: v.array(v.string()),
    error: v.optional(v.string()),
    rightsAttested: v.boolean(),
    assistantIntake: v.optional(v.boolean()),
    generation: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_created", ["organizationId", "createdAt"])
    .index("by_org_title", ["organizationId", "title"])
    .index("by_org_updated", ["organizationId", "updatedAt"])
    .index("by_org_saved", ["organizationId", "originalSavedAt"])
    .index("by_org_published", ["organizationId", "publishedAt"])
    .index("by_personal_device_state", [
      "personalAnalysis.deviceId",
      "personalAnalysis.state",
    ])
    .index("by_key", ["organizationId", "key"])
    .index("by_canonical", ["organizationId", "canonical"])
    .index("by_social_identity", [
      "organizationId",
      "socialIdentity.platform",
      "socialIdentity.postKey",
    ])
    .searchIndex("source_search", {
      searchField: "searchable",
      filterFields: ["organizationId", "state"],
    }),
  repositoryManifests: defineTable({
    organizationId: v.id("organizations"),
    repositoryId: v.id("repositories"),
    sha: v.string(),
    manifest: v.array(v.string()),
    manifestEntries: v.optional(
      v.array(
        v.object({
          path: v.string(),
          blobSha: v.string(),
          mode: v.string(),
          size: v.number(),
        }),
      ),
    ),
  })
    .index("by_org", ["organizationId"])
    .index("by_repository", ["repositoryId"]),
  repositoryContent: defineTable({
    organizationId: v.id("organizations"),
    repositoryId: v.id("repositories"),
    sha: v.string(),
    context: v.string(),
    contextTree: v.optional(v.string()),
    contextExcerpts: v.optional(
      v.array(
        v.object({
          path: v.string(),
          startLine: v.number(),
          endLine: v.number(),
          content: v.string(),
          blobSha: v.string(),
        }),
      ),
    ),
  })
    .index("by_org", ["organizationId"])
    .index("by_repository", ["repositoryId"]),
  repositories: defineTable({
    ...tenant,
    manifestStored: v.optional(v.boolean()),
    contentStored: v.optional(v.boolean()),
    contextEvidence: v.optional(
      v.array(
        v.object({
          path: v.string(),
          startLine: v.number(),
          endLine: v.number(),
        }),
      ),
    ),
    selectionVersion: v.optional(v.number()),
    snapshotPaths: v.optional(v.array(v.string())),
    profileDraftProcessingVersion: v.optional(v.string()),
    preparationError: v.optional(v.string()),
    installationId: v.number(),
    providerId: v.number(),
    fullName: v.string(),
    branch: v.string(),
    sha: v.string(),
    enabled: v.boolean(),
    profile: v.string(),
    profileDraft: v.optional(v.string()),
    profileDraftSha: v.optional(v.string()),
    profileDraftVersion: v.optional(v.number()),
    profileDraftKey: v.optional(v.string()),
    profileDraftActor: v.optional(v.id("users")),
    profileDraftSelectionVersion: v.optional(v.number()),
    profileVersion: v.number(),
    confirmed: v.boolean(),
    manifest: v.array(v.string()),
    manifestEntries: v.optional(
      v.array(
        v.object({
          path: v.string(),
          blobSha: v.string(),
          mode: v.string(),
          size: v.number(),
        }),
      ),
    ),
    context: v.string(),
    contextTree: v.optional(v.string()),
    snapshotSummary: v.optional(v.any()),
    snapshotAt: v.optional(v.number()),
    snapshotDelta: v.optional(v.any()),
    extractionVersion: v.optional(v.string()),
    contextFiles: v.optional(v.array(v.string())),
    contextExcerpts: v.optional(
      v.array(
        v.object({
          path: v.string(),
          startLine: v.number(),
          endLine: v.number(),
          content: v.string(),
          blobSha: v.string(),
        }),
      ),
    ),
    status: v.string(),
  })
    .index("by_org", ["organizationId"])
    .index("by_provider", ["organizationId", "providerId"])
    .index("by_github", ["installationId", "providerId"]),
  proposals: defineTable({
    ...tenant,
    improvementId: v.optional(v.id("improvements")),
    references: v.optional(
      v.array(
        v.object({
          sourceId: v.id("sources"),
          generation: v.number(),
          revision: v.number(),
          insightId: v.string(),
        }),
      ),
    ),
    sourceId: v.id("sources"),
    repositoryId: v.id("repositories"),
    baseSha: v.string(),
    profileVersion: v.number(),
    disposition: v.string(),
    reviewerCorrection: v.optional(
      v.object({
        from: v.string(),
        to: v.string(),
        reason: v.string(),
        actor: v.id("users"),
        at: v.number(),
      }),
    ),
    title: v.string(),
    detail: v.any(),
    review: v.string(),
    plan: v.optional(v.any()),
    planDraft: v.optional(v.any()),
    planDraftVersion: v.optional(v.number()),
    planDraftKey: v.optional(v.string()),
    planDraftActor: v.optional(v.id("users")),
    localPlanRunId: v.optional(v.id("localLibraryRuns")),
    localEvaluationId: v.optional(v.id("knowledgeEvaluations")),
    planHash: v.optional(v.string()),
    version: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_source", ["sourceId"])
    .index("by_local_evaluation", ["localEvaluationId"]),
  runs: defineTable({
    ...tenant,
    automationPolicyId: v.optional(v.id("improvementPolicies")),
    automationPolicyVersion: v.optional(v.number()),
    proposalId: v.id("proposals"),
    repositoryId: v.id("repositories"),
    approvedBy: v.id("users"),
    planHash: v.string(),
    baseSha: v.string(),
    version: v.number(),
    executor: v.string(),
    selectionVersion: v.optional(v.number()),
    fundingRoute: v.string(),
    customerModel: v.optional(v.any()),
    credentialRevision: v.optional(v.string()),
    maxProviderUsdCents: v.optional(v.number()),
    providerUsdCents: v.optional(v.number()),
    providerRequestState: v.optional(v.string()),
    publicationGeneration: v.optional(v.number()),
    maxCredits: v.number(),
    allowedPaths: v.array(v.string()),
    highRisk: v.boolean(),
    state: v.string(),
    generation: v.number(),
    expiresAt: v.number(),
    leaseUntil: v.number(),
    deviceId: v.optional(v.id("devices")),
    runtimeExpiresAt: v.optional(v.number()),
    patch: v.optional(v.string()),
    changes: v.optional(v.any()),
    report: v.optional(v.string()),
    checksPassed: v.optional(v.boolean()),
    aiReview: v.optional(
      v.object({
        status: v.string(),
        key: v.string(),
        generation: v.number(),
        patchDigest: v.string(),
        policyVersion: v.number(),
        note: v.string(),
        credits: v.optional(v.number()),
      }),
    ),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    prState: v.optional(v.string()),
    mergedAt: v.optional(v.string()),
    mergeCommitSha: v.optional(v.string()),
    deployment: v.optional(
      v.object({
        state: v.string(),
        commit: v.string(),
        url: v.string(),
        environment: v.string(),
        observedAt: v.number(),
      }),
    ),
    mergeIntent: v.optional(
      v.object({ head: v.string(), state: v.string(), at: v.number() }),
    ),
    reverted: v.optional(revertEvidenceValidator),
    revertStatus: v.optional(revertStatusValidator),
    revertProbeHead: v.optional(v.string()),
    observedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    events: v.array(v.string()),
  })
    .index("by_org", ["organizationId"])
    .index("by_state", ["state"])
    .index("by_pr", ["repositoryId", "prNumber"])
    .index("by_repository", ["repositoryId"])
    .index("by_proposal", ["proposalId"])
    .index("by_org_state", ["organizationId", "state"])
    .index("by_device_state", ["deviceId", "state"]),
  wallets: defineTable({
    ...tenant,
    granted: v.number(),
    spent: v.number(),
    reserved: v.number(),
    periodEnd: v.number(),
    tier: v.string(),
    interval: v.string(),
    purchased: v.number(),
  }).index("by_org", ["organizationId"]),
  reservations: defineTable({
    ...tenant,
    dispatchedAt: v.optional(v.number()),
    key: v.string(),
    max: v.number(),
    settled: v.number(),
    state: v.string(),
    expiresAt: v.number(),
    allocations: v.optional(
      v.array(v.object({ poolId: v.id("creditPools"), credits: v.number() })),
    ),
    operatorKeys: v.optional(v.array(v.string())),
  })
    .index("by_org", ["organizationId"])
    .index("by_key", ["organizationId", "key"]),
  costEntries: defineTable({
    ...tenant,
    key: v.string(),
    credits: v.number(),
    provider: v.string(),
    units: v.number(),
    unitType: v.string(),
    eur: v.optional(v.number()),
    costCeilingEur: v.optional(v.number()),
    costStatus: v.optional(v.string()),
  })
    .index("by_org", ["organizationId"])
    .index("by_key", ["organizationId", "key"]),
  outbox: defineTable({
    ...tenant,
    key: v.string(),
    operation: v.string(),
    target: v.string(),
    state: v.string(),
    attempts: v.number(),
    generation: v.number(),
    leaseUntil: v.number(),
    nextAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_state", ["state"]),
  connections: defineTable({
    ...tenant,
    provider: v.string(),
    ciphertext: v.string(),
    keyVersion: v.string(),
    revision: v.optional(v.string()),
    refreshLeaseKey: v.optional(v.string()),
    refreshLeaseExpiresAt: v.optional(v.number()),
    availableModels: v.optional(v.array(v.string())),
    status: v.string(),
  })
    .index("by_org", ["organizationId"])
    .index("by_provider", ["organizationId", "provider"]),
  devices: defineTable({
    ...tenant,
    owner: v.id("users"),
    name: v.string(),
    fingerprint: v.string(),
    codeHash: v.string(),
    credentialHash: v.string(),
    state: v.string(),
    expiresAt: v.number(),
    lastSeenAt: v.number(),
    capabilities: v.array(v.string()),
    isolationEvidenceHash: v.optional(v.string()),
    activeRunId: v.optional(v.id("runs")),
    personalModels: v.optional(
      v.array(v.object({ slug: v.string(), displayName: v.string() })),
    ),
    personalInputProtocols: v.optional(
      v.array(v.literal("ordered-personal-v1")),
    ),
    subscriptionCapabilities: v.optional(
      v.object({
        value: subscriptionCapabilitiesValue,
        hash: v.string(),
        revision: v.number(),
        expiresAt: v.number(),
        profileBinding: v.string(),
        sessionExpiresAt: v.number(),
      }),
    ),
    personalSeenAt: v.optional(v.number()),
    personalProfileBinding: v.optional(v.string()),
    activePersonalSource: v.optional(v.id("sources")),
    assistantSeenAt: v.optional(v.number()),
    assistantProfileBinding: v.optional(v.string()),
    assistantSessionExpiresAt: v.optional(v.number()),
    assistantPending: v.optional(v.boolean()),
  })
    .index("by_org", ["organizationId"])
    .index("by_code", ["codeHash"])
    .index("by_credential", ["credentialHash"]),
  feedback: defineTable({
    ...tenant,
    actor: v.id("users"),
    target: v.string(),
    action: v.string(),
    note: v.string(),
    benefit: v.string(),
    assistantClientId: v.optional(v.string()),
    assistantKey: v.optional(v.string()),
    assistantVersion: v.optional(v.number()),
    assistantInputHash: v.optional(v.string()),
    assistantGrantId: v.optional(v.id("assistantGrants")),
    assistantGrantVersion: v.optional(v.number()),
    sourceRevision: v.optional(v.number()),
    sourceGeneration: v.optional(v.number()),
    analysisHash: v.optional(v.string()),
    qualityVerdict: v.optional(
      v.union(
        v.literal("accurate"),
        v.literal("missing_details"),
        v.literal("incorrect"),
        v.literal("unsure"),
      ),
    ),
  })
    .index("by_org", ["organizationId"])
    .index("by_assistant_key", [
      "organizationId",
      "actor",
      "assistantClientId",
      "assistantKey",
    ])
    .index("by_target_actor", [
      "organizationId",
      "target",
      "actor",
      "sourceGeneration",
      "analysisHash",
    ]),
  notifications: defineTable({
    ...tenant,
    key: v.string(),
    message: v.string(),
    read: v.boolean(),
  }).index("by_org", ["organizationId"]),
  tombstones: defineTable({
    organizationId: v.id("organizations"),
    target: v.string(),
    at: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_target", ["target"]),
  deletionMarkers: defineTable({
    kind: v.union(v.literal("account"), v.literal("workspace")),
    target: v.string(),
    subjectHash: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_target", ["kind", "target"])
    .index("by_subject", ["subjectHash"]),
  webhookReceipts: defineTable({
    provider: v.string(),
    key: v.string(),
    at: v.number(),
    state: v.string(),
  }).index("by_key", ["provider", "key"]),
  preferences: defineTable({
    ...tenant,
    email: v.boolean(),
    telegram: v.boolean(),
    analytics: v.boolean(),
    legalVersion: v.string(),
    acceptedAt: v.number(),
  }).index("by_org", ["organizationId"]),
  invoiceTasks: defineTable({
    ...tenant,
    invoiceId: v.string(),
    dueAt: v.number(),
    state: v.string(),
    receipt: v.optional(v.string()),
    creditNoteOf: v.optional(v.string()),
  }).index("by_org", ["organizationId"]),
  billingPeriods: defineTable({
    ...tenant,
    key: v.string(),
    start: v.number(),
    end: v.number(),
    credits: v.number(),
    allowanceCeiling: v.optional(v.number()),
    allowancePolicy: v.optional(allowancePolicyValue),
    upgradeChangeId: v.optional(v.id("billingChanges")),
    subscription: v.string(),
  })
    .index("by_org", ["organizationId"])
    .index("by_key", ["key"]),
  billingChanges: defineTable({
    ...tenant,
    subscriptionId: v.string(),
    itemId: v.string(),
    oldPrice: v.string(),
    newPrice: v.string(),
    tier: v.union(v.literal("starter"), v.literal("pro")),
    interval: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("annual"),
    ),
    prorationDate: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    amount: v.number(),
    currency: v.string(),
    expiresAt: v.number(),
    state: v.string(),
    invoiceId: v.optional(v.string()),
    sourcePolicy: v.optional(allowancePolicyValue),
    targetPolicy: v.optional(allowancePolicyValue),
  })
    .index("by_org", ["organizationId"])
    .index("by_subscription", ["subscriptionId"]),
  billingReversals: defineTable({
    ...tenant,
    key: v.string(),
    paymentId: v.string(),
    invoiceId: v.optional(v.string()),
    invoiceTotal: v.optional(v.number()),
    refunded: v.number(),
    total: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_key", ["key"])
    .index("by_invoice", ["invoiceId"]),
  creditFunding: defineTable({
    ...tenant,
    poolId: v.id("creditPools"),
    key: v.string(),
    invoiceId: v.string(),
    credits: v.number(),
    revoked: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_key", ["key"])
    .index("by_invoice", ["invoiceId"]),
};
