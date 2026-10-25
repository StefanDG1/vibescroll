# ADR 156: direct post pages and the first caption-first Cloud milestone

Date: October 25, 2026. Status: owner direction accepted; implementation and production acceptance in progress.

## Decision

Each saved post has an authenticated, bookmarkable page at `/app/{org}/posts/{sourceId}`. Reuse the current detail implementation and authorization; preserve existing `/library/{sourceId}` deep links. Home shows recent additions as compact metadata cards. One normal click opens the post. Remove the earlier expand-first, second-click interaction from ADR149. Full analysis, transcript and evidence load on the post page, not in recent-card payloads. Thumbnail loading remains deferred and authorized. Cache keys include account, scope, source identity and content revision; no public cache of private post pages is introduced.

Show available native title, author, cover and dates before analysis. Save-only preview never grants analysis authority. Keep the same source ID through preview, extraction, analysis and result refresh. Reuse existing source/asset/projection/request owners.

Use a shared bounded caption-first yt-dlp pipeline. Reuse usable platform captions, including automatic captions, without starting ASR. Preserve origin/language and use verified local ASR only when necessary and supported. Return actual image bytes with stable evidence references. Existing v2 jobs/results remain readable while caption-aware media is versioned explicitly.

## Scope reduction

Retire voluntary region sharing, its collection UI, regional public aggregates and globe. These do not select storage location or catalog access. Keep current data-location and privacy controls.

Remove public edition/collection publishing from ordinary post analysis and defer further publisher development. Preserve existing published content, public examples, canonical stores and their access/moderation rules. Defer Telegram capture implementation and remove its unfinished connection placeholder. Consolidate duplicate navigation under Projects and Account while preserving routes. Put launch checks and diagnostics in operator/advanced tools.

Finish the Work Cloud media route first. Existing local/paid routes retain their independent authorization, recovery and financial controls; expansion and cosmetic work on those routes are deferred. Routine capture uses supported standing defaults rather than per-post executor/model/effort selection. Do not advertise or manufacture standing readiness before the actual Cloud host passes acceptance. Upload/text/import recovery remains available.

Creator monitoring and Facebook/X expansion follow single-link acceptance. YouTube remains optional. These are explicit priority/scope changes, not passed or deleted acceptance. Project application, private notes, search/organization, exports/deletion and existing data remain in scope. All other retained launch work remains in the current index.

## First milestone and acceptance

The first milestone is one direct saved-post page with progressive metadata, verified source speech/captions, retained images and cited analysis through the actual inline Work Cloud MCP path. Repair the demonstrated Reel without replacing its original accepted result or reviving its expired lease. Also verify a caption-path example with zero ASR. The reserved owner-test TikTok stays unanalyzed. The owner authorizes selecting other suitable links from their production account as needed.

Offline contract, worker, backend and native browser checks precede live operations. A ready active chat completing analysis does not establish idle Events wake; phone-share/laptop-off acceptance remains a separate later milestone. Catalog publication remains subject to independent ownership and provider/reuse gates.

Preserve the cumulative EUR5 cap, unknown/storage/cleanup holds and fixed Basic queued builds. Publication and source processing need a complete conservative reservation and current authority. Full-main populated-index backfills are not authorized by this decision. Report local, staged and production evidence separately.
