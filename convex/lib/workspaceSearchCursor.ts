import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { workspaceSearchCursor } from "../../packages/contracts/workspace-search";
import { ensure } from "../../packages/policy";
import type { z } from "zod";

const purpose = "vibescroll-ranked-workspace-search-v1\n";
export async function rankedCursorKey() {
  const secret = process.env.WORKSPACE_SEARCH_CURSOR_SECRET ?? "";
  ensure(
    /^[a-f0-9]{64}$/.test(secret),
    "POLICY_BLOCKED",
    "Ranked search cursor signing is not configured.",
  );
  const bytes = Uint8Array.from(secret.match(/../g)!, (part) =>
    Number.parseInt(part, 16),
  );
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function signRankedCursor(
  key: CryptoKey,
  value: z.infer<typeof workspaceSearchCursor>,
) {
  const payload = canonicalJson(workspaceSearchCursor.parse(value));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(purpose + payload),
    ),
  );
  const mac = Array.from(signature, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const result = JSON.stringify({ payload, mac });
  ensure(
    result.length <= 4096,
    "POLICY_BLOCKED",
    "Search continuation exceeds its bound. Narrow the query.",
  );
  return result;
}
export async function readRankedCursor(key: CryptoKey, token: string) {
  ensure(
    token.length <= 4096,
    "INVALID_INPUT",
    "Invalid workspace search cursor.",
  );
  let envelope: unknown;
  try {
    envelope = JSON.parse(token);
  } catch {
    ensure(false, "INVALID_INPUT", "Invalid workspace search cursor.");
  }
  ensure(
    envelope &&
      typeof envelope === "object" &&
      Object.keys(envelope).length === 2 &&
      "payload" in envelope &&
      "mac" in envelope &&
      typeof envelope.payload === "string" &&
      envelope.payload.length <= 3800 &&
      typeof envelope.mac === "string" &&
      /^[a-f0-9]{64}$/.test(envelope.mac),
    "INVALID_INPUT",
    "Invalid workspace search cursor.",
  );
  const signature = Uint8Array.from(envelope.mac.match(/../g)!, (part) =>
    Number.parseInt(part, 16),
  );
  ensure(
    await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(purpose + envelope.payload),
    ),
    "INVALID_INPUT",
    "Invalid workspace search cursor.",
  );
  try {
    return workspaceSearchCursor.parse(JSON.parse(envelope.payload));
  } catch {
    ensure(false, "INVALID_INPUT", "Invalid workspace search cursor.");
  }
}
