// All tables with restorable credentials, dispatch/publication authority or
// provider-retained evidence must be visited before unlocking a recovery.
// sourceProviderQuotas is intentionally absent: conservative global quota state
// is retained, not reset by tenant export, deletion or recovery.
// sourceRelationships contains only user-authored opaque links, grants no
// authority and rechecks both source memberships/retention on every read.
export const recoveryQuarantineSections = [
  "assistantSubscriptions",
  "assistantDeliveries",
  "assistantGrants",
  "assistantIntakes",
  "connections",
  "devices",
  "githubLinks",
  "githubBindings",
  "runs",
  "repositories",
  "knowledgePolicies",
  "knowledgeJobs",
  "knowledgeEvaluations",
  "issueAttempts",
  "issueDrafts",
  "publicEditions",
  "publicCollections",
  "publicReports",
  "publicCorrections",
  "publicArtifacts",
  "publicImports",
  "publicGeography",
  "sourceAcquisitions",
  "sources",
  "sourceRevisions",
  "pilotPaymentObservations",
] as const;
