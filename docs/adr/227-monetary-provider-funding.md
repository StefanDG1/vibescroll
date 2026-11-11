# Monetary provider funding without resetting exposure

Date: November 1, 2026. Status: live under R137, website593984c/backend02860d6. Monetary v2 activation and isolated acceptance are recorded in [the dated receipt](../operations/evidence/launch-20261101-mcp-core-flows.json).

The temporary paid-processing counter reserves a fixed USD0.05 for each admitted job. That prevents overspending but never releases a proven-unused portion. Replace it with integer nanoUSD reservations while retaining the existing personal credit wallet as a separate accounting system.

The v2 policy uses one lifetime Gateway pool. Its absolute ceiling is the smallest of verified provider credit, key budget, prior exposure plus the approved operating pool, and the pool's existing ceiling. Configuration rotation cannot create money. Migration keeps the original policy ID, the USD5 operating envelope and every indexed legacy paid counter at USD0.05 per job, plus prior exposure. Owner pilots, direct OpenAI grants and private engineering holds remain separate.

An atomic reservation binds the existing operation key and request hash. Provider HTTP calls await a durable per-component dispatch barrier. Replays cannot reserve or dispatch again. Proven-unused work releases its hold; known usage settles once using its stated receipt basis. Missing/ambiguous usage retains the whole hold. Reported token tariffs are estimates, not provider invoices. ASR responses with only a ceiling retain their full exposure. An overrun records the whole liability and blocks new admissions rather than clipping the amount.

Two new empty tables hold pool and reservation state; no existing schema field or populated index changes. Publication must verify actual empty-table admission and no populated scan/backfill. V1 remains readable before activation; after a v2 pool exists, downgrading to the counter policy cannot forget its liabilities. Expiry closes new processing. Authorized retained ready-cache reuse and ordinary reads remain available without creating work or spending credits.

Isolated acceptance covers concurrent reserve/replay, exact dispatch, unknown settlement, conflicting receipts, overrun, rollover, expiry and signed sandbox checkout-to-wallet-to-processing recovery. No test creates real payments or replenishes provider credit. Actual configuration and deployment acceptance are recorded separately in CURRENT-STATE.
