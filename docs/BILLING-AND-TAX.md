# Billing, entitlements, and tax configuration

Mode: reference. Prices are proposed launch prices. Production Stripe IDs are created only with operator authorization.

## Current target, October 29

The owner selects one paid hosted Pro with workspaces/all implemented features and entitled shared-cache access. Free distribution is self-hosted code without that dataset. Compare 300/500 monthly credits, Muse 1× and cost-group multipliers for other models including high reasoning. The working comparison is EUR 8/week (50 credits), EUR 35/month (300) and EUR 350/year (300 granted monthly); all prices reduce to8. These are proposals, not a changed live catalogue. [ADR192](adr/192-single-hosted-pro-duration-credits.md) and the [mandatory pricing plan](strategy/PRO-PRICING-AND-CREDITS.md) preserve current subscriptions, old purchased credits and staged migration. The older catalogue/trial/credit ceiling below remains the current serialized implementation reference, not the new product target.

## Catalogue

Consumer prices are configured as tax-inclusive totals where tax applies. The receipt separately identifies the applicable treatment. Under an exemption, do not label the price as a zero-percent taxable sale.

| Tier | Weekly charge | Monthly charge | Annual charge | Included processing credits |
| --- | --- | --- | --- | --- |
| Starter | EUR 5.99 every 7 days | EUR 19 | EUR 190 | 65 weekly, or 250 per monthly entitlement period |
| Pro | EUR 11.99 every 7 days | EUR 39 | EUR 390 | 150 weekly, or 600 per monthly entitlement period |
| Business | Contact | Contact | Contact | Defined in the signed order, not guessed |

Annual plans replenish 250 or 600 credits each month, not the whole year's allowance at purchase. Use calendar-month anchors based on subscription start and clamp end-of-month dates. Weekly periods are exactly seven days. Never model a calendar month as four weeks for billing.

Starter includes three connected repositories, 1 GB retained library storage, 1,000 source records, and one concurrent processing job. Pro includes fifteen repositories, 5 GB storage, 10,000 source records, and two concurrent processing jobs. Both support proposals, plans, local execution, and metered cloud execution. Do not hide core PR functionality behind an unadvertised tier boundary.

Metadata-only saved links count toward source-record limits but do not consume analysis credits. A duplicate processed source within a workspace does not incur another analysis charge. New project matching, a deeper pass, or a new plan can consume credits when quoted.

## Credits and quotes

Credits are non-transferable service units, not stored money or a withdrawable balance. The internal initial cost ceiling is EUR 0.01 of all-in metered processing cost per credit. This includes the applicable inference, sandbox, tool, FX, and nonrecoverable tax exposure for that operation. It is not a public exchange rate or a refund formula.

A job quote includes its stages, maximum credits, funding route, expiry, and assumptions. The user sees an estimate and a maximum. Auto-analysis can be enabled with daily and per-source ceilings. Coding always needs explicit V1 approval.

Reserve the maximum credits before work. Settle actual usage under the published quote policy and release unused credits. Round once at the job settlement boundary, not once for every token event. A quote change cannot exceed the approved maximum without permission.

Initial optional top-ups are EUR 10 for 200 credits and EUR 25 for 550 credits, subject to the same tax-inclusive policy. Do not enable recurring automatic top-ups in V1. Purchased credits remain tracked separately from expiring included allowance. Cancellation does not confiscate purchased unused credits. Offer a supported refund or continued permitted use under the refund policy.

Included unused credits expire at the end of their entitlement period. State this before checkout. They do not roll over silently or accumulate a large unfunded future liability.

## Trial and abuse control

A new verified account can use a capped preview of 30 credits and at most three sources, with no automatic paid conversion. A global trial budget caps founder exposure before revenue. The pre-customer default trial-spend ceiling is EUR 2 per month, included in the overall EUR 10 target.

Do not use unlimited free processing to acquire users. Abuse controls can limit new trials, but cannot remove statutory consumer rights or block legitimate access to paid records.

## Subscription lifecycle

Create checkout sessions on the server from approved price IDs. Collect the information needed for the selected tax mode and customer type. Never accept a client-supplied amount or entitlement tier as authority.

Verify signed webhooks with the correct environment and Stripe account. Persist the event and reconcile the current subscription object. Grant each entitlement period once. Out-of-order `updated`, `paid`, and `deleted` events cannot revive cancelled access.

