# Context-aware post and insight retrieval

Status: next-milestone recommendation under R138/R139, November 1, 2026. The owner asks how retrieval works, how it could improve and when to implement it while completing R137. R139 adds explicit whole-post reference retrieval and shared screenshot/citation identity. This document records that design discussion; it does not activate a new search index, paid retrieval model or the eight deferred suggestions.

## Current behavior

MCP reads are scoped queries over current grants and requested-post associations, not access to the whole shared database. `search` matches words in permitted post titles and insight titles/claims. Each page examines at most five posts and 128 insights per post, returning at most twenty results. Its cursor resumes overflow before advancing and checks current source/version state. Missing or retired evidence keeps coverage incomplete.

Insight hits carry their post link and exact source/version/insight references. A title match can return post metadata/state instead. `fetch` expands a chosen result into the saved analysis and citation summaries; its structured representation avoids nested JSON text. Raw video, complete transcripts and JPEG bytes are not bundled into ordinary search. Profile discovery and exact project-application context are separate reads. The Library's categories and connections are not automatically sent as a full graph.

Canonical posts, immutable analysis versions and prepared evidence can be shared. Each user keeps their own requested-post association, private notes, selected version and project work. Base Pro cache reuse does not grant full-library browsing. Any future index must preserve those boundaries.

## Proposed retrieval shape

Keep post and insight records separate in storage. Offer a compatible opt-in representation that returns a bounded insight list plus one lightweight post record per referenced post, keyed by source ID. Avoid repeating creator/title/category metadata for every hit. Return exact version, source and insight IDs, current state and scope/coverage. Fetch full analysis, project context or evidence only when needed.

Thumbnails should use an authorized application/resource route. Do not copy arbitrary provider URLs or signed private asset capabilities into general model context. Showing a thumbnail in the app and giving a model actual image pixels are different operations. An evidence-on-demand route must have its own scoped contract; the current leased worker image tool is not a general library image reader.

Prefer a compatible extension of existing search rather than overlapping tools. Candidate fields are an optional target (`posts`, `insights` or `both`), bounded filters and a selected project reference. Preserve existing defaults. Bind new cursor state to the target, filters and authorized context as well as the query/version state.

## Route the question

| User question                                | Retrieval                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| “Find the Reel I saved yesterday”            | Post date, platform, creator and title metadata; inspect its insights after selection.                                                   |
| “What ideas do I have about retries?”        | Insight relevance first, with compact post context and citations.                                                                        |
| “What could help this project?”              | Confirm one current project profile, retrieve relevant insight candidates, then explain topic fit and existing proposal/history signals. |
| “Have we already used this idea?”            | Exact insight/version and same-project proposal/work references, with observed versus reported outcomes.                                 |
| “Create something in the style of this post” | Exact retained post/version context, including transcript, screenshots and insights, with each frame delivered once.                     |

The active assistant can interpret intent; browsing does not need a second paid classifier. Start with text, categories and existing deterministic history/recency signals. Treat similarity as a recommendation, not proof of usefulness. Avoid inflating scores or treating an old project profile as inspected repository code.

## Expand an explicit post reference

The owner wants an agent to retrieve the whole retained context when referring to one post explicitly. Return metadata, the complete retained transcript, sampled frames, insights and the selected immutable version. Include coverage, timestamps and content hashes so the agent can distinguish retained evidence from an original full video. Missing evidence must be explicit.

Deliver frame pixels once in a frame collection keyed by stable asset identity. Insight citations point to those frame IDs and timestamps instead of embedding the same JPEG again. Transcript segments use the same principle. A single response can deduplicate images reliably. Across separate calls, an optional known-frame hint can avoid unnecessary transfer, but it does not prove the host still retains or inspected those pixels. The agent must be able to request them again.

Use an ordinary authorized read contract with bounded parts and continuation. Do not create or claim an analysis job merely to borrow its leased worker-frame tool. An exact source/version reference resolves directly; it does not need semantic search. Share prepared bytes across model analyses without copying them into every insight record. Retained JPEGs currently use private EU R2 storage, so asset delivery and Convex document bandwidth are different costs.

## Semantic search and cost

Semantic search compares numerical representations, called embeddings, to find related meaning. A query for clearer onboarding can retrieve an insight about reducing signup friction even without matching those exact words. Combine it with exact title/creator/link lookup and full-text matching so precise references remain dependable.

Compute an embedding once per canonical content hash and embedding-model version, then reuse it for authorized users. Keep personal notes and project context separate from shared neutral content. Every candidate still needs current authorization and source/version checks. The default search remains the user's requested posts; full-catalog discovery retains its separate entitlement.

Convex supports indexed full-text search and vector search. Vector search runs in an action, followed by transactional hydration and current authorization. Its search and the hydration do not share one database snapshot. Do not take a small global nearest-neighbor set, discard unauthorized rows and then claim the library contains no matches. Compare permission-aware candidate selection with lightweight per-user projections, including the latter's storage duplication.

Costs include embedding generation, index storage and search usage, plus returned document/asset bytes and the receiving model's context. Convex meters both full-text and vector queries against the full searched index size even when filters or small result limits are used. For example, a 1 GB index queried 10,000 times represents about 10,000 query GB before the applicable allowance. Actual pricing depends on the account and region; the default US pricing page is not proof of this application's EU bill. Sources: [vector search and costs](https://docs.convex.dev/search/vector-search#costs), [full-text costs](https://docs.convex.dev/search/text-search#costs), [pricing](https://www.convex.dev/pricing).

Whole-post expansion does not require another download, transcription or analysis when retained evidence is valid. It transfers more data and may consume more of the host's text/vision context. Search should therefore stay small until the user explicitly requests that context. Never attach every transcript and image to every search result.

## Implementation order after R137 acceptance

1. Record realistic owner questions and current expected hits. Measure result quality, duplicate post metadata, serialized bytes, actual database reads and latency. Keep host tokens/provider spend separate.
2. Add explicit retained-post expansion, frame/segment identity deduplication and bounded delivery. Verify actual native image input without worker leases or a new analysis.
3. Add a domain-owned compact post/insight projection and optional target/filters with current authorization. Reuse exact IDs and compatible clients; keep details/evidence lazy.
4. Add context-aware routing and explainable deterministic ranking using confirmed project context and permitted existing proposal history. No model call merely to browse.
5. If the measured library workload needs it, prepare an authorized full-text projection/index and bounded migration. Consider semantic retrieval only if text/category retrieval misses useful questions. Review its indexing cost, data boundary, invalidation and migration separately.
6. Verify explicit references, image deduplication, post-versus-insight queries, many hits from one post, retired neighbors, repeated pages, changed selection, revocation, cross-user cache reuse, project isolation and stale context. Compare quality and p50/p95/bytes against the baseline before promotion.

Ship this as the next focused retrieval milestone after the current core release is stable. The timing of indexing or semantic search depends on that evidence; it is not necessary to delay the current reliability fix. Broader graph exploration, community rankings and changes-since discovery remain in their existing separate backlogs.
