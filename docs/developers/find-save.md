Find a saved result first, or save the exact link you want to keep. A compatible ready result can be reused without another analysis charge.

## Find existing insights

1. Ask: "Search my VibeScroll library for deployment rollback ideas. Read only; do not start analysis."
2. Choose a returned workspace if more than one is available. Use `get_profile` for approved workspace IDs.
3. Use `search` with an exact name, a description or a question. Mention a confirmed project or pass its `projectId` to use its context. Put distinct requests in separate clauses. Filter by an observed creator name or handle, category, platform or known direct-save dates. To search multiple teams, pass up to three returned `workspaceIds`.
4. Use `review: true` when you need a complete pass through the current saved index. Follow `next_cursor`. To list one creator's saved posts, use an empty query with `filters.creator`. An empty intermediate page may still have a continuation.
5. Read selected results with `fetch`. Pass the returned `fetch_id` and the exact workspace, version and sharing grant. Check `status` and `facets` when the requested record or a supporting passage is missing.

Search uses saved evidence. Reading it starts no new analysis or app credit charge.

## Use a particular post as a reference

Ask: "Read this post's retained transcript, screenshots and insights, then help me create something in its style. Do not analyze it again."

The assistant uses `fetch(format="post_context_v1")` for that exact post/version and follows its `context.next_cursor` for remaining context items. The response separates insights, transcript segments and observations by their original IDs. Its frame manifest lists each sampled screenshot once. `read_post_frame` returns actual native JPEG content when the agent needs to inspect an image. Read frames one at a time. Several insight citations can refer to the same frame.

Team results carry their exact sharing-grant reference and version, which subsequent reads preserve. Each request checks current access. No job, worker lease, acknowledgment or new analysis credits are created by these reads. Unavailable evidence is reported rather than downloaded again. Retained context can contain sampled frames and a retained transcript; it does not promise the original full video or complete visual coverage.

## Save a supplied link

Ask: "Save this link to VibeScroll without analysis." The assistant uses `save_link` with `analyze=false`, an inferred factual title and one stable request key. Keep the returned source ID and post URL.

For ordinary analysis requests, the reviewed connection defaults determine the processing route. Save-only requests stay save-only.

### Links for automatic analysis

After you set up an eligible VibeScroll connection and automatic analysis in ChatGPT, use an individual public post link.

| Platform    | Links to send                                              |
| ----------- | ---------------------------------------------------------- |
| Instagram   | Reels and posts containing a video                         |
| TikTok      | Individual videos, including supported TikTok short links  |
| X (Twitter) | Individual posts with text, supported attachments, or both |

Post access, media format, and processing limits apply. The production checks covered Instagram Reels, TikTok videos, and X posts with text only or one video.

The older downloader accepts individual YouTube and Vimeo video links. Check the available processing options in web Save. GitHub and Reddit links save metadata for a separate review. For other sources, use a permitted upload or supplied text when offered.

Public X/Twitter status links use server preparation with gallery-dl and a bounded FxTwitter fallback. The full post text and every direct attachment are required. A selected-video or selected-photo suffix still imports the whole post. Text-only posts are valid. Attached images and sampled video frames have separate asset references; caption and image citations have no video timestamp. Outbound links and quoted posts are not attached media. X results stay private under the current catalog policy. Existing access, size, duration and funding limits apply; a missing attachment fails preparation. The anonymous preview funnel retains its separately supported sources.

## Continue from the receipt

- If a compatible result is ready, open or fetch it. Reuse avoids another analysis, although data delivery still uses infrastructure.
- If the post is saved but empty, choose [analysis](/docs/workflows/analyze) only when you want insights.
- If it is queued, waiting or running, keep the same source and use bounded status checks or the configured monitor.
- If the reply is unknown, preserve the request key and reconcile the same save. Do not create replacement analysis.
- If access or a version binding changed, read current state before continuing. A workspace choice needs a returned workspace ID, not a new connection.

Metadata can appear before insights. A title, thumbnail or saved receipt is not completed analysis. Use [vibescroll-save](/docs/mcp/skills#vibescroll-save) for the packaged workflow and [host support](/docs/mcp/host-support) for availability.
