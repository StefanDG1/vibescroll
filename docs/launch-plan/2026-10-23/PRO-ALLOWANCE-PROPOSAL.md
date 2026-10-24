# Future Pro allowance proposal

Mode: decision proposal. Prepared October 24, 2026, Europe/Berlin. **Review only. Quantity blocked. No sale or activation.**

The future monthly and annual prices are EUR 35 and EUR 350. The monthly AI allowance remains unselected. The existing 600-credit quantity is a legacy commitment and a sensitivity input, not the proposed new quantity. Lifetime and ongoing-access offers are later work under [ADR 125](../../adr/125-resumed-budget-and-repository-free-cloud-probe.md).

This packet supplies draft mechanics, exact unsent wording, reproducible scenarios and migration requirements for M0/M5. It changes no checkout, price, Stripe object, entitlement, published policy or provider permission. The owner should review concrete economics and wording after the missing bounds are supplied; choosing a quantity without those bounds would not close this proposal.

## Decision and source record

| Item                 | Current repository contract                                                | Future proposal                                                        |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Pro monthly          | EUR 39, 600 credits per monthly entitlement period                         | EUR 35, **quantity unselected**                                        |
| Pro annual           | EUR 390, 600 credits replenished monthly                                   | EUR 350, the same selected monthly quantity as the future monthly plan |
| Annual grant timing  | Monthly calendar anchors, not the year's credits upfront                   | Preserve monthly calendar anchors                                      |
| Included rollover    | Unused included credits expire at their period end                         | Preserve no rollover                                                   |
| Purchased credits    | EUR 10/200; EUR 25/550, separate pools                                     | Preserve existing purchases; no new top-up offer proposed here         |
| Weekly/Starter/trial | Pro EUR 11.99/150 weekly; Starter and 30-credit trial remain as contracted | No migration or repricing through this packet                          |
| Lifetime/ongoing     | No new active offer established by this packet                             | Deferred; do not activate the dormant 36-period worksheet              |

The current values come from [pricing.json](../../../contracts/pricing.json) and [billing rules](../../BILLING-AND-TAX.md). That contract's `proposal_pending_live_gate` flag is preserved. No live Stripe catalog or customer inventory was inspected. The future direction comes from [ADR 123](../../adr/123-scrollshow-handoff-and-integrated-offer-planning.md), with lifetime ordering superseded by ADR 125. [ScrollShow M0/M5](SCROLLSHOW-INTEGRATION.md#commercial-migration-acceptance-beyond-marketing-copy) requires exact allowance, funding, retention, remedies and legacy treatment before activation.

The source contract schema version is `1.0.0`; the current [Stripe catalog](../../../packages/providers/stripe-catalogue.ts) version is `1.1.0`. Those version numbers serve different purposes. Neither is a new-offer allowance snapshot.

## Proposed mechanics

1. **Unit and funding.** Use existing non-transferable service credits. One credit has an internal design ceiling of EUR 0.01 of all-in metered operation cost. It is not money, a refundable face value, a token count or a fixed number of posts. Company-funded credits cover only enabled, verified, quoted managed work. No fixed posts-per-month claim is justified yet.
2. **Eligible work.** A permitted source analysis, new project matching, deeper pass, plan or approved coding operation may consume credits only under its disclosed quote and route. Metadata-only saved links and same-workspace analysis reuse follow existing no-duplicate-charge rules. A catalog read/save is not permission to start another analysis. Exact release eligibility must be a versioned workload list tied to measured bounds, rather than a promise that every source type works.
3. **Own subscriptions.** An eligible user's provider-native subscription route remains separately gated by provider, host, privacy and source permissions. Its quota is not company credit funding. It provides no guarantee of hosted orchestration, automatic cancellation or commercial permission. Exhaustion cannot silently switch a user to an API or another paid route.
4. **Renewal.** Once selected, the order records `Q` credits per calendar-month entitlement period for both future intervals. Annual payment buys twelve monthly grants during the paid year, not `12 × Q` at checkout. Preserve the subscription-start anchor and end-of-month clamping. Included unused credits expire at the recorded period end; no automatic top-up or rollover.
5. **Quotes and settlement.** Display stages, eligible source, execution route, maximum credits, expiry and assumptions. Reserve before dispatch. Settle actual usage under the accepted quote, rounding once at the job boundary; release unused reservation. A higher maximum needs new authority. An exhausted allowance pauses new funded work until a new grant or separately chosen purchase.
6. **Failure and unknown usage.** Release work that never starts. Restore relevant platform credits for a technical service failure with no usable billed result under the refund policy. An uncertain external attempt retains its cost hold until reconciled; no second funded attempt or fabricated zero usage. External provider charges and statutory money remedies remain separate from platform-credit settlement.
7. **Cancellation and retained work.** Preserve the paid period and valid unused purchased-credit rights. At entitlement end, stop new Pro catalog access, saves, reuse and updates. Earned immutable private copies and authored notes remain readable subject to the particular source rights, recorded deadline, moderation, security and removal rules. Do not imply that cancellation deletes every copy or that a saved copy survives a mandatory removal. All-plan eligible contribution does not grant Pro access.
8. **Limits and changes.** Preserve existing valid purchases and quotas while the new offer is evaluated. Any new retention or workload cap needs an explicit order disclosure and engineering enforcement; it cannot retroactively remove paid commitments or earned-copy rights. A proposed reserve is not a customer charge or authorization for a provider call.

