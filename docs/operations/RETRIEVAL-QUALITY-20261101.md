# Retrieval quality investigation

Mode: explanation. November1,2026. This is source-free isolated evidence against source00e249c, not a production relevance benchmark or a semantic-search launch.

## Method and observed results

`tests/retrieval-quality.test.ts` calls the actual `workspaceSearch.search` handler through `convex-test`, with16 synthetic posts/17 insights in one requested workspace, the fixture's one unrelated retained post, and one separate-workspace post in the isolation case. Initial population uses the real bounded bootstrap. Network calls throw; no model, embedding, provider purchase or production data is used.

Each case declares its intended post set before execution. It checks observed post identities, duplicate match IDs, continuation, per-page bytes, candidate/hydration limits and exclusion of transcript bodies. Convex-test supplies a lexical search simulator. These tests do not establish production BM25 ordering, stemming, typo handling, latency or recall on real user questions.

| Query and route                              | Explicit intended posts                                                  | Observed posts / matches | Backend JSON bytes |
| -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ | ------------------ |
| `signup`, insights                           | signup-form                                                              | 1 /2                     | 1,890              |
| `Exponential backoff`, insights              | retry-jitter                                                             | 1 /1                     | 1,428              |
| `make registration effortless`, insights     | signup-form, activation-checklist                                        | 0 /0                     | 602                |
| `product_design`, insights                   | signup-form, activation-checklist, assistant-progress, accessible-drawer | 4 /5                     | 4,407              |
| `Jane Rivera`, posts                         | signup-form                                                              | 1 /1                     | 1,291              |
| `Canonical evidence storage`, posts          | canonical-storage                                                        | 1 /1                     | 1,318              |
| Exact source ID supplied as search text      | signup-form                                                              | 0 /0                     | 602                |
| `workflow`, insights, following continuation | all16 synthetic posts                                                    | 16 /17 across2 pages     | 15,446 total       |

An exact `fetch` of the saved source ID succeeds and returns its two insights; IDs belong on the exact-reference route. The two signup insights refer to one returned post record. The broad query visits17 candidates without duplicate match IDs; it reports16,473 instrumented serialized document-get bytes across its two pages. Searching `treasury` in the active workspace does not return the other workspace's indexed Treasury post, and an exact fetch through the wrong workspace is denied.

Scripted expansion of the missed registration question into `signup` and `onboarding` retrieves both intended posts in two searches, returning3,329 backend JSON bytes total. This demonstrates a useful candidate strategy on that declared question. It does not prove a host will choose those terms or that expansion solves arbitrary paraphrases.

All3 tests pass. The optional `WRITE_RETRIEVAL_QUALITY_RECEIPT=1` run writes the synthetic measurements to ignored `outputs/retrieval-quality-20261101.json`. Response JSON bytes exclude the MCP envelope and host context; `loaded_bytes` excludes some indexed-query/authorization reads and is not billed database bandwidth. No percentage quality score or production p95 is inferred.

## Decision and next acceptance

Keep exact references on `fetch`, and use lexical metadata/category filters for narrow discovery. When wording produces no useful candidates, let the already-active ChatGPT/Codex assistant interpret the question and try at most two or three short alternative queries through the existing MCP search. Merge canonical post/version identities, preserve current workspace/filter boundaries and apply one overall retrieval budget. Ask for clarification rather than automatically searching every workspace or the global catalog. These are bounded host instructions, not another VibeScroll API inference job. The host's plan limits still apply, and additional search calls still consume database resources.

The fixture justifies investigating query expansion before activating embeddings or another search provider. It also records a real limitation: lexical matching alone cannot bridge all meaning-equivalent wording. Expansion is not vector search, and exact/category filters cannot guarantee semantic recall.

Before any embedding rollout, collect a small owner-reviewed set of real questions and permitted expected posts, compare lexical, bounded host expansion and a candidate hybrid route, and measure extra calls, index storage and query cost separately. Reuse embeddings by canonical content hash/model version; authorize candidates before disclosure and preserve the exact-reference/image route. Account for Convex's [full searched-index query-GB accounting](https://docs.convex.dev/search/vector-search#costs), even with workspace filters. No paid embedding, new provider or physical partition rollout is activated by this investigation.
