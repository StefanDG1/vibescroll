"use node";
import { createHash } from "node:crypto";
import { signedObject } from "../../packages/providers/storage";
import { jpegDimensions } from "../../packages/media/jpeg";
import { ensure } from "../../packages/policy";

/** Node-action-only helper. The caller must check authority before and after I/O. */
export async function readRetainedJpeg(frame: {
  key: string;
  size: number;
  width: number;
  height: number;
  sha256: string;
}) {
  ensure(
    frame.size > 0 && frame.size <= 150000,
    "INVALID_EVIDENCE",
    "Retained image exceeds its bound.",
  );
  const response = await fetch(signedObject(frame.key, "GET", 30), {
    redirect: "error",
    signal: AbortSignal.timeout(6000),
  });
  ensure(
    response.ok &&
      response.headers.get("content-type")?.split(";")[0] === "image/jpeg",
    "STORAGE_UNAVAILABLE",
    "The retained JPEG is unavailable.",
  );
  const reader = response.body?.getReader();
  ensure(reader, "STORAGE_UNAVAILABLE", "The retained JPEG has no body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      ensure(
        total <= frame.size,
        "INVALID_EVIDENCE",
        "Retained image exceeds its bound.",
      );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = Buffer.concat(chunks),
    dimensions = jpegDimensions(bytes);
  ensure(
    bytes.length === frame.size &&
      dimensions.width === frame.width &&
      dimensions.height === frame.height &&
      createHash("sha256").update(bytes).digest("hex") === frame.sha256,
    "INVALID_EVIDENCE",
    "Retained image bytes changed.",
  );
  return bytes;
}
