import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { z } from "zod";
import { readAssistantBody } from "../packages/policy/assistant-http";
export const runner = httpAction(async (ctx, request) => {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) return new Response(null, { status: 401 });
    const body = z
      .object({
        protocolVersion: z.literal("1.0.0"),
        operation: z.enum([
          "hello",
          "claim",
          "source_prepare",
          "source_finish",
          "frame",
          "evaluation",
          "project_work",
          "evaluation_finish",
          "done",
          "fail",
          "task_context",
          "task_heartbeat",
          "task_evaluation_finish",
          "task_finish",
          "task_fail",
        ]),
        args: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(await readAssistantBody(request, 1000000));
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const credentialHash = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const args: any = body.args;
    const result =
      body.operation === "frame"
        ? await ctx.runAction(internal.assistantLocalActions.frame, {
            credentialHash,
            id: args.id,
            frameId: args.frameId,
            data: args.data,
          })
        : body.operation === "task_context"
          ? await ctx.runAction(internal.assistantLocalActions.taskContext, {
              credentialHash,
              args,
            })
          : body.operation === "evaluation"
            ? await ctx.runAction(internal.assistantLocalActions.evaluation, {
                credentialHash,
                args,
              })
            : await ctx.runMutation(internal.assistantLocal.operation, {
                credentialHash,
                operation: body.operation,
                args,
              });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      {
        error:
          "Local assistant request refused. Review pairing, connection preferences and source state.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
});
