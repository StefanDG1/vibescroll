# Private ordered intake and current-account preflight

Date: October 23, 2026. Status: authorized implementation under ADR 119; provider and production acceptance remain gated.

## Decision

Extend the existing private source, upload, personal-analysis job, preparation workflow and official-client controller. Supplied files use `provided-media-v1`, separate from a verified `social-post-v1`. A supplied reference is unverified attribution. It grants no creator identity, publication date, retrieval proof, provider collection permission or cross-customer reuse. The server creates submission and child identities; isolated decoding verifies the actual bytes and formats before they become evidence.

`captureOrdered` accepts one to 35 current completed workspace uploads in explicit order, with a cumulative 250 MB limit and rights attestation. It binds every original asset atomically to the existing source/generation. The optional URL and caption remain private source data. Saving starts neither preparation nor inference. Retries of the same exact capture key return the same source; changed input needs a new save. A supplied URL cannot deduplicate against a verified creator post. Existing source allowances, upload storage accounting, deletion outbox, export and recovery remain authoritative.

Legacy capture cannot rebind an ordered child or another source's original. Valid legacy object deduplication returns its existing source without changing ownership. Recovery clears the prepared/input state and raw ordered object reference, revokes provider submission rights and advances generation. It cannot expose the first child as a legacy video after restoration. Content exports retain supplied provenance and order without raw object keys.

An ordered own-subscription approval uses the existing personal source queue. Its first claim checks the current user's actual official-client catalogue, selected image-capable model, advertised effort, reported allowance and required local ASR files before acknowledging preparation. An explicit source approval bounds preparation to ten compute credits. Preflight, preparation and inference share one source generation, with distinct claim authority for the executable phases. A preflight callback cannot clear or complete a later claim. Unknown compute or model dispatch remains held and cannot become an automatic retry or paid fallback.

The isolated decoder prepares bounded JPEG images, sampled video frames and normalized audio. The paired user's official client performs actual image observations; local ASR supplies timed transcript evidence. The existing ordered evidence and schema 3 result validators bind each result to actual child coordinates, raw hashes, decoder output, source/generation and current account. Images retain null times. Partial decoding keeps omitted original positions and warnings. These private outputs never enter service-funded reusable artifacts through the social-only validator.

Preparation retry reuse binds the actual broker-selected source to the server's current media snapshot authority. Successful trusted SDK creation and confirmed teardown establish creation provenance, not independent provider attestation. The SDK exposes no public getter that can prove the original snapshot afterward. Missing authority permits supported legacy preparation without a reusable stamp; changed authority invalidates the cache.

## Evidence and release limits

Local synthetic fixtures cover contracts, ownership, replay, restore, model/account preflight, actual decoder bytes and lease/result fencing. They do not establish provider entitlement, production behavior or independent use. Fresh private uploads, isolated preparation, storage and processing need their actual funded live acceptance before release. The original US$2 cumulative ceiling and all retained uncertainty holds remain. No supplier, commercial hosted-subscription, Reddit, public publication, signed distribution or recurring processing gate is opened by this decision.
