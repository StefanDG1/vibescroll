export const assistantResource = "https://scroll.companynerve.com/mcp";
export const assistantScopes = [
  "knowledge:read",
  "context:read",
  "links:save",
  "jobs:read",
  "analysis:request",
  "feedback:write",
  "suggestions:draft",
  "events:subscribe",
] as const;
export type AssistantScope = (typeof assistantScopes)[number];
// null is an explicitly reviewed grant until revocation. Missing expiry is not.
export function assistantGrantActive(
  grant: { state: string; expiresAt: number | null } | null | undefined,
  now = Date.now(),
) {
  return (
    grant?.state === "active" &&
    (grant.expiresAt === null || grant.expiresAt > now)
  );
}
export function isAssistantScope(value: unknown): value is AssistantScope {
  return (
    typeof value === "string" &&
    assistantScopes.includes(value as AssistantScope)
  );
}
export function assistantIssuer(value: string | undefined) {
  if (!value || !/^https:\/\/[a-z0-9-]+\.authkit\.app$/.test(value))
    return null;
  return value;
}
export function isAssistantIdentity(identity: { issuer?: string } | null) {
  const issuer = assistantIssuer(process.env.MCP_AUTH_ISSUER);
  return !!issuer && identity?.issuer === issuer;
}
export function assistantClients() {
  try {
    const clients: unknown = JSON.parse(process.env.MCP_CLIENTS ?? "[]");
    if (!Array.isArray(clients) || clients.length > 4) return [];
    const parsed: { id: string; name: string; scopes: AssistantScope[] }[] = [];
    for (const client of clients) {
      if (
        !client ||
        typeof client !== "object" ||
        !("id" in client) ||
        !("name" in client) ||
        !("scopes" in client) ||
        typeof client.id !== "string" ||
        !/^client_[a-zA-Z0-9]{20,80}$/.test(client.id) ||
        typeof client.name !== "string" ||
        !client.name.trim() ||
        client.name.length > 80 ||
        !Array.isArray(client.scopes) ||
        !client.scopes.length ||
        !client.scopes.every((s: unknown) => isAssistantScope(s))
      )
        return [];
      parsed.push({
        id: client.id,
        name: client.name,
        scopes: [
          ...new Set<AssistantScope>(client.scopes.filter(isAssistantScope)),
        ],
      });
    }
    return new Set(parsed.map((c) => c.id)).size === parsed.length
      ? parsed
      : [];
  } catch {
    return [];
  }
}
