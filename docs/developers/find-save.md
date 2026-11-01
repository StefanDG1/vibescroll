Find a saved result first, or save the exact link you want to keep. A compatible ready result can be reused without another analysis charge.

## Find existing insights

1. Ask: "Search my VibeScroll library for deployment rollback ideas. Read only; do not start analysis."
2. Choose a returned workspace if more than one is available. Use `get_profile` for approved workspace IDs.
3. Use `search` with a short query. Prefer `next_cursor` for complete continuation, including matches beyond the first twenty. The older `next_offset` only moves between candidate-post pages. An empty filtered page does not establish whole-library absence.
4. Read selected result IDs with `fetch`. Keep the returned citations and version references.

The visible result is cited saved knowledge. Reading it starts no model generation on VibeScroll's servers. Your host can use its own allowance to explain the returned material.

## Save a supplied link

Ask: "Save this link to VibeScroll without analysis." The assistant uses `save_link` with `analyze=false`, an inferred factual title and one stable request key. Keep the returned source ID and post URL.

For ordinary analysis requests, the reviewed connection defaults determine the supported automatic route. Save-only requests stay save-only. GitHub and Reddit links save metadata and use their own review path; they do not inherit video extraction authority. Other unsupported sources require an upload or supplied text in the website.

## Continue from the receipt

- If a compatible result is ready, open or fetch it. Reuse avoids another analysis, although data delivery still uses infrastructure.
- If the post is saved but empty, choose [analysis](/docs/workflows/analyze) only when you want insights.
- If it is queued, waiting or running, keep the same source and use bounded status checks or the configured monitor.
- If the reply is unknown, preserve the request key and reconcile the same save. Do not create replacement analysis.
- If access or a version binding changed, read current state before continuing. A workspace choice needs a returned workspace ID, not a new connection.

Metadata can appear before insights. A title, thumbnail or saved receipt is not completed analysis. Use [vibescroll-save](/docs/mcp/skills#vibescroll-save) for the packaged workflow and [host support](/docs/mcp/host-support) for availability.
