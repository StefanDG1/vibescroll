import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { searchEmbeddings } from "../../../../../../packages/search/embedding.node";

export const runtime = "nodejs";
export const maxDuration = 30;

const input = z.strictObject({
  texts: z.array(z.string().min(1).max(2400)).min(1).max(16),
});
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const secret = process.env.WORKSPACE_SEARCH_EMBEDDING_SECRET;
  const presented = request.headers.get("Authorization") ?? "";
  if (
    !secret ||
    !/^[a-f0-9]{64}$/.test(secret) ||
    !/^Bearer [a-f0-9]{64}$/.test(presented) ||
    !timingSafeEqual(Buffer.from(presented), Buffer.from(`Bearer ${secret}`))
  )
    return new Response(null, { status: 404, headers });

  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400, headers });
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 100_000) {
      await reader.cancel();
      return new Response(null, { status: 413, headers });
    }
    chunks.push(value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return new Response(null, { status: 400, headers });
  }
  const parsed = input.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400, headers });
  try {
    return Response.json(
      { vectors: await searchEmbeddings(parsed.data.texts) },
      { headers },
    );
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
