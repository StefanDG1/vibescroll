# ADR 160: prove native Events before automatic video analysis

Date: October 26, 2026. Status: native connection renewal and actual app-save acknowledgement accepted in the private owner pilot.

## Decision

Use the supported ChatGPT native MCP Events monitor. The owner authenticated a parallel plugin without deleting the original. Actual discovery, signed callback verification, HTTP 200 delivery, separate later agent replies and automatic renewal beyond the original OAuth-bound expiry passed. Preserve finite credentials, expiry and revocation checks. Do not use Workspace Agents, scheduled polling or private ChatGPT APIs.

Add `video_link_saved` to the existing Events contract and shared authorized capture operation. This is an acknowledgement trigger, not an analysis approval. Reuse the current subscription/delivery tables, encrypted credentials, scheduler, bounded retries and permission checks. Add no service, table, index, component or cron. Widen only the existing event-name validators. The serving frontend's static event catalog must be rebuilt before the new event can be discovered.

Notify on an explicit single video-link save, including reuse of a saved canonical URL. Never scan the old library at subscription creation. Exclude bulk imports, text, uploads and non-video URL classes. Reuse the existing source-occurrence index with source creation time and generation as the immutable occurrence binding. Preview updates do not invalidate a valid saved occurrence. Repeated saves coalesce while its delivery is retained; existing 24-hour terminal cleanup still applies. Stable event IDs support receiver deduplication under at-least-once delivery.

Use the same current private-owner pilot, all-library grant, reviewed Cloud policy and registered scopes as other profile Events. Recheck source tenancy, rights, deletion, generation and grant authority before delivery. The payload contains source/profile identity, generation, grant version, saved status and a protected `/posts/{id}` URL. It contains no source URL, title, transcript, media, lease or job authority.

## Acceptance and limits

The [live receipt](../operations/evidence/launch-20261026-chatgpt-native-events.json) records the connection proof separately from the source candidate. The [setup runbook](../operations/chatgpt-native-events.md) gives exact operator steps and explains customer authentication and renewal.

Offline tests exercise actual capture through the outbox, modern SDK discovery/subscription, signed runtime payloads, duplicate/canonical reuse, no backfill, bulk exclusion, grant/privacy/revocation failures and concurrent preview updates. The [production save canary](../operations/evidence/launch-20261026-saved-link-native-ack.json) passed actual app Save to later ChatGPT acknowledgement with identical saved-data hashes and no analysis. Automatic media execution remains a later checkpoint.

The owner raised the cumulative cap to EUR7.50 and approved a separate USD0.45 release/canary envelope after reviewing the tested candidate. Exact compatible CI40314319573 passed. Backend/frontend6cdcb1c now serve the event after zero schema scans/backfills, one fixed Basic queued build, exact staged/canonical checks and same-build promotion. Both test monitors are paused and their delivery authority was removed. Every previous hold, unknown attempt, reserved post, old repair, full-main migration and provider/privacy gate remains.
