# ADR 160: prove native Events before automatic video analysis

Date: October 26, 2026. Status: native connection acknowledgement accepted in the owner pilot; saved-video event is an unpublished candidate.

## Decision

Use the supported ChatGPT native MCP Events monitor. The owner authenticated a parallel plugin without deleting the original. Actual discovery, signed callback verification, HTTP 200 delivery, separate later agent replies and automatic renewal beyond the original OAuth-bound expiry passed. Preserve finite credentials, expiry and revocation checks. Do not use Workspace Agents, scheduled polling or private ChatGPT APIs.

Add `video_link_saved` to the existing Events contract and shared authorized capture operation. This is an acknowledgement trigger, not an analysis approval. Reuse the current subscription/delivery tables, encrypted credentials, scheduler, bounded retries and permission checks. Add no service, table, index, component or cron. Widen only the existing event-name validators. The serving frontend's static event catalog must be rebuilt before the new event can be discovered.

Notify on an explicit single video-link save, including reuse of a saved canonical URL. Never scan the old library at subscription creation. Exclude bulk imports, text, uploads and non-video URL classes. Reuse the existing source-occurrence index with source creation time and generation as the immutable occurrence binding. Preview updates do not invalidate a valid saved occurrence. Repeated saves coalesce while its delivery is retained; existing 24-hour terminal cleanup still applies. Stable event IDs support receiver deduplication under at-least-once delivery.

Use the same current private-owner pilot, all-library grant, reviewed Cloud policy and registered scopes as other profile Events. Recheck source tenancy, rights, deletion, generation and grant authority before delivery. The payload contains source/profile identity, generation, grant version, saved status and a protected `/posts/{id}` URL. It contains no source URL, title, transcript, media, lease or job authority.

## Acceptance and limits

The [live receipt](../operations/evidence/launch-20261026-chatgpt-native-events.json) records the connection proof separately from the source candidate. The [setup runbook](../operations/chatgpt-native-events.md) gives exact operator steps and explains customer authentication and renewal.

Offline tests exercise actual capture through the outbox, modern SDK discovery/subscription, signed runtime payloads, duplicate/canonical reuse, no backfill, bulk exclusion, grant/privacy/revocation failures and concurrent preview updates. Production acceptance must then prove actual app Save to later ChatGPT acknowledgement without analysis or saved-data changes. Automatic media execution remains a later checkpoint.

Retain the owner's cumulative EUR7 cap and every previous hold, including unknown work and the exact old Reel repair. Current evidence does not fund another full Basic frontend build envelope. Prepare and validate the candidate before requesting a concrete release allowance. Do not deploy full main or activate another provider/privacy gate for this small proof.
