import { z } from "zod";
export const inferenceBodyLimit = 3_900_000;
export const inferencePayload = z.strictObject({
  prompt: z.string().min(1).max(64000),
  schema: z.record(z.string(), z.unknown()),
  parts: z
    .array(
      z.union([
        z.strictObject({ text: z.string().max(200000) }),
        z.strictObject({
          inlineData: z.strictObject({
            mimeType: z.enum(["image/jpeg", "audio/mpeg", "audio/wav"]),
            data: z
              .string()
              .min(4)
              .max(3_800_000)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          }),
        }),
      ]),
    )
    .min(1)
    .max(33),
  maxOutput: z.number().int().min(128).max(8192),
  maxMicros: z.number().int().min(1).max(100000),
});
const envelope = z.strictObject({
  purpose: z.literal("vibescroller-google-inference"),
  at: z.number().int(),
  key: z.string().uuid(),
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  maxMicros: z.number().int().min(1).max(100000),
});
export type InferencePayload = z.infer<typeof inferencePayload>;
const encoder = new TextEncoder();
async function hmacKey(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw Error("Inference broker unavailable.");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function inferenceDigest(body: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(body)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function signInference(body: string, secret: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await hmacKey(secret),
        encoder.encode(body),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function verifyInference(
  body: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  if (
    encoder.encode(body).byteLength > 512 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return null;
  try {
    const request = envelope.parse(JSON.parse(body));
    if (request.at > now + 5000 || request.at < now - 30000) return null;
    const bytes = Uint8Array.from(
      signature.match(/../g)!.map((n) => parseInt(n, 16)),
    );
    return (await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      bytes,
      encoder.encode(body),
    ))
      ? request
      : null;
  } catch {
    return null;
  }
}