These mechanics extend [billing](../../BILLING-AND-TAX.md), [ADR 122 retained-copy authority](../../adr/122-proprietary-pro-insight-catalog.md) and existing jobs. The old billing document's general 30-day read/export window must be reconciled with the later earned-copy decision in the revised policy release; it must not silently terminate those copies.

## Dated inputs and calculation method

The [assumptions JSON](../../../finance/pro-offer-20261024-assumptions.json) is the machine-readable record. The [pure calculator](../../../finance/pro-offer-20261024-calculate.mjs) reads that file and writes results to stdout. It does not alter `finance/calculate.py`, the old workbook or billing code.

```powershell
node finance/pro-offer-20261024-calculate.mjs --check
node finance/pro-offer-20261024-calculate.mjs
```

The saved base uses October 3 planning inputs: 21% consumer VAT, 2% refunds, 1.8% card fees, 0.7% Billing and 3.5% Managed Payments on gross billings, no separate Tax fee, RON 1 per payment plus RON 0.31 screening at 1.1 attempts, RON 5/EUR, 0.5% FX reserve, 0.1% dispute frequency at EUR 20, EUR 0.95 service/user-month and EUR 30 fixed/month. [ADR 048](../../adr/048-managed-payments-financial-scenarios.md) explains the Managed Payments and screening additions to [saved finance inputs](../../../finance/assumptions.json). These are scenarios, not current merchant fees, taxes, exchange rates or observed costs.

For price `P`, monthly payment frequency `p` (1 monthly, 1/12 annually), refund fraction `r`, VAT `v`, all-in credit cost `c`, non-credit monthly cost `S`, fixed monthly cost `F`, active customers `N`, cancelled-cohort monthly cost `C`, and target margin `m`:

```text
Net monthly revenue R = P × p × (1 − r) / (1 + v)
S = gross percentage fees + payment/screening fees + FX + disputes + service reserve
Full monthly credit cost = Q × c
Operating margin = [N × (R − S − Q × c) − F − C] / (N × R)
Conditional maximum Q = floor([R × (1 − m) − S − (F + C)/N] / c)
```

The maximum is undefined when `N = 0` or the budget is negative. It is an arithmetic ceiling under the stated inputs, not a recommendation. The saved 60% target excludes company tax, founder salary, marketing and initial development. Annual recognition is monthly; receiving annual cash upfront does not make later grants or retention free. Screening and original processing costs remain reserved when expected refund revenue is removed.

The combined stress composes saved 27% VAT, 3.15% card, 2% FX, EUR 2.95 service and EUR 80 fixed costs while retaining Managed Payments. It is a sensitivity, not an observed merchant profile. A separate failure stress triples actual credit cost to EUR 0.03; that would breach the EUR 0.01 design ceiling and cannot be an enabled quote policy.

## Full-consumption result annex

Every row below consumes **all 600 comparison credits each month** at EUR 0.01 each. Only the two current rows have a 600-credit contractual basis. No future quantity is selected by this table. Results are rounded for display; the calculator retains full precision.

