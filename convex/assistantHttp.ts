import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { z } from "zod";
import type { FunctionArgs } from "convex/server";
import { feedbackStateInput } from "../packages/widget/feedback";
import {
  widgetBrowseInput,
  widgetTopicInput,
  widgetProposalInput,
} from "../packages/widget/contracts";
import { assistantIssuer } from "../packages/policy/assistant";
import {
  libraryEditInput,
  libraryEditStateInput,
  libraryEditReceiptInput,
  libraryEditFailure,
  type LibraryEdit,
} from "../packages/widget/library-edits";
import {
  filingInput,
  filingStateInput,
  filingReceiptInput,
  filingFailure,
  type FilingInput,
} from "../packages/widget/evidence-filing";
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
  z
    .object({
      operation: z.literal("widget_feedback_state"),
      args: feedbackStateInput,
    })
    .strict(),
  z
    .object({
      operation: z.literal("widget_evidence_state"),
      args: filingStateInput,
    })
    .strict(),
  z
    .object({ operation: z.literal("widget_evidence_edit"), args: filingInput })
    .strict(),
  z
    .object({
      operation: z.literal("widget_evidence_receipt"),
      args: filingReceiptInput,
    })
    .strict(),
  z
    .object({
      operation: z.literal("widget_library_state"),
      args: libraryEditStateInput,
    })
    .strict(),
  z
    .object({
      operation: z.literal("widget_library_edit"),
      args: libraryEditInput,
    })
    .strict(),
  z
    .object({
      operation: z.literal("widget_library_receipt"),
      args: libraryEditReceiptInput,
    })
    .strict(),
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
  let editRequest: LibraryEdit | undefined;
  let evidenceRequest: FilingInput | undefined;
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
        cloudCompletionEnvelope(value) ? 262144 : 8192,
      ),
    );
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
    const selectedProfile =
      "profileId" in input.args
        ? (input.args.profileId as Id<"organizations"> | undefined)
        : undefined;
    let value: unknown;
    switch (input.operation) {
      case "widget_feedback_state":
        value = await ctx.runQuery(
          internal.assistantWidget.feedbackState,
          input.args as FunctionArgs<
            typeof internal.assistantWidget.feedbackState
          >,
        );
        break;
      case "widget_evidence_state":
        value = await ctx.runQuery(
          internal.assistantLibrary.evidenceState,
          input.args as FunctionArgs<
            typeof internal.assistantLibrary.evidenceState
          >,
        );
        break;
      case "widget_evidence_receipt": {
        const receipt = await ctx.runQuery(
          internal.assistantLibrary.evidenceOutcome,
          input.args as FunctionArgs<
            typeof internal.assistantLibrary.evidenceOutcome
          >,
        );
        value = {
          profile_id: input.args.profileId,
          grant_version: input.args.grantVersion,
          reference: input.args.reference,
          receipt,
        };
        break;
      }
      case "widget_evidence_edit":
        evidenceRequest = input.args;
        value = await ctx.runMutation(
          internal.assistantLibrary.fileEvidence,
          input.args as FunctionArgs<
            typeof internal.assistantLibrary.fileEvidence
          >,
        );
        break;
      case "widget_library_state":
        value = await ctx.runQuery(internal.assistantLibrary.state, {
          ...input.args,
          profileId: input.args.profileId as Id<"organizations">,
          topicId: input.args.topicId as Id<"knowledgeTopics">,
        });
        break;
      case "widget_library_receipt": {
        const receipt = await ctx.runQuery(internal.assistantLibrary.outcome, {
          ...input.args,
          profileId: input.args.profileId as Id<"organizations">,
          topicId: input.args.topicId as Id<"knowledgeTopics">,
        });
        value = {
          profile_id: input.args.profileId,
          grant_version: input.args.grantVersion,
          receipt,
        };
        break;
      }
      case "widget_library_edit":
        editRequest = input.args;
        value = await ctx.runMutation(internal.assistantLibrary.change, {
          ...input.args,
          profileId: input.args.profileId as Id<"organizations">,
          topicId: input.args.topicId as Id<"knowledgeTopics">,
          change:
            input.args.change.kind === "structure"
              ? {
                  ...input.args.change,
                  parentId: input.args.change
                    .parentId as Id<"knowledgeTopics"> | null,
                }
              : input.args.change,
        });
        break;
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
      case "work_cloud_input":
        value = await ctx.runQuery(internal.workCloudAnalysis.input, {
          ...input.args,
          sourceId: input.args.sourceId as Id<"sources">,
        });
        break;
      case "work_cloud_claim":
      case "work_cloud_heartbeat":
      case "work_cloud_fail":
        value = await ctx.runMutation(internal.workCloudAnalysis.dispatch, {
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
        value = await ctx.runMutation(internal.workCloudAnalysis.dispatch, {
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
    if (evidenceRequest) {
      const rejected = filingFailure(error, evidenceRequest);
      if (rejected)
        return Response.json(rejected, {
          status: 409,
          headers: { "Cache-Control": "no-store" },
        });
    }
    if (editRequest) {
      const rejected = libraryEditFailure(error, editRequest);
      if (rejected)
        return Response.json(rejected, {
          status: 409,
          headers: { "Cache-Control": "no-store" },
        });
    }
    return deny();
  }
});
