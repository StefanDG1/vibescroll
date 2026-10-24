// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  infer: vi.fn(),
  google: vi.fn(),
  image: vi.fn(),
}));
vi.mock("../convex/lib/inference", () => ({ infer: mocks.infer }));
vi.mock("../convex/lib/googleInference", () => ({ inferGoogle: mocks.google }));
vi.mock("../packages/providers/project-source-images", () => ({
  loadProjectSourceImage: mocks.image,
}));
import { inferProject } from "../convex/lib/projectInference";
import type { ActionCtx } from "../convex/_generated/server";
const ctx = {} as ActionCtx;
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
it("refuses a withdrawn full-source approval after images load and before any inference disclosure", async () => {
  vi.stubEnv("MANAGED_INFERENCE_ROUTE", "google_metered");
  mocks.image.mockResolvedValue({
    data: "/9j/AA==",
    mimeType: "image/jpeg",
    sha256: "a".repeat(64),
    size: 4,
  });
  const authorize = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error("APPROVAL_STALE"));
  const dispatched = vi.fn();
  await expect(
    inferProject(
      ctx,
      {},
      "Synthetic prompt",
      { transcript: "Private synthetic text" },
      3000,
      {
        images: [
          {
            id: "fixture",
            key: "private/frame",
            size: 4,
            sha256: "a".repeat(64),
          },
        ],
      },
      authorize,
      dispatched,
    ),
  ).rejects.toThrow(/STALE/);
  expect(mocks.image).toHaveBeenCalledOnce();
  expect(dispatched).not.toHaveBeenCalled();
  expect(mocks.google).not.toHaveBeenCalled();
  expect(mocks.infer).not.toHaveBeenCalled();
});
it("checks authority before the first storage read and never changes routes to gain image support", async () => {
  vi.stubEnv("MANAGED_INFERENCE_ROUTE", "google_metered");
  await expect(
    inferProject(
      ctx,
      {},
      "prompt",
      {},
      3000,
      {
        images: [
          {
            id: "fixture",
            key: "private/frame",
            size: 4,
            sha256: "a".repeat(64),
          },
        ],
      },
      async () => {
        throw Error("withdrawn");
      },
      vi.fn(),
    ),
  ).rejects.toThrow(/withdrawn/);
  expect(mocks.image).not.toHaveBeenCalled();
  vi.stubEnv("MANAGED_INFERENCE_ROUTE", "convex_free");
  await expect(
    inferProject(
      ctx,
      {},
      "prompt",
      {},
      3000,
      {
        images: [
          {
            id: "fixture",
            key: "private/frame",
            size: 4,
            sha256: "a".repeat(64),
          },
        ],
      },
      async () => {},
      vi.fn(),
    ),
  ).rejects.toThrow(/cannot inspect images/);
  expect(mocks.google).not.toHaveBeenCalled();
  expect(mocks.infer).not.toHaveBeenCalled();
});
