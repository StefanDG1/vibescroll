import { allowedRequestOrigin } from "@/lib/request-origin";

export function POST(req: Request) {
  if (!allowedRequestOrigin(req))
    return Response.json({ error: "Origin denied." }, { status: 403 });
  return Response.json(
    { error: "Save the original post link." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
