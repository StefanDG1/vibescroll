The shared database saves repeated preparation and model generation. It does not make every MCP request free of database or network work. Dated acceptance includes individual function read/return-byte samples. Those samples are not a complete per-MCP-request invoice or a latency percentile.

## What happens on each call

The HTTP tool path performs an authenticated throttle mutation and an AuthKit user-info request before dispatch. `get_profile`, `save_link`, `search` and widget profile discovery can also ensure current defaults. The actual operation then runs its queries, mutations or actions. Responses are private and use `no-store`.

`knowledgeReadContext` memoizes duplicate document/helper reads within one immutable query snapshot. It is not a cross-request MCP cache. Convex also manages its own query caching/invalidation, whose effectiveness must be measured for the actual request and changing authorization state.

## Keep cost dimensions separate

| Dimension              | What contributes                                                   | How to verify                                                  |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Database work          | Documents/index entries read or written, access checks, validation | Actual Convex function/database metrics                        |
| Function/action work   | HTTP handler, queries/mutations, scheduling and external requests  | Function logs/metrics with safe correlation IDs                |
| Response transfer      | Serialized result, protocol envelope, duplicated representations   | UTF-8 byte count at the transport boundary                     |
| Image/storage transfer | Explicit JPEG fetch and retained asset delivery                    | Actual object-storage bytes and image count                    |
| Model context          | Tool descriptions, returned text/images and subsequent reasoning   | Host/provider usage when available; host accounting can differ |
| New analysis           | Download/FFmpeg/transcription/model job and retention              | Preparation and model receipts, credit settlement              |

