# Assistant access until revoked

Mode: reference. Decision October 17, 2026. Owner-authorized implementation; exact release and account activation are recorded separately in implementation status.

Offer an explicit "Until I turn access off" duration for assistant grants, selected by default in Connections. Keep seven-day and thirty-day choices. Store reviewed access until revoked as `expiresAt: null`; existing numeric expiries keep their meaning and are never silently upgraded. Null must be supplied explicitly when saving. Fresh app authentication, the acknowledgement and compare-and-swap grant version remain required.

An all-library scope includes current and future eligible posts, including unfiled posts. Personal and Business scopes retain their current filing restrictions. This decision changes the duration, not the selected workspace, client, actions, project-context versions, source rights or evidence checks. Revocation, membership loss, account deletion, provider disconnection and restore quarantine continue to fence access. An app grant is independent of OAuth token expiry and renewal. Processing, spending, coding and publication still need their own approvals.

Use one shared grant-currentness predicate in tool authorization, profile discovery and completion delivery. Return `expires_at: null` for approved profiles until revoked. Completion credentials remain capped by OAuth expiry and thirty minutes even for these grants; Events stays disabled in production under its existing release gate.

Reuse indexed grant lookup and bounded live-library retrieval. Store no post copy, add no renewal mutation, background job, full-library scan or timer. Skip expired/revoked grants before reading their workspace and membership during discovery. New posts become eligible through the existing live scope when requested.

Affected checks: real-handler access years later, future unfiled posts, immediate revocation, timed expiry, stale version, fresh sign-in, membership loss, finite completion credentials and OAuth lifetime. Existing cross-workspace, source correction/deletion/rights, paging and funding tests remain required. Production verification must check the actual owner's saved grant and a fresh plugin profile read; local tests cannot establish account activation.
