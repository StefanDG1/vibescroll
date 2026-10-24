# Verified Windows companion packages

This package implements explicit package preparation, staging, activation and rollback for Windows x64 under the current user. It does not contain a production signing key, a release signature, a verified Node archive checksum or an enabled update feed. Installation refuses missing or invalid trust evidence. The companion remains optional for the browser Library.

The executable runtime flavor contains the official-client companion's literal module graph and its materialized `zod@4.6.6` production dependency. The legacy direct OAuth client and its CLI are explicitly refused by the runtime graph. No package manager runs during installation or startup. A separate source flavor can be staged for inspection but cannot launch through the installer.

## Prepare a release

The operator must supply all of these inputs independently of the downloaded release:

- A trusted Ed25519 public key for detached release-manifest signatures.
- A direct HTTPS package URL prefix approved for this release channel. Redirects, credentials, query strings and fragments are refused. A redirecting GitHub release URL cannot be used as this endpoint.
- The expected SHA256 fingerprint of the Node executable's Authenticode signing certificate.
- A minimum accepted release sequence. Lower signed releases are refused even for rollback.
- The official `node-v24.22.1-win-x64.zip` archive's verified SHA256 and byte count, and the expected `node.exe` SHA256 and byte count. This repository does not substitute fabricated values.
- Local cached dependency tarballs matching the exact SHA512 integrity entries in the committed pnpm lock. The runtime builder compares every materialized installed dependency file with the verified tarball. Package versions, MIT licenses, package metadata and individual file hashes are included in the signed inventory.

The separately protected trust JSON has exactly these fields:

```json
{
  "schemaVersion": 1,
  "publicKeyPem": "OPERATOR_VERIFIED_ED25519_PUBLIC_KEY_PEM",
  "packageUrlPrefix": "https://OPERATOR_APPROVED_DIRECT_HOST/companion/",
  "authenticodeSha256": "OPERATOR_VERIFIED_NODE_SIGNER_SHA256",
  "minimumSequence": 1
}
```

These placeholders are intentionally invalid. Keep trust outside `%LOCALAPPDATA%\VibeScroll\Companion`. Downloaded release metadata cannot grant its own signing or URL authority.

The build specification supplies `distribution` (`runtime` or `source`), positive integer `sequence`, package `version`, exact 40-character Git `commit`, `packageUrl`, and `node`. The `node` object contains `version: "24.22.1"`, `archive: {url, sha256, bytes}`, `executableSha256`, `executableBytes` and `authenticodeSha256`. Its archive URL must be exactly `https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip`.

For a runtime distribution, `dependencyArchives` maps each encountered allowed dependency to its absolute local tarball path. The current official-client graph requires `zod`. The generator discovers the supported module graph itself. It refuses computed imports, unsupported authentication adapters, unexpected bare dependencies, private directories and package symlinks. For a source distribution, `files` is an explicit list of committed source paths. Source package files are read from Git objects at the specified current commit, never copied from an unreviewed working tree.

On Windows, run the build with four absolute paths:

```text
node scripts/build-companion-package.mjs BUILD_SPEC_JSON TRUST_JSON NODE_ARCHIVE_ZIP OUTPUT_DIRECTORY
```

The builder verifies `node.exe` with the Windows trust provider before creating an unsigned package and `release.unsigned.json`. It never executes that Node binary. The release operator must review the complete inventory and sign the exact manifest bytes using the protected release signing process. The detached Ed25519 signature is a raw 64-byte file. Do not commit a private key. Reformatting signed JSON invalidates its signature.

The manifest pins package version, source commit, dependency lock hash, dependency version/integrity and file inventory, Node version/archive/executable/signing certificate, download bytes, expanded bytes and restart requirement. An unsigned build is not an installable release.

## Inspect, stage and activate

Use a reviewed copy of the installer and a trusted local Node runtime to bootstrap these commands. The installer never downloads itself or changes trust automatically.

```text
node scripts/install-companion.mjs preflight TRUST_JSON RELEASE_JSON RELEASE_SIGNATURE
node scripts/install-companion.mjs stage-offline TRUST_JSON RELEASE_JSON RELEASE_SIGNATURE PACKAGE_ZIP NODE_ZIP
node scripts/install-companion.mjs activate TRUST_JSON RELEASE_ID --restart-approved
```

Preflight reports download size, expansion and reserve space, the current release, whether a companion process is running, and whether a restart is required. It grants no permission. Stop the companion normally before staging an update. Updates require the explicit `--restart-approved` argument on staging and activation; the installer does not kill a worker or silently restart it.