Sending fewer JSON fields can reduce response/context size while still reading the same full stored document. A 10 KB response therefore does not establish 10 KB of database bandwidth. [Convex's read documentation](https://docs.convex.dev/database/reading-data) and [resource limits](https://docs.convex.dev/production/state/limits) describe why bounded indexed reads matter; this page does not substitute a guessed per-call price for real metrics.

## Current trade-offs

- `get_profile(detail="summary")` returns project identifiers and version metadata without profile bodies or evaluations. Omit `detail` for the compatible full response. Fetch the selected project's actual context only when needed.
- Search combines native Convex text and vector candidates and loads exact versions for selected results.
- Ordinary results contain the same JSON in both text and structured content. `fetch(format="structured_v1")` supplies an `analysis` object and short readable text; the default legacy response keeps serialized analysis in `text`. Do not assume a host deduplicates text and structured data for token accounting.
- `list_project_proposals(detail="summary")` omits plan bodies and handoff snapshots. It preserves current project/source authorization and context checks. Full detail remains the default for older clients.
- An ordinary `read_post_frame` includes authority checks before and after a bounded storage GET with byte/hash/dimension verification, without a mutation. The worker-specific retained JPEG tool additionally acknowledges the read for completion eligibility. Neither path is just a string lookup.

## Workspace search and complete post references

The active workspace determines the searchable collection. Personal requested posts and team-shared posts reference shared canonical versions and evidence. Team members share their workspace's search entries; joining a team does not import personal posts. Current membership, assistant grant and any exact sharing grant remain authoritative.

`search` combines compact lexical and semantic candidates. It returns each post and version once, with matching retained passages. Exact names get priority. Confirmed project context breaks close ties. Separate retrieval for compound requests can return a passage for each part. If the model or vector index is unavailable, the same search uses its lexical results and reports the missing semantic channel.

Ranked discovery bounds candidate and source reads per request. Use `review: true` to page through the current authorized index without a cumulative candidate ceiling. The cursor binds the request, grant, workspace index and project context. Complete reviews can report gaps when retained evidence is unavailable or exceeds a projection bound. Inspect the response's coverage and follow `next_cursor`.

Use up to three explicitly authorized workspaces. Search checks every requested workspace before retrieving candidates. Source-limited access reads only granted source projections. Space-limited access uses the filed space and rechecks current source access. A date filter omits shares whose workspace-added date is unknown.
Use `fetch(format="post_context_v1")` only when a specific post needs full context. Its pages contain retained transcript segments, observations and insights, plus one screenshot manifest. Original citation IDs resolve through these collections. Actual screenshots are individually demand-loaded, so a search does not attach all images or transcripts. These reads reuse retained data; they do not repeat preparation or analysis. Host text/vision usage and storage delivery still apply.

Workspace filters restrict disclosure, but Convex meters the full searched index size for full-text and vector search even when filters return few results. [Vector-search costs](https://docs.convex.dev/search/vector-search#costs), [full-text costs](https://docs.convex.dev/search/text-search#costs). Measure search cost against actual index size and request volume.

## Shared cache structure

Keep immutable neutral analysis and evidence under exact canonical post/version references. Keep each person's requested-post association, selected version and private notes separately. Keep project plans and discussions workspace-scoped. A ready-cache hit can reuse the shared result with zero new analysis credits while still paying the smaller access/read/transfer costs.

Permission changes must take effect on later reads. Do not put authenticated MCP results or private project context in a public CDN cache to improve hit rates. Use small metadata views and exact authorized detail reads instead.

## Measurement and compatibility

The optional `MCP_MEASUREMENT_SAMPLE_RATE` setting accepts a sample rate from 0 to 1 and defaults to 0. Its scalar observations contain operation, boundary, elapsed time, serialized response bytes, decoded image bytes and outcome. They contain no arguments, source text, tokens, account IDs or new database writes. Backend forwarding and tool-presentation spans overlap; do not add their durations. Tool-presentation bytes precede SDK framing and metadata.

Synthetic authorized fixtures produced these UTF-8 measurements. These are not production billing or host-token estimates.

| Fixture          | Backend response bytes | Application MCP result bytes | Instrumented db.get / query calls |
| ---------------- | ---------------------: | ---------------------------: | --------------------------------: |
| Profile full     |                   6248 |                        12737 |                              2 /6 |
| Profile summary  |                    831 |                         1897 |                              2 /5 |
| Fetch legacy     |                   1519 |                         3435 |                              4 /3 |
| Fetch structured |                   1505 |                         3317 |                              4 /3 |

The summary removes one evaluation query. Query-local memoization also avoids duplicate document reads during discovery and proposal listing without carrying access across requests. These operations can still read the same whole repository document, so smaller JSON does not prove less database bandwidth. The structured fetch primarily improves field access; this fixture shows only a small byte reduction. Keep text-only compatibility until actual host acceptance justifies further changes.

Search reports `scanned_posts`, `matched_items`, `has_more`, `exhausted` and `truncated`. Prefer `next_cursor` for both library and older source grants: it resumes overflow within the same candidate page before moving to later posts. It binds the query, current access and source/version fingerprint; changed evidence requires a fresh search. `next_offset` remains compatible legacy post-page navigation and cannot recover within-page overflow by itself. The 128-idea scan cap remains explicit. These fields describe the legacy bounded scan. Ranked mode uses separate compact full-text candidate accounting; neither route promises exhaustive semantic recall.

Use meaningful Events and bounded reconciliation rather than rapid polling. Live AuthKit, membership, grant and source checks remain in place. Authorization metadata is not cached across callers to claim faster access.

## Dated production samples

On November 1, one actual ChatGPT retrieval used these Convex function samples. They exclude the outer HTTP authentication/throttle/default queries and other child actions, so do not sum them as a full request invoice or use them as latency percentiles.

| Function                                | Database read bytes / documents | Return bytes | Execution seconds |
| --------------------------------------- | ------------------------------: | -----------: | ----------------: |
| Complete retained post query            |                      28,068 /22 |       12,459 |            0.1445 |
| Ranked search query, 8 returned matches |                     183,813 /90 |        9,382 |            0.2864 |

Both queries report zero database writes. The existing screenshot action verifies actual bytes and returns a native image. All 8 manifest frames rendered across the initial and sequential diagnostic tests; 3 initial host -32603 failures had no corresponding backend image action in the captured window. The documented image workflow reads one frame at a time. This is an observed acceptance result, not a guaranteed latency or a diagnosis of those host failures.
