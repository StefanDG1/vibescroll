import { createHash } from "node:crypto";
import { z } from "zod";
import { ensure } from "../policy";
import { orderedDecoderManifest } from "../media/manifest";
import { orderedDecoder } from "../media/decoder-ordered";
import { createJobSandbox } from "./sandbox";
import { hardenSandbox } from "./isolation";
import { signedObject } from "./storage";
import type { PreparationRuntime } from "./preparation-runtime";

const assetInput = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  index: z.number().int().min(0).max(34),
  kind: z.enum(["image", "video"]),
  key: z.string().min(1).max(1024),
  bytes: z.number().int().positive().max(250_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const orderedMediaInput = z
  .array(assetInput)
  .min(1)
  .max(35)
  .superRefine((assets, ctx) => {
    if (
      new Set(assets.map((a) => a.id)).size !== assets.length ||
      new Set(assets.map((a) => a.key)).size !== assets.length ||
      assets.some((a, i) => i > 0 && assets[i - 1].index >= a.index) ||
      assets.reduce((n, a) => n + a.bytes, 0) > 250_000_000
    )
      ctx.addIssue({
        code: "custom",
        message: "Ordered input identity or cumulative bound changed",
      });
  });

// Undefined compute means termination was not confirmed. Callers must retain the
// entire approved reservation and must not retry automatically.
export class OrderedMediaPreparationError extends Error {
  constructor(public readonly computeSeconds: number | undefined) {
    super(
      "Ordered media preparation stopped. Review retained usage before retrying.",
    );
  }
}

/** Private objects only. Source URLs and supplier credentials never enter the VM. */
export async function prepareOrderedMedia(
  value: unknown,
  options: {
    authorize: () => Promise<void>;
    signal?: AbortSignal;
    expectedRuntime?: PreparationRuntime;
  },
) {
  const inputs = orderedMediaInput.parse(value);
  ensure(
    process.env.MEDIA_VERIFIED === "true" &&
      process.env.ORDERED_MEDIA_VERIFIED === "true",
    "MEDIA_UNAVAILABLE",
    "Verify the isolated ordered decoder image before processing.",
  );
  const started = Date.now();
  const canceled = new AbortController();
  const signal = AbortSignal.any([
    canceled.signal,
    AbortSignal.timeout(300_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  let authorityRead: Promise<void> | undefined;
  const authorize = async () => {
    signal.throwIfAborted();
    authorityRead ??= Promise.resolve()
      .then(options.authorize)
      .finally(() => {
        authorityRead = undefined;
      });
    await authorityRead;
    signal.throwIfAborted();
  };
  await authorize();
  const sandbox = await createJobSandbox(
    "media",
    300,
    [],
    options.expectedRuntime ? { expectedRuntime: options.expectedRuntime } : {},
  ).catch(() => {
    throw new OrderedMediaPreparationError(undefined);
  });
  let killed = false;
  let stopping: Promise<void> | undefined;
  // Abort also reaches sandbox termination while a command or upload is pending.
  const stop = async () => {
    if (killed) return;
    stopping ??= (async () => {
      await sandbox.kill();
      killed = true;
    })().finally(() => {
      stopping = undefined;
    });
    await stopping;
  };
  const onAbort = () => {
    void stop().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  let watching = true,
    watchChecks = 0,
    watchTimer: ReturnType<typeof setTimeout> | undefined;
  // This owned VM's existing 300-second job permits at most 30 extra active
  // authority reads. Live database cost/latency acceptance remains pending.
  const watch = async () => {
    watchChecks++;
    try {
      await authorize();
    } catch (error) {
      canceled.abort(error);
      return;
    }
    if (watching && watchChecks < 30 && Date.now() - started < 300000)
      watchTimer = setTimeout(() => {
        void watch();
      }, 10000);
  };
  watchTimer = setTimeout(() => {
    void watch();
  }, 10000);
  try {
    await authorize();
    await hardenSandbox(sandbox);
    const mkdir = await sandbox.commands.run("mkdir -p /home/user/media", {
      user: "user",
      timeoutMs: 10_000,
    });
    ensure(
      mkdir.exitCode === 0,
      "MEDIA_UNAVAILABLE",
      "The private media directory could not be prepared.",
    );
    let total = 0;
    for (const asset of inputs) {
      await authorize();
      const response = await fetch(signedObject(asset.key, "GET", 300), {
        redirect: "error",
        signal,
      });
      const length = response.headers.get("content-length");
      ensure(
        response.ok &&
          response.body &&
          (!length || Number(length) === asset.bytes),
        "UPLOAD_INVALID",
        "A private input changed before decoding.",
      );
      let count = 0;
      const hash = createHash("sha256");
      const stream = response.body!.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            signal.throwIfAborted();
            count += chunk.byteLength;
            total += chunk.byteLength;
            ensure(
              count <= asset.bytes && total <= 250_000_000,
              "UPLOAD_INVALID",
              "Ordered input exceeded its reviewed byte bound.",
            );
            hash.update(chunk);
            controller.enqueue(chunk);
          },
        }),
      );
      await sandbox.files.write(
        `/home/user/media/input-${String(asset.index).padStart(3, "0")}`,
        stream,
        { user: "user" },
      );
      ensure(
        count === asset.bytes && hash.digest("hex") === asset.sha256,
        "UPLOAD_INVALID",
        "Ordered input bytes no longer match the reviewed content hash.",
      );
    }
    await authorize();
    await sandbox.files.write(
      "/home/user/media/ordered-input.json",
      JSON.stringify({
        schemaVersion: "ordered-input-v1",
        assets: inputs.map((a) => ({
          id: a.id,
          index: a.index,
          kind: a.kind,
          file: `input-${String(a.index).padStart(3, "0")}`,
        })),
      }),
      { user: "user" },
    );
    await sandbox.files.write(
      "/home/user/media/decode-ordered.py",
      orderedDecoder,
      { user: "user" },
    );
    const commandResult = sandbox.commands.run(
      "python3 /home/user/media/decode-ordered.py",
      {
        user: "user",
        timeoutMs: Math.max(1, 300_000 - (Date.now() - started)),
      },
    );
    let abortCommand: (() => void) | undefined;
    const command = await Promise.race([
      commandResult,
      new Promise<never>((_resolve, reject) => {
        abortCommand = () => reject(signal.reason);
        if (signal.aborted) abortCommand();
        else signal.addEventListener("abort", abortCommand, { once: true });
      }),
    ]).finally(() => {
      if (abortCommand) signal.removeEventListener("abort", abortCommand);
    });
    ensure(
      command.exitCode === 0,
      "MEDIA_UNAVAILABLE",
      "The isolated ordered decoder did not finish.",
    );
    await authorize();
    const raw = await sandbox.files.read(
      "/home/user/media/ordered-manifest.json",
      { maxBytes: 100_000 },
    );
    ensure(
      Buffer.byteLength(raw) <= 100_000,
      "INVALID_MEDIA_MANIFEST",
      "Ordered metadata exceeded its bound.",
    );
    const manifest = orderedDecoderManifest(JSON.parse(raw));
    ensure(
      manifest.inputBytes === total &&
        manifest.assets.every((a) =>
          inputs.some(
            (i) =>
              i.id === a.id &&
              i.index === a.index &&
              i.kind === a.kind &&
              i.bytes === a.bytes &&
              i.sha256 === a.contentHash,
          ),
        ) &&
        manifest.assets.length + manifest.omitted.length === inputs.length &&
        manifest.omitted.every((a) =>
          inputs.some((i) => i.id === a.id && i.index === a.index),
        ),
      "INVALID_MEDIA_MANIFEST",
      "The decoder changed the approved ordered inputs.",
    );
    const files = new Map<string, Uint8Array>();
    for (const asset of manifest.assets) {
      for (const item of [
        ...asset.representations,
        ...(asset.audio ? [asset.audio] : []),
      ]) {
        await authorize();
        const data = await sandbox.files.read(`/home/user/media/${item.file}`, {
          format: "bytes",
        });
        ensure(
          data.byteLength === item.bytes &&
            createHash("sha256").update(data).digest("hex") === item.sha256,
          "INVALID_MEDIA_MANIFEST",
          "A decoded representation failed its actual byte binding.",
        );
        if (item.file.endsWith(".jpg"))
          ensure(
            data[0] === 255 && data[1] === 216 && data[2] === 255,
            "INVALID_MEDIA_MANIFEST",
            "The representation is not a JPEG.",
          );
        files.set(item.file, data);
      }
    }
    await authorize();
    await stop();
    return {
      manifest,
      files,
      computeSeconds: Math.min(300, Math.ceil((Date.now() - started) / 1000)),
      ...(sandbox.creationProvenance
        ? { creationProvenance: sandbox.creationProvenance }
        : {}),
    };
  } catch {
    try {
      if (!killed) await stop();
    } catch {
      /* Unconfirmed termination retains the full hold. */
    }
    throw new OrderedMediaPreparationError(
      killed
        ? Math.min(300, Math.ceil((Date.now() - started) / 1000))
        : undefined,
    );
  } finally {
    watching = false;
    clearTimeout(watchTimer);
    signal.removeEventListener("abort", onAbort);
    if (!killed) {
      try {
        await stop();
      } catch {
        /* No automatic retry. */
      }
    }
  }
}
