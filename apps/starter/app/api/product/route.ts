import { NextRequest, NextResponse } from "next/server";
import { backend, api, configured } from "@/lib/backend";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { allowedRequestOrigin } from "@/lib/request-origin";
const operations = {
  projectPlanningContext: ["query", api.projectPlanning.context],
  projectProposalSave: ["mutation", api.projectPlanning.save],
  preparedAnalysisQuote: ["query", api.preparedService.quote],
  preparedAnalysisStart: ["mutation", api.preparedService.start],
  preparedAnalysisStatus: ["query", api.preparedService.status],
  catalogAccess: ["query", api.catalogAccess.status],
  setCatalogBrowsing: ["mutation", api.catalogAccess.setEnabled],
  catalogBrowse: ["query", api.catalogBrowse.list],
  catalogPost: ["mutation", api.catalogBrowse.detail],
  createTeamWorkspace: ["mutation", api.organizations.createTeam],
  preparedComparisonBegin: ["mutation", api.preparedAnalysis.begin],
  preparedComparisonStatus: ["query", api.preparedAnalysis.status],
  cloudCatalogPreview: ["query", api.cloudCatalog.preview],
  cloudCatalogContribute: ["action", api.cloudCatalogActions.contribute],
  cloudCatalogWithdraw: ["mutation", api.cloudCatalog.withdrawContribution],
  cloudCatalogNotes: ["mutation", api.cloudCatalog.saveNotes],
  cloudCatalogOwn: ["query", api.cloudCatalog.own],
  analysisHistory: ["query", api.analysisVersions.history],
  analysisVersion: ["query", api.analysisVersions.read],
  analysisCompare: ["query", api.analysisVersions.compare],
  analysisSelect: ["mutation", api.analysisVersions.select],
  analysisFollowRecommended: [
    "mutation",
    api.analysisVersions.followRecommendation,
  ],
  analysisReanalyze: ["mutation", api.analysisVersions.request],
  analysisCancelWaiting: ["mutation", api.analysisVersions.cancelWaiting],
  analysisKeepResult: ["mutation", api.analysisVersions.keepResult],
  analysisEnroll: ["mutation", api.analysisVersions.enroll],
  previewPrivateAdoption: ["query", api.organizations.previewPrivateAdoption],
  adoptPrivateLibrary: ["mutation", api.organizations.adoptPrivate],
  workCloudEvidenceRepairApprove: [
    "mutation",
    api.workCloudEvidenceRepair.approve,
  ],
  workCloudTextPreview: ["query", api.workCloudAnalysis.preview],
  workCloudTextApprove: ["mutation", api.workCloudAnalysis.approve],
  publicModerationReports: ["query", api.publicKnowledge.reports],
  publicModerationInspect: ["query", api.publicKnowledge.inspectReport],
  publicModerateReport: ["mutation", api.publicKnowledge.moderate],
  sourceRelationships: ["query", api.sourceRelationships.list],
  saveSourceRelationship: ["mutation", api.sourceRelationships.save],
  removeSourceRelationship: ["mutation", api.sourceRelationships.remove],
  setupJourney: ["query", api.setupJourney.status],
  saveSetupJourney: ["mutation", api.setupJourney.save],
  acquisitionPrepare: ["mutation", api.sourceAcquisition.prepare],
  acquisitionStatus: ["query", api.sourceAcquisition.status],
  acquisitionSelect: ["mutation", api.sourceAcquisition.select],
  acquisitionCancel: ["mutation", api.sourceAcquisition.cancel],
  acquisitionInspect: ["action", api.sourceAcquisitionActions.inspect],
  acquisitionAcquire: ["action", api.sourceAcquisitionActions.acquire],
  acquisitionSupplyText: ["mutation", api.sourceAcquisition.supplyText],
  publicOwn: ["query", api.publicKnowledge.own],
  prepareEdition: ["mutation", api.publicKnowledge.prepareEdition],
  publishEdition: ["mutation", api.publicKnowledge.publishEdition],
  withdrawEdition: ["mutation", api.publicKnowledge.withdrawEdition],
  saveCollection: ["mutation", api.publicKnowledge.saveCollection],
  publishCollection: ["mutation", api.publicKnowledge.publishCollection],
  withdrawCollection: ["mutation", api.publicKnowledge.withdrawCollection],
  setGeography: ["mutation", api.publicKnowledge.setGeography],
  savedPublicDetail: ["query", api.publicKnowledge.savedDetail],
  savePersonalLayer: ["mutation", api.publicKnowledge.savePersonalLayer],
  publicSaveEdition: ["mutation", api.publicKnowledge.saveEdition],
  assistantIntakeStatus: ["query", api.assistantIntakeUi.status],
  assistantIntakeAction: ["mutation", api.assistantIntakeUi.act],
  assistantSetup: ["query", api.assistantGrants.setup],
  assistantProjectChoices: ["query", api.assistantGrants.projectChoices],
  continueAssistantSetup: ["mutation", api.assistantGrants.continueSetup],
  saveAssistantGrant: ["mutation", api.assistantGrants.save],
  revokeAssistantGrant: ["mutation", api.assistantGrants.revoke],
  autoOrganizeExploreTopics: ["mutation", api.knowledgeExplore.autoOrganize],
  organizeExploreTopic: ["mutation", api.knowledgeExplore.organize],
  exploreTopics: ["query", api.knowledgeExplore.topics],
  exploreDetail: ["query", api.knowledgeExplore.detail],
  exploreJourney: ["query", api.knowledgeExplore.journey],
  exploreProposalBadges: ["query", api.knowledgeExplore.proposalBadges],
  exploreHelped: ["query", api.knowledgeExplore.helped],
  teamKnowledgeTargets: ["query", api.knowledgeGrants.targets],
  teamKnowledgeGrants: ["query", api.knowledgeGrants.listOwn],
  saveTeamKnowledgeGrant: ["mutation", api.knowledgeGrants.save],
  revokeTeamKnowledgeGrant: ["mutation", api.knowledgeGrants.revoke],
  sharedKnowledge: ["query", api.knowledgeGrants.shared],
  sharedKnowledgeSource: ["query", api.knowledgeGrants.fetchShared],
  connectedSpaceSources: ["query", api.librarySpaces.connected],
  librarySetup: ["query", api.librarySpaces.setup],
  saveLibrarySetup: ["mutation", api.librarySpaces.saveSetup],
  fileSourceSpaces: ["mutation", api.librarySpaces.fileSource],
  spaceSources: ["query", api.librarySpaces.list],
  exportSourceSpaces: ["query", api.librarySpaces.exportPage],
  localLibraryPrepare: ["mutation", api.localLibrary.prepare],
  localLibraryList: ["query", api.localLibrary.list],
  localLibraryCancel: ["mutation", api.localLibrary.cancel],
  localSourcePrepare: ["mutation", api.localLibrary.sourcePrepare],
  localSourceFrame: ["action", api.localLibraryActions.frame],
  localSourceFinish: ["mutation", api.localLibrary.sourceFinish],
  localSummaryPrepare: ["mutation", api.localLibrary.summaryPrepare],
  localSummaryFinish: ["mutation", api.localLibrary.summaryFinish],
  localEvaluationBundle: ["action", api.localLibraryActions.evaluationBundle],
  localEvaluationFinish: ["mutation", api.localLibrary.evaluationFinish],
  subscriptionTrialList: ["query", api.subscriptionTrials.list],
  subscriptionTrialPrepare: ["mutation", api.subscriptionTrials.prepare],
  subscriptionTrialBundle: ["query", api.subscriptionTrials.bundle],
  subscriptionTrialFinish: ["mutation", api.subscriptionTrials.finish],
  subscriptionTrialCancel: ["mutation", api.subscriptionTrials.cancel],
  scanList: ["query", api.libraryScans.list],
  scanPrepare: ["mutation", api.libraryScans.prepare],
  scanApprove: ["mutation", api.libraryScans.approve],
  scanPause: ["mutation", api.libraryScans.pause],
  improvementRefresh: ["action", api.improvementActions.refresh],
  improvementPolicies: ["query", api.improvementPolicies.list],
  improvementPolicySave: ["mutation", api.improvementPolicies.save],
  improvementPolicyPause: ["mutation", api.improvementPolicies.pause],
  improvementCategorize: ["mutation", api.improvementPolicies.categorize],
  improvementPreferences: ["query", api.improvements.preferences],
  improvementPreferencesSave: ["mutation", api.improvements.savePreferences],
  improvementList: ["query", api.improvements.list],
  improvementStart: ["action", api.improvementActions.start],
  improvementExecute: ["action", api.improvementActions.execute],
  improvementOutcome: ["mutation", api.improvements.outcome],
  knowledgeList: ["query", api.knowledge.list],
  knowledgeDetail: ["query", api.knowledge.detail],
  knowledgePolicy: ["query", api.knowledge.policy],
  knowledgeIdeas: ["query", api.knowledge.evaluations],
  knowledgeConfigure: ["mutation", api.knowledge.configure],
  knowledgeCorrect: ["mutation", api.knowledge.correct],
  knowledgeEvaluate: ["mutation", api.knowledge.startEvaluation],
  knowledgeDecide: ["mutation", api.knowledge.decide],
  issueList: ["query", api.issues.list],
  issueCreate: ["mutation", api.issues.create],
  issueEdit: ["mutation", api.issues.edit],
  issuePrepare: ["action", api.issueActions.prepare],
  issuePublish: ["action", api.issueActions.publish],
  issueRefresh: ["action", api.issueActions.refresh],
  selectRepositories: ["action", api.integrations.selectRepositories],
  refreshGithubChoices: ["action", api.githubOAuth.refreshChoices],
  confirmProfile: ["mutation", api.profiles.confirmDraft],
  saveProfileDraft: ["mutation", api.profiles.saveDraft],
  capture: ["mutation", api.product.capture],
  captureWorkCloud: ["mutation", api.workCloudSaves.capture],
  analyzeSavedWorkCloud: ["mutation", api.workCloudSaves.analyzeSaved],
  retrySavedWorkCloud: ["mutation", api.workCloudSaves.retrySaved],
  importLinks: ["mutation", api.imports.links],
  process: ["mutation", api.product.processSource],
  processBatch: ["mutation", api.product.processBatch],
  editSource: ["mutation", api.product.editSource],
  attachSource: ["mutation", api.product.attachSource],
  deleteSource: ["mutation", api.product.deleteSource],
  assignCategories: ["mutation", api.categories.assign],
  suggestCategory: ["mutation", api.categories.suggest],
  connectRepository: ["action", api.integrations.connectRepository],
  saveProfile: ["mutation", api.product.saveProfile],
  draftProfile: ["action", api.integrations.draftProfile],
  match: ["action", api.integrations.match],
  suggestRepositories: ["action", api.integrations.suggestRepositories],
  draftPlan: ["action", api.integrations.draftPlan],
  decide: ["mutation", api.product.decide],
  editPlan: ["mutation", api.product.editPlan],
  approve: ["mutation", api.jobs.approve],
  cancel: ["mutation", api.jobs.cancel],
  publish: ["action", api.integrations.publishRun],
  refreshPR: ["action", api.integrations.refreshPR],
  saveKey: ["action", api.integrations.saveKey],
  testKey: ["action", api.integrations.testKey],
  revoke: ["mutation", api.jobs.revoke],
  feedback: ["mutation", api.product.feedback],
  reviewAnalysis: ["mutation", api.product.reviewAnalysis],
  preferences: ["mutation", api.commerce.preferences],
  aiPreference: ["mutation", api.aiPreferences.save],
  revokeDevice: ["mutation", api.devices.revoke],
  startDevice: ["mutation", api.devices.start],
  approveDevice: ["mutation", api.devices.approve],
  approvePersonalAnalysis: ["mutation", api.personalAnalysis.approve],
  approvePersonalBatch: ["mutation", api.personalAnalysis.approveBatch],
  checkPersonalSession: ["query", api.personalAnalysis.checkSession],
  cancelPersonalAnalysis: ["mutation", api.personalAnalysis.cancel],
} as const;
export async function POST(req: NextRequest) {
  if (!allowedRequestOrigin(req))
    return NextResponse.json(
      { error: "Request origin is not allowed.", code: "ORIGIN_DENIED" },
      { status: 403 },
    );
  if (!configured())
    return NextResponse.json(
      { error: "Configure product identity and backend first." },
      { status: 503 },
    );
  const auth = await withAuth();
  if (!auth.user)
    return NextResponse.json(
      { error: "Sign in to continue." },
      { status: 401 },
    );
  if (Number(req.headers.get("content-length") ?? 0) > 810000)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let operationName = "unvalidated";
  let stage = "read_body";
  let bodyBytes: number | undefined;
  try {
    const raw = await req.text();
    bodyBytes = new TextEncoder().encode(raw).length;
    if (new TextEncoder().encode(raw).length > 810000)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    stage = "parse_body";
    const { operation, args } = JSON.parse(raw);
    if (bodyBytes > 150000 && operation !== "localSourceFrame")
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    const entry = operations[operation as keyof typeof operations];
    if (!entry)
      return NextResponse.json(
        { error: "Unknown operation." },
        { status: 400 },
      );
    operationName = operation;
    stage = "backend";
    const c = await backend(auth);
    const result =
      entry[0] === "action"
        ? await c.action(entry[1] as any, args)
        : entry[0] === "query"
          ? await c.query(entry[1] as any, args)
          : await c.mutation(entry[1] as any, args);
    return NextResponse.json(
      { result: result ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const messages: Record<string, string> = {
      ACCESS_LOST:
        "Your session or workspace access changed. Sign in again to continue.",
      EVIDENCE_REQUIRED:
        "Confirm the release you used before judging its outcome.",
      CHECKS_PENDING: "Wait for the required GitHub checks and reviews.",
      MERGE_UNKNOWN:
        "GitHub needs to confirm the previous merge. Refresh progress.",
      BUDGET_EXCEEDED: "This request exceeds the reviewed maximum spend.",
      ISSUES_PERMISSION_REQUIRED:
        "GitHub refused issue access. Ask the App and installation owner to approve Issues permission, then verify again. Your Markdown remains available; no issue was published.",
      PUBLICATION_UNKNOWN:
        "GitHub may have created this issue. Refresh its status before trying again.",
      DUPLICATE_ISSUE:
        "This idea already has an issue draft. Review the existing draft or explicitly choose a follow-up.",
      POLICY_BLOCKED:
        "This action needs review. Check its permissions and the text you want to share.",
      REPOSITORY_LIMIT:
        "This selection exceeds the existing repository allowance. Choose fewer projects.",
      GITHUB_UNAVAILABLE:
        "GitHub access is unavailable or expired. Reconnect the selected GitHub account before continuing.",
      PROVIDER_ERROR:
        "AI could not complete this request. Check the connection before trying again.",
      SETUP_REQUIRED: "Finish the connection setup before using this action.",
      SOURCE_UNAVAILABLE:
        "This source evidence is unavailable or expired. Review its current status or explicitly supply permitted replacement text.",
      PROVENANCE_REQUIRED:
        "Retrieve a current cited source revision or explicitly supply permitted text before processing.",
      STALE_APPROVAL:
        "This source or setup changed. Reload its current status and review again.",
      CONTEXT_REQUIRED:
        "This action needs a ready source, supported main point or refreshed repository evidence.",
      SOURCE_BUSY:
        "This work is already in progress. Check its status before trying again.",
      QUOTE_CHANGED:
        "The model, price or scope changed. Review its current quote before approving.",
      COST_RECONCILIATION_REQUIRED:
        "The cost of the previous attempt needs checking. Work is paused until that is resolved.",
      PROVIDER_LIMIT:
        "The current AI allowance cannot cover this work. Review Usage.",
      INSUFFICIENT_CREDITS:
        "Your available allowance cannot cover this maximum. Review Usage.",
      OPERATOR_BUDGET_REACHED:
        "The current monthly ceiling cannot cover this work. Review Usage and pending work.",
      REPO_TOO_LARGE:
        "This project exceeds the current inspection limit. Review its coverage in Projects.",
      QUOTA_EXCEEDED:
        "This workspace has reached its source or repository allowance.",
      BASE_CHANGED:
        "The repository changed. Refresh its snapshot and review a new plan.",
      IDEMPOTENCY_CONFLICT:
        "This request already saved different draft content. Open the saved proposal before making another edit.",
      LIMIT_REACHED:
        "This post has reached its proposal limit. Open an existing draft.",
      APPROVAL_STALE:
        "Something changed since the last review. Review the latest idea or plan.",
      MATCH_IN_PROGRESS:
        "Matching is already running for this source and repository.",
      RETRY_EXHAUSTED:
        "This matching job reached its retry limit. Review the source and provider setup before creating a new attempt.",
      ISOLATION_UNAVAILABLE:
        "Coding setup has not passed its required safety checks.",
      FORBIDDEN:
        "This action is unavailable with your current workspace or repository access.",
      RIGHTS_REQUIRED:
        "Confirm that you may save and process this content before continuing.",
      UPLOAD_REQUIRED:
        "The link downloader is not available for this source. Your saved link remains available; attach permitted media or retry after setup.",
      UNSUPPORTED_SOURCE:
        "Use a single supported video or post link. This source format cannot be retrieved automatically.",
      MEDIA_UNAVAILABLE:
        "The isolated media worker is unavailable. Your source is saved; no alternative provider was used.",
      INVALID_INPUT:
        "Some submitted fields are invalid. Review the source and try again.",
      INVALID_EVIDENCE:
        "The cited evidence changed or could not be verified. Check the source and prepare its evidence again.",
      REAUTH_REQUIRED:
        "Sign in again before changing a sensitive connection. Your library has been kept.",
    };
    const data =
      error &&
      typeof error === "object" &&
      "data" in error &&
      typeof error.data === "string"
        ? error.data
        : "";
    const message = data || (error instanceof Error ? error.message : "");
    const category =
      error instanceof Error
        ? [
            "Sign in to continue.",
            "Account unavailable. Complete account setup first.",
            "Organization unavailable.",
            "Recovery is in progress. Private access is paused.",
          ].some((text) => message.includes(text))
          ? "ACCESS_LOST"
          : message.includes(
                "Sign in again before changing a sensitive connection.",
              )
            ? "REAUTH_REQUIRED"
            : Object.keys(messages).find((code) => message.includes(`${code}:`))
        : undefined;
    // Do not log payloads, source text, credentials, tokens or upstream errors.
    console.error("product_operation_failed", {
      operation: operationName,
      category: category ?? "UNCLASSIFIED",
      stage,
      bodyBytes,
      errorType:
        error instanceof SyntaxError
          ? "SyntaxError"
          : error instanceof TypeError
            ? "TypeError"
            : "Error",
    });
    return NextResponse.json(
      {
        error: category
          ? category === "CONTEXT_REQUIRED" && operationName.startsWith("scan")
            ? "Confirm the selected projects’ proposed context in Projects before starting this scan."
            : messages[category]
          : "This action could not be completed. Check its latest status before trying again.",
        code: category ?? "UNCLASSIFIED",
      },
      {
        status: category === "ACCESS_LOST" ? 403 : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