| Saved base offer                       | Net revenue/customer-month | Non-credit cost/customer-month | Margin before fixed cost | Customers needed for 60% after EUR 30 fixed |
| -------------------------------------- | -------------------------: | -----------------------------: | -----------------------: | ------------------------------------------: |
| Current EUR 39 monthly                 |                  EUR 31.59 |                       EUR 3.77 |                   69.06% |                                          11 |
| Current EUR 390 annual                 |                  EUR 26.32 |                       EUR 3.09 |                   65.48% |                                          21 |
| Future EUR 35 monthly, comparison only |                  EUR 28.35 |                       EUR 3.51 |                   66.44% |                                          17 |
| Future EUR 350 annual, comparison only |                  EUR 23.62 |                       EUR 2.87 |                   62.45% |                                          52 |

This all-Pro, all-one-interval calculation differs from ADR 048's mixed-tier/interval portfolio. Its thresholds do not replace that historical result.

| Future comparison case                 | Margin at 10 active customers |  At 30 | At 100 | At 250 |       Minimum for 60% |
| -------------------------------------- | ----------------------------: | -----: | -----: | -----: | --------------------: |
| EUR 35 monthly, saved base             |                        55.86% | 62.91% | 65.38% | 66.02% |                    17 |
| EUR 350 annual, saved base             |                        49.75% | 58.22% | 61.18% | 61.94% |                    52 |
| EUR 350 annual, 27% VAT                |                        47.26% | 56.15% | 59.26% | 60.06% |                   226 |
| EUR 350 annual, combined stress        |                        12.47% | 36.16% | 44.46% | 46.59% | Unattainable with 600 |
| EUR 350 annual, credit-ceiling failure |                        −1.05% |  7.42% | 10.38% | 11.15% | Unattainable with 600 |

For the future annual offer, the conditional quantity ceiling at 30/100 active customers is 557/627 in the saved base, 513/583 in the higher-VAT case and 63/250 in the combined stress. Those incompatible ceilings, unresolved actual costs and unfunded cancelled cohorts prevent a defensible selected quantity. Even zero credits miss the stress target at ten customers. At zero revenue, fixed costs still consume EUR 30/month in base or EUR 80/month in stress; a sustainable operating floor needs a named funding reserve.

EUR 350 is EUR 70 less than twelve EUR 35 payments, a 16.67% gross price difference for equivalent service. It is not a measured customer saving or permission to issue fewer credits than the order promises.

## Consumption, retention and churn annex

The existing Pro 5 GB limit is an **asset/R2 byte ledger**, not a total database cap: see [assets](../../../convex/assets.ts) and [storage accounting](../../../convex/lib/storageUsage.ts). It does not price database rows, immutable imports, search projections/indexes, job history or backups. There is no saved R2 tariff in this packet. A Convex database rate must not be applied to R2 bytes.

The database-only sensitivity uses the October 22 [saved deployment proof](../../operations/evidence/launch-20261022-deploy-budget-proof.json): USD 0.22/GB-month × 1.3 non-US multiplier. Apply the old finance FX scenario of EUR 0.9/USD and 21% unrecoverable supplier tax to get **EUR 0.311454/GB-month**. This is dated source evidence plus scenarios, not a current tariff or invoice. No storage rate proves request, transfer, schema/admin, backup or cleanup costs.

Assume each cancelled account has the stated retained database bytes, generates no new subscription revenue and retains the same bytes for the entire horizon:

| Cancelled customers | Database per customer | 1 month after paid access |    12 months |    36 months |
| ------------------- | --------------------: | ------------------------: | -----------: | -----------: |
| 10                  |                  1 GB |                  EUR 3.11 |    EUR 37.37 |   EUR 112.12 |
| 100                 |                  1 GB |                 EUR 31.15 |   EUR 373.74 | EUR 1,121.23 |
| 10                  |                  5 GB |                 EUR 15.57 |   EUR 186.87 |   EUR 560.62 |
| 100                 |                  5 GB |                EUR 155.73 | EUR 1,868.72 | EUR 5,606.17 |

These are partial costs. R2, database/index amplification, backup/deletion overlap, read/export traffic and support remain unpriced. They are not cancelled-user fees or a proposed shorter retention term.

Full consumption before churn must also be funded. The next table combines 100 customers who consume all comparison credits, pay for one month or one annual year, then cancel. It subtracts paid-period service/credit costs and 1 GB/customer post-cancellation database storage. It excludes company fixed costs and every unpriced retained operation, so the figures are **partial cohort contribution**, not lifetime profit:

