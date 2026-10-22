import {
  assertSubscriptionInput,
  assertReportedAllowance,
} from "./subscription-capabilities.mjs";

export function assertLocalDockerEndpoint(endpoint, override) {
  const allowed = [
    "npipe:////./pipe/dockerdesktoplinuxengine",
    "npipe:////./pipe/docker_engine",
  ];
  if (
    !allowed.includes(endpoint?.trim().toLowerCase()) ||
    (override && !allowed.includes(override.toLowerCase()))
  )
    throw Error("ASSISTANT_LOCAL_DOCKER_REQUIRED");
}

export function controllerAnnouncement() {
  let pending = "",
    worker;
  return {
    push(chunk) {
      pending += chunk.toString("utf8");
      if (Buffer.byteLength(pending) > 16000)
        throw Error("ASSISTANT_CONTROLLER_OUTPUT_LIMIT");
      for (;;) {
        const end = pending.indexOf("\n");
        if (end < 0) break;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        let value;
        try {
          value = JSON.parse(line);
        } catch {
          continue;
        }
        if (value?.status !== "own_account_connected") continue;
        if (
          !/^vibe-trial-[a-f0-9-]+-codex$/.test(value.worker ?? "") ||
          value.connectionSaved !== true ||
          (worker && worker !== value.worker)
        )
          throw Error("ASSISTANT_CONTROLLER_CHANGED");
        worker = value.worker;
      }
    },
    accepts(session, startedAt, now = Date.now()) {
      return (
        !!worker &&
        session?.worker === worker &&
        session.connectionSaved === true &&
        session.purpose === "personal_library" &&
        /^[a-f0-9]{64}$/.test(session.profileBinding ?? "") &&
        Number.isSafeInteger(session.startedAt) &&
        session.startedAt >= startedAt &&
        Number.isSafeInteger(session.expiresAt) &&
        session.expiresAt > now &&
        session.expiresAt <= startedAt + 4 * 3600000 + 30000
      );
    },
  };
}

