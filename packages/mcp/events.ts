import { z } from "zod";
import { createHash } from "node:crypto";
import type { EventPrincipal } from "./credentials";
import { webhookUrl } from "./webhook";
export const eventArguments = z
  .object({
    profileId: z.string().min(1).max(100),
    sourceId: z.string().min(1).max(100),
    generation: z.number().int().nonnegative(),
    grantVersion: z.number().int().positive(),
  })
  .strict();
export const profileEventArguments = z
  .object({
    profileId: z.string().min(1).max(100),
    grantVersion: z.number().int().positive(),
  })
  .strict();
export const profileEventName = z.enum([
  "work_cloud_waiting",
  "work_cloud_connection_verified",
]);
export type EventName = "analysis_completed" | z.infer<typeof profileEventName>;
const delivery = z
  .object({ mode: z.literal("webhook"), url: z.string().url().max(4096) })
  .strict();
const sourceSubscribe = z
  .object({
    name: z.literal("analysis_completed"),
    arguments: eventArguments,
    delivery: delivery.extend({ secret: z.string().min(6).max(100) }).strict(),
    cursor: z.null().optional(),
    ttlMs: z.number().int().min(30000).max(86400000).nullable().optional(),
  })
  .strict();
const sourceUnsubscribe = z
  .object({
    name: z.literal("analysis_completed"),
    arguments: eventArguments,
    delivery,
  })
  .strict();
export const eventSubscribe = z.discriminatedUnion("name", [
  sourceSubscribe,
  sourceSubscribe.extend({
    name: profileEventName,
    arguments: profileEventArguments,
  }),
]);
export const eventUnsubscribe = z.discriminatedUnion("name", [
  sourceUnsubscribe,
  sourceUnsubscribe.extend({
    name: profileEventName,
    arguments: profileEventArguments,
  }),
]);
export function eventSubscriptionId(
  principal: EventPrincipal,
  callback: string,
  args: z.infer<typeof eventArguments> | z.infer<typeof profileEventArguments>,
  name: EventName = "analysis_completed",
) {
  if (name === "analysis_completed") eventArguments.parse(args);
  else profileEventArguments.parse(args);
  return (
    "sub_" +
    createHash("sha256")
      .update(
        JSON.stringify([
          principal.subject,
          principal.clientId,
          principal.consentId,
          webhookUrl(callback).href,
          name,
          args.profileId,
          ...("sourceId" in args ? [args.sourceId, args.generation] : []),
          args.grantVersion,
        ]),
      )
      .digest("hex")
  );
}
export const completionEvent = {
  name: "analysis_completed",
  description:
    "The exact selected source generation became ready. Contains status and a protected review link only. Does not measure usefulness, start work or grant content retrieval. Events missed outside the finite subscription are not replayed.",
  delivery: ["webhook"],
  inputSchema: z.toJSONSchema(eventArguments),
  payloadSchema: z.toJSONSchema(
    z
      .object({
        sourceId: z.string(),
        profileId: z.string(),
        status: z.literal("ready"),
        evidenceChanged: z.boolean(),
        reviewUrl: z.string().url(),
      })
      .strict(),
  ),
};
export const waitingEvent = {
  name: "work_cloud_waiting",
  description:
    "An already explicitly approved, unclaimed Cloud job is waiting in this profile. Contains exact job identity and a protected link only. Does not approve work, replay older jobs, start a host or grant publication.",
  delivery: ["webhook"],
  inputSchema: z.toJSONSchema(profileEventArguments),
  payloadSchema: z.toJSONSchema(
    z
      .object({
        schemaVersion: z.literal("work-cloud-waiting-v1"),
        sourceId: z.string(),
        profileId: z.string(),
        generation: z.number().int().nonnegative(),
        grantVersion: z.number().int().positive(),
        approvedAt: z.number().int().nonnegative(),
        status: z.literal("waiting"),
        reviewUrl: z.string().url(),
      })
      .strict(),
  ),
};
export const connectionEvent = {
  name: "work_cloud_connection_verified",
  description:
    "One notification when this profile subscription is created after webhook verification. Confirms callback setup only; host execution remains unverified. Renewal does not repeat it. No source or job is created.",
  delivery: ["webhook"],
  inputSchema: z.toJSONSchema(profileEventArguments),
  payloadSchema: z.toJSONSchema(
    z
      .object({
        schemaVersion: z.literal("work-cloud-connection-v1"),
        profileId: z.string(),
        grantVersion: z.number().int().positive(),
        status: z.literal("webhook_verified"),
        hostExecutionVerified: z.literal(false),
      })
      .strict(),
  ),
};