| Paid interval before churn                | Comparison credits consumed/customer | Contribution after 1 retained month |      After 12 |      After 36 |
| ----------------------------------------- | -----------------------------------: | ----------------------------------: | ------------: | ------------: |
| Future EUR 35 monthly, one paid month     |                                  600 |                        EUR 1,852.25 |  EUR 1,509.65 |    EUR 762.16 |
| Future EUR 350 annual, twelve paid months |                                7,200 |                       EUR 17,672.14 | EUR 17,329.54 | EUR 16,582.05 |

The calculator also emits the 5 GB and ten-customer cases. Annual 7,200 here is twelve fully consumed grants, never an upfront balance. At 100 cancelled accounts retaining 1 GB each, the EUR 31.15 monthly database cost alone lowers the saved-base future annual margin from 61.18% to 59.86% at 100 active customers, or from 58.22% to 53.82% at 30. It lowers the respective conditional ceilings from 627 to 596 and 557 to 454. This exposes why later sales cannot be assumed to finance earned copies.

[Service artifacts](../../../convex/lib/serviceArtifacts.ts) allow a maximum 512 KiB snapshot. Ten thousand maximum-size copies would occupy 5.24288 decimal GB before source rows, indexes, projections and history. That is a sizing case, not a measured footprint or proof of an enforced workspace database/import cap. At 100 such accounts the same database-only 1/12/36-month sensitivity is EUR 163.29 / EUR 1,959.50 / EUR 5,878.50.

Generic source rights [cap `maxRetentionMs` at 365 days](../../../packages/social/contracts.ts). A saved copy's actual deadline can be earlier and is bound to its rights and source/artifact expiry. Thirty-six months is a sensitivity for authored notes, own results or other continuing obligations; it grants no permission to retain a catalog snapshot past its recorded deadline. Existing privacy schedules still apply to originals, caches, logs, audits and backups. A review must separately cost and reconcile each data class; it cannot finance the offer by waiving lawful retention/removal or earned-copy rights.

If an eligible first-subscription refund occurs after one fully consumed monthly grant, a separate full-refund stress leaves zero sale revenue and EUR 9.51 unrecovered quoted cost for the future monthly transaction, or EUR 29.99 for the future annual transaction. It reserves all modeled transaction fees/FX and one service month without claiming the processor actually retains every fee. It adds no further inference or retention costs. This is refund funding exposure, not a deduction from a customer's refund entitlement.

## Missing bounds and the release sequence

| Missing evidence                  | Concrete engineering/review output required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete workload cost            | Per enabled operation, record input/media limits, quote, provider, reasoning/output cap, preparation, minimum compute billing, transfer, bounded retry/unknown handling, cleanup and residual cost. Demonstrate all-in cost fits the credit ceiling under the selected funding route.                                                                                                                                                                                                                                                                                         |
| Actual provider rates and funding | Reconcile saved rates with authorized current schedules/account invoices before activation. The [Google adapter](../../../packages/providers/google-inference.ts) records Gemini 3.5 Flash Lite at USD 0.33/M input and 2.75/M output, including thinking, with internal 1.5 EUR/USD FX/tax provision. That is code policy, not a current quote or whole-job measurement. The [Sandbox runbook](../../operations/vercel-sandbox.md) records 0.02 credits/second and a five-minute/ten-credit media reservation, but requires minimum billing, transfer and teardown evidence. |
| Full retained storage             | Bound R2 asset and request charges, database/import/index/projection bytes, backup overlap, failed deletion, read/export frequency and per-data-class retention after cancellation. Attach actual enforcement, not an assumed 5 GB total cap.                                                                                                                                                                                                                                                                                                                                 |
| Service operations                | Replace the EUR 0.95 placeholder with a measured or explicitly funded support, invoicing, moderation, catalog acquisition/maintenance and infrastructure envelope. Keep metered work separate to avoid double counting.                                                                                                                                                                                                                                                                                                                                                       |
| Low sales and funding             | Specify supported scale and cash/risk reserve for refunds, purchased balances, twelve annual grants, cancelled cohorts and zero new sales. A temporary hosting credit or unpaid labor is not recurring funding.                                                                                                                                                                                                                                                                                                                                                               |
| Exact legal/merchant treatment    | Review current fees, consumer taxes, supplier tax and FX with the responsible evidence. Reconcile saved copies and the general read/export window. Preserve withdrawal/refund/nonconformity rights. No current legal opinion is claimed here.                                                                                                                                                                                                                                                                                                                                 |
| Allowance identity                | Implement and test immutable versioned allowance snapshots before lowering any global quantity. Review the concrete migration below.                                                                                                                                                                                                                                                                                                                                                                                                                                          |

