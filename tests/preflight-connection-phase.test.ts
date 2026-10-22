import { expect, it } from "vitest";
import { companionPreflight } from "../packages/runner/companion-preflight.mjs";
import { parsePreflightReport } from "../packages/onboarding/preflight-report";
import { pairingConfiguration } from "../packages/onboarding/pairing-configuration";

const observed = {
  platform: "win32",
  nodeVersion: "24.22.1",
  dockerLinux: true,
  dockerEndpointLocal: true,
  mediaImagePresent: true,
  codexImagePinned: true,
  codexImagePresent: true,
  pythonPresent: true,
  asrModelPresent: true,
  savedConnectionPresent: false,
  freeBytes: 4 * 1024 ** 3,
  config: {
    server: "https://synthetic.convex.site",
    workspaceId: "synthetic-workspace",
    credentialVaultAdapter: "windows-credential-manager",
    credentialTarget: "VibeScroller/device-synthetic",
    mediaImage: `sha256:${"a".repeat(64)}`,
  },
};
it("allows starting supported consent without claiming full account or processing readiness", () => {
  const report = companionPreflight(observed);
  expect(report).toMatchObject({
    readyForLocalStart: false,
    readyToConnect: true,
    processingReady: "unverified",
  });
  expect(parsePreflightReport(report)).toMatchObject({
    passed: false,
    readyToConnect: true,
  });
  const legacy = { ...report };
  delete (legacy as Partial<typeof report>).readyToConnect;
  expect(parsePreflightReport(legacy)).toMatchObject({
    passed: false,
    readyToConnect: true,
  });
  expect(
    companionPreflight({ ...observed, savedConnectionPresent: true }),
  ).toMatchObject({
    readyForLocalStart: true,
    readyToConnect: true,
    processingReady: "unverified",
  });
});
it("cannot use the connection phase to bypass pairing, isolation, runtime or disk checks", () => {
  for (const change of [
    { dockerLinux: false },
    { dockerEndpointLocal: false },
    { nodeVersion: "25.0.0" },
    { mediaImagePresent: false },
    { codexImagePresent: false },
    { pythonPresent: false },
    { freeBytes: undefined },
    { config: { ...observed.config, credentialTarget: "" } },
  ]) {
    const report = companionPreflight({ ...observed, ...change });
    expect(report.readyToConnect).toBe(false);
    expect(() =>
      parsePreflightReport({ ...report, readyToConnect: true }),
    ).toThrow();
  }
});
it("derives a nonsecret pairing template only for matching deployment origins", () => {
  const cloud = "https://synthetic.convex.cloud",
    site = "https://synthetic.convex.site";
  expect(pairingConfiguration(cloud, site, "owned-workspace")).toEqual({
    server: site + "/",
    workspaceId: "owned-workspace",
    protocolVersion: "1.0.0",
    credentialVaultAdapter: "windows-credential-manager",
    deviceName: "My Windows computer",
  });
  for (const [a, b] of [
    [undefined, site],
    [cloud, undefined],
    [cloud, "https://other.convex.site"],
    [cloud, "https://synthetic.convex.site.evil.invalid"],
    [cloud, site + "/path"],
    [cloud, site + "?token=secret"],
    [cloud, "https://user:secret@synthetic.convex.site"],
    ["http://synthetic.convex.cloud", site],
  ])
    expect(pairingConfiguration(a, b, "owned-workspace")).toBeNull();
});
