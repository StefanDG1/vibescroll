# Complete the private pilot records

Status: blank templates. No prospect is identified, qualified, contacted or counted by these files. Copy the worksheets into protected storage outside Git before filling them. Keep the committed templates empty. Do not commit names, contact details, account identifiers, source URLs, private project contents, free-text participant quotes or private evidence references.

## Qualification

[qualification.csv](qualification.csv) contains exactly twenty `UNFILLED` slots, Q01 through Q20. A slot is a planning placeholder, not a person. In the private copy, assign an opaque participant ID and assess each criterion from an actual conversation. `UNASSESSED` is unknown, not a rejection. Keep the contact-to-ID mapping in a separate protected record.

Qualify a person only after checking an active project, a practical saving habit, three sources they may process, their current workaround, informed consent and an available permitted route. Record an explicit reason for a no or unknown decision. Qualification does not authorize an invitation, processing or follow-up. The [pilot protocol](pilot.md) proposes ten invitations and five observed followed by five independent sessions; none has occurred in this package.

## Corrections and declines

Use [correction-log.csv](correction-log.csv) for one observed issue per row. `verification_state` stays `UNVERIFIED` until a recorded check supports a more specific state. Put reproducible synthetic steps or an issue/commit reference in shared engineering records. Keep participant material and the exact account of the failure private. Distinguish an independent completion from completion after assistance.

Use [decline-log.csv](decline-log.csv) for the person's voluntary explanation. Suggested categories are usefulness, current alternative sufficient, trust, setup, cost, source access, timing, other and not stated. Do not select a reason on the person's behalf. Declining an invitation, stopping a session and declining a purchase are different stages. No reply means unknown. A decline does not authorize further contact.

The existing [cohort worksheet](cohort.csv) records participant-level outcomes and denominators. Corrections, declines and purchases do not establish one another. A purchase requires verified successful settlement; a checkout visit or stated intention is insufficient.

## Matched requests, bytes and costs

[request-byte-cost.csv](request-byte-cost.csv) adds attempt-level measurements that the cohort worksheet cannot express. Keep rows `UNFILLED` until observed. Missing values stay blank. A zero requires a measured zero and a meter definition. `UNKNOWN` settlement is not settled zero.

Use the same opaque `comparison_pair_id` for before/after arms of a matched workload. Record exact commit, environment, task, route, input bytes/source count, returned record count and observation window. Include failures and retries. Do not compare different source sizes, cache states, permissions or result sizes as though only the implementation changed. Record those conditions in the private workload reference.

Measure first save, processing status, first insight, Library navigation, one project decision and a separately bounded idle hour. Define whether returned bytes means uncompressed application bytes or transferred bytes, whether request counts include retries, how writes are counted and how function duration is aggregated. Use the same definition in both arms. A synthetic fixture measures its named workload; it does not prove production savings.

Record estimates, reservations, unresolved holds and settled processing charges separately. Allocate platform cost only with a stated meter/rate and invoice basis. Do not double-count a reservation and its later settlement. Record support time separately from provider charges. Use one stated currency per row; record any conversion basis privately. Leave contribution margin blank until revenue, attributable cost, taxes/fees and support allocation are defined and evidenced. [offer-costs.csv](offer-costs.csv) remains the separate inactive three-year offer worksheet.

## Follow-up draft, unsent

Use only when the participant explicitly authorized this follow-up and the agreed observation window has arrived. Replace bracketed items privately before a human sends it.

> During our [agreed window], did you return to a saved source or plan? If so, what did you try, and did you need help? It is useful to hear that you did not return, or that your existing method worked better. You can skip any question or ask me to stop following up. Please do not send private sources or project contents in your reply.

This file authorizes no message, data collection or live task. Preserve the [release and permission gates](README.md) and the participant's consent limits.
