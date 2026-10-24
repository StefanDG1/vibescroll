import { assistantResource } from "./assistant";
export async function readAssistantBody(
  request: Request | Response,
  maximum = 32768,
  operationMaximum?: (value: unknown) => number,
) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum))
    throw Error("Request too large.");
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw Error("Request too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(data),
  );
  if (operationMaximum && size > operationMaximum(value))
    throw Error("Request too large for this operation.");
  return value as any;
}
export function validateAssistantUserinfo(value: unknown, subject: string) {
  return (
    !!value &&
    typeof value === "object" &&
    "sub" in value &&
    value.sub === subject
  );
}

/** Server clients may omit Origin; browser requests must name the exact HTTPS origin. */
export function assistantRequestAllowed(request: Request) {
  const canonical = new URL(assistantResource);
  const origin = request.headers.get("origin");
  return (
    request.headers.get("host") === canonical.host &&
    (origin === null || origin === canonical.origin)
  );
}