After those records exist, calculate a quantity across the agreed conservative cases and scale/reserve envelope, present the resulting number and exact customer-facing release together, then obtain the required review before activation. If no positive funded allowance fits the selected prices and service obligations, keep the future offer unavailable and report that conflict. Do not ask the owner to guess a provider bound or treat a vote for a quantity as cost evidence.

## Legacy and in-flight migration contract

The existing [commerce grant](../../../convex/commerce.ts) derives each period's credits from global `pricing.tiers[tier].monthly_credits` or `weekly_credits`. A `billingPeriods` row records granted `credits`/`allowanceCeiling`, and subscription/start deduplicates the grant. That preserves already-created periods but does not bind every **future monthly grant of an already-paid annual purchase** to its purchased allowance. Changing the global 600 value alone can therefore reduce a legacy buyer's remaining paid-year grants.

Before a new sale, extend existing commerce/catalog authority rather than creating a second wallet or trial store:

- Snapshot the accepted allowance policy against the verified purchase/subscription and applicable price/catalog version: tier, interval, quantity, monthly anchor/expiry rule, effective paid commitment and accepted terms/quote policy version. The exact schema must be reviewed with reconciliation; do not trust client price metadata as grant authority.
- Map existing price/product versions explicitly. Preserve 600 credits for each eligible monthly grant throughout every valid legacy paid annual year, including as-yet unissued months. Preserve purchased monthly/weekly periods, Starter, trials and existing renewals according to their accepted terms. Any later change needs the stated advance notice and reviewed effective-date mapping; no silent conversion.
- Keep grant deduplication, calendar anchors, upgrades' incremental allowance, out-of-order webhooks and restore/reconciliation idempotent. An absent legacy snapshot requires evidence-backed legacy mapping, not the current global default. No silent double grant, balance reset or retroactive depletion.
- Preserve EUR 10/200 and EUR 25/550 purchased-credit pools, relevant refund reversals, payment history and outstanding reservations separately from expiring allowance. Cancellation cannot confiscate an unused purchased pool. A purchased balance alone cannot create new Pro catalog authority.
- Bind in-flight work to its accepted quote, funding and period/pool reservations. No new catalog access after entitlement end; already-dispatched work still needs reconciled cancellation/usage handling. A price migration cannot erase an unknown hold, reauthorize dispatch, increase an approved maximum or charge the operation twice.
- Verify monthly/annual boundary dates, old/new price mappings, legacy paid annual grants, top-ups, repeated upgrades, cancellation, refund/dispute, duplicate/out-of-order events, unknown work, export/deletion and restore. Test that copied private results retain their original content and rights, independently of the new allowance.

These are engineering gaps and acceptance cases, not implemented behavior from this document.

## Literal unsent checkout and FAQ draft

**Review text only. `Q_UNSELECTED` is a blocking marker. None of the following belongs on an enabled checkout or public sale route until replaced by the reviewed order-specific quantity and policy.** The live behavior and enabled workloads must match the eventual copy.

Monthly checkout summary:

> Pro: EUR 35 per month, with applicable tax included in the price shown at checkout. Renews monthly until cancelled. Includes Q_UNSELECTED service credits per calendar-month allowance period. Unused included credits expire at the end of that period. Purchased extra credits are tracked separately. Each paid operation shows its funding route and maximum credits before work, or uses a budget you previously authorized. No automatic top-up. Cancel renewal in billing settings. See the refund policy and the retention rules that apply to your saved work.

Annual checkout summary:

> Pro: EUR 350 per year, with applicable tax included in the price shown at checkout. Renews annually until cancelled. Includes Q_UNSELECTED service credits each calendar month of the paid year, replenished on the dates shown in your account. The year's allowance is not granted upfront. Unused included credits expire at the end of each monthly allowance period. Purchased extra credits are tracked separately. No automatic top-up. Cancel renewal in billing settings; cancellation normally preserves the paid period. See the refund policy and the retention rules that apply to your saved work.

Shared checkout note:

> A VibeScroll plan does not include another provider's subscription. Features and source processing depend on the enabled route, permissions and provider availability. A linked source may be unavailable or unsupported. Immediate-service consent, where needed, is recorded separately from policy acceptance and does not remove mandatory consumer rights.

