import {
  readFile,
  readdir,
  realpath,
  lstat,
  unlink,
  rmdir,
} from "node:fs/promises";
import { resolve, join, sep, dirname } from "node:path";
import { companionPreparationRoot } from "../companion/config-root.mjs";
export async function purgeLocalPreparation(directory, now = Date.now()) {
  const root = companionPreparationRoot(),
    base = dirname(root),
    path = resolve(directory);
  if (
    !path.startsWith(root + sep) ||
    !/^[a-f0-9-]{36}$/.test(path.slice(root.length + 1)) ||
    (await realpath(base)) !== base ||
    (await realpath(root)) !== root ||
    (await realpath(path)) !== path
  )
    throw Error("LOCAL_RETENTION_PATH_INVALID");
  const marker = join(path, "retention.json"),
    stat = await lstat(marker);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
    throw Error("LOCAL_RETENTION_MARKER_INVALID");
  const record = JSON.parse(await readFile(marker, "utf8"));
  if (
    record.owner !== "vibescroller-local-preparation" ||
    !Number.isSafeInteger(record.expiresAt)
  )
    throw Error("LOCAL_RETENTION_MARKER_INVALID");
  if (record.expiresAt > now)
    return { purged: false, expiresAt: record.expiresAt };
  const known = new Set([
    "request.json",
    "policy.json",
    "acquisition.json",
    "manifest.json",
    "receipt.json",
    "transcript.json",
    "retention.json",
    "audio.wav",
  ]);
  const targets = [];
  for (const file of await readdir(path)) {
    if (file === "retention.json") continue;
    if (!known.has(file) && !/^frame-[0-9]{3}\.jpg$/.test(file)) continue;
    const target = join(path, file),
      entry = await lstat(target);
    if (entry.isSymbolicLink() || !entry.isFile())
      throw Error("LOCAL_RETENTION_OUTPUT_INVALID");
    targets.push(target);
  }
  // Validate all owned outputs first; preserve the marker for interrupted retries.
  for (const target of targets) await unlink(target);
  await unlink(marker);
  // Preserve any unrelated file the owner added; never recursively delete.
  await rmdir(path).catch((e) => {
    if (!["ENOTEMPTY", "EEXIST"].includes(e.code)) throw e;
  });
  return { purged: true };
}
