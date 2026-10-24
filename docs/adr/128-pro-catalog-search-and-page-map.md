# ADR 128: Pro catalog search and a checked-page category map

Status: accepted for local implementation; migration, backfill and live acceptance held. Date: October 24, 2026.

## Decision

Extend ADR 127 through the same artifact/import family. The unreleased catalog wire response advances to `service-catalog-v2`; immutable `service-import-v1` saved DTOs remain unchanged. New cards add only validated generic categories/topics and prepared public creator/date provenance. They never read source category overrides, private notes, project context, follows or contributor identity.

Search uses one optional deterministic text projection on existing service artifacts and one full-text index. The projection contains generic summary and insight titles, claims, interpretations, categories and topics, bounded to 8,192 UTF-8 bytes. Its digest binds version, artifact content hash and exact text. Search checks private ownership/current verified Pro before global reads and returns at most one five-candidate page. Every result must pass artifact currentness and exact recomputed projection validation. Do not add an all-table scan fallback, raw evidence search or extra analysis queue.

Commit/reuse can add a projection only when the whole artifact still fits its existing size bound. A missing projection must not invalidate an otherwise valid legacy artifact or its retained copies. Common removal scrubs all projection fields; recovery's existing whole-artifact deletion also removes them. Internal manual reindexing processes five existing service rows per call, pauses on recovery or unavailable configuration, returns honest continuation and starts no scheduler/retry loop. It remains unactivated. Search covers indexed eligible generic analysis; do not claim exhaustive coverage before an independently accepted backfill.

The interface submits search only on explicit action. Changing the phrase clears/fences prior cards, detail and continuation without fetching. A category filter applies only to the currently checked page. The optional static SVG map represents category membership for at most five currently displayed unexpired analyses and nine categories. A primary HTML list preserves full labels and keyboard access. It is not a platform trend, creator rating, popularity measure or private-follow graph. Map/filter changes issue no requests.

## Verification limitation

Installed `convex-test` 0.0.57 calls `split` on an absent optional search field and throws. The mixed legacy/indexed search fixture failed there. Preserve that failure rather than patching the dependency or claiming hosted acceptance. Indexed search/pagination and separate legacy browse/projection/backfill tests can still exercise their actual implemented paths.

Pinned official [search implementation](https://github.com/convex/convex-backend/blob/7b7b58ed4afa1f9d07fa0b67b871ef8771c868eb/crates/search/src/lib.rs#L338-L390) adds search text/terms only for a present string. Missing text produces no search terms, although IDs/filter metadata can remain indexed. This supports the expected absent-field behavior by source inspection; it does not attest the hosted binary or pass the mixed-record live case.

## Release boundary

The new index requires a fresh complete migration prediction and conservative whole-operation bound. Neither deployment nor backfill is funded or dispatched by this decision. Preserve the US$3 cumulative cap, existing reservations and provider/privacy gates. Actual browser, hosted search, real catalog content and independent usefulness remain distinct acceptance. Root retains the full R/P/N/C/M plan and integration ownership.
