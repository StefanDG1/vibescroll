import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { companionPrivatePath } from "../companion/config-root.mjs";
import { createHash } from "node:crypto";
import { AppServer } from "./app-server.mjs";
import { subscriptionConfig } from "./subscription-trial.mjs";
import { prepareLocalUrl, docker } from "./assistant-runtime.mjs";
import { transcribeNormalizedAudio } from "./local-asr.mjs";
export { localWhisperPath } from "./local-asr.mjs";
import { canonicalJson } from "../contracts/canonical-json.mjs";
import insightSchema from "../../contracts/insight.schema.json" with { type: "json" };
import { evaluationJson } from "../knowledge/contracts.ts";
import {
  structuredThreadParams,
  structuredTurnParams,
  sourceStructuredBytes,
} from "./local-task-runtime.mjs";
export { strictSchema } from "./local-task-runtime.mjs";
import {
  readSubscriptionCapabilities,
  assertSubscriptionInput,
  subscriptionInputLimits,
  assertReportedAllowance,
} from "./subscription-capabilities.mjs";
export const hash = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || value instanceof Uint8Array
        ? value
        : canonicalJson(value),
    )
    .digest("hex");
export const idleDelay = (empty) =>
  Math.min(300000, 30000 * 2 ** Math.min(empty, 4));

