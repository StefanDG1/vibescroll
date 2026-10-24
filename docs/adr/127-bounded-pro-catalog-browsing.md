# ADR 127: bounded Pro catalog browsing in Library

Status: accepted for implementation; provider and production acceptance remain gated. Date: October 24, 2026.

## Decision

Extend the existing service artifact preview/save and retained-copy lifecycle with an on-demand browse panel inside Library. Preserve five mobile destinations. Reuse `publicArtifacts`, `publicImports`, current artifact validation and existing source/save authority. Do not create another reusable-analysis store, queue or subscription-processing route.

Check authenticated private ownership and current verified Pro before reading global artifact records. Read one five-candidate page through the existing fixed service-expiry index range. Revalidate each artifact and expose only strict `service-catalog-v1` cards. Keep filtered continuation honest, including an empty page with more candidates. Missing operational configuration returns unavailable after authorization, without suggesting that the catalog is exhaustively empty.

Keep the catalog card DTO separate from immutable `service-import-v1` snapshots. Cards provide generic title/summary, safe original-post URL, platform/language, insight count and retention expiry. They exclude source-row identity, contributor identity, raw evidence, private taxonomy and personalized context. Preview uses the existing cited ordered-analysis renderer. Explicit save uses the existing Pro-gated operation, without inference or charges. Current Pro is required again for every page, detail and save; saved copies retain their separate cancellation/removal/retention rules.

The interface fetches only after an explicit action. It has no automatic pagination, polling or processing. Workspace/entitlement/unmount and request generations fence stale results; denial clears current catalog content. Expiry disables stale card actions. General Library use, own results, public approved demos and all-plan eligible contribution keep their existing rules.

## Limits and acceptance

This stage implements browse, inspect and save. Search, category/creator discovery and graph remain required later slices over this same artifact family. Full Cloud origin/contribution authority, provider permission and live catalog lifecycle remain separate acceptance. Existing operational release gates stay closed; local fixtures cannot seed a fake live catalog.

Use bounded synthetic tests for authorization before reads, pagination as time advances, malformed/expired/blocked/stale records, empty continuation, unavailable configuration, downgrade between operations, unchanged retained copies and UI response fencing. Root owns the integrated check, browser review, exact-head CI and conservative release bound. No new schema/index migration or hosted operation is authorized by this ADR.
