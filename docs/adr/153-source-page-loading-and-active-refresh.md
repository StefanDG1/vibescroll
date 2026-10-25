# ADR 153: load the selected post without a full workspace refresh

Date: October 25, 2026. Status: implementation candidate; production verification pending.

## Problem

The serving source page uses the full workspace fallback. It requests Library, unrelated proposals/runs, Usage and other page data alongside the selected post. Hydration immediately repeats the workspace request and private detail may fetch again. A ready page keeps polling, with unrelated jobs able to select the faster interval. This is unnecessary for viewing the completed Cloud result and makes a phone test harder to bound.

## Decision

Add an internal `source` workspace slice using five existing authorized queries: organization details, exact selected source detail, repository action choices, paired devices and analysis preferences. Keep source actions and their current server permission checks. Return compact repository display fields; obtain complete capture context through the existing explicit Save flow. Omit unrelated lists and billing. This changes no backend function, schema, index, job, store or dependency.

The selected source is authoritative only when it is the current server-loaded detail for that slice. Render that object directly so refreshed content cannot show the old result for one frame. Keep the existing protected detail fetch for legacy/list projections, and reject mismatched source or organization responses. Load related-source choices only when their existing panel opens, through the existing scoped Library API.

Reuse the existing single polling owner. Initial authorized server data and explicit navigation already load the view, so do not repeat an immediate read. Poll active selected-source work at fifteen seconds. A finished source wakes on visible/online return or explicit action instead of scheduling idle requests. Preserve source scope and stale-response fences; unrelated work does not keep a ready post active. Refresh explicitly after Cloud approval, including its early-return mutation path, so progress watching starts.

Keep a local retention timer to wake an idle source at its deadline. Rendering must also check the present clock so a delayed response or throttled timer cannot expose expired content/actions. This is a narrowly justified current-time check, not a new background reader or a weaker server permission rule.

## Boundaries and acceptance

Five counts only the workspace loader's direct queries. Authentication/bootstrap and legitimate component/action reads remain. The existing detail query still reads source proposals and repository records; this is not a compact progress DTO or complete R6 implementation. Active refresh still obtains full selected-source context. Idle remote revocation is discovered on the next wake or protected action; cached data is not proof of continuing authorization.

Verify no duplicate initial detail read, current authoritative content without stale flashes, exact query identities and organization scope, legacy fallback, related-source choices, permission loss, delayed/shortened retention, one request owner, active updates and no idle scheduling. Preserve Cloud, local, managed, project, Apply and capture actions. Record local, exact-head CI, native fixture and production results separately. A synthetic component or fewer reads does not certify a whole phone budget or another video run.

The original R/P/N/C/M scope remains. [The real-video receipt](../operations/evidence/launch-20261025-cloud-video-return.json) records the accepted Cloud result. Automatic host wake, catalog contribution, paid entry and the full-main migration remain distinct work. Cumulative EUR5 and every unknown/future hold remain; root reconciled only completed HTTP compute to retain USD4.916258194860614 with USD0.3837418051393857 unreserved. This is not an invoice or approval for new hosted work.
