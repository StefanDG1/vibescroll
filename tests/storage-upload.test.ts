import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  signedObject,
  signedUploadObject,
} from "../packages/providers/storage";
const now = new Date("2026-10-23T10:00:00.000Z");
const secret = "synthetic-upload-signature-secret-not-a-credential";
beforeEach(() => {
  vi.stubEnv("R2_ENDPOINT", "https://synthetic.eu.r2.cloudflarestorage.com");
  vi.stubEnv("R2_BUCKET", "synthetic-private");
  vi.stubEnv("R2_ACCESS_KEY_ID", "synthetic-upload-key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", secret);
});
afterEach(() => vi.unstubAllEnvs());

// Independent receiver-side SigV4 verification using Web Crypto. Header values
// come from an observed request, never from the grant's declared constraints.
async function verify(
  urlString: string,
  method: string,
  headers: Headers,
  body: Uint8Array,
) {
  const url = new URL(urlString);
  const names = url.searchParams.get("X-Amz-SignedHeaders")!.split(";");
  if (
    method === "PUT" &&
    headers.get("content-length") !== String(body.byteLength)
  )
    return false;
  const values = names.map((name) =>
    name === "host" ? url.host : headers.get(name),
  );
  if (values.some((value) => value === null)) return false;
  const canonicalHeaders = names
    .map(
      (name, index) =>
        `${name}:${values[index]!.trim().replace(/\s+/g, " ")}\n`,
    )
    .join("");
  const canonicalQuery = url.search
    .slice(1)
    .split("&")
    .filter((part) => !part.startsWith("X-Amz-Signature="))
    .sort()
    .join("&");
  const canonical = [
    method,
    url.pathname,
    canonicalQuery,
    canonicalHeaders,
    names.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const encode = (value: string) => new TextEncoder().encode(value);
  const hex = (bytes: ArrayBuffer) =>
    Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  const sign = async (key: Uint8Array, message: string) =>
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await crypto.subtle.importKey(
          "raw",
          new Uint8Array(key).buffer,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        ),
        encode(message),
      ),
    );
  const date = url.searchParams.get("X-Amz-Date")!;
  const [access, day, region, service, terminal] = url.searchParams
    .get("X-Amz-Credential")!
    .split("/");
  if (access !== "synthetic-upload-key" || terminal !== "aws4_request")
    return false;
  let key = encode(`AWS4${secret}`);
  for (const part of [day, region, service, terminal])
    key = await sign(key, part);
  const digest = hex(await crypto.subtle.digest("SHA-256", encode(canonical)));
  const actual = hex(
    (
      await sign(
        key,
        `AWS4-HMAC-SHA256\n${date}\n${day}/${region}/${service}/${terminal}\n${digest}`,
      )
    ).buffer as ArrayBuffer,
  );
  return actual === url.searchParams.get("X-Amz-Signature");
}
it("authorizes exactly the declared browser File size and MIME type", async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4])], "synthetic.wav", {
    type: "audio/wav",
  });
  const url = signedUploadObject(
    "workspace/owned audio.wav",
    { size: file.size, type: file.type },
    300,
    now,
  );
  expect(new URL(url).searchParams.get("X-Amz-SignedHeaders")).toBe(
    "content-length;content-type;host",
  );
  expect(
    await verify(
      url,
      "PUT",
      new Headers({
        "Content-Type": file.type,
        "Content-Length": String(file.size),
      }),
      new Uint8Array(await file.arrayBuffer()),
    ),
  ).toBe(true);
});
it.each([
  "longer",
  "shorter",
  "type",
  "missing_length",
  "missing_type",
  "unsigned_length",
])(
  "refuses %s upload requests with the independent receiver",
  async (change) => {
    const url = new URL(
      signedUploadObject(
        "workspace/owned",
        { size: 4, type: "audio/wav" },
        300,
        now,
      ),
    );
    const headers = new Headers({
      "Content-Type": "audio/wav",
      "Content-Length": "4",
    });
    let body = new Uint8Array([1, 2, 3, 4]);
    if (change === "longer" || change === "shorter") {
      body = new Uint8Array(change === "longer" ? 5 : 3);
      headers.set("content-length", String(body.byteLength));
    }
    if (change === "type") headers.set("content-type", "video/mp4");
    if (change === "missing_length") headers.delete("content-length");
    if (change === "missing_type") headers.delete("content-type");
    if (change === "unsigned_length")
      url.searchParams.set("X-Amz-SignedHeaders", "content-type;host");
    expect(await verify(url.toString(), "PUT", headers, body)).toBe(false);
  },
);
it("does not claim payload integrity and preserves existing server PUT/read/delete signing", async () => {
  const constrained = signedUploadObject(
    "workspace/owned",
    { size: 4, type: "audio/wav" },
    300,
    now,
  );
  expect(
    await verify(
      constrained,
      "PUT",
      new Headers({ "Content-Type": "audio/wav", "Content-Length": "4" }),
      new Uint8Array([9, 9, 9, 9]),
    ),
  ).toBe(true);
  for (const method of ["GET", "HEAD", "DELETE"] as const) {
    const url = signedObject("workspace/owned", method, 60, now);
    expect(new URL(url).searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(await verify(url, method, new Headers(), new Uint8Array())).toBe(
      true,
    );
  }
  expect(
    new URL(signedObject("workspace/owned", "PUT", 60, now)).searchParams.get(
      "X-Amz-SignedHeaders",
    ),
  ).toBe("host");
});
it("refuses invalid bounds and header injection before issuing a grant", () => {
  for (const size of [0, -1, 0.5, NaN, Infinity, 250000001])
    expect(() =>
      signedUploadObject(
        "workspace/owned",
        { size, type: "video/mp4" },
        300,
        now,
      ),
    ).toThrow("INVALID_INPUT");
  for (const type of [
    "",
    "video/mp4\r\nx-extra: yes",
    "audio/wav; charset=utf-8",
    " audio/wav",
  ])
    expect(() =>
      signedUploadObject("workspace/owned", { size: 4, type }, 300, now),
    ).toThrow("INVALID_INPUT");
});
