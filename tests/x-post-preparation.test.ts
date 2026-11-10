import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
const state = vi.hoisted(() => ({
  events: [] as string[],
  failSetup: false,
  text: "Full caption. ".repeat(2500),
}));
const canonical = "https://x.com/i/web/status/1234567890123456789";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
vi.mock("../packages/media/x-gallery.lock.json", () => ({
  default: {
    wheels: [
      {
        name: "synthetic",
        version: "1",
        url: "https://example.test/wheel",
        sha256:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    ],
  },
}));
vi.mock("../packages/providers/acquisition-isolation", () => ({
  hardenAcquisition: async () => {
    state.events.push("broker_ready");
  },
}));
vi.mock("../packages/providers/isolation", () => ({
  hardenSandbox: async () => {
    state.events.push("decoder_denied_network");
  },
}));
vi.mock("../packages/providers/sandbox", () => ({
  createJobSandbox: async () => ({
    sandboxId: "vercel:synthetic-x-job",
    files: {
      write: async () => {},
      read: async (path: string, options?: { format: string }) => {
        if (path.endsWith("metadata.json"))
          return JSON.stringify({
            title: "X post",
            authorName: "Author",
            resolvedCanonical: canonical,
          });
        if (!path.endsWith("x-result.json") || options?.format !== "bytes")
          throw Error("bounded_binary_manifest_required");
        const assets: unknown[] = [];
        return new TextEncoder().encode(
          JSON.stringify({
            post: {
              version: "x-post-evidence-v1",
              postId: "1234567890123456789",
              provider: "gallery-dl",
              text: state.text,
              textHash: hash(state.text),
              assets,
              expectedAssetCount: 0,
              coverage: "complete_manifest",
            },
            durationMs: 0,
            frames: [],
            audios: [],
            sourceHash: hash(
              canonicalJson({ canonical, text: state.text, assets }),
            ),
            sourceBytes: 0,
            ffmpegVersion: "synthetic",
            ffprobeVersion: "synthetic",
            pythonVersion: "3.12",
          }),
        );
      },
    },
    commands: {
      run: async (command: string) => {
        if (!state.events.includes("broker_ready"))
          throw Error("user_command_before_broker_ready");
        const stage = command.split(" ").at(-1)!;
        state.events.push(stage);
        return {
          exitCode: state.failSetup && stage === "setup" ? 1 : 0,
          stdout: "",
          stderr: "",
        };
      },
    },
    kill: async () => {
      state.events.push("stopped");
    },
  }),
}));
import { prepareHostedXPost } from "../packages/providers/x-post-preparation";
afterEach(() => {
  vi.unstubAllGlobals();
  state.events = [];
  state.failSetup = false;
});
it("initializes the restricted broker before user commands and transfers complete captions beyond the text-read limit", async () => {
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array()));
  const result = await prepareHostedXPost(canonical, {
    stage: async () => {},
    metadata: async () => {},
  });
  expect(result.post.text).toBe(state.text);
  expect(result.post.text.length).toBeGreaterThan(20000);
  expect(state.events).toEqual([
    "broker_ready",
    "setup",
    "inspect",
    "download",
    "decoder_denied_network",
    "decode",
    "stopped",
  ]);
});
it("records a failed setup only after cleanup acknowledges the exact sandbox stop", async () => {
  state.failSetup = true;
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array()));
  const failed = vi.fn(async () => {
    state.events.push("failure_receipt");
  });
  await expect(
    prepareHostedXPost(canonical, {
      stage: async () => {},
      metadata: async () => {},
      failed,
    }),
  ).rejects.toThrow(/SOURCE_UNAVAILABLE/);
  expect(failed).toHaveBeenCalledWith(
    expect.objectContaining({ phase: "setup", stopAcknowledged: true }),
  );
  expect(state.events.indexOf("stopped")).toBeLessThan(
    state.events.indexOf("failure_receipt"),
  );
});
