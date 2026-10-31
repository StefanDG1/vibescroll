# ADR216: durable post engagement and feed continuity

Date: October31,2026. Status: live at3f18974; engagement enabled. [Production acceptance](../operations/evidence/launch-20261031-engagement-production.json).

## Data and boundaries

Use the official Apache-2.0 @convex-dev/sharded-counter0.2.3 component with16 shards, plus one root postEngagement row per user and post key. No new external service. Private posts use their source ID; current shared results use their existing catalogue family ID across versions and workspaces. Read membership, source retention/rights and shared evidence/entitlement before disclosing counts. Never return liker identities. The backend flag stays disabled until compatibility/publication acceptance.

Each explicit successful non-bulk Save counts one distinct user for that post. A replay, a repeat Save or a second workspace does not inflate a shared count. A successful shared association merges the same user's private record into the family record transactionally. Outgoing share/clipboard clicks are not inbound Saves. Counts begin with instrumentation; do not scan historical sources or claim complete earlier totals. Likes are preferences, not measured quality.

Record the first observed Save timestamp and the latest explicit reaction timestamp. Add their bounded per-post time indexes while this new table is empty, so the next Trends slice needs no populated-table backfill. Repeat Saves preserve the first timestamp; shared association preserves the earliest observed Save. These fields support honest sampled windows later and do not manufacture past activity or immutable event history.

Like changes carry desired state, expected revision and a request key. Duplicate keyed requests return the saved result; a stale retry after Unlike cannot resurrect the older Like. Update counters in the same transaction and never read all shards inside the write transaction. Read exact counts through bounded reactive queries for the current post and immediate neighbours. Account deletion decrements/removes the user's records in batches; deleted private sources retire their private records and counters. Shared preferences belong to the user across workspaces.

Preserve the selected feed layout. A dedicated feedLive query combines three visible metadata/reaction records with up to20 lightweight ready dashboard-card references. It uses the same single subscription client as the old metadata hook. The existing liveMany array response remains compatible; no optional flag changes its outer shape. A Like must not refetch analysis or call a model. New-ready references offer a deliberate refresh instead of moving the reading position. A per-account/workspace session bookmark stores only the post ID and original opaque pagination cursor, expires after seven days and yields to a gesture already in progress. It grants no source access. Keep drafts on failure and provide a small contextual error. Existing proposals remain scrollable in their column rather than hiding all after the first three. Source-wide proposal input remains unchanged.

When a private record joins an existing shared preference, retain the most recent explicit Like/Unlike timestamp, with the existing shared record winning ties. Saving alone does not advance that timestamp. Keep like revisions monotonic and preserve once-only request keys. This is preference ordering, not an analysis-quality score.

## Acceptance

Test concurrent duplicate likes, stale retries, repeat Saves, private-to-shared migration, multiple requesting users, authority changes and deletion. Confirm no credit changes or acquisition. Verify the same metadata-only subscription updates the native UI, then run desktop/mobile/light/dark feed and Library checks before promotion. New root/component tables must be empty at compatible publication and cannot trigger a populated scan or backfill. Trends/history and model-quality inference remain separate milestones.