export class OfficialAssistantClient {
  constructor(session, server) {
    this.session = session;
    this.server = server;
  }
  static async connect(session) {
    if (
      !/^sha256:[a-f0-9]{64}$/.test(session.image ?? "") ||
      session.purpose !== "personal_library" ||
      session.expiresAt <= Date.now() ||
      !/^vibe-trial-[a-f0-9-]+-codex$/.test(session.worker ?? "") ||
      !/^[a-f0-9]{64}$/.test(session.profileBinding ?? "")
    )
      throw Error("ASSISTANT_LOCAL_SESSION_REQUIRED");
    const [worker] = JSON.parse(await docker(["inspect", session.worker]));
    if (
      !worker?.State?.Running ||
      worker.Image !== session.image ||
      worker.HostConfig.NetworkMode !== "none" ||
      !worker.HostConfig.ReadonlyRootfs ||
      !worker.HostConfig.CapDrop?.includes("ALL") ||
      !worker.HostConfig.SecurityOpt?.some((v) =>
        v.startsWith("no-new-privileges"),
      ) ||
      worker.Mounts.some(
        (m) =>
          m.Type === "bind" ||
          (m.Type === "volume" &&
            (m.Destination !== "/run" || m.Name !== session.socket)),
      )
    )
      throw Error("ASSISTANT_LOCAL_ISOLATION_REQUIRED");
    const server = new AppServer("docker", [
      "exec",
      "-i",
      session.worker,
      "codex",
      "app-server",
      "--listen",
      "stdio://",
      ...subscriptionConfig.flatMap((c) => ["-c", c]),
    ]);
    server.onEvent((m) => {
      if (m.id !== undefined) server.deny(m);
    });
    try {
      await server.request("initialize", {
        clientInfo: { name: "vibescroller_runner", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      server.send({ method: "initialized", params: {} });
      const client = new OfficialAssistantClient(session, server);
      await client.check();
      const capabilities = await client.capabilities();
      if (!capabilities.models.length)
        throw Error("ASSISTANT_LOCAL_MODEL_UNAVAILABLE");
      return client;
    } catch (error) {
      server.close();
      throw error;
    }
  }
  async check() {
    if (this.session.expiresAt <= Date.now())
      throw Error("ASSISTANT_LOCAL_SESSION_EXPIRED");
    const account = await this.server.account();
    if (
      account.account?.type !== "chatgpt" ||
      hash(account.account.email ?? "") !== this.session.profileBinding
    )
      throw Error("ASSISTANT_LOCAL_ACCOUNT_CHANGED");
  }
  async capabilities() {
    await this.check();
    const capabilities = await readSubscriptionCapabilities(this.server);
    await this.check();
    return capabilities;
  }
  async structured(schema, input, frames = [], options = {}) {
    const model = options.model ?? "gpt-6.1-sol",
      effort = options.effort ?? "medium";
    const sourceText =
      input?.schemaVersion === "private-source-reanalysis-text-v1";
    if (
      sourceText &&
      (frames.length !== 0 ||
        sourceStructuredBytes(schema, input, model, effort) > 120000)
    )
      throw Error("ASSISTANT_SOURCE_INPUT_LIMIT");
    options.signal?.throwIfAborted();
    const capabilities = await this.capabilities();
    assertSubscriptionInput(capabilities, model, effort, input, frames);
    options.signal?.throwIfAborted();
    const thread = await this.server.request(
      "thread/start",
      structuredThreadParams(model),
    );
    if (
      sourceText &&
      (typeof thread.thread?.id !== "string" ||
        Buffer.byteLength(JSON.stringify(thread.thread.id)) > 102)
    )
      throw Error("ASSISTANT_SOURCE_THREAD_INVALID");
    if (thread.model !== model) throw Error("ASSISTANT_LOCAL_MODEL_CHANGED");
    let text = "",
      turnId,
      resolveDone,
      rejectDone;
    const done = new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    void done.catch(() => {});
    const canceled = () => rejectDone(Error("ASSISTANT_LOCAL_CANCELED"));
    options.signal?.addEventListener("abort", canceled, { once: true });
    const off = this.server.onEvent((m) => {
      if (m.params?.threadId && m.params.threadId !== thread.thread.id) return;
      if (
        m.method === "connection/closed" ||
        m.method === "model/rerouted" ||
        (m.method === "item/started" &&
          !["agentMessage", "reasoning", "userMessage"].includes(
            m.params?.item?.type,
          ))
      )
        rejectDone(Error("ASSISTANT_LOCAL_UNEXPECTED_ACTION"));
      if (
        m.method === "item/completed" &&
        m.params?.item?.type === "agentMessage"
      )
        text = m.params.item.text;
      if (m.method === "turn/completed") {
        if (m.params.turn.status === "completed") resolveDone();
        else rejectDone(Error("ASSISTANT_LOCAL_TURN_FAILED"));
      }
    });
    const timer = setTimeout(
      () => rejectDone(Error("ASSISTANT_LOCAL_DEADLINE")),
      Math.min(300000, this.session.expiresAt - Date.now()),
    );
    try {
      options.signal?.throwIfAborted();
      const limits = await this.server.request("account/rateLimits/read");
      assertReportedAllowance(limits);
      options.signal?.throwIfAborted();
      const turn = await this.server.request(
        "turn/start",
        structuredTurnParams(
          thread.thread.id,
          model,
          effort,
          schema,
          input,
          frames,
        ),
      );
      turnId = turn.turn.id;
      await done;
      options.signal?.throwIfAborted();
      if (
        typeof text !== "string" ||
        Buffer.byteLength(text) > subscriptionInputLimits.maxOutputBytes
      )
        throw Error("ASSISTANT_LOCAL_OUTPUT_LIMIT");
      await this.check();
      options.signal?.throwIfAborted();
      return {
        output: JSON.parse(text),
        inputHash: hash(input),
        outputHash: hash(JSON.parse(text)),
      };
    } catch (error) {
      if (turnId)
        await this.server.interrupt(thread.thread.id, turnId).catch(() => {});
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", canceled);
      off();
    }
  }
  close() {
    this.server.close();
  }
}

export async function processAssistantJob(
  job,
  {
    client,
    request: dispatch,
    config,
    prepare = prepareLocalUrl,
    transcribe = transcribeNormalizedAudio,
    signal,
  },
) {
  if (
    job.profileBinding !== client.session.profileBinding ||
    !Number.isFinite(job.expiresAt) ||
    job.expiresAt <= Date.now()
  )
    throw Error("ASSISTANT_LOCAL_JOB_CHANGED");
  const deadline = Math.min(
    job.expiresAt,
    client.session.expiresAt ?? job.expiresAt,
  );
  const active = AbortSignal.any([
    AbortSignal.timeout(
      Math.max(0, Math.min(2147483647, deadline - Date.now())),
    ),
    ...(signal ? [signal] : []),
  ]);
  const request = async (...args) => {
    active.throwIfAborted();
    const result = await dispatch(...args);
    active.throwIfAborted();
    return result;
  };
  active.throwIfAborted();
  const base = { runId: job.runId };
  if (job.extract) {
    const prepared = await prepare({
      url: job.url,
      sourceId: job.sourceId,
      image: config.mediaImage,
      signal: active,
      privateRoot: join(
        dirname(companionPrivatePath("subscription-session.json")),
        "subscription-prepared",
      ),
    });
    active.throwIfAborted();
    if (prepared.status !== "prepared") {
      const error = new Error("ASSISTANT_LOCAL_MEDIA_UNAVAILABLE");
      error.mediaStatus = prepared.status;
      throw error;
    }
    const receipt = JSON.parse(
      await readFile(join(prepared.directory, "receipt.json"), "utf8"),
    );
    const acquisition = JSON.parse(
      await readFile(join(prepared.directory, "acquisition.json"), "utf8"),
    );
    const manifest = receipt.manifest;
    const transcript = manifest.audio
      ? await transcribe(
          await readFile(join(prepared.directory, manifest.audio)),
          { ...config.localAsr, signal: active },
        )
      : {
          durationMs: Math.ceil(manifest.durationSeconds * 1000),
          segments: [],
        };
    const frames = [];
    let totalBytes = 0;
    for (const frame of manifest.frames) {
      active.throwIfAborted();
      const bytes = await readFile(join(prepared.directory, frame.id));
      const asset = receipt.assets.find((a) => a.name === frame.id);
      totalBytes += bytes.length;
      if (
        !asset ||
        bytes.length > 600000 ||
        totalBytes > 12000000 ||
        bytes.length !== asset.bytes ||
        hash(bytes) !== asset.sha256
      )
        throw Error("ASSISTANT_LOCAL_FRAME_CHANGED");
      frames.push({
        ...frame,
        size: bytes.length,
        sha256: asset.sha256,
        data: bytes.toString("base64"),
      });
    }
    const id = await request("source_prepare", {
      ...base,
      sourceId: job.sourceId,
      generation: job.generation,
      revision: job.revision,
      inputHash: job.inputHash,
      transcript,
      acquisition,
      frames: frames.map(({ id, timestampMs, sha256, size }) => ({
        id,
        timestampMs,
        sha256,
        size,
      })),
    });
    for (const frame of frames)
      await request("frame", { id, frameId: frame.id, data: frame.data });
    const coverage = frames.length
      ? transcript.segments.length
        ? "full_sampled"
        : "visual_only"
      : "audio_only";
    const evidence = [
      ...transcript.segments.map((s) => ({
        kind: "transcript",
        id: `segment-${s.index}`,
        startMs: s.startMs,
        endMs: s.endMs,
      })),
      ...frames.map((f) => ({
        kind: "frame",
        id: f.id,
        startMs: f.timestampMs,
        endMs: f.timestampMs,
      })),
      ...(acquisition.description
        ? [{ kind: "caption", id: "post_caption", startMs: null, endMs: null }]
        : []),
    ];
    const schema = structuredClone(insightSchema);
    schema.properties.sourceId = { type: "string", enum: [job.sourceId] };
    schema.properties.processingRunId = {
      type: "string",
      enum: [`${job.sourceId}:${job.generation}`],
    };
    schema.properties.coverage = { type: "string", enum: [coverage] };
    const result = await client.structured(
      schema,
      {
        sourceId: job.sourceId,
        processingRunId: `${job.sourceId}:${job.generation}`,
        schemaVersion: "1.0.0",
        coverage,
        transcript,
        caption: acquisition.description ?? "",
        evidence,
      },
      frames.map((f) => `data:image/jpeg;base64,${f.data}`),
      { signal: active },
    );
    await request("source_finish", {
      id,
      output: result.output,
      receipt: {
        state: "completed",
        model: "gpt-6.1-sol",
        effort: "medium",
        appCredits: 0,
        separateApiCall: false,
        inputHash: result.inputHash,
        outputHash: result.outputHash,
      },
    });
  }
  const evaluations = [];
  if (job.repositories.length) {
    const work = await request("project_work", base);
    if (!work.topicId || !work.members.length)
      return request("done", { ...base, evaluations: [], noEvidence: true });
    for (const repositoryId of work.repositories) {
      const bundle = await request("evaluation", {
        ...base,
        topicId: work.topicId,
        members: work.members,
        repositoryId,
      });
      if (!bundle.cached) {
        const result = await client.structured(
          evaluationJson,
          {
            ...bundle,
            instruction:
              "Evaluate this source's supplied ideas for the selected project. Use exact supplied source references and only inspected repository excerpts. Explain no fit or already implemented when appropriate. Do not propose unrelated work.",
          },
          [],
          { signal: active },
        );
        await request("evaluation_finish", {
          id: bundle.id,
          output: result.output,
        });
      }
      evaluations.push(bundle.id);
    }
  }
  return request("done", { ...base, evaluations });
}
