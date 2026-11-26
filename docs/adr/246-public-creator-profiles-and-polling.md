# Public creator profiles and daily polling

26 November 2026.

The owner requests shared publication, creator matching and following in production. They selected an existing Instagram session for the polling test. A new social account is unnecessary.

Use one watch per verified platform account. TikTok public discovery reads the profile's stable account ID, then the creator feed with at most 15 posts per request. The live endpoint rejects 20 with `invalid count parameter`. Follow its millisecond time cursor and validate every item's author, date and post ID. Photo posts have zero video duration and remain eligible for analysis.

Instagram discovery uses the current profile and posts GraphQL operations observed in the normal signed-in browser. Keep only the three required cookies in the deployment secret, together with the session account identity and a finite expiry. Refresh security nonces from the authenticated page before each feed read. Confirm the logged-in account and target creator IDs. Send credentials only to Instagram with redirects disabled. Authentication failures mark the watch unavailable and create no analysis or credit reservation. A revoked or expired login requires a new session.

Store bounded public profile observations for 24 hours. Match accounts through reciprocal links on those profiles. Matching handles alone cannot establish identity. Keep the existing workspace access checks and manual group corrections. Automatic associations expire after seven days without refreshed evidence. Comparing retained media and captions remains a separate condition for showing multiple originals on one post. Profile discovery never makes private posts public.

An old pinned post must not end discovery while the same page contains newer posts. Continue pagination until a complete nonempty page is outside the overlap window, or the provider reports completion. Preserve the checkpoint on incomplete reads and back off after failures.

Use existing paid personal funding or the exact current admin allowance for sponsored work. Admin sponsorship reserves only admin monthly credits. Ordinary sponsorship reserves included credits. Purchased credits remain excluded. Keep the disclosed 10% period limit, daily cap, stable randomized choice among similar projected usage, durable history across rejoining, atomic provider exposure and unknown holds. Skip ineligible accounts before sponsor selection. A photo job cannot be refused merely because its video duration is zero.

Local server probes returned 20 Instagram posts and 15 TikTok posts, including five TikTok photo posts. These observations verify the adapters from the local server. Production polling and sponsorship acceptance must be recorded separately after release. The earlier production carousel and photo analyses and shared publication retain their own receipts.

The creator website route fix is already live at `e7d64781b9ecdaa22a6def3e65af9d5ca50d4a8c`. Signed-in checks at 390 and 1440 pixels verified the decoded route, post link, layout and reversible Follow action. The pending backend changes do not alter that serving website commit.

## Shared creator pages

The owner explicitly selects every shared analyzed post across VibeScroll for creator pages. Preserve the existing full-catalog entitlement and enabled preference. Workspace-only private results keep their current scope. MCP creator reads include entitled shared post links alongside authorized workspace posts.

Index the selected shared version under its verified platform account ID in the new `creatorCatalogPosts` table. The table stores public metadata and compact media fingerprints, never private source IDs or image bytes. Populate it from the independently owned, validated catalog artifact. The metadata migration pages eight catalog families at a time, with a reviewed 128-family limit for this release. Existing results without a verified stable creator ID remain unattributed until metadata can establish it. Do not guess identity from display names.

The new table and its three indexes start empty. The added profile-URL index is on `creatorWatches`, whose bounded production preflight returned no rows. Review these exact additions and preserve every populated schema and index. The metadata population is a separate bounded application operation, not a schema scan or a model job.

Shared creator pagination reads bounded indexed pages across at most eight verified accounts. It preserves equal publication timestamps with a family-ID continuation. Recheck artifact selection, retention and current publication authority before returning a row. A missing or blocked alternative cannot add a platform link.

Use the same retained media-comparison rules for workspace and shared posts. Exact content or recent corroborated re-encodes can supply multiple originals only within a verified creator group. Display a matching cross-platform post once and retain each platform's independently owned analysis. The ordinary post reader and catalog reader show the verified original links. Catalog readers expose retained images and original captions through the existing authorized evidence endpoint. Reads do not copy a result, populate a personal library or reserve credits.

Follow and contribution actions reuse the existing pending and inline-error form component. New-post labels cover photos and videos. A new follow schedules the first available feed check without waiting for the periodic cron. Repeating an unchanged follow does not repeatedly trigger a new check.
