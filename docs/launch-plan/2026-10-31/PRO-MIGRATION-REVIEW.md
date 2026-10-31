# Review the single-Pro migration

Mode: review package. Owner choices confirmed October31,2026. Preparation only; no live Stripe price, charge or customer migration is authorized by this document.

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

The candidate grants75credits over seven exact UTC days or300over each original monthly anniversary. Clamp month-end dates independently from the original anchor: January31→February28/29→March31. Annual payment produces twelve monthly grants. A duplicated invoice/webhook/scheduler delivery must use the same person/subscription/window key. Paying annually does not grant3600credits immediately. Unused allowance expires under the reviewed policy, while unknown reservations remain held; purchased units retain their existing denomination and expiry terms.

The offline implementation is [pro-migration-preview.ts](../../../packages/billing/pro-migration-preview.ts). It performs no provider call or database write. Its tests cover leap years/month-end drift, seven-day/DST boundaries, deterministic keys, live-versus-sandbox price refusal and preservation of purchased/held units. It is not a deployed grant scheduler or a Stripe sandbox integration.

For baseline new work, current preparation costs1credit when needed and Muse analysis costs1per started minute. A compatible ready-cache reuse costs0analysis/preparation credits. A retained-evidence new version avoids preparation credits. Thus300credits cover150separate fresh videos of up to60seconds, or100fresh videos of61–120seconds, before other credited actions. This is a tariff example, not an observed usage forecast. Cached browsing still incurs read/transfer/storage costs, and users may spend their remaining allowance on fresh work.

## Preserve existing customers

1. Keep the existing product metadata tag `vibescroller` and real provider product identity. Add reviewed replacement prices; do not create a parallel product merely to rename the brand.
2. Maintain the exact old price→tier/interval/credit-policy mapping for existing customers. Preserve Starter and old Pro terms until each customer accepts a concrete replacement at renewal. No silent downgrade from old600credits to300, change of price or forced proration.
3. Preserve purchased units, open invoices, refunds, disputed payments, cancellations and unknown reservations. Do not convert trial/operator grants into fabricated paid subscriptions.
4. New hosted signups use only the new Pro prices after activation. Retire new Starter/trial entry points together with checkout, portal, catalogue validation, legal terms and all user-facing prices. Keep truthful labeled demos.
5. Verify three sandbox prices: EUR1700/3500/35000cents, tax-inclusive contract where applicable, one week/month/year, exact policy metadata and `livemode=false`. The offline verifier refuses a live price, wrong interval, wrong tax mode, duplicate ID or changed amount. Actual account/tax configuration and real sandbox objects remain unverified.
6. Test renewal, annual monthly grants, cancel-at-period-end, payment failure/recovery, delayed/replayed webhooks and a voluntary legacy change. Use two authorized accounts to verify personal pooling and team isolation without a real purchase. Existing isolated team/cache tests do not establish paid-customer acceptance.

## Cost review and activation gates

The dated finance calculator remains a scenario model. Its old300jobs/300credits assumption excludes the new separate preparation credit and therefore overstates fresh baseline capacity under this candidate. Preserve historical outputs; show the new150fresh-60s-job example separately. Existing Sandbox receipts establish elapsed time, not active CPU or a settled infrastructure invoice. Use the actual price/region, transfer, permanent retained history, support, payment/tax/refund mix and acquisition costs before promising margins. The founder's EUR103subscription remains fixed overhead, never pooled customer inference.

The first direct OpenAI retained canary used7891input and11118total output tokens, including8889reasoning tokens. Its base-rate estimate is USD0.0063481; the conservative cache-write ceiling is USD0.006545375. It used3user credits. This one sample does not establish quality superiority, average cost, fresh-video preparation cost or an80%profit margin. Promotional funding changes cash expense, not the sustainable credit tariff. Stop new OpenAI work at its explicit grant capacity/expiry without purchased-credit fallback.

Before live activation, present the exact account/product/price IDs, old-price mapping, tax/customer notices, storage/fair-use/top-up policy, full-catalogue purchase scope and rollback plan for review. The owner has authorized preparation of these prices, not live activation. Keep all current prices, subscriptions, balances and gates unchanged meanwhile. A rollback disables new checkouts; it never deletes invoices, valid results, customer grants or unknown holds.

## Acceptance

- [x] Owner selected EUR35/month, EUR350/year and EUR17/week with300monthly/75weekly credits.
- [x] Offline price comparison and calendar/preservation verifier pass.
- [x] Requested-post cache and independent second-account no-job/no-credit reuse already have separate production evidence.
- [x] Individual-Pro team and personal-wallet isolation have controlled backend tests.
- [ ] Actual three-price sandbox mapping and renewal/webhook migration acceptance.
- [ ] Exact current operator tax/customer terms and legacy mapping reviewed.
- [ ] Live publication/customer migration approved and verified.

M5 is prepared, not commercially activated. Do not call the whole medium-term plan complete while these acceptance items remain open.

The Stripe connector returned `UNAUTHORIZED` and requires reauthentication. The owner has been asked to reconnect Stripe only. No Stripe sandbox object or customer was created, and no test or live charge was attempted. Continue with the existing product identity and reviewed candidate after access returns; VibeScroll and ChatGPT do not need reconnecting.
