import { backend, api } from "@/lib/backend";
import { signedObject } from "../../../../../../packages/providers/storage";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { jpegDimensions } from "../../../../../../packages/media/jpeg";
import { createHash } from "node:crypto";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
  Vary: "Cookie",
};
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const reference = (await params).id;
    if (reference.startsWith("catalog~")) {
      const [, sourceId, versionId, frameId, extra] = reference.split("~");
      if (extra !== undefined || !sourceId || !versionId || !frameId)
        throw Error("Invalid reference");
      const client = await backend(),
        binding = {
          sourceId: sourceId as Id<"sources">,
          versionId: versionId as Id<"analysisVersions">,
          frameId,
        };
      const frame = await client.mutation(
        api.analysisVersions.sharedFrame,
        binding,
      );
      const response = await fetch(signedObject(frame.key, "GET", 15), {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (
        !response.ok ||
        response.headers.get("content-type")?.split(";")[0] !== "image/jpeg" ||
        !response.body
      )
        throw Error("Unavailable");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > frame.size || size > 150000) throw Error("Frame limit");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const bytes = Buffer.concat(chunks),
        dimensions = jpegDimensions(bytes);
      if (
        bytes.length !== frame.size ||
        createHash("sha256").update(bytes).digest("hex") !== frame.sha256 ||
        dimensions.width !== frame.width ||
        dimensions.height !== frame.height
      )
        throw Error("Frame changed");
      const current = await client.mutation(
        api.analysisVersions.sharedFrame,
        binding,
      );
      if (JSON.stringify(current) !== JSON.stringify(frame))
        throw Error("Authority changed");
      return new Response(bytes, {
        headers: { ...privateHeaders, "Content-Type": "image/jpeg" },
      });
    }
    const asset = await (
      await backend()
    ).query(api.assets.evidence, { id: (await params).id as Id<"assets"> });
    const url = signedObject(asset.key, "GET", 60);
    if (new URL(req.url).searchParams.get("inline") === "true") {
      if (asset.type !== "image/jpeg") throw new Error("Not an image");
      const image = await fetch(url, {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!image.ok || !image.body) throw new Error("Unavailable");
      const reader = image.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > 1000000) throw new Error("Frame limit");
          chunks.push(item.value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
        throw new Error("Invalid image");
      return new Response(bytes, {
        headers: {
          "Content-Type": "image/jpeg",
          ...privateHeaders,
        },
      });
    }
    if (new URL(req.url).searchParams.get("view") === "true")
      return new Response(null, {
        status: 302,
        headers: {
          Location: url,
          ...privateHeaders,
        },
      });
    return Response.json(
      { url },
      {
        headers: {
          ...privateHeaders,
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Evidence unavailable." },
      { status: 404, headers: privateHeaders },
    );
  }
}
