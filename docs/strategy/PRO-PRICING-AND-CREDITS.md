# One hosted Pro plan and duration credits

Mode: reference. Owner decision: October 29,2026. Status: approved price/portal mapping and published terms accepted; funded customer rollout remains pending.

Read this document before pricing, entitlements, onboarding, shared-catalog access or credit settlement until its checklist is accepted. It supersedes the older Starter/Pro/weekly/free-preview packaging without rewriting existing subscriptions or claiming unimplemented features are live.

## Offer and latest owner corrections

One paid hosted Pro tier includes workspaces, implemented base features and shared-cache reuse for explicitly requested posts. Full-library browsing is a separate paid add-on with a Settings toggle and explicit owner admin concession. Each member needs their own Pro and credits. Read [the saved-post/catalog/team plan](POST-SUBSCRIPTIONS-CATALOG-AND-TEAMS.md). Free distribution is user-hosted open-source code with its own infrastructure/database, without credentials or entitlement to the hosted proprietary dataset. Preserve MIT/upstream grants. Independent self-hosting support remains unaccepted.

On October31 the owner selected preparation of EUR35/month, EUR350/year and EUR17/week. Monthly and annual include300 credits granted monthly; weekly includes75 every seven days. These prices reduce numerologically to8. The older EUR8/week/50-credit recommendation is superseded as the candidate. Existing runtime prices, subscriptions, balances and purchases are unchanged. EUR remains the working currency. [The migration review](../launch-plan/2026-10-31/PRO-MIGRATION-REVIEW.md) preserves original monthly anchors, one personal pool and existing purchased/held units; actual Stripe sandbox and live activation remain open.

Prepare the review with `node scripts/prepare-pro-pricing.mjs`. It reads the isolated [candidate](../../contracts/pro-pricing-candidate.json), has no provider client and makes no writes. The owner confirmed75credits every seven days; the preview includes that grant. Live billing and existing balances remain unchanged. Its comparison uses exact rational cents and rounds display only: EUR17/week averages EUR73.92/month under365.25days/year; EUR350/year averages EUR29.17/month and discounts twelve monthly payments by16.67%. These are revenue comparisons before tax, fees and service costs, not profit estimates. It is not a four-week month. Annual payment grants credits monthly, not the whole year's allowance at purchase. Keep one personal pool across workspaces; creating a workspace never mints another allowance.

Remove the new hosted Starter/free-preview offer through a versioned migration. Weekly billing is retained as a premium interval of the same Pro tier after the owner's later correction. A synthetic demo may remain. Preserve existing owner/test grants, purchased balances, invoices and agreed customer periods. All features does not imply unlimited coding, premium inference, seats or storage. Never silently reinterpret old purchased credits or replace active subscriptions.

## Credit policy

Standard fresh video analysis costs `max(1, ceil(durationSeconds / 60))`: 59s → 1, 60s → 1, 61s → 2, 120s → 2, 121s → 3. Round each video's duration, never an average across different videos. Keep separate bounded byte, duration and runtime limits.

Metadata-only Save and compatible ready shared-cache retrieval cost zero analysis credits. A hit adds the user's association and returns the selected retained version with evidence, without new inference or unnecessary media copies. A deliberate fresh version uses the quoted credits and reuses compatible prepared evidence. Do not promise every URL is cached or stale/withdrawn evidence remains reusable.

Preparation may consume separately quoted infrastructure credits. Accumulate precise fixed-point intermediate units and round the final settled total once under the versioned tariff. A started-minute duration boundary is a tariff rule, not permission to round every intermediate cost. Reserve atomically, settle once, and release a known failure's unused reservation. Service retries do not double-charge. Unknown provider outcomes retain their hold until reconciled. Compatible concurrent requests coalesce where supported while each Save remains durable. Distinct model/recipe work can retain separate versions. Preserve source generations, immutable evidence, citations and rollback.

Muse 1.3 Contributor is the 1× baseline. Better API models consume more of the user's credits; their expense is never spread across the Muse allowance. Group whole-pipeline cost into rounded 1×/2×/5×/10×/20× bands, extending only when necessary. Include each model's maximum supported reasoning setting inside a finite billed-output budget. Selectable lower reasoning can use the same disclosed group tariff. Recalculate groups when provider prices, limits or extraction recipes change. See the [curated model and picker plan](MODEL-CATALOGUE-AND-CREDIT-BANDS.md).

The measured Muse high-reasoning call cost USD0.0034287, not the cost of a premium OpenAI call. At the current reference exchange rate, 300 such inference calls are about EUR0.92 before preparation, ASR, failures and delivery. A maximum-token reservation is a safety bound, not expected spend. Keep observed/estimated economics separate from the all-calls-hit-the-ceiling stress case. The earlier EUR 107/EUR 1070 and EUR 170/EUR 1700 pairs described a strict 80% contribution stress price, not a recommended price or proof that premium models are charged to every Muse run.

