import { createHash } from "node:crypto";
import { ensure } from "../policy";
import { readResponseBytes } from "./binary";

export const preparedDownloader = {
  version: "2026.10.26",
  bytes: 3073072,
  sha256: "e51e69e89489f199530f13d32a4342da3ddb2cf34842f364603a066db05afbf3",
  url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp",
};

export async function readPreparedDownloader() {
  const response = await fetch(preparedDownloader.url, {
    signal: AbortSignal.timeout(15000),
  });
  ensure(
    response.ok,
    "SETUP_REQUIRED",
    "The pinned downloader could not be obtained.",
  );
  const tool = await readResponseBytes(response, preparedDownloader.bytes);
  ensure(
    tool.byteLength === preparedDownloader.bytes &&
      createHash("sha256").update(tool).digest("hex") ===
        preparedDownloader.sha256,
    "POLICY_BLOCKED",
    "The pinned downloader bytes changed.",
  );
  return tool;
}
