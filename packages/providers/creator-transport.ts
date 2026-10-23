import { z } from "zod";

const opaqueId = z.string().regex(/^[a-zA-Z0-9]{1,100}$/);
const actor = z
  .strictObject({
    platform: z.enum(["instagram", "tiktok"]),
    name: z.enum(["apify~instagram-scraper", "clockworks~tiktok-scraper"]),
    id: opaqueId,
    build: z.string().regex(/^\d+\.\d+\.\d+$/),
    buildId: opaqueId,
  })
  .refine(
    (a) =>
      a.name ===
      (a.platform === "instagram"
        ? "apify~instagram-scraper"
        : "clockworks~tiktok-scraper"),
  );

/** Operator-reviewed adapter policy, not a price quote or a provider permission. */
export const creatorTransportSchema = z.strictObject({
  adapter: z.literal("apify-discovery-v1"),
  actors: z
    .array(actor)
    .min(1)
    .max(2)
    .refine(
      (rows) => new Set(rows.map((r) => r.platform)).size === rows.length,
    ),
  timeoutSeconds: z.number().int().min(1).max(20),
  memoryMb: z.union([
    z.literal(128),
    z.literal(256),
    z.literal(512),
    z.literal(1024),
    z.literal(2048),
    z.literal(4096),
  ]),
  maximumItems: z.number().int().min(1).max(100),
  runMaximumUsdMicros: z.number().int().positive(),
  minimumCheckUsdMicros: z.number().int().positive(),
  allowIncompleteSnapshots: z.boolean(),
});
export type CreatorTransport = z.infer<typeof creatorTransportSchema>;
export const creatorOperationLimits = Object.freeze({
  start: 1,
  status: 3,
  dataset: 3,
  abort: 1,
  delete_dataset: 1,
  delete_store: 1,
  delete_queue: 1,
  delete_run: 1,
});
export type CreatorOperation = keyof typeof creatorOperationLimits;
export type OwnedCreatorRun = {
  id: string;
  actorId: string;
  buildId: string;
  datasetId: string;
  storeId: string;
  queueId: string;
  status: string;
};
const terminal = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);
const runSchema = z.object({
  id: opaqueId,
  actId: opaqueId,
  buildId: opaqueId,
  defaultDatasetId: opaqueId,
  defaultKeyValueStoreId: opaqueId,
  defaultRequestQueueId: opaqueId,
  status: z.enum([
    "READY",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "TIMING-OUT",
    "TIMED-OUT",
    "ABORTING",
    "ABORTED",
  ]),
});
export function creatorActorInput(
  platform: "instagram" | "tiktok",
  creatorId: string,
  canonical: string,
  maximumItems: number,
) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(creatorId))
    throw Error("CREATOR_IDENTITY_CHANGED");
  if (platform === "instagram") {
    if (!/^https:\/\/www\.instagram\.com\/[a-zA-Z0-9._]+\/$/.test(canonical))
      throw Error("CREATOR_IDENTITY_CHANGED");
    return {
      directUrls: [canonical],
      resultsType: "posts",
      resultsLimit: maximumItems,
    };
  }
  const profile = /^https:\/\/www\.tiktok\.com\/@([a-zA-Z0-9._]+)\/$/.exec(
    canonical,
  );
  if (!profile) throw Error("CREATOR_IDENTITY_CHANGED");
  return {
    // Supplier profiles accept stable user IDs. A mutable handle can be
    // reassigned after approval and must not select a different creator.
    profiles: [creatorId],
    resultsPerPage: maximumItems,
    profileScrapeSections: ["videos"],
    profileSorting: "latest",
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadAvatars: false,
    shouldDownloadMusicCovers: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    aiVideoDescription: false,
    aiVideoSummary: false,
    commentsPerPost: 0,
    maxFollowersPerProfile: 0,
    maxFollowingPerProfile: 0,
  };
}

