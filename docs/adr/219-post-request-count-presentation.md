# ADR219: show distinct post requesters

Date: October31,2026. Status: live atcbe062d; twenty staged and twenty canonical layout/native cases, plus owner-session count/help read accepted. Backend2510081 unchanged. [Receipt](../operations/evidence/launch-20261031-post-requests-production.json).

The owner clarifies R129: the share-style feed count represents people requesting a link inside VibeScroll, including cached results. It is not outbound sharing or an external platform metric.

Reuse ADR216's transactional distinct-person submission counters. Successful app/MCP link capture counts before later analysis success/failure, and shared-cache association merges the same person into the canonical family without duplication. Repeat capture, retries and multiple workspaces cannot create another shared-person count. Viewing a search result is not a new link request. Preserve all existing rows, timestamps, sharded counters, deletion behavior and serialized `shares`/`saves` compatibility fields. No schema, backend code, credit change, backfill or inference is required.

Replace the outbound Share button with a people icon and an explanatory tooltip available by pointer, keyboard focus or tap. Keep the short count in the feed; place its definition in post settings and Trends. Trends uses each person's first recorded request in its window. Counts show observed interest, not completed jobs, quality or benefit. Unknown totals remain unknown. Preserve theme/mobile/reference geometry and Library Tree/Folders.

Acceptance: existing app-capture/replay and shared-cache two-user tests; full checks and exact CI; native desktop/mobile request-help dismissal and unchanged count after interaction; staged/canonical feed, Trends and Library layouts. Publish only the website, after confirming the backend bundle is unchanged and current funding permits a normal Basic build. Actual release evidence will distinguish local tests from production.
