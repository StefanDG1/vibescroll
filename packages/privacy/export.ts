export const contentExportSections = [
  "improvements",
  "improvementOutcomes",
  "improvementPolicies",
  "improvementPreferences",
  "libraryScans",
  "subscriptionTrials",
  "localLibraryRuns",
  "localSourceImports",
  "sources",
  "proposals",
  "feedback",
  "repositories",
  "runs",
  "workspaceCategories",
  "knowledgeTopics",
  "knowledgeMembers",
  "knowledgeJobs",
  "knowledgeEvaluations",
  "knowledgePolicies",
  "issueDrafts",
  "issueAttempts",
  "publicEditions",
  "publicCollections",
  "publicReports",
  "publicCorrections",
  "publicArtifacts",
  "publicImports",
  "publicGeography",
  "sourceRevisions",
  "sourceAcquisitions",
  "sourceRelationships",
  "pilotPaymentObservations",
] as const;
export type ContentExportSection = (typeof contentExportSections)[number];

const privateFields = new Set([
  "objectKey",
  "ciphertext",
  "signedUrl",
  "uploadUrl",
  "downloadUrl",
  "accessToken",
  "refreshToken",
  "credentialRevision",
  "planDraftKey",
  "profileDraftKey",
  "planDraftActor",
  "profileDraftActor",
  "inspected",
  "lease",
  "credentialHash",
  "codeHash",
]);
const repositoryContext = new Set([
  "context",
  "contextTree",
  "contextExcerpts",
  "contextFiles",
  "snapshotDelta",
]);

// Content exports keep user decisions and provenance, not storage capabilities,
// authentication bindings, or a second copy of the temporary repository context.
export function exportRecord(
  section: ContentExportSection,
  value: unknown,
): unknown {
  if (section === "publicImports" && value && typeof value === "object") {
    // Actor ownership is enforced by the export query. Keep authored notes,
    // never a copied base artifact, permission/compatibility key or another actor.
    const layer = value as Record<string, unknown>;
    value = Object.fromEntries(
      [
        "_id",
        "_creationTime",
        "sourceId",
        "privateNote",
        "corrections",
        "createdAt",
        "updatedAt",
      ]
        .filter((key) => key in layer)
        .map((key) => [key, layer[key]]),
    );
  }
  const redact = (item: unknown, root = false): unknown => {
    if (Array.isArray(item)) return item.map((entry) => redact(entry));
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .filter(
            ([key]) =>
              !privateFields.has(key) &&
              !(root && section === "publicReports" && key === "key") &&
              !(
                root &&
                section === "pilotPaymentObservations" &&
                key === "key"
              ) &&
              !(
                root &&
                section === "sources" &&
                "publicImportId" in item &&
                [
                  "analysis",
                  "summary",
                  "text",
                  "originalText",
                  "mediaEvidence",
                  "originalMediaEvidence",
                  "personalMedia",
                  "acquisition",
                ].includes(key)
              ) &&
              !(
                root &&
                section === "repositories" &&
                repositoryContext.has(key)
              ) &&
              !(
                root &&
                section === "localSourceImports" &&
                ["transcript", "frames", "acquisition"].includes(key)
              ),
          )
          .map(([key, entry]) => [key, redact(entry)]),
      );
    return item;
  };
  return redact(value, true);
}
