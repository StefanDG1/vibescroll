// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("../packages/providers/storage", () => ({
  signedObject: () => "https://fixture.invalid/private-frame",
}));
import { loadProjectSourceImage } from "../packages/providers/project-source-images";

const bytes = Buffer.from([255, 216, 255, 10, 20, 255, 217]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
it("loads actual bounded JPEG pixels with byte and version checks", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(bytes, { headers: { etag: '"' + "a".repeat(32) + '"' } }),
    );
  const loaded = await loadProjectSourceImage(
    {
      key: "frame",
      size: bytes.length,
      sha256,
      etag: "a".repeat(32),
    },
    fetcher,
  );
  expect(loaded).toEqual({
    data: bytes.toString("base64"),
    size: bytes.length,
    mimeType: "image/jpeg",
    sha256,
  });
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: "error",
    cache: "no-store",
  });
});
it("rejects changed object versions, hashes, sizes and unbound images", async () => {
  for (const headers of [
    { etag: "b".repeat(32) },
    { etag: "a".repeat(32), "content-length": "99" },
  ] as HeadersInit[]) {
    await expect(
      loadProjectSourceImage(
        { key: "frame", size: bytes.length, etag: "a".repeat(32) },
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(bytes, { headers })),
      ),
    ).rejects.toThrow();
  }
  await expect(
    loadProjectSourceImage(
      { key: "frame", size: bytes.length, sha256: "b".repeat(64) },
      vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes)),
    ),
  ).rejects.toThrow(/CHANGED/);
  await expect(
    loadProjectSourceImage({ key: "frame", size: bytes.length }),
  ).rejects.toThrow(/INVALID/);
  await expect(
    loadProjectSourceImage(
      { key: "frame", size: bytes.length - 1, sha256 },
      vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes)),
    ),
  ).rejects.toThrow(/CHANGED/);
});