Each customer's supported subscription route uses their own subscription. Hosted preparation/API ASR still costs money, but never add an API inference bill that VibeScroll did not incur. Repository analysis, plans and coding need separately bounded quotes. Local execution remains deferred.

Included credits expire monthly without rollover. Purchased credits retain separate ownership/refund treatment. Existing EUR10/200 and EUR25/550 packs and the EUR0.01 internal credit-cost ceiling belong to the old unit system. Reprice/requote before migration; do not silently devalue old purchases. No live Stripe price, product, purchase or top-up was created for this decision.

Keep valid analysis and sampled evidence until deletion/takedown under the existing policy; raw video/audio remains temporary. Storage grows with versions and churned users. Reconcile the old Pro 5 GB/10,000-source caps with the permanent-results promise. Do not silently call storage unlimited.

## Alignment with existing plans

| Source                                              | Alignment or conflict                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current runtime catalogue, Billing, PRD R27 and D17 | Migrate two tiers and 250/600 old units to one Pro with versioned allowances. Weekly remains an interval, not another tier.                             |
| Hosted trial / first-result-before-payment copy     | Remove new free hosted entitlements; preserve old grants and honest demos.                                                                              |
| EUR0.01 ceiling and old top-ups                     | New units need whole-pipeline quotes and preserved old liabilities.                                                                                     |
| Shared intelligence/version plans                   | Align on paid hosted reuse, provenance, selection, takedown and private overlays.                                                                       |
| MIT V1 / personal deployment plan                   | Free self-hosted code; hosted dataset entitlement is separate; independent setup remains unaccepted.                                                    |
| All features / workspaces                           | Avoid feature tiers; enforce one allowance pool and explicit resource/provider bounds.                                                                  |
| Margin goals                                        | Distinguish delivery gross margin, contribution before ads/fixed costs, and operating profit. An 80% profit claim does not follow from cheap inference. |

## Financial evidence and margin definitions

Run `node finance/pro-v2-calculate.mjs` for reproducible scenarios. The default is observed Muse high, 300 separate 60-second uncached videos/month, no captions, 15% failure reserve, USD/EUR1.1133 and twelve equivalent months of retained history with two copies. Sandbox lifetime (60 seconds, ten aggregate active CPU seconds), Convex Node action time (90 seconds at 512 MiB), transfer, storage, support and acquisition are assumptions. The actual hosted whole-flow benchmark is still pending. A separate stress mode budgets 50,000 input and 12,000 total billed output tokens for every call; hidden reasoning is included. Premium examples use their own bounded high-reasoning cost, not a matched completed high benchmark. Provider price/region and first cache-write rates matter.

Include the owner's EUR103/month ChatGPT subscription as fixed overhead, one USD20 Vercel Pro plan with its included USD20 counted once, Convex EU Starter, R2, Stripe card/Merchant-of-record/Billing fees, domain and operations. Default accounting/bank EUR50/month, domain EUR20/year, backup/CI EUR3/month and support EUR0.50/user/month are estimates, not invoices. The founder's subscription is never a customer inference pool. Provider free/promotional credits and cache savings are not assumed to fund arbitrary processing.

At the working EUR 35/EUR 350 prices and 100 subscribers, the default 300-credit estimate gives approximately 80.9% delivery gross margin, 68.4% conservative contribution and 66.4% operating margin for monthly billing. Annual gives about 77.1%, 64.7% and 62.3%. Estimated operating profit is about EUR1,882/month or EUR1,472/month, and break-even is 8 monthly or 10 annual users. EUR 8/week with 50 weekly credits gives about 69.9% contribution and 67.9% operating margin when normalized to a continuously subscribed cohort. It has higher unit pricing, not a guarantee of higher realized profit under every usage pattern.

Delivery gross margin subtracts technical delivery plus support from revenue after VAT/refunds. Contribution also subtracts payments and uses full metered provider rates without assuming free quota. Operating profit applies actual modeled included quotas, fixed overhead and the selected marketing/compensation. These are different denominators/cost boundaries, not interchangeable meanings of 80% profit. Company/owner taxes require the actual operator regime; no tax status is declared here.

A strict 80% contribution target under the expected-cost assumptions needs more than the working EUR 35 price at full uncached use. The all-calls-hit-their-token-ceiling stress case needs still more. Do not present either price floor as a demand-validated selling price. Measure actual preparation/transcription/backend time before raising the catalogue. Preserve the owner's 1× Muse correction. A shared cache saves AI costs only when it avoids a fresh run; zero-credit cache reads do not prove users will leave their fresh allowance unused.

Replace assumptions with invoice/meter receipts, country/card mix, supplier-tax recovery, refunds, support, retention from churned users, acquisition cost and real use. Actual growth cohorts can require more cash than a steady-state CAC × churn provision. Engineering spending caps remain separate and unchanged. No provider purchase, live price or credit balance changed in this analysis.

