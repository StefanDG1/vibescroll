Compare another analysis without losing a valid saved result. A newer model name or higher reasoning setting does not establish better quality.

## Read the existing versions

1. Call `analysis_history` for the exact source.
2. Read a chosen version with `analysis_version`.
3. Compare two retained versions with `compare_analysis_versions`.

These reads generate no analysis. Keep immutable version IDs separate from the currently selected version and its selection revision. Explain differences using the evidence, rather than automatically promoting the newest result.

## Request a deliberate new version

For the prepared route, review `quote_video_analysis` with `reanalyze=true` and start only the exact accepted quote. Reusable retained evidence can avoid another download or transcription. The quote states what is actually reused and funded.

For a supported native retained-evidence request, use `request_analysis_version` with the current selection revision and a stable key. Keep its attempt ID throughout the worker lease. The worker must inspect actual retained JPEGs before completion. This route grants no new downloader, ASR or paid API authority.

The incumbent remains available while the candidate is waiting or running. If the start reply is unknown, reconcile the existing attempt. A confirmed failure does not erase the good version or justify switching funding.

## Select or cancel explicitly

Use `select_analysis_version` only when the user chooses that retained version, including a rollback. Pass the current selection revision. Selection starts no analysis and spends no credits.

If the selection revision is stale, read history and reconcile the choice. To cancel an explicitly selected, still-unclaimed native attempt, use `cancel_waiting_analysis_version`. It cannot reset a running or unknown task. Preserve its result and funding records until the actual state is known.

Ready-cache reuse remains distinct from reanalysis. Choosing a new requested model does not relabel a cached output's original provenance. Continue with [project context](/docs/workflows/proposals) using the exact version you intend.
