# Review the single-Pro migration

Mode: review package. Owner choices confirmed October31,2026. The later R132 approval authorizes the exact new live prices and reviewed terms, now configured at480e9fc. Charges and customer migration are not authorized by this review document; public sales still await funded customer admission. See ADR223 and CURRENT-STATE.

## Exact offer

| Billing interval | Price, EUR | Credit grant                      | Comparison                       |
| ---------------- | ---------: | --------------------------------- | -------------------------------- |
| Weekly           |         17 | 75 every seven days               | EUR0.226666… per included credit |
| Monthly          |         35 | 300 each month                    | EUR0.116666… per included credit |
| Annual           |        350 | 300 each month, never3600up front | EUR0.097222… per included credit |

One hosted Pro tier includes the hosted feature set and requested-post cache reuse. There is no new free hosted tier. Free self-hosting does not include credentials or bulk access to the hosted catalogue. Full-library browsing stays a separately controlled add-on with no purchase offered before its price/value review; the existing owner admin concession remains separate from billing.

Weekly price/allowance normalized using365.25days/year is approximately EUR73.92 and326.116credits/month. It is not a calendar-month billing schedule. Annual saves exactly1/6, or16.666…%, against twelve monthly payments. Calculations keep exact rational cents until display. Do not round each provider component before accumulating a real job's cost.

## Credit and calendar rules

One person owns one allowance pool across all workspaces. Every member needs their own active Pro and spends their own credits. Creating or joining a workspace grants no extra allowance and cannot borrow the owner's wallet. Retain the narrowly configured existing owner legacy-wallet exception; do not extend it to a team or a different person.

R131, November1: the owner reports no real customers. Do not advertise storage quotas or impose a Pro repository-count quota in the new offer. Prepare concise fair-use terms; retain operational resource, credit and concurrent-work bounds without promising unlimited storage. Existing admin/test balances, valid results and provider history remain protected. No customer-migration campaign is needed for today's reported account state; retain the tested backward-compatible settlement path. Existing top-up terms are unchanged until the concrete offer review.

The candidate grants75credits over seven exact UTC days or300over each original monthly anniversary. Monthly subscriptions use Stripe's verified current period start/end. Never recalculate an end from a clamped renewal start: the actual October31 sandbox subscription renewed November30 through December31. Annual payments produce twelve monthly grants, clamped independently from the original annual anchor: January31→February28/29→March31. A duplicated invoice/webhook/scheduler delivery must use the same person/subscription/window key. Paying annually does not grant3600credits immediately. Unused allowance expires under the reviewed policy, while unknown reservations remain held; purchased units retain their existing denomination and expiry terms.

The offline implementation is [pro-migration-preview.ts](../../../packages/billing/pro-migration-preview.ts). It performs no provider call or database write. Its tests cover leap years/month-end drift, seven-day/DST boundaries, deterministic keys, live-versus-sandbox price refusal and preservation of purchased/held units. Separate opt-in tests now pass actual sandbox receipts through this helper. It is not a deployed grant scheduler or application-wallet integration.

For baseline new work, current preparation costs1credit when needed and Muse analysis costs1per started minute. A compatible ready-cache reuse costs0analysis/preparation credits. A retained-evidence new version avoids preparation credits. Thus300credits cover150separate fresh videos of up to60seconds, or100fresh videos of61–120seconds, before other credited actions. This is a tariff example, not an observed usage forecast. Cached browsing still incurs read/transfer/storage costs, and users may spend their remaining allowance on fresh work.

## Preserve existing customers

November1 read-only production inspection verified the configured merchant and all six exact live price IDs against their product/tier/interval metadata. All are active, EUR and tax-inclusive. Provider charges/payouts are enabled; this does not establish tax registrations or authorize checkout. Exact account/product/price IDs remain in the private review packet.

| Existing tier | Weekly price / allowance | Monthly price / allowance | Annual price / monthly allowance |
| ------------- | ------------------------ | ------------------------- | -------------------------------- |
| Starter       | EUR5.99 /65              | EUR19 /250                | EUR190 /250                      |
| Pro           | EUR11.99 /150            | EUR39 /600                | EUR390 /600                      |

These rows describe verified legacy price bindings and current runtime allowance policy. They are not a claim that any customer purchased each offer. No customer records or live writes were needed. Keep these bindings when introducing the candidate300/75-credit policy.

