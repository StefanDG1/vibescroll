# ADR 172: carry finite Cloud intent through the authenticated HTTP relay

Date: October 26, 2026. Status: implementation candidate.

## Reproduction

The third real automatic saved-link action passed deterministic cache verification, retained pins, a verified private tools copy and fresh V2 socket denial. Its single request_analysis call then received a generic authorization/evidence refusal. Status reconciliation showed generation0, no job and the same waiting intent. The task did not retry and paused itself.

The MCP tool and backend mutation already accept savedIntentId. The strict assistantHttp request_analysis argument schema omitted it, so the valid body failed before the userinfo check or mutation. Direct backend tests bypassed that relay and missed the defect. Neither a reconnect nor broader permissions fixes a missing transport field.

## Decision

Admit only the already defined optional64-character lowercase hexadecimal savedIntentId at that HTTP boundary. Preserve strict unknown-field rejection, provider identity checks, OAuth/client/app scopes, current grant/source/intent validation, fixed saved defaults and all zero-API/idempotency/unknown-work fences. No new permission, grant, policy hash, source edit, table, schema, index or component is introduced.

## Verification

Add tests that create an actual app-Save intent, call both supported MCP protocol versions, relay through the authenticated HTTP handler and invoke the real Convex job mutation. Cover new private and original sole-owner libraries. All four cases fail before the transport fix, then pass with the existing Cloud generation and exactly one zero-cost reservation. Replay preserves that generation. Malformed raw HTTP intent IDs stop before provider/mutation calls, and malformed/unknown/credit-override requests cannot create new work. Existing authorization, transport, saved-intent and full checks remain required. Actual production publication and automatic acquisition/result acceptance are separate.
