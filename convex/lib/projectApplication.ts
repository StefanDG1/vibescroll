import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { buildProjectSourceContent } from "./projectSourceContent";
import { ensure } from "../../packages/policy";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { digest } from "../product";
import { runtimeCurrent } from "./privateSourceAnalysis";

export async function projectApplicationQuote<
  T extends {
    workload: string;
    model: string;
    deviceId: Doc<"devices">["_id"];
    sourceBindings: {
      sourceId: Doc<"sources">["_id"];
      generation: number;
      revision: number;
    }[];
  },
>(ctx: QueryCtx, payload: T, includeSourceContent: boolean) {
  ensure(
    payload.workload === "project_evaluation",
    "INVALID_INPUT",
    "Full post context belongs to a source evaluation only.",
  );
  const device = await ctx.db.get(payload.deviceId);
  ensure(
    device &&
      runtimeCurrent(device) &&
      device.localTaskRuntime!.value.features.includes(
        "project_apply_source_v1",
      ),
    "SETUP_REQUIRED",
    "Reconnect a runtime supporting full post evaluation and multiple opportunities.",
  );
  const sourceContentBindings = [];
  if (includeSourceContent)
    for (const binding of payload.sourceBindings) {
      const source = (await ctx.db.get(binding.sourceId))!;
      const content = await buildProjectSourceContent(ctx, source);
      ensure(
        !content.images.length ||
          device.subscriptionCapabilities?.value.models
            .find((m) => m.slug === payload.model)
            ?.inputModalities.includes("image"),
        "SETUP_REQUIRED",
        "Choose an advertised image-capable model for retained images.",
      );
      ensure(
        source.generation === binding.generation &&
          source.updatedAt === binding.revision,
        "APPROVAL_STALE",
        "The source changed.",
      );
      sourceContentBindings.push(content.binding);
    }
  const value = {
    ...payload,
    schemaVersion: "4.0.0" as const,
    workload: "project_evaluation" as const,
    includeSourceContent,
    sourceContentBindings,
    localRuntimeHash: device.localTaskRuntime!.hash,
    sourceReanalysisBinding: {
      sourceId: payload.sourceBindings[0].sourceId,
      generation: payload.sourceBindings[0].generation,
    },
  };
  return { payload: value, hash: await digest(canonicalJson(value)) };
}
export async function projectApplicationContent(
  ctx: QueryCtx,
  run: Doc<"localLibraryRuns">,
) {
  const task = run.task;
  ensure(
    task?.schemaVersion === "4.0.0",
    "INVALID_INPUT",
    "Use the versioned post application task.",
  );
  if (!task.includeSourceContent) {
    ensure(
      task.sourceContentBindings.length === 0,
      "APPROVAL_STALE",
      "Excluded source content has unexpected bindings.",
    );
    return [];
  }
  ensure(
    task.sourceContentBindings.length === task.sourceBindings.length &&
      new Set(task.sourceContentBindings.map((b) => b.sourceId)).size ===
        task.sourceContentBindings.length,
    "APPROVAL_STALE",
    "Source content selection changed.",
  );
  const result = [];
  for (const binding of task.sourceContentBindings) {
    const source = await ctx.db.get(binding.sourceId);
    ensure(
      source?.organizationId === run.organizationId &&
        task.sourceBindings.some((b) => b.sourceId === binding.sourceId),
      "FORBIDDEN",
      "The source left this task.",
    );
    const content = await buildProjectSourceContent(ctx, source);
    ensure(
      canonicalJson(content.binding) === canonicalJson(binding),
      "APPROVAL_STALE",
      "Retained transcript or image authority changed.",
    );
    result.push(content);
  }
  return result;
}
export function projectApplicationCache(run: Doc<"localLibraryRuns">) {
  return run.task?.schemaVersion === "4.0.0"
    ? `:project-apply-v1:${canonicalJson({ includeSourceContent: run.task.includeSourceContent, bindings: run.task.sourceContentBindings, model: run.model, effort: run.effort })}`
    : "";
}
export async function projectApplicationBundle(
  ctx: QueryCtx,
  run: Doc<"localLibraryRuns">,
) {
  if (run.task?.schemaVersion !== "4.0.0") return {};
  const content = await projectApplicationContent(ctx, run);
  return {
    application: {
      schemaVersion: "project-application-context-v1",
      includeSourceContent: run.task.includeSourceContent,
      sources: content.map((c) => ({
        binding: c.binding,
        transcript: c.transcript,
        caption: c.caption,
        warnings: c.warnings,
        images: c.images.map(({ key: _key, ...image }) => image),
      })),
    },
    ...(run.task.privateEvaluationOrigin
      ? { privateEvaluationOrigin: run.task.privateEvaluationOrigin }
      : {}),
    ...(run.task.privateEvaluationBrief !== undefined
      ? { privateEvaluationBrief: run.task.privateEvaluationBrief }
      : {}),
  };
}
