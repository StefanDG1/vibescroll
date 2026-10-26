# Finish the first link-to-Cloud-analysis milestone

Owner direction: October 25, 2026. Status: implementation candidate; production acceptance remains open. [ADR156](../../adr/156-direct-post-pages-and-caption-first-cloud-milestone.md) records the accepted scope changes.

## Make each post directly accessible

Use `/app/{org}/posts/{sourceId}` as the direct authenticated post page. Preserve old `/library/{sourceId}` links through the same detail implementation. A stable URL makes bookmarking and scoped cache identity straightforward; it does not make private data suitable for an anonymous shared cache.

Home shows recently added posts ordered by capture date, using the existing dashboard projection and a created-date index. Cards contain bounded title, author/platform, thumbnail reference, dates, counts and status. They carry no insight excerpts or full analysis. Images load lazily through the existing authorized asset route. One click or keyboard activation opens the post; no expansion step is required. The post page loads its analysis, transcript, evidence and actions on demand.

Keep the existing client request/cache owner, account and grant scope keys, revision fences, expiry and sign-out clearing. A missing Home projection returns a small unavailable state instead of fetching the whole Library. Do not reuse Home's preview marker as a Library cursor or load heavy detail on hover.

## Reduce the release scope

- Retire region collection, public regional aggregation and the globe. Preserve old-consent withdrawal and source/account deletion. Storage location and privacy controls remain.
- Remove public publishing from ordinary post analysis. Preserve management/withdrawal of existing editions and public examples in advanced privacy controls; defer publisher expansion.
- Remove the unfinished Telegram connection card and defer Telegram capture implementation.
- Finish Work Cloud first. Preserve local/paid routes and recovery, but defer their expansion. Standing setup and supported defaults replace routine executor/model/effort choices when actual Cloud readiness is accepted.
- Consolidate duplicate navigation under Projects and Account. Keep old routes and restrict operator diagnostics appropriately. This regrouping does not delete project/application/execution history.
- Put creator monitoring, Facebook/X enablement and optional YouTube after reliable single-link acceptance. Keep uploads, text and imports as useful recovery/input paths.

These are explicit scope/priority changes. Deferred features are not recorded as completed or deleted data.

## Execute in this order

| Stage | Deliverable                                                                                      | Checkpoint                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Reproducible failures and immutable source/evidence contracts                                    | Replay the retained production export without changing account content. Distinguish the displayed transcript mismatch from ASR accuracy.                                                        |
| 1     | Direct post pages, metadata-only recent cards, progressive native previews and region retirement | Browser at 320px/desktop; one-click/keyboard access; no heavy Home fallback; partial metadata and late-response tests.                                                                          |
| 2     | Reviewed caption-first downloader package                                                        | Actual pinned CLI against controlled media/subtitle transport; real subtitle parser; verified decode/hashes; caption success starts no ASR/model cache.                                         |
| 3     | Versioned MCP preparation, actual images and exact result-preserving repair                      | Legacy v2 keeps its original policy. New v3 handles captions honestly and requires frame bytes before completion. A separate short repair lease never reopens the old completed analysis lease. |
| 4     | First live milestone                                                                             | Review the real Reel against its audio, restore exact retained JPEGs, verify its direct page, then complete a permitted caption-path example through actual inline Cloud/MCP to the app.        |
| 5     | Global ownership and safe reuse                                                                  | Finish independent canonical artifacts/personal associations, Pro access, moderation, rights and privacy tests. Existing private experiments are not republished.                               |
| 6     | Automatic app-share-to-Cloud flow                                                                | Verify supported Events subscription, idle wake, renewal, revocation and phone-share/laptop-off completion using the same pipeline.                                                             |
| 7     | Broader platforms and retained launch acceptance                                                 | Enable only tested cohorts; continue the linked P/R/N/C/M work under these accepted deferrals.                                                                                                  |

Stages 1-3 are implemented and tested locally in increments. Only exact receipts establish their final test status. Stage 4 is not accepted merely because an older result was once returned or because a synthetic fixture passes.

## Use the existing downloader effectively

