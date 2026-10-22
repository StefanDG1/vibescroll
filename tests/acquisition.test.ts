import { describe, expect, it, vi } from "vitest";
import {
  acquisitionManifest,
  acquisitionMessage,
  acquisitionPolicy,
} from "../packages/media/acquisition";
import release from "../infra/downloader.json";
import { acquirer } from "../packages/media/acquirer";
import { hardenAcquisition } from "../packages/providers/acquisition-isolation";
import type { JobSandbox } from "../packages/providers/sandbox";
import { execFileSync } from "node:child_process";
describe("permitted source acquisition", () => {
  it("exercises metadata, separate-stream transport and existing Linux subprocess boundaries without a real provider", () => {
    expect(() =>
      execFileSync(
        process.env.PYTHON_BIN || "python",
        ["tests/acquisition_worker_test.py"],
        { cwd: process.cwd(), stdio: "pipe", timeout: 10000 },
      ),
    ).not.toThrow();
  });
  it("restricts retrieval to single supported source identifiers and strips tracking", () => {
    expect(
      acquisitionPolicy(
        "https://www.instagram.com/reel/Synthetic123/?igsh=private",
      ),
    ).toMatchObject({
      platform: "instagram",
      url: "https://www.instagram.com/reel/Synthetic123/",
    });
    for (const source of [
      "http://instagram.com/reel/Synthetic123/",
      "https://instagram.com@localhost/reel/Synthetic123/",
      "https://instagram.com/",
      "https://instagram.com/%2e%2e/private",
      "https://youtube.com/playlist?list=x",
      "https://youtu.be/invalid-id",
      "https://vimeo.com/user/123456",
      "https://vm.tiktok.com/../secret",
      "https://127.0.0.1/watch?v=BaW_jenozKc",
      "https://instagram.com:444/reel/Synthetic123/",
    ])
      expect(() => acquisitionPolicy(source)).toThrow();
    expect(
      acquisitionPolicy("https://youtube.com/watch?v=BaW_jenozKc").domains,
    ).not.toContain("*.google.com");
    expect(
      acquisitionPolicy("https://vm.tiktok.com/Synthetic123/").domains,
    ).toContain("*.tiktokcdn-eu.com");
  });
  it("requires measured media bounds, rejects leaked credentials, and distinguishes platform refusal", () => {
    const valid = {
      schemaVersion: "1.0.0",
      status: "acquired",
      title: "Owned sample",
      description: "Untrusted source text",
      durationSeconds: 8,
      byteLength: 100,
      extractor: "Test",
      downloaderVersion: release.version,
    };
    expect(acquisitionManifest.parse(valid)).toEqual(valid);
    for (const value of [
      { ...valid, byteLength: 250000001 },
      { ...valid, durationSeconds: 601 },
      { ...valid, byteLength: undefined },
      { ...valid, status: "success" },
      { ...valid, cookie: "private" },
      { ...valid, description: `sk_live_${"a".repeat(32)}` },
    ])
      expect(acquisitionManifest.safeParse(value).success).toBe(false);
    expect(acquisitionMessage("rate_limited")).toContain("rate limit");
    expect(acquisitionMessage("needs_auth")).toContain("No login");
    expect(acquisitionMessage("unsupported")).toContain("not supported");
  });
  it("keeps the packaged worker pinned and enforces independent network and subprocess bounds", () => {
    expect(acquirer).toContain(`VERSION = '${release.version}'`);
    expect(acquirer).toContain("start_new_session=True");
    expect(acquirer).toContain("--ignore-config");
    expect(acquirer).not.toContain("--cookies");
    expect(acquirer).toContain("VIBE_DOWNLOAD_PROXY");
  });
  it("blocks retrieval and destroys the VM when the independent isolation probe fails", async () => {
    const kill = vi.fn(async () => {});
    const configurePublicDownload = vi.fn(async () => {});
    const run = vi.fn(async () => ({ exitCode: 1 }));
    const sandbox = {
      kill,
      configurePublicDownload,
      commands: { run },
    } as unknown as JobSandbox;
    await expect(hardenAcquisition(sandbox)).rejects.toThrow(
      "Execution blocked",
    );
    expect(configurePublicDownload).toHaveBeenCalledOnce();
    expect(kill).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("169.254.169.254"),
      expect.objectContaining({ user: "user" }),
    );
  });
});