Cancellation at period end stops renewal and preserves the paid period. A payment failure blocks new paid work after the defined grace treatment while preserving a read-only export window. Initial policy: no new funded jobs during unresolved payment failure; retain read/export access for 30 days after the last paid period, subject to security and legal restrictions.

An upgrade shows the exact proration quote. Grant only the incremental allowance justified by the new paid period. A downgrade takes effect at renewal. Repeated plan switches must not reset credits. Refunds reverse the appropriate entitlement and credit entries without erasing the billing audit trail.

## Chosen tax strategy and evidence

The intended initial strategy is the Romanian small-business exemption under Article 310 when the actual registration and qualifying turnover permit it. Source S33 documents the RON 395,000 threshold. This is not a declaration that the company currently has that status.

The owner described both exemption and VAT registration. Therefore, the production configuration begins in `pending_evidence`, while the entire billing implementation and test configuration can be completed. Live checkout is disabled until the operator records the official status. This gate prevents an invented legal configuration; it does not defer designing the tax system.

Implement these concrete modes:

| Mode | Production treatment |
| --- | --- |
| `pending_evidence` | No live checkout. Demo and sandbox testing continue. |
| `ro_small_business_exempt` | Apply the legally valid exemption with its required invoice basis and turnover monitoring. |
| `ro_normal_vat` | Apply ordinary registration rules from its effective date and configured destination treatment. |
| `ro_special_317` | Record special registration separately; do not treat it as ordinary domestic VAT registration. |

Special registration is an attribute alongside the domestic treatment, not a universal replacement tax rate. Implement a normalized configuration rather than a single ambiguous `vatRegistered` boolean.

Track company-wide qualifying turnover and relevant cross-border turnover. VibeScroller alone cannot know another company product's sales. Provide an operator import or accountant-confirmed monthly balance with timestamp and evidence. Alert at 70%, 85%, and 95% of the applicable threshold. These are operational alerts, not legal grace periods.

The conditional EUR 10,000 EU cross-border threshold does not mean all foreign sales are exempt. Store customer type, location evidence required by the applicable rules, place-of-supply treatment, and relevant registration. Use destination VAT and Union OSS when required. The cross-border SME scheme remains off unless the company obtains applicable authorization. Sources S34 and S35.

A supplied business VAT ID must be validated where appropriate and retained with its validation evidence. Do not apply reverse charge merely because a customer selected Business. Non-EU sales remain disabled until that jurisdiction's treatment is configured.

## Romanian invoicing

Stripe receipts and invoice PDFs do not automatically satisfy every Romanian reporting requirement. Maintain a compliance queue for applicable invoices, corrections, and credit notes. The accountant can export a structured ledger and attach submission receipts initially. An automated Romanian invoicing adapter can replace the manual step later without changing the ledger.

For transactions within the applicable RO e-Factura obligation, the researched current rule provides a five-working-day transmission deadline with a statutory invoice-issue limit. Implement a reviewed Romanian business-day calendar and the applicable legal calculation, not a five-calendar-day timer. Source S43. Confirm the transaction scope rather than assuming every worldwide invoice follows that path.

The queue shows due date, source invoice, required reporting destination, export status, submitted receipt, rejection, correction, and escalation. A checked box is not proof of successful transmission. Alert before the deadline and escalate overdue items.

The Romanian accounting-document default follows the five-year period calculated from July 1 of the following financial year under source S42, subject to applicable exceptions and longer lawful holds. A separate OSS record schedule must be configured when OSS applies. Do not extend all media retention because billing records have a longer duty.

## Margin controls

Use the financial workbook and reproducible calculator. The model subtracts consumer VAT, expected refunds, payment fees, Billing fees, tax-calculation costs where used, FX provision, dispute provision, metered processing, storage/backend service cost, and fixed operating cost.

The target is at least 60% operating margin before company tax, excluding founder salary, marketing, and development. A small customer count can miss that target because of fixed expenses. Quotes and allowances control variable exposure, not business-wide profitability by themselves.

Recheck the model before changing allowances, adding a provider, enabling a country, selling an annual discount, or promising an enterprise feature. Do not count one-time cloud credits, unpaid founder labor, or the founder's personal subscription as recurring customer revenue.