/** Every dispatch is preceded by an atomic server receipt. No SDK or HTTP retry. */
export function createCreatorTransport(options: {
  descriptor: CreatorTransport;
  platform: "instagram" | "tiktok";
  creatorId: string;
  canonical: string;
  token: string;
  deadline: number;
  workDeadline?: number;
  before: (operation: CreatorOperation) => Promise<void>;
  recordRun: (run: OwnedCreatorRun) => Promise<void>;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const descriptor = creatorTransportSchema.parse(options.descriptor);
  const selected = descriptor.actors.find(
    (a) => a.platform === options.platform,
  );
  if (!selected || !options.token || /[\r\n]/.test(options.token))
    throw Error("CREATOR_TRANSPORT_UNCONFIGURED");
  const now = options.now ?? Date.now,
    request = options.fetch ?? fetch;
  const localCounts: Partial<Record<CreatorOperation, number>> = {};
  let owned: OwnedCreatorRun | null = null,
    halted = false,
    responseBytes = 0;
  async function call(
    operation: CreatorOperation,
    path: string,
    method: string,
    body?: unknown,
  ) {
    const cleanup = [
      "abort",
      "delete_dataset",
      "delete_store",
      "delete_queue",
      "delete_run",
    ].includes(operation);
    const deadline = cleanup
      ? options.deadline
      : (options.workDeadline ?? options.deadline);
    if (
      (halted && !cleanup) ||
      now() >= deadline ||
      (localCounts[operation] ?? 0) >= creatorOperationLimits[operation]
    )
      throw Error("CREATOR_TRANSPORT_BOUND");
    localCounts[operation] = (localCounts[operation] ?? 0) + 1;
    await options.before(operation);
    if (now() >= deadline) throw Error("CREATOR_TRANSPORT_BOUND");
    try {
      const response = await request(`https://api.apify.com${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(
          Math.min(6000, Math.max(1, deadline - now())),
        ),
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw Error("CREATOR_SUPPLIER_RESPONSE");
      if (operation.startsWith("delete_") && response.status !== 204) {
        await response.body?.cancel().catch(() => {});
        throw Error("CREATOR_CLEANUP_UNKNOWN");
      }
      const declared = response.headers.get("content-length");
      if (
        declared &&
        (!/^\d+$/.test(declared) || Number(declared) > 1_000_000)
      ) {
        await response.body?.cancel().catch(() => {});
        throw Error("CREATOR_RESPONSE_BOUND");
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        if (reader)
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            responseBytes += part.value.byteLength;
            if (bytes > 1_000_000 || responseBytes > 2_000_000)
              throw Error("CREATOR_RESPONSE_BOUND");
            chunks.push(part.value);
          }
      } catch (error) {
        await reader?.cancel().catch(() => {});
        throw error;
      }
      const all = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return {
        value: bytes ? JSON.parse(new TextDecoder().decode(all)) : null,
        bytes,
      };
    } catch (error) {
      halted = true;
      throw error;
    }
  }
  function parseRun(value: unknown) {
    const row = runSchema.parse(
      z.object({ data: z.unknown() }).parse(value).data,
    );
    if (
      row.actId !== selected!.id ||
      row.buildId !== selected!.buildId ||
      (owned &&
        (row.id !== owned.id ||
          row.defaultDatasetId !== owned.datasetId ||
          row.defaultKeyValueStoreId !== owned.storeId ||
          row.defaultRequestQueueId !== owned.queueId))
    )
      throw Error("CREATOR_SUPPLIER_IDENTITY_CHANGED");
    return {
      id: row.id,
      actorId: row.actId,
      buildId: row.buildId,
      datasetId: row.defaultDatasetId,
      storeId: row.defaultKeyValueStoreId,
      queueId: row.defaultRequestQueueId,
      status: row.status,
    };
  }
  return {
    async start() {
      const query = new URLSearchParams({
        build: selected.build,
        timeout: String(descriptor.timeoutSeconds),
        memory: String(descriptor.memoryMb),
        maxItems: String(descriptor.maximumItems),
        maxTotalChargeUsd: String(descriptor.runMaximumUsdMicros / 1_000_000),
        restartOnError: "false",
        waitForFinish: "0",
      });
      const result = await call(
        "start",
        `/v2/actors/${selected.name}/runs?${query}`,
        "POST",
        creatorActorInput(
          options.platform,
          options.creatorId,
          options.canonical,
          descriptor.maximumItems,
        ),
      );
      owned = parseRun(result.value);
      await options.recordRun(owned);
      return owned;
    },
    async status() {
      if (!owned) throw Error("CREATOR_RUN_UNKNOWN");
      const result = await call(
        "status",
        `/v2/actor-runs/${owned.id}?waitForFinish=5`,
        "GET",
      );
      owned = parseRun(result.value);
      await options.recordRun(owned);
      return owned;
    },
    async page(offset: number) {
      if (
        !owned ||
        owned.status !== "SUCCEEDED" ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset >= 100
      )
        throw Error("CREATOR_RUN_NOT_SUCCEEDED");
      const result = await call(
        "dataset",
        `/v2/datasets/${owned.datasetId}/items?format=json&offset=${offset}&limit=40`,
        "GET",
      );
      if (!Array.isArray(result.value) || result.value.length > 40)
        throw Error("CREATOR_RESPONSE_BOUND");
      return { rows: result.value as unknown[], bytes: result.bytes };
    },
    async cleanup() {
      if (!owned) return { confirmed: false };
      if (!terminal.has(owned.status)) {
        const result = await call(
          "abort",
          `/v2/actor-runs/${owned.id}/abort?gracefully=false`,
          "POST",
        );
        owned = parseRun(result.value);
        await options.recordRun(owned);
        if (!terminal.has(owned.status)) return { confirmed: false };
      }
      // Delete only storage IDs bound to this run. A failed/lost DELETE is unknown.
      await call("delete_dataset", `/v2/datasets/${owned.datasetId}`, "DELETE");
      await call(
        "delete_store",
        `/v2/key-value-stores/${owned.storeId}`,
        "DELETE",
      );
      await call(
        "delete_queue",
        `/v2/request-queues/${owned.queueId}`,
        "DELETE",
      );
      await call("delete_run", `/v2/actor-runs/${owned.id}`, "DELETE");
      return { confirmed: true };
    },
    get owned() {
      return owned;
    },
  };
}
