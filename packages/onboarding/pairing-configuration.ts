// Both URLs come from the matching backend's built-in deployment environment.
// Do not infer a deployment from a browser-supplied URL or another workspace.
export function pairingConfiguration(
  cloud: string | undefined,
  site: string | undefined,
  workspaceId: string,
) {
  try {
    const a = new URL(cloud ?? ""),
      b = new URL(site ?? "");
    const deployment = /^([a-z0-9-]+)\.convex\.cloud$/.exec(a.hostname)?.[1];
    if (
      !deployment ||
      b.hostname !== `${deployment}.convex.site` ||
      [a, b].some(
        (url) =>
          url.protocol !== "https:" ||
          url.port ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash,
      ) ||
      !workspaceId ||
      workspaceId.length > 100
    )
      return null;
    return {
      server: b.origin + "/",
      workspaceId,
      protocolVersion: "1.0.0" as const,
      credentialVaultAdapter: "windows-credential-manager" as const,
      deviceName: "My Windows computer",
    };
  } catch {
    return null;
  }
}
