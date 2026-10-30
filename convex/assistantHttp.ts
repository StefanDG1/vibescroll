import {
  prepareProjectIssueInput,
  reportProjectOutcomeInput,
} from "../packages/contracts/proposal-work";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { z } from "zod";
import {
  preparedQuoteRequest,
  preparedStartRequest,
} from "../packages/contracts/prepared-service";
import { cloudRetryRequest } from "../packages/contracts/cloud-retry";
import { projectApplicationContextInput } from "../packages/contracts/project-application";
import {
  saveProjectProposalInput,
  getProjectProposalInput,
  listProjectProposalsInput,
  chatProposalOperations,
  chatProposalFailure,
} from "../packages/contracts/chat-proposals";
import { analysisVersionOperations } from "../packages/contracts/analysis-versions";
import {
  widgetBrowseInput,
  widgetTopicInput,
  widgetProposalInput,
} from "../packages/widget/contracts";
import { assistantIssuer } from "../packages/policy/assistant";
import {
  cloudCompletionEnvelope,
  parseWorkCloudResult,
  workCloudTextOperations,
  workCloudPreparationStage,
} from "../packages/contracts/work-cloud-text";
import {
  readAssistantBody,
  validateAssistantUserinfo,
} from "../packages/policy/assistant-http";
const profileId = z.string().max(100).optional();
const operations = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("prepare_project_issue"),
    args: prepareProjectIssueInput,
  }),
  z.strictObject({
    operation: z.literal("report_project_outcome"),
    args: reportProjectOutcomeInput,
  }),
  z.strictObject({
    operation: z.literal("save_project_proposal"),
    args: saveProjectProposalInput,
  }),
  z.strictObject({
    operation: z.literal("get_project_proposal"),
    args: getProjectProposalInput,
  }),
  z.strictObject({
    operation: z.literal("list_project_proposals"),
    args: listProjectProposalsInput,
  }),
  z.strictObject({
    operation: z.literal("quote_video_analysis"),
    args: preparedQuoteRequest,
  }),
  z.strictObject({
    operation: z.literal("start_video_analysis"),
    args: preparedStartRequest,
  }),
  z.strictObject({
    operation: z.literal("video_analysis_status"),
    args: z.strictObject({ sourceId: z.string().min(1).max(100) }),
  }),
  z.strictObject({
    operation: z.literal("get_project_application_context"),
    args: projectApplicationContextInput,
  }),
  z
    .object({
      operation: z.literal("widget_profiles"),
      args: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("widget_state"),
      args: z.object({ profileId }).strict(),
    })
    .strict(),
  z
    .object({ operation: z.literal("widget_browse"), args: widgetBrowseInput })
    .strict(),
  z
    .object({ operation: z.literal("widget_topic"), args: widgetTopicInput })
    .strict(),
  z
    .object({
      operation: z.literal("widget_proposal"),
      args: widgetProposalInput,
    })
    .strict(),
  ...workCloudTextOperations,
  ...analysisVersionOperations,
  z
    .object({
      operation: z.literal("draft_project_suggestion"),
      args: z
        .object({
          profileId,
          evaluationId: z.string().min(1).max(100),
          evaluationHash: z.string().regex(/^[a-f0-9]{64}$/),
          grantVersion: z.number().int().positive(),
          explicitlyRequested: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("record_feedback"),
      args: z
        .object({
          profileId,
          sourceId: z.string().min(1).max(100),
          generation: z.number().int().nonnegative(),
          revision: z.number().int().nonnegative(),
          grantVersion: z.number().int().positive(),
          key: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
          expectedVersion: z.number().int().nonnegative(),
          explicitlyRequested: z.literal(true),
          action: z.enum([
            "useful",
            "not_relevant",
            "already_implemented",
            "unsafe_unsupported",
            "later",
          ]),
          note: z.string().max(2000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("save_link"),
      args: z
        .object({
          profileId,
          url: z.string().url().max(2048),
          title: z.string().min(1).max(160),
          key: z.string().min(8).max(64),
          rightsAttested: z.literal(true).optional(),
          analyze: z.boolean().optional(),
          project: z.string().min(1).max(200).optional(),
          bestProjects: z.boolean().optional(),
          explicitlyRequested: z.literal(true).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("get_job_status"),
      args: z
        .object({ profileId, sourceId: z.string().min(1).max(100) })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("request_analysis"),
      args: z
        .object({
          profileId,
          sourceId: z.string().min(1).max(100),
          mode: z
            .enum(["local", "credits", "projects", "cancel", "work_cloud"])
            .optional(),
          generation: z.number().int().nonnegative().optional(),
          revision: z.number().int().nonnegative().optional(),
          grantVersion: z.number().int().positive().optional(),
          savedIntentId: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          retry: cloudRetryRequest.optional(),
          cloud: z
            .object({
              model: z.string().min(1).max(100),
              effort: z.enum(["low", "medium", "high", "xhigh"]),
              useOwnPlan: z.literal(true),
              maxApiUsd: z.literal(0),
              retainUntil: z.number().int().positive(),
            })
            .strict()
            .optional(),
          maxCredits: z.number().int().nonnegative().optional(),
          project: z.string().min(1).max(200).optional(),
          bestProjects: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("search"),
      args: z
        .object({
          query: z.string().min(1).max(200),
          offset: z.number().int().min(0).max(49).optional(),
          cursor: z.string().max(4096).optional(),
          profileId,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("fetch"),
      args: z.object({ id: z.string().min(1).max(300), profileId }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("get_profile"),
      args: z
        .object({
          profileId,
          cursor: z.string().max(4096).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
]);
export const tools = httpAction(async (ctx, request) => {
  let operation: string | undefined;
  const deny = (status = 403) =>
    Response.json(
      {
        error:
          "Assistant access is unavailable. Review the current app grant or reconnect through official OAuth.",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9._~-]{20,16384})$/)?.[1];
    if (!bearer || process.env.MCP_ENABLED !== "true") return deny(401);
    const input = operations.parse(
      await readAssistantBody(request, 262144, (value) =>
        cloudCompletionEnvelope(value)
          ? 262144
          : value &&
              typeof value === "object" &&
              "operation" in value &&
              value.operation === "save_project_proposal"
            ? 32768
            : 8192,
      ),
    );
    operation = input.operation;
    const expected = await ctx.runMutation(internal.assistant.throttle, {});
    const issuer = assistantIssuer(process.env.MCP_AUTH_ISSUER);
    if (!issuer || issuer !== expected.issuer) return deny(401);
    // Public PKCE clients cannot hold a client secret. The official bearer-authenticated
    // userinfo endpoint supplies a live provider check; JWT audience/client/scope/consent
    // verification remains enforced independently by Convex and assistantPrincipal.
    const result = await fetch(`${issuer}/oauth2/userinfo`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!result.ok) return deny(401);
    if (
      !validateAssistantUserinfo(
        await readAssistantBody(result, 16384),
        expected.subject,
      )
    )
      return deny(401);
    if (
      ["get_profile", "save_link", "search", "widget_profiles"].includes(
        input.operation,
      )
    )
      await ctx.runMutation(internal.assistantGrants.ensureDefaults, {});
    const selectedProfile =
      "profileId" in input.args
        ? (input.args.profileId as Id<"organizations"> | undefined)
        : undefined;
    let value: unknown;
    switch (input.operation) {
      case "widget_profiles":
        value = await ctx.runQuery(internal.assistantWidget.profiles, {});
        break;
      case "widget_state":
        value = await ctx.runQuery(internal.assistantWidget.state, {
          profileId: selectedProfile,
        });
        break;
      case "widget_browse":
        value = await ctx.runQuery(internal.assistantWidget.browse, {
          ...input.args,
          profileId: selectedProfile,
        });
        break;
      case "widget_topic":
        value = await ctx.runQuery(internal.assistantWidget.topic, {
          ...input.args,
          profileId: selectedProfile,
          topicId: input.args.topicId as Id<"knowledgeTopics">,
        });
        break;
      case "widget_proposal":
        value = await ctx.runQuery(internal.assistantWidget.proposal, {
          profileId: selectedProfile,
          proposalId: input.args.proposalId as Id<"issueDrafts">,
        });
        break;
      case "work_cloud_repair_claim":
        value = await ctx.runMutation(internal.workCloudEvidenceRepair.claim, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
        });
        break;
      case "work_cloud_repair_input":
        value = await ctx.runQuery(internal.workCloudEvidenceRepair.input, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
        });
        break;
      case "work_cloud_repair_complete":
        value = await ctx.runMutation(
          internal.workCloudEvidenceRepair.complete,
          { ...input.args, sourceId: input.args.sourceId as Id<"sources"> },
        );
        break;
      case "work_cloud_repair_heartbeat":
        value = await ctx.runMutation(
          internal.workCloudEvidenceRepair.heartbeat,
          { ...input.args, sourceId: input.args.sourceId as Id<"sources"> },
        );
        break;
      case "work_cloud_frame":
        value = await ctx.runAction(internal.workCloudFrames.upload, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
        });
        break;
      case "work_cloud_retained_frame":
        value = await ctx.runAction(internal.analysisVersionFrames.read, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
          attemptId: input.args.attemptId as Id<"analysisAttempts">,
        });
        break;
      case "work_cloud_input":
        value = input.args.attemptId
          ? await ctx.runQuery(internal.analysisVersions.input, {
              ...input.args,
              sourceId: input.args.sourceId as Id<"sources">,
              attemptId: input.args.attemptId as Id<"analysisAttempts">,
            })
          : await ctx.runQuery(internal.workCloudAnalysis.input, {
              ...input.args,
              sourceId: input.args.sourceId as Id<"sources">,
            });
        break;
      case "work_cloud_claim":
      case "work_cloud_heartbeat":
      case "work_cloud_fail":
        value = input.args.attemptId
          ? await ctx.runMutation(internal.analysisVersions.dispatch, {
              ...input.args,
              sourceId: input.args.sourceId as Id<"sources">,
              attemptId: input.args.attemptId as Id<"analysisAttempts">,
              operation:
                input.operation === "work_cloud_claim"
                  ? "claim"
                  : input.operation === "work_cloud_heartbeat"
                    ? "heartbeat"
                    : "fail",
            })
          : await ctx.runMutation(internal.workCloudAnalysis.dispatch, {
              ...input.args,
              sourceId: input.args.sourceId as Id<"sources">,
              operation:
                input.operation === "work_cloud_claim"
                  ? "claim"
                  : input.operation === "work_cloud_heartbeat"
                    ? "heartbeat"
                    : "fail",
            });
        break;
      case "work_cloud_complete": {
        const { resultJson, ...args } = input.args;
        value = args.attemptId
          ? await ctx.runMutation(internal.analysisVersions.dispatch, {
              ...args,
              sourceId: args.sourceId as Id<"sources">,
              attemptId: args.attemptId as Id<"analysisAttempts">,
              operation: "complete",
              output: parseWorkCloudResult(resultJson),
            })
          : await ctx.runMutation(internal.workCloudAnalysis.dispatch, {
              ...args,
              sourceId: args.sourceId as Id<"sources">,
              operation: "complete",
              output: parseWorkCloudResult(resultJson),
            });
        break;
      }
      case "work_cloud_metadata": {
        value = await ctx.runMutation(internal.workCloudAnalysis.dispatch, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
          operation: "metadata",
        });
        break;
      }
      case "work_cloud_prepare": {
        const { preparationJson, ...args } = input.args;
        const preparation = parseWorkCloudResult(preparationJson);
        if (
          preparation &&
          typeof preparation === "object" &&
          "schemaVersion" in preparation &&
          preparation.schemaVersion === "work-cloud-media-stage-v1"
        ) {
          const stage = workCloudPreparationStage.parse(preparation);
          const lease = {
            ...args,
            sourceId: args.sourceId as Id<"sources">,
          };
          if (stage.stage === "metadata") {
            value = await ctx.runMutation(internal.workCloudAnalysis.dispatch, {
              ...lease,
              operation: "metadata",
              metadata: stage.metadata,
            });
          } else {
            const { schemaVersion: _version, stage: _stage, ...frame } = stage;
            value = await ctx.runAction(internal.workCloudFrames.upload, {
              ...lease,
              ...frame,
            });
          }
          break;
        }
        value = await ctx.runMutation(internal.workCloudAnalysis.dispatch, {
          ...args,
          sourceId: args.sourceId as Id<"sources">,
          operation: "prepare",
          preparation,
        });
        break;
      }
      case "analysis_history":
        value = await ctx.runQuery(api.analysisVersions.history, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
        });
        break;
      case "analysis_version":
        value = await ctx.runQuery(api.analysisVersions.read, {
          sourceId: input.args.sourceId as Id<"sources">,
          versionId: input.args.versionId as Id<"analysisVersions"> | undefined,
        });
        break;
      case "compare_analysis_versions":
        value = await ctx.runQuery(api.analysisVersions.compare, {
          sourceId: input.args.sourceId as Id<"sources">,
          beforeId: input.args.beforeId as Id<"analysisVersions">,
          afterId: input.args.afterId as Id<"analysisVersions">,
        });
        break;
      case "select_analysis_version":
        value = await ctx.runMutation(api.analysisVersions.select, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
          versionId: input.args.versionId as Id<"analysisVersions">,
        });
        break;
      case "request_analysis_version":
        value = await ctx.runMutation(api.analysisVersions.request, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
          basedOnVersionId: input.args.basedOnVersionId as
            Id<"analysisVersions"> | undefined,
        });
        break;
      case "cancel_waiting_analysis_version":
        value = await ctx.runMutation(api.analysisVersions.cancelWaiting, {
          sourceId: input.args.sourceId as Id<"sources">,
          attemptId: input.args.attemptId as Id<"analysisAttempts">,
        });
        break;
      case "draft_project_suggestion":
        value = await ctx.runMutation(
          internal.assistant.draftProjectSuggestion,
          {
            ...input.args,
            profileId: selectedProfile,
            evaluationId: input.args.evaluationId as Id<"knowledgeEvaluations">,
          },
        );
        break;
      case "record_feedback":
        value = await ctx.runMutation(internal.assistant.recordFeedback, {
          ...input.args,
          profileId: selectedProfile,
          sourceId: input.args.sourceId as Id<"sources">,
        });
        break;
      case "get_profile":
        value = await ctx.runQuery(internal.assistant.getProfile, {
          ...input.args,
          profileId: selectedProfile,
        });
        break;
      case "get_project_application_context":
        value = await ctx.runQuery(
          internal.assistant.projectApplicationContext,
          {
            ...input.args,
            profileId: selectedProfile,
            sourceId: input.args.sourceId as Id<"sources">,
            projectId: input.args.projectId as Id<"repositories">,
            analysisVersionId: input.args.analysisVersionId as
              Id<"analysisVersions"> | undefined,
          },
        );
        break;
      case "prepare_project_issue":
        value = await ctx.runMutation(internal.assistantProposalWork.prepare, {
          ...input.args,
          profileId: selectedProfile,
          proposalId: input.args.proposalId as Id<"proposals">,
        });
        break;
      case "report_project_outcome":
        value = await ctx.runMutation(internal.assistantProposalWork.report, {
          ...input.args,
          profileId: selectedProfile,
          proposalId: input.args.proposalId as Id<"proposals">,
        });
        break;
      case "save_project_proposal":
        value = await ctx.runMutation(internal.assistantProposals.save, {
          ...input.args,
          profileId: selectedProfile,
          sourceId: input.args.sourceId as Id<"sources">,
          projectId: input.args.projectId as Id<"repositories">,
          analysisVersionId: input.args
            .analysisVersionId as Id<"analysisVersions">,
          proposalId: input.args.proposalId as Id<"proposals"> | undefined,
        });
        break;
      case "get_project_proposal":
        value = await ctx.runQuery(internal.assistantProposals.read, {
          ...input.args,
          profileId: selectedProfile,
          proposalId: input.args.proposalId as Id<"proposals">,
        });
        break;
      case "list_project_proposals":
        value = await ctx.runQuery(internal.assistantProposals.list, {
          ...input.args,
          profileId: selectedProfile,
          projectId: input.args.projectId as Id<"repositories"> | undefined,
        });
        break;
      case "search":
        value = await ctx.runQuery(internal.assistant.search, {
          ...input.args,
          profileId: selectedProfile,
        });
        break;
      case "fetch":
        value = await ctx.runQuery(internal.assistant.fetch, {
          ...input.args,
          profileId: selectedProfile,
        });
        break;
      case "quote_video_analysis":
        value = await ctx.runQuery(internal.preparedService.assistantQuote, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
        });
        break;
      case "start_video_analysis":
        value = await ctx.runMutation(internal.preparedService.assistantStart, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
        });
        break;
      case "video_analysis_status":
        value = await ctx.runQuery(internal.preparedService.assistantStatus, {
          sourceId: input.args.sourceId as Id<"sources">,
        });
        break;
      case "save_link":
        value = await ctx.runMutation(internal.assistant.saveLink, {
          ...input.args,
          profileId: selectedProfile,
        });
        break;
      case "get_job_status":
        value = await ctx.runQuery(internal.assistant.getJobStatus, {
          sourceId: input.args.sourceId as Id<"sources">,
          profileId: selectedProfile,
        });
        break;
      case "request_analysis":
        value = await ctx.runMutation(internal.assistant.requestAnalysis, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
          profileId: selectedProfile,
        });
        break;
    }
    return Response.json(value, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (operation && chatProposalOperations.has(operation)) {
      const code =
        error instanceof Error
          ? error.message.match(
              /\b(APPROVAL_STALE|IDEMPOTENCY_CONFLICT|POLICY_BLOCKED|INVALID_INPUT|LIMIT_REACHED):/,
            )?.[1]
          : undefined;
      const failure = chatProposalFailure(code);
      if (failure)
        return Response.json(failure, {
          status:
            code === "APPROVAL_STALE" || code === "IDEMPOTENCY_CONFLICT"
              ? 409
              : 400,
          headers: { "Cache-Control": "no-store" },
        });
    }
    if (
      error instanceof Error &&
      /\bPROFILE_SELECTION_REQUIRED:/.test(error.message)
    )
      return Response.json(
        {
          code: "PROFILE_SELECTION_REQUIRED",
          error:
            "Choose a current VibeScroll workspace with get_profile. Your existing OAuth connection can stay connected.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    return deny();
  }
});
