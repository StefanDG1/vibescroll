import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  assistantClients,
  assistantIssuer,
  assistantResource,
} from "../../../../packages/policy/assistant";
import {
  assistantRequestAllowed,
  readAssistantBody,
} from "../../../../packages/policy/assistant-http";
import { sealEventCredentials } from "../../../../packages/mcp/credentials";
import {
  eventSubscribe,
  eventUnsubscribe,
  eventSubscriptionId,
} from "../../../../packages/mcp/events";
import { createKnowledgeHandler } from "../../../../packages/mcp/server";
import { cloudCompletionEnvelope } from "../../../../packages/contracts/work-cloud-text";
export const runtime = "nodejs";
export const maxDuration = 30;
const metadata =
  "https://scroll.companynerve.com/.well-known/oauth-protected-resource/mcp";
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function challenge() {
  return Response.json(
    { error: "Official OAuth authorization is required." },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="knowledge:read"`,
      },
    },
  );
}
export async function POST(request: Request) {
  if (!assistantRequestAllowed(request))
    return Response.json(
      { error: "Untrusted MCP request origin or host." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  const issuer = assistantIssuer(process.env.MCP_AUTH_ISSUER);
  if (process.env.MCP_ENABLED !== "true" || !issuer)
    return Response.json(
      { error: "VibeScroll assistant access is being prepared." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  let phase: "authentication" | "request" | "configuration" | "dispatch" =
    "authentication";
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9._~-]{20,16384})$/)?.[1];
    if (!token) return challenge();
    let keys = keySets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${issuer}/oauth2/jwks`), {
        timeoutDuration: 5000,
        cacheMaxAge: 300000,
      });
      keySets.set(issuer, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: assistantResource,
      algorithms: ["RS256"],
    });
    const client = assistantClients().find((c) => c.id === payload.client_id);
    if (
      payload.aud !== assistantResource ||
      !client ||
      typeof payload.sub !== "string" ||
      !/^user_[a-zA-Z0-9]{20,80}$/.test(payload.sub) ||
      typeof payload.sid !== "string" ||
      !/^app_consent_[a-zA-Z0-9]{20,80}$/.test(payload.sid) ||
      typeof payload.scope !== "string" ||
      payload.scope.length > 2048 ||
      typeof payload.exp !== "number" ||
      !Number.isSafeInteger(payload.exp) ||
      typeof payload.iat !== "number" ||
      !Number.isSafeInteger(payload.iat) ||
      payload.iat < 0 ||
      payload.iat > Date.now() / 1000
    )
      return challenge();
    phase = "request";
    const parsedBody = await readAssistantBody(request, 262144, (value) =>
      cloudCompletionEnvelope(value, true) ? 262144 : 32768,
    );
    if (parsedBody?.method === "subscriptions/listen")
      return Response.json(
        {
          jsonrpc: "2.0",
          id: parsedBody.id ?? null,
          error: {
            code: -32601,
            message: "Persistent Events delivery is not enabled.",
          },
        },
        { status: 501, headers: { "Cache-Control": "no-store" } },
      );
    phase = "configuration";
    const backend = new URL(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");
    if (
      backend.protocol !== "https:" ||
      !/^([a-z0-9-]+)\.convex\.cloud$/.test(backend.hostname) ||
      backend.username ||
      backend.password ||
      backend.port ||
      backend.search ||
      backend.hash ||
      backend.pathname !== "/"
    )
      throw Error();
    const site = `https://${backend.hostname.replace(/\.cloud$/, ".site")}/assistant-tools`;
    phase = "dispatch";
    const handler = createKnowledgeHandler(
      async (operation, args) => {
        let target = site;
        let input = args;
        if (operation.startsWith("events/")) {
          target = site.replace("/assistant-tools", "/assistant-events");
          const principal = {
            subject: payload.sub!,
            clientId: client.id,
            consentId: payload.sid as string,
          };
          if (operation === "events/subscribe") {
            const selected = eventSubscribe.parse(args);
            input = {
              ...selected.arguments,
              ...sealEventCredentials(
                {
                  token,
                  callback: selected.delivery.url,
                  secret: selected.delivery.secret,
                },
                principal,
              ),
              ttlMs: selected.ttlMs,
            };
          } else if (operation === "events/unsubscribe") {
            const selected = eventUnsubscribe.parse(args);
            input = {
              subscriptionId: eventSubscriptionId(
                principal,
                selected.delivery.url,
                selected.arguments,
              ),
            };
          }
        }
        const response = await fetch(target, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ operation, args: input }),
        });
        const value = await readAssistantBody(
          response,
          operation === "work_cloud_input" ? 262144 : 100000,
        );
        return { ok: response.ok, status: response.status, value };
      },
      process.env.MCP_EVENTS_ENABLED === "true",
      process.env.WORK_CLOUD_TEXT_ENABLED === "true" &&
        process.env.WORK_CLOUD_TEXT_VERIFIED === "true",
      process.env.WORK_CLOUD_MEDIA_ENABLED === "true" &&
        process.env.WORK_CLOUD_MEDIA_VERIFIED === "true",
    );
    const input = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(parsedBody),
      signal: request.signal,
    });
    const response = await handler.fetch(input, {
      parsedBody,
      authInfo: {
        token,
        clientId: client.id,
        scopes: payload.scope.split(" ").filter(Boolean),
        expiresAt: payload.exp,
        resource: new URL(assistantResource),
        resourceMetadataUrl: metadata,
      },
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    if (phase === "authentication") return challenge();
    return Response.json(
      {
        error:
          phase === "request"
            ? "Use a bounded JSON MCP request."
            : "Assistant access is temporarily unavailable. Retry later or review Connections in VibeScroll.",
      },
      {
        status: phase === "request" ? 400 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
export async function GET() {
  return Response.json(
    {
      error:
        "Use stateless MCP POST. Persistent Events acceptance is separate.",
    },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}
export const DELETE = GET;
