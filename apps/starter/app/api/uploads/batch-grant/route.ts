import { randomUUID } from "node:crypto";
import { backend, api } from "@/lib/backend";
import { allowedRequestOrigin } from "@/lib/request-origin";
import { signedUploadObject } from "../../../../../../packages/providers/storage";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export async function POST(req: Request) {
  if (!allowedRequestOrigin(req))
    return Response.json({ error: "Origin denied." }, { status: 403 });
  try {
    const reader = req.body?.getReader();
    if (!reader)
      return Response.json(
        { error: "Upload request is empty." },
        { status: 400 },
      );
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) {
        await reader.cancel();
        return Response.json(
          { error: "Upload request is too large." },
          { status: 400 },
        );
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const input = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(body),
    );
    if (
      typeof input.organizationId !== "string" ||
      !Array.isArray(input.files) ||
      input.files.length < 1 ||
      input.files.length > 35 ||
      input.files.some(
        (file: any) =>
          !file ||
          !Number.isSafeInteger(file.size) ||
          file.size <= 0 ||
          typeof file.type !== "string",
      )
    )
      return Response.json(
        { error: "Choose between 1 and 35 supported files." },
        { status: 400 },
      );
    const files = input.files.map((file: { size: number; type: string }) => ({
      key: `${input.organizationId}/${randomUUID()}`,
      size: file.size,
      type: file.type,
    }));
    const uploads = files.map(
      (file: { key: string; size: number; type: string }) => ({
        key: file.key,
        url: signedUploadObject(
          file.key,
          { size: file.size, type: file.type },
          300,
        ),
      }),
    );
    await (
      await backend()
    ).mutation(api.assets.grantBatch, {
      organizationId: input.organizationId as Id<"organizations">,
      files,
    });
    return Response.json(
      { uploads },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Private upload permission failed. Check your workspace storage allowance and retry. Uploads require configured EU storage.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