## Migration acceptance

- [ ] Measure the approved hosted preparation + Muse and automatic subscription comparisons.
- [ ] Confirm catalogue prices/currency and create replacement weekly/monthly/annual prices only under live-billing authority.
- [ ] Version pricing/credit policy while preserving existing subscriptions, grants, purchases and invoices.
- [ ] Enforce one pool across workspaces; remove new hosted Starter/trial entry points and version the weekly allowance.
- [ ] Verify minute boundaries, reservation/settlement, failures, unknown outcomes, cache hits, reanalysis and concurrent Save without double billing.
- [ ] Enforce paid catalogue access in backend/API/MCP; a self-hosted fork has no hosted credential or dataset export.
- [ ] Reconcile permanent retention, fair use, storage, top-ups and premium quotes.
- [ ] Update website, app, onboarding, legal/refund terms, founding-pass offers and portal together; retain provider/legal gates.
- [ ] Verify sandbox and production migration without a real purchase unless separately authorized.

This target does not mean checkout, all-feature entitlements or supported self-hosting has shipped.

## Promotional OpenAI API funding

R127 requests using the owner's verified Pro-granted API credits for OpenAI-model website tasks before other API funding. Follow [the funding plan](OPENAI-PROMOTIONAL-API-FUNDING.md). Keep sustainable user tariffs unchanged; distinguish nominal API cost, promotional credit use, actual cash expense and the founder's Pro subscription cost. Linked organization/project, restricted key, grant state and one retained-evidence Luna/max owner canary are accepted, including its shared-result read. The owner-approved extension allows ten total generation slots/USD0.20, including the completed canary and subject to existing prepared-service limits. The configuration change starts no inference. No price, balance or billing product migration follows from this note.

October31 owner confirmation: prepare EUR17/week with75credits every seven days. Monthly remains EUR35/300credits and annual EUR350 with300credits granted monthly. This closes the weekly amount/clock choice only; live products, tax/fee review, add-on pricing and legacy migration still need the concrete package.

## November1 accepted compatibility checkpoint

Website/backendc10d14b expose one prepared Pro offer, exact future checkout/portal and no Pro repository-count quota. The separate versioned credit policy preserves old prices, balances and reservations. Actual sandbox payments/renewals/failure recovery, signed delivery into an isolated wallet, and application Managed Payments checkout/safe portal have passed. Production owner Usage/expired hold is unchanged. Public/account presentation is deployed and checked on desktop/phone, including contrast. [Receipt](../operations/evidence/launch-20261101-pro-offer-production.json).

The checklist above remains a rollout contract. Live new prices/mapping/terms, funded customer-processing admission, independent paid-customer acceptance and add-on price/value review remain open. New hosted trial suppression is implemented for activated single-Pro mode; current legacy/admin balances are not changed. No automatic top-up, real wallet grant or customer migration followed this release. Do not convert finite owner/test capacity into a public paid-service promise.

## November1 approved live offer

R132 supersedes the earlier preparation-only language for the exact EUR35/month300credits, EUR350/year300monthly and EUR17/week75credits offer. Website/backend480e9fc are live with exact CI41291279045, full local1503main/52auth/174knowledge cases, two deterministic preparations and17 actual zero-change publication guards. One42.911s fixed Basic/normal build passed24staged and24canonical policy/pricing/feed/Library cases and same-build promotion. Both canonical aliases completed and normal domain assignment was restored. The approved three live Pro prices and safe portal are configured and read back. Published policyv1-2026-11-01.1 preserves the complete previous bundle and first14-day refund section. All seven legacy price/portal bindings, the complete owner Usage text and its expired unknown hold are unchanged. Original MCP reads show automatic analysis enabled and no setup required. No customer, subscription, charge, source job, model call, wallet grant, migration or provider purchase occurred. New sales are explicitly closed with LIVE_CHECKOUT_ENABLED=false. The matching policy binding and approved price/portal mapping are installed; no stale policy identifier is used as an accidental gate. Existing processing remains the finite owner pilot. The separate proposed USD10/month paid-customer operating allowance is pending. Do not infer approval from existing Gateway credit, the price/terms approval or elapsed time. Paid-customer admission and independent acceptance remain open. Do not reconnect the original MCP or reset pilot counters. Existing quoted tariffs, premium bands and top-up terms are unchanged. [Receipt](../operations/evidence/launch-20261101-approved-pro-offer-production.json).

R133 approved launch update: EUR17/200credits and EUR35/500credits replace unused old top-ups. Fresh live Stripe reads found zero charges, invoices and subscriptions. Paid-customer admission uses their own verified Pro/credits and a separate bounded existing-provider-credit envelope. No live test payment, provider purchase, Auto Recharge or recurring cash allowance is authorized. [ADR224](../adr/224-paid-credit-launch-without-operator-purchases.md).
