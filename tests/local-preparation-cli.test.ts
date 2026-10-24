// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const probe = fileURLToPath(
  new URL("./fixtures/local-preparation-cli-probe.mjs", import.meta.url),
);
async function removeFixture(directory: string) {
  const owned = relative(resolve(tmpdir()), resolve(directory));
  if (
    !owned ||
    isAbsolute(owned) ||
    owned.startsWith(`..${sep}`) ||
    !owned.startsWith("vibe-preparation-cli-")
  )
    throw Error("FIXTURE_CLEANUP_PATH_INVALID");
  await rm(directory, { recursive: true, force: true });
}
async function run(config: string) {
  const directory = await mkdtemp(join(tmpdir(), "vibe-preparation-cli-"));
  try {
    const request = join(directory, "request.json");
    await writeFile(request, config);
    const child = spawnSync(process.execPath, [probe, request], {
      cwd: directory,
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(1);
    expect(JSON.parse(child.stdout)).toEqual({
      cleanup: fileURLToPath(
        new URL("../scripts/purge-subscription-media.mjs", import.meta.url),
      ),
      attempts: [],
    });
    expect(await readdir(directory)).toEqual(["request.json"]);
    return JSON.parse(child.stderr);
  } finally {
    await removeFixture(directory);
  }
}

it("runs the actual CLI with native cleanup URLs and rejects unsupported sources before Docker or network", async () => {
  expect(
    await run(
      JSON.stringify({
        url: "https://private-user:private-password@example.invalid/private-evidence",
        sourceId: "synthetic-source",
        image: `sha256:${"a".repeat(64)}`,
        privateRoot: "private-root-sentinel",
      }),
    ),
  ).toEqual({
    status: "stopped",
    reason: "AcquisitionPolicyError",
    code: "UNSUPPORTED_SOURCE",
    cloudProcessing: false,
  });
});

it("preserves the CLI configuration size limit and redacted error contract", async () => {
  expect(await run("private-config-sentinel".padEnd(10001, " "))).toEqual({
    status: "stopped",
    reason: "Error",
    code: "LOCAL_PREPARATION_FAILED",
    cloudProcessing: false,
  });
});
