import {
  setupDescriptor,
  embeddedUiEnabled,
} from "../../../../../packages/widget/setup";
export function GET() {
  return Response.json(
    {
      ...setupDescriptor,
      widgetEnabled: embeddedUiEnabled,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
