import { afterEach, expect, it, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";
vi.mock("../packages/providers/storage", () => ({
  signedObject: () => "https://storage.example.test/retained-frame",
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("returns actual verified retained pixels and acknowledges them only after a fresh authority check", async () => {
  const s = await analysisVersionFixture();
  const attempt = await s.request();
  const claim = await s.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: s.sourceId,
    attemptId: attempt.attemptId,
    taskId: "frame-test",
    operation: "claim",
  });
  const args = {
    sourceId: s.sourceId,
    attemptId: attempt.attemptId,
    taskId: "frame-test",
    leaseToken: claim.leaseToken!,
    frameId: "frame-1",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(s.bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const result = await s.assistant.action(
    internal.analysisVersionFrames.read,
    args,
  );
  expect(result.mimeType).toBe("image/jpeg");
  expect(Buffer.from(result.data, "base64")).toEqual(Buffer.from(s.bytes));
  expect(
    (await s.t.run((ctx) => ctx.db.get(attempt.attemptId)))?.viewedFrameIds,
  ).toEqual(["frame-1"]);
});
it.each(["changed_bytes", "oversize", "revoked_during_read"])(
  "rejects %s before disclosing or acknowledging pixels",
  async (failure) => {
    const s = await analysisVersionFixture();
    const attempt = await s.request();
    const claim = await s.assistant.mutation(
      internal.analysisVersions.dispatch,
      {
        sourceId: s.sourceId,
        attemptId: attempt.attemptId,
        taskId: "frame-test",
        operation: "claim",
      },
    );
    const args = {
      sourceId: s.sourceId,
      attemptId: attempt.attemptId,
      taskId: "frame-test",
      leaseToken: claim.leaseToken!,
      frameId: "frame-1",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (failure === "revoked_during_read")
          await s.t.run((ctx) =>
            ctx.db.patch(s.grant.id, { state: "revoked" }),
          );
        const bytes =
          failure === "oversize" ? new Uint8Array(150001) : s.bytes.slice();
        if (failure === "changed_bytes") bytes[bytes.length - 1] ^= 1;
        return new Response(bytes, {
          headers: { "content-type": "image/jpeg" },
        });
      }),
    );
    await expect(
      s.assistant.action(internal.analysisVersionFrames.read, args),
    ).rejects.toThrow();
    expect(
      (await s.t.run((ctx) => ctx.db.get(attempt.attemptId)))?.viewedFrameIds,
    ).toEqual([]);
  },
);
