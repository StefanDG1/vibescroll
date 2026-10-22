# ADR 112: persisted setup and verified companion packages

Accepted October 22, 2026 for the implemented, unreleased candidate. Exact candidate commit: `ROOT_CANDIDATE_COMMIT_PENDING`. Signing, publication and real installation require separate evidence.

## Context

The browser Library must work without installing a companion. A person choosing their own computer needs to distinguish pairing, local prerequisites, account access, an available worker and a cited result. A heartbeat or a reviewed setup checklist cannot certify installation or authorize startup. A source-checkout CLI alone also does not provide a verified package/update path.

## Decision

Persist the private setup route and optional import/preferences review with exact-version writes. Save-only, eligible local and available quoted cloud routes remain separate choices. Accept only a strict, bounded metadata prerequisite report, mark it user-provided, and expire its web acknowledgement after 24 hours. Passing it leaves processing readiness unverified. Account/model access and a cited sample require their own evidence. Browser instructions do not claim a trusted desktop state bridge.

Keep local preflight/status, run, pause, explicit resume and optional Windows sign-in startup controls. Startup and resumed work require their own explicit local consent. The CLI controls its own child through IPC, refuses uncertain locks and checks local Docker named-pipe configuration before protected account work. Browser commands cannot establish actual pause/startup state; that requires local readback. No browser review or installation grants processing, coding, publication or spending authority.

The supported personal analysis candidate uses the existing official isolated Codex controller and the user's eligible account. Model/effort/profile and source approval remain bound to the job; cancellation interrupts that same official turn. The legacy direct OAuth/Responses client and standalone CLI are refused by the runtime package graph. Hosted commercial subscription-funded use remains separately gated.

Add source and executable-runtime package flavors. Runtime packaging reads committed source objects, parses the supported module/assets graph using the existing build tool, refuses computed/unsupported imports and materializes only encountered pinned production dependencies. The current supported graph needs zod. Cached dependency archives must match the committed lock's SHA512 integrity, and bundled installed files must match those verified archive bytes. Individual files, licenses and dependency inventory hashes enter the release manifest. Source-only packages cannot launch through the installer; installation never runs a package manager.

Pin Node 24.22.1, the official runtime archive URL, archive/executable SHA256 and byte counts, expected Authenticode signer, package version, source commit, dependency lock, complete file inventory, download/expanded sizes and restart requirement. Verify the exact detached Ed25519 manifest signature against separately distributed trust and a minimum release sequence. Download only exact approved direct HTTPS URLs, refuse redirects, and require explicit download consent. There is no update polling, background download or automatic activation.

Stage under the current user's own installation root, reject traversal, devices, alternate streams, symlinks/junctions and case collisions, verify each extracted file and Windows runtime signature, then activate by replacing a same-directory pointer. Preserve the previous version for explicit rollback. Recheck signatures, inventory and the current trust floor before launch or rollback. Stop a running companion normally and approve restart explicitly; the installer does not kill it. Credentials and local configuration remain outside the installation root, with existing protected account storage unchanged. No administrator elevation, system PATH or machine service is required.

The no-Node PowerShell bootstrap is unsigned source preparation until the operator supplies an externally signed distribution. It refuses an unsigned self, requires a separately pinned bootstrap signer and runtime metadata, then verifies bounded private snapshots of release metadata before executing any package JavaScript. It downloads nothing. Its default is preflight; explicit install/restart consent only stages and activates, without starting processing.

## Evidence and limits

Synthetic signature/hash/path/rollback tests, a metadata-swap regression, actual package extraction/native imports, PowerShell syntax and local helper tests establish candidate engineering. They do not establish a real signed distribution, end-user installation, Windows trust-chain acceptance, restart recovery, startup on a real worker or independent setup. [The package reference](../../packages/companion/README.md) and [implementation status](../implementation-status.md) retain those gates. A verified portable runtime used for validation under ADR 110 is separate from an installed customer package.
