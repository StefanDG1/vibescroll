import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { syntheticJpeg } from "../../tests/cloud-frame-fixture";
const mock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./lib/backend", () => ({
  backend: async () => ({ query: mock.query }),
  api: { analysisVersions: { sharedFrame: "sharedFrame" } },
}));
vi.mock("../../packages/providers/storage", () => ({
  signedObject: () => "https://storage.example.test/private-signed-frame",
}));
import { GET } from "./app/api/evidence/[id]/route";
const bytes = Buffer.from(syntheticJpeg, "base64");
const frame = {
  key: "catalog/synthetic-service/opaque/frame.jpg",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  size: bytes.length,
  width: 2,
  height: 2,
  retainUntil: Date.now() + 600000,
};
const binding = {
  params: Promise.resolve({
    id: "catalog~synthetic-source~synthetic-version~frame-1",
  }),
};
beforeEach(() => {
  mock.query.mockResolvedValue(frame);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("proxies exact verified shared pixels privately and never redirects or returns storage capabilities", async () => {
  const response = await GET(
    new Request("https://example.test/api/evidence/reference?view=true"),
    binding,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(mock.query).toHaveBeenCalledTimes(2);
  expect(mock.query.mock.calls[0][1]).toEqual({
    sourceId: "synthetic-source",
    versionId: "synthetic-version",
    frameId: "frame-1",
  });
});
it("rejects an image whose bytes changed after retention", async () => {
  const changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(changed, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const response = await GET(
    new Request("https://example.test/api/evidence/reference?inline=true"),
    binding,
  );
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("storage.example.test");
});
it("rechecks entitlement and source authority after storage IO before returning any shared image bytes", async () => {
  mock.query
    .mockResolvedValueOnce(frame)
    .mockRejectedValueOnce(Error("revoked during IO"));
  const response = await GET(
    new Request("https://example.test/api/evidence/reference"),
    binding,
  );
  expect(response.status).toBe(404);
  expect(await response.text()).toContain("Evidence unavailable");
});