For an explicitly requested bounded download, use `download-stage TRUST_JSON RELEASE_JSON RELEASE_SIGNATURE --download-and-restart-approved`. This reads only the two exact signed URLs. It refuses redirects, oversized responses, length mismatches and wrong hashes. There is no polling, update timer, background download or automatic activation.

Staging validates the detached signature before inspecting payloads. It extracts only files named by the signed inventory using the bounded ZIP reader, verifies each file and the Node executable, and checks Authenticode before keeping the staged version. Encryption, ZIP64, symlinks, traversal, alternate streams, Windows device names and case-colliding names are refused. An installation lock prevents concurrent changes. Unknown interrupted locks require operator review; they are never cleared automatically.

Each release resides in an immutable child of `%LOCALAPPDATA%\VibeScroll\Companion\releases`. Activation rechecks signatures and hashes, refuses unlisted files, verifies the runtime signer again, then replaces a same-directory `current.json` pointer atomically. The previous version remains available. This is not an OS sandbox against another process running as the same Windows user. The tool requests no administrator rights and does not alter system PATH, services, machine registry or startup.

## Run and roll back

Put the existing protected companion configuration and subscription image/session metadata in the sibling `%LOCALAPPDATA%\VibeScroll\CompanionConfig` directory. `run` requires an absolute config path in that directory. Account connection storage remains in the existing Windows-user DPAPI vault. Installation and rollback never copy or remove those credentials.

```text
node scripts/install-companion.mjs run TRUST_JSON ABSOLUTE_COMPANION_CONFIG
node scripts/install-companion.mjs rollback TRUST_JSON --restart-approved
```

Only explicit `run` launches the verified active runtime flavor. It rechecks the complete inventory and executable signature first, disables global Node module search and native addons, and supplies the external config directory without changing HOME or CODEX_HOME. The normal companion pairing, platform, account, image, model, isolation, approval and budget checks still apply. Installation grants no processing or startup authority.

Rollback rechecks the prior signed release against current trust, all signed files and the Node signer. It refuses a revoked sequence, missing version, changed file, invalid signature, unexpected file, running companion or missing restart approval. It changes only the active pointer; it does not restore an old credential snapshot or resend completed work.

## Prepare the no-Node Windows bootstrap

`scripts/bootstrap-companion.ps1` is source preparation for an externally Authenticode-signed bootstrap. Its first executable action checks its own signature. This unsigned source refuses execution. An operator-signed distribution must also match the separately approved bootstrap certificate SHA256 before it uses any archive. Run a signed distribution under PowerShell's `AllSigned` policy so the host checks the script before its body executes.

The bootstrap trust file is an external envelope with `bootstrapAuthenticodeSha256`, `releaseTrust` containing the exact trust object above, and `node: {version, archiveSha256, archiveBytes, executableSha256, executableBytes, authenticodeSha256}`. Node version must be `24.22.1`. These runtime pins must come from the independently verified official archive, not from a downloaded unsigned manifest.

The signed bootstrap accepts absolute `-Trust`, `-Manifest`, `-Signature`, `-PackageZip` and `-NodeZip` paths. It does not download them. It checks the pinned runtime archive, extracts only `node.exe` into a new per-user temporary directory, and verifies its pinned hash and Authenticode certificate before execution. A fixed verifier inside the signed bootstrap checks the detached Ed25519 signature and minimum sequence before any package JavaScript is extracted or executed. The bootstrap then checks every extracted package file against the signed inventory and invokes the verified core installer's preflight.

The default is inspection only. Explicit `-Install -RestartApproved` additionally stages and activates the signed runtime distribution. It starts no companion. Cleanup removes only the generated temporary child; trust, input archives and protected configuration remain external. This preparation has been parsed for PowerShell syntax, but no signed bootstrap, real runtime signature or system installation was executed in these tests.

## Offline evidence and remaining release gates

Run `node scripts/run-offline.mjs node --test tests/companion-installer.test.mjs`. Fixtures use synthetic non-executable Node bytes and an in-memory signing key. They do not install into the real user directory, invoke Authenticode, access a provider or perform a network download. Tests cover signature/hash rejection, bounded URLs, ZIP and Windows paths, junction rejection, partial-stage cleanup, source/runtime separation, actual runtime graph packaging, rollback and external credential preservation.

Production certificate/key custody, verified official runtime metadata, signed bootstrap/package publication, actual Windows trust-chain behavior, restart recovery on a real computer and an operator-reviewed end-to-end install remain release gates. Passing these fixtures does not close them.
