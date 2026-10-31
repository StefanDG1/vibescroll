# ADR 191: prepare media before subscription or Gateway analysis

October 29, 2026. Status: local implementation candidate; live comparison pending.

## Decision

Use the existing Vercel Sandbox, private R2 objects and Convex backend. A pinned yt-dlp CLI resolves one Instagram/TikTok video and returns native metadata before downloading. Reuse its resolved metadata for download. Prefer native captions; otherwise extract mono PCM for `microsoft/mai-transcribe-2` through Vercel AI Gateway. FFmpeg samples eight actual JPEGs. Stop the disposable VM before analysis. Neither ScrapeCreators nor Transloadit is involved.

Retain an immutable evidence bundle with source, recipe, transcript and JPEG hashes. A separate preparation record holds dispatch state and timing; it uses Convex's existing scheduler, not another queue service. Claim it transactionally before external work. Unknown outcomes retain their allowance and prevent redispatch. Upload failures use the existing durable object-deletion path. Source/account deletion removes private preparation history as well as evidence and versions.

Muse Contributor receives only explicitly permitted public source evidence, with its current Meta routing and price checked before dispatch. A managed result records managed API provenance. The subscription route emits the existing retained-evidence waiting event; the current native VibeScroll Assistant reads the retained JPEGs and transcript and returns an immutable version. Its analysis API maximum stays zero. Preparation funding is separate and explicit. Existing zero-API jobs gain no paid fallback.

Both routes preserve the incumbent result, generation and original screenshot references. A new initial result can become selected; a comparison against an existing result remains a candidate. These comparison candidates do not inherit the old Cloud-only shared-publication permission. Existing accepted catalog versions and their reuse remain available. Broader managed publication, wallet charging and general customer enablement are subsequent acceptance work.

Post detail and the first twenty displayed Posts/Home records subscribe to metadata through authenticated Convex WebSockets. The browser obtains only its own short-lived user token through a same-origin, uncached AuthKit endpoint. No administrator credential or assistant refresh token is exposed. Transcript and complete analysis remain detail reads. Progress reports actual stages rather than fabricated percentages.

The owner subsequently postponed the Local Machine executor. Do not implement or enable that adapter in this checkpoint.

## Bounded acceptance

The owner selected automatic Save through the existing Assistant and approved a new USD0.50 test envelope, with cumulative EUR14, existing balances only, no top-up and Vercel strictly below USD20. Test two fresh preparation passes against one already permitted short source, at most one Muse analysis, and the native subscription completion. Keep the reserved post, old attempts and financial holds. An exact owner/source/policy allowlist disables this alpha outside the comparison; ordinary users retain the accepted route.

Measure Save/request-to-ready and metadata/thumbnail availability, tool transfer, VM creation/isolation, acquisition, decoding, ASR, image storage, event waiting, model work, validation and teardown. Subscription tokens are excluded from cash. Distinguish provider-settled charges from rate estimates. Do not present model-only benchmark times as complete pipeline measurements.

Acceptance requires exact-head checks/CI, compatible guarded publication, actual source images and transcript, immutable versions, original-result preservation and observed native automatic completion. Local fixtures alone do not establish production success.
