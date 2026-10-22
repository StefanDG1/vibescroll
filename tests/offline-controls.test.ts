import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";

it("isolates validation from inherited provider credentials and blocks public network egress", () => {
  const directory = mkdtempSync(join(tmpdir(), "vibescroll-offline-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        resolve("scripts/run-offline.mjs"),
        "node",
        resolve("tests/fixtures/offline-probe.mjs").replaceAll("\\", "/"),
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          OPENAI_API_KEY: "synthetic-forbidden",
          CONVEX_DEPLOY_KEY: "synthetic-forbidden",
          VIBE_STAGING_TEST: "storage",
        },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("offline controls verified");
  } finally {
    if (
      !resolve(directory).startsWith(
        `${resolve(tmpdir())}${sep}vibescroll-offline-`,
      )
    )
      throw Error("Unsafe test cleanup path");
    rmSync(directory, { recursive: true });
  }
});
