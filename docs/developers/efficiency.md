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

- Selected-profile discovery returns up to five full project profiles. Listing small metadata first and fetching one selected project's context would reduce unnecessary context transfer.
- Search matches text in application code after examining five permitted posts. An authorized full-text projection/index could reduce repeated calls for larger libraries. Today callers must respect coverage and follow cursors.
- Ordinary results contain the same JSON in both text and structured content. `fetch` also serializes its analysis inside a nested `text` field. Do not assume a host deduplicates these for token accounting.
- Proposal listing validates authorized snapshots before returning metadata. A small authorization-preserving summary path could avoid detail work on a listing.
- A retained JPEG read includes two authorization queries, one read acknowledgment mutation and one storage GET, in addition to ordinary HTTP authentication. Those integrity/access checks are not just a plain string lookup.

## Shared cache structure

Keep immutable neutral analysis and evidence under exact canonical post/version references. Keep each person's requested-post association, selected version and private notes separately. Keep project plans and discussions workspace-scoped. A ready-cache hit can reuse the shared result with zero new analysis credits while still paying the smaller access/read/transfer costs.

Permission changes must take effect on later reads. Do not put authenticated MCP results or private project context in a public CDN cache to improve hit rates. Use small metadata views and exact authorized detail reads instead.

## Proposed improvements, not yet implemented

1. Measure sanitized per-operation duration and response/image bytes; compare them with actual Convex reads and function metrics. Never log tokens, transcripts or private project bodies.
2. Add metadata-first project discovery with a compatibility path for existing clients.
3. Introduce indexed, tenant-authorized knowledge search when measurements justify the change.
4. Test a versioned compact output format in ChatGPT and Codex before removing duplicate/nested JSON.
5. Use meaningful Events and bounded status reconciliation rather than rapid repeated polling.

These changes require acceptance tests against current grants, shared selections and old clients. They are recommendations from source inspection, not deployed savings or measured performance claims.
