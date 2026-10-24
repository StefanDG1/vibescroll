// @vitest-environment node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const probe = fileURLToPath(
  new URL("./fixtures/body-parser-compression-probe.mjs", import.meta.url),
);

it.each(["late-deflate", "gzip", "gzip-trailing"])(
  "survives %s requests while preserving parsed JSON and other body consumers",
  (mode) => {
    const child = spawnSync(process.execPath, [probe, mode], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const result = JSON.parse(child.stdout);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      parsed: { a: 1 },
      hash: result.expectedHash,
    });
  },
);

it("rejects an unsupported compressed charset without a decoder crash", () => {
  const child = spawnSync(process.execPath, [probe, "charset"], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(child.stdout)).toMatchObject({
    status: 415,
    body: "charset.unsupported",
  });
});
