Get insights from a saved supported video while keeping its actual route, progress and credit state visible.

## Reuse or quote before starting

1. Read the exact source with `get_job_status` or `video_analysis_status`.
2. If compatible insights are ready, reuse them. Cache reuse starts no new analysis and remains zero-credit for that analysis.
3. If work is active or unknown, keep its run and version references. Do not start another job.
4. For a new prepared request, call `quote_video_analysis`. Review its route, maximum credits, model and evidence reuse before accepting it.
5. Start an accepted quote with `start_video_analysis`, keeping its exact quote hash, maximum, settings and one stable key.

The ordinary configured native flow can return a `request_analysis` next action. Follow that returned action with its exact source and profile. Do not replace it with a different executor or funding mode.

## Use the chosen funding route

Hosted API analysis uses the quoted VibeScroll credits and finite provider funding. A ChatGPT subscription does not fund a server API call merely because the request came from ChatGPT.

The prepared `work_cloud` route uses server preparation and a configured native task for analysis. Preparation may cost credits; the native reasoning uses that user's host allowance. The task reads retained evidence and actual JPEGs. An arbitrary active chat is not automatically that authorized task. Local execution remains deferred.

## Follow observed progress

Use `video_analysis_status` for preparation, analysis, validation and saved-result state. Open the returned post link to resume the same work on the website. A quote maximum or credit hold is not a final charge. A missing final amount is not proof of zero usage.

If the result is waiting or queued, use the configured Events task or a bounded follow-up. No progress percentage or completion time is guaranteed. If the monitor is absent or paused, fix that route's setup without treating it as an OAuth failure.

For a confirmed failure, use only the returned eligible recovery action. A stale quote requires a fresh quote. Cancelled unclaimed work and unknown dispatched work have different remedies. Unknown work retains its exposure until reconciled; it must not trigger an automatic paid fallback.

Once ready, read the saved version or [apply all its insights to a project](/docs/workflows/proposals). To request a deliberate second analysis, use [the version workflow](/docs/workflows/reanalyze).

## Check credits and admission

Use `get_processing_account` to read your own available credits, current reservations, expired held credits, next expiry and current processing admission. It requires your existing analysis permission. It exposes no invoices, transaction history or another member's wallet. Library-only connections can keep reading knowledge without this permission.

Credits and processing capacity are separate. An hourly/daily limit reports its retry time; provider capacity reports its own refusal. A confirmed `processing_blocked` Save receipt means the link was saved but analysis did not start. Keep that source ID, show the reason and remaining credits, and retry only after the relevant condition is resolved. A failed or uncertain forwarding request is not the same as a confirmed refusal.

The embedded card observes the same saved source. While visible it checks active work at bounded intervals, pauses after its observation window and offers Refresh. Closing a card does not cancel the job. Metadata and stages are displayed only after the backend returns them; an animation is not a completion percentage. The website remains the destination for advanced settings.
