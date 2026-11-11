import { ensure } from "../../packages/policy";

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
