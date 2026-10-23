import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
const state = vi.hoisted(() => ({
  mutation: vi.fn(),
  backend: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("@/lib/backend", async () => ({
  api: (await import("../../convex/_generated/api")).api,
  backend: state.backend,
}));
vi.mock("../../packages/providers/storage", () => ({
  signedUploadObject: state.signed,
}));
import { POST } from "./app/api/uploads/batch-grant/route";
import { POST as grant } from "./app/api/uploads/grant/route";
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://uploads.example.test");
  state.backend.mockResolvedValue({ mutation: state.mutation });
  state.mutation.mockResolvedValue({ count: 2 });
  state.signed.mockImplementation(
    (key) => `https://storage.example.test/${key}`,
  );
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
function request(body: unknown, origin = "https://uploads.example.test") {
  return new Request("https://uploads.example.test/api/uploads/batch-grant", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(body),
  });
}
it("dispatches one authenticated batch and returns ordered server-generated keys only after backend acceptance", async () => {
  const files = [
    { size: 10, type: "image/png" },
    { size: 20, type: "video/mp4" },
  ];
  const response = await POST(
    request({ organizationId: "synthetic-workspace", files }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(state.mutation).toHaveBeenCalledTimes(1);
  const [reference, args] = state.mutation.mock.calls[0];
  expect(getFunctionName(reference)).toBe("assets:grantBatch");
  expect(args.files.map(({ size, type }: any) => ({ size, type }))).toEqual(
    files,
  );
  expect(new Set(args.files.map((file: any) => file.key)).size).toBe(2);
  for (let index = 0; index < files.length; index++)
    expect(state.signed).toHaveBeenNthCalledWith(
      index + 1,
      args.files[index].key,
      files[index],
      300,
    );
  expect((await response.json()).uploads.map((file: any) => file.key)).toEqual(
    args.files.map((file: any) => file.key),
  );
});
it("binds the legacy single-file route's signature to the same exact grant metadata", async () => {
  const response = await grant(
    request({
      organizationId: "synthetic-workspace",
      size: 100,
      type: "video/mp4",
    }),
  );
  expect(response.status).toBe(200);
  const [reference, args] = state.mutation.mock.calls[0];
  expect(getFunctionName(reference)).toBe("assets:grant");
  expect(state.signed).toHaveBeenCalledWith(
    args.key,
    { size: 100, type: "video/mp4" },
    300,
  );
});
it("denies foreign origin, oversized bodies and invalid counts before backend dispatch", async () => {
  expect(
    (
      await POST(
        request(
          {
            organizationId: "synthetic",
            files: [{ size: 1, type: "image/png" }],
          },
          "https://foreign.example.test",
        ),
      )
    ).status,
  ).toBe(403);
  for (const files of [
    [],
    Array.from({ length: 36 }, () => ({ size: 1, type: "image/png" })),
  ])
    expect(
      (await POST(request({ organizationId: "synthetic", files }))).status,
    ).toBe(400);
  expect((await POST(request({ padding: "x".repeat(17000) }))).status).toBe(
    400,
  );
  expect(state.backend).not.toHaveBeenCalled();
});
it("does not return signed URLs when authorization or storage reservation fails", async () => {
  state.mutation.mockRejectedValue(new Error("private backend detail"));
  const response = await POST(
    request({
      organizationId: "synthetic",
      files: [{ size: 1, type: "image/png" }],
    }),
  );
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.uploads).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("private backend detail");
});
