import { tools as assistantTools } from "./assistantHttp";
import { runner as assistantLocalRunner } from "./assistantLocalHttp";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { events as assistantEvents } from "./assistantEventsHttp";
const http = httpRouter();
http.route({
  path: "/runner/assistant/v1",
  method: "POST",
  handler: assistantLocalRunner,
});
http.route({
  path: "/assistant-events",
  method: "POST",
  handler: assistantEvents,
});
http.route({
  path: "/assistant-tools",
  method: "POST",
  handler: assistantTools,
});
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const signature = req.headers.get("stripe-signature");
    if (!signature) return new Response("Missing signature", { status: 400 });
    const body = await req.text();
    if (body.length > 1000000)
      return new Response("Payload too large", { status: 413 });
    try {
      const result = await ctx.runAction(internal.payments.webhook, {
        body,
        signature,
      });
      return new Response(result.status === 200 ? "ok" : "Invalid webhook", {
        status: result.status,
      });
    } catch {
      return new Response("Retry later", { status: 500 });
    }
  }),
});
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(
    async () =>
      new Response(
        JSON.stringify({ status: "ok", service: "companynerve-starter" }),
        { headers: { "Content-Type": "application/json" } },
      ),
  ),
});
http.route({
  path: "/stripe/v1/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    if (body.length > 1000000)
      return new Response("Too large", { status: 413 });
    try {
      const result = await ctx.runAction(internal.reconciliation.stripeEvent, {
        body,
        signature: req.headers.get("stripe-signature") ?? "",
      });
      return new Response(result.status === 200 ? "ok" : "Invalid webhook", {
        status: result.status,
      });
    } catch {
      return new Response("Retry later", { status: 503 });
    }
  }),
});
http.route({
  path: "/github/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    if (body.length > 1000000)
      return new Response("Too large", { status: 413 });
    const result = await ctx.runAction(internal.githubEvents.webhook, {
      body,
      signature: req.headers.get("x-hub-signature-256") ?? "",
      delivery: req.headers.get("x-github-delivery") ?? "",
    });
    return new Response(result.status === 200 ? "ok" : "Invalid webhook", {
      status: result.status,
    });
  }),
});
http.route({
  path: "/resend/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { resend } = await import("./email");
    return resend.handleResendEventWebhook(ctx, req);
  }),
});
http.route({
  path: "/runner/v1",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const token = req.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    if (!token) return reply({ error: "Invalid device credential." }, 401);
    if (Number(req.headers.get("content-length") ?? 0) > 1000000)
      return reply({ error: "Payload too large." }, 413);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 1000000)
      return reply({ error: "Payload too large." }, 413);
    try {
      const body = JSON.parse(raw);
      if (
        body.protocolVersion !== "1.0.0" ||
        !body.args ||
        typeof body.args !== "object"
      )
        return reply({ error: "Unsupported protocol." }, 400);
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      );
      const credentialHash = Array.from(new Uint8Array(hash), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const result =
        body.operation === "complete"
          ? await ctx.runAction(internal.localResults.accept, {
              ...body.args,
              credentialHash,
            })
          : await ctx.runMutation(internal.runnerProtocol.dispatch, {
              ...body.args,
              credentialHash,
              operation: body.operation,
            });
      return reply(result);
    } catch {
      return reply(
        {
          error:
            "Device request rejected. Reconcile its lease before resuming.",
        },
        403,
      );
    }
  }),
});
http.route({
  path: "/runner/personal/v1",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    const token = req.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) return reply({ error: "Invalid device credential." }, 401);
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "Missing body." }, 400);
    try {
      let size = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > 512 * 1024) {
          await reader.cancel();
          return reply({ error: "Payload too large." }, 413);
        }
        chunks.push(item.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const body = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      if (
        body.protocolVersion !== "1.0.0" ||
        typeof body.operation !== "string" ||
        !body.args ||
        typeof body.args !== "object" ||
        Array.isArray(body.args) ||
        Object.keys(body).some(
          (k) => !["protocolVersion", "operation", "args"].includes(k),
        )
      )
        return reply({ error: "Unsupported protocol." }, 400);
      if (
        size > 150000 &&
        !(
          body.operation === "complete" &&
          body.args.orderedEvidence !== undefined
        )
      )
        return reply({ error: "Payload too large." }, 413);
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      );
      const credentialHash = Array.from(new Uint8Array(hash), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const result = await ctx.runMutation(internal.personalAnalysis.dispatch, {
        ...body.args,
        credentialHash,
        operation: body.operation,
      });
      if (result.job?.media)
        result.job.media =
          "inputKind" in result.job &&
          result.job.inputKind === "ordered-personal-v1"
            ? await ctx.runAction(internal.personalOrderedMedia.lease, {
                credentialHash,
                id: result.job.id,
                generation: result.job.generation,
                claimToken: result.job.claimToken!,
              })
            : await ctx.runAction(internal.personalMedia.lease, {
                credentialHash,
                id: result.job.id,
                generation: result.job.generation,
              });
      return reply(result);
    } catch {
      return reply(
        {
          error:
            "Personal device request rejected. Stop the current request before reconciling.",
        },
        403,
      );
    } finally {
      reader.releaseLock();
    }
  }),
});
export default http;
