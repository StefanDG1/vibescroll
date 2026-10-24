// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn());
vi.mock("../packages/providers/sandbox", () => ({ createJobSandbox: create }));
vi.mock("../packages/providers/isolation", () => ({
  hardenSandbox: vi.fn(async () => {}),
}));
vi.mock("../packages/providers/storage", () => ({
  signedObject: () => "https://synthetic.invalid/owned-original",
}));
import {
  prepareMedia,
  MediaPreparationError,
} from "../packages/providers/media";
import type { PreparationRuntime } from "../packages/providers/preparation-runtime";
const expected: PreparationRuntime = {
  version: "preparation-runtime-v1",
  route: "broker",
  authority: {
    kind: "media",
    snapshotId: "snap_ownedSelected123",
    parentSnapshotId: null,
    projectId: "prj_synthetic",
    teamId: "team_synthetic",
    updatedAt: 1,
    expiresAt: 9000000000000,
  },
};
const provenance = {
  version: "sandbox-create-receipt-v1",
  selection: expected,
  sandboxId: "vercel:synthetic-owned",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  create.mockReset();
});
function vm(cleanup = true, receipt: unknown = provenance) {
  vi.stubEnv("MEDIA_VERIFIED", "true");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(new Uint8Array([1]), {
          headers: { "content-length": "1" },
        }),
    ),
  );
  const kill = vi.fn(async () => {
    if (!cleanup) throw Error("synthetic uncertain termination");
  });
  const instance = {
    creationProvenance: receipt,
    kill,
    commands: { run: vi.fn(async () => ({ exitCode: 0 })) },
    files: {
      write: vi.fn(async () => {}),
      read: vi.fn(async (path: string) =>
        path.endsWith("manifest.json")
          ? JSON.stringify({
              durationSeconds: 1,
              audio: "audio.wav",
              coverage: "audio_only",
              frames: [],
            })
          : new Uint8Array([1]),
      ),
    },
  };
  create.mockResolvedValue(instance);
  return instance;
}
it("returns selected creation provenance only after confirmed teardown and forwards the preflight expectation", async () => {
  const instance = vm();
  const result = await prepareMedia(
    "synthetic-original",
    "synthetic-decoder",
    true,
    { expectedRuntime: expected },
  );
  expect(create).toHaveBeenCalledWith("media", 300, undefined, {
    expectedRuntime: expected,
  });
  expect(instance.kill).toHaveBeenCalledTimes(1);
  expect(result.creationProvenance).toEqual(provenance);
});
it("retains uncertain compute and returns no successful cache receipt when teardown is unconfirmed", async () => {
  vm(false);
  const error = await prepareMedia(
    "synthetic-original",
    "synthetic-decoder",
    true,
    { expectedRuntime: expected },
  ).catch((error) => error);
  expect(error).toBeInstanceOf(MediaPreparationError);
  expect(error.computeSeconds).toBeUndefined();
  expect(error).not.toHaveProperty("creationProvenance");
});
it("keeps missing-provenance legacy preparation usable without inventing a cache receipt", async () => {
  vm(true, null);
  const result = await prepareMedia(
    "synthetic-original",
    "synthetic-decoder",
    true,
  );
  expect(result).not.toHaveProperty("creationProvenance");
});
