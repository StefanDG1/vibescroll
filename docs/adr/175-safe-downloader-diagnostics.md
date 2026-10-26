# ADR 175: bounded downloader failure hints preserve accepted media versions

Date: October 26, 2026. Status: candidate; not published.

## Observed failure

The actual closed-tab automatic Reel run passed preflight, created and claimed one generation, then its sole metadata inspection exited1 with source_download_failed. It acquired no media and did not initialize ASR, prepare frames or complete analysis. The accepted helper captured stderr in a private temporary file but discarded it on a nonzero exit. Its underlying cause is unavailable; no source-access, network or extractor diagnosis is inferred retrospectively. The task relinquished after a valid lease check, cleaned its known temporary roots and paused. Its consumed generation stays unknown and is not replayed.

## Decision

Classify at most64,000 stderr bytes into a fixed reported-hint code before closing that temporary file. Recognize narrowly worded runtime, HTTP/access, rate, transport, metadata and unsupported-media reports; retain source_download_failed for unknown cases. Mask URLs before matching. Emit no raw diagnostics, source URLs, response content, paths, cookies or secrets. A code is neither provider attestation nor authority to retry, change networking, log in, install tools or change funding. Check final output limits even when the child exits between polling checks.

The implementation changes only cloud_extraction.py. Source invocation, retries, process/resource/time/disk bounds, network transport, TLS, no-cookie/no-impersonation behavior, ASR/model pins, actual JPEG requirements and all source/privacy/funding limits stay fixed. The inspected primary implementation is pinned yt-dlp2026.10.21, including its Instagram and TikTok extractor messages. Optional login/cookie or impersonation advice does not authorize those routes.

Freeze the previous v3 manifest byte-for-byte and preserve both older archives. Select a retained job's policy only from the bounded reviewed list by its exact schema, policy hash and toolchain hash. Never reinterpret an old approval using the new extraction implementation. Existing unknown, completed and reserved posts are untouched. New app-Save setup still requires the exact current policy; no stored grant hash or waiting intent is silently upgraded.

## Verification and release boundary

Focused contracts pass168 cases, including both earlier v3 implementations and prior exact-source consent. Python tests cover safe categories, secret-bearing URLs, unknown diagnostics and bounds; actual Linux child failure and fast-output cases run in CI and skip explicitly on Windows. Full compatible checks pass1,304 Vitest with3 hosted skips,19 Node and70 Python cases with7 Windows skips, validation, types, zero-warning lint and production builds. Main mirroring is separate. The new immutable tools archive is80,335 bytes/16files, SHAbe21d22c1ecf35ba0d1a795e5d518e6593deeb1bb59556ae7a4d1c527891e0ce. Actual Linux CI, root review, current production sink/schema checks and staged/canonical publication remain required. No live diagnostic or complete automatic media result is claimed.
