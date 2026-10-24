import { expect, it, vi } from "vitest";
import {
  sandboxPolicy,
  namespaceCommand,
  JobSandbox,
} from "../packages/providers/sandbox";
import type { Sandbox } from "@vercel/sandbox";

it("keeps customer tasks ephemeral, offline and bounded despite provider persistence defaults", () => {
  for (const kind of ["coding", "media"] as const) {
    const policy = sandboxPolicy(kind, 120);
    expect(policy.persistent).toBe(false);
    expect(policy.networkPolicy).toBe("deny-all");
    expect(policy.ports).toEqual([]);
    expect(policy.failoverRegions).toEqual([]);
    expect(policy.timeout).toBe(120000);
    expect(namespaceCommand(false)).toContain("--net");
    expect(namespaceCommand(false)).toContain("--no-new-privs");
  }
  for (const value of [0, 29, 1201, Infinity, NaN, 30.5])
    expect(() => sandboxPolicy("coding", value)).toThrow("QUOTE_CHANGED");
  expect(() => sandboxPolicy("media", 301)).toThrow("QUOTE_CHANGED");
});
it("restricts online acquisition to reviewed hosts and rejects private destinations", () => {
  expect(() => sandboxPolicy("acquisition", 60, [])).toThrow("POLICY_BLOCKED");
  for (const host of [
    "*",
    "127.0.0.1:80",
    "https://instagram.com",
    "foo\nbar.com",
  ])
    expect(() => sandboxPolicy("acquisition", 60, [host])).toThrow(
      "POLICY_BLOCKED",
    );
  const policy = sandboxPolicy("acquisition", 60, [
    "instagram.com",
    "*.cdninstagram.com",
  ]);
  expect(policy.networkPolicy).toMatchObject({
    allow: ["instagram.com", "*.cdninstagram.com"],
    subnets: {
      deny: expect.arrayContaining(["127.0.0.0/8", "169.254.0.0/16"]),
    },
  });
});
it("refuses artifact paths outside the job before invoking any privileged provider operation", async () => {
  const sandbox = new JobSandbox({ name: "synthetic-owned" } as Sandbox, false);
  for (const path of [
    "/root/canary",
    "/home/user/../ubuntu/key",
    "/home/user/.//x",
    "/home/user/foo\\bar",
    "/home/user/x\nq",
  ])
    await expect(sandbox.files.read(path)).rejects.toThrow("POLICY_BLOCKED");
});
it("keeps legacy text reads bounded while allowing an explicit bounded ordered manifest", async () => {
  const runCommand = vi.fn(async (options: { args: string[] }) => ({
    exitCode: 0,
    stdout: async () =>
      Buffer.from(
        "x".repeat(Math.min(21000, Number(options.args.at(-1)))),
      ).toString("base64"),
  }));
  const sandbox = new JobSandbox(
    { name: "synthetic-read", runCommand } as unknown as Sandbox,
    false,
  );
  expect(
    (
      await sandbox.files.read("/home/user/media/ordered-manifest.json", {
        maxBytes: 100000,
      })
    ).length,
  ).toBe(21000);
  expect(runCommand.mock.calls[0][0].args.at(-1)).toBe("100000");
  expect(
    (await sandbox.files.read("/home/user/media/legacy-manifest.json")).length,
  ).toBe(20000);
  expect(runCommand.mock.calls[1][0].args.at(-1)).toBe("20000");
  for (const maxBytes of [0, -1, 100001, Infinity, 1.5])
    await expect(
      sandbox.files.read("/home/user/media/ordered-manifest.json", {
        maxBytes,
      }),
    ).rejects.toThrow("INVALID_MEDIA_MANIFEST");
  expect(runCommand).toHaveBeenCalledTimes(2);
});
