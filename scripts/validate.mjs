import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { publicProxy, publicBridge } from "../packages/media/public-proxy.ts";
import { publicPolicyDocuments } from "../packages/policy/public-documents.ts";
import { policyRelease } from "../packages/policy/publication.ts";
const root = resolve(import.meta.dirname, "..");
const errors = [];
execFileSync("python", ["scripts/build-cloud-media-package.py"], {
  cwd: root,
  stdio: "pipe",
  timeout: 10000,
});
const release = JSON.parse(
  readFileSync(join(root, "legal/RELEASE-2026-10-03.json"), "utf8"),
);
if (
  release.id !== policyRelease.id ||
  release.effectiveDate !== policyRelease.effectiveDate ||
  release.operatorApproved !== true
)
  errors.push(
    "Policy publication manifest does not match checkout acceptance.",
  );
for (const [name, record] of Object.entries(release.documents)) {
  const file = join(root, "legal", `${name}.md`);
  if (
    createHash("sha256").update(readFileSync(file)).digest("hex") !==
    record.sha256
  )
    errors.push(
      `Published policy bytes changed without a retained release: ${name}.`,
    );
}
for (const name of Object.values(publicPolicyDocuments)) {
  const source = join(root, "legal", `${name}.md`),
    bundled = join(root, "apps/starter/content/legal", `${name}.md`);
  if (
    !existsSync(bundled) ||
    !readFileSync(source).equals(readFileSync(bundled))
  )
    errors.push(
      `Public policy draft is stale: ${name}. Run node scripts/sync-legal.mjs.`,
    );
}
for (const [content, file] of [
  [publicProxy, "public_proxy.py"],
  [publicBridge, "public_bridge.py"],
]) {
  if (content !== readFileSync(join(root, "packages/media", file), "utf8"))
    errors.push(
      "Public-download worker bundle is stale. Run node scripts/sync-public-proxy.mjs.",
    );
}
if (existsSync(join(root, ".git"))) {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  }).split("\0");
  if (tracked.some((file) => file.startsWith("private/")))
    errors.push("Private operator records must not be tracked by Git.");
}
const manifest = JSON.parse(
  readFileSync(join(root, "skills-manifest.json"), "utf8"),
);
for (const skill of manifest.skills) {
  for (const [file, hash] of Object.entries(skill.files)) {
    const path = join(root, ".agents/skills", skill.name, file);
    if (
      !existsSync(path) ||
      createHash("sha256").update(readFileSync(path)).digest("hex") !== hash
    )
      errors.push(
        `Skill changed without a manifest update: ${skill.name}/${file}`,
      );
  }
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}
const docs = [
  ...walk(join(root, "docs")).filter((p) => p.endsWith(".md")),
  ...readdirSync(root)
    .filter((p) => p.endsWith(".md"))
    .map((p) => join(root, p)),
];
for (const file of docs) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].split("#")[0];
    if (!href || /^(?:[a-z]+:|\/)/i.test(href)) continue;
    const path = resolve(dirname(file), decodeURIComponent(href));
    if (!existsSync(path))
      errors.push(`Broken link in ${relative(root, file)}: ${href}`);
    else {
      // Windows resolves the wrong case; Linux CI and deployment do not.
      let directory = root;
      for (const part of relative(root, path).split(/[\\/]/)) {
        if (part === "..") {
          directory = dirname(directory);
          continue;
        }
        if (!readdirSync(directory).includes(part)) {
          errors.push(
            `Filename case mismatch in ${relative(root, file)}: ${href}`,
          );
          break;
        }
        directory = join(directory, part);
      }
    }
  }
}
for (const required of [
  "LICENSE",
  "convex/schema.ts",
  "apps/starter/package.json",
  "packages/company-config/index.ts",
])
  if (!existsSync(join(root, required))) errors.push(`Missing ${required}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Validated ${docs.length} documents and ${manifest.skills.length} skill snapshots.`,
);
