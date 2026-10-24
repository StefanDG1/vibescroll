import { createHash } from "node:crypto";
import { signedObject } from "./storage";

type Image = { key: string; size: number; sha256?: string; etag?: string };

// Only server-resolved private object descriptors may reach this function.
// URLs from a source, model output or caller are never accepted.
export async function loadProjectSourceImage(
  image: Image,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  data: string;
  mimeType: "image/jpeg";
  sha256: string;
  size: number;
}> {
  if (
    !image.key ||
    !Number.isSafeInteger(image.size) ||
    image.size <= 0 ||
    image.size > 1000000 ||
    (image.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(image.sha256)) ||
    (!image.sha256 &&
      (!image.etag || !/^"?[a-fA-F0-9-]{16,100}"?$/.test(image.etag)))
  )
    throw Error("PROJECT_SOURCE_IMAGE_INVALID");
  const response = await fetchImpl(signedObject(image.key, "GET", 120), {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const length = response.headers.get("content-length");
  const etag = (value: string) => value.replace(/^"|"$/g, "");
  if (
    !response.ok ||
    !response.body ||
    (length !== null && Number(length) !== image.size) ||
    (image.etag &&
      etag(response.headers.get("etag") ?? "") !== etag(image.etag))
  )
    throw Error("PROJECT_SOURCE_IMAGE_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > image.size) throw Error("PROJECT_SOURCE_IMAGE_CHANGED");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    size !== image.size ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9 ||
    (image.sha256 !== undefined && sha256 !== image.sha256)
  )
    throw Error("PROJECT_SOURCE_IMAGE_CHANGED");
  return {
    data: bytes.toString("base64"),
    mimeType: "image/jpeg",
    sha256,
    size,
  };
}
