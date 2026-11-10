Find a saved result first, or save the exact link you want to keep. A compatible ready result can be reused without another analysis charge.

## Find existing insights

1. Ask: "Search my VibeScroll library for deployment rollback ideas. Read only; do not start analysis."
2. Choose a returned workspace if more than one is available. Use `get_profile` for approved workspace IDs.
3. Use `search(mode="ranked_v1")` with a short query. Optional filters narrow category, platform and known direct-save dates. To search across teams explicitly, pass up to three returned `workspaceIds` and omit `profileId`. Each workspace needs current whole-workspace library access for ranked mode. A source/space-limited connection uses compatible search without `mode` and the ranked-only fields; it does not require broader permissions or another login. `projectId` adds explainable topic fit for the returned page. Prefer `next_cursor` for complete continuation, including matches beyond the first twenty. The older `next_offset` only moves between candidate-post pages. An empty filtered page does not establish whole-library absence.
4. Read selected results with `fetch`. Ranked post records provide a `fetch_id`; their `id` groups matches and is not a fetch locator. Keep the active profile and any exact sharing-grant/version references, citations and analysis version.

If a paraphrase misses useful candidates, the assistant can try up to two alternative short queries and merge canonical post/version references. This is bounded query expansion, not semantic vector search. Exact source references go directly to `fetch`.

The visible result is cited saved knowledge. Reading it starts no model generation on VibeScroll's servers. Your host can use its own allowance to explain the returned material.

## Use a particular post as a reference

Ask: "Read this post's retained transcript, screenshots and insights, then help me create something in its style. Do not analyze it again."

The assistant uses `fetch(format="post_context_v1")` for that exact post/version and follows its `context.next_cursor` for remaining context items. The response separates insights, transcript segments and observations by their original IDs. Its frame manifest lists each sampled screenshot once. `read_post_frame` returns actual native JPEG content when the agent needs to inspect an image. Read frames one at a time. Several insight citations can refer to the same frame.

Team results carry their exact sharing-grant reference and version, which subsequent reads preserve. Each request checks current access. No job, worker lease, acknowledgment or new analysis credits are created by these reads. Unavailable evidence is reported rather than downloaded again. Retained context can contain sampled frames and a retained transcript; it does not promise the original full video or complete visual coverage.

## Save a supplied link

Ask: "Save this link to VibeScroll without analysis." The assistant uses `save_link` with `analyze=false`, an inferred factual title and one stable request key. Keep the returned source ID and post URL.

For ordinary analysis requests, the reviewed connection defaults determine the supported automatic route. Save-only requests stay save-only. GitHub and Reddit links save metadata and use their own review path; they do not inherit video extraction authority. Other unsupported sources require an upload or supplied text in the website.

Public X/Twitter status links use server preparation with gallery-dl and a bounded FxTwitter fallback. The full post text and every direct attachment are required. A selected-video or selected-photo suffix still imports the whole post. Text-only posts are valid. Attached images and sampled video frames have separate asset references; caption and image citations have no video timestamp. Outbound links and quoted posts are not attached media. X results stay private under the current catalog policy. Existing access, size, duration and funding limits apply; a missing attachment fails preparation. The anonymous preview funnel retains its separately supported sources.

## Continue from the receipt

- If a compatible result is ready, open or fetch it. Reuse avoids another analysis, although data delivery still uses infrastructure.
- If the post is saved but empty, choose [analysis](/docs/workflows/analyze) only when you want insights.
- If it is queued, waiting or running, keep the same source and use bounded status checks or the configured monitor.
- If the reply is unknown, preserve the request key and reconcile the same save. Do not create replacement analysis.
- If access or a version binding changed, read current state before continuing. A workspace choice needs a returned workspace ID, not a new connection.

Metadata can appear before insights. A title, thumbnail or saved receipt is not completed analysis. Use [vibescroll-save](/docs/mcp/skills#vibescroll-save) for the packaged workflow and [host support](/docs/mcp/host-support) for availability.
