import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/mcp-reference.test.ts",
    "--maxWorkers=1",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      MCP_REFERENCE_WRITE: process.argv.includes("--check") ? "" : "1",
    },
    windowsHide: true,
  },
);
process.exitCode = result.status ?? 1;