New caption-aware work uses the pinned yt-dlp 2026.10.21 wheel and pysubs2 1.9.0. Existing v2 jobs retain the original 2026.08.19 executable/toolchain binding. The shared [Cloud package](../../../packages/media/CLOUD.md) verifies reviewed source hashes and versions.

Use one bounded source metadata extraction followed by yt-dlp's supported `--load-info-json` processing for the selected files. This tested CLI path reuses the resolved information and the existing subprocess isolation; a second downloader integration or handwritten private platform scraper is unnecessary.

Publish available native metadata immediately through the current lease. Keep it separate from an approved saved title so a preview cannot invalidate the job's input hash. Page-preview failures must not discard useful author/title information or overwrite stronger extractor metadata. Source-derived strings never grant permissions.

Prefer usable platform captions, including automatic captions, over ASR. Preserve language, unknown origin/translation status, cue times and track hash. Distinct caption candidates have distinct identities. Reject oversized lossless results explicitly. ASR remains an explicit supported-language fallback, using existing verified local model files without runtime downloads.

Disable source networking before decoding. Verify actual duration, streams and byte limits, sample bounded frames, remove redundant samples and hash the exact compressed pixels that are viewed and returned. A native cover is untimed; a retained frame can provide the initial thumbnail fallback. Additional cover-format and scene-selection work must not be called complete by uniform sampling tests.

## Select small, useful tests

Use fixtures for malformed captions, unavailable fragments, identity/alias changes, stale grants, missing models, privacy and lost acknowledgements. Use generated video/audio to test actual FFmpeg/FFprobe, subtitle parsing, hash binding and image decode. Test old and new contracts through real handlers. Exercise current user/scope changes and delayed responses without another polling owner.

The owner authorizes selecting suitable saved production links when needed. Preserve existing analyses and unknown active work. The reserved owner-test TikTok remains unanalyzed. Reuse a source for several assertions without repeatedly downloading it. Count successful acquisition separately from correctly handled blocked sources.

For the actual Reel, a fresh repair permission accepts only original prepared JPEG hashes. A changed source or pixel hash requires a separately reviewed versioned correction; do not mutate accepted evidence to fit new bytes. Actual source-audio review remains distinct from renderer correctness.

## Preserve release and fiscal controls

The owner raised the cumulative cap to EUR7 on October26. The USD2.40 live-milestone envelope is now reserved, preserving every earlier unknown/storage/cleanup hold. The ledger retains USD7.275014256044614 under a USD7.42 working ceiling. No source/asset/deployment operation is cleared by writing this plan. Reserve the complete release, current-authority work, UI verification and cleanup before dispatch. Recheck actual schema/index impact: this candidate adds a created-date dashboard index, and full main already has five populated index backfills on hold. Do not deploy all main to bypass compatibility work.

Keep fixed Basic queued builds and exact staged/canonical version checks. Report local checks, actual inline Cloud execution, repaired production data, background wake and public/provider clearance separately. Missing capability or budget is an explicit remaining checkpoint, never a passed test.

## October26: accept one supported platform first

The owner confirmed that either Reels or TikTok working is sufficient for the first live workflow milestone and deferred connector reconnection/settings troubleshooting. Verify one complete permitted URL-to-Cloud-to-app result, including actual transcript and JPEGs; retain the original Reel repair as a separately tracked data-preserving task if its exact evidence cannot be restored. Do not hold a successful platform behind another platform's blocked extractor.

Compatible frontend/backend bba2715 is live with the direct post route and retained transcript fix. Its new tool names were absent from both active task catalogs. [ADR158](../../adr/158-preparation-stages-for-connected-cloud-hosts.md) therefore adds strict metadata/frame stages through the already available preparation scalar using the same authority and image actions. Publishing this backend compatibility does not require another frontend build or renewed app scopes. The first fresh run has not yet completed. Ordinary app-share background execution still requires a supported idle wake interface and remains separate from an automatic continuation inside an active Cloud chat. The exposed host has no such Events/wake control. Do not report phone-only completion from a manually resumed task.
