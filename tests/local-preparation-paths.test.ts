import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareLocalUrl,
  localPreparationCleanupCommand,
} from "../packages/runner/local-preparation.mjs";
import { purgeLocalPreparation } from "../packages/runner/local-media-retention.mjs";
import { companionPreparationRoot } from "../packages/companion/config-root.mjs";
import release from "../infra/downloader.json";

afterEach(() => vi.unstubAllEnvs());
async function removeFixture(root: string) {
  const owned = relative(resolve(tmpdir()), resolve(root));
  if (
    !owned ||
    isAbsolute(owned) ||
    owned.startsWith(`..${sep}`) ||
    !owned.startsWith("vibe-preparation-fixture-")
  )
    throw Error("FIXTURE_CLEANUP_PATH_INVALID");
  await rm(root, { recursive: true, force: true });
}
async function fixture(
  work: (fixture: {
    root: string;
    config: string;
    installed: string;
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "vibe-preparation-fixture-"));
  const local = join(root, "current-user");
  const config = join(local, "VibeScroll", "CompanionConfig");
  const installed = join(
    local,
    "VibeScroll",
    "Companion",
    "releases",
    "synthetic",
    "app",
  );
  await mkdir(config, { recursive: true });
  await mkdir(installed, { recursive: true });
  await writeFile(
    join(config, "subscription-session.json"),
    "protected fixture sentinel",
  );
  await writeFile(
    join(installed, "immutable.txt"),
    "installed fixture sentinel",
  );
  vi.stubEnv("LOCALAPPDATA", local);
  vi.stubEnv("VIBESCROLL_COMPANION_CONFIG_ROOT", config);
  try {
    await work({ root, config, installed });
  } finally {
    await removeFixture(root);
  }
}
const inputs = () => ({
  url: "https://youtube.com/watch?v=abcdefghijk",
  sourceId: "fixture-source",
  image: `sha256:${"a".repeat(64)}`,
  privateRoot: companionPreparationRoot(),
});
it("refuses already cancelled preparation before creating files or workers", async () =>
  fixture(async () => {
    const abort = new AbortController();
    abort.abort(new Error("LEASE_LOST"));
    const run = mockRun(),
      scheduleCleanup = vi.fn(async () => {});
    await expect(
      prepareLocalUrl({
        ...inputs(),
        signal: abort.signal,
        run,
        scheduleCleanup,
      }),
    ).rejects.toThrow("LEASE_LOST");
    expect(run).not.toHaveBeenCalled();
    expect(scheduleCleanup).not.toHaveBeenCalled();
  }));
it("removes only owned workers when cancellation interrupts acquisition and still performs cleanup", async () =>
  fixture(async () => {
    const abort = new AbortController(),
      baseRun = mockRun();
    const run = vi.fn(
      async (args: string[], _timeout?: number, signal?: AbortSignal) => {
        if (args.includes("/opt/vibe/acquire.py")) {
          expect(signal).toBe(abort.signal);
          abort.abort(new Error("LEASE_LOST"));
        }
        return baseRun(args);
      },
    );
    await expect(
      prepareLocalUrl({
        ...inputs(),
        signal: abort.signal,
        run,
        scheduleCleanup: async () => {},
      }),
    ).rejects.toThrow("LEASE_LOST");
    expect(
      run.mock.calls.some(([args]) =>
        args.includes("/opt/vibe/decode-personal.py"),
      ),
    ).toBe(false);
    const removals = run.mock.calls.filter(([args]) => args[0] === "rm");
    expect(removals.length).toBeGreaterThanOrEqual(2);
    for (const [args, , signal] of removals) {
      expect(args).toEqual([
        "rm",
        "--force",
        expect.stringMatching(/^vibe-trial-[a-f0-9-]+-(worker|proxy)$/),
      ]);
      expect(signal).toBeUndefined();
    }
    expect(
      run.mock.calls.filter(
        ([args]) => args[0] === "volume" && args[1] === "rm",
      ),
    ).toHaveLength(2);
  }));
