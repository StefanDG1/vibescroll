import { setupInstructions } from "../../../../../packages/widget/setup";
export function GET() {
  return new Response(setupInstructions, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
