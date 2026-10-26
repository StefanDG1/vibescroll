import { setupDescriptor } from "../../../../../packages/widget/setup";
export function GET() {
  return Response.json(
    {
      ...setupDescriptor,
      widgetEnabled: process.env.MCP_WIDGET_ENABLED === "true",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
