# Workspace search and retained post context

Date: November1,2026. Status: implementation candidate under R141; production acceptance requires a dated receipt.

## Decision

Extend `fetch` with opt-in `post_context_v1`, preserving legacy and structured summaries. Complete retained context is a bounded sequence of immutable-version insights, transcript segments and observations plus one screenshot manifest. Evidence keeps its original observation/segment/frame IDs. `read_post_frame` is an ordinary authorized read returning actual verified JPEG bytes. It does not borrow a worker lease, record an execution acknowledgment, freeze a baseline or create work. It rechecks current access after storage I/O.

Add opt-in `search(mode="ranked_v1")` over compact workspace-owned search documents and origin references. Each team shares one projection for each canonical post/version; member count does not copy media or analysis. Multiple direct/share paths remain independent, and exact team-shared versions stay pinned. Current membership, assistant scope, sharing authority and retained source/version state are revalidated before disclosure. An opaque grouping ID is separate from the returned `fetch_id`.

Use three new initially empty tables: origins, compact search documents and index state. New workspaces initialize without user setup. Existing workspace population is an explicitly bounded operation after compatible publication, not a populated schema backfill or a read-triggered global scan. Source/share changes refresh targeted projections; canonical recommendation changes refresh associated direct origins in bounded pages while shared pins remain fixed. Search exposes possible index lag and does not claim library-wide absence from an empty current index.

Limit indexed candidates, full-source hydration, serialized loaded bytes, results and response bytes separately. Authenticate continuation with a dedicated purpose-bound HMAC key; never reuse OAuth secrets. The cumulative candidate budget is distinct from request throttling and does not prohibit a new query. Keep source details and images lazy. Missing evidence cannot grant access or trigger reacquisition.

## Alternatives

Existing topic/member indexes do not include general insight claims or unique selected-version identity. Extending them alone would duplicate results by topic and miss relevant posts. A separate retrieval service adds authorization synchronization and another provider before a measured scale requirement. Native Convex full-text search is the smaller initial implementation; workspace equality filters provide logical isolation but do not make query-GB billing workspace-local.

Semantic vectors, another search provider, automatic all-workspace traversal and private project embedding are not enabled by this checkpoint. The [execution ledger](../strategy/CONTEXT-RETRIEVAL-IMPLEMENTATION.md) retains the remaining measured ranking/cross-workspace/semantic decisions.

## Verification

Check complete UTF-8 pagination, native frame bytes/integrity and zero mutations; private/server-prepared/service-owned evidence and exact shared pins; disjoint personal workspaces and multiple team members; competing origins, revocation and canonical upgrades; response overflow, cursor tampering, hydration bounds and index lag. Publication must prove only empty-table/index admission and unchanged historical schemas/components/auth/crons. Actual host discovery and production reads remain separate from isolated tests.
