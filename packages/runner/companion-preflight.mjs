// A shareable prerequisite report. Never include paths, account identifiers,
// configuration values, raw subprocess output or protected credential bytes.
export function companionPreflight(observed) {
  const config = observed.config ?? {};
  const checks = [];
  const check = (id, passed, repair) =>
    checks.push({
      id,
      status: passed === undefined ? "unknown" : passed ? "passed" : "blocked",
      ...(passed === true ? {} : { repair }),
    });
  check(
    "windows",
    observed.platform === "win32",
    "Use the supported Windows computer, or select an available cloud route in the app.",
  );
  check(
    "node",
    (observed.nodeVersion ?? "").startsWith("24."),
    "Install the project's pinned Node 24 runtime before continuing.",
  );
  let serverValid = false;
  try {
    const url = new URL(config.server);
    serverValid =
      url.protocol === "https:" &&
      /^[a-z0-9-]+\.convex\.site$/.test(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/";
  } catch {
    /* Report only the failed check. */
  }
  check(
    "paired_configuration",
    serverValid &&
      typeof config.workspaceId === "string" &&
      config.workspaceId.length > 0 &&
      config.credentialVaultAdapter === "windows-credential-manager" &&
      /^VibeScroller\/[a-zA-Z0-9_-]{8,100}$/.test(
        config.credentialTarget ?? "",
      ),
    "Pair this computer in the signed-in app and use its private configuration.",
  );
  check(
    "local_docker_endpoint",
    observed.dockerEndpointLocal,
    "Select Docker Desktop's local Linux named-pipe context. Remote Docker endpoints are not supported for protected local-account work.",
  );
  check(
    "docker_linux_engine",
    observed.dockerLinux,
    "Open Docker Desktop and wait for its Linux engine. Do not reset or delete existing Docker data.",
  );
  check(
    "media_image",
    /^sha256:[a-f0-9]{64}$/.test(config.mediaImage ?? "") &&
      observed.mediaImagePresent === true,
    "Prepare the pinned local media image using the setup guide. No image is downloaded by this check.",
  );
  check(
    "codex_image",
    observed.codexImagePinned === true && observed.codexImagePresent === true,
    "Prepare the pinned official-client image using the setup guide.",
  );
  check(
    "offline_transcription",
    observed.pythonPresent === true && observed.asrModelPresent === true,
    "Select the installed local transcription runtime and model directory.",
  );
  check(
    "saved_account",
    observed.savedConnectionPresent,
    "Connect your own supported official account locally. A saved login still needs runtime verification.",
  );
  check(
    "disk_space",
    observed.freeBytes === undefined
      ? undefined
      : observed.freeBytes >= 2 * 1024 ** 3,
    "Free at least 2 GiB on the working drive, then check again. Larger jobs can require more space.",
  );
  return {
    version: 1,
    kind: "local_prerequisites",
    readyForLocalStart: checks.every((c) => c.status === "passed"),
    // Launch may offer normal official consent; this does not certify an account.
    readyToConnect: checks.every(
      (c) => c.id === "saved_account" || c.status === "passed",
    ),
    processingReady: "unverified",
    checks,
    limits: [
      "No credentials were opened, provider requests sent, images downloaded or workers started.",
      "Pairing, account eligibility, quota, model access, server permissions and a cited sample result still require verification.",
      "The computer must stay awake. Pausing never selects a paid fallback.",
    ],
  };
}

export function startupLauncher({ executable, script, config, root }) {
  const values = [executable, script, config, root];
  if (
    values.some(
      (value) =>
        typeof value !== "string" || !value || /["%\r\n\0]/.test(value),
    )
  )
    throw Error("COMPANION_STARTUP_PATH_INVALID");
  const quoted = (value) => `"${value}"`;
  const vb = (value) => `"${value.replaceAll('"', '""')}"`;
  const command = [executable, script, "run", config].map(quoted).join(" ");
  return `' VibeScroll companion startup v1\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.CurrentDirectory = ${vb(root)}\r\nshell.Run ${vb(command)}, 0, False\r\n`;
}
