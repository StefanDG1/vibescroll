# ADR 143: private Work Cloud media observations

Status: reviewed media-v2 candidate; offline integrated checks passed, exact-head CI and real media acceptance pending. Date: October 24, 2026.

## Decision

Extend [ADR 129](129-gated-work-cloud-text-handoff.md) through the existing source job, explicit OAuth execution grant and same-job lease. `work-cloud-media-v2` accepts a permitted single-video URL from Instagram, TikTok, YouTube or Vimeo. It adds no automatic dispatch, new queue, catalog publication, paid API fallback or authority for a different task. `WORK_CLOUD_MEDIA_ENABLED` and `WORK_CLOUD_MEDIA_VERIFIED` remain off by default.

The authenticated client reports acquisition, speech segments and sampled frame observations. App validation binds those reports and citations to the approved source, generation, input, grant and lease. Authentication establishes who reported the observations; it does not independently verify the host, runtime, requested model, media bytes or provider execution. Reported task identifiers are correlation data, not an official task identity.

Coverage remains sampled and partial. Raw media stays in the provider task; app retention and deletion cannot attest provider cleanup, task history deletion or cancellation. The policy declares finite source, payload, execution and retention limits, including one source invocation, a 50 MiB source, ten minutes, 48 sampled frames, 200 speech segments and 120,000-byte payloads. Those declarations are not independent measurements of provider resource use. The app must not invent provider provenance or asset IDs for observations it does not store as assets.

Completion remains private and uses the existing citation and source commit boundaries. No catalog artifact, automatic retry, executor reassignment or paid fallback follows from an uncertain attempt. Provider-local raw data, reported observations and app-held evidence keep their distinct retention limits.

Media uses a three-minute lease capped by a fixed fifteen-minute deadline. Text keeps its forty-second lease. An authenticated late media mutation records unknown work and rejects output; it does not attest host cancellation. Caller-generated correlation UUIDs carry no provider identity or authority.

## Evidence and limits

Ninety-eight focused tests passed before independent review. Root fixed the native import and expiry-projection findings. The final High review found no remaining P1/P2. The integrated offline check passed at13:20:37UTC, with final27 UI checks, starter types and native light/dark320-pixel checks after display-only polish. Exact-head CI and actual Cloud media acceptance remain pending.

At 12:46 UTC, a native UI probe in the existing no-GitHub Work Cloud chat observed eight VibeScroll MCP tools, shell and `view_image`. It exposed no host-policy inspection tool or official task ID. The UI requested Sol Medium, while the host self-reported `gpt6-astra-wm`; that discrepancy is unresolved and neither value attests the executed model. The probe invoked no VibeScroll MCP service, media operation or production endpoint. An earlier thread-message attempt timed out with unknown outcome and remains recorded separately. No real Cloud media result or speed claim follows.

At 12:33:07 UTC, a real WorkOS session verified a separate canonical audio-only result with five insights and twenty citations. A separate local run produced seven insights from 48 sampled frames and remains private. These results do not verify this Cloud media candidate. No source content or private chat/task identifiers enter public evidence.

The existing live Apply flow groups all extracted insights by default and produces one proposal per repository evaluation. It does not resend the full transcript and image bytes for each project or automatically split one post/repository evaluation into several proposals. That gap remains open.

## Release and budget checkpoint

PR 155 merged as `af3ac7f` after CI 40093851347; main CI passed and its release was published. Compatible PR 156 merged as `2e840ec`, with source `e2e25b9` passing CI 40094423673. Neither merge deploys the repair; the full-main deployment hold remains.

Cleanup PR 157's first full CI, 40094884574, failed an old assertion expecting pending work under the restore lock. Root corrected it to expect deferred work and pushed `8f9b91b`; its CI is pending. Cleanup acceptance is separate from this media candidate.

The same US$3 cap retains US$2.8762037111015744 with US$0.1237962888984258 headroom. Completed whole-day Convex usage of US$0.07769574610772237 replaces only eligible worst-case holds; Vercel, older unknown and future holds remain. Source billing classification is a separate proof and is not established by this ADR. The [sanitized evidence](../operations/evidence/launch-20261024-work-cloud-media.json) and [F062 review](../foundational/idea-backlog.md#f062-private-work-cloud-media-observations-october-24) preserve the boundaries.

## Subsequent readiness and budget evidence

The original model discrepancy came from the Default model group. Explicit Sol selection matched the later session model report. The old resumed executor was unavailable. A fresh Cloud task selected no repository in the UI, executed a bounded shell check, and subsequently reported current enforced network policy and no Git initialization in its working directory. Configured repository count, permitted destinations, media execution and independent-user setup remain unverified. These are separate observations, not a completed video flow.

Fresh covered-credit evidence later reduced retained task exposure to US$2.2688707111015747, leaving US$0.7311292888984253 before the next secure-backend reservation. Older Convex unknown, future and residual holds remain. The original dependency-compatible metadata inspection passed but was not published after its old dependencies failed audit. The patched candidate passed its registry audit and is subject to the separate logical-schema proof in ADR144.
