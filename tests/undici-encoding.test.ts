// @vitest-environment node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("survives an early close after excessive response codings and still decodes gzip", () => {
  const probe = fileURLToPath(
    new URL("./fixtures/undici-encoding-probe.mjs", import.meta.url),
  );
  const child = spawnSync(process.execPath, [probe], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(child.stdout)).toEqual({
    rejectedExcessiveEncoding: true,
    gzip: "passed",
  });
});
