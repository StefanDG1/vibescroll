# Context-aware post and insight retrieval

Status: next-milestone recommendation under R138, November 1, 2026. The owner asks how retrieval works, how it could improve and when to implement it while completing R137. This document records that design discussion; it does not activate a new search index, paid retrieval model or the eight deferred suggestions.

## Current behavior

MCP reads are scoped queries over current grants and requested-post associations, not access to the whole shared database. `search` matches words in permitted post titles and insight titles/claims. Each page examines at most five posts and 128 insights per post, returning at most twenty results. Its cursor resumes overflow before advancing and checks current source/version state. Missing or retired evidence keeps coverage incomplete.

Insight hits carry their post link and exact source/version/insight references. A title match can return post metadata/state instead. `fetch` expands a chosen result into the saved analysis and citation summaries; its structured representation avoids nested JSON text. Raw video, complete transcripts and JPEG bytes are not bundled into ordinary search. Profile discovery and exact project-application context are separate reads. The Library's categories and connections are not automatically sent as a full graph.

Canonical posts, immutable analysis versions and prepared evidence can be shared. Each user keeps their own requested-post association, private notes, selected version and project work. Base Pro cache reuse does not grant full-library browsing. Any future index must preserve those boundaries.

## Proposed retrieval shape

Keep post and insight records separate in storage. Offer a compatible opt-in representation that returns a bounded insight list plus one lightweight post record per referenced post, keyed by source ID. Avoid repeating creator/title/category metadata for every hit. Return exact version, source and insight IDs, current state and scope/coverage. Fetch full analysis, project context or evidence only when needed.

Thumbnails should use an authorized application/resource route. Do not copy arbitrary provider URLs or signed private asset capabilities into general model context. Showing a thumbnail in the app and giving a model actual image pixels are different operations. An evidence-on-demand route must have its own scoped contract; the current leased worker image tool is not a general library image reader.

Prefer a compatible extension of existing search rather than overlapping tools. Candidate fields are an optional target (`posts`, `insights` or `both`), bounded filters and a selected project reference. Preserve existing defaults. Bind new cursor state to the target, filters and authorized context as well as the query/version state.

## Route the question

| User question                         | Retrieval                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| “Find the Reel I saved yesterday”     | Post date, platform, creator and title metadata; inspect its insights after selection.                                                   |
| “What ideas do I have about retries?” | Insight relevance first, with compact post context and citations.                                                                        |
| “What could help this project?”       | Confirm one current project profile, retrieve relevant insight candidates, then explain topic fit and existing proposal/history signals. |
| “Have we already used this idea?”     | Exact insight/version and same-project proposal/work references, with observed versus reported outcomes.                                 |

The active assistant can interpret intent; browsing does not need a second paid classifier. Start with text, categories and existing deterministic history/recency signals. Treat similarity as a recommendation, not proof of usefulness. Avoid inflating scores or treating an old project profile as inspected repository code.

## Implementation order after R137 acceptance

1. Record realistic owner questions and current expected hits. Measure result quality, duplicate post metadata, serialized bytes, actual database reads and latency. Keep host tokens/provider spend separate.
2. Add a domain-owned compact post/insight projection and optional target/filters with current authorization. Reuse exact IDs and compatible clients; keep details/evidence lazy.
3. Add context-aware routing and explainable deterministic ranking using confirmed project context and permitted existing proposal history. No model call merely to browse.
4. If the measured library workload needs it, prepare an authorized full-text projection/index and bounded migration. Consider semantic retrieval only if text/category retrieval misses useful questions. Review its indexing cost, data boundary, invalidation and migration separately.
5. Verify post-versus-insight queries, many hits from one post, retired neighbors, repeated pages, changed selection, revocation, cross-user cache reuse, project isolation and stale context. Compare quality and p50/p95/bytes against the baseline before promotion.

Ship this as the next focused retrieval milestone after the current core release is stable. The timing of indexing or semantic search depends on that evidence; it is not necessary to delay the current reliability fix. Broader graph exploration, community rankings and changes-since discovery remain in their existing separate backlogs.
