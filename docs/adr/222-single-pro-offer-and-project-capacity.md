# ADR222: simplify the Pro offer and connected-project capacity

Date: November1,2026. Status: implementation in progress; live price creation/activation requires the prepared review.

R131 reports no real customers and removes advertised storage and the Pro repository-count quota. Keep the EUR35monthly/300credits, EUR350annual/300monthly and EUR17weekly/75credits offer. Preserve admin/test balances, existing provider records and the legacy settlement adapter. Do not build a customer-migration campaign for the reported launch state.

## Implementation

Use one public Pro offer and one recurrence choice. Remove Starter and storage/repository counts from new-sale presentation. Retain appropriate historical subscription controls and old price mappings. Keep the self-hosted option distinct from a free hosted tier. Requested-post cache reuse is included; full-catalog browsing remains its separate entitlement/add-on, with the existing admin concession.

Pro connection capacity has no subscription repository-count quota. Skip the repository-count query for Pro rather than replacing15with a larger magic number. Preserve bounded per-operation retrieval/analysis batches, permissions, request sizes, rate limits, credits and concurrent-work admission. Keep legacy non-Pro guards safe and bounded. This is no promise of unlimited compute or storage.

Expose the reviewed candidate as a separate offer, keeping the legacy pricing contract immutable for old settlement. Checkout selects only the separate new price IDs when configured and rejects Starter for new-sale mode. Require a personal billing workspace and prevent duplicate active subscriptions. A public candidate display must never send the user into an old-price checkout. New-sale controls remain unavailable until the candidate mapping and the existing provider/publication gates are satisfied.

Once the candidate is activated, new wallets start without a hosted trial. Existing wallets, purchased credits, reservations and valid results remain unchanged. Keep current top-up prices/units for review rather than silently converting balances. Do not advertise storage quantities or quietly delete retained results at a marketing threshold. Prepare a concise fair-use clause covering abusive automation or unusually large resource demand; keep specific operational bounds in engineering/operator documentation.

## Acceptance

Verify Pro can connect beyond the previous15-repository quota without a count scan; keep non-Pro/operator guards and per-operation bounds. Test candidate checkout exact price/amount/account/mode, no Starter selection, personal funding and duplicate-subscription refusal. Verify no new hosted trial, preservation of existing wallet data, coherent public/private prices and disabled candidate checkout when unconfigured. Check desktop/phone billing/pricing layout and unchanged feed/Library views before one coherent website release. Actual managed sandbox Checkout and final concrete live-price approval remain separate from ADR221's accepted provider-delivery test.

## November1 local and sandbox acceptance

The focused checkout suite verifies all three exact intervals, account/mode/price binding, personal funding, no Starter, no duplicate subscription, incomplete-list refusal, safe separate portal, unchanged legacy checkout and existing wallet preservation. Actual sandbox application checkout/portal passed in7.05seconds, with the exact EUR35price and Managed Payments. No payment or real wallet grant occurred; the owned session expired and temporary portal configuration was archived. The pre-existing synthetic customer and all old fixtures remain. Full checks, exact CI, compatible publication and website acceptance are separate from these tests. Live activation still requires the [concrete terms/offer review](../launch-plan/2026-10-31/PRO-LAUNCH-TERMS-REVIEW.md).