function mockRun(unsafe?: "metadata-link" | "oversize") {
  return vi.fn(async (args: string[]) => {
    if (args[0] !== "cp") return "";
    const name = args[1].split("/home/user/media/")[1],
      path = args[2];
    if (name === "acquisition.json") {
      if (unsafe === "metadata-link") {
        await symlink(
          dirname(dirname(dirname(path))),
          path,
          process.platform === "win32" ? "junction" : "dir",
        );
      } else if (unsafe === "oversize")
        await writeFile(path, " ".repeat(32769));
      else
        await writeFile(
          path,
          JSON.stringify({
            schemaVersion: "1.0.0",
            status: "acquired",
            title: "Synthetic source",
            description: "Fixture only",
            durationSeconds: 1,
            byteLength: 4,
            extractor: "fixture",
            downloaderVersion: release.version,
          }),
        );
    } else if (name === "manifest.json") {
      await writeFile(
        path,
        JSON.stringify({
          durationSeconds: 1,
          coverage: "visual_only",
          frames: [
            {
              id: "frame-000.jpg",
              timestampMs: 0,
              selectionReason: "periodic sample",
            },
          ],
        }),
      );
    } else if (name === "frame-000.jpg")
      await writeFile(path, Buffer.from([255, 216, 255, 217]));
    else throw Error("UNEXPECTED_FIXTURE_OUTPUT");
    return "";
  });
}
it("prepares and purges only config-owned external media while keeping the installed app and credentials unchanged", async () =>
  fixture(async ({ config, installed }) => {
    const scheduleCleanup = vi.fn(async (_directory: string) => {}),
      run = mockRun();
    const result = await prepareLocalUrl({ ...inputs(), run, scheduleCleanup });
    expect(result.status).toBe("prepared");
    expect(dirname(result.directory)).toBe(
      join(config, "subscription-prepared"),
    );
    expect(scheduleCleanup).toHaveBeenCalledWith(result.directory);
    for (const [args] of run.mock.calls)
      if (args[0] === "cp")
        expect(args[2].startsWith(result.directory + sep)).toBe(true);
    const receipt = JSON.parse(
      await readFile(join(result.directory, "receipt.json"), "utf8"),
    );
    expect(receipt.assets).toMatchObject([{ name: "frame-000.jpg", bytes: 4 }]);
    await writeFile(
      join(result.directory, "owner-note.txt"),
      "retain authored note",
    );
    expect(
      await purgeLocalPreparation(result.directory, Date.now() + 86400001),
    ).toEqual({ purged: true });
    expect(await readdir(result.directory)).toEqual(["owner-note.txt"]);
    expect(
      await readFile(join(config, "subscription-session.json"), "utf8"),
    ).toBe("protected fixture sentinel");
    expect(await readdir(installed)).toEqual(["immutable.txt"]);
  }));
it("resolves the packaged purge helper from its source location regardless of the caller working directory", () => {
  const directory = join(tmpdir(), "synthetic-directory");
  const command = localPreparationCleanupCommand(directory);
  expect(command.executable).toBe(process.execPath);
  expect(command.args).toEqual([
    fileURLToPath(
      new URL("../scripts/purge-subscription-media.mjs", import.meta.url),
    ),
    directory,
    "--wait",
  ]);
  expect(isAbsolute(command.args[0])).toBe(true);
});
it("refuses foreign roots and config/preparation junctions before provider work or deletion", async () =>
  fixture(async ({ root, config }) => {
    const run = mockRun(),
      scheduleCleanup = vi.fn(async (_directory: string) => {});
    const outside = join(root, "unrelated");
    await mkdir(outside);
    const marker = join(outside, "preserve.txt");
    await writeFile(marker, "keep");
    await expect(
      prepareLocalUrl({
        ...inputs(),
        privateRoot: outside,
        run,
        scheduleCleanup,
      }),
    ).rejects.toThrow("LOCAL_PREPARATION_PATH_INVALID");
    expect(run).not.toHaveBeenCalled();
    expect(scheduleCleanup).not.toHaveBeenCalled();
    await symlink(
      outside,
      join(config, "subscription-prepared"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      prepareLocalUrl({ ...inputs(), run, scheduleCleanup }),
    ).rejects.toThrow("LOCAL_PREPARATION_PATH_INVALID");
    await expect(
      purgeLocalPreparation(
        join(config, "subscription-prepared", "a".repeat(36)),
        Date.now(),
      ),
    ).rejects.toThrow("LOCAL_RETENTION_PATH_INVALID");
    expect(await readFile(marker, "utf8")).toBe("keep");
  }));
it.each(["metadata-link", "oversize"] as const)(
  "refuses %s copied metadata before reading provider content",
  async (unsafe) =>
    fixture(async () => {
      const run = mockRun(unsafe),
        scheduleCleanup = vi.fn(async (_directory: string) => {});
      await expect(
        prepareLocalUrl({ ...inputs(), run, scheduleCleanup }),
      ).rejects.toThrow("LOCAL_PREPARATION_OUTPUT_INVALID");
      expect(
        run.mock.calls.some(([args]) =>
          args.includes("/opt/vibe/decode-personal.py"),
        ),
      ).toBe(false);
    }),
);
