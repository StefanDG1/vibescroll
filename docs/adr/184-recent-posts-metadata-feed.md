# ADR 184: separate recent posts from Library

Date: October 28, 2026. Status: implemented locally, not published.

## Decision

Use `/app/<workspace>/posts` for recently added posts and `/app/<workspace>/posts/<post>` for their full details. Preserve existing Library and legacy detail URLs. Home links to All posts, and post details return to Posts. Keep the current visual system; the owner will handle later frontend design.

`posts.recent` authenticates normal app membership and reads the existing `sources.by_org_created` index in descending creation order. Each page reads at most 20 records, with a 4 MiB pagination byte bound, and filters deleted/expired sources within that page. It does not scan ahead to fill hidden rows or add a populated-table index. An empty page can still have a continuation cursor.

The response allowlist contains ID, display title, author, kind, state, generation, creation/metadata timestamps and at most three authenticated image references. It excludes transcripts, analyses, summaries, complete media manifests, task/lease authority, project context and private job objects. The first metadata page loads with the workspace context in parallel with organization details. Subsequent pages load near the viewport with a button fallback, duplicate-request suppression, ID deduplication and cancellation on unmount. Full post links disable prefetch so browsing the feed does not load every analysis.

Native titles replace exact known generated placeholders tied to the source locator. Custom titles remain unchanged. Display resolution does not rewrite approved source input or invalidate a pending intent. A failed preview image falls through to a retained screenshot, then an honest placeholder. Image pixels still require the existing authenticated evidence endpoint and its current retention/ownership checks. Source details observe native metadata revision changes. New dashboard projections use the same title resolver; no bulk source rewrite or old-card backfill is run.

Automatic-video setup replaces the redundant manual Cloud diagnostic card on ordinary supported post pages. The separately supported manual route remains available for source types without automatic setup. Routine fresh-login notices are removed under [ADR183](183-normal-session-assistant-preferences.md).

## Verification and limits

Backend tests cover pagination/order, exact payload fields, deleted/expired exclusion, anonymous/MCP/cross-tenant/recovery denial and native/custom title resolution. UI tests cover image fallback, lazy pages, no analysis prefetch, deduplication and request cancellation. Existing projection, source-preview and Cloud parent regressions also pass locally. Exact CI and production evidence are separate. This change does not enable the catalog, start an analysis or change a saved grant.

Safe failed-video retry, automatic eligible catalog contribution and simplified one-time MCP defaults remain in the mandatory [shared-intelligence plan](../strategy/SHARED-INTELLIGENCE-MOAT.md). Do not describe them as completed by this feed change.
