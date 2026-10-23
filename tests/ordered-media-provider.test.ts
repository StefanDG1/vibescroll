import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { orderedDecoderManifest } from "../packages/media/manifest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  harden: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("../packages/providers/sandbox", () => ({
  createJobSandbox: mocks.create,
}));
vi.mock("../packages/providers/isolation", () => ({
  hardenSandbox: mocks.harden,
}));
vi.mock("../packages/providers/storage", () => ({
  signedObject: mocks.signed,
}));
import {
  prepareOrderedMedia,
  OrderedMediaPreparationError,
} from "../packages/providers/ordered-media";
const sha = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const source = Uint8Array.from([1, 2, 3, 4]);
const image = Uint8Array.from([255, 216, 255, 0]);
const input = [
  {
    id: "image1",
    index: 2,
    kind: "image",
    key: "private/input",
    bytes: source.length,
    sha256: sha(source),
  },
];
function output() {
  return {
    schemaVersion: "ordered-decoder-v1",
    assets: [
      {
        id: "image1",
        index: 2,
        kind: "image",
        bytes: source.length,
        contentHash: sha(source),
        mime: "image/png",
        width: 100,
        height: 60,
        audio: null,
        representations: [
          {
            file: "asset-002-image.jpg",
            kind: "image",
            bytes: image.length,
            width: 100,
            height: 60,
            sha256: sha(image),
          },
        ],
      },
    ],
    omitted: [],
    inputBytes: source.length,
    videoDurationMs: 0,
    representationBytes: image.length,
    audioBytes: 0,
  };
}
let sandbox: {
  kill: ReturnType<typeof vi.fn>;
  commands: { run: ReturnType<typeof vi.fn> };
  files: { write: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn> };
};
beforeEach(() => {
  vi.stubEnv("MEDIA_VERIFIED", "true");
  vi.stubEnv("ORDERED_MEDIA_VERIFIED", "true");
  mocks.create.mockReset();
  mocks.harden.mockReset();
  mocks.signed.mockReset();
  sandbox = {
    kill: vi.fn().mockResolvedValue(undefined),
    commands: { run: vi.fn().mockResolvedValue({ exitCode: 0 }) },
    files: {
      write: vi.fn(async (_path: string, data: unknown) => {
        if (data instanceof ReadableStream) {
          const reader = data.getReader();
          while (!(await reader.read()).done) {
            /* consume upload like the SDK */
          }
        }
      }),
      read: vi.fn(async (path: string) =>
        path.endsWith(".json") ? JSON.stringify(output()) : image,
      ),
    },
  };
  mocks.create.mockResolvedValue(sandbox);
  mocks.signed.mockReturnValue("https://storage.example.invalid/private");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => new Response(source)),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each([false, true])(
  "revoked authority stops a pending decoder and retains unknown termination: unknown=%s",
  async (unknown) => {
    vi.useFakeTimers();
    let decoding!: () => void;
    const started = new Promise<void>((resolve) => {
      decoding = resolve;
    });
    sandbox.commands.run.mockImplementation(async (command: string) => {
      if (command.startsWith("mkdir")) return { exitCode: 0 };
      decoding();
      return new Promise(() => {});
    });
    if (unknown) sandbox.kill.mockRejectedValue(Error("termination unknown"));
    let revoked = false;
    const authorize = vi.fn(async () => {
      if (revoked) throw Error("rights revoked");
    });
    const result = prepareOrderedMedia(input, { authorize }).catch(
      (error) => error,
    );
    await started;
    revoked = true;
    await vi.advanceTimersByTimeAsync(10000);
    const error = await result;
    expect(error).toBeInstanceOf(OrderedMediaPreparationError);
    expect(error.computeSeconds).toBe(unknown ? undefined : 10);
    expect(sandbox.kill).toHaveBeenCalled();
    expect(sandbox.files.read).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledOnce();
    const checks = authorize.mock.calls.length;
    await vi.advanceTimersByTimeAsync(300000);
    expect(authorize).toHaveBeenCalledTimes(checks);
  },
);
it("shares an in-flight authority read with the decoder completion checkpoint", async () => {
  vi.useFakeTimers();
  let complete!: (value: { exitCode: number }) => void,
    decoding!: () => void,
    refuse!: (error: Error) => void;
  const started = new Promise<void>((resolve) => {
    decoding = resolve;
  });
  sandbox.commands.run.mockImplementation(async (command: string) => {
    if (command.startsWith("mkdir")) return { exitCode: 0 };
    decoding();
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  let pending = false;
  const authorize = vi.fn(async () => {
    if (pending)
      return new Promise<void>((_resolve, reject) => {
        refuse = reject;
      });
  });
  const result = prepareOrderedMedia(input, { authorize }).catch(
    (error) => error,
  );
  await started;
  pending = true;
  await vi.advanceTimersByTimeAsync(10000);
  const checks = authorize.mock.calls.length;
  complete({ exitCode: 0 });
  await vi.advanceTimersByTimeAsync(20000);
  expect(authorize).toHaveBeenCalledTimes(checks);
  refuse(Error("revoked while read was pending"));
  expect(await result).toBeInstanceOf(OrderedMediaPreparationError);
  expect(sandbox.kill).toHaveBeenCalledOnce();
  expect(sandbox.files.read).not.toHaveBeenCalled();
});
it("bounds active watchdog reads to thirty and clears them after the job stops", async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  let decoding!: () => void;
  const started = new Promise<void>((resolve) => {
    decoding = resolve;
  });
  sandbox.commands.run.mockImplementation(async (command: string) => {
    if (command.startsWith("mkdir")) return { exitCode: 0 };
    decoding();
    return new Promise(() => {});
  });
  const authorize = vi.fn(async () => {});
  const result = prepareOrderedMedia(input, {
    authorize,
    signal: abort.signal,
  }).catch((error) => error);
  await started;
  const checkpoints = authorize.mock.calls.length;
  await vi.advanceTimersByTimeAsync(600000);
  expect(authorize).toHaveBeenCalledTimes(checkpoints + 30);
  abort.abort();
  expect(await result).toBeInstanceOf(OrderedMediaPreparationError);
  await vi.advanceTimersByTimeAsync(600000);
  expect(authorize).toHaveBeenCalledTimes(checkpoints + 30);
  expect(sandbox.kill).toHaveBeenCalledOnce();
});
it("keeps ordered image coordinates untimed and verifies real input/output hashes before returning", async () => {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const prepared = await prepareOrderedMedia(input, { authorize });
  expect(prepared.manifest.assets[0].index).toBe(2);
  expect(prepared.manifest.assets[0].representations[0]).not.toHaveProperty(
    "timestampMs",
  );
  expect(prepared.files.get("asset-002-image.jpg")).toEqual(image);
  expect(mocks.harden).toHaveBeenCalledWith(sandbox);
  expect(sandbox.kill).toHaveBeenCalledOnce();
  expect(authorize.mock.calls.length).toBeGreaterThan(4);
});
it("refuses invalid aggregates or a closed verification gate before allocating compute", async () => {
  await expect(
    prepareOrderedMedia([input[0], input[0]], { authorize: async () => {} }),
  ).rejects.toThrow();
  vi.stubEnv("ORDERED_MEDIA_VERIFIED", "false");
  await expect(
    prepareOrderedMedia(input, { authorize: async () => {} }),
  ).rejects.toThrow();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("kills compute before decoding when private bytes changed", async () => {
  await expect(
    prepareOrderedMedia([{ ...input[0], sha256: "a".repeat(64) }], {
      authorize: async () => {},
    }),
  ).rejects.toBeInstanceOf(OrderedMediaPreparationError);
  expect(sandbox.commands.run).toHaveBeenCalledTimes(1);
  expect(sandbox.kill).toHaveBeenCalledOnce();
});
it("withholds decoded data after mid-job rights revocation", async () => {
  let checks = 0;
  await expect(
    prepareOrderedMedia(input, {
      authorize: async () => {
        if (++checks === 5) throw Error("rights revoked");
      },
    }),
  ).rejects.toBeInstanceOf(OrderedMediaPreparationError);
  expect(sandbox.files.read).not.toHaveBeenCalled();
  expect(sandbox.kill).toHaveBeenCalledOnce();
});
it("retains unknown compute when sandbox termination cannot be confirmed", async () => {
  sandbox.kill.mockRejectedValue(Error("control unavailable"));
  sandbox.commands.run.mockResolvedValue({ exitCode: 1 });
  try {
    await prepareOrderedMedia(input, { authorize: async () => {} });
    throw Error("expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(OrderedMediaPreparationError);
    expect(
      (error as OrderedMediaPreparationError).computeSeconds,
    ).toBeUndefined();
  }
});
it("propagates cancellation to sandbox termination and never returns media", async () => {
  const abort = new AbortController();
  sandbox.commands.run.mockImplementation(async () => {
    abort.abort();
    return { exitCode: 0 };
  });
  await expect(
    prepareOrderedMedia(input, {
      signal: abort.signal,
      authorize: async () => {},
    }),
  ).rejects.toBeInstanceOf(OrderedMediaPreparationError);
  expect(sandbox.kill).toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects decoder rebinding, fabricated totals and image video-time fields", () => {
  const value = output();
  expect(orderedDecoderManifest(value).assets[0].index).toBe(2);
  for (const mutate of [
    (v: typeof value) => {
      v.assets[0].representations[0].file = "asset-001-image.jpg";
    },
    (v: typeof value) => {
      v.representationBytes++;
    },
    (v: typeof value) => {
      Object.assign(v.assets[0].representations[0], { timestampMs: 0 });
    },
    (v: typeof value) => {
      v.assets[0].representations.push(v.assets[0].representations[0]);
    },
  ]) {
    const invalid = structuredClone(value);
    mutate(invalid);
    expect(() => orderedDecoderManifest(invalid)).toThrow();
  }
});
