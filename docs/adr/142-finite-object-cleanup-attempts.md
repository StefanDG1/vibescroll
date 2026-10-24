# ADR 142: Finite object cleanup attempts

Status: implementation candidate, production publication pending. Date: October 24, 2026.

## Decision

Every newly scheduled automatic object-deletion action consumes a durable attempt before dispatch. Ordinary retries stop after three attempts. The existing delayed checks for late uploads can use at most five total attempts per retired key. Hourly sweeps cannot reset counters or reopen an exhausted key.

Retirement permanently prevents reuse, including pending, deferred, failed and deleted records. A failed state is unresolved cleanup, not evidence that provider bytes were deleted. Only a genuine physical deletion receipt records physical completion.

Before dispatch, a restore lock preserves deferred intent without scheduling an action. If a lock appears after reservation, that action still consumes its attempt. Exact attempt and monotonically increasing reservation identifiers fence stale callbacks and receipts. Repeated lock races can exhaust the budget and require manual attention. They cannot create unlimited automatic actions.

The existing hourly sweep resumes deferred work after unlock and examines at most 100 deletion records across the pending and two deferred states. No new table or index is introduced. Existing already-queued legacy actions and their historical counters are outside the new lifetime bound and need separate deployment accounting.

## Recovery and operator obligations

Exhausted records remain failed and permanently retired. The operator must inspect the provider object and actual action outcomes, reconcile uncertain work and reserve a new bounded cleanup operation before any manual dispatch. Do not reset counters, delete retirement records or mark a physical receipt merely to clear an alert. Persistent provider failure can leave bytes outstanding; report that failure until deletion is verified.

The five-attempt bound covers scheduled deletion actions. Database metadata retention, existing hourly scans, delayed-check mutations and separately authorized manual work have their own costs. It is not a claim that all future privacy work is free.

## Verification

The final focused offline run passed 37 tests across object retirement, recovery and usage accounting. It covers late uploads, repeated failure, restore locks before and after reservation, stale receipts, exact five-action exhaustion and permanent key retirement. Root and Convex type checks, scoped lint, formatting and whitespace checks passed. No production action or object deletion was used for these tests. Exact-head CI and production publication remain pending.
