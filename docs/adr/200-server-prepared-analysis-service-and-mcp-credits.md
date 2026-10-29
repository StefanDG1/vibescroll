# ADR 200: server preparation and credit-funded MCP analysis

Date: 2026-10-29
Status: finite owner service pilot published and accepted; public rollout/commerce remains open

## Decision

Make existing server preparation a normally admitted service. Both routes use the same saved source, mediaPreparations row, immutable evidence/version, credit reservation and shared catalog family. No new table, index, component, source copy, billing product or worker queue is required.

Convex runs pinned yt-dlp/caption tools in an ephemeral, restricted Vercel Sandbox. Native title/author/duration are committed before download. FFmpeg creates bounded JPEGs and audio with decoder networking denied. Usable captions avoid ASR; otherwise Microsoft MAI Transcribe 2 through Vercel AI Gateway supplies speech. Image uploads and ASR run concurrently after decoding. Retain evidence once, then pass its transcript and real images to Muse Contributor through Gateway or the user's existing native ChatGPT Assistant through Events. The native route needs no downloader, Python or ASR setup.

Operator configuration binds an immutable configuration ID, provider processing review, source duration/API ceilings, rollout accounts and rate limits. Current verified Pro or the recorded finite operator entitlement is required. Use the requesting person's existing credit pool in their personal workspace. A team creates no allowance. Native reasoning uses that user's subscription; preparation/API ASR remain service costs. Never pool the founder's subscription or silently change funding.

An explicit total-job allowance also bounds an initial rollout without repeatedly asking about individual attempts. It is separate from daily/hourly limits and provider key spend caps. Preserve previous consumed/unknown jobs when extending it.

The first production quote exposed an older workspace compatibility gap. A reviewed original sole-owner workspace may use its existing wallet only when its exact ID is configured as legacyOwnerFundingOrganizationId. The existing eligibility check still requires the creator to be the sole member with no active invitations. A second workspace is refused. The finite operator catalog entitlement can recognize that same eligible creator without adopting the workspace or fabricating Pro billing. Normal paid-account checks remain unchanged.

Contributor processing permission is explicit and separate from source reuse authority. A flag does not establish provider rights. Keep the original OAuth connection, grant, native settings and monitor. Embedded UI and local execution remain deferred.

## Quotes and settlement

Tariff `prepared-service-credits-v1` uses the existing service-credit denomination. It changes no purchased balance, Stripe price or monthly grant. The planned Pro migration remains separate.

- Fresh preparation costs one credit; compatible retained preparation costs zero.
- Muse analysis costs `ceil(actualDurationMs / 60000)` credits. This is a disclosed started-minute tariff, not rounding intermediate provider money.
- Native subscription reasoning costs zero analysis credits. Fresh preparation still costs one service credit.
- A ready compatible result costs zero and starts no task. Explicit reanalysis creates a new version while preserving the incumbent.

Before download, unknown duration uses the configured maximum as an upper quote. Known oversized metadata stops before download. Missing extractor duration is permitted; actual decoded duration is mandatory before PCM, frames, ASR and inference. Settlement uses actual decoded duration and cannot exceed the accepted cap. The API ceiling covers ASR and inference; deduct the precise ASR ceiling before inference. Refuse a configuration that cannot cover both.

The quote hash binds source generation/selection, identity, executor, model/effort, evidence reuse, configuration, native grant and maximum credits. A stable operation key admits once. Replays return that row; stale quotes start no work. Known returned failures release unused analysis credits, while retained preparation may be charged. Never-dispatched expiry releases its reservation. Unknown work retains its hold and blocks duplicates. Preserve older comparison attempts.

V1 examines twenty source preparation records and refuses a twenty-first historical run rather than overlooking older unresolved work. This differs from the model-version history limit. An indexed active-run pointer is later work; do not substitute an unbounded scan.

## MCP, automatic Save and sharing

`quote_video_analysis`, `start_video_analysis` and `video_analysis_status` share contracts through actual MCP 2, the strict HTTP relay and authenticated Convex functions. The app product endpoint exposes the same functions. Credit callers first save with `analyze=false`, then obtain acceptance of the returned cap.

Cached clients can also call the existing `request_analysis(mode=credits)` to read a fixed Muse quote, then repeat with its generation and accepted maxCredits. Its deterministic source-generation key reuses the same run after a lost response. `get_job_status` returns preparation stage and reserved/settled credits. The retry correction admits explicit current-generation/revision retries of confirmed settled failures under a new stable key. Active or unknown work cannot retry. Other new versions use the new quote/start contract.

Configured automatic native accounts admit preparation directly from app or ordinary MCP Save. Suppress the obsolete saved-link wake while retaining capture rate limits. Emit the existing evidence-ready event after retention. Generation zero is valid for a first retained-evidence analysis.

The native action accepts the exact current prepared attempt for initial analysis or explicit reanalysis. Claim once, read the transcript and every actual JPEG, renew, complete that attempt and read back the saved version. Requested/host-reported settings are distinct from independent provider attestation.

Project prepared evidence through the existing neutral projection. Preserve `managed_api_reported` versus `authenticated_host_reported` provenance. New authority records separate analysis/preparation funding, processing review and recipe; old native authority stays unchanged. Equivalent fresh requests share one transactional producer. Every requester keeps their saved association; waiters reserve no credits and receive the published result through bounded fulfillment. Explicit new versions can run separately. A confirmed failed producer with settled credits can yield; claimed/unknown work cannot. Deletion, takedown, entitlement and current authority remain effective.

## Acceptance

Focused local cases cover real MCP/HTTP identity transport, tampering, idempotent start/complete, minute settlement, retained reuse, generation zero, app/MCP Save, truthful publication, two-account fulfillment and failed/unknown reservations. They do not establish live provider behavior.

Run full checks, exact CI and actual compatible deployment guards. Then verify a fresh credit-funded run through MCP, actual transcript/JPEGs, metadata/progress, wallet, canonical version and independent shared artifact. Verify a fresh automatic native run using the prepared action. Record measured phase times and remaining rollout/commerce limits. Private-ready alone does not satisfy sharing acceptance.

## Production acceptance

Backend e0ca232 passed exact CI40957292958 and actual compatible publication guards. The fresh original-MCP Muse route and two native routes completed, including ordinary default Save. All three published independent neutral shared results and settled exact credits. [The dated receipt](../operations/evidence/launch-20261029-server-service-production.json) records24 actual JPEG checks, native result replies/continued Monitoring, timing, costs and limits. [Current state](../operations/CURRENT-STATE.md) is authoritative for the finite remaining allowance and unfinished public/cross-account acceptance. No new website build, prompt paste or OAuth reconnection was needed for the correction.
