# ADR 177: bind supported TikTok extractor aliases by video ID

Date: October 26, 2026. Status: candidate; not published.

## Evidence

The closed-tab automatic TikTok test delivered its event, passed readiness and claimed one generation. Its inspection exited1 with unsupported_source. No media acquisition, ASR, frame preparation, upload or completion followed. Accepted relinquishment after a valid heartbeat left the consumed attempt unknown. The task reports deletion of its two owned roots and preservation of shared caches; provider deletion and subscription usage remain unverified. The attempt must not be replayed.

Read-only reconciliation confirmed that the inspection argument matched the approved short-link contract. That argument passes the pinned initial validator. The returned webpage_url validator is therefore the failing code path, rather than an independently labelled exception trace. The raw returned result was never persisted because validation precedes the resolved-info write. Its exact URL form is unavailable. One successful metadata subprocess is inferred from that path; no separate child-exit receipt exists. Do not claim that a particular alias caused this production failure.

Independent offline cases reproduce a narrower defect. Pinned yt-dlp2026.10.21 supports individual TikTok video URLs with an empty handle, a share/video path or an opaque author identifier. VibeScroll used its stricter submitted-URL matcher for those returned references and rejected them. The primary implementation is the installed pinned TikTokIE URL matcher and TikTokBaseIE._create_url; no platform request was needed to establish this mismatch.

## Decision

Keep submitted URL validation unchanged. Parse a separate bounded resolved identity. Admit the three additional video forms only in metadata on the existing TikTok host, with the exact TikTok extractor key and matching numeric metadata/video-path ID. Keep HTTPS, no credentials, default port, fixed path grammar, bounded handle/URL lengths, individual-video, duration and original-post identity checks. Reject photos, collections, live content, other domains and mismatched IDs. Do not add retries, source invocations, network permissions, cookies, login or funding routes.

Bind the stable video ID through final preparation as well as acquisition. Preserve the already approved canonical identity for a full submitted video URL. A short link may use the returned public handle when valid; otherwise use the pinned extractor's existing /@_/video/ID representation. This placeholder makes no author-name claim. Native author metadata remains separate. Never treat the returned alias as authority for a new source request. Unsupported returned forms now report the fixed unsupported_resolved_source code, with no raw URL or metadata.

Freeze the serving v3 extraction manifest byte-for-byte as cloud-extractor-pre-resolved-v3.lock.json, SHA4bde8f3763802e7e2d8dd272e85804e63d06771dc9b416ebc6c72646ac524842. Preserve every published archive and older reviewed policy. Existing accepted, failed, unknown and reserved posts retain their original hashes and state. New automatic setup still requires the current exact policy and reviewed grant; no stored hash or old intent is patched.

## Verification boundary

Two new focused regressions failed before the correction. Afterward, Python19 cases pass with2 Linux-only skips on Windows, including actual synthetic media/caption/JPEG preparation and final alias binding without ASR. Three focused Cloud files pass170 tests, including the newly retained exact policy and source-consent cases. Full compatible checks pass1,306 Vitest with3 hosted skips,19 Node and72 Python cases with7 Windows skips; main passes2,140/19/81 with the same skips. Validation, types, zero-warning lint and both production builds pass on each branch. The immutable tools archive is82,057bytes/16files, SHA49e57707a6924ca56f71343935ac1153ffe323752e63dc599d68dc3b0e466327, bound to source321e041. Prior manifests and published archives remain byte-identical. Exact CI and any controlled publication remain pending. Production stays97dfa2c and no complete automatic media result is accepted.
