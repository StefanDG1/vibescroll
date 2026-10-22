import { lstatSync } from "node:fs";
import { isAbsolute, resolve, join, relative, sep, dirname } from "node:path";
export function companionPreparationRoot(
  legacyRoot = process.cwd(),
  environment = process.env,
) {
  return join(
    dirname(
      companionPrivatePath(
        "subscription-session.json",
        legacyRoot,
        environment,
      ),
    ),
    "subscription-prepared",
  );
}
export function companionPrivatePath(
  name,
  legacyRoot = process.cwd(),
  environment = process.env,
) {
  if (!["subscription-images.json", "subscription-session.json"].includes(name))
    throw Error("COMPANION_PRIVATE_FILE_INVALID");
  const configured = environment.VIBESCROLL_COMPANION_CONFIG_ROOT;
  if (!configured) {
    if (environment.LOCALAPPDATA && isAbsolute(environment.LOCALAPPDATA)) {
      const installed = resolve(
        environment.LOCALAPPDATA,
        "VibeScroll",
        "Companion",
      );
      const remainder = relative(installed, resolve(legacyRoot));
      if (
        !remainder ||
        (!isAbsolute(remainder) &&
          remainder !== ".." &&
          !remainder.startsWith(`..${sep}`))
      )
        throw Error("COMPANION_EXTERNAL_CONFIG_REQUIRED");
    }
    return join(legacyRoot, "private", name);
  }
  if (
    !isAbsolute(configured) ||
    !environment.LOCALAPPDATA ||
    !isAbsolute(environment.LOCALAPPDATA)
  )
    throw Error("COMPANION_EXTERNAL_CONFIG_REQUIRED");
  const directory = resolve(configured);
  const installRoot = resolve(
    environment.LOCALAPPDATA,
    "VibeScroll",
    "Companion",
  );
  const remainder = relative(installRoot, directory);
  if (
    !remainder ||
    (!isAbsolute(remainder) &&
      remainder !== ".." &&
      !remainder.startsWith(`..${sep}`))
  )
    throw Error("COMPANION_CONFIG_INSIDE_INSTALL_REFUSED");
  let cursor = directory;
  while (true) {
    try {
      if (lstatSync(cursor).isSymbolicLink())
        throw Error("COMPANION_CONFIG_REPARSE_REFUSED");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return join(directory, name);
}
