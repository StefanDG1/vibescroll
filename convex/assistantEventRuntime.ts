"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { randomBytes, randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  openEventCredentials,
  type EventCredentials,
  type EventPrincipal,
} from "../packages/mcp/credentials";
import {
  webhookUrl,
  webhookKey,
  webhookHeaders,
  sendWebhook,
  challengeMatches,
} from "../packages/mcp/webhook";
import {
  assistantIssuer,
  assistantResource,
} from "../packages/policy/assistant";
import {
  readAssistantBody,
  validateAssistantUserinfo,
} from "../packages/policy/assistant-http";
import { eventSubscriptionId } from "../packages/mcp/events";
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
async function providerCurrent(
  credentials: EventCredentials,
  principal: EventPrincipal,
  profileEvent = false,
) {
  const issuer = assistantIssuer(process.env.MCP_AUTH_ISSUER);
  if (!issuer) throw Error("EVENT_AUTHORIZATION_UNAVAILABLE");
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/oauth2/jwks`), {
      timeoutDuration: 5000,
      cacheMaxAge: 300000,
    });
    keySets.set(issuer, keys);
  }
  let verified;
  try {
    verified = await jwtVerify(credentials.token, keys, {
      issuer,
      audience: assistantResource,
      algorithms: ["RS256"],
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      ["ERR_JWKS_TIMEOUT", "ERR_JOSE_GENERIC"].includes(String(error.code))
    )
      throw Error("EVENT_PROVIDER_TRANSIENT");
    throw Error("EVENT_AUTHORIZATION_UNAVAILABLE");
  }
  const { payload } = verified;
  if (
    payload.aud !== assistantResource ||
    payload.sub !== principal.subject ||
    payload.client_id !== principal.clientId ||
    payload.sid !== principal.consentId ||
    typeof payload.scope !== "string" ||
    payload.scope.length > 2048 ||
    !payload.scope.split(" ").includes("events:subscribe") ||
    (profileEvent &&
      !["analysis:request", "analysis:execute"].every((scope) =>
        (payload.scope as string).split(" ").includes(scope),
      )) ||
    !Number.isSafeInteger(payload.exp) ||
    !Number.isSafeInteger(payload.iat) ||
    (payload.iat as number) < 0 ||
    (payload.iat as number) > Date.now() / 1000
  )
    throw Error("EVENT_AUTHORIZATION_UNAVAILABLE");
  const response = await fetch(`${issuer}/oauth2/userinfo`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${credentials.token}` },
  });
  if (response.status >= 500 || [408, 429].includes(response.status))
    throw Error("EVENT_PROVIDER_TRANSIENT");
  if (
    !response.ok ||
    !validateAssistantUserinfo(
      await readAssistantBody(response, 16384),
      principal.subject,
    )
  )
    throw Error("EVENT_AUTHORIZATION_UNAVAILABLE");
  return payload.exp! * 1000;
}
export const subscribe = internalAction({
  args: {
    eventName: v.optional(
      v.union(
        v.literal("analysis_completed"),
        v.literal("work_cloud_waiting"),
        v.literal("work_cloud_connection_verified"),
      ),
    ),
    profileId: v.id("organizations"),
    sourceId: v.optional(v.id("sources")),
    generation: v.optional(v.number()),
    grantVersion: v.number(),
    ciphertext: v.string(),
    keyVersion: v.string(),
    ttlMs: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { verified: false; reason: string }
    | {
        verified: true;
        result: {
          id: string;
          cursor: null;
          truncated: boolean;
          expiresAt: string;
          refreshBefore: string;
        };
      }
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (
      !identity ||
      typeof identity.client_id !== "string" ||
      typeof identity.sid !== "string"
    )
      throw Error("EVENT_AUTHORIZATION_UNAVAILABLE");
    const principal = {
      subject: identity.subject,
      clientId: identity.client_id,
      consentId: identity.sid,
    };
    const credentials = openEventCredentials(args, principal);
    if (
      args.eventName &&
      args.eventName !== "analysis_completed" &&
      (args.sourceId !== undefined || args.generation !== undefined)
    )
      throw Error("EVENT_ARGUMENTS_INVALID");
    const callback = webhookUrl(credentials.callback).href;
    webhookKey(credentials.secret).fill(0);
    const selected = {
      eventName: args.eventName,
      profileId: args.profileId,
      ...(args.eventName && args.eventName !== "analysis_completed"
        ? {}
        : {
            sourceId: args.sourceId!,
            generation: args.generation!,
          }),
      grantVersion: args.grantVersion,
    };
    const externalId = eventSubscriptionId(
      principal,
      callback,
      {
        profileId: selected.profileId,
        grantVersion: selected.grantVersion,
        ...("sourceId" in selected
          ? { sourceId: selected.sourceId!, generation: selected.generation! }
          : {}),
      },
      args.eventName,
    );
    const prepared = await ctx.runQuery(internal.assistantEvents.prepare, {
      ...selected,
      externalId,
    });
    const tokenExpiresAt = await providerCurrent(
      credentials,
      prepared.principal,
      !!args.eventName && args.eventName !== "analysis_completed",
    );
    const now = Date.now();
    const requested = args.ttlMs ?? 1800000;
    if (
      !Number.isSafeInteger(requested) ||
      requested < 30000 ||
      requested > 86400000
    )
      throw Error("EVENT_TTL_INVALID");
    const expiresAt = Math.min(
      now + requested,
      now + 1800000,
      tokenExpiresAt,
      prepared.grantExpiresAt ?? Infinity,
    );
    if (expiresAt - now < 30000)
      throw Error("EVENT_AUTHORIZATION_EXPIRES_SOON");
    let callbackVerifiedAt = Date.now();
    let cached = false;
    if (
      prepared.previous &&
      prepared.previous.callbackVerifiedAt > Date.now() - 300000
    ) {
      try {
        const previous = openEventCredentials(prepared.previous, principal);
        cached =
          previous.callback === callback &&
          previous.secret === credentials.secret;
        if (cached) callbackVerifiedAt = prepared.previous.callbackVerifiedAt;
      } catch {}
    }
    if (!cached) {
      const challenge = randomBytes(24).toString("base64url"),
        id = "verify_" + randomUUID(),
        body = JSON.stringify({ type: "verification", challenge });
      try {
        const receipt = await sendWebhook(
          callback,
          body,
          webhookHeaders(id, body, [credentials.secret], externalId),
        );
        if (
          receipt.status < 200 ||
          receipt.status >= 300 ||
          !challengeMatches(receipt.body, challenge)
        )
          return { verified: false as const, reason: "challenge_failed" };
      } catch (error) {
        return {
          verified: false as const,
          reason:
            error instanceof Error && error.message === "CALLBACK_TIMEOUT"
              ? "timeout"
              : "destination_denied_or_unreachable",
        };
      }
    }
    const result = await ctx.runMutation(internal.assistantEvents.install, {
      ...selected,
      externalId,
      ciphertext: args.ciphertext,
      keyVersion: args.keyVersion,
      expiresAt,
      callbackVerifiedAt,
    });
    return { verified: true as const, result };
  },
});
export const deliver = internalAction({
  args: { id: v.id("assistantDeliveries") },
  handler: async (ctx, { id }) => {
    const claimed = await ctx.runMutation(internal.assistantEvents.claim, {
      id,
    });
    if (!claimed) return;
    const { delivery: d, subscription: s, principal } = claimed;
    let outcome: "received" | "retry" | "stop" = "retry",
      status: number | undefined;
    try {
      const credentials = openEventCredentials(s, principal);
      await providerCurrent(
        credentials,
        principal,
        !!s.eventName && s.eventName !== "analysis_completed",
      );
      if (
        !(await ctx.runQuery(internal.assistantEvents.deliveryCurrent, {
          id,
          lease: d.lease,
        }))
      ) {
        outcome = "stop";
        return;
      }
      const secrets = [credentials.secret];
      if (
        s.previousCiphertext &&
        s.previousKeyVersion &&
        (s.previousSecretExpiresAt ?? 0) > Date.now()
      )
        secrets.push(
          openEventCredentials(
            {
              ciphertext: s.previousCiphertext,
              keyVersion: s.previousKeyVersion,
            },
            principal,
          ).secret,
        );
      const eventId = "evt_" + id;
      const body = JSON.stringify({
        eventId,
        name: d.eventName ?? "analysis_completed",
        timestamp: new Date(d.completedRevision).toISOString(),
        data:
          d.eventName === "work_cloud_connection_verified"
            ? {
                schemaVersion: "work-cloud-connection-v1",
                profileId: s.organizationId,
                grantVersion: s.grantVersion,
                status: "webhook_verified",
                hostExecutionVerified: false,
              }
            : d.eventName === "work_cloud_waiting"
              ? {
                  schemaVersion: "work-cloud-waiting-v1",
                  sourceId: d.sourceId,
                  profileId: s.organizationId,
                  generation: d.generation,
                  grantVersion: s.grantVersion,
                  approvedAt: d.completedRevision,
                  status: "waiting",
                  reviewUrl: `https://scroll.companynerve.com/app/${s.organizationId}/library/${d.sourceId}`,
                }
              : {
                  sourceId: d.sourceId,
                  profileId: s.organizationId,
                  status: "ready",
                  evidenceChanged:
                    d.completedRevision !==
                    ("revision" in s ? s.revision : undefined),
                  reviewUrl: `https://scroll.companynerve.com/app/${s.organizationId}/library/${d.sourceId}`,
                },
        cursor: null,
      });
      const receipt = await sendWebhook(
        credentials.callback,
        body,
        webhookHeaders(eventId, body, secrets, s.externalId),
        () =>
          ctx.runQuery(internal.assistantEvents.deliveryCurrent, {
            id,
            lease: d.lease,
          }),
        true,
      );
      status = receipt.status;
      outcome =
        status >= 200 && status < 300
          ? "received"
          : [410, 413].includes(status) ||
              (status >= 400 && status < 500 && ![408, 429].includes(status))
            ? "stop"
            : "retry";
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "EVENT_AUTHORIZATION_UNAVAILABLE",
          "EVENT_CREDENTIALS_UNAVAILABLE",
          "EVENT_KEY_UNAVAILABLE",
          "CALLBACK_AUTHORITY_CHANGED",
        ].includes(error.message)
      )
        outcome = "stop";
    } finally {
      await ctx.runMutation(internal.assistantEvents.finish, {
        id,
        lease: d.lease,
        outcome,
        status,
      });
    }
  },
});
