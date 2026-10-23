import { createHash, createHmac } from "node:crypto";
import { ensure } from "../policy";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (key: string | Buffer, s: string) =>
  createHmac("sha256", key).update(s).digest();
const encode = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
export type UploadConstraint = { size: number; type: string };
export function signedObject(
  key: string,
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  expires = 300,
  now = new Date(),
  upload?: UploadConstraint,
) {
  ensure(
    !upload ||
      (method === "PUT" &&
        Number.isSafeInteger(upload.size) &&
        upload.size > 0 &&
        upload.size <= 250000000 &&
        typeof upload.type === "string" &&
        upload.type.length <= 100 &&
        /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(upload.type)),
    "INVALID_INPUT",
    "Upload grants require an exact bounded byte length and MIME type.",
  );
  const endpoint = process.env.R2_ENDPOINT,
    bucket = process.env.R2_BUCKET,
    access = process.env.R2_ACCESS_KEY_ID,
    secret = process.env.R2_SECRET_ACCESS_KEY;
  ensure(
    endpoint && bucket && access && secret,
    "STORAGE_UNAVAILABLE",
    "Private EU storage is not configured.",
  );
  const host = new URL(endpoint).hostname;
  ensure(
    host.endsWith(".eu.r2.cloudflarestorage.com"),
    "STORAGE_JURISDICTION_REQUIRED",
    "Use the explicit EU-jurisdiction storage endpoint.",
  );
  ensure(
    !key.split("/").some((s) => s === ".." || !s) && !key.includes("\\"),
    "INVALID_INPUT",
    "Invalid object key.",
  );
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, ""),
    day = date.slice(0, 8),
    scope = `${day}/auto/s3/aws4_request`,
    path = `/${encode(bucket)}/${key.split("/").map(encode).join("/")}`;
  const signedHeaders = upload ? "content-length;content-type;host" : "host";
  const canonicalHeaders = upload
    ? `content-length:${upload.size}\ncontent-type:${upload.type}\nhost:${host}\n`
    : `host:${host}\n`;
  const fields: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${access}/${scope}`,
    "X-Amz-Date": date,
    "X-Amz-Expires": String(Math.min(expires, 900)),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const query = Object.keys(fields)
    .sort()
    .map((k) => `${encode(k)}=${encode(fields[k])}`)
    .join("&");
  const request = [
    method,
    path,
    query,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const signing = hmac(
    hmac(hmac(hmac(`AWS4${secret}`, day), "auto"), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signing)
    .update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(request)}`)
    .digest("hex");
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}
/** Browser File PUT: the browser supplies Content-Length, callers set Content-Type.
 * These headers constrain authorization; UNSIGNED-PAYLOAD does not bind content.
 */
export function signedUploadObject(
  key: string,
  constraint: UploadConstraint,
  expires = 300,
  now = new Date(),
) {
  return signedObject(key, "PUT", expires, now, constraint);
}
export async function deleteObject(key: string) {
  const res = await fetch(signedObject(key, "DELETE"), {
    method: "DELETE",
    signal: AbortSignal.timeout(15000),
  });
  ensure(
    res.ok,
    "STORAGE_UNAVAILABLE",
    "Object deletion failed and must retry.",
  );
}
export async function objectMetadata(key: string) {
  const res = await fetch(signedObject(key, "HEAD"), {
    method: "HEAD",
    signal: AbortSignal.timeout(15000),
  });
  ensure(res.ok, "UPLOAD_INCOMPLETE", "The private upload is unavailable.");
  return {
    size: Number(res.headers.get("content-length")),
    type: res.headers.get("content-type"),
    etag: res.headers.get("etag"),
  };
}
