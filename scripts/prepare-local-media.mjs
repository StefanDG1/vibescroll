import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareLocalUrl } from "../packages/runner/local-preparation.mjs";
try {
  const path = resolve(process.argv[2] ?? "");
  if ((await stat(path)).size > 10000)
    throw Error("LOCAL_PREPARATION_CONFIG_INVALID");
  const request = JSON.parse(await readFile(path, "utf8"));
  const result = await prepareLocalUrl(request);
  console.log(JSON.stringify(result));
  if (result.status !== "prepared") process.exitCode = 2;
} catch (error) {
  console.error(
    JSON.stringify({
      status: "stopped",
      reason: error?.name ?? "Error",
      code:
        typeof error?.code === "string"
          ? error.code
          : "LOCAL_PREPARATION_FAILED",
      cloudProcessing: false,
    }),
  );
  process.exitCode = 1;
}