1. Keep the existing product metadata tag `vibescroller` and real provider product identity. Add reviewed replacement prices; do not create a parallel product merely to rename the brand.
2. Maintain the exact old price→tier/interval/credit-policy mapping for existing customers. Preserve Starter and old Pro terms until each customer accepts a concrete replacement at renewal. No silent downgrade from old600credits to300, change of price or forced proration.
3. Preserve purchased units, open invoices, refunds, disputed payments, cancellations and unknown reservations. Do not convert trial/operator grants into fabricated paid subscriptions.
4. New hosted signups use only the new Pro prices after activation. Retire new Starter/trial entry points together with checkout, portal, catalogue validation, legal terms and all user-facing prices. Keep truthful labeled demos.
5. Verify three sandbox prices: EUR1700/3500/35000cents, tax-inclusive contract where applicable, one week/month/year, exact policy metadata and `livemode=false`. The offline verifier refuses a live price, wrong interval, wrong tax mode, duplicate ID or changed amount. The exact existing sandbox account and three real test prices are verified. Actual tax registrations and live customer configuration remain unverified.
6. Test renewal, annual monthly grants, cancel-at-period-end, payment failure/recovery, delayed/replayed webhooks and a voluntary legacy change. Use two authorized accounts to verify personal pooling and team isolation without a real purchase. Existing isolated team/cache tests do not establish paid-customer acceptance.

## Cost review and activation gates

The dated finance calculator remains a scenario model. Its old300jobs/300credits assumption excludes the new separate preparation credit and therefore overstates fresh baseline capacity under this candidate. Preserve historical outputs; show the new150fresh-60s-job example separately. Existing Sandbox receipts establish elapsed time, not active CPU or a settled infrastructure invoice. Use the actual price/region, transfer, permanent retained history, support, payment/tax/refund mix and acquisition costs before promising margins. The founder's EUR103subscription remains fixed overhead, never pooled customer inference.

The first direct OpenAI retained canary used7891input and11118total output tokens, including8889reasoning tokens. Its base-rate estimate is USD0.0063481; the conservative cache-write ceiling is USD0.006545375. It used3user credits. This one sample does not establish quality superiority, average cost, fresh-video preparation cost or an80%profit margin. Promotional funding changes cash expense, not the sustainable credit tariff. Stop new OpenAI work at its explicit grant capacity/expiry without purchased-credit fallback.

Before live activation, present the exact account/product/price IDs, old-price mapping, tax/customer notices, storage/fair-use/top-up policy, full-catalogue purchase scope and rollback plan for review. The owner has authorized preparation of these prices, not live activation. Keep all current prices, subscriptions, balances and gates unchanged meanwhile. A rollback disables new checkouts; it never deletes invoices, valid results, customer grants or unknown holds.

## Acceptance

November1 owner continuation authorizes the policy integration and webhook/wallet work while explicitly preserving old subscriptions and balances. Follow [ADR221](../../adr/221-versioned-pro-credit-policy.md): separate exact candidate price mapping, paid object-graph validation, personal pooling and replay-safe existing ledger settlement. Deploying this compatibility layer does not activate live prices or migrate customers.

- [x] Owner selected EUR35/month, EUR350/year and EUR17/week with300monthly/75weekly credits.
- [x] Offline price comparison and calendar/preservation verifier pass.
- [x] Requested-post cache and independent second-account no-job/no-credit reuse already have separate production evidence.
- [x] Individual-Pro team and personal-wallet isolation have controlled backend tests.
- [x] Actual three-price sandbox mapping through the canonical verifier, with all eight older test prices unchanged.
- [x] Three actual initial payments and three test-clock renewals at exact candidate amounts.
- [x] Actual failed renewal, same-invoice recovery/payment replay and period-end cancellation.
- [x] Six actual paid invoice graphs through the candidate credit-period calendar, including the clamped monthly renewal.
- [x] Actual signed sandbox delivery and isolated application wallet grants/replay. No customer migration campaign is needed under R131; historical balances remain protected.
- [x] Controlled SDK-signed HTTP webhook→wallet tests for new/legacy grants, concurrency/replay, annual windows, failures, renewal migration and preserved purchased/held units.
- [x] Actual retained sandbox object shapes through controlled signed HTTP delivery into isolated synthetic wallets; no real app balances modified.
- [x] Implement exact per-price policy and independent payment-risk holds; local tests cover restricted review and existing-job completion.
- [x] Actual sandbox provider delivery through the application's signature verifier/HTTP handler, isolated300-credit grant and signed replay, with owned cleanup.
- [x] Compatible production backend integration, with policy unset, old allowance read-back unchanged and no real wallet grant.
- [x] Actual sandbox application Managed Payments checkout and safe portal, without payment or real account writes.
- [ ] Live-offer review/activation. The owner reports no real customers, so a customer-migration campaign is not a launch requirement; historical balances remain protected.
- [ ] Wire the activated single-Pro checkout/portal/public offer together after concrete review; leave current legacy offer unchanged until then.
- [ ] Exact current operator tax/customer terms and legacy mapping reviewed.
- [ ] Live publication/customer migration approved and verified.