FAQ replacement/addition draft:

> **What does the monthly AI allowance include?** The future Pro order will state Q_UNSELECTED service credits per monthly allowance period. Credits pay for enabled managed work under its accepted quote. They are service units, not money or a fixed number of posts. Saving a link without analysis does not itself consume analysis credits. A supported own-provider route has separate eligibility and quota; it does not increase the company-funded allowance.
>
> **What happens when I run out or a job fails?** New funded work pauses when no eligible balance remains. Extra credits require a separate choice. Work that never starts releases its reservation. For a technical service failure with no usable billed result, the relevant platform credits are restored under the refund policy. An uncertain attempt stays pending reconciliation so it is not charged or dispatched twice. Money-refund and statutory rights still apply.
>
> **What happens if I cancel?** Renewal stops and the confirmation shows your paid-through date. After Pro ends you cannot make new Pro catalog saves, reuse or receive updates. Earned private copies and authored notes remain subject to their recorded rights, retention deadlines and removal rules. Purchased unused credits remain separately tracked under the refund policy. Export and deletion remain available under the applicable account and privacy rules.

## Literal unsent terms diff

This proposed addition to “Prices, subscriptions, and credits” supplements the [published Terms 1.0.0](../../../legal/TERMS.md). It is review wording, not a complete legal release. The [Refunds 1.0.0](../../../legal/REFUNDS.md) remain intact, including the voluntary first-14-day policy for an individual's first subscription and covered weekly renewals, immediate-service consent boundaries and mandatory remedies.

```diff
+ For a future Pro order identified at checkout as EUR 35 monthly or EUR 350
+ annually, the accepted order records Q_UNSELECTED service credits for each
+ calendar-month allowance period. Both payment intervals provide that same
+ monthly quantity. An annual purchase provides twelve monthly grants during
+ its paid year; it does not provide the year's credits at purchase. The account
+ displays each allowance period and expiry date. Included credits do not roll
+ over. Purchased extra credits remain separately tracked under the refund policy.
+
+ The accepted order and allowance policy version govern that paid commitment.
+ A later catalog change does not reduce an allowance already purchased,
+ including remaining monthly grants in a paid annual year. Any change for a
+ future renewal follows the advance notice and cancellation terms above.
+
+ A job's accepted quote identifies its funding route and maximum credits.
+ A connection or an exhausted allowance does not authorize a different paid
+ provider route. Reservations, technical failures and uncertain usage are
+ handled under the displayed quote and refund policy without removing money
+ refund rights or mandatory remedies.
+
+ After Pro entitlement ends, new Pro catalog access, saves, reuse and updates
+ stop. Valid private copies already saved and authored notes remain subject
+ to their recorded source permissions, retention deadlines, security,
+ moderation and removal rules. This does not extend a source's permission
+ or prevent a required removal. Export and deletion follow the applicable
+ account rules and privacy notice.
```

No proposed clause waives source retention, deletion, refund, withdrawal or service-conformity rights. Do not promise provider history deletion, uninterrupted processing or a particular completion time. An enabled release also needs the exact compatible privacy/read-export wording, versioned checkout acceptance and merchant order disclosure. This packet has no effective date and must not reuse the current policy release identifier.

The current [publication manifest](../../../packages/policy/publication.ts) remains `v1-2026-10-03.1`, effective October 3, with Terms/Refunds/Privacy/DPA `1.0.0` and Cookies `1.1.0`. [Published hashes](../../../legal/RELEASE-2026-10-03.json) remain unchanged. No professional legal approval or live offer acceptance is asserted.

## Packet verification and disposition

The local calculator checks annual normalization, twelve grants, full consumption, refund fee reservation, zero-sale overhead, linear retention, cancelled-cohort pressure, quantity remaining null, input immutability and invalid quantities. It uses Node built-ins only and sends no requests. The recorded targeted result is **17 checks passed**, with no hosted calls and no output-file writes. These checks validate arithmetic and the packet's blocked state, not provider costs or production readiness.

Review disposition: future prices retained; quantity blocked; lifetime later; legacy commitments protected in the proposed migration; new billing implementation, current fee/workload evidence, funded retention, revised policy release and live/test-mode acceptance still required. No approval request or sale-readiness claim follows from the scenario results.