export function createRunnerRequest({
  server,
  credential,
  route,
  signal,
  fetchImpl = fetch,
}) {
  const base = new URL(server);
  if (
    !["personal", "assistant"].includes(route) ||
    base.protocol !== "https:" ||
    !/^[a-z0-9-]+\.convex\.site$/.test(base.hostname) ||
    base.port ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    !/^[A-Za-z0-9_-]{43}$/.test(credential ?? "")
  )
    throw Error("ASSISTANT_CONFIG_INVALID");
  const endpoint = new URL(`/runner/${route}/v1`, base);
  return async (operation, args = {}) => {
    signal.throwIfAborted();
    const body = JSON.stringify({ protocolVersion: "1.0.0", operation, args });
    if (Buffer.byteLength(body) > (route === "personal" ? 150000 : 1000000))
      throw Error("ASSISTANT_REQUEST_LIMIT");
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential}`,
      },
      redirect: "error",
      cache: "no-store",
      body,
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(
          route === "personal"
            ? 20000
            : operation === "evaluation"
              ? 90000
              : 30000,
        ),
      ]),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json") ||
      !response.body
    ) {
      const error = Error("ASSISTANT_REQUEST_REFUSED");
      error.responseStatus = response.status;
      await response.body?.cancel().catch(() => {});
      throw error;
    }
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > 1000000)
    ) {
      await response.body.cancel();
      throw Error("ASSISTANT_RESPONSE_LIMIT");
    }
    const reader = response.body.getReader(),
      chunks = [];
    let size = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > 1000000) throw Error("ASSISTANT_RESPONSE_LIMIT");
        chunks.push(Buffer.from(item.value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
}

export function createSubscriptionCoordinator({
  official,
  personal,
  requestPersonal,
  requestAssistant,
  processPersonal,
  processAssistant,
  config,
  signal,
  now = Date.now,
  onStatus = () => {},
}) {
  let active = false,
    halted = false,
    next = 0,
    announcedAt = null,
    enabled = { personal: false, assistant: false };
  const attempted = new Set();
  async function check() {
    signal.throwIfAborted();
    await official.check();
    signal.throwIfAborted();
  }
  async function announce() {
    const capabilities = await official.capabilities();
    signal.throwIfAborted();
    const models = capabilities.models
      .filter((model) =>
        model.reasoningEfforts.some((e) =>
          ["low", "medium", "high"].includes(e),
        ),
      )
      .map(({ slug, displayName }) => ({ slug, displayName }));
    const assistant = capabilities.models.some(
      (m) => m.slug === "gpt-6.1-sol" && m.reasoningEfforts.includes("medium"),
    );
    enabled = { personal: false, assistant: false };
    for (const route of ["personal", "assistant"]) {
      if (route === "personal" ? !models.length : !assistant) continue;
      try {
        const hello = await (
          route === "personal" ? requestPersonal : requestAssistant
        )(
          "hello",
          route === "personal"
            ? { models, profileBinding: official.session.profileBinding }
            : {
                model: "gpt-6.1-sol",
                profileBinding: official.session.profileBinding,
                expiresAt: official.session.expiresAt,
              },
        );
        signal.throwIfAborted();
        if (hello?.workspaceId !== config.workspaceId)
          throw Error("ASSISTANT_WORKSPACE_CHANGED");
        enabled[route] = true;
      } catch (error) {
        // A team member can use personal jobs without the assistant's owner/admin grant.
        if (![401, 403].includes(error?.responseStatus)) throw error;
        onStatus({ route, state: "unavailable" });
      }
    }
    announcedAt = now();
  }
  return {
    async step() {
      if (active) throw Error("ASSISTANT_COORDINATOR_BUSY");
      if (halted) throw Error("ASSISTANT_COORDINATOR_HALTED");
      active = true;
      try {
        signal.throwIfAborted();
        if (now() >= official.session.expiresAt - 60000)
          return { rotate: true, worked: false, delayMs: 0 };
        await check();
        if (announcedAt === null || now() - announcedAt >= 240000)
          await announce();
        const order =
          next === 0 ? ["personal", "assistant"] : ["assistant", "personal"];
        for (const route of order) {
          if (!enabled[route]) continue;
          signal.throwIfAborted();
          const request =
            route === "personal" ? requestPersonal : requestAssistant;
          const response = await request(
            route === "personal" ? "poll" : "claim",
          );
          signal.throwIfAborted();
          next = route === "personal" ? 1 : 0;
          if (response.rotate)
            return { rotate: true, worked: false, delayMs: 0 };
          if (response.reconcile) {
            if (route !== "personal" || response.job)
              throw Error("ASSISTANT_JOB_INVALID");
            await request("fail", {
              id: response.reconcile.id,
              ...(response.reconcile.generation === null
                ? {}
                : { generation: response.reconcile.generation }),
            });
            return { worked: true, route, delayMs: 1000 };
          }
          const job = response.job;
          if (!job) continue;
          if (
            route === "personal"
              ? typeof job.id !== "string" ||
                !job.id.length ||
                job.id.length > 100 ||
                !Number.isSafeInteger(job.generation) ||
                job.generation < 1
              : typeof job.runId !== "string" ||
                !job.runId.length ||
                job.runId.length > 100
          )
            throw Error("ASSISTANT_JOB_INVALID");
          const identity =
            route === "personal" ? `${job.id}:${job.generation}` : job.runId;
          if (!identity || attempted.has(`${route}:${identity}`))
            throw Error("ASSISTANT_DUPLICATE_CLAIM");
          attempted.add(`${route}:${identity}`);
          try {
            if (job.profileBinding !== official.session.profileBinding)
              throw Error("ASSISTANT_LOCAL_JOB_CHANGED");
            const capabilities = await official.capabilities();
            const model = route === "personal" ? job.model : "gpt-6.1-sol",
              effort = route === "personal" ? job.effort : "medium";
            assertSubscriptionInput(capabilities, model, effort, {}, []);
            if (
              (route === "personal"
                ? job.media?.frames?.length
                : job.extract) &&
              !capabilities.models
                .find((m) => m.slug === model)
                ?.inputModalities.includes("image")
            )
              throw Error("ASSISTANT_LOCAL_MODALITY_UNAVAILABLE");
            assertReportedAllowance(
              await official.server.request("account/rateLimits/read"),
            );
            signal.throwIfAborted();
            if (route === "personal")
              await processPersonal(job, {
                client: personal,
                request,
                signal,
                asr: config.localAsr,
              });
            else
              await processAssistant(job, {
                client: official,
                request,
                config,
                signal,
              });
            signal.throwIfAborted();
            onStatus({ route, state: "completed" });
          } catch (error) {
            const mediaStatus = [
              "needs_auth",
              "rate_limited",
              "unavailable",
              "unsupported",
              "over_limit",
              "failed",
            ].includes(error?.mediaStatus)
              ? error.mediaStatus
              : undefined;
            await request(
              "fail",
              route === "personal"
                ? { id: job.id, generation: job.generation }
                : { runId: job.runId, ...(mediaStatus ? { mediaStatus } : {}) },
            ).catch(() => {});
            onStatus({
              route,
              state: "failed",
              ...(mediaStatus ? { mediaStatus } : {}),
            });
            // A successful application acknowledgement does not prove that an
            // official turn with a lost start response stopped. Never begin
            // another job before this worker tears down its own controller.
            throw error;
          }
          signal.throwIfAborted();
          return { worked: true, route, delayMs: 1000 };
        }
        return { worked: false, delayMs: 30000 };
      } catch (error) {
        halted = true;
        throw error;
      } finally {
        active = false;
      }
    },
  };
}
