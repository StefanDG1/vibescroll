# Security requirements and threat model

Mode: reference. This document specifies controls and evidence. It does not claim the application has passed a security audit.

For implemented user-facing boundaries, download domains and data flow, see [security and privacy for users](SECURITY-FOR-USERS.md). The table below lists requirements and verification criteria, not blanket pass results. [Implementation status](implementation-status.md) records actual checks. Private reports follow the repository's [security policy](../SECURITY.md).

## Assistant preference review

[ADR183](adr/183-normal-session-assistant-preferences.md) removes the duplicate five-minute sign-in requirement for routine app workflows in the next candidate. A normal active app session, current role, explicit acknowledgement and current source/context/grant versions remain required. MCP identities cannot edit their own grants. Only the typed high-risk inventory retains a fresh-sign-in requirement; credential changes, account/workspace deletion and deliberate publication have direct sign-in/back navigation without action replay. Funding, ordinary session expiry and all other server permissions remain enforced. This local policy change is not a completed security audit or production acceptance.

## Assets and trust boundaries

Protected assets include provider credentials, source media, transcripts, repository content, plans, payment state, device credentials, approval records, and private evidence URLs. The browser, external media, repository content, model output, and execution sandbox are less trusted than the authorization and credential services.

Tenant identity and authorization must be verified at every server boundary. A valid account does not authorize another workspace's records. A valid runner does not authorize arbitrary paths. A valid model output does not authorize spending or publication.

## Threat controls

| Threat                    | Required controls                                                                           | Evidence                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Cross-workspace access    | Server membership checks, tenant-filtered indexes, scoped signed assets                     | Foreign IDs fail for every record family                                             |
| Account takeover          | WorkOS session controls, secure cookies, reauthentication for sensitive connections         | Callback, logout, session expiry, and CSRF tests                                     |
| Prompt injection          | Untrusted content separation, schema validation, tool policy outside prompts                | Malicious video, README, and issue fixtures cannot obtain secrets or new permissions |
| SSRF                      | Source allowlist, public-IP checks, redirect revalidation, metadata/internal ranges blocked | IPv4, IPv6, rebinding, encoded host, and redirect tests                              |
| Media parser exploit      | Patched decoder in isolated ephemeral sandbox, bytes/time/decoded-size limits               | Adversarial malformed media and resource-limit tests                                 |
| Repository code execution | No scripts during analysis; sandboxed tests; no hooks or host mounts                        | Malicious install and test scripts cannot escape                                     |
| Credential theft          | Managed secret boundary, encryption, short-lived job grants, redaction                      | Secrets absent from prompts, artifacts, browser state, and logs                      |
| Unauthorized code change  | Plan-hash approval, path policies, base-SHA checks, trusted publisher                       | Old approval and forbidden path rejected                                             |
| Duplicate costs           | Atomic reservations, idempotent stages, bounded retries                                     | Concurrent requests cannot overspend                                                 |
| Forged webhook            | Signature validation on raw body, mode/account checks, deduplication                        | Wrong signature and wrong Stripe account never grant access                          |
| Stale runner              | Leases, generation fencing, cancellation, revocation                                        | Late result cannot publish                                                           |
| Cached private data leak  | Workspace-only cache, no private service-worker cache, signed assets                        | Account switch and shared device tests                                               |
| Supply-chain compromise   | Lockfile, pinned images, licence inventory, dependency scan, reviewed updates               | Build provenance and dependency report                                               |
| Data resurrection         | Deletion tombstones, restore procedure, retention sweeper                                   | Restore cannot expose deleted content                                                |

## Web application

Use secure, HttpOnly session cookies with appropriate SameSite behavior and HTTPS. Set a restrictive Content Security Policy with explicitly required provider origins. Use HSTS after confirming subdomain behavior. Set a no-referrer or strict referrer policy for private pages and prevent embedding with frame controls.

Validate all server inputs with runtime schemas. Escape rendered transcripts and model output. Sanitize any permitted Markdown HTML. Do not execute code blocks or embed arbitrary iframes from generated content. External links use safe attributes and an explicit scheme allowlist.

A GET request never commits a capture or approval. Protect mutations against CSRF and replay. Rate-limit signup, capture, pairing, test connections, exports, and contact forms. Set meaningful per-account and global spend caps for trials.

Do not put secrets in `NEXT_PUBLIC_*` variables. Do not expose internal backend URLs or admin controls merely because a route is noindex.

## Execution permissions

Permissions specify repository, operation, allowed paths, network destinations, deadline, model route, and spending ceiling. The user approves a plan version. A model cannot add permissions by writing a new instruction into its response.

Block modifications to authentication, billing, access control, infrastructure, CI workflows, secret handling, and destructive data migrations unless a high-risk approval explicitly covers them. Even then, run only within tested isolation and require final patch review.

Publication is separate from execution. The publisher validates the exact patch and creates a draft PR. No execution environment gets permission to merge, deploy, change branch protections, or create customer payment accounts in V1.

## Secrets

Use a reviewed authenticated-encryption library, not custom cryptography. Generate per-environment keys and store them in the host secret manager. Record ciphertext key versions. Test key rotation and recovery before relying on encrypted credentials in production.

A short-lived artifact URL is a bearer capability. Restrict method, object key, expiry, and content size. Never log the full URL. A workspace check precedes every grant. Object names contain random IDs, not public email addresses or source titles.

Restrict operator production access. Record support access to customer data, require a reason, and default to redacted diagnostics. Do not build unrestricted impersonation as a support shortcut.

## Privacy and model safety

No training across customer data by default. Do not submit credentials, irrelevant repository files, or unrelated personal content to models. Redact known sensitive values before extraction and before publishing artifacts.

Label AI-produced summaries, proposals, and code suggestions. Store concise explanations and sources, not hidden reasoning traces. Assess applicable AI transparency duties for the actual deployment using source S38 and legal review. Do not advertise that a label alone proves compliance.

Do not recommend evasion of platform rules, account bans, or content access controls. A creator's instruction inside a video is not permission to reuse third-party assets or execute its commands.

## Incident response

Provide separate kill switches for capture, managed inference, local job dispatch, cloud execution, and PR publication. A billing incident must not require taking the read-only library offline.

The incident runbook identifies the operator, affected services, containment action, evidence preservation, credential rotation, scope assessment, communication, and recovery. Assess GDPR notification duties promptly. A blanket promise that every incident requires the same notification is incorrect.

Maintain a vulnerability-reporting contact and private reporting route. Acknowledge reports under a documented support procedure. Avoid promising a bounty or response SLA that the operator has not funded.

## Release severity policy

No open critical or high-risk issue in tenant isolation, credential protection, billing authorization, code isolation, or publication permission can pass the paid launch gate. Lower-severity issues need an owner, mitigation, and target date.

Automated scans supplement code review and adversarial tests. Record what was tested and what was not. The phrase "fully secure" must not appear as a factual claim in launch copy.

## Private reporting route

The repository's [security policy](../SECURITY.md) maintains the current private reporting contact and requested evidence. GitHub private vulnerability reporting was disabled when checked on October 22, 2026. No bounty, response deadline or independent audit is promised.
