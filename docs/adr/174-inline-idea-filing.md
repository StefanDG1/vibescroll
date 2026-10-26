# ADR 174: file a cited idea inside the ChatGPT card

Date: 26 October 2026. Status: local candidate, disabled in production.

## Decision

Keep the compact ChatGPT result card as the primary interaction. Add a collapsed File this idea disclosure beside its evidence actions. An authorized person can move the selected idea to a loaded topic, remove its current topic filing, or restore a removed filing. The card keeps its claim and citations visible and has no application navigation. The same component is available in expanded source detail and Scroll.

The existing default-off `MCP_WIDGET_LIBRARY_EDITING_ENABLED` gate and new `knowledge:write` permission also cover these commands. Its consent label now explicitly includes idea filings. Neither that scope nor the topic editor has been enabled for an existing connection. Current read/write OAuth, configured client, whole-library app grant, writer membership and current evidence are all required. A topic filing never changes source access.

## Contracts and concurrency

Three app-only operations read current filings, apply one explicit change and retrieve its retained receipt. Every request binds workspace, grant version, source, generation, revision and insight ID. A move additionally binds the origin membership, expected exclusion state and both topic versions. The server reuses current source/evidence validation and refuses stale, deleted, expired or unavailable evidence.

Moving preserves the original membership as manually removed and creates or restores the exact destination membership as manual. Removal and restoration update that membership, not the source. Both topic versions and available counters update atomically with the command receipt. Reads page twelve memberships at a time. Counter updates refuse batches above256 source/topic memberships, and duplicate destination matches require protected-library review. No unbounded production scan is introduced.

The existing candidate receipt table gains an optional evidence receipt and a source index. This is still one new table relative to production, now with five indexes. Existing topic metadata receipt fields are preserved. Receipts contain IDs, versions, outcome and the request hash, without source text or edited names. The existing deleted-source cleanup removes source-bound receipts in bounded batches; account/workspace deletion and thirty-day expiry also apply.

Commands do not dispatch synthesis, media analysis, coding, sharing or publication. They do not alter saved analysis defaults, funding or source versions.

## UI recovery

The disclosure loads current filings and bounded destination topics only after opening. Removed filings are labelled and can be restored. Other destinations require deliberate loading. An idea with no current filing uses the protected library to establish its first topic; creating topics and merging/splitting remain separate work.

An unknown response retains the complete request and disables fresh changes. Check filing result retrieves the existing receipt; a missing receipt permits the same payload/key retry. Review current filings reloads current authority and versions before a new decision. Closing the disclosure preserves an outstanding request. Leaving the card or changing authority does not replay it automatically.

## Release boundary

This phase extends unpublished PR191 and integrates its current Cloud baseline. It does not change live scopes, grants, flags or data and requires no Cloud/media run to verify local UI behavior. The additive schema, explicit provider/client/user consent and actual ChatGPT editing still require a separate reviewed release. Keep it isolated from the active automatic-media pilot and preserve all existing budget holds.

Verification covers atomic movement/restoration, stale and revoked authority, reference-bound receipts, bounded reads, cleanup and real HTTP dispatch. Browser evidence uses compiled HTML through a synthetic AppBridge host. It establishes local card behavior, not actual ChatGPT/Codex or OAuth acceptance.
