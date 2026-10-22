# ADR 110: bounded launch validation and MCP input limits

Accepted October 22, 2026 for the owner-authorized engineering run.

The launch work must preserve a shared US$2 ceiling for additional Convex charges and avoid any other new spending. No conservative hosted bound has been established. Use an isolated credential-free checkout, sanitize validation subprocess environments, disable staging selectors, and block non-loopback Node fetch/HTTP/socket connections. Verify these controls with poisoned synthetic credential variables. Registry audit and approved free dependency/runtime downloads are separate from application validation.

Keep ordinary CI validation and production builds. Vercel Git deployment suppression applies only to `codex/launch-20261022-*`, as explicitly approved at preflight. Main, other branches, production configuration and existing Basic queued build policy retain their behavior. No merge or deployment is authorized.

Refresh Repomix's permitted transitive MCP SDK resolution from 1.31.0 to 1.32.1. The direct server remains 2.3.1. Open dependency PR #117 has separate grouped upgrades and still resolves SDK 1.31.0, so it does not replace this security correction. Configure `maxToolInputElements: 256` before schema validation, preserving existing OAuth-before-parse and 32,768-byte body limits. Tests exercise broad/deep hostile arguments through actual SDK dispatch and existing authorization behavior.

Use Node 24.22.1 for local validation and exact CI pins. This [October 21 security release](https://nodejs.org/en/blog/release/v24.22.1/) addresses DNS, TLS, Brotli and dependency vulnerabilities in the 24 line. The task-scoped Windows archive SHA256 is `d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5`, verified against the official release checksum; the extracted executable has a valid Windows Authenticode signature. No system installation, Docker/WSL upgrade or restart is performed. pnpm remains 12.3.4.

Rollback may remove the task branch deployment suppression after the separately approved release decision. Do not downgrade security bounds, restore the vulnerable SDK, reactivate hosted tests, or use missing account metrics as zero spend merely to finish validation. The offline runner is a validation control for this trusted checkout, not an OS sandbox for arbitrary customer code.

Main advanced during this run to `54a0b2695c72bbd47a2c37d40dbcbeee6546bda9`, including automatic phone intake fixes, private reporting guidance, a 1.32.0 SDK override and a 1024-element bound. Integrate that work, retain its runtime/status tests, and advance its existing explicit SDK override to 1.32.1. Keep the reviewed 256-element limit and test valid current tool shapes and both hostile-width fixtures.
