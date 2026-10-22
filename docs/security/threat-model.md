# Inherited template threat model

This is the inherited CompanyNerve starter review checklist. Its [template verification status](../status.md) records foundation evidence, not current VibeScroll acceptance. Requirements below are not blanket pass results.

Current VibeScroll documentation starts with [security and privacy for users](../SECURITY-FOR-USERS.md), [product security requirements](../SECURITY.md) and [implementation status](../implementation-status.md). Vulnerability reports follow the repository's [security policy](../../SECURITY.md).

## Assets and actors

Protect organization records, membership/role state, paid entitlements, provider credentials, user sessions, exports, and audit history. Consider anonymous visitors, ordinary members, organization owners, revoked users, a malicious tenant, webhook senders, maintainers, and coding agents reading untrusted documents.

Trust boundaries include browser-to-server, Next.js-to-Convex, WorkOS-to-application, Stripe-to-webhook, development-to-production, and template-to-future adapter. Provider identity does not by itself prove permission over a requested record.

## Failure cases and required controls

| Failure                                                       | Required behavior                                                                                | Verification                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Tenant A sends Tenant B's record ID                           | Backend denies reads, writes, lists, exports, and file access                                    | Two tenants and guessed IDs against actual public functions            |
| Member changes a role field in the request                    | Server checks current permission; last owner remains protected                                   | Role escalation, owner removal, invitation acceptance cases            |
| Revoked user keeps an old session                             | Membership removal takes effect within the documented window; sensitive writes require freshness | Old token after revocation and org switch                              |
| Free user calls a paid endpoint directly                      | Backend checks entitlement and role                                                              | Direct function calls, not only hidden buttons                         |
| Forged, repeated, delayed, or wrong-environment billing event | Reject forgery/mismatch; deduplicate; reconcile against current state                            | Signed fixture, replay, reordered delivery, interrupted handler        |
| Checkout return page claims success                           | No paid access until verified server state                                                       | Tampered return parameters and abandoned checkout                      |
| Redirect or invite points outside the app                     | Restrict allowed destinations and validate invite ownership/expiry                               | External URLs, protocol-relative URLs, auth loops                      |
| User requests deletion                                        | Lock access, remove only declared owned data, handle interruption                                | Two organizations, interrupted deletion, retained audit-policy check   |
| Anonymous demo bypass enters production                       | Production configuration rejects it                                                              | Build/start config test and anonymous live smoke test                  |
| Secret enters a client bundle, log, or commit                 | Keep secret env server-only and redact diagnostics                                               | Bundle inspection, staged-diff review, CI secret scanning when enabled |
| Agent follows instructions in a report or external page       | Treat source contents as untrusted data; follow owner scope                                      | Review workflow and permission boundaries                              |
| Future adapter is absent, compromised, or offline             | Minimal scopes, explicit trust, bounded failures; base app still works                           | Adapter disabled/offline compatibility test before integration         |

## Runtime and operations requirements

Validate external inputs. Do not rely on TypeScript alone at trust boundaries. Apply reasonable per-identity and per-organization request limits at sensitive endpoints. If uploads are added, validate size/type and authorize object access.

Keep public marketing independent of private tenant records. Use separate development, preview, and production services. Never connect a public preview to a live billing secret or production database. Document the account-deletion scope and any intentional retention before exposing deletion to customers.

Before public release, test a restore into an isolated environment, establish a private vulnerability reporting path, and record the supported release/version policy. Do not advertise compliance, penetration testing, or guaranteed security based on this threat model.
