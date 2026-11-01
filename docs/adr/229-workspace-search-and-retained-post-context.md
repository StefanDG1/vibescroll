# Workspace search and retained post context

Date: November1,2026. Status: both checkpoints deployed under R141/R142. [Extended acceptance](../operations/evidence/launch-20261101-context-retrieval-extended.json) records actual filtered/project-context host continuation. [First acceptance](../operations/evidence/launch-20261101-context-retrieval.json) retains initial host-image failures and successful sequential diagnostics.

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

## Extended routing and one-time team defaults

R142 approves missing assistant grants for personal and currently joined teams without another setup form. Never overwrite existing per-client off/custom/expired grants. Bound discovery to indexed memberships plus explicit requested scopes, intersect current token/client/role authority and check each member's own Pro. This does not copy personal posts, turn on team execution or broaden another OAuth client's consent.

Extended search accepts up to three explicit workspace IDs, metadata filters and a currently permitted project profile. Topic fit reorders the emitted page only. To avoid Convex's one-pagination-per-function restriction, use bounded native-search prefixes with signed offsets/consumed-prefix fingerprints and fixed workspace quotas. Separate newly examined candidate counts from physically reloaded compact rows, and keep current-scope authorization, global hydration/bytes, response and session bounds. Reordered prefixes reject continuation. An incomplete search never silently falls back to the global catalog.
