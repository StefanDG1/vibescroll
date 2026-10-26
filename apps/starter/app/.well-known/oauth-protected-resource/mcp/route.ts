import {
  assistantClients,
  assistantIssuer,
  assistantResource,
} from "../../../../../../packages/policy/assistant";
export function GET() {
  const issuer = assistantIssuer(process.env.MCP_AUTH_ISSUER);
  if (process.env.MCP_ENABLED !== "true" || !issuer)
    return Response.json(
      { error: "Assistant access is being prepared." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    {
      resource: assistantResource,
      resource_name: "VibeScroll saved knowledge",
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: [
        ...new Set(
          assistantClients()
            .flatMap((c) => c.scopes)
            .filter(
              (scope) =>
                scope !== "knowledge:write" ||
                process.env.MCP_WIDGET_LIBRARY_EDITING_ENABLED === "true",
            ),
        ),
      ],
      resource_documentation: "https://scroll.companynerve.com/docs",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
