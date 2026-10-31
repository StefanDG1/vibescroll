/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as preparedService from "../preparedService.js";
import type * as preparedAnalysis from "../preparedAnalysis.js";
import type * as preparedMedia from "../preparedMedia.js";
import type * as accounts from "../accounts.js";
import type * as analysisVersions from "../analysisVersions.js";
import type * as analysisVersionFrames from "../analysisVersionFrames.js";
import type * as aiPreferences from "../aiPreferences.js";
import type * as assets from "../assets.js";
import type * as assistant from "../assistant.js";
import type * as assistantProposalWork from "../assistantProposalWork.js";
import type * as assistantProposals from "../assistantProposals.js";
import type * as projectPlanning from "../projectPlanning.js";
import type * as proposalIssues from "../proposalIssues.js";
import type * as proposalIssueActions from "../proposalIssueActions.js";
import type * as proposalLoop from "../proposalLoop.js";
import type * as proposalLoopActions from "../proposalLoopActions.js";
import type * as assistantWidget from "../assistantWidget.js";
import type * as assistantEventRuntime from "../assistantEventRuntime.js";
import type * as assistantEvents from "../assistantEvents.js";
import type * as assistantEventsHttp from "../assistantEventsHttp.js";
import type * as assistantGrants from "../assistantGrants.js";
import type * as assistantHttp from "../assistantHttp.js";
import type * as assistantIntakeUi from "../assistantIntakeUi.js";
import type * as assistantLocal from "../assistantLocal.js";
import type * as assistantLocalActions from "../assistantLocalActions.js";
import type * as assistantLocalHttp from "../assistantLocalHttp.js";
import type * as assistantSchema from "../assistantSchema.js";
import type * as billing from "../billing.js";
import type * as billingChanges from "../billingChanges.js";
import type * as billingV1 from "../billingV1.js";
import type * as categories from "../categories.js";
import type * as catalogAccess from "../catalogAccess.js";
import type * as catalogBrowse from "../catalogBrowse.js";
import type * as cloud from "../cloud.js";
import type * as cloudCatalog from "../cloudCatalog.js";
import type * as cloudCatalogActions from "../cloudCatalogActions.js";
import type * as commerce from "../commerce.js";
import type * as credentialRotation from "../credentialRotation.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as dashboardSchema from "../dashboardSchema.js";
import type * as devices from "../devices.js";
import type * as email from "../email.js";
import type * as gateway from "../gateway.js";
import type * as githubEvents from "../githubEvents.js";
import type * as githubLinks from "../githubLinks.js";
import type * as githubOAuth from "../githubOAuth.js";
import type * as googleInferenceBudget from "../googleInferenceBudget.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as imports from "../imports.js";
import type * as improvementActions from "../improvementActions.js";
import type * as improvementAutomation from "../improvementAutomation.js";
import type * as improvementPolicies from "../improvementPolicies.js";
import type * as improvementSchema from "../improvementSchema.js";
import type * as improvements from "../improvements.js";
import type * as inferenceBudget from "../inferenceBudget.js";
import type * as integrations from "../integrations.js";
import type * as invoiceAccounting from "../invoiceAccounting.js";
import type * as invoiceOperations from "../invoiceOperations.js";
import type * as issueActions from "../issueActions.js";
import type * as issues from "../issues.js";
import type * as jobs from "../jobs.js";
import type * as knowledge from "../knowledge.js";
import type * as knowledgeActions from "../knowledgeActions.js";
import type * as knowledgeExplore from "../knowledgeExplore.js";
import type * as knowledgeGrants from "../knowledgeGrants.js";
import type * as knowledgeSchema from "../knowledgeSchema.js";
import type * as lib from "../lib.js";
import type * as lib_assistantEvents from "../lib/assistantEvents.js";
import type * as lib_assistantIntake from "../lib/assistantIntake.js";
import type * as lib_assistantPrincipal from "../lib/assistantPrincipal.js";
import type * as lib_assistantProject from "../lib/assistantProject.js";
import type * as lib_assistantSourceScope from "../lib/assistantSourceScope.js";
import type * as lib_cloudAccess from "../lib/cloudAccess.js";
import type * as lib_dashboardProjection from "../lib/dashboardProjection.js";
import type * as lib_deletionMarkers from "../lib/deletionMarkers.js";
import type * as lib_githubAuthorization from "../lib/githubAuthorization.js";
import type * as lib_googleInference from "../lib/googleInference.js";
import type * as lib_googleMedia from "../lib/googleMedia.js";
import type * as lib_hostedMediaAccess from "../lib/hostedMediaAccess.js";
import type * as lib_improvementContext from "../lib/improvementContext.js";
import type * as lib_inference from "../lib/inference.js";
import type * as lib_invoiceOperator from "../lib/invoiceOperator.js";
import type * as lib_knowledgeReadContext from "../lib/knowledgeReadContext.js";
import type * as lib_personalAccess from "../lib/personalAccess.js";
import type * as lib_prObservation from "../lib/prObservation.js";
import type * as lib_projectedMutations from "../lib/projectedMutations.js";
import type * as lib_repositoryAllowance from "../lib/repositoryAllowance.js";
import type * as lib_repositoryContent from "../lib/repositoryContent.js";
import type * as lib_repositoryManifest from "../lib/repositoryManifest.js";
import type * as lib_sourceAuthority from "../lib/sourceAuthority.js";
import type * as lib_storageUsage from "../lib/storageUsage.js";
import type * as lib_topicHierarchy from "../lib/topicHierarchy.js";
import type * as lib_workspacePrivacy from "../lib/workspacePrivacy.js";
import type * as libraryScanSchema from "../libraryScanSchema.js";
import type * as libraryScanWorker from "../libraryScanWorker.js";
import type * as libraryScans from "../libraryScans.js";
import type * as librarySpaces from "../librarySpaces.js";
import type * as librarySpacesSchema from "../librarySpacesSchema.js";
import type * as limitsV1 from "../limitsV1.js";
import type * as localLibrary from "../localLibrary.js";
import type * as localLibraryActions from "../localLibraryActions.js";
import type * as localLibrarySchema from "../localLibrarySchema.js";
import type * as localResults from "../localResults.js";
import type * as maintenance from "../maintenance.js";
import type * as media from "../media.js";
import type * as operatorAcceptance from "../operatorAcceptance.js";
import type * as organizations from "../organizations.js";
import type * as payments from "../payments.js";
import type * as personalAnalysis from "../personalAnalysis.js";
import type * as personalMedia from "../personalMedia.js";
import type * as personalMediaState from "../personalMediaState.js";
import type * as pilotPaymentMaintenance from "../pilotPaymentMaintenance.js";
import type * as planning from "../planning.js";
import type * as privacy from "../privacy.js";
import type * as product from "../product.js";
import type * as posts from "../posts.js";
import type * as publicKnowledge from "../publicKnowledge.js";
import type * as sourceAcquisition from "../sourceAcquisition.js";
import type * as sourceAcquisitionActions from "../sourceAcquisitionActions.js";
import type * as setupJourney from "../setupJourney.js";
import type * as sourceRelationships from "../sourceRelationships.js";
import type * as productSchema from "../productSchema.js";
import type * as profiles from "../profiles.js";
import type * as projects from "../projects.js";
import type * as reconciliation from "../reconciliation.js";
import type * as recovery from "../recovery.js";
import type * as recoveryStorage from "../recoveryStorage.js";
import type * as repositorySelection from "../repositorySelection.js";
import type * as retrieval from "../retrieval.js";
import type * as runnerProtocol from "../runnerProtocol.js";
import type * as sandboxBroker from "../sandboxBroker.js";
import type * as sandboxSnapshots from "../sandboxSnapshots.js";
import type * as settlementAccounting from "../settlementAccounting.js";
import type * as sourcePreview from "../sourcePreview.js";
import type * as sourcePreviewState from "../sourcePreviewState.js";
import type * as subscriptionTrials from "../subscriptionTrials.js";
import type * as toolMaintenance from "../toolMaintenance.js";
import type * as usageMaintenance from "../usageMaintenance.js";
import type * as workCloudAnalysis from "../workCloudAnalysis.js";
import type * as workCloudEvidenceRepair from "../workCloudEvidenceRepair.js";
import type * as workCloudFrames from "../workCloudFrames.js";
import type * as workCloudSaves from "../workCloudSaves.js";
import type * as workCloudSaveSchema from "../workCloudSaveSchema.js";
import type * as lib_workCloudSave from "../lib/workCloudSave.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  catalogAccess: typeof catalogAccess;
  catalogBrowse: typeof catalogBrowse;
  preparedMedia: typeof preparedMedia;
  preparedAnalysis: typeof preparedAnalysis;
  preparedService: typeof preparedService;
  accounts: typeof accounts;
  analysisVersions: typeof analysisVersions;
  analysisVersionFrames: typeof analysisVersionFrames;
  aiPreferences: typeof aiPreferences;
  assets: typeof assets;
  assistant: typeof assistant;
  assistantProposals: typeof assistantProposals;
  assistantProposalWork: typeof assistantProposalWork;
  projectPlanning: typeof projectPlanning;
  proposalIssues: typeof proposalIssues;
  proposalIssueActions: typeof proposalIssueActions;
  proposalLoop: typeof proposalLoop;
  proposalLoopActions: typeof proposalLoopActions;
  assistantWidget: typeof assistantWidget;
  assistantEventRuntime: typeof assistantEventRuntime;
  assistantEvents: typeof assistantEvents;
  assistantEventsHttp: typeof assistantEventsHttp;
  assistantGrants: typeof assistantGrants;
  assistantHttp: typeof assistantHttp;
  assistantIntakeUi: typeof assistantIntakeUi;
  assistantLocal: typeof assistantLocal;
  assistantLocalActions: typeof assistantLocalActions;
  assistantLocalHttp: typeof assistantLocalHttp;
  assistantSchema: typeof assistantSchema;
  billing: typeof billing;
  billingChanges: typeof billingChanges;
  billingV1: typeof billingV1;
  categories: typeof categories;
  cloud: typeof cloud;
  cloudCatalog: typeof cloudCatalog;
  cloudCatalogActions: typeof cloudCatalogActions;
  commerce: typeof commerce;
  credentialRotation: typeof credentialRotation;
  crons: typeof crons;
  dashboard: typeof dashboard;
  dashboardSchema: typeof dashboardSchema;
  devices: typeof devices;
  email: typeof email;
  gateway: typeof gateway;
  githubEvents: typeof githubEvents;
  githubLinks: typeof githubLinks;
  githubOAuth: typeof githubOAuth;
  googleInferenceBudget: typeof googleInferenceBudget;
  http: typeof http;
  identity: typeof identity;
  imports: typeof imports;
  improvementActions: typeof improvementActions;
  improvementAutomation: typeof improvementAutomation;
  improvementPolicies: typeof improvementPolicies;
  improvementSchema: typeof improvementSchema;
  improvements: typeof improvements;
  inferenceBudget: typeof inferenceBudget;
  integrations: typeof integrations;
  invoiceAccounting: typeof invoiceAccounting;
  invoiceOperations: typeof invoiceOperations;
  issueActions: typeof issueActions;
  issues: typeof issues;
  jobs: typeof jobs;
  knowledge: typeof knowledge;
  knowledgeActions: typeof knowledgeActions;
  knowledgeExplore: typeof knowledgeExplore;
  knowledgeGrants: typeof knowledgeGrants;
  knowledgeSchema: typeof knowledgeSchema;
  lib: typeof lib;
  "lib/assistantEvents": typeof lib_assistantEvents;
  "lib/assistantIntake": typeof lib_assistantIntake;
  "lib/assistantPrincipal": typeof lib_assistantPrincipal;
  "lib/assistantProject": typeof lib_assistantProject;
  "lib/assistantSourceScope": typeof lib_assistantSourceScope;
  "lib/cloudAccess": typeof lib_cloudAccess;
  "lib/dashboardProjection": typeof lib_dashboardProjection;
  "lib/deletionMarkers": typeof lib_deletionMarkers;
  "lib/githubAuthorization": typeof lib_githubAuthorization;
  "lib/googleInference": typeof lib_googleInference;
  "lib/googleMedia": typeof lib_googleMedia;
  "lib/hostedMediaAccess": typeof lib_hostedMediaAccess;
  "lib/improvementContext": typeof lib_improvementContext;
  "lib/inference": typeof lib_inference;
  "lib/invoiceOperator": typeof lib_invoiceOperator;
  "lib/knowledgeReadContext": typeof lib_knowledgeReadContext;
  "lib/personalAccess": typeof lib_personalAccess;
  "lib/prObservation": typeof lib_prObservation;
  "lib/projectedMutations": typeof lib_projectedMutations;
  "lib/repositoryAllowance": typeof lib_repositoryAllowance;
  "lib/repositoryContent": typeof lib_repositoryContent;
  "lib/repositoryManifest": typeof lib_repositoryManifest;
  "lib/sourceAuthority": typeof lib_sourceAuthority;
  "lib/storageUsage": typeof lib_storageUsage;
  "lib/topicHierarchy": typeof lib_topicHierarchy;
  "lib/workspacePrivacy": typeof lib_workspacePrivacy;
  libraryScanSchema: typeof libraryScanSchema;
  libraryScanWorker: typeof libraryScanWorker;
  libraryScans: typeof libraryScans;
  librarySpaces: typeof librarySpaces;
  librarySpacesSchema: typeof librarySpacesSchema;
  limitsV1: typeof limitsV1;
  localLibrary: typeof localLibrary;
  localLibraryActions: typeof localLibraryActions;
  localLibrarySchema: typeof localLibrarySchema;
  localResults: typeof localResults;
  maintenance: typeof maintenance;
  media: typeof media;
  operatorAcceptance: typeof operatorAcceptance;
  organizations: typeof organizations;
  payments: typeof payments;
  personalAnalysis: typeof personalAnalysis;
  personalMedia: typeof personalMedia;
  personalMediaState: typeof personalMediaState;
  pilotPaymentMaintenance: typeof pilotPaymentMaintenance;
  planning: typeof planning;
  privacy: typeof privacy;
  product: typeof product;
  posts: typeof posts;
  publicKnowledge: typeof publicKnowledge;
  sourceAcquisition: typeof sourceAcquisition;
  sourceAcquisitionActions: typeof sourceAcquisitionActions;
  setupJourney: typeof setupJourney;
  sourceRelationships: typeof sourceRelationships;
  productSchema: typeof productSchema;
  profiles: typeof profiles;
  projects: typeof projects;
  reconciliation: typeof reconciliation;
  recovery: typeof recovery;
  recoveryStorage: typeof recoveryStorage;
  repositorySelection: typeof repositorySelection;
  retrieval: typeof retrieval;
  runnerProtocol: typeof runnerProtocol;
  sandboxBroker: typeof sandboxBroker;
  sandboxSnapshots: typeof sandboxSnapshots;
  settlementAccounting: typeof settlementAccounting;
  sourcePreview: typeof sourcePreview;
  sourcePreviewState: typeof sourcePreviewState;
  subscriptionTrials: typeof subscriptionTrials;
  toolMaintenance: typeof toolMaintenance;
  usageMaintenance: typeof usageMaintenance;
  workCloudAnalysis: typeof workCloudAnalysis;
  workCloudFrames: typeof workCloudFrames;
  workCloudEvidenceRepair: typeof workCloudEvidenceRepair;
  workCloudSaves: typeof workCloudSaves;
  workCloudSaveSchema: typeof workCloudSaveSchema;
  "lib/workCloudSave": typeof lib_workCloudSave;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
