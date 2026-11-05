// Pure local error. acquisition.ts adapts it to the existing Convex error type.
export class AcquisitionPolicyError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.detail = detail;
    this.name = "AcquisitionPolicyError";
  }
}
export function ensure(ok, code, detail) {
  if (!ok) throw new AcquisitionPolicyError(code, detail);
}
export function safeSourceUrl(raw) {
  const url = new URL(raw);
  ensure(
    url.protocol === "https:" && !url.username && !url.password && !url.port,
    "UNSUPPORTED_SOURCE",
    "Use an HTTPS source URL without credentials or a port.",
  );
  const hosts = [
    "youtube.com",
    "www.youtube.com",
    "youtu.be",
    "instagram.com",
    "www.instagram.com",
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
    "vimeo.com",
    "www.vimeo.com",
  ];
  ensure(
    hosts.includes(url.hostname.toLowerCase()),
    "UNSUPPORTED_SOURCE",
    "This source requires a permitted upload or supplied transcript.",
  );
  // oxlint-disable-next-line unicorn/no-useless-spread -- Copy before deleting from this mutable iterator.
  for (const key of [...url.searchParams.keys()])
    if (key !== "v" && key !== "t") url.searchParams.delete(key);
  url.hash = "";
  return url.toString();
}
