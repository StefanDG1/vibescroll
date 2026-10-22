import { readFile, lstat } from "node:fs/promises";
import { resolve, isAbsolute, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import {
  createInstaller,
  plainPath,
  downloadArtifact,
} from "../packages/companion/installer.mjs";
import { verifyRelease } from "../packages/companion/release.mjs";

async function localFile(path, max) {
  if (!isAbsolute(path ?? "")) throw Error("INSTALL_ABSOLUTE_PATH_REQUIRED");
  await plainPath(path);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > max) throw Error("INSTALL_FILE_INVALID");
  return readFile(path);
}
export async function installerCommand(args) {
  const [command, trustPath, ...rest] = args;
  const installer = createInstaller();
  const trustRelative = relative(
    installer.installRoot,
    resolve(trustPath ?? "."),
  );
  if (!trustRelative.startsWith(`..${sep}`) && !isAbsolute(trustRelative))
    throw Error("INSTALL_TRUST_MUST_BE_EXTERNAL");
  const trust = JSON.parse(
    (await localFile(trustPath, 16384)).toString("utf8"),
  );
  if (command === "status" && rest.length === 0) return installer.current();
  if (command === "run" && rest.length === 1) {
    const plan = await installer.execution({ trust });
    const config = rest[0];
    const remainder = relative(plan.configRoot, resolve(config));
    if (
      !remainder ||
      isAbsolute(remainder) ||
      remainder === ".." ||
      remainder.startsWith(`..${sep}`)
    )
      throw Error("INSTALL_EXTERNAL_CONFIG_REQUIRED");
    await localFile(config, 16384);
    const environment = {
      ...process.env,
      VIBESCROLL_COMPANION_CONFIG_ROOT: plan.configRoot,
      NODE_OPTIONS: "--no-global-search-paths --no-addons",
    };
    delete environment.NODE_PATH;
    return new Promise((resolveRun, reject) => {
      const child = spawn(plan.executable, [plan.entrypoint, "run", config], {
        cwd: plan.cwd,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0 && !signal) resolveRun({ exited: true });
        else reject(Error("INSTALL_COMPANION_EXITED_UNCONFIRMED"));
      });
    });
  }
  if (
    command === "rollback" &&
    rest.length === 1 &&
    rest[0] === "--restart-approved"
  )
    return installer.rollback({ trust, restartApproved: true });
  if (
    command === "activate" &&
    rest.length === 2 &&
    rest[1] === "--restart-approved"
  )
    return installer.activate({
      releaseId: rest[0],
      trust,
      restartApproved: true,
    });
  if (["preflight", "stage-offline", "download-stage"].includes(command)) {
    const [manifestPath, signaturePath] = rest;
    const raw = await localFile(manifestPath, 2 * 1024 * 1024),
      signature = await localFile(signaturePath, 64);
    const release = verifyRelease(raw, signature, trust);
    if (command === "preflight" && rest.length === 2)
      return installer.preflight(release, { previewOnly: true });
    if (
      command === "stage-offline" &&
      [4, 5].includes(rest.length) &&
      (rest.length === 4 || rest[4] === "--restart-approved")
    ) {
      return installer.stage({
        raw,
        signature,
        trust,
        packageArchive: await localFile(
          rest[2],
          release.manifest.package.archive.bytes,
        ),
        runtimeArchive: await localFile(
          rest[3],
          release.manifest.node.archive.bytes,
        ),
        restartApproved: rest[4] === "--restart-approved",
      });
    }
    if (
      command === "download-stage" &&
      rest.length === 3 &&
      rest[2] === "--download-and-restart-approved"
    ) {
      await installer.preflight(release, { restartApproved: true });
      const packageArchive = await downloadArtifact(
        release.manifest.package.archive,
      );
      const runtimeArchive = await downloadArtifact(
        release.manifest.node.archive,
      );
      return installer.stage({
        raw,
        signature,
        trust,
        packageArchive,
        runtimeArchive,
        restartApproved: true,
      });
    }
  }
  throw Error("INSTALL_USAGE");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  installerCommand(process.argv.slice(2))
    .then((value) => console.log(JSON.stringify(value, null, 2)))
    .catch((error) => {
      console.error(
        /^(INSTALL|RELEASE)_[A-Z_]+$/.test(error.message ?? "")
          ? error.message
          : "INSTALL_ACTION_FAILED",
      );
      console.error(
        "Use absolute paths. status TRUST; preflight TRUST MANIFEST SIGNATURE; stage-offline TRUST MANIFEST SIGNATURE PACKAGE_ZIP NODE_ZIP [--restart-approved]; download-stage TRUST MANIFEST SIGNATURE --download-and-restart-approved; activate TRUST RELEASE_ID --restart-approved; rollback TRUST --restart-approved; run TRUST CONFIG. Only explicit run starts the companion, whose normal approval checks still apply. Startup is unchanged.",
      );
      process.exitCode = 1;
    });
