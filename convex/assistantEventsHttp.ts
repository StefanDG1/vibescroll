import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { z } from "zod";
import { assistantIssuer } from "../packages/policy/assistant";
import {
  readAssistantBody,
  validateAssistantUserinfo,
} from "../packages/policy/assistant-http";
const inputSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("events/list"),
      args: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("events/unsubscribe"),
      args: z
        .object({ subscriptionId: z.string().regex(/^sub_[a-f0-9]{64}$/) })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("events/subscribe"),
      args: z
        .object({
          eventName: z
            .enum([
              "analysis_completed",
              "work_cloud_waiting",
              "work_cloud_connection_verified",
              "video_link_saved",
            ])
            .optional(),
          profileId: z.string().min(1).max(100),
          sourceId: z.string().min(1).max(100).optional(),
          generation: z.number().int().nonnegative().optional(),
          grantVersion: z.number().int().positive(),
          ciphertext: z.string().min(1).max(30000),
          keyVersion: z.string().regex(/^[1-9][0-9]{0,2}$/),
          ttlMs: z
            .number()
            .int()
            .min(30000)
            .max(86400000)
            .nullable()
            .optional(),
        })
        .strict()
        .refine(
          (a) =>
            a.eventName && a.eventName !== "analysis_completed"
              ? a.sourceId === undefined && a.generation === undefined
              : a.sourceId !== undefined && a.generation !== undefined,
          "Use exact event arguments.",
        ),
    })
    .strict(),
]);
export const events = httpAction(async (ctx, request) => {
  const deny = (status = 403) =>
    Response.json(
      { error: "Review current Events authorization in Connections." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  try {
    if (
      process.env.MCP_ENABLED !== "true" ||
      process.env.MCP_EVENTS_ENABLED !== "true" ||
      process.env.RESTORE_LOCK === "true"
    )
      return deny(401);
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9._~-]{20,16384})$/)?.[1];
    if (!bearer) return deny(401);
    const input = inputSchema.parse(await readAssistantBody(request, 32768));
    const expected = await ctx.runMutation(internal.assistant.throttle, {});
    const issuer = assistantIssuer(process.env.MCP_AUTH_ISSUER);
    if (!issuer || issuer !== expected.issuer) return deny(401);
    if (input.operation !== "events/subscribe") {
      const info = await fetch(`${issuer}/oauth2/userinfo`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (
        !info.ok ||
        !validateAssistantUserinfo(
          await readAssistantBody(info, 16384),
          expected.subject,
        )
      )
        return deny(401);
    }
    let value: unknown;
    if (input.operation === "events/subscribe") {
      const result = await ctx.runAction(
        internal.assistantEventRuntime.subscribe,
        {
          ...input.args,
          profileId: input.args.profileId as Id<"organizations">,
          sourceId: input.args.sourceId as Id<"sources"> | undefined,
        },
      );
      value = result.verified ? result.result : result;
    } else if (input.operation === "events/unsubscribe")
      value = await ctx.runMutation(
        internal.assistantEvents.unsubscribe,
        input.args,
      );
    else value = await ctx.runQuery(internal.assistantEvents.catalog, {});
    return Response.json(value, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return deny();
  }
});
