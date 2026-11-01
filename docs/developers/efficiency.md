The shared database saves repeated preparation and model generation. It does not make every MCP request free of database or network work. Current acceptance records do not contain exact per-tool Convex billed-byte measurements.

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
- Search matches text in application code after examining five permitted posts. An authorized full-text projection/index could reduce repeated calls for larger libraries. Today callers must respect coverage and follow cursors.
- Ordinary results contain the same JSON in both text and structured content. `fetch(format="structured_v1")` supplies an `analysis` object and short readable text; the default legacy response keeps serialized analysis in `text`. Do not assume a host deduplicates text and structured data for token accounting.
- `list_project_proposals(detail="summary")` omits plan bodies and handoff snapshots. It preserves current project/source authorization and context checks. Full detail remains the default for older clients.
- A retained JPEG read includes two authorization queries, one read acknowledgment mutation and one storage GET, in addition to ordinary HTTP authentication. Those integrity/access checks are not just a plain string lookup.

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

Search reports `scanned_posts`, `matched_items`, `has_more`, `exhausted` and `truncated`. Prefer `next_cursor` for both library and older source grants: it resumes overflow within the same candidate page before moving to later posts. It binds the query, current access and source/version fingerprint; changed evidence requires a fresh search. `next_offset` remains compatible legacy post-page navigation and cannot recover within-page overflow by itself. The 128-idea scan cap remains explicit. This bounded scan is not an exhaustive full-text index. The reproduced omission was a continuation defect, not evidence that a populated search-index migration would improve latency; that migration requires a measured need.

Use meaningful Events and bounded reconciliation rather than rapid polling. Live AuthKit, membership, grant and source checks remain in place. Authorization metadata is not cached across callers to claim faster access.
