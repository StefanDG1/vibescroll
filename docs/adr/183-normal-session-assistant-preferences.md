# ADR 183: normal sessions for routine actions, fresh sign-in for high-risk changes

Date: October 28, 2026. Status: implementation candidate, not published. The owner broadened the original assistant-only correction to all routine five-minute sign-in checks and requested direct sign-in/back navigation.

## Decision

Use the normal authenticated app session for ordinary saving, analysis, permission review, device pairing, scans, personal/subscription trials, private-library setup, bounded repair, team knowledge grants, moderation, invoice bookkeeping and settlement export authorization. Remove only the duplicate authentication-age requirement. Keep ordinary identity, organization/role, OAuth scopes, rights, exact input/version binding, consent/funding, current device, provider eligibility, quota, audit, retention and same-origin controls.

Fresh authentication remains on the explicitly typed high-risk actions: account deletion, entire-workspace deletion, changing a provider credential, publishing a private edition, publishing a public collection and promoting the service's shared catalog recommendation. The policy inventory test rejects accidental additions to routine flows. Verifying an already stored credential uses the normal owner session and cannot change the key. Revocation/takedown should not be obstructed by a new sign-in ceremony. Account/workspace deletion now checks freshness immediately before irreversible writes, after normal confirmation/precondition checks.

An expired session still requires ordinary sign-in. A valid session without `auth_time`, or established more than five minutes ago, is sufficient for routine work. A model/permission selection is not a new authentication event. This changes neither token lifetime nor provider refresh/revocation. Existing MCP identities cannot use app mutations to expand their own grants.

## Direct round trip

When a retained high-risk check returns `REAUTH_REQUIRED`, the browser starts the official sign-in flow directly and returns to the same allowed app/account page and query. The sign-in route validates a local return path; external, scheme-relative, malformed and ambiguous paths use `/app`. The installed AuthKit callback reads the return path from PKCE state before its fallback. Server-form actions perform the same round trip. No deletion, payment or publication arguments are replayed after returning; the user reviews/confirms the high-risk action again. There is no intermediate manual sign-in notice/button for this path.

## Scope and evidence

The owner's later default shared-catalog and minimal-setup product direction is mandatory in [Shared intelligence](../strategy/SHARED-INTELLIGENCE-MOAT.md). Routine per-post privacy/permission ceremonies are not the target design. Actual provider/content authority, token validation and source truth remain service obligations, rather than permissions fabricated by the model.

Test established sessions, absent `auth_time`, exact remaining high-risk call inventory, no-write denial before account/workspace destruction, normal credential verification versus key change, configured scopes/current versions and direct safe return paths without replay. Retain all ownership, expiry, unknown-attempt, no-spending and cross-tenant regressions. Previous test assertions that required redundant routine sign-in are intentionally replaced; earlier failed runs remain in private logs.

Three approved actual backend publications and two included Basic builds are already used. A further compatible release requires an explicit publication/build-count exception within the existing cumulative budget and Vercel ceiling. This candidate does not silently change saved grants, defaults, source jobs, shared catalog flags or billing.