M5 is prepared, not commercially activated. Do not call the whole medium-term plan complete while these acceptance items remain open.

November1 next implementation checkpoint: extend the offline candidate calendar to accept verified provider period ends. Test the actual initial and renewal receipts through that helper, preserving weekly exact duration, annual twelve-window limits and deterministic grant keys. Validate payment failure/recovery/cancellation through the isolated sandbox. These tests must remain separate from signed webhook delivery and application wallet writes; do not enable the new policy in production or reinterpret legacy allowances during preparation.

That checkpoint passed eight focused tests and the full offline repository check, including both production builds. Exact Linux CI41253310064 passed code85af4f2. The scoped temporary key was expired after reconciliation, and a final read-only API attempt returned `api_key_expired`/401. Preserve the sandbox catalogue and payment fixtures for review. The next implementation boundary is the versioned price-policy adapter and signed webhook/application-wallet acceptance; production continues to use legacy terms. [Sandbox receipt](../../operations/evidence/launch-20261101-pro-sandbox-preparation.json).

November1 continuation: the owner completed browser login and ChatGPT Stripe connection, but this Codex tool session still returns `UNAUTHORIZED`. Do not repeat that reconnect loop. The signed-in dashboard matches the configured VibeScroller merchant; its existing isolated VibeScroller sandbox is verified through a scoped test-only key. Production uses a live key and is unchanged. Three candidate prices were created under the existing sandbox Pro product, and all eight older prices remain unchanged. The actual price receipt passes the canonical verifier through an opt-in provider test.

The first two synthetic subscription attempts were blocked by a sandbox billing-country rule. The payment detail identified the actual predicate; adding an allowed country to only the synthetic methods resolved it. No fraud rule changed. All three initial subscriptions and renewals then paid exact candidate amounts. A documented attachable decline fixture produced a real failed monthly renewal; the same invoice recovered with one paid event, and replay added no payment. Period-end cancellation produced no new invoice. Six paid invoice graphs pass the candidate calendar, including November30→December31. Annual schedules contain twelve300-credit windows, not an immediate3600-credit grant. These tests create no app credits. Preserve earlier failures and consumed scripts. Signed delivery, customer migration and live activation remain open; [ADR220](../../adr/220-provider-bound-pro-credit-periods.md).

November1 ADR222 acceptance: the application opened the exact EUR35monthly Managed Payments checkout and safe separate billing portal against the isolated sandbox. The generated session was expired and temporary portal configuration archived, with no payment or real account grant. Three-interval quote/checkout, personal funding, duplicate/partial-list refusal, legacy preservation, no new hosted trial and Pro repository-cap removal have focused tests. The single-Pro public/account offer and [restrained fair-use draft](PRO-LAUNCH-TERMS-REVIEW.md) are prepared. Full checks, release and canonical UI acceptance remain; live price creation/activation still needs the concrete review. Old live checkout remains enabled under its existing configuration; the new offer is not active.

Compatible single-Pro presentation/checkout/portal and capacity are deployed atc10d14b, with unchanged owner Usage/expired hold, exact CI and actual unchanged-schema publication. The new-sale interface remains unavailable while candidate mapping is unset. Actual sandbox checkout/portal and signed wallet delivery are accepted; live new prices, terms activation, funded customer-processing admission and independent paid-customer acceptance are still separate open gates. [Production receipt](../../operations/evidence/launch-20261101-pro-offer-production.json).
